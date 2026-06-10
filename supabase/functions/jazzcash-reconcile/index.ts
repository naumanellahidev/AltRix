// JazzCash reconciliation — two modes:
//   1) Webhook (POST with JazzCash params, same shape as callback) — verifies hash, updates txn, posts payment.
//   2) Sweep   (POST { mode: "sweep", school_id?: string }) — re-checks pending txns older than 2 minutes
//      by treating their stored raw_response (if any) as the source of truth, and ages out txns >24h.
//
// This protects against missed realtime events / late callbacks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(msg: string): Promise<string> {
  const data = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyHash(params: Record<string, string>, salt: string): Promise<boolean> {
  const provided = (params["pp_SecureHash"] || "").toUpperCase();
  if (!provided) return false;
  const sortedKeys = Object.keys(params).filter(k => k !== "pp_SecureHash" && params[k] !== "" && params[k] != null).sort();
  const hashStr = salt + "&" + sortedKeys.map(k => params[k]).join("&");
  const computed = (await sha256Hex(hashStr)).toUpperCase();
  return computed === provided;
}

async function applyResult(supabase: any, params: Record<string, string>) {
  const txnRef = params["pp_TxnRefNo"] || "";
  if (!txnRef) return { ok: false, reason: "missing txn ref" };

  const { data: txn } = await supabase.from("jazzcash_transactions").select("*").eq("txn_ref_no", txnRef).maybeSingle();
  if (!txn) return { ok: false, reason: "txn not found" };

  // Skip if already terminal
  if (txn.status === "success" || txn.status === "failed") {
    return { ok: true, skipped: true, status: txn.status };
  }

  // Verify integrity hash against school settings (defence-in-depth for webhook mode)
  const { data: settings } = await supabase.from("jazzcash_settings").select("integrity_salt").eq("school_id", txn.school_id).maybeSingle();
  if (settings?.integrity_salt && params["pp_SecureHash"]) {
    const valid = await verifyHash(params, settings.integrity_salt);
    if (!valid) return { ok: false, reason: "invalid hash" };
  }

  const responseCode = params["pp_ResponseCode"] || "";
  const responseMessage = params["pp_ResponseMessage"] || "";
  const amountPaisa = Number(params["pp_Amount"] || 0);
  const success = responseCode === "000";
  const status = success ? "success" : "failed";

  await supabase.from("jazzcash_transactions").update({
    status, jc_response_code: responseCode, jc_response_message: responseMessage, raw_response: params,
  }).eq("id", txn.id);

  if (success && txn.invoice_id) {
    // Idempotent: only insert payment if none exists for this transaction_ref
    const { data: existingPay } = await supabase.from("fee_payments")
      .select("id").eq("transaction_ref", txnRef).maybeSingle();
    if (!existingPay) {
      const { data: inv } = await supabase.from("fee_invoices").select("school_id, student_id").eq("id", txn.invoice_id).single();
      if (inv) {
        await supabase.from("fee_payments").insert({
          school_id: inv.school_id, student_id: inv.student_id, invoice_id: txn.invoice_id,
          amount: amountPaisa > 0 ? amountPaisa / 100 : Number(txn.amount), method: "jazzcash", status: "success",
          transaction_ref: txnRef, notes: `JazzCash ${responseMessage}`,
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

    // Parse body — accept JSON, form-data, or url-encoded
    let body: any = {};
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try { body = await req.json(); } catch { body = {}; }
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      fd.forEach((v, k) => { body[k] = String(v); });
    }

    // Sweep mode
    if (body?.mode === "sweep") {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const ageOut = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let q = supabase.from("jazzcash_transactions").select("*").eq("status", "pending").lt("created_at", cutoff);
      if (body.school_id) q = q.eq("school_id", body.school_id);
      const { data: pending } = await q.limit(200);

      const results: any[] = [];
      for (const txn of (pending || [])) {
        // If callback already wrote raw_response, reconcile from it
        if (txn.raw_response && typeof txn.raw_response === "object" && (txn.raw_response as any).pp_ResponseCode) {
          const r = await applyResult(supabase, txn.raw_response as Record<string, string>);
          results.push({ txn_ref_no: txn.txn_ref_no, ...r });
        } else if (txn.created_at < ageOut) {
          // No response after 24h — mark expired
          await supabase.from("jazzcash_transactions").update({
            status: "failed", jc_response_message: "Timed out — no response from JazzCash within 24 hours",
          }).eq("id", txn.id);
          results.push({ txn_ref_no: txn.txn_ref_no, ok: true, status: "failed", reason: "timeout" });
        } else {
          results.push({ txn_ref_no: txn.txn_ref_no, ok: false, reason: "still pending, no response yet" });
        }
      }
      return new Response(JSON.stringify({ swept: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Webhook mode — body contains JazzCash params (same shape as callback)
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
