import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, TrendingDown, FileText, Calendar, DollarSign, Printer } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";
import { printReport } from "@/lib/report-export";

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export function AccountantReportsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  const { data: payments = [] } = useQuery({
    queryKey: ["finance_payments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_payments")
        .select("amount, paid_at")
        .eq("school_id", schoolId!)
        .order("paid_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["finance_expenses", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_expenses")
        .select("amount, expense_date, category")
        .eq("school_id", schoolId!)
        .order("expense_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["finance_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_invoices")
        .select("total, status, issue_date")
        .eq("school_id", schoolId!)
        .order("issue_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  const { data: payRuns = [] } = useQuery({
    queryKey: ["hr_pay_runs", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_pay_runs")
        .select("net_amount, paid_at, status, created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!schoolId,
  });

  // Calculate period date range
  const getPeriodRange = () => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "quarter":
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterMonth, 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default: // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { startDate, endDate: now };
  };

  const { startDate, endDate } = getPeriodRange();

  // Filter data by period
  const periodPayments = payments.filter((p) => {
    const date = new Date(p.paid_at);
    return date >= startDate && date <= endDate;
  });

  const periodExpenses = expenses.filter((e) => {
    const date = new Date(e.expense_date);
    return date >= startDate && date <= endDate;
  });

  const periodPayRuns = payRuns.filter((p) => {
    const date = new Date(p.paid_at || p.created_at);
    return date >= startDate && date <= endDate;
  });

  // Calculate stats
  const totalRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPayroll = periodPayRuns.filter((p) => p.status === "completed").reduce((sum, p) => sum + (p.net_amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses - totalPayroll;

  // Chart data - trend by date
  const trendData = useMemo(() => {
    const dataMap = new Map<string, { date: string; revenue: number; expenses: number }>();

    periodPayments.forEach((p) => {
      const date = new Date(p.paid_at).toLocaleDateString();
      const existing = dataMap.get(date) || { date, revenue: 0, expenses: 0 };
      existing.revenue += p.amount;
      dataMap.set(date, existing);
    });

    periodExpenses.forEach((e) => {
      const date = new Date(e.expense_date).toLocaleDateString();
      const existing = dataMap.get(date) || { date, revenue: 0, expenses: 0 };
      existing.expenses += e.amount;
      dataMap.set(date, existing);
    });

    return Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [periodPayments, periodExpenses]);

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const categoryMap = new Map<string, number>();
    periodExpenses.forEach((e) => {
      const current = categoryMap.get(e.category) || 0;
      categoryMap.set(e.category, current + e.amount);
    });
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()), value }))
      .sort((a, b) => b.value - a.value);
  }, [periodExpenses]);

  // Invoice status breakdown
  const invoiceByStatus = useMemo(() => {
    const statusMap = new Map<string, number>();
    invoices.forEach((i) => {
      const current = statusMap.get(i.status) || 0;
      statusMap.set(i.status, current + i.total);
    });
    return Array.from(statusMap.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [invoices]);

  const plRows = [
    { category: "Revenue (Fee Collections)", amount: totalRevenue },
    ...expenseByCategory.map((c) => ({ category: `Expense • ${c.name}`, amount: -c.value })),
    { category: "Payroll", amount: -totalPayroll },
    { category: "Net Profit / Loss", amount: netProfit },
  ];
  const cashflowRows = trendData.map((d) => ({ date: d.date, revenue: d.revenue, expenses: d.expenses }));
  const expenseRows = expenseByCategory.map((c) => ({ category: c.name, amount: c.value }));

  const periodLabel = period === "month" ? "This Month" : period === "quarter" ? "This Quarter" : "This Year";
  const summary = [
    { label: "Revenue", value: totalRevenue.toLocaleString() },
    { label: "Expenses", value: totalExpenses.toLocaleString() },
    { label: "Payroll", value: totalPayroll.toLocaleString() },
    { label: "Net Profit", value: netProfit.toLocaleString() },
  ];

  const printAll = () => {
    const extra = `
      <h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em">Cash flow trend</h3>
      ${cashflowRows.length ? `<table><thead><tr><th>Date</th><th>Revenue</th><th>Expenses</th></tr></thead><tbody>${cashflowRows.map((r) => `<tr><td>${r.date}</td><td>${r.revenue.toLocaleString()}</td><td>${r.expenses.toLocaleString()}</td></tr>`).join("")}</tbody></table>` : "<p style='color:#6b7280;font-size:11px'>No cash flow data.</p>"}
      <h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em">Expense breakdown</h3>
      ${expenseRows.length ? `<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${expenseRows.map((r) => `<tr><td>${r.category}</td><td>${r.amount.toLocaleString()}</td></tr>`).join("")}</tbody></table>` : "<p style='color:#6b7280;font-size:11px'>No expense data.</p>"}
      <h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em">Profit & Loss</h3>
    `;
    printReport({
      title: "Consolidated Financial Report",
      subtitle: `${periodLabel} • ${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`,
      summary,
      extraHtml: extra,
      rows: plRows,
      schoolName: tenant.status === "ready" ? tenant.school?.name ?? schoolSlug : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <Card className="shadow-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-xl">Financial Reports</CardTitle>
            <p className="text-sm text-muted-foreground">P&L, expense breakdown and cash flow — exportable, printable, ready for board packs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={printAll} className="gap-2">
              <Printer className="h-4 w-4" /> Print all
            </Button>
            <ReportExportMenu
              baseName={`financial-report-${period}`}
              label="Export all"
              variant="hero"
              rows={plRows}
              print={{
                title: "Consolidated Financial Report",
                subtitle: `${periodLabel}`,
                summary,
                schoolName: tenant.status === "ready" ? tenant.school?.name ?? schoolSlug : undefined,
              }}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">Revenue</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-primary">{totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <p className="text-sm text-muted-foreground">Expenses</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-destructive">{totalExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Payroll</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{totalPayroll.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Net Profit</p>
            </div>
            <p className={`mt-2 text-2xl font-semibold ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              {netProfit.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cash Flow Chart */}
        <Card className="shadow-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Cash Flow Trend</CardTitle>
            <ReportExportMenu
              baseName={`cashflow-${period}`}
              rows={cashflowRows}
              print={{ title: "Cash Flow Trend", subtitle: periodLabel, summary }}
            />
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.3)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stackId="2"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive) / 0.3)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="shadow-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Expense Breakdown</CardTitle>
            <ReportExportMenu
              baseName={`expense-breakdown-${period}`}
              rows={expenseRows}
              print={{ title: "Expense Breakdown", subtitle: periodLabel, summary }}
            />
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card className="shadow-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Profit & Loss Statement</CardTitle>
            <ReportExportMenu
              baseName={`profit-loss-${period}`}
              rows={plRows}
              print={{ title: "Profit & Loss Statement", subtitle: periodLabel, summary }}
            />
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-auto rounded-xl border bg-surface">
            <div className="min-w-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-primary">Revenue (Fee Collections)</TableCell>
                  <TableCell className="text-right font-medium text-primary">+{totalRevenue.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={2} className="font-semibold">Expenses</TableCell>
                </TableRow>
                {expenseByCategory.map((cat) => (
                  <TableRow key={cat.name}>
                    <TableCell className="pl-8">{cat.name}</TableCell>
                    <TableCell className="text-right text-destructive">-{cat.value.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="pl-8">Payroll</TableCell>
                  <TableCell className="text-right text-destructive">-{totalPayroll.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Net Profit / Loss</TableCell>
                  <TableCell className={`text-right ${netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                    {netProfit >= 0 ? "+" : ""}{netProfit.toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Status */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-lg">Invoice Status Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {invoiceByStatus.map((status) => (
              <div key={status.name} className="rounded-xl border p-4 text-center">
                <p className="text-sm text-muted-foreground">{status.name}</p>
                <p className="mt-1 text-xl font-semibold">{status.value.toLocaleString()}</p>
              </div>
            ))}
            {invoiceByStatus.length === 0 && (
              <div className="col-span-4 text-center py-8">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No invoice data</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
