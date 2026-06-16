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
  AlertTriangle,
  CheckCircle2,
  Layers,
  Search,
  Sliders,
  Calendar,
  Building2,
  Users,
  Percent,
  TrendingUpIcon,
  HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToCSV } from "@/lib/csv";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  CartesianGrid,
  Legend,
  ComposedChart,
} from "recharts";
import { format, subMonths, startOfMonth, startOfYear, endOfMonth, addMonths, differenceInDays } from "date-fns";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { useNavigate, useParams } from "react-router-dom";

interface Props {
  schoolId: string | null;
  role?: string; // "school_owner" | "principal" | "accountant"
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))"
];

export function OwnerFinanceModule({ schoolId, role = "school_owner" }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const [periodFilter, setPeriodFilter] = useState("12m");
  const [defaulterSimRate, setDefaulterSimRate] = useState<number>(10); // Simulated defaulter percentage (0 - 50%)
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("all");
  const [ledgerPage, setLedgerPage] = useState(1);
  const itemsPerPage = 12;

  const { schoolSlug } = useParams();
  const activeCampusId = useActiveCampus(schoolId);
  const navigate = useNavigate();

  const campusEq = (q: any) => (activeCampusId ? q.eq("campus_id", activeCampusId) : q);

  // Date ranges
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const yearStart = useMemo(() => startOfYear(new Date()), []);
  const trendMonths = periodFilter === "3m" ? 3 : periodFilter === "6m" ? 6 : periodFilter === "ytd" ? Math.max(1, new Date().getMonth() + 1) : 12;

  // Fetch Consolidated Financial Data
  const { data: financeData, isLoading } = useQuery({
    queryKey: ["executive_finance_consolidated", schoolId, activeCampusId, trendMonths],
    queryFn: async () => {
      if (!schoolId) return null;

      const [
        finPaymentsRes,
        feePaymentsRes,
        expensesRes,
        finInvoicesRes,
        feeInvoicesRes,
        payRunsRes,
        salariesRes,
        paymentMethodsRes,
        studentFeeAssignmentsRes,
        feePlanItemsRes,
        studentsRes,
        salaryTargetsRes
      ] = await Promise.all([
        supabase.from("finance_payments").select("*").eq("school_id", schoolId),
        campusEq(supabase.from("fee_payments").select("*").eq("school_id", schoolId).eq("status", "success")),
        supabase.from("finance_expenses").select("*").eq("school_id", schoolId),
        supabase.from("finance_invoices").select("*").eq("school_id", schoolId),
        campusEq(supabase.from("fee_invoices").select("*").eq("school_id", schoolId)),
        supabase.from("hr_pay_runs").select("*").eq("school_id", schoolId),
        supabase.from("hr_salary_records").select("*").eq("school_id", schoolId).eq("is_active", true),
        supabase.from("finance_payment_methods").select("*").eq("school_id", schoolId),
        supabase.from("student_fee_assignments").select("*").eq("school_id", schoolId).eq("is_active", true),
        supabase.from("fee_plan_items").select("*").eq("school_id", schoolId),
        supabase.from("students").select("id,first_name,last_name").eq("school_id", schoolId),
        supabase.from("salary_budget_targets").select("*").eq("school_id", schoolId)
      ]);

      const finPayments = finPaymentsRes.data || [];
      const feePayments = feePaymentsRes.data || [];
      const expenses = expensesRes.data || [];
      const finInvoices = finInvoicesRes.data || [];
      const feeInvoices = feeInvoicesRes.data || [];
      const payRuns = payRunsRes.data || [];
      const salaries = salariesRes.data || [];
      const paymentMethods = paymentMethodsRes.data || [];
      const feeAssignments = studentFeeAssignmentsRes.data || [];
      const feePlanItems = feePlanItemsRes.data || [];
      const students = studentsRes.data || [];
      const salaryTargets = salaryTargetsRes.data || [];

      // Unified Payments list
      const unifiedPayments = [
        ...finPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount || 0),
          paid_at: p.paid_at ? new Date(p.paid_at) : new Date(p.created_at || ""),
          method_id: p.method_id,
          reference: p.reference || "General Ledger",
          type: "inflow" as const,
          description: "General payment received",
          category: "General Inflow",
          student_id: p.student_id
        })),
        ...feePayments.map((p) => {
          const matchingMethod = paymentMethods.find((m) => m.name.toLowerCase() === (p.method || "").toLowerCase());
          return {
            id: p.id,
            amount: Number(p.amount || 0),
            paid_at: new Date(p.paid_at || p.created_at || ""),
            method_id: matchingMethod?.id || null,
            reference: p.transaction_id || p.id,
            type: "inflow" as const,
            description: `Tuition fee collection (Invoice: ${p.invoice_id})`,
            category: "Student Fees",
            student_id: p.student_id
          };
        })
      ].sort((a, b) => b.paid_at.getTime() - a.paid_at.getTime());

      // Unified Expenses list (general expenses + payroll payouts)
      const payrollExpenses = payRuns
        .filter((pr) => pr.status === "completed")
        .map((pr) => ({
          id: pr.id,
          amount: Number(pr.net_amount || 0),
          expense_date: pr.paid_at ? new Date(pr.paid_at) : new Date(pr.created_at),
          description: `Staff Payroll: Period ${pr.period_start || ""} - ${pr.period_end || ""}`,
          category: "Payroll",
          vendor: "Employees",
          type: "outflow" as const
        }));

      const generalExpenses = expenses.map((e) => ({
        id: e.id,
        amount: Number(e.amount || 0),
        expense_date: new Date(e.expense_date || e.created_at || ""),
        description: e.description || "Operational Expenditure",
        category: e.category || "General Operations",
        vendor: e.vendor || "Various Vendor",
        type: "outflow" as const
      }));

      const unifiedExpenses = [...generalExpenses, ...payrollExpenses].sort(
        (a, b) => b.expense_date.getTime() - a.expense_date.getTime()
      );

      // Student name mapping
      const studentMap = new Map<string, string>();
      students.forEach((s) => {
        studentMap.set(s.id, `${s.first_name} ${s.last_name || ""}`.trim());
      });

      // MTD Calculations
      const mtdPayments = unifiedPayments.filter((p) => p.paid_at >= monthStart);
      const ytdPayments = unifiedPayments.filter((p) => p.paid_at >= yearStart);
      const revenueMtd = mtdPayments.reduce((sum, p) => sum + p.amount, 0);
      const revenueYtd = ytdPayments.reduce((sum, p) => sum + p.amount, 0);

      const mtdExpenses = unifiedExpenses.filter((e) => e.expense_date >= monthStart);
      const ytdExpenses = unifiedExpenses.filter((e) => e.expense_date >= yearStart);
      const expensesMtd = mtdExpenses.reduce((sum, e) => sum + e.amount, 0);
      const expensesYtd = ytdExpenses.reduce((sum, e) => sum + e.amount, 0);

      // Liquid balances per Channel
      const collectionsByChannel = paymentMethods.map((pm) => {
        const directCollections = unifiedPayments
          .filter((p) => p.method_id === pm.id)
          .reduce((sum, p) => sum + p.amount, 0);
        return {
          id: pm.id,
          name: pm.name,
          type: pm.type || "bank",
          instructions: pm.instructions,
          isActive: pm.is_active,
          totalCollected: directCollections
        };
      });

      // Active payroll liability
      const monthlyPayrollLiability = salaries.reduce(
        (sum, s) => sum + Number(s.base_salary || 0) + Number(s.allowances || 0) - Number(s.deductions || 0),
        0
      );

      // Invoice funnel and collection rate
      const totalInvoiced = [
        ...finInvoices.map((i) => ({ total: Number(i.total || 0), status: i.status })),
        ...feeInvoices.map((i) => ({ total: Number(i.total_amount || 0), status: i.status }))
      ].reduce((sum, i) => sum + i.total, 0);

      const paidInvoicesTotal = [
        ...finInvoices.filter((i) => i.status === "paid").map((i) => Number(i.total || 0)),
        ...feeInvoices.filter((i) => i.status === "paid").map((i) => Number(i.total_amount || 0))
      ].reduce((sum, amt) => sum + amt, 0);

      const collectionRate = totalInvoiced > 0 ? Math.round((paidInvoicesTotal / totalInvoiced) * 100) : 0;

      const unpaidInvoices = [
        ...finInvoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").map((i) => ({
          total: Number(i.total || 0),
          dueDate: i.due_date ? new Date(i.due_date) : new Date(),
          invoiceNo: i.invoice_no || i.id.slice(0, 8)
        })),
        ...feeInvoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").map((i) => ({
          total: Number(i.total_amount || 0),
          dueDate: i.due_date ? new Date(i.due_date) : new Date(),
          invoiceNo: i.invoice_number || i.id.slice(0, 8)
        }))
      ];
      const unpaidAmount = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);

      // Invoice Aging
      const now = new Date();
      let aging1_30 = 0;
      let aging31_60 = 0;
      let aging61Plus = 0;

      unpaidInvoices.forEach((inv) => {
        if (inv.dueDate < now) {
          const daysPast = differenceInDays(now, inv.dueDate);
          if (daysPast <= 30) aging1_30 += inv.total;
          else if (daysPast <= 60) aging31_60 += inv.total;
          else aging61Plus += inv.total;
        }
      });

      // Categories breakdown
      const expenseByCategory: Record<string, number> = {};
      unifiedExpenses.forEach((e) => {
        expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
      });

      // Monthly cashflow trend
      const monthlyTrend: { month: string; revenue: number; expenses: number; profit: number }[] = [];
      for (let i = trendMonths - 1; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i));
        const end = startOfMonth(subMonths(new Date(), i - 1));

        const monthRevenue = unifiedPayments
          .filter((p) => p.paid_at >= start && p.paid_at < end)
          .reduce((sum, p) => sum + p.amount, 0);

        const monthExpenses = unifiedExpenses
          .filter((e) => e.expense_date >= start && e.expense_date < end)
          .reduce((sum, e) => sum + e.amount, 0);

        monthlyTrend.push({
          month: format(start, "MMM yy"),
          revenue: monthRevenue,
          expenses: monthExpenses,
          profit: monthRevenue - monthExpenses
        });
      }

      // Forecast baseline calculation
      let calculatedExpectedMonthlyInflow = 0;
      if (feeAssignments.length > 0) {
        feeAssignments.forEach((fa) => {
          const planItems = feePlanItems.filter((item) => item.fee_plan_id === fa.fee_plan_id && item.is_recurring);
          const rawSum = planItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
          const afterDiscount = rawSum * (1 - Number(fa.discount_pct || 0) / 100);
          const afterScholarship = Math.max(0, afterDiscount - Number(fa.scholarship_amount || 0));
          calculatedExpectedMonthlyInflow += afterScholarship;
        });
      }

      // Fallback inflow to historical trailing payments average
      if (calculatedExpectedMonthlyInflow === 0 && unifiedPayments.length > 0) {
        const totalPast3MonthsPayments = unifiedPayments
          .filter((p) => p.paid_at >= subMonths(new Date(), 3))
          .reduce((sum, p) => sum + p.amount, 0);
        calculatedExpectedMonthlyInflow = totalPast3MonthsPayments / 3;
      }

      const calculatedExpectedMonthlyOutflow =
        monthlyPayrollLiability +
        (generalExpenses.filter((e) => e.expense_date >= subMonths(new Date(), 6)).reduce((sum, e) => sum + e.amount, 0) / 6);

      // Budget targets vs salaries actual
      const staffRolesRes = await supabase.from("user_roles").select("user_id, role").eq("school_id", schoolId);
      const staffRoles = staffRolesRes.data || [];
      const roleMap = new Map<string, string>();
      staffRoles.forEach((sr) => roleMap.set(sr.user_id, sr.role));

      const budgetsByRole = salaryTargets.map((st) => {
        const actualSalariesSum = salaries
          .filter((s) => roleMap.get(s.user_id) === st.role)
          .reduce((sum, s) => sum + Number(s.base_salary || 0) + Number(s.allowances || 0) - Number(s.deductions || 0), 0) * 12;
        return {
          id: st.id,
          role: st.role || "other",
          budgetAmount: Number(st.budget_amount || 0),
          actualAnnual: actualSalariesSum,
          utilization: st.budget_amount && st.budget_amount > 0 ? (actualSalariesSum / st.budget_amount) * 100 : 0,
          notes: st.notes
        };
      });

      return {
        revenueMtd,
        revenueYtd,
        expensesMtd,
        expensesYtd,
        profitMtd: revenueMtd - expensesMtd,
        profitYtd: revenueYtd - expensesYtd,
        profitMargin: revenueMtd > 0 ? Math.round(((revenueMtd - expensesMtd) / revenueMtd) * 100) : 0,
        monthlyPayrollLiability,
        collectionRate,
        unpaidAmount,
        pendingInvoicesCount: unpaidInvoices.length,
        totalInvoiced,
        expenseByCategory,
        collectionsByChannel,
        monthlyTrend,
        unifiedPayments,
        unifiedExpenses,
        calculatedExpectedMonthlyInflow,
        calculatedExpectedMonthlyOutflow,
        budgetsByRole,
        studentMap,
        agingBuckets: {
          aging1_30,
          aging31_60,
          aging61Plus
        }
      };
    },
    enabled: !!schoolId
  });

  // 12-Month Predictive Forecast calculator
  const projected12Months = useMemo(() => {
    if (!financeData) return [];
    const monthlyInflow = financeData.calculatedExpectedMonthlyInflow || 50000;
    const monthlyOutflow = financeData.calculatedExpectedMonthlyOutflow || 40000;

    const data = [];
    let cumulativeReserve = 0; // Cumulative net cash accumulation starting from 0 baseline
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const monthDate = addMonths(now, i);
      const projectedInflow = monthlyInflow * (1 - defaulterSimRate / 100);
      const netCashPosition = projectedInflow - monthlyOutflow;
      cumulativeReserve += netCashPosition;

      data.push({
        month: format(monthDate, "MMM yy"),
        Inflow: Math.round(projectedInflow),
        Outflow: Math.round(monthlyOutflow),
        "Net Position": Math.round(netCashPosition),
        "Cumulative Reserves": Math.round(cumulativeReserve)
      });
    }
    return data;
  }, [financeData, defaulterSimRate]);

  // Combined ledger matching search & filters
  const filteredLedger = useMemo(() => {
    if (!financeData) return [];
    const payments = financeData.unifiedPayments;
    const expenses = financeData.unifiedExpenses;

    const merged = [
      ...payments.map((p) => ({
        id: p.id,
        date: p.paid_at,
        description: p.description,
        category: p.category,
        amount: p.amount,
        type: "inflow",
        reference: p.reference,
        party: p.student_id ? financeData.studentMap.get(p.student_id) || "Student" : "General Ledger"
      })),
      ...expenses.map((e) => ({
        id: e.id,
        date: e.expense_date,
        description: e.description,
        category: e.category,
        amount: e.amount,
        type: "outflow",
        reference: "Voucher",
        party: e.vendor || "Supplier/Staff"
      }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return merged.filter((item) => {
      const matchesSearch =
        item.description.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        item.category.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        item.party.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (item.reference && item.reference.toLowerCase().includes(ledgerSearch.toLowerCase()));

      const matchesType =
        ledgerTypeFilter === "all" ? true : item.type === ledgerTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [financeData, ledgerSearch, ledgerTypeFilter]);

  const paginatedLedger = useMemo(() => {
    const startIndex = (ledgerPage - 1) * itemsPerPage;
    return filteredLedger.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLedger, ledgerPage]);

  const totalLedgerPages = Math.max(1, Math.ceil(filteredLedger.length / itemsPerPage));

  const expensePieData = useMemo(() => {
    if (!financeData) return [];
    return Object.entries(financeData.expenseByCategory)
      .map(([name, value], idx) => ({
        name,
        value,
        fill: COLORS[idx % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [financeData]);

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(0)}K`;
    return `Rs. ${amount.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">Analyzing accounts & ledger assets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium Glassmorphic Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-accent/5 to-transparent p-6 sm:p-8 border border-primary/10 shadow-soft">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-accent/10 blur-2xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary/20 text-primary border-primary/30 font-medium">Executive Suite</Badge>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">AltRix BI</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mt-2">Finance & Cashflow Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Consolidated cash ledger balance, interactive 12-month forward predictive forecasting, budget variance, and liquidity accounts monitoring.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Select value={periodFilter} onValueChange={(v) => { setPeriodFilter(v); setLedgerPage(1); }}>
              <SelectTrigger className="w-[140px] bg-background/60 backdrop-blur-md rounded-xl border-border/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="6m">Last 6 Months</SelectItem>
                <SelectItem value="12m">Last 12 Months</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="rounded-xl gap-2 bg-background/60 backdrop-blur-md"
              onClick={() => {
                const rows = filteredLedger.map((item) => ({
                  Date: format(new Date(item.date), "yyyy-MM-dd"),
                  Type: item.type.toUpperCase(),
                  Party: item.party,
                  Category: item.category,
                  Description: item.description,
                  Reference: item.reference || "",
                  Amount: item.amount
                }));
                if (rows.length) {
                  exportToCSV(rows, `altrx-ledger-${format(new Date(), "yyyy-MM-dd")}`);
                }
              }}
              disabled={filteredLedger.length === 0}
            >
              <Download className="h-4 w-4" />
              <span>Export Ledger</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Role Quick actions panel for Accountants */}
      {role === "accountant" && (
        <Card className="rounded-2xl border-dashed border-primary/20 bg-primary/5 shadow-none p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Accountant Control Center</p>
              <p className="text-xs text-muted-foreground">You have shortcuts to transaction forms and manual ledgers.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" className="rounded-xl" onClick={() => navigate(`/${schoolSlug}/accountant/payments`)}>
              Record Payment
            </Button>
            <Button size="sm" variant="soft" className="rounded-xl" onClick={() => navigate(`/${schoolSlug}/accountant/expenses`)}>
              Add Expense
            </Button>
            <Button size="sm" variant="soft" className="rounded-xl" onClick={() => navigate(`/${schoolSlug}/accountant/fees?tab=invoices`)}>
              Create Invoice
            </Button>
            <Button size="sm" variant="hero" className="rounded-xl" onClick={() => navigate(`/${schoolSlug}/accountant/payroll`)}>
              Run Payroll
            </Button>
          </div>
        </Card>
      )}

      {/* Primary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full auto-rows-fr">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-emerald-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/payments` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Consolidated MTD</span>
                <Coins className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-emerald-600 truncate">
                  {formatCurrency(financeData?.revenueMtd || 0)}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Total Cash Inflow</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-rose-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/expenses` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Expenses MTD</span>
                <TrendingDown className="h-4 w-4 text-rose-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-red-600 truncate">
                  {formatCurrency(financeData?.expensesMtd || 0)}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Total Operations + Pay</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-blue-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/ledger` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Operating Cashflow</span>
                <PiggyBank className="h-4 w-4 text-blue-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-slate-800 truncate">
                  {formatCurrency(financeData?.profitMtd || 0)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge className="bg-blue-50 text-blue-600 border-blue-100/50 text-[9px] px-1.5 py-0 font-semibold">
                    {financeData?.profitMargin || 0}% margin
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-violet-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/payroll` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Payroll Liability</span>
                <Wallet className="h-4 w-4 text-violet-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-slate-800 truncate">
                  {formatCurrency(financeData?.monthlyPayrollLiability || 0)}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Active staff records</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.2 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-amber-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/fees?tab=invoices` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Outstanding Bal</span>
                <CreditCard className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-amber-600 truncate">
                  {formatCurrency(financeData?.unpaidAmount || 0)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-slate-200">
                    {financeData?.collectionRate || 0}% Coll Rate
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.25 }} className="h-full">
          <Card 
            className="shadow-sm shadow-blue-50/50 bg-gradient-to-br from-white to-blue-50/20 border border-blue-100/80 hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-l-4 border-l-indigo-500 rounded-2xl h-full flex flex-col justify-between group"
            onClick={() => navigate(role === "accountant" ? `/${schoolSlug}/accountant/fees?tab=invoices` : `/${schoolSlug}/owner/finance`)}
          >
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold text-slate-700">Unpaid Bills</span>
                <FileText className="h-4 w-4 text-indigo-500 group-hover:scale-110 transition-transform" />
              </div>
              <div className="mt-4">
                <p className="text-xl font-black tracking-tight text-slate-800 truncate">
                  {financeData?.pendingInvoicesCount || 0}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground/80 mt-1">Pending billing collection</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-muted/60 p-1.5 rounded-2xl gap-1 w-full sm:w-auto">
          <TabsTrigger value="overview" className="rounded-xl py-2 px-4 gap-2">
            <Layers className="h-4 w-4" /> Overview & Accounts
          </TabsTrigger>
          <TabsTrigger value="forecast" className="rounded-xl py-2 px-4 gap-2">
            <Sliders className="h-4 w-4" /> Interactive Forecast
          </TabsTrigger>
          <TabsTrigger value="budget" className="rounded-xl py-2 px-4 gap-2">
            <Wallet className="h-4 w-4" /> Budget Control
          </TabsTrigger>
          <TabsTrigger value="collections" className="rounded-xl py-2 px-4 gap-2">
            <Percent className="h-4 w-4" /> Invoice Aging
          </TabsTrigger>
          <TabsTrigger value="ledger" className="rounded-xl py-2 px-4 gap-2">
            <FileText className="h-4 w-4" /> Cash Ledger
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview & Channels */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,340px)]">
            <Card className="rounded-3xl shadow-soft border border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUpIcon className="h-5 w-5 text-primary" /> Consolidated Cash Flow History
                </CardTitle>
                <CardDescription>Income payments vs. general operational expenditure trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={financeData?.monthlyTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={true} vertical={false} />
                      <XAxis dataKey="month" fontSize={10} className="text-muted-foreground" />
                      <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), ""]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "16px",
                          fontSize: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)"
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        fill="url(#revenueGrad)"
                        strokeWidth={2.5}
                        name="Cash Inflow"
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        stroke="hsl(var(--destructive))"
                        fill="url(#expenseGrad)"
                        strokeWidth={2}
                        name="Outflows & Salaries"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Liquidity Channels */}
              <Card className="rounded-3xl shadow-soft border border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> Collections by Channel
                  </CardTitle>
                  <CardDescription>Indirect cash received per payment method</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-6 pb-6 space-y-4">
                    {financeData?.collectionsByChannel.map((channel, idx) => (
                      <div key={channel.id} className="relative rounded-2xl bg-muted/40 p-4 border border-border/30 hover:border-primary/20 transition-all group overflow-hidden">
                        <div className="absolute right-2 top-2 text-primary/10 transition-transform group-hover:scale-125">
                          <Building2 className="h-10 w-10" />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-background border p-2 text-muted-foreground">
                            {channel.type === "bank" ? <Building2 className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                          </div>
                          <div>
                            <span className="font-semibold text-sm">{channel.name}</span>
                            <span className="text-[10px] text-muted-foreground block uppercase mt-0.5">{channel.type} channel</span>
                          </div>
                        </div>
                        <div className="flex items-end justify-between mt-4">
                          <div className="text-xs text-muted-foreground">Accumulated Received:</div>
                          <div className="text-lg font-bold text-foreground">
                            {formatCurrency(channel.totalCollected)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!financeData || financeData.collectionsByChannel.length === 0) && (
                      <p className="text-center text-sm text-muted-foreground py-6">No payment methods configured.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-3xl shadow-soft border border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Operational Outflow Share</CardTitle>
                <CardDescription>Expense allocation by transaction category</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-6">
                {expensePieData.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,180px)] w-full items-center">
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expensePieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {expensePieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {expensePieData.slice(0, 5).map((entry, idx) => (
                        <div key={entry.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                            <span className="truncate text-muted-foreground font-medium">{entry.name}</span>
                          </div>
                          <span className="font-bold text-foreground shrink-0">{formatCurrency(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">No expenses logged.</div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-soft border border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Collections Summary YTD</CardTitle>
                <CardDescription>Fiscal summary of payments, expenditures, and reserves</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">YTD Total Income</span>
                  </div>
                  <span className="text-lg font-bold text-emerald-600">
                    {formatCurrency(financeData?.revenueYtd || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b pb-3.5">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-red-500/10 p-1.5 text-red-600">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">YTD Total Outflow</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {formatCurrency(financeData?.expensesYtd || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                      <PiggyBank className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">YTD Net Reserves</span>
                  </div>
                  <span className="text-xl font-extrabold text-foreground">
                    {formatCurrency(financeData?.profitYtd || 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Interactive Predictive Forecast */}
        <TabsContent value="forecast" className="mt-6 space-y-6">
          <Card className="rounded-3xl shadow-soft border border-border/60">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sliders className="h-5 w-5 text-primary" /> 12-Month Predictive Cashflow Forecaster
              </CardTitle>
              <CardDescription>
                Simulate your school's liquidity reserves by adjusting tuition collection rates and defaulter defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Simulator Controls */}
              <div className="rounded-2xl bg-muted/40 p-5 border border-border/30 grid gap-6 md:grid-cols-3 items-center">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold text-sm">Estimated Fee Defaulter Rate</Label>
                    <Badge variant="soft" className="bg-primary/20 text-primary border-primary/20 text-xs font-bold font-mono">
                      {defaulterSimRate}%
                    </Badge>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={defaulterSimRate}
                    onChange={(e) => setDefaulterSimRate(Number(e.target.value))}
                    className="w-full h-2 bg-muted-foreground/20 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-[10px] text-muted-foreground flex justify-between">
                    <span>0% (Perfect collections)</span>
                    <span>50% (High Delinquency)</span>
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Standard Monthly Billing Inflow:</span>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(financeData?.calculatedExpectedMonthlyInflow || 0)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/80 block">Derived from active plan assignments</span>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Projected Monthly Outflow:</span>
                  <p className="text-lg font-bold text-destructive">
                    {formatCurrency(financeData?.calculatedExpectedMonthlyOutflow || 0)}
                  </p>
                  <span className="text-[10px] text-muted-foreground/80 block">Active Payroll + average category bills</span>
                </div>
              </div>

              {/* Forecast chart */}
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projected12Months} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={true} vertical={false} />
                    <XAxis dataKey="month" fontSize={10} className="text-muted-foreground" />
                    <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "16px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                    <Bar dataKey="Inflow" name="Projected Inflow (Unpaid Adjusted)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Bar dataKey="Outflow" name="Projected Outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Line
                      type="monotone"
                      dataKey="Cumulative Reserves"
                      name="Cumulative Net Cash Reserve"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Projected Summary cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="bg-muted/30 border-border/30 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <span className="text-xs text-muted-foreground font-medium block">Simulated Monthly Inflow</span>
                    <span className="text-xl font-bold text-primary mt-1 block">
                      {formatCurrency((financeData?.calculatedExpectedMonthlyInflow || 0) * (1 - defaulterSimRate / 100))}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80 block mt-0.5">Defaulter adjusted</span>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30 border-border/30 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <span className="text-xs text-muted-foreground font-medium block">Simulated Monthly Net position</span>
                    {projected12Months[0] && (
                      <span className={`text-xl font-bold mt-1 block ${projected12Months[0]["Net Position"] >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {projected12Months[0]["Net Position"] >= 0 ? "+" : ""}
                        {formatCurrency(projected12Months[0]["Net Position"])}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/80 block mt-0.5">Monthly reserve net</span>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30 border-border/30 rounded-2xl">
                  <CardContent className="p-4 text-center">
                    <span className="text-xs text-muted-foreground font-medium block">Projected 12-Month Accumulation</span>
                    {projected12Months[11] && (
                      <span className={`text-xl font-bold mt-1 block ${projected12Months[11]["Cumulative Reserves"] >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {projected12Months[11]["Cumulative Reserves"] >= 0 ? "+" : ""}
                        {formatCurrency(projected12Months[11]["Cumulative Reserves"])}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/80 block mt-0.5">Trailing reserve projection</span>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Budget Control */}
        <TabsContent value="budget" className="mt-6 space-y-6">
          <Card className="rounded-3xl shadow-soft border border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Budget Limits & Staff Payroll Utilization
              </CardTitle>
              <CardDescription>
                Compare budget thresholds configured in `salary_budget_targets` with actual active salary contracts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {financeData?.budgetsByRole && financeData.budgetsByRole.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2 items-center">
                    {/* Progress limits */}
                    <div className="space-y-4">
                      {financeData.budgetsByRole.map((budget) => {
                        const isOver = budget.utilization > 100;
                        const isNear = budget.utilization >= 80 && budget.utilization <= 100;

                        return (
                          <div key={budget.id} className="space-y-1.5 rounded-xl border p-4 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold text-sm uppercase tracking-wide">
                                  {budget.role.replace(/_/g, " ")}
                                </span>
                                {budget.notes && (
                                  <span className="text-[10px] text-muted-foreground block">{budget.notes}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground font-mono">
                                  {budget.utilization.toFixed(0)}%
                                </span>
                                {isOver ? (
                                  <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                                    Over budget
                                  </Badge>
                                ) : isNear ? (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                                    Near limit
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                    Compliant
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Progress
                              value={Math.min(budget.utilization, 100)}
                              className={`h-2.5 ${isOver ? "[&>div]:bg-destructive" : isNear ? "[&>div]:bg-amber-500" : "[&>div]:bg-primary"}`}
                            />
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono pt-1">
                              <span>Actual: {formatCurrency(budget.actualAnnual)}/yr</span>
                              <span>Target: {formatCurrency(budget.budgetAmount)}/yr</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Chart */}
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financeData.budgetsByRole} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={true} vertical={false} />
                          <XAxis dataKey="role" fontSize={9} tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ")} />
                          <YAxis fontSize={9} tickFormatter={(v) => formatCurrency(v)} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Legend wrapperStyle={{ fontSize: "10px" }} />
                          <Bar dataKey="budgetAmount" name="Budget Limit" fill="hsl(var(--muted-foreground)/0.3)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="actualAnnual" name="Actual Annual Salaries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                            {financeData.budgetsByRole.map((entry, idx) => (
                              <Cell
                                key={`cell-${idx}`}
                                fill={entry.utilization > 100 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center border rounded-2xl bg-muted/10 border-dashed">
                  <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/60" />
                  <p className="mt-4 font-semibold text-muted-foreground">No salary budget targets configured.</p>
                  <p className="text-xs text-muted-foreground/80 mt-1 max-w-md mx-auto">
                    Accountants can configure annual budget targets in the finance section to run limits and variance analysis.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Invoice Aging */}
        <TabsContent value="collections" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-3xl shadow-soft border border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Unpaid Invoices Aging Analysis</CardTitle>
                <CardDescription>Breakdown of past-due billing receivables grouped by delay periods</CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-2 space-y-4">
                <div className="space-y-3">
                  <div className="rounded-xl border bg-muted/10 p-4 flex items-center justify-between border-l-4 border-l-amber-500">
                    <div>
                      <span className="font-semibold text-sm">1 - 30 Days Past Due</span>
                      <span className="text-[10px] text-muted-foreground block">Recent overdue billing</span>
                    </div>
                    <span className="text-lg font-bold text-foreground font-mono">
                      {formatCurrency(financeData?.agingBuckets.aging1_30 || 0)}
                    </span>
                  </div>

                  <div className="rounded-xl border bg-muted/10 p-4 flex items-center justify-between border-l-4 border-l-orange-500">
                    <div>
                      <span className="font-semibold text-sm">31 - 60 Days Past Due</span>
                      <span className="text-[10px] text-muted-foreground block">Moderate arrears collection</span>
                    </div>
                    <span className="text-lg font-bold text-foreground font-mono">
                      {formatCurrency(financeData?.agingBuckets.aging31_60 || 0)}
                    </span>
                  </div>

                  <div className="rounded-xl border bg-muted/10 p-4 flex items-center justify-between border-l-4 border-l-red-500">
                    <div>
                      <span className="font-semibold text-sm">60+ Days Past Due</span>
                      <span className="text-[10px] text-muted-foreground block">Critical delinquency risk</span>
                    </div>
                    <span className="text-lg font-bold text-red-600 font-mono">
                      {formatCurrency(financeData?.agingBuckets.aging61Plus || 0)}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border p-4 bg-muted/30 text-xs flex gap-2.5 items-start text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <p>
                    Invoice aging computes latency derived from billing due dates across all students. Outstanding totals represent potential bad debt. Recommend sending automated warnings.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl shadow-soft border border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Aging Receivables Distribution</CardTitle>
                <CardDescription>Visual comparison of overdue aging blocks</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center p-6">
                {financeData &&
                (financeData.agingBuckets.aging1_30 > 0 ||
                  financeData.agingBuckets.aging31_60 > 0 ||
                  financeData.agingBuckets.aging61Plus > 0) ? (
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: "1-30 Days", amount: financeData.agingBuckets.aging1_30, fill: "hsl(var(--chart-4))" },
                          { name: "31-60 Days", amount: financeData.agingBuckets.aging31_60, fill: "hsl(var(--chart-5))" },
                          { name: "60+ Days", amount: financeData.agingBuckets.aging61Plus, fill: "hsl(var(--destructive))" }
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={true} vertical={false} />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => formatCurrency(v)} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                          <Cell fill="hsl(var(--chart-2))" />
                          <Cell fill="hsl(var(--chart-4))" />
                          <Cell fill="hsl(var(--destructive))" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-muted-foreground flex flex-col gap-2 items-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <span className="font-semibold text-foreground mt-2">Zero Delinquency Overdue</span>
                    <span>All student billing is fully settled or within due parameters.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Consolidated Cash Ledger */}
        <TabsContent value="ledger" className="mt-6 space-y-6">
          <Card className="rounded-3xl shadow-soft border border-border/60">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Consolidated Bookkeeping Ledger
                  </CardTitle>
                  <CardDescription>
                    Unified transaction timeline containing all payments received and expenses paid.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative w-[180px] sm:w-[220px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Search ledger..."
                      className="pl-8 rounded-xl h-9 bg-background/50 text-xs"
                      value={ledgerSearch}
                      onChange={(e) => { setLedgerSearch(e.target.value); setLedgerPage(1); }}
                    />
                  </div>
                  <Select value={ledgerTypeFilter} onValueChange={(v) => { setLedgerTypeFilter(v); setLedgerPage(1); }}>
                    <SelectTrigger className="w-[120px] rounded-xl h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">All Entries</SelectItem>
                      <SelectItem value="inflow">Inflows (+)</SelectItem>
                      <SelectItem value="outflow">Outflows (-)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-6 pb-6 pt-4">
                <div className="overflow-x-auto rounded-2xl border bg-surface">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Entity/Party</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedLedger.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-muted/10 transition-colors">
                          <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap text-xs font-mono">
                            {format(new Date(item.date), "yyyy-MM-dd HH:mm")}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {item.type === "inflow" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/10 text-[10px] font-semibold py-0">
                                Inflow
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-600 border-red-500/10 text-[10px] font-semibold py-0">
                                Outflow
                              </Badge>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-medium max-w-[140px] truncate text-xs">{item.party}</td>
                          <td className="py-3.5 px-4 text-muted-foreground max-w-[120px] truncate text-xs">{item.category}</td>
                          <td className="py-3.5 px-4 max-w-[200px] truncate text-xs" title={item.description}>
                            {item.description}
                          </td>
                          <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap text-xs font-mono">
                            {item.reference}
                          </td>
                          <td className={`py-3.5 px-4 text-right font-bold whitespace-nowrap text-xs font-mono ${item.type === "inflow" ? "text-emerald-600" : "text-red-600"}`}>
                            {item.type === "inflow" ? "+" : "-"}
                            {formatCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                      {paginatedLedger.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                            No matching ledger entries found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalLedgerPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-muted-foreground">
                      Page {ledgerPage} of {totalLedgerPages} ({filteredLedger.length} total entries)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-xs"
                        onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                        disabled={ledgerPage === 1}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-xs"
                        onClick={() => setLedgerPage((p) => Math.min(totalLedgerPages, p + 1))}
                        disabled={ledgerPage === totalLedgerPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
