// JazzCash Hosted Checkout — initiates a redirect to JazzCash payment page
// Inputs: { invoice_id }
// Returns: { html: string }  (auto-submitting form posting to JazzCash)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_URL = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
const PROD_URL = "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

async function sha256Hex(msg: string): Promise<string> {
  const data = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function pkDateTime(): { yyyymmddhhmmss: string; expiry: string } {
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}` +
    `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}`;
  const expiry = new Date(now.getTime() + 60 * 60 * 1000);
  return { yyyymmddhhmmss: fmt(now), expiry: fmt(expiry) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized: " + (userErr?.message || "no user") }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const invoiceId = String(body?.invoice_id || "");
    if (!invoiceId) return new Response(JSON.stringify({ error: "invoice_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: inv, error: invErr } = await supabase.from("fee_invoices").select("*").eq("id", invoiceId).single();
    if (invErr || !inv) return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await supabase.from("jazzcash_settings").select("*").eq("school_id", inv.school_id).maybeSingle();
    if (!settings || !settings.is_enabled || !settings.merchant_id || !settings.merchant_password || !settings.integrity_salt) {
      return new Response(JSON.stringify({ error: "JazzCash not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const due = Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0);
    if (due <= 0) return new Response(JSON.stringify({ error: "Invoice already paid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { yyyymmddhhmmss, expiry } = pkDateTime();
    const txnRef = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const amountPaisa = String(Math.round(due * 100));

    const projectRef = (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];
    const callbackUrl = settings.return_url || `https://${projectRef}.functions.supabase.co/jazzcash-callback`;

    const fields: Record<string, string> = {
      pp_Version: "1.1", pp_TxnType: "MWALLET", pp_Language: "EN",
      pp_MerchantID: settings.merchant_id, pp_SubMerchantID: "", pp_Password: settings.merchant_password,
      pp_BankID: "", pp_ProductID: "", pp_TxnRefNo: txnRef, pp_Amount: amountPaisa, pp_TxnCurrency: "PKR",
      pp_TxnDateTime: yyyymmddhhmmss, pp_BillReference: inv.invoice_number, pp_Description: `Fee ${inv.invoice_number}`,
      pp_TxnExpiryDateTime: expiry, pp_ReturnURL: callbackUrl, pp_SecureHash: "",
      ppmpf_1: inv.id, ppmpf_2: inv.school_id, ppmpf_3: inv.student_id, ppmpf_4: "", ppmpf_5: "",
    };

    // Build hash: integrity_salt + & + sorted non-empty values (excluding pp_SecureHash)
    const sortedKeys = Object.keys(fields).filter(k => k !== "pp_SecureHash" && fields[k] !== "").sort();
    const hashStr = settings.integrity_salt + "&" + sortedKeys.map(k => fields[k]).join("&");
    fields.pp_SecureHash = (await sha256Hex(hashStr)).toUpperCase();

    // Log
    await supabase.from("jazzcash_transactions").insert({
      school_id: inv.school_id, invoice_id: inv.id, student_id: inv.student_id,
      amount: due, txn_ref_no: txnRef, status: "pending",
      initiator_user_id: userId, raw_request: fields,
    });

    const targetUrl = settings.environment === "production" ? PROD_URL : SANDBOX_URL;
    const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}" />`).join("\n");
    const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit()">
<p>Redirecting to JazzCash...</p>
<form method="POST" action="${targetUrl}">${inputs}<noscript><button type="submit">Continue</button></noscript></form>
</body></html>`;

    return new Response(JSON.stringify({ html, txn_ref: txnRef }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
