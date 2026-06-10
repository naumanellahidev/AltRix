// Easypaisa callback — receives POST from Easypaisa after payment, marks success/failure
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

    // Easypaisa returns: orderRefNumber, responseCode, responseDesc, transactionAmount, paymentToken
    const orderRef = params["orderRefNumber"] || params["orderId"] || params["orderRefNum"] || "";
    const responseCode = params["responseCode"] || params["status"] || "";
    const responseMessage = params["responseDesc"] || params["statusDescription"] || "";
    const amount = Number(params["transactionAmount"] || params["amount"] || 0);

    if (!orderRef) return new Response("Missing order ref", { status: 400 });

    // Easypaisa success response code is "0000"
    const success = responseCode === "0000" || responseCode === "00" || responseCode.toUpperCase() === "SUCCESS";
    const status = success ? "success" : "failed";

    const { data: txn } = await supabase.from("easypaisa_transactions").select("*").eq("order_ref_no", orderRef).maybeSingle();
    if (txn) {
      await supabase.from("easypaisa_transactions").update({
        status, ep_response_code: responseCode, ep_response_message: responseMessage, raw_response: params,
      }).eq("id", txn.id);
    }

    if (success && txn?.invoice_id) {
      const { data: existingPay } = await supabase.from("fee_payments")
        .select("id").eq("transaction_ref", orderRef).maybeSingle();
      if (!existingPay) {
        const { data: inv } = await supabase.from("fee_invoices").select("school_id, student_id").eq("id", txn.invoice_id).single();
        if (inv) {
          await supabase.from("fee_payments").insert({
            school_id: inv.school_id, student_id: inv.student_id, invoice_id: txn.invoice_id,
            amount: amount > 0 ? amount : Number(txn.amount), method: "easypaisa", status: "success",
            transaction_ref: orderRef, notes: `Easypaisa ${responseMessage}`,
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
