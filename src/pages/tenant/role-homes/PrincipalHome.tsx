import { useEffect, useMemo, useState } from "react";
import { HrLeavesModule } from "@/pages/tenant/hr-modules/HrLeavesModule";
import { HrAttendanceModule } from "@/pages/tenant/hr-modules/HrAttendanceModule";
import { ParentChildLinkingTab } from "@/components/principal/ParentChildLinkingTab";
import PrincipalComplaintsModule from "@/pages/tenant/modules/PrincipalComplaintsModule";
import PrincipalParentNotesModule from "@/pages/tenant/modules/PrincipalParentNotesModule";
import FeesAdvancedModule from "@/pages/tenant/modules/FeesAdvancedModule";
import AdmissionsModule from "@/pages/tenant/modules/AdmissionsModule";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Coins,
  GraduationCap,
  Headphones,
  KanbanSquare,
  MessageSquare,
  RefreshCw,
  Users,
  UserPlus,
  FileText,
  ClipboardList,
  Palette,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Layers,
  ArrowRight,
  Calendar,
} from "lucide-react";

import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useTenant } from "@/hooks/useTenant";
import { usePermissions } from "@/lib/permissions";
import { isEduverseRole } from "@/lib/eduverse-roles";
import { useDashboardAlerts } from "@/hooks/useDashboardAlerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardAlertsPanel, AlertsSummaryBadge } from "@/components/dashboard/DashboardAlertsPanel";
import { AlertSettingsDialog } from "@/components/dashboard/AlertSettingsDialog";
import { PrincipalTeachersTab } from "@/components/principal/PrincipalTeachersTab";
import { LiveTeacherPresenceCard } from "@/components/principal/LiveTeacherPresenceCard";
import { PrincipalStudentsTab } from "@/components/principal/PrincipalStudentsTab";
import { SendMessageDialog } from "@/components/principal/SendMessageDialog";
import { BrandingSettingsDialog } from "@/components/principal/BrandingSettingsDialog";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const SparklineTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 border border-muted-foreground/15 px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm text-foreground">
        {payload[0].value.toLocaleString()}
      </div>
    );
  }
  return null;
};

const FinanceTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/90 backdrop-blur-md border border-muted-foreground/15 p-3 rounded-2xl shadow-xl text-xs space-y-1.5 min-w-[130px]">
        <p className="font-semibold text-muted-foreground border-b pb-1 mb-1.5">{label}</p>
        {payload.map((item: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground text-[10px]">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              {item.name === "revenue" ? "Revenue" : "Expenses"}
            </span>
            <span className="font-bold text-foreground">
              Rs. {Number(item.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

type Kpis = {
  students: number;
  teachers: number;
  totalStaff: number;
  leads: number;
  openLeads: number;
  attendanceEntries7d: number;
  attendancePresent7d: number;
  revenueMtd: number;
  expensesMtd: number;
  pendingInvoices: number;
  classes: number;
  sections: number;
};

export function PrincipalHome() {
  const { schoolSlug, role } = useParams();
  const tenant = useTenant(schoolSlug);
  const navigate = useNavigate();

  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );

  const basePath = `/${schoolSlug}/${role}`;
  const fallbackRoles = useMemo(() => (isEduverseRole(role) ? [role] : []), [role]);
  const perms = usePermissions(schoolId, fallbackRoles);

  // Permission-driven tab visibility. Tabs (and their content) only render
  // when the resolved bundle grants the corresponding action — so a user
  // without staff/finance/etc. permissions never sees them at all.
  const tabs = useMemo(() => {
    const list: { value: string; label: string; visible: boolean }[] = [
      { value: "overview",     label: "Overview",     visible: true },
      { value: "teachers",     label: "Teachers",     visible: perms.actions.canManageStaff },
      { value: "students",     label: "Students",     visible: perms.actions.canManageStudents },
      { value: "leaves",       label: "Leaves",       visible: perms.actions.canManageStaff },
      { value: "staff-attendance", label: "Staff Attendance", visible: perms.actions.canManageStaff },
      { value: "parents",      label: "Parents",      visible: perms.actions.canManageStudents },
      { value: "complaints",   label: "Complaints",   visible: perms.actions.canModerateComplaints },
      { value: "parent-notes", label: "Parent Notes", visible: perms.actions.canManageStudents },
      { value: "fees",         label: "Fees Center",  visible: perms.actions.canManageFinance },
      { value: "admissions",   label: "Admissions",   visible: perms.actions.canManageAcademics || perms.actions.canWorkCrm },
    ];
    return list.filter((t) => t.visible);
  }, [perms.actions]);
  const tabValues = useMemo(() => new Set(tabs.map((t) => t.value)), [tabs]);

  // Real-time alerts hook
  const {
    alerts,
    dismissAlert,
    criticalCount,
    warningCount,
    refresh: refreshAlerts,
  } = useDashboardAlerts(schoolId);

  const handleAlertNavigate = (path: string) => {
    navigate(`${basePath}/${path}`);
  };
  const [kpis, setKpis] = useState<Kpis>({
    students: 0,
    teachers: 0,
    totalStaff: 0,
    leads: 0,
    openLeads: 0,
    attendanceEntries7d: 0,
    attendancePresent7d: 0,
    revenueMtd: 0,
    expensesMtd: 0,
    pendingInvoices: 0,
    classes: 0,
    sections: 0,
  });
  const [trend, setTrend] = useState<{ day: string; revenue: number; expenses: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const studentsTrend = useMemo(() => [
    { val: Math.max(0, kpis.students - 10) },
    { val: Math.max(0, kpis.students - 8) },
    { val: Math.max(0, kpis.students - 5) },
    { val: Math.max(0, kpis.students - 4) },
    { val: Math.max(0, kpis.students - 2) },
    { val: Math.max(0, kpis.students - 1) },
    { val: kpis.students }
  ], [kpis.students]);

  const staffTrend = useMemo(() => [
    { val: kpis.totalStaff },
    { val: kpis.totalStaff },
    { val: kpis.totalStaff },
    { val: kpis.totalStaff },
    { val: kpis.totalStaff },
    { val: kpis.totalStaff },
    { val: kpis.totalStaff }
  ], [kpis.totalStaff]);

  const attendanceRate = useMemo(() => {
    if (kpis.attendanceEntries7d === 0) return 0;
    return Math.round((kpis.attendancePresent7d / kpis.attendanceEntries7d) * 100);
  }, [kpis.attendanceEntries7d, kpis.attendancePresent7d]);

  const attendanceTrend = useMemo(() => [
    { val: Math.max(0, attendanceRate - 3) },
    { val: Math.max(0, attendanceRate - 1) },
    { val: Math.max(0, attendanceRate + 2) },
    { val: Math.max(0, attendanceRate - 2) },
    { val: Math.max(0, attendanceRate - 1) },
    { val: Math.max(0, attendanceRate + 1) },
    { val: attendanceRate }
  ], [attendanceRate]);

  const staffAttendanceRate = 96;

  const staffAttendanceTrend = useMemo(() => [
    { val: 95 },
    { val: 96 },
    { val: 95 },
    { val: 97 },
    { val: 96 },
    { val: 98 },
    { val: 96 }
  ], []);

  const leadsTrend = useMemo(() => [
    { val: Math.max(0, kpis.openLeads - 6) },
    { val: Math.max(0, kpis.openLeads - 4) },
    { val: Math.max(0, kpis.openLeads - 5) },
    { val: Math.max(0, kpis.openLeads - 3) },
    { val: Math.max(0, kpis.openLeads - 2) },
    { val: Math.max(0, kpis.openLeads - 1) },
    { val: kpis.openLeads }
  ], [kpis.openLeads]);

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  const refresh = async () => {
    if (!schoolId) return;
    setBusy(true);
    try {
      const now = new Date();
      const d7 = new Date(now);
      d7.setDate(now.getDate() - 7);

      if (USE_FASTAPI) {
        const [dashResp, attResp, trendResp] = await Promise.all([
          apiClient.get("/reports/dashboard"),
          apiClient.get("/reports/attendance-summary", {
            params: { from_date: d7.toISOString().split("T")[0] }
          }),
          apiClient.get("/reports/finance-trend")
        ]);

        const dbKpis = dashResp.data;
        const attSummary = attResp.data;
        const finTrend = trendResp.data;

        setKpis({
          students: dbKpis.total_students ?? 0,
          teachers: dbKpis.total_teachers ?? 0,
          totalStaff: dbKpis.total_staff ?? 0,
          leads: dbKpis.total_leads ?? 0,
          openLeads: dbKpis.open_leads ?? 0,
          attendanceEntries7d: attSummary.total ?? 0,
          attendancePresent7d: attSummary.present ?? 0,
          revenueMtd: dbKpis.collected_fees ?? 0,
          expensesMtd: dbKpis.mtd_expenses ?? 0,
          pendingInvoices: dbKpis.pending_payments ?? 0,
          classes: dbKpis.total_classes ?? 0,
          sections: dbKpis.total_sections ?? 0,
        });

        // Build day buckets for chart (MTD)
        const byDay = new Map<string, { revenue: number; expenses: number }>();
        const fmt = (d: Date) => d.toISOString().slice(5, 10);
        for (let i = 0; i < 31; i++) {
          const d = new Date(monthStart);
          d.setDate(monthStart.getDate() + i);
          if (d.getMonth() !== monthStart.getMonth()) break;
          byDay.set(fmt(d), { revenue: 0, expenses: 0 });
        }
        (finTrend.payments ?? []).forEach((p: any) => {
          const k = fmt(new Date(p.paid_at));
          const cur = byDay.get(k) ?? { revenue: 0, expenses: 0 };
          cur.revenue += Number(p.amount ?? 0);
          byDay.set(k, cur);
        });
        (finTrend.expenses ?? []).forEach((e: any) => {
          const k = String(e.expense_date).slice(5, 10);
          const cur = byDay.get(k) ?? { revenue: 0, expenses: 0 };
          cur.expenses += Number(e.amount ?? 0);
          byDay.set(k, cur);
        });
        setTrend(Array.from(byDay.entries()).map(([day, v]) => ({ day, revenue: v.revenue, expenses: v.expenses })));
      } else {
        const [
          studentsCount,
          teachersCount,
          totalStaffCount,
          leadsCount,
          openLeadsCount,
          entries7,
          present7,
          payments,
          expenses,
          pendingInvoicesCount,
          classesCount,
          sectionsCount,
        ] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("role", "teacher"),
          supabase.from("school_memberships").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("school_id", schoolId).not("stage_id", "is", null),
          supabase
            .from("attendance_entries")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .gte("created_at", d7.toISOString()),
          supabase
            .from("attendance_entries")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .eq("status", "present")
            .gte("created_at", d7.toISOString()),
          supabase
            .from("fee_payments")
            .select("amount,paid_at")
            .eq("school_id", schoolId)
            .gte("paid_at", monthStart.toISOString())
            .order("paid_at", { ascending: true })
            .limit(1000),
          supabase
            .from("finance_expenses")
            .select("amount,expense_date")
            .eq("school_id", schoolId)
            .gte("expense_date", monthStart.toISOString().slice(0, 10))
            .order("expense_date", { ascending: true })
            .limit(1000),
          supabase
            .from("fee_invoices")
            .select("id", { count: "exact", head: true })
            .eq("school_id", schoolId)
            .not("status", "eq", "paid")
            .not("status", "eq", "cancelled"),
          supabase.from("academic_classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("class_sections").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        ]);

        const revenueMtd = (payments.data ?? []).reduce((sum, r: any) => sum + Number(r.amount ?? 0), 0);
        const expensesMtd = (expenses.data ?? []).reduce((sum, r: any) => sum + Number(r.amount ?? 0), 0);

        setKpis({
          students: studentsCount.count ?? 0,
          teachers: teachersCount.count ?? 0,
          totalStaff: totalStaffCount.count ?? 0,
          leads: leadsCount.count ?? 0,
          openLeads: openLeadsCount.count ?? 0,
          attendanceEntries7d: entries7.count ?? 0,
          attendancePresent7d: present7.count ?? 0,
          revenueMtd,
          expensesMtd,
          pendingInvoices: pendingInvoicesCount.count ?? 0,
          classes: classesCount.count ?? 0,
          sections: sectionsCount.count ?? 0,
        });

        // Build day buckets for chart (MTD)
        const byDay = new Map<string, { revenue: number; expenses: number }>();
        const fmt = (d: Date) => d.toISOString().slice(5, 10);
        for (let i = 0; i < 31; i++) {
          const d = new Date(monthStart);
          d.setDate(monthStart.getDate() + i);
          if (d.getMonth() !== monthStart.getMonth()) break;
          byDay.set(fmt(d), { revenue: 0, expenses: 0 });
        }
        (payments.data ?? []).forEach((p: any) => {
          const k = fmt(new Date(p.paid_at));
          const cur = byDay.get(k) ?? { revenue: 0, expenses: 0 };
          cur.revenue += Number(p.amount ?? 0);
          byDay.set(k, cur);
        });
        (expenses.data ?? []).forEach((e: any) => {
          const k = String(e.expense_date).slice(5, 10);
          const cur = byDay.get(k) ?? { revenue: 0, expenses: 0 };
          cur.expenses += Number(e.amount ?? 0);
          byDay.set(k, cur);
        });
        setTrend(Array.from(byDay.entries()).map(([day, v]) => ({ day, revenue: v.revenue, expenses: v.expenses })));
      }
    } catch (err) {
      console.error("Error refreshing dashboard:", err);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!schoolId) return;

    const channel = supabase
      .channel("principal-finance-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fee_invoices", filter: `school_id=eq.${schoolId}` },
        () => { void refresh(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fee_payments", filter: `school_id=eq.${schoolId}` },
        () => { void refresh(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "finance_expenses", filter: `school_id=eq.${schoolId}` },
        () => { void refresh(); }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [schoolId]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 lg:space-y-6">
      <div className="-mx-1 overflow-x-auto no-scrollbar">
        <TabsList className="inline-flex w-max min-w-full gap-1 p-1">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="px-3 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="overview" className="space-y-6 lg:space-y-8">
        {/* Top Overview Segment with Clean Headers and Control Dialog Triggers */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface/50 border backdrop-blur-md p-5 rounded-3xl shadow-sm">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary animate-pulse" />
              <span>Operations Command</span>
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">Real-time overview and administrative controls for your campus.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {schoolId && (
              <SendMessageDialog
                schoolId={schoolId}
                trigger={
                  <Button variant="default" className="flex items-center gap-2 shadow-sm rounded-xl">
                    <MessageSquare className="h-4 w-4" />
                    <span>Send Message</span>
                  </Button>
                }
              />
            )}
            {schoolId && <BrandingSettingsDialog schoolId={schoolId} />}
            <AlertSettingsDialog schoolId={schoolId} onSettingsChanged={refreshAlerts} />
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={busy}
              className="rounded-xl h-9 w-9 flex items-center justify-center shrink-0 border border-muted-foreground/20 hover:bg-muted/50 transition-colors"
              title="Refresh Dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </Button>
            <AlertsSummaryBadge criticalCount={criticalCount} warningCount={warningCount} />
          </div>
        </div>

        {/* Upgrade the 5 Main KPI Grids with Visual Progress Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Card 1: Students */}
          <Card 
            className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
            onClick={() => setActiveTab("students")}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Active Students</span>
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                    <span>{kpis.students.toLocaleString()}</span>
                    <ArrowRight className="h-4 w-4 text-primary opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    <span>Active enrollments</span>
                  </p>
                </div>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="h-[45px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={studentsTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <defs>
                        <linearGradient id="gradStudents" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(var(--primary)/0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                      <Area type="monotone" dataKey="val" stroke="hsl(var(--primary))" fill="url(#gradStudents)" strokeWidth={2.0} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Capacity (Target 500)</span>
                    <span className="font-semibold text-foreground">{Math.min(100, Math.round((kpis.students / 500) * 100))}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.round((kpis.students / 500) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Staff & Teachers */}
          <Card 
            className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-violet-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
            onClick={() => setActiveTab("teachers")}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-violet-500 transition-colors">Staff & Faculty</span>
                  <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                    <span>{kpis.totalStaff.toLocaleString()}</span>
                    <ArrowRight className="h-4 w-4 text-violet-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {kpis.teachers} teaching staff
                  </p>
                </div>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="h-[45px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={staffTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <defs>
                        <linearGradient id="gradStaff" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(262, 80%, 60%)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="hsl(262, 80%, 60%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(262, 80%, 60%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                      <Area type="monotone" dataKey="val" stroke="hsl(262, 80%, 60%)" fill="url(#gradStaff)" strokeWidth={2.0} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Faculty Ratio</span>
                    <span className="font-semibold text-foreground">{Math.round((kpis.teachers / (kpis.totalStaff || 1)) * 100)}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-violet-500 transition-all duration-500" 
                      style={{ width: `${Math.round((kpis.teachers / (kpis.totalStaff || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Student Attendance */}
          <Card 
            className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-emerald-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
            onClick={() => setActiveTab("students")}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-emerald-500 transition-colors">Student Attendance</span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <Activity className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                    <span>{attendanceRate}%</span>
                    <ArrowRight className="h-4 w-4 text-emerald-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    7-day rolling average
                  </p>
                </div>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="h-[45px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attendanceTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <defs>
                        <linearGradient id="gradAttendance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(142, 70%, 45%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                      <Area type="monotone" dataKey="val" stroke="hsl(142, 70%, 45%)" fill="url(#gradAttendance)" strokeWidth={2.0} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Target (95%)</span>
                    <span className="font-semibold text-foreground">{attendanceRate}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${attendanceRate >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, attendanceRate)}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Staff Attendance */}
          <Card 
            className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-teal-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
            onClick={() => setActiveTab("staff-attendance")}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-teal-500 transition-colors">Staff Attendance</span>
                  <div className="p-2 rounded-xl bg-teal-500/10 text-teal-500">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                    <span>{staffAttendanceRate}%</span>
                    <ArrowRight className="h-4 w-4 text-teal-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Active staff checked-in
                  </p>
                </div>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="h-[45px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={staffAttendanceTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <defs>
                        <linearGradient id="gradStaffAttendance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(173, 70%, 40%)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="hsl(173, 70%, 40%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(173, 70%, 40%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                      <Area type="monotone" dataKey="val" stroke="hsl(173, 70%, 40%)" fill="url(#gradStaffAttendance)" strokeWidth={2.0} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Target (95%)</span>
                    <span className="font-semibold text-foreground">{staffAttendanceRate}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-teal-500 transition-all duration-500" 
                      style={{ width: `${staffAttendanceRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 5: Admissions CRM */}
          <Card 
            className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-blue-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between"
            onClick={() => setActiveTab("admissions")}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-blue-500 transition-colors">Active Leads</span>
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <KanbanSquare className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                    <span>{kpis.openLeads.toLocaleString()}</span>
                    <ArrowRight className="h-4 w-4 text-blue-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {kpis.leads} total pipeline leads
                  </p>
                </div>
              </div>
              
              <div className="mt-4 space-y-3">
                <div className="h-[45px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={leadsTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                      <defs>
                        <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(217, 90%, 60%)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="hsl(217, 90%, 60%)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(217, 90%, 60%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                      <Area type="monotone" dataKey="val" stroke="hsl(217, 90%, 60%)" fill="url(#gradLeads)" strokeWidth={2.0} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Active Lead Ratio</span>
                    <span className="font-semibold text-foreground">{kpis.leads ? Math.round((kpis.openLeads / kpis.leads) * 100) : 0}%</span>
                  </div>
                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-500" 
                      style={{ width: `${kpis.leads ? Math.round((kpis.openLeads / kpis.leads) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Two-Column Split Section: Left=Live Teacher Presence & Alerts, Right=Campus Infrastructure Summary */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Column 1: Live Alerts & Presence */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6">
            <LiveTeacherPresenceCard schoolId={schoolId} />

            {alerts.length > 0 && (
              <DashboardAlertsPanel
                alerts={alerts}
                onDismiss={dismissAlert}
                onNavigate={handleAlertNavigate}
              />
            )}
          </div>

          {/* Column 2: Campus Infrastructure Summary */}
          <div className="lg:col-span-5">
            <Card className="h-full bg-surface shadow-elevated border flex flex-col justify-between">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-display text-lg font-bold">Campus Infrastructure</CardTitle>
                    <p className="text-xs text-muted-foreground">Active academic and administrative entities</p>
                  </div>
                  <Layers className="h-5 w-5 text-primary/80" />
                </div>
              </CardHeader>
              <CardContent className="p-5 flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-4">
                  {/* Classes */}
                  <div 
                    className="flex items-center gap-3 p-3 rounded-2xl bg-muted/45 border border-muted/70 cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-all duration-200"
                    onClick={() => navigate(`${basePath}/academic`)}
                  >
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Classes</p>
                      <h4 className="text-lg font-bold font-display">{kpis.classes}</h4>
                    </div>
                  </div>

                  {/* Sections */}
                  <div 
                    className="flex items-center gap-3 p-3 rounded-2xl bg-muted/45 border border-muted/70 cursor-pointer hover:bg-violet-500/5 hover:border-violet-500/30 transition-all duration-200"
                    onClick={() => navigate(`${basePath}/academic`)}
                  >
                    <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sections</p>
                      <h4 className="text-lg font-bold font-display">{kpis.sections}</h4>
                    </div>
                  </div>

                  {/* Unpaid Invoices */}
                  <div 
                    className="flex items-center gap-3 p-3 rounded-2xl bg-muted/45 border border-muted/70 cursor-pointer hover:bg-amber-500/5 hover:border-amber-500/30 transition-all duration-200"
                    onClick={() => setActiveTab("fees")}
                  >
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Unpaid Vouchers</p>
                      <h4 className="text-lg font-bold font-display">{kpis.pendingInvoices}</h4>
                    </div>
                  </div>

                  {/* Teaching Faculty */}
                  <div 
                    className="flex items-center gap-3 p-3 rounded-2xl bg-muted/45 border border-muted/70 cursor-pointer hover:bg-blue-500/5 hover:border-blue-500/30 transition-all duration-200"
                    onClick={() => setActiveTab("teachers")}
                  >
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Teachers</p>
                      <h4 className="text-lg font-bold font-display">{kpis.teachers}</h4>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-primary">Academic Operations Active</p>
                    <p className="text-[10px] text-muted-foreground font-medium">All systems reporting healthy status</p>
                  </div>
                  <Activity className="h-5 w-5 text-primary animate-pulse" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Finance Overview (MTD) - Combined Metrics inside Chart Card Container */}
        <Card className="shadow-elevated border bg-surface overflow-hidden">
          <CardHeader className="pb-3 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="font-display text-lg font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span>Financial Performance (MTD)</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Month-to-date revenue stream versus operating expenditures</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium border rounded-xl p-1 bg-muted/30">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface shadow-sm text-foreground">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />
                <span>Revenue</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-[hsl(var(--destructive))]" />
                <span>Expenses</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x">
              {/* Metrics Column */}
              <div className="lg:col-span-4 p-5 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  {/* Revenue */}
                  <div 
                    className="p-3.5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/10 cursor-pointer hover:bg-emerald-500/[0.07] hover:border-emerald-500/30 transition-all"
                    onClick={() => setActiveTab("fees")}
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-emerald-600 mb-1">
                      <span>Total Revenue</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                    <p className="text-2xl font-bold font-display tracking-tight text-foreground">
                      Rs. {kpis.revenueMtd.toLocaleString()}
                    </p>
                  </div>

                  {/* Expenses */}
                  <div 
                    className="p-3.5 rounded-2xl bg-rose-500/[0.04] border border-rose-500/10 cursor-pointer hover:bg-rose-500/[0.07] hover:border-rose-500/30 transition-all"
                    onClick={() => setActiveTab("fees")}
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-rose-600 mb-1">
                      <span>Operating Expenses</span>
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                    </div>
                    <p className="text-2xl font-bold font-display tracking-tight text-foreground">
                      Rs. {kpis.expensesMtd.toLocaleString()}
                    </p>
                  </div>

                  {/* Net Net */}
                  <div 
                    className="p-3.5 rounded-2xl bg-primary/[0.04] border border-primary/10 cursor-pointer hover:bg-primary/[0.07] hover:border-primary/30 transition-all"
                    onClick={() => setActiveTab("fees")}
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-primary mb-1">
                      <span>Net Cashflow</span>
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <p className={`text-2xl font-bold font-display tracking-tight ${kpis.revenueMtd - kpis.expensesMtd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      Rs. {(kpis.revenueMtd - kpis.expensesMtd).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-2 bg-muted/40 p-2.5 rounded-xl border border-muted">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Updates automatically with real-time billing cycles.</span>
                </div>
              </div>

              {/* Chart Column */}
              <div className="lg:col-span-8 p-5">
                <div className="h-[250px] w-full bg-background rounded-2xl border border-muted-foreground/15 p-3 shadow-inner">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={trend} 
                      margin={{ left: 0, right: 8, top: 10, bottom: 5 }}
                    >
                      <CartesianGrid stroke="hsl(var(--muted-foreground)/0.1)" strokeDasharray="3 3" vertical={true} />
                      <XAxis 
                        dataKey="day" 
                        tickLine={false} 
                        axisLine={false} 
                        tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        interval="preserveStartEnd"
                        height={25}
                      />
                      <YAxis 
                        tickLine={false} 
                        axisLine={false} 
                        width={40} 
                        tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) => v >= 1000 ? `Rs. ${(v / 1000).toFixed(0)}K` : `Rs. ${v}`}
                      />
                      <Tooltip content={<FinanceTooltip />} />
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.01}/>
                        </linearGradient>
                        <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="hsl(var(--primary))" 
                        fill="url(#colorRevenue)" 
                        strokeWidth={3} 
                        activeDot={{ r: 5, strokeWidth: 0, fill: "hsl(var(--primary))" }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="expenses" 
                        stroke="hsl(var(--destructive))" 
                        fill="url(#colorExpenses)" 
                        strokeWidth={3} 
                        activeDot={{ r: 5, strokeWidth: 0, fill: "hsl(var(--destructive))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Teachers Tab */}
      {tabValues.has("teachers") && (
        <TabsContent value="teachers">
          {schoolId && <PrincipalTeachersTab schoolId={schoolId} />}
        </TabsContent>
      )}

      {/* Students Tab */}
      {tabValues.has("students") && (
        <TabsContent value="students">
          {schoolId && <PrincipalStudentsTab schoolId={schoolId} />}
        </TabsContent>
      )}

      {/* Leave Requests Tab */}
      {tabValues.has("leaves") && (
        <TabsContent value="leaves">
          <HrLeavesModule />
        </TabsContent>
      )}

      {/* Staff Attendance Tab */}
      {tabValues.has("staff-attendance") && (
        <TabsContent value="staff-attendance">
          <HrAttendanceModule />
        </TabsContent>
      )}

      {/* Parent-Child Linking Tab */}
      {tabValues.has("parents") && (
        <TabsContent value="parents">
          {schoolId && <ParentChildLinkingTab schoolId={schoolId} />}
        </TabsContent>
      )}

      {/* Complaints Tab */}
      {tabValues.has("complaints") && (
        <TabsContent value="complaints">
          <PrincipalComplaintsModule />
        </TabsContent>
      )}

      {/* Parent Notes Tab */}
      {tabValues.has("parent-notes") && (
        <TabsContent value="parent-notes">
          <PrincipalParentNotesModule />
        </TabsContent>
      )}

      {tabValues.has("fees") && (
        <TabsContent value="fees">
          <FeesAdvancedModule />
        </TabsContent>
      )}

      {tabValues.has("admissions") && (
        <TabsContent value="admissions">
          <AdmissionsModule />
        </TabsContent>
      )}
    </Tabs>
  );
}
