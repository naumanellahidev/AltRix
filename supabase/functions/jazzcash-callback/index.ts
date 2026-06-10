// JazzCash callback — receives POST from JazzCash after payment, marks success/failure
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let params: Record<string, string> = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      fd.forEach((v, k) => { params[k] = String(v); });
    } else {
      try { params = await req.json(); } catch { /* ignore */ }
    }

    const txnRef = params["pp_TxnRefNo"] || "";
    const responseCode = params["pp_ResponseCode"] || "";
    const responseMessage = params["pp_ResponseMessage"] || "";
    const amountPaisa = Number(params["pp_Amount"] || 0);
    const invoiceId = params["ppmpf_1"] || "";

    if (!txnRef) return new Response("Missing txn ref", { status: 400 });

    const success = responseCode === "000";
    const status = success ? "success" : "failed";

    const { data: txn } = await supabase.from("jazzcash_transactions").select("*").eq("txn_ref_no", txnRef).maybeSingle();
    if (txn) {
      await supabase.from("jazzcash_transactions").update({
        status, jc_response_code: responseCode, jc_response_message: responseMessage, raw_response: params,
      }).eq("id", txn.id);
    }

    if (success && (txn?.invoice_id || invoiceId)) {
      const invId = txn?.invoice_id || invoiceId;
      // Idempotency: only insert payment if no existing record for this txnRef
      const { data: existingPay } = await supabase.from("fee_payments")
        .select("id").eq("transaction_ref", txnRef).maybeSingle();
      if (!existingPay) {
        const { data: inv } = await supabase.from("fee_invoices").select("school_id, student_id").eq("id", invId).single();
        if (inv) {
          await supabase.from("fee_payments").insert({
            school_id: inv.school_id, student_id: inv.student_id, invoice_id: invId,
            amount: amountPaisa / 100, method: "jazzcash", status: "success",
            transaction_ref: txnRef, notes: `JazzCash ${responseMessage}`,
          });
        }
      }
    }

    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h2>${success ? "Payment Successful ✅" : "Payment Failed ❌"}</h2>
<p>${responseMessage || ""}</p>
<p><a href="javascript:window.close()">Close</a> or return to your school portal.</p>
</body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
  } catch (e) {
    return new Response("Error: " + String(e?.message || e), { status: 500 });
  }
});
