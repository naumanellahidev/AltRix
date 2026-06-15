import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Brain,
  Building2,
  Coins,
  GraduationCap,
  HeartPulse,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Shield,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  LifeBuoy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { format, subDays, startOfMonth, startOfYear, subMonths } from "date-fns";

const MotionCard = motion.create(Card);

interface Props {
  schoolId: string | null;
}

type Kpis = {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  alumniCount: number;
  revenueMtd: number;
  revenueYtd: number;
  expensesMtd: number;
  expensesYtd: number;
  profit: number;
  profitMargin: number;
  attendanceRate: number;
  academicIndex: number;
  admissionFunnel: number;
  openLeads: number;
  conversionRate: number;
  dropoutRisk: number;
  teacherUtilization: number;
  totalTeachers: number;
  totalStaff: number;
  pendingInvoices: number;
  unpaidAmount: number;
  collectionRate: number;
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function OwnerOverviewModule({ schoolId }: Props) {
  const { schoolSlug } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const activeCampusId = useActiveCampus(schoolId);
  const campusEq = (q: any) => (activeCampusId ? q.eq("campus_id", activeCampusId) : q);

  const basePath = `/${schoolSlug}/school_owner`;

  // Date ranges
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const yearStart = useMemo(() => startOfYear(new Date()), []);
  const d7Ago = useMemo(() => subDays(new Date(), 7), []);
  const d30Ago = useMemo(() => subDays(new Date(), 30), []);

  // Real-time subscriptions for automatic KPI refresh
  useRealtimeTable({
    channel: `owner-kpi-students-${schoolId}`,
    table: "students",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_overview_kpis", schoolId] }),
  });

  useRealtimeTable({
    channel: `owner-kpi-payments-${schoolId}`,
    table: "fee_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_overview_kpis", schoolId] }),
  });

  useRealtimeTable({
    channel: `owner-kpi-leads-${schoolId}`,
    table: "crm_leads",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_overview_kpis", schoolId] }),
  });

  useRealtimeTable({
    channel: `owner-kpi-attendance-${schoolId}`,
    table: "attendance_entries",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_overview_kpis", schoolId] }),
  });

  useRealtimeTable({
    channel: `owner-kpi-invoices-${schoolId}`,
    table: "fee_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_overview_kpis", schoolId] }),
  });

  useRealtimeTable({
    channel: `owner-kpi-tickets-${schoolId}`,
    table: "admin_messages",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void qc.invalidateQueries({ queryKey: ["owner_support_tickets", schoolId] }),
  });

  // Fetch all KPI data
  const { data: kpis, refetch: refetchKpis, isLoading } = useQuery({
    queryKey: ["owner_overview_kpis", schoolId, activeCampusId],
    queryFn: async () => {
      if (!schoolId) return null;

      const [
        studentsRes,
        paymentsRes,
        expensesRes,
        attendanceRes,
        leadsRes,
        invoicesRes,
        staffRes,
        teachersRes,
        marksRes,
        timetableRes,
        teacherAssignRes,
      ] = await Promise.all([
        // Students (campus-scoped)
        campusEq(supabase.from("students").select("id,status").eq("school_id", schoolId)),
        // Payments — fee_payments now carries campus_id
        campusEq(supabase.from("fee_payments").select("amount,paid_at").eq("school_id", schoolId).eq("status", "success")),
        // Expenses (school-wide; not campus tagged)
        supabase.from("finance_expenses").select("amount,expense_date").eq("school_id", schoolId),
        // Attendance (7 days, campus-scoped)
        campusEq(
          supabase
            .from("attendance_entries")
            .select("status")
            .eq("school_id", schoolId)
            .gte("created_at", d7Ago.toISOString())
        ),
        // Leads (school-wide)
        supabase.from("crm_leads").select("id,status,created_at").eq("school_id", schoolId),
        // Invoices (campus-scoped)
        campusEq(supabase.from("fee_invoices").select("id,status,total_amount").eq("school_id", schoolId)),
        // Staff
        supabase.from("school_memberships").select("id").eq("school_id", schoolId),
        // Teachers
        supabase.from("user_roles").select("id").eq("school_id", schoolId).eq("role", "teacher"),
        // Marks (campus-scoped)
        campusEq(
          supabase
            .from("student_marks")
            .select("marks,assessment_id")
            .eq("school_id", schoolId)
            .not("marks", "is", null)
        ),
        // Timetable entries (to compute teacher utilization)
        supabase.from("timetable_entries").select("teacher_id").eq("school_id", schoolId),
        // Teacher subject assignments (active teachers with assignments)
        supabase.from("teacher_subject_assignments").select("teacher_id").eq("school_id", schoolId),
      ]);

      const students = studentsRes.data || [];
      const payments = paymentsRes.data || [];
      const expenses = expensesRes.data || [];
      const attendance = attendanceRes.data || [];
      const leads = leadsRes.data || [];
      const invoices = invoicesRes.data || [];
      const staff = staffRes.data || [];
      const teachers = teachersRes.data || [];
      const marks = marksRes.data || [];
      const timetable = timetableRes.data || [];
      const teacherAssignments = teacherAssignRes.data || [];

      // Student counts
      const totalStudents = students.length;
      const activeStudents = students.filter((s) => s.status === "enrolled" || s.status === "active").length;
      const inactiveStudents = students.filter((s) => s.status === "inactive" || s.status === "withdrawn").length;
      const alumniCount = students.filter((s) => s.status === "graduated").length;

      // Revenue
      const mtdPayments = payments.filter(
        (p) => new Date(p.paid_at) >= monthStart
      );
      const ytdPayments = payments.filter(
        (p) => new Date(p.paid_at) >= yearStart
      );
      const revenueMtd = mtdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const revenueYtd = ytdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Expenses
      const mtdExpenses = expenses.filter(
        (e) => new Date(e.expense_date) >= monthStart
      );
      const ytdExpenses = expenses.filter(
        (e) => new Date(e.expense_date) >= yearStart
      );
      const expensesMtd = mtdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const expensesYtd = ytdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      // Profit
      const profit = revenueMtd - expensesMtd;
      const profitMargin = revenueMtd > 0 ? Math.round((profit / revenueMtd) * 100) : 0;

      // Attendance
      const totalAttendance = attendance.length;
      const presentCount = attendance.filter(
        (a) => a.status === "present" || a.status === "late"
      ).length;
      const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

      // Academic Index (average marks as %)
      const avgMark = marks.length > 0 ? marks.reduce((sum, m) => sum + Number(m.marks || 0), 0) / marks.length : 0;
      const academicIndex = Math.min(100, Math.round(avgMark));

      // Leads
      const openLeads = leads.filter((l) => l.status === "open" || !l.status).length;
      const wonLeads = leads.filter((l) => l.status === "won").length;
      const totalLeads = leads.length;
      const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

      // Dropout risk (students with <60% attendance or at risk)
      const dropoutRisk = Math.max(0, Math.round((inactiveStudents / Math.max(1, totalStudents)) * 100));

      // Invoices
      const pendingInvoices = invoices.filter((i) => i.status === "pending" || i.status === "unpaid").length;
      const paidInvoices = invoices.filter((i) => i.status === "paid").length;
      const unpaidAmount = invoices
        .filter((i: any) => i.status !== "paid")
        .reduce((sum: number, i: any) => sum + Number(i.total_amount || 0), 0);
      const collectionRate = invoices.length > 0 ? Math.round((paidInvoices / invoices.length) * 100) : 0;

      // Teacher utilization: % of teachers actively scheduled or assigned
      const scheduledTeacherIds = new Set<string>([
        ...timetable.map((t: any) => t.teacher_id).filter(Boolean),
        ...teacherAssignments.map((t: any) => t.teacher_id).filter(Boolean),
      ]);
      const teacherUtilization = teachers.length > 0
        ? Math.round((scheduledTeacherIds.size / teachers.length) * 100)
        : 0;

      return {
        totalStudents,
        activeStudents,
        inactiveStudents,
        alumniCount,
        revenueMtd,
        revenueYtd,
        expensesMtd,
        expensesYtd,
        profit,
        profitMargin,
        attendanceRate,
        academicIndex,
        admissionFunnel: openLeads,
        openLeads,
        conversionRate,
        dropoutRisk,
        teacherUtilization,
        totalTeachers: teachers.length,
        totalStaff: staff.length,
        pendingInvoices,
        unpaidAmount,
        collectionRate,
      } as Kpis;
    },
    enabled: !!schoolId,
  });

  // Fetch trend data (last 12 months)
  const { data: trendData } = useQuery({
    queryKey: ["owner_trend_data", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];

      for (let i = 11; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i));
        const end = startOfMonth(subMonths(new Date(), i - 1));

        const [paymentsRes, expensesRes] = await Promise.all([
          supabase
            .from("fee_payments")
            .select("amount")
            .eq("school_id", schoolId)
            .eq("status", "success")
            .gte("paid_at", start.toISOString())
            .lt("paid_at", end.toISOString()),
          supabase
            .from("finance_expenses")
            .select("amount")
            .eq("school_id", schoolId)
            .gte("expense_date", start.toISOString())
            .lt("expense_date", end.toISOString()),
        ]);

        const revenue = (paymentsRes.data || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const exp = (expensesRes.data || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

        months.push({
          month: format(start, "MMM"),
          revenue,
          expenses: exp,
          profit: revenue - exp,
        });
      }

      return months;
    },
    enabled: !!schoolId,
  });

  // AI Insights — derived from real KPIs
  const insights = useMemo(() => {
    if (!kpis) return [];
    const list: { type: "warning" | "success" | "info"; message: string; action?: string }[] = [];

    if (kpis.conversionRate < 20) {
      list.push({
        type: "warning",
        message: `Admission conversion rate is ${kpis.conversionRate}% - below industry average`,
        action: "Review CRM funnel",
      });
    }

    if (kpis.attendanceRate < 85) {
      list.push({
        type: "warning",
        message: `7-day attendance is ${kpis.attendanceRate}% - requires attention`,
        action: "Check attendance patterns",
      });
    }

    if (kpis.profitMargin > 15) {
      list.push({
        type: "success",
        message: `Profit margin is healthy at ${kpis.profitMargin}%`,
      });
    }

    if (kpis.collectionRate < 80) {
      list.push({
        type: "warning",
        message: `Fee collection rate at ${kpis.collectionRate}% - ${kpis.pendingInvoices} pending invoices`,
        action: "Review defaulters",
      });
    }

    if (kpis.dropoutRisk > 5) {
      list.push({
        type: "warning",
        message: `${kpis.dropoutRisk}% dropout risk detected`,
        action: "View at-risk students",
      });
    }

    if (list.length === 0) {
      list.push({
        type: "success",
        message: "All systems operating within expected parameters",
      });
    }

    return list;
  }, [kpis]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchKpis();
    setRefreshing(false);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-muted-foreground">Loading executive dashboard…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight lg:text-3xl">
            Executive Command Center
          </h1>
          <p className="text-muted-foreground">
            Real-time institutional performance • {format(new Date(), "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* AI Insights Banner */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            AI Insights & Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 rounded-xl p-3 ${
                  insight.type === "warning"
                    ? "bg-amber-500/10"
                    : insight.type === "success"
                    ? "bg-emerald-500/10"
                    : "bg-blue-500/10"
                }`}
              >
                {insight.type === "warning" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : insight.type === "success" ? (
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{insight.message}</p>
                  {insight.action && (
                    <button className="mt-1 text-xs text-primary hover:underline">
                      {insight.action} →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/academics`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <GraduationCap className="h-5 w-5 text-primary" />
              <Badge variant="outline" className="text-[10px]">
                {kpis?.activeStudents}/{kpis?.totalStudents}
              </Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{kpis?.totalStudents || 0}</p>
            <p className="text-xs text-muted-foreground">Total Students</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/fees`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Coins className="h-5 w-5 text-emerald-600" />
              {(kpis?.profit || 0) >= 0 ? (
                <ArrowUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <ArrowDown className="h-4 w-4 text-red-600" />
              )}
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-emerald-600">
              {formatCurrency(kpis?.revenueMtd || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Revenue (MTD)</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/fees`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <Badge
                variant={kpis?.profitMargin && kpis.profitMargin > 0 ? "default" : "destructive"}
                className="text-[10px]"
              >
                {kpis?.profitMargin || 0}%
              </Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">
              {formatCurrency(kpis?.profit || 0)}
            </p>
            <p className="text-xs text-muted-foreground">Profit (MTD)</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/academics`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Activity className="h-5 w-5 text-purple-600" />
              <Badge
                variant={kpis?.attendanceRate && kpis.attendanceRate >= 85 ? "default" : "destructive"}
                className="text-[10px]"
              >
                7d
              </Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{kpis?.attendanceRate || 0}%</p>
            <p className="text-xs text-muted-foreground">Attendance</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/admissions`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-5 w-5 text-amber-600" />
              <Badge variant="outline" className="text-[10px]">
                {kpis?.conversionRate || 0}%
              </Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{kpis?.openLeads || 0}</p>
            <p className="text-xs text-muted-foreground">Open Leads</p>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => navigate(`${basePath}/hr`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Users className="h-5 w-5 text-indigo-600" />
              <Badge variant="outline" className="text-[10px]">
                {kpis?.totalTeachers || 0} teachers
              </Badge>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">{kpis?.totalStaff || 0}</p>
            <p className="text-xs text-muted-foreground">Total Staff</p>
          </CardContent>
        </MotionCard>
      </div>

      {/* Secondary KPIs & Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Performance (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={trendData || []}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="month" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    interval="preserveStartEnd"
                    height={30}
                  />
                  <YAxis 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={formatCurrency}
                    width={45}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.75rem",
                      fontSize: "12px"
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
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

        {/* Quick Actions / Navigation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: GraduationCap, label: "Academics Intelligence", path: "academics", color: "text-primary" },
                { icon: TrendingUp, label: "Admissions & Growth", path: "admissions", color: "text-amber-600" },
                { icon: Coins, label: "Fees & Expenses", path: "fees", color: "text-emerald-600" },
                { icon: Users, label: "HR & Culture", path: "hr", color: "text-indigo-600" },
                { icon: HeartPulse, label: "Student Wellbeing", path: "wellbeing", color: "text-pink-600" },
                { icon: Shield, label: "System & Security", path: "security", color: "text-slate-600" },
                { icon: LifeBuoy, label: "Support Tickets", path: "support", color: "text-orange-600" },
                { icon: Brain, label: "AI Strategy Advisor", path: "advisor", color: "text-purple-600" },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(`${basePath}/${item.path}`)}
                  className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-left hover:bg-muted transition-colors"
                >
                  <item.icon className={`h-5 w-5 shrink-0 ${item.color}`} />
                  <span className="text-sm font-medium truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health & Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-600" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Fee Collection</span>
                <span className="font-medium">{kpis?.collectionRate || 0}%</span>
              </div>
              <Progress value={kpis?.collectionRate || 0} className="mt-2 h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Teacher Utilization</span>
                <span className="font-medium">{kpis?.teacherUtilization || 0}%</span>
              </div>
              <Progress value={kpis?.teacherUtilization || 0} className="mt-2 h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span>Academic Performance</span>
                <span className="font-medium">{kpis?.academicIndex || 0}%</span>
              </div>
              <Progress value={kpis?.academicIndex || 0} className="mt-2 h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-amber-500/10 p-3">
                <span className="text-sm">Pending Invoices</span>
                <Badge variant="outline">{kpis?.pendingInvoices || 0}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-red-500/10 p-3">
                <span className="text-sm">Dropout Risk</span>
                <Badge variant="destructive">{kpis?.dropoutRisk || 0}%</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-blue-500/10 p-3">
                <span className="text-sm">Unpaid Amount</span>
                <Badge variant="outline">{formatCurrency(kpis?.unpaidAmount || 0)}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4 text-primary" />
              YTD Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(kpis?.revenueYtd || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Expenses</span>
                <span className="font-semibold text-red-600">
                  {formatCurrency(kpis?.expensesYtd || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">Net Profit</span>
                <span className="font-bold text-primary">
                  {formatCurrency((kpis?.revenueYtd || 0) - (kpis?.expensesYtd || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
