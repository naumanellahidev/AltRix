import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribes to every finance-related table for the given school and
 * invalidates the matching react-query caches so every accountant tab
 * (Home, Invoices, Payments, Expenses, Payroll, Fees, Vouchers,
 * Ledger, Vendors, Tax, Reports) stays in sync with the database in
 * realtime — lists, totals, KPIs, and charts all refresh automatically.
 *
 * We use predicate-based invalidation so any query whose key starts
 * with a known finance prefix gets refreshed without needing to keep
 * a per-table key map in sync.
 */
const FINANCE_TABLES = [
  // Core finance tables used by the accountant modules
  "finance_invoices",
  "finance_payments",
  "finance_expenses",
  "finance_payment_methods",
  // Fee-engine tables
  "fee_invoices",
  "fee_invoice_items",
  "fee_payments",
  "fee_payment_proofs",
  "fee_plans",
  "fee_plan_items",
  "fee_plan_installments",
  "fee_voucher_batches",
  "fee_voucher_deliveries",
  "fee_settings",
  "student_fee_assignments",
  // Payroll / HR-linked finance
  "hr_pay_runs",
  "hr_salary_records",
  "hr_payroll_items",
  "hr_staff_salaries",
] as const;

/**
 * Any query whose first key segment starts with one of these prefixes
 * is considered finance-related and will be invalidated on a realtime
 * change. Keep this list in lockstep with queryKey usage across the
 * accountant modules.
 */
const FINANCE_KEY_PREFIXES = [
  "finance_",
  "fee_",
  "hr_pay_",
  "hr_salary_",
  "accountant_",
  "ledger_",
  "vendor_",
  "tax_",
  "proof_",
  "voucher_",
  "payroll_",
  "dashboard_kpi_",
];

function isFinanceKey(key: unknown): boolean {
  if (!Array.isArray(key) || key.length === 0) return false;
  const head = key[0];
  if (typeof head !== "string") return false;
  return FINANCE_KEY_PREFIXES.some((p) => head.startsWith(p));
}

export function useFinanceRealtime(schoolId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!schoolId) return;

    let pending = false;
    const invalidateAll = () => {
      if (pending) return;
      pending = true;
      // Debounce burst events into a single invalidation pass.
      setTimeout(() => {
        pending = false;
        qc.invalidateQueries({ predicate: (q) => isFinanceKey(q.queryKey) });
      }, 150);
    };

    const channels: RealtimeChannel[] = [];
    for (const table of FINANCE_TABLES) {
      const ch = supabase
        .channel(`finance-rt-${table}-${schoolId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `school_id=eq.${schoolId}` },
          invalidateAll,
        )
        .subscribe();
      channels.push(ch);
    }

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [schoolId, qc]);
}
