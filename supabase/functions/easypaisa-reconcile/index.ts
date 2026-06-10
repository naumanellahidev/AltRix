// Easypaisa reconciliation — webhook + sweep modes (mirror of jazzcash-reconcile)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function applyResult(supabase: any, params: Record<string, string>) {
  const orderRef = params["orderRefNumber"] || params["orderId"] || params["orderRefNum"] || "";
  if (!orderRef) return { ok: false, reason: "missing order ref" };

  const { data: txn } = await supabase.from("easypaisa_transactions").select("*").eq("order_ref_no", orderRef).maybeSingle();
  if (!txn) return { ok: false, reason: "txn not found" };

  if (txn.status === "success" || txn.status === "failed") {
    return { ok: true, skipped: true, status: txn.status };
  }

  const responseCode = params["responseCode"] || params["status"] || "";
  const responseMessage = params["responseDesc"] || params["statusDescription"] || "";
  const amount = Number(params["transactionAmount"] || params["amount"] || 0);
  const success = responseCode === "0000" || responseCode === "00" || responseCode.toUpperCase() === "SUCCESS";
  const status = success ? "success" : "failed";

  await supabase.from("easypaisa_transactions").update({
    status, ep_response_code: responseCode, ep_response_message: responseMessage, raw_response: params,
  }).eq("id", txn.id);

  if (success && txn.invoice_id) {
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
  return { ok: true, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try { body = await req.json(); } catch { body = {}; }
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      fd.forEach((v, k) => { body[k] = String(v); });
    }

    if (body?.mode === "sweep") {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const ageOut = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let q = supabase.from("easypaisa_transactions").select("*").eq("status", "pending").lt("created_at", cutoff);
      if (body.school_id) q = q.eq("school_id", body.school_id);
      const { data: pending } = await q.limit(200);

      const results: any[] = [];
      for (const txn of (pending || [])) {
        if (txn.raw_response && typeof txn.raw_response === "object" && ((txn.raw_response as any).responseCode || (txn.raw_response as any).status)) {
          const r = await applyResult(supabase, txn.raw_response as Record<string, string>);
          results.push({ order_ref_no: txn.order_ref_no, ...r });
        } else if (txn.created_at < ageOut) {
          await supabase.from("easypaisa_transactions").update({
            status: "failed", ep_response_message: "Timed out — no response from Easypaisa within 24 hours",
          }).eq("id", txn.id);
          results.push({ order_ref_no: txn.order_ref_no, ok: true, status: "failed", reason: "timeout" });
        } else {
          results.push({ order_ref_no: txn.order_ref_no, ok: false, reason: "still pending, no response yet" });
        }
      }
      return new Response(JSON.stringify({ swept: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = body as Record<string, string>;
    const result = await applyResult(supabase, params);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
