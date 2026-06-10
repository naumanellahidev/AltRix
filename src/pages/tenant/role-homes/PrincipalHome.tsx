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
} from "recharts";

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
      { value: "fees",         label: "Fees",         visible: perms.actions.canManageFinance },
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

  const attendanceRate = useMemo(() => {
    if (kpis.attendanceEntries7d === 0) return 0;
    return Math.round((kpis.attendancePresent7d / kpis.attendanceEntries7d) * 100);
  }, [kpis.attendanceEntries7d, kpis.attendancePresent7d]);

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
            .from("finance_payments")
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
          supabase.from("finance_invoices").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "pending"),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  return (
    <Tabs defaultValue="overview" className="space-y-4 lg:space-y-6">
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

      <TabsContent value="overview" className="space-y-4 lg:space-y-6">
        {/* Live Teacher Presence */}
        <LiveTeacherPresenceCard schoolId={schoolId} />

        {/* Real-time Alerts Panel */}
        {alerts.length > 0 && (
          <DashboardAlertsPanel
            alerts={alerts}
            onDismiss={dismissAlert}
            onNavigate={handleAlertNavigate}
          />
        )}

      {/* Quick Actions - Top for better accessibility */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-2 sm:pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            {schoolId && <BrandingSettingsDialog schoolId={schoolId} />}
            <AlertSettingsDialog schoolId={schoolId} onSettingsChanged={refreshAlerts} />
            <AlertsSummaryBadge criticalCount={criticalCount} warningCount={warningCount} />
          </div>
        </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7">
            {schoolId && (
              <SendMessageDialog
                schoolId={schoolId}
                trigger={
                  <Button variant="soft" className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
                    <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-[10px] sm:text-xs">Message</span>
                  </Button>
                }
              />
            )}
            <Button variant="soft" onClick={() => navigate(`${basePath}/users`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Add Staff</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/academic`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Students</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/crm`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <KanbanSquare className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">CRM</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/finance`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <Coins className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Finance</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/timetable`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Timetable</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/reports`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Reports</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/fee-vouchers`)} className="h-auto flex-col gap-1 px-2 py-3 sm:gap-2 sm:py-4">
              <Coins className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-[10px] sm:text-xs">Vouchers</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl bg-surface p-3 shadow-elevated sm:rounded-3xl sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground sm:text-sm">Students</p>
            <GraduationCap className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
          </div>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">{kpis.students.toLocaleString()}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">Active enrollments</p>
        </div>

        <div className="rounded-2xl bg-surface p-3 shadow-elevated sm:rounded-3xl sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground sm:text-sm">Staff</p>
            <Users className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
          </div>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">{kpis.totalStaff.toLocaleString()}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{kpis.teachers} teachers</p>
        </div>

        <div className="rounded-2xl bg-surface p-3 shadow-elevated sm:rounded-3xl sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground sm:text-sm">Attendance</p>
            <ClipboardList className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
          </div>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">{attendanceRate}%</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">7-day rate</p>
        </div>

        <div className="rounded-2xl bg-surface p-3 shadow-elevated sm:rounded-3xl sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground sm:text-sm">Leads</p>
            <KanbanSquare className="h-3 w-3 text-muted-foreground sm:h-4 sm:w-4" />
          </div>
          <p className="mt-2 font-display text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">{kpis.openLeads.toLocaleString()}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{kpis.leads} total</p>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Classes</p>
          <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">{kpis.classes}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Sections</p>
          <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">{kpis.sections}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Pending Invoices</p>
          <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">{kpis.pendingInvoices}</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
          <p className="text-xs text-muted-foreground sm:text-sm">Net (MTD)</p>
          <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">
            {(kpis.revenueMtd - kpis.expensesMtd).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Finance Chart */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="font-display text-base sm:text-xl">Finance Overview (MTD)</CardTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">Collections vs expenses</p>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
          <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-xs text-muted-foreground sm:text-sm">Revenue</p>
              <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">{kpis.revenueMtd.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-xs text-muted-foreground sm:text-sm">Expenses</p>
              <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">{kpis.expensesMtd.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-xs text-muted-foreground sm:text-sm">Net</p>
              <p className="mt-1 font-display text-lg font-semibold sm:mt-2 sm:text-xl">
                {(kpis.revenueMtd - kpis.expensesMtd).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="h-[200px] rounded-xl border bg-surface p-2 sm:h-[260px] sm:rounded-2xl">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={trend} 
                margin={{ left: 0, right: 8, top: 10, bottom: 5 }}
              >
                <XAxis 
                  dataKey="day" 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                  height={25}
                />
                <YAxis 
                  tickLine={false} 
                  axisLine={false} 
                  width={35} 
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "11px"
                  }}
                  formatter={(value: number) => value.toLocaleString()}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--brand))" fill="hsl(var(--brand) / 0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Management Modules Grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/users`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <Users className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Staff & Users</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Manage all school personnel</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Invite staff, assign roles, manage memberships.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/academic`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <GraduationCap className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Academic Core</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Classes, students, subjects</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Manage classes, sections, enrollments.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/crm`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <KanbanSquare className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Admissions CRM</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Lead pipeline management</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Track leads, manage stages, convert to students.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/finance`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <Coins className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Finance</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Fees, invoices, expenses</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Manage fee plans, generate invoices.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/timetable`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <CalendarDays className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Timetable</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Schedule management</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Build section timetables with conflict detection.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/attendance`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <ClipboardList className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Attendance</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Track student presence</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Record attendance, view reports.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/reports`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <BarChart3 className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Reports</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Analytics & insights</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              View reports, export data, analyze metrics.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/support`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <Headphones className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Support Inbox</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Student & parent queries</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Respond to support tickets.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/directory`)}
        >
          <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 sm:h-10 sm:w-10 sm:rounded-xl">
                <BookOpen className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-sm sm:text-base">Directory</CardTitle>
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Search all records</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="hidden p-3 pt-0 sm:block sm:p-4 sm:pt-0">
            <p className="text-xs text-muted-foreground sm:text-sm">
              Search students, staff, and leads.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <Button variant="outline" onClick={refresh} disabled={busy} className="w-full">
        <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Refresh Dashboard</span>
        <span className="sm:hidden">Refresh</span>
      </Button>
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
