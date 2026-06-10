import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, AlertTriangle, Wallet, FileDown, Printer, Send, Percent,
  CalendarClock, RefreshCw, DollarSign, Users, Search, X
} from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfMonth } from "date-fns";

type Invoice = {
  id: string; invoice_number: string; student_id: string; total_amount: number;
  paid_amount: number; status: string; due_date: string; created_at: string;
  late_fee: number; discount_amount: number; period_label: string | null;
};
type Payment = { id: string; amount: number; paid_at: string; method: string; status: string };
type Student = { id: string; first_name: string; last_name: string | null; parent_phone: string | null; parent_email: string | null };

interface Props {
  schoolId: string;
  currency: string;
  invoices: Invoice[];
  payments: Payment[];
  students: Student[];
  onRefresh: () => void;
}

function csvEscape(v: any) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: any[][]) {
  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printHtml(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Pop-up blocked. Allow pop-ups to print."); return; }
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a0a0a;padding:24px}
      h1{font-size:20px;margin:0 0 4px}
      .muted{color:#6b7280;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
      th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left}
      th{background:#f9fafb;font-weight:600}
      .right{text-align:right}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:#eef2ff;color:#3730a3}
      .totals{margin-top:16px;font-size:14px}
      @media print{button{display:none}}
    </style></head><body>${bodyHtml}
    <script>setTimeout(()=>window.print(),250)</script>
    </body></html>`);
  w.document.close();
}

export function FeesAnalyticsTab({ schoolId, currency, invoices, payments, students, onRefresh }: Props) {
  const [range, setRange] = useState<"30" | "90" | "ytd" | "all">("30");
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverInv, setWaiverInv] = useState<Invoice | null>(null);
  const [waiverAmount, setWaiverAmount] = useState("");
  const [waiverNote, setWaiverNote] = useState("");
  const [lateOpen, setLateOpen] = useState(false);
  const [lateInv, setLateInv] = useState<Invoice | null>(null);
  const [lateAmount, setLateAmount] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [defSearch, setDefSearch] = useState("");

  const studentsById = useMemo(
    () => Object.fromEntries(students.map(s => [s.id, s])),
    [students]
  );
  const sName = (sid: string) => {
    const s = studentsById[sid];
    return s ? `${s.first_name} ${s.last_name || ""}`.trim() : sid.slice(0, 8);
  };

  // ----- Date filtering -----
  const fromDate = useMemo(() => {
    if (range === "all") return null;
    if (range === "ytd") return new Date(new Date().getFullYear(), 0, 1);
    return subDays(new Date(), Number(range));
  }, [range]);

  const filteredInvoices = useMemo(() => {
    if (!fromDate) return invoices;
    return invoices.filter(i => new Date(i.created_at) >= fromDate);
  }, [invoices, fromDate]);

  const filteredPayments = useMemo(() => {
    if (!fromDate) return payments;
    return payments.filter(p => p.status === "success" && new Date(p.paid_at) >= fromDate);
  }, [payments, fromDate]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const billed = filteredInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    const collected = filteredInvoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const outstanding = filteredInvoices
      .filter(i => i.status !== "paid" && i.status !== "cancelled")
      .reduce((s, i) => s + Math.max(Number(i.total_amount) - Number(i.paid_amount), 0), 0);
    const overdueCount = filteredInvoices.filter(i => i.status === "overdue").length;
    const overdueAmount = filteredInvoices
      .filter(i => i.status === "overdue")
      .reduce((s, i) => s + Math.max(Number(i.total_amount) - Number(i.paid_amount), 0), 0);
    const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;
    const paidInvoices = filteredInvoices.filter(i => i.status === "paid").length;
    return {
      billed, collected, outstanding, overdueCount, overdueAmount,
      collectionRate, paidInvoices, totalInvoices: filteredInvoices.length,
    };
  }, [filteredInvoices]);

  // ----- Monthly trend (last 6 months) -----
  const trend = useMemo(() => {
    const months: { key: string; label: string; billed: number; collected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(new Date());
      d.setMonth(d.getMonth() - i);
      const key = format(d, "yyyy-MM");
      months.push({ key, label: format(d, "MMM"), billed: 0, collected: 0 });
    }
    const idx: Record<string, number> = Object.fromEntries(months.map((m, i) => [m.key, i]));
    invoices.forEach(i => {
      const k = format(new Date(i.created_at), "yyyy-MM");
      if (k in idx) months[idx[k]].billed += Number(i.total_amount || 0);
    });
    payments.forEach(p => {
      if (p.status !== "success") return;
      const k = format(new Date(p.paid_at), "yyyy-MM");
      if (k in idx) months[idx[k]].collected += Number(p.amount || 0);
    });
    return months;
  }, [invoices, payments]);

  const trendMax = Math.max(1, ...trend.flatMap(t => [t.billed, t.collected]));

  // ----- Defaulters (overdue + partial overdue) -----
  const defaulters = useMemo(() => {
    const map = new Map<string, { student_id: string; due: number; invoiceCount: number; oldestDue: string }>();
    invoices.forEach(i => {
      if (i.status === "paid" || i.status === "cancelled") return;
      const due = Math.max(Number(i.total_amount) - Number(i.paid_amount), 0);
      if (due <= 0) return;
      if (i.status !== "overdue") return;
      const cur = map.get(i.student_id);
      if (cur) {
        cur.due += due;
        cur.invoiceCount += 1;
        if (i.due_date < cur.oldestDue) cur.oldestDue = i.due_date;
      } else {
        map.set(i.student_id, { student_id: i.student_id, due, invoiceCount: 1, oldestDue: i.due_date });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.due - a.due);
  }, [invoices]);

  // ----- Top method breakdown -----
  const methodBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    filteredPayments.forEach(p => { m[p.method] = (m[p.method] || 0) + Number(p.amount || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [filteredPayments]);

  // ----- Actions -----
  const applyWaiver = async () => {
    if (!waiverInv || !waiverAmount) return;
    const amt = Number(waiverAmount);
    if (amt <= 0) return toast.error("Enter a positive waiver amount");
    const newDiscount = Number(waiverInv.discount_amount || 0) + amt;
    const newTotal = Math.max(Number(waiverInv.total_amount) - amt, Number(waiverInv.paid_amount));
    const { error } = await supabase
      .from("fee_invoices")
      .update({
        discount_amount: newDiscount,
        total_amount: newTotal,
        notes: waiverNote ? `[Waiver: ${currency} ${amt}] ${waiverNote}` : undefined,
      })
      .eq("id", waiverInv.id);
    if (error) return toast.error(error.message);
    toast.success(`Waiver of ${currency} ${amt.toLocaleString()} applied`);
    setWaiverOpen(false); setWaiverInv(null); setWaiverAmount(""); setWaiverNote("");
    onRefresh();
  };

  const applyLateFee = async () => {
    if (!lateInv || !lateAmount) return;
    const amt = Number(lateAmount);
    if (amt <= 0) return toast.error("Enter a positive amount");
    const newLate = Number(lateInv.late_fee || 0) + amt;
    const newTotal = Number(lateInv.total_amount) + amt;
    const { error } = await supabase
      .from("fee_invoices")
      .update({ late_fee: newLate, total_amount: newTotal })
      .eq("id", lateInv.id);
    if (error) return toast.error(error.message);
    toast.success(`Late fee of ${currency} ${amt.toLocaleString()} added`);
    setLateOpen(false); setLateInv(null); setLateAmount("");
    onRefresh();
  };

  const sendReminders = async (channel: "whatsapp" | "email") => {
    if (defaulters.length === 0) return toast.info("No defaulters to notify.");
    setReminderBusy(true);
    let sent = 0;
    try {
      if (channel === "whatsapp") {
        // Open the first; rest via prompt list
        const first = defaulters[0];
        const s = studentsById[first.student_id];
        if (!s?.parent_phone) {
          toast.error("First defaulter has no parent phone on file.");
        } else {
          const msg = encodeURIComponent(
            `Reminder: ${currency} ${first.due.toLocaleString()} is overdue for ${s.first_name}. Please pay at your earliest convenience.`
          );
          window.open(`https://wa.me/${s.parent_phone.replace(/\D/g, "")}?text=${msg}`, "_blank");
          sent = 1;
        }
      } else {
        const list = defaulters
          .map(d => studentsById[d.student_id])
          .filter(s => s?.parent_email)
          .map(s => s!.parent_email)
          .join(",");
        if (!list) toast.error("No parent emails on file.");
        else {
          window.location.href = `mailto:?bcc=${list}&subject=${encodeURIComponent("Fee payment reminder")}&body=${encodeURIComponent("This is a friendly reminder that your child's fee is overdue. Please log in to view and pay.")}`;
          sent = list.split(",").length;
        }
      }
      if (sent) toast.success(`Reminder ready for ${sent} recipient${sent > 1 ? "s" : ""}`);
    } finally {
      setReminderBusy(false);
    }
  };

  const exportInvoicesCsv = () => {
    const rows: any[][] = [["Invoice #", "Student", "Period", "Due Date", "Total", "Paid", "Outstanding", "Status"]];
    filteredInvoices.forEach(i => rows.push([
      i.invoice_number, sName(i.student_id), i.period_label || "",
      i.due_date, i.total_amount, i.paid_amount,
      Math.max(Number(i.total_amount) - Number(i.paid_amount), 0), i.status,
    ]));
    downloadCsv(`invoices-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  };

  const exportPaymentsCsv = () => {
    const rows: any[][] = [["Date", "Amount", "Method", "Status"]];
    filteredPayments.forEach(p => rows.push([
      format(new Date(p.paid_at), "yyyy-MM-dd HH:mm"), p.amount, p.method, p.status,
    ]));
    downloadCsv(`payments-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  };

  const exportDefaultersCsv = () => {
    const rows: any[][] = [["Student", "Phone", "Email", "Outstanding", "Invoices", "Oldest Due"]];
    defaulters.forEach(d => {
      const s = studentsById[d.student_id];
      rows.push([sName(d.student_id), s?.parent_phone || "", s?.parent_email || "", d.due, d.invoiceCount, d.oldestDue]);
    });
    downloadCsv(`defaulters-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  };

  const printDailyCollection = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const today_pmts = payments.filter(p => p.status === "success" && format(new Date(p.paid_at), "yyyy-MM-dd") === today);
    const total = today_pmts.reduce((s, p) => s + Number(p.amount), 0);
    const rows = today_pmts.map(p => `<tr>
      <td>${format(new Date(p.paid_at), "h:mm a")}</td>
      <td>${p.method}</td>
      <td>${p.status}</td>
      <td class="right">${currency} ${Number(p.amount).toLocaleString()}</td>
    </tr>`).join("");
    const body = `
      <h1>Daily Collection Report</h1>
      <div class="muted">${format(new Date(), "EEEE, MMMM d, yyyy")}</div>
      <table>
        <thead><tr><th>Time</th><th>Method</th><th>Status</th><th class="right">Amount</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">No payments today</td></tr>`}</tbody>
      </table>
      <div class="totals"><strong>Total collected today:</strong> ${currency} ${total.toLocaleString()} (${today_pmts.length} payments)</div>
    `;
    printHtml("Daily Collection", body);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Analytics & Tools</h2>
          <p className="text-sm text-muted-foreground">Premium reporting, defaulters and finance operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={v => setRange(v as any)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Total Billed"
          value={`${currency} ${kpis.billed.toLocaleString()}`}
          sub={`${kpis.totalInvoices} invoices`}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4 text-primary" />}
          label="Collected"
          value={`${currency} ${kpis.collected.toLocaleString()}`}
          sub={`${kpis.collectionRate.toFixed(1)}% collection rate`}
          accent="primary"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Outstanding"
          value={`${currency} ${kpis.outstanding.toLocaleString()}`}
          sub={`${kpis.totalInvoices - kpis.paidInvoices} unpaid`}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          label="Overdue"
          value={`${currency} ${kpis.overdueAmount.toLocaleString()}`}
          sub={`${kpis.overdueCount} invoices`}
          accent="destructive"
        />
      </div>

      {/* Collection rate */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Collection Performance</CardTitle>
            <Badge variant="outline">{kpis.collectionRate.toFixed(1)}%</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={Math.min(kpis.collectionRate, 100)} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Collected {currency} {kpis.collected.toLocaleString()} of {currency} {kpis.billed.toLocaleString()} billed in selected period.
          </p>
        </CardContent>
      </Card>

      {/* Trend + Method breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">6-Month Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-40">
              {trend.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-end gap-1 h-32 w-full justify-center">
                    <div
                      className="w-3 rounded-t bg-muted-foreground/30"
                      style={{ height: `${(m.billed / trendMax) * 100}%` }}
                      title={`Billed ${currency} ${m.billed.toLocaleString()}`}
                    />
                    <div
                      className="w-3 rounded-t bg-primary"
                      style={{ height: `${(m.collected / trendMax) * 100}%` }}
                      title={`Collected ${currency} ${m.collected.toLocaleString()}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-muted-foreground/30 rounded" /> Billed</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 bg-primary rounded" /> Collected</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {methodBreakdown.length === 0 && (
              <p className="text-sm text-muted-foreground">No payments in range.</p>
            )}
            {methodBreakdown.map(([method, amt]) => {
              const pct = kpis.collected > 0 ? (amt / kpis.collected) * 100 : 0;
              return (
                <div key={method} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize">{method.replace(/_/g, " ")}</span>
                    <span className="font-medium">{currency} {amt.toLocaleString()}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Exports row */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Exports & Reports</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportInvoicesCsv}>
            <FileDown className="h-4 w-4 mr-1" /> Invoices CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPaymentsCsv}>
            <FileDown className="h-4 w-4 mr-1" /> Payments CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportDefaultersCsv}>
            <FileDown className="h-4 w-4 mr-1" /> Defaulters CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printDailyCollection}>
            <Printer className="h-4 w-4 mr-1" /> Print Daily Collection
          </Button>
        </CardContent>
      </Card>

      {/* Defaulters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Defaulters ({defaulters.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground">Students with overdue balances.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={reminderBusy} onClick={() => sendReminders("whatsapp")}>
                <Send className="h-4 w-4 mr-1" /> WhatsApp top defaulter
              </Button>
              <Button size="sm" variant="outline" disabled={reminderBusy} onClick={() => sendReminders("email")}>
                <Send className="h-4 w-4 mr-1" /> Email all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={defSearch} onChange={e => setDefSearch(e.target.value)} placeholder="Search defaulter by name, phone, email…" className="pl-8 pr-8" />
            {defSearch && (
              <button type="button" onClick={() => setDefSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(() => {
            const q = defSearch.trim().toLowerCase();
            const filtered = q
              ? defaulters.filter(d => {
                  const s = studentsById[d.student_id];
                  const hay = `${sName(d.student_id)} ${s?.parent_phone || ""} ${s?.parent_email || ""}`.toLowerCase();
                  return hay.includes(q);
                })
              : defaulters;
            if (defaulters.length === 0) return <p className="text-sm text-muted-foreground">No overdue balances. 🎉</p>;
            if (filtered.length === 0) return <p className="text-sm text-muted-foreground">No defaulters match your search.</p>;
            return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead>Oldest Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(d => {
                  const s = studentsById[d.student_id];
                  const oldest = invoices
                    .filter(i => i.student_id === d.student_id && i.status === "overdue")
                    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                  return (
                    <TableRow key={d.student_id}>
                      <TableCell className="font-medium">{sName(d.student_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s?.parent_phone || "—"}<br />{s?.parent_email || ""}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{currency} {d.due.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{d.invoiceCount}</TableCell>
                      <TableCell>{format(new Date(d.oldestDue), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {oldest && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => { setWaiverInv(oldest); setWaiverOpen(true); }}>
                                <Percent className="h-3 w-3 mr-1" /> Waiver
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setLateInv(oldest); setLateOpen(true); }}>
                                <CalendarClock className="h-3 w-3 mr-1" /> Late fee
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Waiver dialog */}
      <Dialog open={waiverOpen} onOpenChange={setWaiverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Waiver / Discount</DialogTitle>
          </DialogHeader>
          {waiverInv && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Invoice <span className="font-mono">{waiverInv.invoice_number}</span> · Outstanding{" "}
                <strong>{currency} {Math.max(Number(waiverInv.total_amount) - Number(waiverInv.paid_amount), 0).toLocaleString()}</strong>
              </p>
              <div>
                <Label>Waiver amount ({currency})</Label>
                <Input type="number" value={waiverAmount} onChange={e => setWaiverAmount(e.target.value)} placeholder="e.g. 500" />
              </div>
              <div>
                <Label>Reason / note</Label>
                <Textarea value={waiverNote} onChange={e => setWaiverNote(e.target.value)} placeholder="Sibling discount, hardship, etc." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiverOpen(false)}>Cancel</Button>
            <Button onClick={applyWaiver}>Apply waiver</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Late fee dialog */}
      <Dialog open={lateOpen} onOpenChange={setLateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Late Fee</DialogTitle>
          </DialogHeader>
          {lateInv && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Invoice <span className="font-mono">{lateInv.invoice_number}</span> · Current late fee{" "}
                <strong>{currency} {Number(lateInv.late_fee || 0).toLocaleString()}</strong>
              </p>
              <div>
                <Label>Add late fee ({currency})</Label>
                <Input type="number" value={lateAmount} onChange={e => setLateAmount(e.target.value)} placeholder="e.g. 200" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLateOpen(false)}>Cancel</Button>
            <Button onClick={applyLateFee}>Add late fee</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, accent,
}: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: "primary" | "destructive" }) {
  const ring =
    accent === "primary" ? "border-primary/30 bg-primary/5"
      : accent === "destructive" ? "border-destructive/30 bg-destructive/5"
        : "";
  return (
    <Card className={ring}>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}<span className="uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default FeesAnalyticsTab;
