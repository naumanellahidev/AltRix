import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { money } from "@/lib/documents/format";
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
} from "lucide-react";
import { api, USE_FASTAPI } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { DashboardNotificationsBanner } from "@/components/global/DashboardNotificationsBanner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
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
  profitMargin: number | null;
  attendanceRate: number | null;
  academicIndex: number | null;
  admissionFunnel: number;
  openLeads: number;
  conversionRate: number | null;
  dropoutRisk: number | null;
  teacherUtilization: number | null;
  totalTeachers: number;
  totalStaff: number;
  pendingInvoices: number;
  unpaidAmount: number;
  collectionRate: number | null;
};

// Amounts keep their paisa: the owner's overview is read against the ledger,
// and rounded figures do not reconcile with it.
const formatCurrency = (val: number | string) => money(String(val ?? 0), { currency: "PKR" });

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

  // Fetch all KPI data
  const { data: kpis, refetch: refetchKpis, isLoading } = useQuery({
    queryKey: ["owner_overview_kpis", schoolId, activeCampusId],
    queryFn: async () => {
      if (!schoolId) return null;

      // Every figure below comes from the school's records. A shortcut here
      // filled what it did not know with invented ones (an academic index of
      // 92, 90% collection, 100% conversion and utilisation).
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
        campusEq(api.from("students").select("id,status,campus_id").eq("school_id", schoolId)),
        campusEq(api.from("fee_payments").select("amount,paid_at,campus_id").eq("school_id", schoolId).eq("status", "success")),
        api.from("finance_expenses").select("amount,expense_date").eq("school_id", schoolId),
        campusEq(api.from("attendance_entries").select("status,campus_id").eq("school_id", schoolId).gte("created_at", d7Ago.toISOString())),
        api.from("crm_leads").select("id,status,created_at").eq("school_id", schoolId),
        campusEq(api.from("fee_invoices").select("id,status,total_amount,paid_amount,campus_id").eq("school_id", schoolId)),
        campusEq(api.from("user_roles").select("id,campus_id,role").eq("school_id", schoolId).in("role", ["teacher", "principal", "vice_principal", "accountant", "academic_coordinator", "counselor", "hr_manager", "school_admin", "librarian", "transport_manager", "receptionist", "security_guard", "staff", "admin", "school_owner"])),
        campusEq(api.from("user_roles").select("id,campus_id,role").eq("school_id", schoolId).eq("role", "teacher")),
        campusEq(api.from("student_marks").select("marks,assessment_id,campus_id,academic_assessments(max_marks)").eq("school_id", schoolId).not("marks", "is", null)),
        api.from("timetable_entries").select("teacher_user_id,teacher_id").eq("school_id", schoolId),
        api.from("teacher_subject_assignments").select("teacher_user_id,teacher_id").eq("school_id", schoolId),
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

      const totalStudents = students.length;
      const activeStudents = students.filter((s) => s.status === "enrolled" || s.status === "active").length;
      const inactiveStudents = students.filter((s) => s.status === "inactive" || s.status === "withdrawn").length;
      const alumniCount = students.filter((s) => s.status === "graduated").length;

      const mtdPayments = payments.filter((p) => new Date(p.paid_at) >= monthStart);
      const ytdPayments = payments.filter((p) => new Date(p.paid_at) >= yearStart);
      const revenueMtd = mtdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const revenueYtd = ytdPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const mtdExpenses = expenses.filter((e) => new Date(e.expense_date) >= monthStart);
      const ytdExpenses = expenses.filter((e) => new Date(e.expense_date) >= yearStart);
      const expensesMtd = mtdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const expensesYtd = ytdExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const profit = revenueMtd - expensesMtd;
      const profitMargin = revenueMtd > 0 ? Math.round((profit / revenueMtd) * 100) : null;

      const totalAttendance = attendance.length;
      const presentCount = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

      // The average mark as a percentage of each assessment's maximum.
      const pct = marks
        .map((m: any) => {
          const max = Number(m.academic_assessments?.max_marks);
          return max > 0 && m.marks != null ? (Number(m.marks) / max) * 100 : null;
        })
        .filter((x: number | null): x is number => x != null);
      const academicIndex = pct.length ? Math.round(pct.reduce((a, b) => a + b, 0) / pct.length) : null;
      // Leads are open, won or lost ("contacted" and "enrolled" are not statuses).
      const openLeads = leads.filter((l) => !l.status || l.status === "open").length;
      const convertedLeads = leads.filter((l) => l.status === "won").length;
      const conversionRate = leads.length > 0 ? Math.round((convertedLeads / leads.length) * 100) : null;

      const dropoutRisk = totalStudents > 0 ? Math.round((inactiveStudents / totalStudents) * 100) : null;

      // Invoice statuses are draft, pending, partial, paid, overdue, cancelled
      // ("unpaid" is not one of them); what is owed is the balance left.
      const billable = invoices.filter((i: any) => i.status !== "draft" && i.status !== "cancelled");
      const pendingInvoices = billable.filter((i: any) => ["pending", "partial", "overdue"].includes(i.status)).length;
      const paidInvoices = billable.filter((i) => i.status === "paid").length;
      const unpaidAmount = billable
        .filter((i: any) => i.status !== "paid")
        .reduce((sum: number, i: any) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);
      const collectionRate = billable.length > 0 ? Math.round((paidInvoices / billable.length) * 100) : null;

      const scheduledTeacherIds = new Set<string>([
        ...timetable.map((t: any) => t.teacher_user_id || t.teacher_id).filter(Boolean),
        ...teacherAssignments.map((t: any) => t.teacher_user_id || t.teacher_id).filter(Boolean),
      ]);
      const teacherUtilization = teachers.length > 0 ? Math.round((scheduledTeacherIds.size / teachers.length) * 100) : null;

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
    queryKey: ["owner_trend_data", schoolId, activeCampusId],
    queryFn: async () => {
      if (!schoolId) return [];
      const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];

      for (let i = 11; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i));
        const end = startOfMonth(subMonths(new Date(), i - 1));

        const [paymentsRes, expensesRes] = await Promise.all([
          campusEq(
            api
              .from("fee_payments")
              .select("amount,campus_id")
              .eq("school_id", schoolId)
              .eq("status", "success")
              .gte("paid_at", start.toISOString())
              .lt("paid_at", end.toISOString())
          ),
          api
            .from("finance_expenses")
            .select("amount")
            .eq("school_id", schoolId)
            .gte("expense_date", start.toISOString().split("T")[0])
            .lt("expense_date", end.toISOString().split("T")[0]),
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

    if (kpis.conversionRate != null && kpis.conversionRate < 20) {
      list.push({
        type: "warning",
        message: `Admission conversion rate is ${kpis.conversionRate}% - below industry average`,
        action: "Review CRM funnel",
      });
    }

    if (kpis.attendanceRate != null && kpis.attendanceRate < 85) {
      list.push({
        type: "warning",
        message: `7-day attendance is ${kpis.attendanceRate}% - requires attention`,
        action: "Check attendance patterns",
      });
    }

    if (kpis.profitMargin != null && kpis.profitMargin > 15) {
      list.push({
        type: "success",
        message: `Profit margin is healthy at ${kpis.profitMargin}%`,
      });
    }

    if (kpis.collectionRate != null && kpis.collectionRate < 80) {
      list.push({
        type: "warning",
        message: `Fee collection rate at ${kpis.collectionRate}% - ${kpis.pendingInvoices} pending invoices`,
        action: "Review defaulters",
      });
    }

    if (kpis.dropoutRisk != null && kpis.dropoutRisk > 5) {
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

  const { data: campusesList = [] } = useQuery({
    queryKey: ["owner_campuses_brief", schoolId],
    queryFn: async () => {
      if (!schoolId) return [];
      const { data } = await api.from("campuses").select("id,name,slug,code").eq("school_id", schoolId).order("name");
      return data || [];
    },
    enabled: !!schoolId,
  });
  const currentCampus = campusesList.find((c: any) => c.id === activeCampusId);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchKpis();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Loading executive dashboard…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground">Executive Command Center</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/25 text-[10px] sm:text-[11px] font-bold gap-1.5 py-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live
            </Badge>
            {currentCampus ? (
              <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 text-[11px] sm:text-xs font-semibold gap-1.5 py-0.5 sm:py-1 px-2.5 sm:px-3">
                <Building2 className="h-3.5 w-3.5" /> Scope: {currentCampus.name}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground text-[11px] sm:text-xs font-medium gap-1.5 py-0.5 sm:py-1 px-2.5 sm:px-3">
                <Building2 className="h-3.5 w-3.5" /> Scope: All Campuses
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="rounded-xl text-xs w-full sm:w-auto justify-center">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh Data
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { icon: GraduationCap, label: "Total Students", val: kpis?.totalStudents || 0, color: "text-primary" },
          { icon: Coins, label: "Revenue (MTD)", val: formatCurrency(kpis?.revenueMtd || 0), color: "text-emerald-600" },
          { icon: BarChart3, label: "Profit (MTD)", val: formatCurrency(kpis?.profit || 0), color: "text-blue-600" },
          { icon: Activity, label: "7d Attendance", val: kpis?.attendanceRate != null ? `${kpis.attendanceRate}%` : "—", color: "text-purple-600" },
          { icon: TrendingUp, label: "Open Leads", val: kpis?.openLeads || 0, color: "text-amber-600" },
          { icon: Users, label: "Total Staff", val: kpis?.totalStaff || 0, color: "text-indigo-600" },
        ].map((item, idx) => (
          <MotionCard key={idx} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="cursor-pointer hover:shadow-md transition-all">
            <CardContent className="p-3 sm:p-3.5">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <p className="mt-2 font-display text-base sm:text-lg font-bold tracking-tight truncate">{item.val}</p>
              <p className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate">{item.label}</p>
            </CardContent>
          </MotionCard>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">Financial Performance Trend</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              <div className="h-[240px] sm:h-[270px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                    <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={formatCurrency} />
                    <Tooltip contentStyle={{ fontSize: "12px", borderRadius: "0.75rem" }} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revenueGrad)" />
                    <Area type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" fill="url(#expenseGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Card className="flex-1">
            <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> YTD Financials</CardTitle></CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><p className="text-[11px] font-semibold">Revenue (YTD)</p><p className="text-base sm:text-lg font-bold text-emerald-600 truncate">{formatCurrency(kpis?.revenueYtd || 0)}</p></div>
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20"><p className="text-[11px] font-semibold">Expenses (YTD)</p><p className="text-base sm:text-lg font-bold text-red-600 truncate">{formatCurrency(kpis?.expensesYtd || 0)}</p></div>
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20"><p className="text-[11px] font-semibold">Net Profit</p><p className="text-lg sm:text-xl font-black text-primary truncate">{formatCurrency((kpis?.revenueYtd || 0) - (kpis?.expensesYtd || 0))}</p></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        <div className="space-y-4 sm:space-y-6 lg:col-span-7">
          <Card>
            <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-base font-bold">Operational Health</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-4">
              {[ { label: "Fee Collection", val: kpis?.collectionRate ?? null }, { label: "Teacher Utilization", val: kpis?.teacherUtilization ?? null }, { label: "Academic Index", val: kpis?.academicIndex ?? null } ].map((m, i) => (
                <div key={i}><div className="flex justify-between text-xs sm:text-sm"><span className="font-semibold">{m.label}</span><span className="font-bold">{m.val != null ? `${m.val}%` : "—"}</span></div><Progress value={m.val ?? 0} className="mt-2 h-2 sm:h-2.5" /></div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-base font-bold">Quick Navigation</CardTitle></CardHeader>
            <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[ { label: "Academics", path: "academics" }, { label: "Admissions", path: "admissions" }, { label: "Finance", path: "fees" }, { label: "HR", path: "hr" } ].map((item) => (
                <button key={item.path} onClick={() => navigate(`${basePath}/${item.path}`)} className="flex items-center justify-center text-center gap-2 rounded-xl bg-muted/40 p-3 hover:bg-primary/10 border border-transparent text-xs font-semibold">{item.label}</button>
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4 sm:space-y-6 lg:col-span-5">
          <DashboardNotificationsBanner schoolId={schoolId} schoolSlug={schoolSlug || ""} role="school_owner" inline={true} />
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/10">
            <CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-base font-bold flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> AI Strategic Insights</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-3">
              {insights.map((insight, idx) => (
                <div key={idx} className={`p-3 sm:p-3.5 rounded-2xl border ${insight.type === "warning" ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                  <p className="text-xs font-semibold">{insight.message}</p>
                  {insight.action && <button onClick={() => navigate(`${basePath}/admissions`)} className="mt-1 text-[11px] font-bold text-primary hover:underline">{insight.action} →</button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
