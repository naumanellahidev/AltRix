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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-md border border-blue-100/80 p-4 rounded-2xl shadow-[0_10px_30px_rgba(8,112,184,0.08)]">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-6 text-xs">
              <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.stroke }} />
                {entry.name}
              </span>
              <span className="font-extrabold text-slate-800">Rs. {entry.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 lg:space-y-6">
        <div className="-mx-1 overflow-x-auto no-scrollbar">
          <TabsList className="inline-flex w-max min-w-full gap-1 p-1">
            <TabsTrigger value="overview" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Overview
            </TabsTrigger>
            <TabsTrigger value="analytics" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="salary" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Salary Analysis
            </TabsTrigger>
            <TabsTrigger value="budget" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Budget Forecast
            </TabsTrigger>
            <TabsTrigger value="fees" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Student Fees
            </TabsTrigger>
            <TabsTrigger value="defaulters" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Defaulters
            </TabsTrigger>
            <TabsTrigger value="reports" className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap">
              Reports
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Financial Health Score + Quick Stats */}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)]">
            {/* Health Score Card */}
            <Card className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Financial Health</span>
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Shield className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center mt-4">
                    <div className="relative h-[110px] w-[180px] flex items-center justify-center">
                      <svg viewBox="0 0 120 70" className="w-full h-full">
                        <defs>
                          <linearGradient id="healthGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="hsl(var(--destructive))" />
                            <stop offset="50%" stopColor="hsl(var(--warning))" />
                            <stop offset="100%" stopColor="hsl(var(--primary))" />
                          </linearGradient>
                        </defs>
                        {/* Background Track Arc */}
                        <path
                          d="M 15 60 A 45 45 0 0 1 105 60"
                          fill="none"
                          stroke="currentColor"
                          className="text-muted/20"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                        {/* Value Arc */}
                        <path
                          d="M 15 60 A 45 45 0 0 1 105 60"
                          fill="none"
                          stroke="url(#healthGaugeGradient)"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray="141"
                          strokeDashoffset={141 - (141 * Math.min(financialHealth, 100)) / 100}
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-x-0 bottom-2 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-extrabold tracking-tight ${getHealthColor(financialHealth)}`}>
                          {financialHealth}
                        </span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{getHealthLabel(financialHealth)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center gap-2 text-xs border-b pb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="text-muted-foreground font-medium truncate">Collection Rate</span>
                    </div>
                    <span className="font-semibold text-foreground shrink-0">{stats.collectionRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-xs border-b pb-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <div className={`h-1.5 w-1.5 rounded-full ${stats.profitMargin >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span className="text-muted-foreground font-medium truncate">Profit Margin</span>
                    </div>
                    <span className={`font-semibold shrink-0 ${stats.profitMargin >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {stats.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <div className={`h-1.5 w-1.5 rounded-full ${stats.overdueInvoices === 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span className="text-muted-foreground font-medium truncate">Overdue Rate</span>
                    </div>
                    <span className={`font-semibold shrink-0 ${stats.overdueInvoices === 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {invoices.length > 0 ? ((stats.overdueInvoices / invoices.length) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Key Metrics Grid */}
            <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 min-w-0 w-full">
              {/* Card 1: Total Revenue */}
              <Card 
                className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
                onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Total Revenue</span>
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                        <span>{formatCompact(stats.totalRevenue)}</span>
                        <ArrowRight className="h-4 w-4 text-primary opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                      </h3>
                      {stats.revenueGrowth !== 0 && (
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                          {stats.revenueGrowth > 0 ? (
                            <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-rose-500" />
                          )}
                          <span>{Math.abs(stats.revenueGrowth).toFixed(1)}% vs last month</span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Total Expenses */}
              <Card 
                className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
                onClick={() => navigate(`/${schoolSlug}/accountant/expenses`)}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Total Expenses</span>
                      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                        <TrendingDown className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                        <span>{formatCompact(stats.totalExpenses)}</span>
                        <ArrowRight className="h-4 w-4 text-rose-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                      </h3>
                      {stats.expenseGrowth !== 0 && (
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                          {stats.expenseGrowth > 0 ? (
                            <ArrowUpRight className="h-3 w-3 text-rose-500" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 text-emerald-500" />
                          )}
                          <span>{Math.abs(stats.expenseGrowth).toFixed(1)}% vs last month</span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Monthly Payroll */}
              <Card 
                className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
                onClick={() => navigate(`/${schoolSlug}/accountant/payroll`)}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Monthly Payroll</span>
                      <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                        <Coins className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                        <span>{formatCompact(stats.monthlyPayroll)}</span>
                        <ArrowRight className="h-4 w-4 text-violet-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stats.activeEmployees} active staff
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card 4: Net Profit */}
              <Card 
                className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
                onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}
              >
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Net Profit</span>
                      <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                        <PiggyBank className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-4">
                      <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                        <span>{stats.netProfit >= 0 ? "+" : ""}{formatCompact(stats.netProfit)}</span>
                        <ArrowRight className="h-4 w-4 text-emerald-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Profit margin: {stats.profitMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Quick Actions */}
          <Card className="bg-surface shadow-elevated border overflow-hidden rounded-3xl relative">
            <div className="px-6 py-4.5 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-4 w-4" />
                </div>
                <span className="font-semibold text-sm text-foreground">Quick Actions Console</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-bold text-primary bg-primary/5 border-primary/20">OPERATIONAL</Badge>
            </div>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
                {quickActions.map((action) => (
                  <div key={action.label} className="group">
                    <button
                      className="flex h-full w-full flex-col justify-between items-start text-left border bg-card p-5 rounded-2xl hover:border-primary hover:shadow-md transition-all duration-300 relative overflow-hidden"
                      onClick={() => navigate(action.path)}
                    >
                      <div className="flex justify-between items-center w-full mb-4">
                        <div className={`rounded-xl p-2.5 ${action.color}`}>
                          <action.icon className="h-4.5 w-4.5" />
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-foreground tracking-tight block uppercase">{action.label}</span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights + Alerts */}
          {insights.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {insights.map((insight, idx) => (
                <Card
                  key={idx}
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
                </Card>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-5 min-w-0">
            {/* Cash Flow Chart */}
            <Card className="bg-surface shadow-elevated border rounded-3xl lg:col-span-3 min-w-0 overflow-hidden relative">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b px-6 py-5">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold text-foreground">Cash Flow Analytics</CardTitle>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                      <span className="h-1 w-1 rounded-full bg-primary animate-pulse" /> Live Sync
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Daily cash inflow vs operational outflow (30 days)</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-xl border-muted-foreground/20 hover:bg-muted/50 transition-colors text-xs font-semibold px-3" onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}>
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
                            <stop offset="0%" stopColor="rgb(37, 99, 235)" stopOpacity={0.15} />
                            <stop offset="100%" stopColor="rgb(37, 99, 235)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 600 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 600 }} tickFormatter={(v) => `Rs. ${(v / 1000).toFixed(0)}K`} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="rgb(37, 99, 235)" fill="url(#revenueGradient)" strokeWidth={2.5} />
                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="rgb(244, 63, 94)" fill="url(#expenseGradient)" strokeWidth={2.5} />
                        <Line type="monotone" dataKey="net" name="Net" stroke="rgb(16, 185, 129)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
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
            <Card className="bg-surface shadow-elevated border rounded-3xl lg:col-span-2 overflow-hidden relative">
              <CardHeader className="pb-3 border-b px-6 py-5">
                <CardTitle className="text-base font-bold text-foreground">Recent Transactions</CardTitle>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">Real-time ledger audit trail</p>
              </CardHeader>
              <CardContent className="p-6">
                <ScrollArea className="h-[280px] pr-2">
                  <div className="space-y-3">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((activity, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                        >
                          <div className={`rounded-xl p-2 shrink-0 ${activity.amount > 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            <activity.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{activity.description}</p>
                            <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                              {activity.date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          <p className={`text-xs font-extrabold tabular-nums shrink-0 ${activity.amount > 0 ? "text-primary" : "text-destructive"}`}>
                            {activity.amount > 0 ? "+Rs. " : "-Rs. "}{Math.abs(activity.amount).toLocaleString()}
                          </p>
                        </div>
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
              className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/invoices`)}
            >
              <CardHeader className="pb-2 pt-5 px-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">Invoices</CardTitle>
                <div className="p-1 rounded-lg bg-primary/10 text-primary opacity-60 group-hover:opacity-100 group-hover:bg-primary/20 transition-all duration-300">
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5 px-6">
                <div className="text-center bg-primary/10 border border-primary/20 p-3.5 rounded-2xl">
                  <p className="text-lg font-black text-primary tabular-nums">Rs. {stats.pendingAmount.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Pending Amount</p>
                </div>
                <div className="space-y-3 px-1">
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Paid Invoices</span>
                    <span className="font-semibold text-foreground">{stats.paidInvoices}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Pending Invoices</span>
                    <span className="font-semibold text-foreground">{stats.pendingInvoices}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Overdue Invoices</span>
                    <span className="font-semibold text-destructive">{stats.overdueInvoices}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payroll Summary */}
            <Card 
              className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/payroll`)}
            >
              <CardHeader className="pb-2 pt-5 px-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">Payroll</CardTitle>
                <div className="p-1 rounded-lg bg-primary/10 text-primary opacity-60 group-hover:opacity-100 group-hover:bg-primary/20 transition-all duration-300">
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5 px-6">
                <div className="text-center bg-primary/10 border border-primary/20 p-3.5 rounded-2xl">
                  <p className="text-lg font-black text-primary tabular-nums">Rs. {stats.monthlyPayroll.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Monthly Cost</p>
                </div>
                <div className="space-y-3 px-1">
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Active Employees</span>
                    <span className="font-semibold text-foreground">{stats.activeEmployees}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Average Salary</span>
                    <span className="font-semibold text-foreground">Rs. {Math.round(stats.avgSalary).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Pending Pay Runs</span>
                    <span className={`font-semibold ${stats.pendingPayRuns > 0 ? "text-warning" : "text-foreground"}`}>{stats.pendingPayRuns}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* School Metrics */}
            <Card 
              className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/fees`)}
            >
              <CardHeader className="pb-2 pt-5 px-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">School Metrics</CardTitle>
                <div className="p-1 rounded-lg bg-primary/10 text-primary opacity-60 group-hover:opacity-100 group-hover:bg-primary/20 transition-all duration-300">
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5 px-6">
                <div className="text-center bg-primary/10 border border-primary/20 p-3.5 rounded-2xl">
                  <p className="text-lg font-black text-primary tabular-nums">{stats.totalStudents}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Total Students</p>
                </div>
                <div className="space-y-3 px-1">
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Revenue per Student</span>
                    <span className="font-semibold text-foreground">Rs. {Math.round(stats.revenuePerStudent).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Cost per Student</span>
                    <span className="font-semibold text-foreground">Rs. {Math.round(stats.costPerStudent).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Estimated Margin</span>
                    <span className={`font-semibold ${stats.profitMargin >= 0 ? "text-emerald-600" : "text-destructive"}`}>{stats.profitMargin.toFixed(1)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cash Position */}
            <Card 
              className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group flex flex-col justify-between h-[280px]"
              onClick={() => navigate(`/${schoolSlug}/accountant/reports`)}
            >
              <CardHeader className="pb-2 pt-5 px-6 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest">Cash Position</CardTitle>
                <div className="p-1 rounded-lg bg-primary/10 text-primary opacity-60 group-hover:opacity-100 group-hover:bg-primary/20 transition-all duration-300">
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col justify-between pb-5 px-6">
                <div className="text-center bg-primary/10 border border-primary/20 p-3.5 rounded-2xl">
                  <p className="text-lg font-black text-primary tabular-nums">Rs. {stats.cashPosition.toLocaleString()}</p>
                  <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest mt-0.5">Estimated Balance</p>
                </div>
                <div className="space-y-3 px-1">
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Gross Profit</span>
                    <span className="font-semibold text-foreground">Rs. {stats.grossProfit.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-b pb-2">
                    <span className="text-muted-foreground font-medium">Annual Payroll Proj.</span>
                    <span className="font-semibold text-foreground">Rs. {stats.annualPayrollProjection.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Total Expenses</span>
                    <span className="font-semibold text-destructive">Rs. {stats.totalExpenses.toLocaleString()}</span>
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
