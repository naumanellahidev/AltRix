import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Coins,
  GraduationCap,
  Headphones,
  KanbanSquare,
  RefreshCw,
  Users,
  UserPlus,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useDashboardAlerts } from "@/hooks/useDashboardAlerts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAlertsPanel, AlertsSummaryBadge } from "@/components/dashboard/DashboardAlertsPanel";
import { AlertSettingsDialog } from "@/components/dashboard/AlertSettingsDialog";
import { ActivityTimelineWidget } from "@/components/dashboard/ActivityTimelineWidget";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type Kpis = {
  students: number;
  teachers: number;
  totalStaff: number;
  leads: number;
  openLeads: number;
  attendanceEntries7d: number;
  attendancePresent7d: number;
  attendanceLate7d: number;
  attendanceAbsent7d: number;
  revenueMtd: number;
  expensesMtd: number;
  pendingInvoices: number;
  classes: number;
  sections: number;
  assignmentsPending: number;
};

const COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--brand))", "hsl(var(--muted))"];

export function VicePrincipalHome() {
  const { schoolSlug, role } = useParams();
  const tenant = useTenant(schoolSlug);
  const navigate = useNavigate();

  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );

  const basePath = `/${schoolSlug}/${role}`;

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
    attendanceLate7d: 0,
    attendanceAbsent7d: 0,
    revenueMtd: 0,
    expensesMtd: 0,
    pendingInvoices: 0,
    classes: 0,
    sections: 0,
    assignmentsPending: 0,
  });
  const [trend, setTrend] = useState<{ day: string; revenue: number; expenses: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const attendanceRate = useMemo(() => {
    if (kpis.attendanceEntries7d === 0) return 0;
    return Math.round((kpis.attendancePresent7d / kpis.attendanceEntries7d) * 100);
  }, [kpis.attendanceEntries7d, kpis.attendancePresent7d]);

  const attendancePieData = useMemo(() => {
    return [
      { name: "Present", value: kpis.attendancePresent7d },
      { name: "Absent", value: kpis.attendanceAbsent7d },
      { name: "Late", value: kpis.attendanceLate7d },
      { name: "Other", value: Math.max(0, kpis.attendanceEntries7d - kpis.attendancePresent7d - kpis.attendanceAbsent7d - kpis.attendanceLate7d) },
    ].filter(d => d.value > 0);
  }, [kpis]);

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

      const [
        studentsCount,
        teachersCount,
        totalStaffCount,
        leadsCount,
        openLeadsCount,
        entries7,
        present7,
        late7,
        absent7,
        payments,
        expenses,
        pendingInvoicesCount,
        classesCount,
        sectionsCount,
        pendingAssignments,
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
          .from("attendance_entries")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "late")
          .gte("created_at", d7.toISOString()),
        supabase
          .from("attendance_entries")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "absent")
          .gte("created_at", d7.toISOString()),
        supabase
          .from("fee_payments")
          .select("amount,paid_at")
          .eq("school_id", schoolId)
          .eq("status", "success")
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
        supabase.from("fee_invoices").select("id", { count: "exact", head: true }).eq("school_id", schoolId).not("status", "eq", "paid").not("status", "eq", "cancelled"),
        supabase.from("academic_classes").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("class_sections").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
        supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("school_id", schoolId).is("marks", null),
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
        attendanceLate7d: late7.count ?? 0,
        attendanceAbsent7d: absent7.count ?? 0,
        revenueMtd,
        expensesMtd,
        pendingInvoices: pendingInvoicesCount.count ?? 0,
        classes: classesCount.count ?? 0,
        sections: sectionsCount.count ?? 0,
        assignmentsPending: pendingAssignments.count ?? 0,
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
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  return (
    <div className="space-y-6">
      {/* Real-time Alerts Panel */}
      {alerts.length > 0 && (
        <DashboardAlertsPanel
          alerts={alerts}
          onDismiss={dismissAlert}
          onNavigate={handleAlertNavigate}
        />
      )}

      {/* Activity Timeline — Real-time ERP event feed */}
      <ActivityTimelineWidget />

      {/* Quick Actions - Top for better accessibility */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <div className="flex items-center gap-2">
              <AlertSettingsDialog schoolId={schoolId} onSettingsChanged={refreshAlerts} />
              <AlertsSummaryBadge criticalCount={criticalCount} warningCount={warningCount} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Button variant="soft" onClick={() => navigate(`${basePath}/users`)} className="h-auto flex-col gap-2 py-4">
              <UserPlus className="h-5 w-5" />
              <span className="text-xs">Manage Staff</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/academic`)} className="h-auto flex-col gap-2 py-4">
              <GraduationCap className="h-5 w-5" />
              <span className="text-xs">Academics</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/attendance`)} className="h-auto flex-col gap-2 py-4">
              <ClipboardList className="h-5 w-5" />
              <span className="text-xs">Attendance</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/timetable`)} className="h-auto flex-col gap-2 py-4">
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs">Timetable</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/reports`)} className="h-auto flex-col gap-2 py-4">
              <BarChart3 className="h-5 w-5" />
              <span className="text-xs">Reports</span>
            </Button>
            <Button variant="soft" onClick={() => navigate(`${basePath}/support`)} className="h-auto flex-col gap-2 py-4">
              <Headphones className="h-5 w-5" />
              <span className="text-xs">Support</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-3xl bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Students</p>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{kpis.students.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">Active enrollments</p>
        </div>

        <div className="rounded-3xl bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Teachers</p>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{kpis.teachers.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{kpis.totalStaff} total staff</p>
        </div>

        <div className="rounded-3xl bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Attendance (7d)</p>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{attendanceRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{kpis.attendanceAbsent7d} absent</p>
        </div>

        <div className="rounded-3xl bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Pending Grades</p>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight">{kpis.assignmentsPending.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">Submissions awaiting</p>
        </div>
      </div>

      {/* Attendance Breakdown & Academic Stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Attendance Breakdown (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              {attendancePieData.length > 0 ? (
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={attendancePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={65}
                      innerRadius={35}
                      labelLine={false}
                    >
                      {attendancePieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value}`, name]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance data</p>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="font-medium text-primary">{kpis.attendancePresent7d}</p>
                <p className="text-xs text-muted-foreground">Present</p>
              </div>
              <div>
                <p className="font-medium text-destructive">{kpis.attendanceAbsent7d}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </div>
              <div>
                <p className="font-medium">{kpis.attendanceLate7d}</p>
                <p className="text-xs text-muted-foreground">Late</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="text-lg">Academic Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 p-4 text-center">
                <p className="font-display text-2xl font-semibold">{kpis.classes}</p>
                <p className="text-xs text-muted-foreground">Classes</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4 text-center">
                <p className="font-display text-2xl font-semibold">{kpis.sections}</p>
                <p className="text-xs text-muted-foreground">Sections</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 p-4 text-center">
                <p className="font-display text-2xl font-semibold">{kpis.openLeads}</p>
                <p className="text-xs text-muted-foreground">Open Leads</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-4 text-center">
                <p className="font-display text-2xl font-semibold">{kpis.pendingInvoices}</p>
                <p className="text-xs text-muted-foreground">Pending Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Finance Chart */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Finance Overview (MTD)</CardTitle>
          <p className="text-sm text-muted-foreground">Collections vs expenses</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-muted-foreground">Revenue (MTD)</p>
              <p className="mt-2 font-display text-xl font-semibold">{kpis.revenueMtd.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-muted-foreground">Expenses (MTD)</p>
              <p className="mt-2 font-display text-xl font-semibold">{kpis.expensesMtd.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="text-sm text-muted-foreground">Net (MTD)</p>
              <p className="mt-2 font-display text-xl font-semibold">
                {(kpis.revenueMtd - kpis.expensesMtd).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="h-[260px] rounded-2xl border bg-surface p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                <Area type="monotone" dataKey="expenses" stroke="hsl(var(--brand))" fill="hsl(var(--brand) / 0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Management Modules Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/users`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Staff & Users</CardTitle>
                <p className="text-xs text-muted-foreground">Manage personnel</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage staff, assign roles, and handle governance actions.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/academic`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Academic Core</CardTitle>
                <p className="text-xs text-muted-foreground">Classes & students</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage classes, sections, enrollments, and teacher assignments.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/crm`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <KanbanSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Admissions CRM</CardTitle>
                <p className="text-xs text-muted-foreground">Lead management</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Track leads, manage stages, and convert prospects to students.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/fees`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Fees Center</CardTitle>
                <p className="text-xs text-muted-foreground">Fees & expenses</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Manage fees, invoices, payments, and track expenses.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/timetable`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Timetable</CardTitle>
                <p className="text-xs text-muted-foreground">Schedules</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Build and manage section timetables with conflict detection.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/attendance`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Attendance</CardTitle>
                <p className="text-xs text-muted-foreground">Track presence</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Record attendance, view reports, and monitor trends.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/reports`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Reports</CardTitle>
                <p className="text-xs text-muted-foreground">Analytics</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View attendance reports, export data, and analyze metrics.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/support`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <Headphones className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Support Inbox</CardTitle>
                <p className="text-xs text-muted-foreground">Queries</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Respond to support tickets and communication threads.
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-shadow hover:shadow-lg"
          onClick={() => navigate(`${basePath}/directory`)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Directory</CardTitle>
                <p className="text-xs text-muted-foreground">Search all</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Search students, staff, and leads across the directory.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <Button variant="outline" onClick={refresh} disabled={busy} className="w-full">
        <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        Refresh Dashboard
      </Button>
    </div>
  );
}
