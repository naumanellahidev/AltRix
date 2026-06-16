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
    queryKey: ["fee_payments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("amount, paid_at")
        .eq("school_id", schoolId!)
        .order("paid_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(p => ({
        amount: Number(p.amount),
        paid_at: p.paid_at
      }));
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
      return (data || []).map(e => ({
        amount: Number(e.amount),
        expense_date: e.expense_date,
        category: e.category
      }));
    },
    enabled: !!schoolId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["fee_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("total_amount, status, created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(i => ({
        total: Number(i.total_amount),
        status: i.status,
        issue_date: i.created_at
      }));
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
      const cat = e.category || "Other";
      const current = categoryMap.get(cat) || 0;
      categoryMap.set(cat, current + e.amount);
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
      <Card className="shadow-elevated border border-blue-100 bg-white">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display text-xl font-bold text-slate-800">Financial Reports</CardTitle>
            <p className="text-sm text-muted-foreground">P&L, expense breakdown and cash flow — exportable, printable, ready for board packs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-[140px] rounded-xl border-blue-100">
                <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={printAll} className="gap-2 rounded-xl border-blue-100 text-slate-700">
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
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Revenue</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-800">Rs. {totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-white to-rose-50/20 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-600" />
              <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Expenses</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-800">Rs. {totalExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payroll</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-800">Rs. {totalPayroll.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={`border-blue-100 bg-gradient-to-br shadow-sm ${netProfit >= 0 ? "from-white to-blue-50/20" : "from-white to-rose-50/20"}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className={`h-4 w-4 ${netProfit >= 0 ? "text-blue-600" : "text-rose-600"}`} />
              <p className={`text-xs font-semibold uppercase tracking-wider ${netProfit >= 0 ? "text-blue-600" : "text-rose-600"}`}>Net Profit</p>
            </div>
            <p className={`mt-2 text-2xl font-bold ${netProfit >= 0 ? "text-blue-600" : "text-rose-600"}`}>
              Rs. {netProfit.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cash Flow Chart */}
        <Card className="border-blue-50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-slate-800">Cash Flow Trend</CardTitle>
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
                  <XAxis dataKey="date" className="text-xs text-slate-500" />
                  <YAxis className="text-xs text-slate-500" tickFormatter={(v) => `Rs.${v.toLocaleString()}`} />
                  <Tooltip formatter={(value: number) => `Rs. ${value.toLocaleString()}`} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stackId="1"
                    stroke="#2563eb"
                    fill="#dbeafe"
                  />
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stackId="2"
                    stroke="#dc2626"
                    fill="#fee2e2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card className="border-blue-50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-slate-800">Expense Breakdown</CardTitle>
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
                  <Tooltip formatter={(value: number) => `Rs. ${value.toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card className="border-blue-50 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-800">Profit & Loss Statement</CardTitle>
          <ReportExportMenu
            baseName={`profit-loss-${period}`}
            rows={plRows}
            print={{ title: "Profit & Loss Statement", subtitle: periodLabel, summary }}
          />
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-auto rounded-xl border border-blue-50 bg-white">
            <div className="min-w-[600px]">
              <Table>
                <TableHeader className="bg-blue-50/20">
                  <TableRow className="border-blue-50">
                    <TableHead className="text-slate-700 font-semibold py-2">Category</TableHead>
                    <TableHead className="text-slate-700 font-semibold text-right py-2">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-blue-50/5 border-blue-50">
                    <TableCell className="font-semibold text-blue-600 py-2.5">Revenue (Fee Collections)</TableCell>
                    <TableCell className="text-right font-bold text-blue-600 py-2.5">+Rs. {totalRevenue.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50/10 border-blue-50 hover:bg-blue-50/10">
                    <TableCell colSpan={2} className="font-bold text-slate-800 py-2">Expenses</TableCell>
                  </TableRow>
                  {expenseByCategory.map((cat) => (
                    <TableRow key={cat.name} className="hover:bg-blue-50/5 border-blue-50">
                      <TableCell className="pl-8 text-xs text-slate-600 py-2.5">{cat.name}</TableCell>
                      <TableCell className="text-right text-rose-600 font-medium text-xs py-2.5">-Rs. {cat.value.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="hover:bg-blue-50/5 border-blue-50">
                    <TableCell className="pl-8 text-xs text-slate-600 py-2.5">Payroll</TableCell>
                    <TableCell className="text-right text-rose-600 font-medium text-xs py-2.5">-Rs. {totalPayroll.toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50/20 font-bold border-t border-blue-100 hover:bg-blue-50/25">
                    <TableCell className="py-3 text-slate-800">Net Profit / Loss</TableCell>
                    <TableCell className={`text-right py-3 ${netProfit >= 0 ? "text-blue-600 font-black" : "text-rose-600 font-black"}`}>
                      {netProfit >= 0 ? "+" : ""}Rs. {netProfit.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Status */}
      <Card className="border-blue-50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold text-slate-800">Invoice Status Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {invoiceByStatus.map((status) => (
              <div key={status.name} className="rounded-2xl border border-blue-100 p-4 text-center bg-white shadow-sm hover:border-blue-200 transition-all duration-300">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{status.name}</p>
                <p className="mt-1.5 text-xl font-bold text-slate-800">Rs. {status.value.toLocaleString()}</p>
              </div>
            ))}
            {invoiceByStatus.length === 0 && (
              <div className="col-span-4 text-center py-8">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2 animate-pulse" />
                <p className="text-muted-foreground text-xs">No invoice data recorded</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
