import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Percent, Receipt, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";
import { toast } from "sonner";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n || 0);

const TAX_STORAGE = "altrix:tax_settings:";

type TaxSettings = {
  ratePct: number; // % applied to taxable revenue
  withholdingPct: number; // % withheld on staff/vendor payments
  fiscalStartMonth: number; // 1-12 (e.g. 7 for July)
};

const DEFAULT_SETTINGS: TaxSettings = { ratePct: 0, withholdingPct: 0, fiscalStartMonth: 7 };

export function AccountantTaxModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<TaxSettings>(DEFAULT_SETTINGS);
  const storageKey = useMemo(() => (schoolId ? `${TAX_STORAGE}${schoolId}` : null), [schoolId]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as TaxSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        setDraft({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {}
  }, [storageKey]);

  const saveSettings = () => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(draft));
    setSettings(draft);
    toast.success("Tax settings saved");
  };

  // Build current fiscal year window
  const fiscal = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), settings.fiscalStartMonth - 1, 1);
    if (start > now) start.setFullYear(start.getFullYear() - 1);
    const end = new Date(start.getFullYear() + 1, start.getMonth(), 0);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: `FY ${start.getFullYear()}-${(start.getFullYear() + 1).toString().slice(-2)}`,
    };
  }, [settings.fiscalStartMonth]);

  const [from, setFrom] = useState(fiscal.from);
  const [to, setTo] = useState(fiscal.to);

  useEffect(() => {
    setFrom(fiscal.from);
    setTo(fiscal.to);
  }, [fiscal.from, fiscal.to]);

  const { data: payments = [] } = useQuery({
    queryKey: ["tax_payments", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("amount, paid_at, status")
        .eq("school_id", schoolId!)
        .eq("status", "success")
        .gte("paid_at", `${from}T00:00:00`)
        .lte("paid_at", `${to}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["tax_expenses", schoolId, from, to],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_expenses")
        .select("amount, category, expense_date, description, vendor")
        .eq("school_id", schoolId!)
        .gte("expense_date", from)
        .lte("expense_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthly = useMemo(() => {
    const buckets = new Map<string, { period: string; revenue: number; expenses: number; taxPaid: number }>();
    const ensure = (k: string) =>
      buckets.get(k) || { period: k, revenue: 0, expenses: 0, taxPaid: 0 };

    for (const p of payments as any[]) {
      const k = (p.paid_at || "").slice(0, 7);
      if (!k) continue;
      const b = ensure(k);
      b.revenue += Number(p.amount || 0);
      buckets.set(k, b);
    }
    for (const e of expenses as any[]) {
      const k = (e.expense_date || "").slice(0, 7);
      if (!k) continue;
      const b = ensure(k);
      b.expenses += Number(e.amount || 0);
      if ((e.category || "").toLowerCase() === "taxes") b.taxPaid += Number(e.amount || 0);
      buckets.set(k, b);
    }
    return [...buckets.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  }, [payments, expenses]);

  const totals = useMemo(() => {
    const revenue = monthly.reduce((s, m) => s + m.revenue, 0);
    const exp = monthly.reduce((s, m) => s + m.expenses, 0);
    const taxPaid = monthly.reduce((s, m) => s + m.taxPaid, 0);
    const taxable = Math.max(revenue - exp, 0);
    const liability = (taxable * settings.ratePct) / 100;
    return { revenue, expenses: exp, taxPaid, taxable, liability, due: Math.max(liability - taxPaid, 0) };
  }, [monthly, settings.ratePct]);

  const monthlyRows = monthly.map((m) => ({
    Period: m.period,
    Revenue: m.revenue,
    Expenses: m.expenses,
    Taxable: Math.max(m.revenue - m.expenses, 0),
    "Tax Liability": ((Math.max(m.revenue - m.expenses, 0)) * settings.ratePct) / 100,
    "Tax Paid": m.taxPaid,
  }));

  // Quarterly summary
  const quarters = useMemo(() => {
    const map = new Map<string, { quarter: string; revenue: number; expenses: number; taxPaid: number }>();
    for (const m of monthly) {
      const [y, mo] = m.period.split("-");
      const q = `${y}-Q${Math.ceil(Number(mo) / 3)}`;
      const cur = map.get(q) || { quarter: q, revenue: 0, expenses: 0, taxPaid: 0 };
      cur.revenue += m.revenue;
      cur.expenses += m.expenses;
      cur.taxPaid += m.taxPaid;
      map.set(q, cur);
    }
    return [...map.values()].sort((a, b) => (a.quarter < b.quarter ? -1 : 1));
  }, [monthly]);

  const taxExpenseRows = useMemo(
    () =>
      (expenses as any[])
        .filter((e) => (e.category || "").toLowerCase() === "taxes")
        .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1)),
    [expenses],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Tax Center</h1>
          <p className="text-sm text-muted-foreground">
            Tax liability, payments and filings — {fiscal.label}.
          </p>
        </div>
        <ReportExportMenu
          baseName="tax-summary"
          rows={monthlyRows}
          print={{
            title: "Tax Summary",
            subtitle: `${from} → ${to}`,
            summary: [
              { label: "Revenue", value: fmt(totals.revenue) },
              { label: "Deductible Expenses", value: fmt(totals.expenses) },
              { label: "Tax Liability", value: fmt(totals.liability) },
              { label: "Outstanding", value: fmt(totals.due) },
            ],
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Taxable Income</p>
            <p className="text-2xl font-semibold tabular-nums">{fmt(totals.taxable)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Revenue − Expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Tax Liability</p>
              <p className="truncate text-2xl font-semibold tabular-nums">{fmt(totals.liability)}</p>
              <p className="mt-1 text-xs text-muted-foreground">@ {settings.ratePct}%</p>
            </div>
            <Calculator className="h-8 w-8 shrink-0 text-primary/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tax Paid</p>
            <p className="text-2xl font-semibold tabular-nums text-emerald-600">{fmt(totals.taxPaid)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Recorded as expense</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p
                className={`truncate text-2xl font-semibold tabular-nums ${
                  totals.due > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {fmt(totals.due)}
              </p>
            </div>
            <Receipt className="h-8 w-8 shrink-0 text-rose-500/60" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Monthly</TabsTrigger>
          <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
          <TabsTrigger value="payments">Tax Payments</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Monthly Tax Computation</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">Liability</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthly.map((m) => {
                      const taxable = Math.max(m.revenue - m.expenses, 0);
                      const liab = (taxable * settings.ratePct) / 100;
                      return (
                        <TableRow key={m.period}>
                          <TableCell className="font-mono">{m.period}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.expenses)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(taxable)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(liab)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">{fmt(m.taxPaid)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {monthly.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          No data in this fiscal year.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quarterly">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quarterly Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quarter</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Liability</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarters.map((q) => {
                      const liab = (Math.max(q.revenue - q.expenses, 0) * settings.ratePct) / 100;
                      const due = Math.max(liab - q.taxPaid, 0);
                      return (
                        <TableRow key={q.quarter}>
                          <TableCell className="font-mono">{q.quarter}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(q.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(q.expenses)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(liab)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">{fmt(q.taxPaid)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge variant={due > 0 ? "destructive" : "default"}>{fmt(due)}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Tax Payments ({taxExpenseRows.length}) — expenses tagged "taxes"
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Authority / Vendor</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxExpenseRows.map((t: any) => (
                      <TableRow key={t.expense_date + t.description}>
                        <TableCell className="whitespace-nowrap">{t.expense_date}</TableCell>
                        <TableCell>{t.vendor || "—"}</TableCell>
                        <TableCell className="max-w-[360px] truncate">{t.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(Number(t.amount || 0))}</TableCell>
                      </TableRow>
                    ))}
                    {taxExpenseRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          Add an expense with category "taxes" to record a tax payment.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4" /> Tax Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <Label>Income tax rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={draft.ratePct}
                  onChange={(e) => setDraft({ ...draft, ratePct: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Withholding rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={draft.withholdingPct}
                  onChange={(e) => setDraft({ ...draft, withholdingPct: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Fiscal year start month (1-12)</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={draft.fiscalStartMonth}
                  onChange={(e) => setDraft({ ...draft, fiscalStartMonth: Math.min(12, Math.max(1, Number(e.target.value) || 7)) })}
                />
              </div>
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Period from</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>Period to</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Button onClick={saveSettings} className="gap-2">
                  <Save className="h-4 w-4" /> Save settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
