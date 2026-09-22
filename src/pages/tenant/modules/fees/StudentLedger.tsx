/**
 * One student's fee ledger: every voucher, every payment, and what is left.
 *
 * This is the screen the office opens when a parent is standing at the desk,
 * so it reads from `/finance/balance-dashboard/{student}` — which is also what
 * the parent's own screen reads, so both see the same numbers. Amounts arrive
 * as exact decimal strings and are formatted, never re-added here.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ReceiptText, Search, User, Wallet } from "lucide-react";

import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { money as formatMoney, date as formatDate, ABSENT } from "@/lib/documents/format";

interface LedgerInvoice {
  id: string;
  invoice_number: string;
  period_label: string | null;
  due_date: string | null;
  subtotal: string;
  concessions: string;
  total_amount: string;
  paid_amount: string;
  balance: string;
  advance: string;
  status: string;
  days_overdue: number;
}

interface LedgerPayment {
  id: string;
  amount: string;
  method: string;
  status: string;
  counted: boolean;
  paid_at: string | null;
  transaction_ref: string | null;
  invoice_number: string | null;
}

interface Ledger {
  currency: string;
  as_of: string;
  student: {
    id: string;
    name: string;
    student_code: string | null;
    class_name: string | null;
    section_name: string | null;
  };
  totals: { billed: string; paid: string; outstanding: string; advance: string; overdue: string };
  counts: { invoices: number; unpaid: number; overdue: number };
  active_installment_plans: number;
  active_escalations: number;
  invoices: LedgerInvoice[];
  payments: LedgerPayment[];
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  overdue: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StudentLedger({ schoolId }: { schoolId: string | null }) {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["fees", "ledger-search", schoolId, query],
    queryFn: async () => {
      const { data, error } = await (api as any)
        .from("students")
        .select("id, first_name, last_name, student_code, roll_number")
        .eq("school_id", schoolId!)
        .or(
          [
            `first_name.ilike.%${query}%`,
            `last_name.ilike.%${query}%`,
            `student_code.ilike.%${query}%`,
          ].join(","),
        )
        .order("first_name")
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string | null;
        student_code: string | null;
        roll_number: string | null;
      }>;
    },
    enabled: !!schoolId && query.trim().length >= 2,
  });

  const ledger = useQuery<Ledger>({
    queryKey: ["fees", "ledger", studentId],
    queryFn: async () => (await apiClient.get(`/finance/balance-dashboard/${studentId}`)).data,
    enabled: !!studentId,
  });

  const currency = ledger.data?.currency ?? "PKR";
  const amount = (v: string | null | undefined) => (v == null ? ABSENT : formatMoney(v, { currency }));

  const exportRows = useMemo(() => {
    const d = ledger.data;
    if (!d) return [];
    return [
      ...d.invoices.map((i) => ({
        Type: "Voucher",
        Reference: i.invoice_number,
        Period: i.period_label ?? ABSENT,
        Date: i.due_date ?? ABSENT,
        Charged: i.total_amount,
        Paid: i.paid_amount,
        Balance: i.balance,
        Status: i.status,
      })),
      ...d.payments
        .filter((p) => p.counted)
        .map((p) => ({
          Type: "Payment",
          Reference: p.transaction_ref ?? p.invoice_number ?? ABSENT,
          Period: p.invoice_number ?? ABSENT,
          Date: p.paid_at ? p.paid_at.slice(0, 10) : ABSENT,
          Charged: "",
          Paid: p.amount,
          Balance: "",
          Status: p.method,
        })),
    ];
  }, [ledger.data]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base font-bold">
          <ReceiptText className="h-4 w-4 text-primary" /> Student ledger
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Every voucher and payment for one child, with the balance the parent sees.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(term.trim())}
              onBlur={() => setQuery(term.trim())}
              placeholder="Search a student by name or code…"
              className="h-9 rounded-xl pl-9"
            />
          </div>
          {ledger.data ? (
            <DataExportMenu
              title={`Fee Ledger — ${ledger.data.student.name}`}
              subtitle={[ledger.data.student.class_name, ledger.data.student.section_name]
                .filter(Boolean)
                .join(" ")}
              rows={exportRows}
              summary={[
                { label: "Billed", value: amount(ledger.data.totals.billed) },
                { label: "Paid", value: amount(ledger.data.totals.paid) },
                { label: "Outstanding", value: amount(ledger.data.totals.outstanding) },
              ]}
              note="A blank balance on a payment row means the payment is not tied to one voucher."
            />
          ) : null}
        </div>

        {/* Search results */}
        {query.trim().length >= 2 && !studentId ? (
          results.isLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (results.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No student matches “{query}”.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(results.data ?? []).map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setStudentId(s.id)}
                >
                  <User className="mr-1.5 h-3.5 w-3.5" />
                  {[s.first_name, s.last_name].filter(Boolean).join(" ")}
                  {s.student_code ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">{s.student_code}</span>
                  ) : null}
                </Button>
              ))}
            </div>
          )
        ) : null}

        {ledger.isLoading && studentId ? <Skeleton className="h-64 rounded-xl" /> : null}

        {ledger.error && studentId ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/40">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-500" />
            <span>
              {(ledger.error as any)?.response?.data?.detail ??
                (ledger.error as Error).message ??
                "The ledger could not be loaded"}
            </span>
          </div>
        ) : null}

        {ledger.data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="font-semibold">{ledger.data.student.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    ledger.data.student.student_code,
                    [ledger.data.student.class_name, ledger.data.student.section_name]
                      .filter(Boolean)
                      .join(" "),
                  ]
                    .filter(Boolean)
                    .join(" · ") || ABSENT}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStudentId(null)}>
                Pick another student
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                { label: "Billed", value: ledger.data.totals.billed, tone: "" },
                { label: "Paid", value: ledger.data.totals.paid, tone: "text-emerald-600 dark:text-emerald-400" },
                {
                  label: "Outstanding",
                  value: ledger.data.totals.outstanding,
                  tone: Number(ledger.data.totals.outstanding) > 0 ? "text-rose-600 dark:text-rose-400" : "",
                },
                { label: "Overdue", value: ledger.data.totals.overdue, tone: "text-amber-600 dark:text-amber-400" },
              ].map((t) => (
                <div key={t.label} className="rounded-xl border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t.label}
                  </p>
                  <p className={`font-display text-lg font-bold ${t.tone}`}>{amount(t.value)}</p>
                </div>
              ))}
            </div>

            {Number(ledger.data.totals.advance) > 0 ? (
              <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                {amount(ledger.data.totals.advance)} was paid in advance of what has been billed.
              </p>
            ) : null}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vouchers
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="pl-4">Voucher</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Charged</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.data.invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No voucher has been issued to this student.
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledger.data.invoices.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="pl-4 font-medium">{i.invoice_number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {i.period_label ?? ABSENT}
                          </TableCell>
                          <TableCell className="text-sm">
                            {i.due_date ? formatDate(i.due_date) : ABSENT}
                            {i.days_overdue > 0 ? (
                              <span className="ml-1.5 text-xs text-rose-600 dark:text-rose-400">
                                +{i.days_overdue}d
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{amount(i.total_amount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{amount(i.paid_amount)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {amount(i.balance)}
                          </TableCell>
                          <TableCell className="pr-4">
                            <Badge variant="secondary" className={`rounded-md font-normal ${STATUS_TONE[i.status] ?? ""}`}>
                              {i.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payments
              </p>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="pl-4">When</TableHead>
                      <TableHead>Against</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="pr-4 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.data.payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          Nothing has been received from this family yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledger.data.payments.map((p) => (
                        <TableRow key={p.id} className={p.counted ? "" : "opacity-60"}>
                          <TableCell className="pl-4 text-sm">
                            {p.paid_at ? formatDate(p.paid_at) : ABSENT}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.invoice_number ?? ABSENT}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1.5">
                              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                              {p.method}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.transaction_ref ?? ABSENT}
                            {!p.counted ? (
                              <Badge variant="secondary" className="ml-1.5 rounded-md text-[10px]">
                                {p.status} — not counted
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="pr-4 text-right font-semibold tabular-nums">
                            {amount(p.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default StudentLedger;
