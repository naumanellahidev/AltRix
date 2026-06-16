import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  CreditCard,
  Coins,
  BarChart3,
  Users,
  Calendar,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Wallet,
  Receipt,
  PiggyBank,
  Zap,
  Target,
  Activity,
  Shield,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  Building2,
  GraduationCap,
  Briefcase,
  Eye,
  Download,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SalaryComparisonChart } from "@/components/accountant/SalaryComparisonChart";
import { SalaryBudgetForecast } from "@/components/accountant/SalaryBudgetForecast";
import { StudentFeeTracker } from "@/components/accountant/StudentFeeTracker";
import { FinancialReportGenerator } from "@/components/accountant/FinancialReportGenerator";
import { FeeDefaultersReport } from "@/components/accountant/FeeDefaultersReport";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const MotionCard = motion.create(Card);

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const formatCompact = (n: number) => {
  const sign = n < 0 ? "-" : "";
  return sign + "Rs. " + compactFormatter.format(Math.abs(n));
};

export function AccountantHomeModule() {
  const { schoolSlug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [activeTab, setActiveTab] = useState("overview");

  // Invalidate all finance queries on realtime changes
  const invalidateFinanceQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["finance_invoices_home"] });
    queryClient.invalidateQueries({ queryKey: ["finance_payments_home"] });
    queryClient.invalidateQueries({ queryKey: ["finance_expenses_home"] });
    queryClient.invalidateQueries({ queryKey: ["hr_pay_runs_home"] });
    queryClient.invalidateQueries({ queryKey: ["hr_salary_records_home"] });
    queryClient.invalidateQueries({ queryKey: ["fee_invoices"] });
    queryClient.invalidateQueries({ queryKey: ["fee_payments"] });
  }, [queryClient]);

  // Real-time subscriptions for all finance tables
  useRealtimeTable({
    channel: `home-invoices-${schoolId}`,
    table: "fee_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  useRealtimeTable({
    channel: `home-payments-${schoolId}`,
    table: "fee_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  useRealtimeTable({
    channel: `home-expenses-${schoolId}`,
    table: "finance_expenses",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  useRealtimeTable({
    channel: `home-pay-runs-${schoolId}`,
    table: "hr_pay_runs",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  // Fetch all financial data
  const { data: invoices = [] } = useQuery({
    queryKey: ["finance_invoices_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("id, total:total_amount, status, issue_date:created_at, due_date, student_id")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["finance_payments_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, amount, paid_at, invoice_id")
        .eq("school_id", schoolId!)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["finance_expenses_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_expenses")
        .select("id, amount, expense_date, category, description")
        .eq("school_id", schoolId!)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: payRuns = [] } = useQuery({
    queryKey: ["hr_pay_runs_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_pay_runs")
        .select("id, period_start, period_end, gross_amount, net_amount, status, paid_at, created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  const { data: salaryRecords = [] } = useQuery({
    queryKey: ["hr_salary_records_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_salary_records")
        .select("id, user_id, base_salary, allowances, deductions, is_active")
        .eq("school_id", schoolId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        allowances: r.allowances || 0,
        deductions: r.deductions || 0,
      }));
    },
    enabled: !!schoolId,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students_count_home", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolId,
  });

  // Calculate comprehensive stats
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    // Revenue calculations
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const thisMonthRevenue = payments
      .filter((p) => new Date(p.paid_at) >= thisMonth)
      .reduce((sum, p) => sum + p.amount, 0);
    const lastMonthRevenue = payments
      .filter((p) => {
        const date = new Date(p.paid_at);
        return date >= lastMonth && date <= lastMonthEnd;
      })
      .reduce((sum, p) => sum + p.amount, 0);
    const twoMonthsAgoRevenue = payments
      .filter((p) => {
        const date = new Date(p.paid_at);
        return date >= twoMonthsAgo && date < lastMonth;
      })
      .reduce((sum, p) => sum + p.amount, 0);
    
    const revenueGrowth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    const revenueTrend = twoMonthsAgoRevenue > 0 ? ((lastMonthRevenue - twoMonthsAgoRevenue) / twoMonthsAgoRevenue) * 100 : 0;

    // Expense calculations
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const thisMonthExpenses = expenses
      .filter((e) => new Date(e.expense_date) >= thisMonth)
      .reduce((sum, e) => sum + e.amount, 0);
    const lastMonthExpenses = expenses
      .filter((e) => {
        const date = new Date(e.expense_date);
        return date >= lastMonth && date <= lastMonthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);
    const expenseGrowth = lastMonthExpenses > 0 ? ((thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses) * 100 : 0;

    // Invoice analytics
    const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);
    const paidInvoices = invoices.filter((i) => i.status === "paid");
    const overdueInvoices = invoices.filter((i) => i.status === "overdue" || (i.status === "sent" && new Date(i.due_date) < now));
    const pendingInvoices = invoices.filter((i) => i.status === "sent" || i.status === "draft");
    const collectionRate = totalInvoiced > 0 ? (totalRevenue / totalInvoiced) * 100 : 0;
    const avgInvoiceValue = invoices.length > 0 ? totalInvoiced / invoices.length : 0;

    // Payroll analytics
    const monthlyPayroll = salaryRecords.reduce((sum, s) => sum + s.base_salary + s.allowances - s.deductions, 0);
    const annualPayrollProjection = monthlyPayroll * 12;
    const completedPayRuns = payRuns.filter((p) => p.status === "completed").length;
    const pendingPayRuns = payRuns.filter((p) => p.status === "draft" || p.status === "processing").length;
    const avgSalary = salaryRecords.length > 0 ? monthlyPayroll / salaryRecords.length : 0;

    // Profitability
    const grossProfit = totalRevenue - totalExpenses;
    const netProfit = grossProfit - (monthlyPayroll * completedPayRuns);
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    
    // Cash position estimate
    const cashPosition = totalRevenue - totalExpenses - payRuns.filter(p => p.status === "completed").reduce((sum, p) => sum + (p.net_amount || 0), 0);

    // Student metrics
    const revenuePerStudent = students.length > 0 ? totalRevenue / students.length : 0;
    const costPerStudent = students.length > 0 ? (totalExpenses + monthlyPayroll) / students.length : 0;

    return {
      totalRevenue,
      thisMonthRevenue,
      lastMonthRevenue,
      revenueGrowth,
      revenueTrend,
      totalExpenses,
      thisMonthExpenses,
      expenseGrowth,
      totalInvoiced,
      paidInvoices: paidInvoices.length,
      overdueInvoices: overdueInvoices.length,
      overdueAmount: overdueInvoices.reduce((sum, i) => sum + i.total, 0),
      pendingInvoices: pendingInvoices.length,
      pendingAmount: pendingInvoices.reduce((sum, i) => sum + i.total, 0),
      collectionRate,
      avgInvoiceValue,
      monthlyPayroll,
      annualPayrollProjection,
      activeEmployees: salaryRecords.length,
      completedPayRuns,
      pendingPayRuns,
      avgSalary,
      grossProfit,
      netProfit,
      profitMargin,
      cashPosition,
      totalStudents: students.length,
      revenuePerStudent,
      costPerStudent,
    };
  }, [payments, expenses, invoices, payRuns, salaryRecords, students]);

  // Financial Health Score (0-100)
  const financialHealth = useMemo(() => {
    let score = 50; // Base score
    
    // Collection rate impact (0-25 points)
    score += Math.min(stats.collectionRate * 0.25, 25);
    
    // Profitability impact (-15 to +15 points)
    if (stats.profitMargin > 20) score += 15;
    else if (stats.profitMargin > 10) score += 10;
    else if (stats.profitMargin > 0) score += 5;
    else if (stats.profitMargin > -10) score -= 5;
    else score -= 15;
    
    // Revenue growth impact (-10 to +10 points)
    if (stats.revenueGrowth > 10) score += 10;
    else if (stats.revenueGrowth > 0) score += 5;
    else if (stats.revenueGrowth > -10) score -= 5;
    else score -= 10;
    
    // Overdue invoices impact (0 to -10 points)
    const overdueRatio = stats.overdueInvoices / Math.max(invoices.length, 1);
    score -= overdueRatio * 10;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [stats, invoices]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-blue-600";
    if (score >= 60) return "text-blue-400";
    if (score >= 40) return "text-amber-500";
    return "text-rose-500";
  };

  const getHealthLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Attention";
  };

  // Cash flow trend (last 30 days)
  const cashFlowData = useMemo(() => {
    const dataMap = new Map<string, { date: string; revenue: number; expenses: number; net: number }>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    payments
      .filter((p) => new Date(p.paid_at) >= thirtyDaysAgo)
      .forEach((p) => {
        const date = new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const existing = dataMap.get(date) || { date, revenue: 0, expenses: 0, net: 0 };
        existing.revenue += p.amount;
        existing.net = existing.revenue - existing.expenses;
        dataMap.set(date, existing);
      });

    expenses
      .filter((e) => new Date(e.expense_date) >= thirtyDaysAgo)
      .forEach((e) => {
        const date = new Date(e.expense_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const existing = dataMap.get(date) || { date, revenue: 0, expenses: 0, net: 0 };
        existing.expenses += e.amount;
        existing.net = existing.revenue - existing.expenses;
        dataMap.set(date, existing);
      });

    return Array.from(dataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [payments, expenses]);

  // Expense breakdown
  const expenseBreakdown = useMemo(() => {
    const categoryMap = new Map<string, number>();
    expenses.forEach((e) => {
      const current = categoryMap.get(e.category) || 0;
      categoryMap.set(e.category, current + e.amount);
    });
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        percentage: stats.totalExpenses > 0 ? (value / stats.totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [expenses, stats.totalExpenses]);

  // Revenue vs Expense monthly comparison
  const monthlyComparison = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const monthName = monthStart.toLocaleDateString("en-US", { month: "short" });
      
      const monthRevenue = payments
        .filter((p) => {
          const date = new Date(p.paid_at);
          return date >= monthStart && date <= monthEnd;
        })
        .reduce((sum, p) => sum + p.amount, 0);
      
      const monthExpenses = expenses
        .filter((e) => {
          const date = new Date(e.expense_date);
          return date >= monthStart && date <= monthEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
      
      months.push({
        month: monthName,
        revenue: monthRevenue,
        expenses: monthExpenses,
        profit: monthRevenue - monthExpenses,
      });
    }
    
    return months;
  }, [payments, expenses]);

  // Recent activity with more details
  const recentActivity = useMemo(() => {
    const activities: { type: string; description: string; amount: number; date: Date; icon: any; category?: string }[] = [];

    payments.slice(0, 8).forEach((p) => {
      activities.push({
        type: "payment",
        description: "Payment received",
        amount: p.amount,
        date: new Date(p.paid_at),
        icon: CreditCard,
      });
    });

    expenses.slice(0, 8).forEach((e) => {
      activities.push({
        type: "expense",
        description: e.description || e.category.replace(/_/g, " "),
        amount: -e.amount,
        date: new Date(e.expense_date),
        icon: Receipt,
        category: e.category,
      });
    });

    return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
  }, [payments, expenses]);

  // AI-powered insights
  const insights = useMemo(() => {
    const list: { type: "success" | "warning" | "danger" | "info"; title: string; description: string; icon: any }[] = [];

    // Collection rate insight
    if (stats.collectionRate < 70) {
      list.push({
        type: "danger",
        title: "Low Collection Rate",
        description: `Only ${stats.collectionRate.toFixed(1)}% of invoiced amount has been collected. Consider sending payment reminders.`,
        icon: AlertTriangle,
      });
    } else if (stats.collectionRate >= 90) {
      list.push({
        type: "success",
        title: "Excellent Collections",
        description: `${stats.collectionRate.toFixed(1)}% collection rate shows strong payment follow-up.`,
        icon: CheckCircle,
      });
    }

    // Overdue invoices insight
    if (stats.overdueInvoices > 5) {
      list.push({
        type: "warning",
        title: `${stats.overdueInvoices} Overdue Invoices`,
        description: `Outstanding amount of Rs. ${stats.overdueAmount.toLocaleString()} needs immediate attention.`,
        icon: Clock,
      });
    }

    // Revenue trend insight
    if (stats.revenueGrowth > 10) {
      list.push({
        type: "success",
        title: "Revenue Growing",
        description: `Revenue increased by ${stats.revenueGrowth.toFixed(1)}% compared to last month.`,
        icon: TrendingUp,
      });
    } else if (stats.revenueGrowth < -10) {
      list.push({
        type: "warning",
        title: "Revenue Declining",
        description: `Revenue decreased by ${Math.abs(stats.revenueGrowth).toFixed(1)}% compared to last month.`,
        icon: TrendingDown,
      });
    }

    // Expense insight
    if (stats.expenseGrowth > 20) {
      list.push({
        type: "warning",
        title: "Expenses Increasing",
        description: `Expenses grew ${stats.expenseGrowth.toFixed(1)}% this month. Review spending categories.`,
        icon: AlertCircle,
      });
    }

    // Profit insight
    if (stats.profitMargin > 15) {
      list.push({
        type: "success",
        title: "Strong Profitability",
        description: `Profit margin of ${stats.profitMargin.toFixed(1)}% indicates healthy financial performance.`,
        icon: Target,
      });
    } else if (stats.profitMargin < 0) {
      list.push({
        type: "danger",
        title: "Operating at Loss",
        description: `Current margin is ${stats.profitMargin.toFixed(1)}%. Review costs and revenue sources.`,
        icon: AlertTriangle,
      });
    }

    // Payroll insight
    if (stats.pendingPayRuns > 0) {
      list.push({
        type: "info",
        title: `${stats.pendingPayRuns} Pending Pay Runs`,
        description: "Review and process pending payroll before due date.",
        icon: Coins,
      });
    }

    return list.slice(0, 4);
  }, [stats]);

  const quickActions = [
    { label: "Record Payment", icon: CreditCard, path: `/${schoolSlug}/accountant/payments`, color: "bg-blue-50 text-blue-600 border border-blue-100/50" },
    { label: "Add Expense", icon: TrendingDown, path: `/${schoolSlug}/accountant/expenses`, color: "bg-rose-50 text-rose-600 border border-rose-100/30" },
    { label: "Create Invoice", icon: FileText, path: `/${schoolSlug}/accountant/invoices`, color: "bg-blue-50 text-blue-600 border border-blue-100/50" },
    { label: "Run Payroll", icon: Coins, path: `/${schoolSlug}/accountant/payroll`, color: "bg-blue-50 text-blue-600 border border-blue-100/50" },
    { label: "View Reports", icon: BarChart3, path: `/${schoolSlug}/accountant/reports`, color: "bg-blue-50 text-blue-600 border border-blue-100/50" },
    { label: "Manage Fees", icon: DollarSign, path: `/${schoolSlug}/accountant/fees`, color: "bg-blue-50 text-blue-600 border border-blue-100/50" },
  ];

  const healthChartData = [
    { 
      name: "Health", 
      value: financialHealth, 
      fill: financialHealth >= 80 
        ? "rgb(37, 99, 235)" 
        : financialHealth >= 60 
        ? "rgb(96, 165, 250)" 
        : financialHealth >= 40 
        ? "rgb(245, 158, 11)" 
        : "rgb(239, 68, 68)" 
    }
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="salary" className="gap-2">
            <Users className="h-4 w-4" /> Salary Analysis
          </TabsTrigger>
          <TabsTrigger value="budget" className="gap-2">
            <Target className="h-4 w-4" /> Budget Forecast
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-2">
            <GraduationCap className="h-4 w-4" /> Student Fees
          </TabsTrigger>
          <TabsTrigger value="defaulters" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Defaulters
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <Download className="h-4 w-4" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Financial Health Score + Quick Stats */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
            {/* Health Score Card */}
            <MotionCard 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="shadow-elevated bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 shadow-sm shadow-blue-50/50 min-w-0 rounded-2xl"
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-slate-800">
                  <Shield className="h-5 w-5 text-blue-600 shrink-0" />
                  <span className="truncate">Financial Health</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center">
                  <div className="relative h-[120px] w-[120px] sm:h-[140px] sm:w-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        cx="50%"
                        cy="50%"
                        innerRadius="70%"
                        outerRadius="100%"
                        data={healthChartData}
                        startAngle={180}
                        endAngle={0}
                      >
                        <RadialBar
                          background={{ fill: "rgba(219, 234, 254, 0.5)" }}
                          dataKey="value"
                          cornerRadius={10}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold ${getHealthColor(financialHealth)}`}>
                        {financialHealth}
                      </span>
                      <span className="text-xs text-muted-foreground">{getHealthLabel(financialHealth)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">Collection Rate</span>
                    <span className="font-semibold text-slate-700 shrink-0">{stats.collectionRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">Profit Margin</span>
                    <span className={`font-semibold shrink-0 ${stats.profitMargin >= 0 ? "text-blue-600" : "text-rose-500"}`}>
                      {stats.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground truncate">Overdue Rate</span>
                    <span className={`font-semibold shrink-0 ${stats.overdueInvoices === 0 ? "text-blue-600" : "text-rose-500"}`}>
                      {invoices.length > 0 ? ((stats.overdueInvoices / invoices.length) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </MotionCard>

            {/* Key Metrics Grid */}
            <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0 w-full">
              <MotionCard 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl min-w-0 group"
                onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}
              >
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50 p-2.5 shrink-0">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    {stats.revenueGrowth !== 0 ? (
                      <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${stats.revenueGrowth > 0 ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600"}`}>
                        {stats.revenueGrowth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(stats.revenueGrowth).toFixed(1)}%
                      </div>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-blue-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                    )}
                  </div>
                  <div className="mt-4">
                    <p className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight truncate" title={stats.totalRevenue.toLocaleString()}>{formatCompact(stats.totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1 truncate">Total Revenue</p>
                  </div>
                </CardContent>
              </MotionCard>

              <MotionCard 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl min-w-0 group"
                onClick={() => navigate(`/${schoolSlug}/accountant/expenses`)}
              >
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="rounded-xl bg-rose-50 text-rose-600 border border-rose-100/30 p-2.5 shrink-0">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    {stats.expenseGrowth !== 0 ? (
                      <div className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${stats.expenseGrowth > 0 ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"}`}>
                        {stats.expenseGrowth > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(stats.expenseGrowth).toFixed(1)}%
                      </div>
                    ) : (
                      <ArrowRight className="h-4 w-4 text-blue-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                    )}
                  </div>
                  <div className="mt-4">
                    <p className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight truncate" title={stats.totalExpenses.toLocaleString()}>{formatCompact(stats.totalExpenses)}</p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1 truncate">Total Expenses</p>
                  </div>
                </CardContent>
              </MotionCard>

              <MotionCard 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl min-w-0 group"
                onClick={() => navigate(`/${schoolSlug}/accountant/payroll`)}
              >
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50 p-2.5 shrink-0">
                      <Coins className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-blue-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <div className="mt-4">
                    <p className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight truncate" title={stats.monthlyPayroll.toLocaleString()}>{formatCompact(stats.monthlyPayroll)}</p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider truncate">Monthly Payroll</p>
                      <p className="text-[10px] text-blue-500 font-bold bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0 truncate">{stats.activeEmployees} staff</p>
                    </div>
                  </div>
                </CardContent>
              </MotionCard>

              <MotionCard 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl min-w-0 group"
                onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}
              >
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50 p-2.5 shrink-0">
                      <PiggyBank className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-blue-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <div className="mt-4">
                    <p className={`text-xl sm:text-2xl font-black tracking-tight truncate ${stats.netProfit >= 0 ? "text-blue-600" : "text-rose-600"}`} title={stats.netProfit.toLocaleString()}>
                      {stats.netProfit >= 0 ? "+" : ""}{formatCompact(stats.netProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1 truncate">Net Profit</p>
                  </div>
                </CardContent>
              </MotionCard>
            </div>
          </div>


          {/* Quick Actions */}
          <Card className="shadow-elevated overflow-hidden">
            <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Quick Actions</span>
                </div>
              </div>
            </div>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {quickActions.map((action, idx) => (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Button
                      variant="outline"
                      className="flex h-auto w-full flex-col items-center gap-2 border-dashed bg-background p-4 hover:border-solid hover:border-primary/50"
                      onClick={() => navigate(action.path)}
                    >
                      <div className={`rounded-lg p-2 ${action.color}`}>
                        <action.icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-center">{action.label}</span>
                    </Button>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights + Alerts */}
          {insights.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {insights.map((insight, idx) => (
                <MotionCard
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`shadow-elevated border-l-4 ${
                    insight.type === "success" ? "border-l-primary" :
                    insight.type === "warning" ? "border-l-warning" :
                    insight.type === "danger" ? "border-l-destructive" :
                    "border-l-chart-2"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${
                        insight.type === "success" ? "bg-primary/10 text-primary" :
                        insight.type === "warning" ? "bg-warning/10 text-warning" :
                        insight.type === "danger" ? "bg-destructive/10 text-destructive" :
                        "bg-chart-2/10 text-chart-2"
                      }`}>
                        <insight.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{insight.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{insight.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </MotionCard>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-5 min-w-0">
            {/* Cash Flow Chart */}
            <Card className="shadow-sm bg-gradient-to-br from-white to-blue-50/10 border border-blue-100/80 rounded-2xl lg:col-span-3 min-w-0 overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-blue-50/60 bg-blue-50/20 px-6 py-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800">Cash Flow (Last 30 Days)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Daily revenue vs expenses</p>
                </div>
                <Button variant="ghost" size="sm" className="rounded-xl border border-blue-100 text-blue-600 hover:bg-blue-50/50 text-xs" onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Details
                </Button>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-[280px]">
                  {cashFlowData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={cashFlowData}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgb(37, 99, 235)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="rgb(37, 99, 235)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `Rs. ${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(value: number) => "Rs. " + value.toLocaleString()}
                          contentStyle={{ borderRadius: "0.75rem", border: "1px solid rgb(219, 234, 254)", background: "white", fontSize: "11px" }}
                        />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="rgb(37, 99, 235)" fill="url(#revenueGradient)" strokeWidth={2} />
                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="rgb(244, 63, 94)" fill="url(#expenseGradient)" strokeWidth={2} />
                        <Line type="monotone" dataKey="net" name="Net" stroke="rgb(14, 165, 233)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Activity className="mx-auto h-12 w-12 text-muted-foreground/30" />
                        <p className="mt-2 text-xs">No cashflow data for this period</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="shadow-sm bg-gradient-to-br from-white to-blue-50/10 border border-blue-100/80 rounded-2xl lg:col-span-2 overflow-hidden">
              <CardHeader className="pb-2 border-b border-blue-50/60 bg-blue-50/20 px-6 py-4">
                <CardTitle className="text-base font-bold text-slate-800">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <ScrollArea className="h-[280px] pr-2">
                  <div className="space-y-2.5">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((activity, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex items-center gap-3 rounded-xl border border-blue-50 bg-white/60 p-3 hover:bg-blue-50/20 hover:border-blue-100 transition-all duration-200"
                        >
                          <div className={`rounded-xl p-2 shrink-0 ${activity.amount > 0 ? "bg-blue-50 text-blue-600 border border-blue-100/40" : "bg-rose-50 text-rose-600 border border-rose-100/20"}`}>
                            <activity.icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{activity.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {activity.date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <p className={`text-xs font-bold tabular-nums shrink-0 ${activity.amount > 0 ? "text-blue-600" : "text-rose-500"}`}>
                            {activity.amount > 0 ? "+Rs. " : "-Rs. "}{Math.abs(activity.amount).toLocaleString()}
                          </p>
                        </motion.div>
                      ))
                    ) : (
                      <div className="flex h-full items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">No recent activity found</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            {/* Invoice Status */}
            <Card 
              className="shadow-sm bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/invoices`)}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800">Invoices</CardTitle>
                <ArrowRight className="h-4 w-4 text-blue-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5">
                <div className="text-center bg-blue-50/30 p-2.5 rounded-xl border border-blue-50/50">
                  <p className="text-lg font-black text-blue-600 tabular-nums">Rs. {stats.pendingAmount.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Pending Amount</p>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Paid Invoices</span>
                    <span className="font-bold text-slate-700">{stats.paidInvoices}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Pending Invoices</span>
                    <span className="font-bold text-slate-700">{stats.pendingInvoices}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Overdue Invoices</span>
                    <span className="font-bold text-rose-500">{stats.overdueInvoices}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payroll Summary */}
            <Card 
              className="shadow-sm bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/payroll`)}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800">Payroll</CardTitle>
                <ArrowRight className="h-4 w-4 text-blue-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5">
                <div className="text-center bg-blue-50/30 p-2.5 rounded-xl border border-blue-50/50">
                  <p className="text-lg font-black text-blue-600 tabular-nums">Rs. {stats.monthlyPayroll.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Monthly Cost</p>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Active Employees</span>
                    <span className="font-bold text-slate-700">{stats.activeEmployees}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Average Salary</span>
                    <span className="font-bold text-slate-700">Rs. {Math.round(stats.avgSalary).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Pending Pay Runs</span>
                    <span className={`font-bold ${stats.pendingPayRuns > 0 ? "text-amber-600" : "text-slate-700"}`}>{stats.pendingPayRuns}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* School Metrics */}
            <Card 
              className="shadow-sm bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/fees`)}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800">School Metrics</CardTitle>
                <ArrowRight className="h-4 w-4 text-blue-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5">
                <div className="text-center bg-blue-50/30 p-2.5 rounded-xl border border-blue-50/50">
                  <p className="text-lg font-black text-blue-600 tabular-nums">{stats.totalStudents}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Total Students</p>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Revenue per Student</span>
                    <span className="font-bold text-slate-700">Rs. {Math.round(stats.revenuePerStudent).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Cost per Student</span>
                    <span className="font-bold text-slate-700">Rs. {Math.round(stats.costPerStudent).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Estimated Margin</span>
                    <span className={`font-bold ${stats.profitMargin >= 0 ? "text-blue-600" : "text-rose-500"}`}>{stats.profitMargin.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cash Position */}
            <Card 
              className="shadow-sm bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer rounded-2xl group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/finance`)}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-800">Cash Position</CardTitle>
                <ArrowRight className="h-4 w-4 text-blue-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5">
                <div className="text-center bg-blue-50/30 p-2.5 rounded-xl border border-blue-50/50">
                  <p className="text-lg font-black text-blue-600 tabular-nums">Rs. {stats.cashPosition.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Estimated Balance</p>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Gross Profit</span>
                    <span className="font-bold text-slate-700">Rs. {stats.grossProfit.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b border-blue-50/40 pb-1.5">
                    <span className="text-muted-foreground">Annual Payroll Projection</span>
                    <span className="font-bold text-slate-700">Rs. {stats.annualPayrollProjection.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Expenses</span>
                    <span className="font-bold text-rose-500">Rs. {stats.totalExpenses.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {/* Monthly Comparison Chart */}
          <Card className="shadow-elevated overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg">6-Month Revenue vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={monthlyComparison}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 10 }} 
                      axisLine={false}
                      tickLine={false}
                      height={30}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }} 
                      tickFormatter={(v) => `Rs. ${(v / 1000).toFixed(0)}K`} 
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip 
                      formatter={(value: number) => "Rs. " + value.toLocaleString()}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2 min-w-0">
            {/* Expense Breakdown */}
            <Card className="shadow-elevated overflow-hidden min-w-0">
              <CardHeader>
                <CardTitle className="text-lg">Expense Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          labelLine={false}
                        >
                          {expenseBreakdown.map((entry, index) => (
                            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => "Rs. " + value.toLocaleString()}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {expenseBreakdown.map((item, idx) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="flex-1 text-sm truncate">{item.name}</span>
                        <span className="text-sm font-medium">{item.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Financial Ratios */}
            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="text-lg">Financial Ratios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Collection Efficiency</span>
                    <span className="font-medium">{stats.collectionRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={Math.min(stats.collectionRate, 100)} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Profit Margin</span>
                    <span className={`font-medium ${stats.profitMargin >= 0 ? "text-primary" : "text-destructive"}`}>
                      {stats.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <Progress value={Math.max(0, Math.min(stats.profitMargin + 50, 100))} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Expense Ratio</span>
                    <span className="font-medium">
                      {stats.totalRevenue > 0 ? ((stats.totalExpenses / stats.totalRevenue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={stats.totalRevenue > 0 ? Math.min((stats.totalExpenses / stats.totalRevenue) * 100, 100) : 0} 
                    className="h-2" 
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="text-center rounded-lg bg-accent p-3">
                    <p className="text-2xl font-bold">Rs. {stats.avgInvoiceValue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Avg Invoice Value</p>
                  </div>
                  <div className="text-center rounded-lg bg-accent p-3">
                    <p className="text-2xl font-bold">{invoices.length}</p>
                    <p className="text-xs text-muted-foreground">Total Invoices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="salary">
          <SalaryComparisonChart />
        </TabsContent>

        <TabsContent value="budget">
          <SalaryBudgetForecast />
        </TabsContent>

        <TabsContent value="fees">
          {schoolId && <StudentFeeTracker schoolId={schoolId} />}
        </TabsContent>

        <TabsContent value="defaulters">
          {schoolId && <FeeDefaultersReport schoolId={schoolId} />}
        </TabsContent>

        <TabsContent value="reports">
          {schoolId && <FinancialReportGenerator schoolId={schoolId} schoolName={schoolSlug} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
