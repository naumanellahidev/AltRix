// Server-side CSV export for staff payment proofs.
// Applies the same filters as the UI, streams all matching rows
// (paginated server-side to avoid the 1000-row default limit),
// and enforces school-level access via the caller's JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[\n\r",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json().catch(() => ({}));
    const {
      schoolId,
      status = "pending",      // 'pending' | 'verified' | 'rejected' | '__all'
      method = "__all",
      fromDate = "",            // YYYY-MM-DD (created_at floor)
      toDate = "",              // YYYY-MM-DD (created_at ceil)
      minAmount = null,
      maxAmount = null,
      search = "",
    } = body || {};

    if (!schoolId || typeof schoolId !== "string") {
      return new Response(JSON.stringify({ error: "schoolId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Page through ALL proofs matching base filters (RLS enforces access).
    const pageSize = 1000;
    let from = 0;
    const proofs: any[] = [];
    while (true) {
      let q = supabase.from("fee_payment_proofs")
        .select("id, school_id, invoice_id, student_id, file_name, amount, paid_at, method, note, status, rejection_reason, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (status && status !== "__all") q = q.eq("status", status);
      if (method && method !== "__all") q = q.eq("method", method);
      if (fromDate) q = q.gte("created_at", `${fromDate}T00:00:00`);
      if (toDate) q = q.lte("created_at", `${toDate}T23:59:59`);
      if (minAmount !== null && minAmount !== "") q = q.gte("amount", Number(minAmount));
      if (maxAmount !== null && maxAmount !== "") q = q.lte("amount", Number(maxAmount));

      const { data, error } = await q;
      if (error) throw error;
      if (!data || data.length === 0) break;
      proofs.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
      if (proofs.length > 100000) break; // safety cap
    }

    // Hydrate students + invoices for filtered set
    const studentIds = Array.from(new Set(proofs.map((p) => p.student_id))).filter(Boolean);
    const invoiceIds = Array.from(new Set(proofs.map((p) => p.invoice_id))).filter(Boolean);

    const [{ data: students }, { data: invoices }] = await Promise.all([
      studentIds.length
        ? supabase.from("students").select("id, first_name, last_name, roll_number").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length
        ? supabase.from("fee_invoices").select("id, invoice_number, total_amount, paid_amount, status").in("id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sMap = new Map((students || []).map((s: any) => [s.id, s]));
    const iMap = new Map((invoices || []).map((i: any) => [i.id, i]));

    // Apply text search server-side over hydrated fields
    const q = (search || "").trim().toLowerCase();
    const filtered = q
      ? proofs.filter((p) => {
          const s: any = sMap.get(p.student_id);
          const inv: any = iMap.get(p.invoice_id);
          const hay = `${s?.first_name || ""} ${s?.last_name || ""} ${s?.roll_number || ""} ${inv?.invoice_number || ""} ${p.method || ""} ${p.note || ""} ${p.status || ""} ${p.rejection_reason || ""}`.toLowerCase();
          return hay.includes(q);
        })
      : proofs;

    const header = [
      "uploaded_at", "student", "roll_number", "invoice_number",
      "method", "paid_at", "amount", "status", "rejection_reason", "note",
    ];
    const lines: string[] = [header.join(",")];
    for (const p of filtered) {
      const s: any = sMap.get(p.student_id);
      const inv: any = iMap.get(p.invoice_id);
      lines.push([
        new Date(p.created_at).toISOString(),
        s ? `${s.first_name} ${s.last_name || ""}`.trim() : "",
        s?.roll_number || "",
        inv?.invoice_number || "",
        p.method || "",
        p.paid_at || "",
        Number(p.amount),
        p.status,
        p.rejection_reason || "",
        p.note || "",
      ].map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const filename = `payment-proofs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Row-Count": String(filtered.length),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
