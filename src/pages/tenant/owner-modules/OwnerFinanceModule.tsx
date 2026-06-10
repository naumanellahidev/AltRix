import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  BadgeDollarSign,
  BarChart3,
  Coins,
  CreditCard,
  Download,
  FileText,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToCSV } from "@/lib/csv";
import { FeeDefaultersReport } from "@/components/accountant/FeeDefaultersReport";
import { SalaryBudgetForecast } from "@/components/accountant/SalaryBudgetForecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
} from "recharts";
import { format, subMonths, startOfMonth, startOfYear, endOfMonth } from "date-fns";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props {
  schoolId: string | null;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))"];

export function OwnerFinanceModule({ schoolId }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const [periodFilter, setPeriodFilter] = useState("12m");
  const activeCampusId = useActiveCampus(schoolId);
  const campusEq = (q: any) => (activeCampusId ? q.eq("campus_id", activeCampusId) : q);

  // Date ranges
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const yearStart = useMemo(() => startOfYear(new Date()), []);

  const trendMonths = periodFilter === "3m" ? 3 : periodFilter === "6m" ? 6 : periodFilter === "ytd" ? Math.max(1, new Date().getMonth() + 1) : 12;

  // Fetch financial data
  const { data: financeData, isLoading } = useQuery({
    queryKey: ["owner_finance", schoolId, activeCampusId, trendMonths],
    queryFn: async () => {
      if (!schoolId) return null;

      const [paymentsRes, expensesRes, invoicesRes, payRunsRes, salariesRes] = await Promise.all([
        campusEq(supabase.from("fee_payments").select("*").eq("school_id", schoolId).eq("status", "success")),
        supabase.from("finance_expenses").select("*").eq("school_id", schoolId),
        campusEq(supabase.from("fee_invoices").select("*").eq("school_id", schoolId)),
        supabase.from("hr_pay_runs").select("*").eq("school_id", schoolId),
        supabase.from("hr_salary_records").select("*").eq("school_id", schoolId).eq("is_active", true),
      ]);

      const payments = paymentsRes.data || [];
      const expenses = expensesRes.data || [];
      const invoices = invoicesRes.data || [];
      const payRuns = payRunsRes.data || [];
      const salaries = salariesRes.data || [];

      // Revenue calculations
      const mtdPayments = payments.filter((p) => new Date(p.paid_at) >= monthStart);
      const ytdPayments = payments.filter((p) => new Date(p.paid_at) >= yearStart);
      const revenueMtd = mtdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const revenueYtd = ytdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Expense calculations
      const mtdExpenses = expenses.filter((e) => new Date(e.expense_date) >= monthStart);
      const ytdExpenses = expenses.filter((e) => new Date(e.expense_date) >= yearStart);
      const expensesMtd = mtdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const expensesYtd = ytdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      // Payroll
      const monthlyPayroll = salaries.reduce(
        (sum, s) => sum + Number(s.base_salary || 0) + Number(s.allowances || 0) - Number(s.deductions || 0),
        0
      );

      // Invoice metrics
      const totalInvoiced = invoices.reduce((sum, i: any) => sum + Number(i.total_amount || i.total || 0), 0);
      const paidInvoices = invoices.filter((i) => i.status === "paid");
      const collectedAmount = paidInvoices.reduce((sum, i: any) => sum + Number(i.total_amount || i.total || 0), 0);
      const collectionRate = totalInvoiced > 0 ? Math.round((collectedAmount / totalInvoiced) * 100) : 0;
      const pendingInvoices = invoices.filter((i) => i.status !== "paid");
      const unpaidAmount = pendingInvoices.reduce((sum, i: any) => sum + Number(i.total_amount || i.total || 0), 0);

      // Expense breakdown by category
      const expenseByCategory: Record<string, number> = {};
      expenses.forEach((e) => {
        const cat = e.category || "Other";
        expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Number(e.amount || 0);
      });

      // Monthly trend (driven by period filter)
      const monthlyTrend: { month: string; revenue: number; expenses: number; profit: number; payroll: number }[] = [];
      for (let i = trendMonths - 1; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i));
        const end = startOfMonth(subMonths(new Date(), i - 1));

        const monthRevenue = payments
          .filter((p) => new Date(p.paid_at) >= start && new Date(p.paid_at) < end)
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const monthExpenses = expenses
          .filter((e) => new Date(e.expense_date) >= start && new Date(e.expense_date) < end)
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        const monthPayroll = payRuns
          .filter((pr) => {
            const d = pr.paid_at ? new Date(pr.paid_at) : new Date(pr.created_at);
            return d >= start && d < end;
          })
          .reduce((sum, pr) => sum + Number(pr.net_amount || 0), 0);

        monthlyTrend.push({
          month: format(start, "MMM"),
          revenue: monthRevenue,
          expenses: monthExpenses + monthPayroll,
          profit: monthRevenue - monthExpenses - monthPayroll,
          payroll: monthPayroll,
        });
      }

      // Profit calculations
      const profitMtd = revenueMtd - expensesMtd;
      const profitYtd = revenueYtd - expensesYtd;
      const profitMargin = revenueMtd > 0 ? Math.round((profitMtd / revenueMtd) * 100) : 0;

      return {
        revenueMtd,
        revenueYtd,
        expensesMtd,
        expensesYtd,
        profitMtd,
        profitYtd,
        profitMargin,
        monthlyPayroll,
        collectionRate,
        unpaidAmount,
        pendingInvoicesCount: pendingInvoices.length,
        totalInvoiced,
        expenseByCategory,
        monthlyTrend,
        totalPayments: payments.length,
        totalExpenses: expenses.length,
      };
    },
    enabled: !!schoolId,
  });

  const expensePieData = useMemo(() => {
    if (!financeData) return [];
    return Object.entries(financeData.expenseByCategory)
      .map(([name, value], idx) => ({
        name,
        value,
        fill: COLORS[idx % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [financeData]);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Finance & Profitability</h1>
          <p className="text-muted-foreground">Business intelligence, revenue tracking, and financial health</p>
        </div>
        <div className="flex gap-2">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Last 3 months</SelectItem>
              <SelectItem value="6m">Last 6 months</SelectItem>
              <SelectItem value="12m">Last 12 months</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Export financial summary as CSV"
            onClick={() => {
              const rows = (financeData?.monthlyTrend || []).map((m) => ({
                month: m.month,
                revenue: m.revenue,
                expenses: m.expenses,
                payroll: m.payroll,
                profit: m.profit,
              }));
              if (rows.length) exportToCSV(rows, `finance-summary-${new Date().toISOString().slice(0,10)}`);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Coins className="h-5 w-5 text-emerald-600" />
              {(financeData?.profitMtd || 0) >= 0 ? (
                <ArrowUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <ArrowDown className="h-4 w-4 text-red-600" />
              )}
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-emerald-600">
              {formatCurrency(financeData?.revenueMtd || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Revenue (MTD)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-red-600">
              {formatCurrency(financeData?.expensesMtd || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Expenses (MTD)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <PiggyBank className="h-5 w-5 text-blue-600" />
              <Badge
                variant={(financeData?.profitMargin || 0) >= 0 ? "default" : "destructive"}
                className="text-[10px]"
              >
                {financeData?.profitMargin || 0}%
              </Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {formatCurrency(financeData?.profitMtd || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Profit (MTD)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Wallet className="h-5 w-5 text-purple-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {formatCurrency(financeData?.monthlyPayroll || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Monthly Payroll</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <CreditCard className="h-5 w-5 text-amber-600" />
              <Badge
                variant={(financeData?.collectionRate || 0) >= 80 ? "default" : "destructive"}
                className="text-[10px]"
              >
                {financeData?.collectionRate || 0}%
              </Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {formatCurrency(financeData?.unpaidAmount || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <FileText className="h-5 w-5 text-indigo-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {financeData?.pendingInvoicesCount || 0}
            </p>
            <p className="text-xs text-muted-foreground">Pending Invoices</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Cash Flow</TabsTrigger>
          <TabsTrigger value="expenses">Expense Breakdown</TabsTrigger>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="defaulters">Fee Defaulters</TabsTrigger>
          <TabsTrigger value="forecast">Salary Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Cash Flow (12 months)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financeData?.monthlyTrend || []}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={formatCurrency} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--chart-2))"
                      fill="url(#revenueGrad)"
                      strokeWidth={2}
                      name="Revenue"
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      stroke="hsl(var(--destructive))"
                      fill="url(#expenseGrad)"
                      strokeWidth={2}
                      name="Expenses"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Expense by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {expensePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {expensePieData.map((cat, idx) => (
                      <div key={cat.name} className="rounded-lg bg-muted/50 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: cat.fill }}
                            />
                            <span className="font-medium">{cat.name}</span>
                          </div>
                          <span className="font-semibold">{formatCurrency(cat.value)}</span>
                        </div>
                        <Progress
                          value={
                            (cat.value / Math.max(1, expensePieData.reduce((s, c) => s + c.value, 0))) *
                            100
                          }
                          className="mt-2 h-1.5"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profitability" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Profit Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeData?.monthlyTrend || []}>
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={formatCurrency} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]} name="Profit">
                      {(financeData?.monthlyTrend || []).map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.profit >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Overall Collection Rate</span>
                    <span className="font-bold">{financeData?.collectionRate || 0}%</span>
                  </div>
                  <Progress value={financeData?.collectionRate || 0} className="mt-2 h-3" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-600">
                      {formatCurrency((financeData?.totalInvoiced || 0) - (financeData?.unpaidAmount || 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">Collected</p>
                  </div>
                  <div className="rounded-xl bg-red-500/10 p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(financeData?.unpaidAmount || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Outstanding</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">YTD Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {formatCurrency(financeData?.revenueYtd || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-muted-foreground">Total Expenses</span>
                  <span className="text-xl font-bold text-red-600">
                    {formatCurrency(financeData?.expensesYtd || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">Net Profit</span>
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(financeData?.profitYtd || 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="defaulters" className="mt-6">
          {schoolId ? <FeeDefaultersReport schoolId={schoolId} /> : null}
        </TabsContent>

        <TabsContent value="forecast" className="mt-6">
          <SalaryBudgetForecast />
        </TabsContent>
      </Tabs>
    </div>
  );
}
