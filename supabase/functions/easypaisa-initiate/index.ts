// Easypaisa Hosted Checkout — initiates a redirect to Easypaisa payment page
// Inputs: { invoice_id }
// Returns: { html: string, order_ref: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_URL = "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf";
const LIVE_URL = "https://easypay.easypaisa.com.pk/easypay/Index.jsf";

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function expiryDateTime(): string {
  // Format: YYYYMMDD HHMMSS, +1 hour from now
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())} ${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
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

    const { data: settings } = await supabase.from("easypaisa_settings").select("*").eq("school_id", inv.school_id).maybeSingle();
    if (!settings || !settings.is_enabled || !settings.store_id || !settings.hash_key) {
      return new Response(JSON.stringify({ error: "Easypaisa not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const due = Math.max(Number(inv.total_amount) - Number(inv.paid_amount), 0);
    if (due <= 0) return new Response(JSON.stringify({ error: "Invoice already paid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const orderRef = `EP${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const amountStr = due.toFixed(2);
    const expiry = expiryDateTime();

    const projectRef = (Deno.env.get("SUPABASE_URL") || "").replace(/^https?:\/\//, "").split(".")[0];
    const callbackUrl = settings.return_url || `https://${projectRef}.functions.supabase.co/easypaisa-callback`;

    // Easypaisa Hosted Checkout fields. Hash is HMAC-SHA256 over sorted "key=value&..." pairs
    // (excluding merchantHashedReq itself), keyed by the merchant's hash key.
    const fields: Record<string, string> = {
      storeId: String(settings.store_id),
      orderId: orderRef,
      transactionAmount: amountStr,
      mobileAccountNo: String(settings.account_number || ""),
      emailAddress: userData.user.email || "",
      transactionType: "MA", // Mobile Account
      tokenExpiry: expiry,
      bankIdentificationNumber: "",
      encryptedHashRequest: "",
      merchantPaymentMethod: "",
      postBackURL: callbackUrl,
      signature: "",
    };

    const hashFields: Record<string, string> = {
      amount: amountStr,
      orderRefNum: orderRef,
      paymentMethod: "MA_PAYMENT_METHOD",
      postBackURL: callbackUrl,
      storeId: String(settings.store_id),
      timeStamp: expiry,
    };
    const sortedKeys = Object.keys(hashFields).filter(k => hashFields[k] !== "").sort();
    const hashStr = sortedKeys.map(k => `${k}=${hashFields[k]}`).join("&");
    fields.encryptedHashRequest = await hmacSha256Hex(String(settings.hash_key), hashStr);

    await supabase.from("easypaisa_transactions").insert({
      school_id: inv.school_id, invoice_id: inv.id, student_id: inv.student_id,
      amount: due, order_ref_no: orderRef, status: "pending",
      initiator_user_id: userId, raw_request: { ...fields, ppmpf_invoice: inv.id },
    });

    const targetUrl = settings.environment === "live" ? LIVE_URL : SANDBOX_URL;
    const inputs = Object.entries(fields)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}" />`).join("\n");
    const html = `<!DOCTYPE html><html><body onload="document.forms[0].submit()">
<p style="font-family:sans-serif;text-align:center;padding:40px">Redirecting to Easypaisa…</p>
<form method="POST" action="${targetUrl}">${inputs}<noscript><button type="submit">Continue</button></noscript></form>
</body></html>`;

    return new Response(JSON.stringify({ html, order_ref: orderRef }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
