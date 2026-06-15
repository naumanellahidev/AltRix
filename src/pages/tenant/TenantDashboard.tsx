import { useCallback, useMemo, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { BarChart3, LogOut, UserRound, Coins, UserPlus, ClipboardList, GraduationCap, FileText, Users } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useAuthz } from "@/hooks/useAuthz";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { useUniversalPrefetch, getCachedStats } from "@/hooks/useUniversalPrefetch";
import { isEduverseRole, roleLabel, type EduverseRole } from "@/lib/eduverse-roles";
import { TenantShell } from "@/components/tenant/TenantShell";
import { Button } from "@/components/ui/button";
const DashboardHome = lazy(() => import("@/pages/tenant/modules/DashboardHome").then(m => ({ default: m.DashboardHome })));
const AdminConsole = lazy(() => import("@/pages/tenant/modules/AdminConsole").then(m => ({ default: m.AdminConsole })));
const PresenceDebugModule = lazy(() => import("@/pages/tenant/modules/PresenceDebugModule"));
const UsersModule = lazy(() => import("@/pages/tenant/modules/UsersModule").then(m => ({ default: m.UsersModule })));
const CrmModule = lazy(() => import("@/pages/tenant/modules/CrmModule").then(m => ({ default: m.CrmModule })));
const AcademicModule = lazy(() => import("@/pages/tenant/modules/AcademicModule").then(m => ({ default: m.AcademicModule })));
const AttendanceModule = lazy(() => import("@/pages/tenant/modules/AttendanceModule").then(m => ({ default: m.AttendanceModule })));
const PlatformSchoolsModule = lazy(() => import("@/pages/tenant/modules/PlatformSchoolsModule").then(m => ({ default: m.PlatformSchoolsModule })));
const ReportsModule = lazy(() => import("@/pages/tenant/modules/ReportsModule").then(m => ({ default: m.ReportsModule })));
const PrincipalHome = lazy(() => import("@/pages/tenant/role-homes/PrincipalHome").then(m => ({ default: m.PrincipalHome })));
const VicePrincipalHome = lazy(() => import("@/pages/tenant/role-homes/VicePrincipalHome").then(m => ({ default: m.VicePrincipalHome })));
const CounselorHome = lazy(() => import("@/pages/tenant/role-homes/CounselorHome").then(m => ({ default: m.CounselorHome })));
const AcademicCoordinatorHome = lazy(() => import("@/pages/tenant/role-homes/AcademicCoordinatorHome").then(m => ({ default: m.AcademicCoordinatorHome })));
const SupportModule = lazy(() => import("@/pages/tenant/modules/SupportModule").then(m => ({ default: m.SupportModule })));
const DirectoryModule = lazy(() => import("@/pages/tenant/modules/DirectoryModule").then(m => ({ default: m.DirectoryModule })));
const TimetableBuilderModule = lazy(() => import("@/pages/tenant/modules/TimetableBuilderModule").then(m => ({ default: m.TimetableBuilderModule })));
const MessagesModule = lazy(() => import("@/pages/tenant/modules/MessagesModule").then(m => ({ default: m.MessagesModule })));
const HrLeavesModule = lazy(() => import("@/pages/tenant/hr-modules/HrLeavesModule").then(m => ({ default: m.HrLeavesModule })));
const HrSalariesModule = lazy(() => import("@/pages/tenant/hr-modules/HrSalariesModule").then(m => ({ default: m.HrSalariesModule })));
const HrContractsModule = lazy(() => import("@/pages/tenant/hr-modules/HrContractsModule").then(m => ({ default: m.HrContractsModule })));
const HrReviewsModule = lazy(() => import("@/pages/tenant/hr-modules/HrReviewsModule").then(m => ({ default: m.HrReviewsModule })));
const HrDocumentsModule = lazy(() => import("@/pages/tenant/hr-modules/HrDocumentsModule").then(m => ({ default: m.HrDocumentsModule })));
const HrAttendanceModule = lazy(() => import("@/pages/tenant/hr-modules/HrAttendanceModule").then(m => ({ default: m.HrAttendanceModule })));
const MarketingLeadsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingLeadsModule").then(m => ({ default: m.MarketingLeadsModule })));
const MarketingFollowUpsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingFollowUpsModule").then(m => ({ default: m.MarketingFollowUpsModule })));
const MarketingCallsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCallsModule").then(m => ({ default: m.MarketingCallsModule })));
const MarketingSourcesModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingSourcesModule").then(m => ({ default: m.MarketingSourcesModule })));
const MarketingCampaignsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCampaignsModule").then(m => ({ default: m.MarketingCampaignsModule })));
const AccountantFeesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantFeesModule").then(m => ({ default: m.AccountantFeesModule })));
const FeesUnifiedModule = lazy(() => import("@/pages/tenant/modules/FeesUnifiedModule"));
const OwnerFinanceModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerFinanceModule").then(m => ({ default: m.OwnerFinanceModule })));

const AccountantInvoicesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantInvoicesModule").then(m => ({ default: m.AccountantInvoicesModule })));
const AccountantPaymentsModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantPaymentsModule").then(m => ({ default: m.AccountantPaymentsModule })));
const AccountantExpensesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantExpensesModule").then(m => ({ default: m.AccountantExpensesModule })));
const AccountantPayrollModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantPayrollModule").then(m => ({ default: m.AccountantPayrollModule })));
const AccountantLedgerModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantLedgerModule").then(m => ({ default: m.AccountantLedgerModule })));
const AccountantVendorsModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantVendorsModule").then(m => ({ default: m.AccountantVendorsModule })));
const AccountantTaxModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantTaxModule").then(m => ({ default: m.AccountantTaxModule })));
const NoticesModule = lazy(() => import("@/pages/tenant/modules/NoticesModule"));
const HolidaysModule = lazy(() => import("@/pages/tenant/modules/HolidaysModule"));
const DiaryModule = lazy(() => import("@/pages/tenant/modules/DiaryModule"));
const ExamsModule = lazy(() => import("@/pages/tenant/modules/ExamsModule"));
const ReportCardModule = lazy(() => import("@/pages/tenant/modules/ReportCardModule"));
const PrincipalComplaintsModule = lazy(() => import("@/pages/tenant/modules/PrincipalComplaintsModule"));
const PrincipalParentNotesModule = lazy(() => import("@/pages/tenant/modules/PrincipalParentNotesModule"));
const FeesAdvancedModule = lazy(() => import("@/pages/tenant/modules/FeesAdvancedModule"));
const AdmissionsModule = lazy(() => import("@/pages/tenant/modules/AdmissionsModule"));
const FeeVouchersModule = lazy(() => import("@/pages/tenant/modules/FeeVouchersModule"));
import { RouteGuard } from "@/components/tenant/RouteGuard";
import { createCatalogRouteElements } from "@/components/tenant/AutoCatalogRoutes";
const AICounselorMode = lazy(() => import("@/components/ai/AICounselorMode").then(m => ({ default: m.AICounselorMode })));
const CounselingModule = lazy(() => import("@/pages/tenant/modules/CounselingModule").then(m => ({ default: m.CounselingModule })));
const AttendanceHeatmapPage = lazy(() => import("@/pages/tenant/principal/AttendanceHeatmapPage"));
const CollaborationHubPage = lazy(() => import("@/components/principal/CollaborationHub").then(m => ({ default: m.CollaborationHub })));
const BudgetSimulatorPage = lazy(() => import("@/pages/tenant/principal/BudgetSimulatorPage"));

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const TenantDashboard = () => {
  const { schoolSlug, role: roleParam } = useParams();
  // Support route aliases that are nicer than DB enum values.
  const roleAlias = useMemo(() => {
    if (!roleParam) return null;
    if (roleParam === "hr") return "hr_manager";
    if (roleParam === "marketing") return "marketing_staff";
    return roleParam;
  }, [roleParam]);
  const role = (isEduverseRole(roleAlias) ? roleAlias : null) as EduverseRole | null;
  
  // Use optimized tenant hook with caching
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const schoolId = useMemo(() => 
    tenant.status === "ready" ? tenant.schoolId : null, 
    [tenant.status, tenant.schoolId]
  );

  // Use optimized authorization hook with caching
  const authz = useAuthz({
    schoolId,
    userId: user?.id ?? null,
    role: role ?? undefined,
  });
  const authzState = authz.state;
  const authzMessage = authz.message;


  // Universal prefetch for offline support
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

  const title = useMemo(() => {
    if (tenant.status === "ready" && role) return `${tenant.school?.name} • ${roleLabel[role]}`;
    if (tenant.status === "ready") return tenant.school?.name || "AltRix";
    return "AltRix";
  }, [tenant.status, tenant.school, role]);

  // Calculate month start for MTD queries
  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  // 7 days ago for attendance
  const d7Ago = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);

  // Get cached stats for offline mode
  const cachedKPIs = useMemo(() => {
    if (!schoolId) return null;
    return getCachedStats(schoolId, 'admin') as Record<string, number> | null;
  }, [schoolId]);

  // Realtime invalidation callback - only when online
  const invalidateKpiQueries = useCallback(() => {
    if (!navigator.onLine) return;
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_revenue", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_leads", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_attendance", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_students", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_invoices", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard_kpi_staff", schoolId] });
  }, [queryClient, schoolId]);

  // Realtime subscriptions for KPIs - only when online
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  useRealtimeTable({
    channel: `dashboard-kpi-payments-${schoolId}`,
    table: "fee_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  useRealtimeTable({
    channel: `dashboard-kpi-leads-${schoolId}`,
    table: "crm_leads",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  useRealtimeTable({
    channel: `dashboard-kpi-attendance-${schoolId}`,
    table: "attendance_entries",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  useRealtimeTable({
    channel: `dashboard-kpi-students-${schoolId}`,
    table: "students",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  useRealtimeTable({
    channel: `dashboard-kpi-invoices-${schoolId}`,
    table: "fee_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  useRealtimeTable({
    channel: `dashboard-kpi-staff-${schoolId}`,
    table: "school_memberships",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId && isOnline,
    onChange: invalidateKpiQueries,
  });

  // Fetch Revenue (MTD payments)
  const { data: revenueMtd = cachedKPIs?.revenueMtd ?? 0 } = useQuery({
    queryKey: ["dashboard_kpi_revenue", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/dashboard");
        return resp.data.collected_fees ?? 0;
      }
      const { data, error } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("school_id", schoolId!)
        .eq("status", "success")
        .gte("paid_at", monthStart.toISOString())
        .limit(1000);
      if (error) throw error;
      return (data || []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Admissions (leads count & open leads)
  const { data: leadsData } = useQuery({
    queryKey: ["dashboard_kpi_leads", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/dashboard");
        return {
          total: resp.data.total_leads ?? 0,
          open: resp.data.open_leads ?? 0,
        };
      }
      const [totalRes, openRes] = await Promise.all([
        supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).not("stage_id", "is", null),
      ]);
      return {
        total: totalRes.count ?? 0,
        open: openRes.count ?? 0,
      };
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Attendance (7-day rate)
  const { data: attendanceData } = useQuery({
    queryKey: ["dashboard_kpi_attendance", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/attendance-summary", {
          params: {
            from_date: d7Ago.toISOString().split("T")[0]
          }
        });
        return {
          total: resp.data.total ?? 0,
          present: resp.data.present ?? 0,
          rate: resp.data.attendance_rate ?? 0,
        };
      }
      const [entriesRes, presentRes] = await Promise.all([
        supabase
          .from("attendance_entries")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!)
          .gte("created_at", d7Ago.toISOString()),
        supabase
          .from("attendance_entries")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!)
          .eq("status", "present")
          .gte("created_at", d7Ago.toISOString()),
      ]);
      const total = entriesRes.count ?? 0;
      const present = presentRes.count ?? 0;
      return {
        total,
        present,
        rate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Students count
  const { data: studentsCount = cachedKPIs?.totalStudents ?? 0 } = useQuery({
    queryKey: ["dashboard_kpi_students", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/dashboard");
        return resp.data.total_students ?? 0;
      }
      const { count, error } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Pending Invoices
  const { data: pendingInvoices = cachedKPIs?.pendingInvoices ?? 0 } = useQuery({
    queryKey: ["dashboard_kpi_invoices", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/dashboard");
        return resp.data.pending_payments ?? 0;
      }
      const { count, error } = await supabase
        .from("fee_invoices")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .not("status", "eq", "paid")
        .not("status", "eq", "cancelled");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Staff count
  const { data: staffData } = useQuery({
    queryKey: ["dashboard_kpi_staff", schoolId],
    queryFn: async () => {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/reports/dashboard");
        return {
          total: resp.data.total_staff ?? 0,
          teachers: resp.data.total_teachers ?? 0,
        };
      }
      const [totalRes, teachersRes] = await Promise.all([
        supabase.from("school_memberships").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("role", "teacher"),
      ]);
      return {
        total: totalRes.count ?? 0,
        teachers: teachersRes.count ?? 0,
      };
    },
    enabled: !!schoolId && isOnline,
    staleTime: 5 * 60 * 1000,
  });

  if (!role) return <Navigate to={`/${tenant.slug || ""}/auth`} replace />;

  // Don't show loading if we have cached user
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${tenant.slug}/auth`} replace />;
  }

  // Use cached values for offline display
  const displayLeadsData = leadsData || { 
    total: cachedKPIs?.totalLeads ?? 0, 
    open: cachedKPIs?.openLeads ?? 0 
  };
  const displayAttendanceData = attendanceData || { 
    rate: cachedKPIs?.attendanceRate7d ?? 0 
  };
  const displayStaffData = staffData || { 
    total: cachedKPIs?.totalStaff ?? 0, 
    teachers: cachedKPIs?.totalTeachers ?? 0 
  };

  return (
    <TenantShell title={title} role={role} schoolSlug={tenant.slug}>
      <div className="flex flex-col gap-6">
        {/* Offline indicator */}
        {!isOnline && (
          <div className="rounded-2xl bg-warning/10 border border-warning/20 p-3 text-sm text-warning text-center">
            📶 Offline Mode — Showing cached data
          </div>
        )}

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {/* Revenue KPI */}
          <div 
            className="rounded-3xl bg-surface p-5 shadow-elevated border border-transparent hover:border-emerald-500/30 hover:shadow-emerald-500/5 cursor-pointer transition-all duration-300 group"
            onClick={() => navigate(`/${tenant.slug}/${role}/fees`)}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground group-hover:text-emerald-600 transition-colors">Revenue (MTD)</p>
              <Coins className="h-4 w-4 text-emerald-500 transition-transform group-hover:scale-110" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-emerald-600">
              ${revenueMtd.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">This month</p>
          </div>

          {/* Students KPI */}
          <div 
            className="rounded-3xl bg-surface p-5 shadow-elevated border border-transparent hover:border-primary/30 hover:shadow-primary/5 cursor-pointer transition-all duration-300 group"
            onClick={() => navigate(`/${tenant.slug}/${role}/academic`)}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors">Students</p>
              <GraduationCap className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
              {studentsCount.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Enrolled</p>
          </div>

          {/* Staff KPI */}
          <div 
            className="rounded-3xl bg-surface p-5 shadow-elevated border border-transparent hover:border-violet-500/30 hover:shadow-violet-500/5 cursor-pointer transition-all duration-300 group"
            onClick={() => navigate(`/${tenant.slug}/${role}/users`)}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground group-hover:text-violet-600 transition-colors">Staff</p>
              <Users className="h-4 w-4 text-violet-500 transition-transform group-hover:scale-110" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
              {displayStaffData.total}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{displayStaffData.teachers} teachers</p>
          </div>

          {/* Admissions KPI */}
          <div 
            className="rounded-3xl bg-surface p-5 shadow-elevated border border-transparent hover:border-blue-500/30 hover:shadow-blue-500/5 cursor-pointer transition-all duration-300 group"
            onClick={() => navigate(`/${tenant.slug}/${role}/crm`)}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground group-hover:text-blue-600 transition-colors">Admissions</p>
              <UserPlus className="h-4 w-4 text-blue-500 transition-transform group-hover:scale-110" />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
              {displayLeadsData.open}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{displayLeadsData.total} leads</p>
          </div>

          {/* Pending Invoices KPI */}
          <div 
            className="rounded-3xl bg-surface p-5 shadow-elevated border border-transparent hover:border-rose-500/30 hover:shadow-rose-500/5 cursor-pointer transition-all duration-300 group"
            onClick={() => navigate(`/${tenant.slug}/${role}/fees`)}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground group-hover:text-rose-600 transition-colors">Pending</p>
              <FileText className={`h-4 w-4 text-rose-500 transition-transform group-hover:scale-110 ${pendingInvoices > 0 ? "animate-pulse" : ""}`} />
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-rose-600">
              {pendingInvoices}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Invoices</p>
          </div>
        </div>

        {authzState === "denied" && (
          <div className="rounded-3xl bg-surface p-6 shadow-elevated">
            <div className="rounded-2xl bg-destructive/10 p-4 text-sm">
              <p className="font-medium text-destructive">Access Denied</p>
              <p className="mt-1">{authzMessage ?? "You do not have access to this role."}</p>
              <div className="mt-3">
                <Button
                  variant="hero"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate(`/${tenant.slug}/auth`);
                  }}
                >
                  Return to login
                </Button>
              </div>
            </div>
          </div>
        )}

        {authzState !== "denied" && (
          <RouteGuard>
            <Suspense fallback={<DashboardLoader />}>
              <Routes>
                <Route index element={
                  role === "principal" ? <PrincipalHome /> :
                  role === "vice_principal" ? <VicePrincipalHome /> :
                  role === "counselor" ? <CounselorHome /> :
                  role === "academic_coordinator" ? <AcademicCoordinatorHome /> :
                  <DashboardHome />
                } />
                <Route path="admin" element={<AdminConsole />} />
                <Route path="presence-debug" element={<PresenceDebugModule />} />
                <Route path="schools" element={<PlatformSchoolsModule />} />
                <Route path="messages" element={<MessagesModule schoolId={tenant.schoolId} />} />
                <Route path="users" element={<UsersModule />} />
                <Route path="directory" element={<DirectoryModule />} />
                <Route path="crm" element={<CrmModule />} />
                <Route path="leads" element={<MarketingLeadsModule />} />
                <Route path="follow-ups" element={<MarketingFollowUpsModule />} />
                <Route path="calls" element={<MarketingCallsModule />} />
                <Route path="sources" element={<MarketingSourcesModule />} />
                <Route path="campaigns" element={<MarketingCampaignsModule />} />
                <Route path="academic" element={<AcademicModule />} />
                <Route path="timetable" element={<TimetableBuilderModule />} />
                <Route path="attendance" element={<AttendanceModule />} />
                <Route path="fees" element={<FeesUnifiedModule />} />
                <Route path="finance" element={<OwnerFinanceModule schoolId={tenant.schoolId} role={role} />} />
                <Route path="invoices" element={<AccountantInvoicesModule />} />
                <Route path="payments" element={<AccountantPaymentsModule />} />
                <Route path="expenses" element={<AccountantExpensesModule />} />
                <Route path="payroll" element={<AccountantPayrollModule />} />
                <Route path="ledger" element={<AccountantLedgerModule />} />
                <Route path="vendors" element={<AccountantVendorsModule />} />
                <Route path="tax" element={<AccountantTaxModule />} />
                <Route path="fees-pro" element={<Navigate to={`/${tenant.slug}/${role}/fees?tab=advanced`} replace />} />
                <Route path="fee-vouchers" element={<Navigate to={`/${tenant.slug}/${role}/fees?tab=vouchers`} replace />} />

                <Route path="admissions" element={<AdmissionsModule />} />
                <Route path="reports" element={<ReportsModule />} />
                <Route path="leaves" element={<HrLeavesModule />} />
                <Route path="staff-attendance" element={<HrAttendanceModule />} />
                <Route path="salaries" element={<HrSalariesModule />} />
                <Route path="contracts" element={<HrContractsModule />} />
                <Route path="reviews" element={<HrReviewsModule />} />
                <Route path="documents" element={<HrDocumentsModule />} />
                <Route path="notices" element={<NoticesModule schoolId={tenant.schoolId} canManage={true} />} />
                <Route path="holidays" element={<HolidaysModule schoolId={tenant.schoolId} canManage={["principal","vice_principal","school_admin","academic_coordinator","hr_manager","school_owner","super_admin"].includes(role || "")} />} />
                <Route path="diary" element={<DiaryModule schoolId={tenant.schoolId} canManage={["teacher","principal","vice_principal","school_admin","academic_coordinator"].includes(role || "")} />} />
                <Route path="exams" element={<ExamsModule schoolId={tenant.schoolId} canManage={["teacher","principal","vice_principal","school_admin","academic_coordinator","school_owner"].includes(role || "")} />} />
                <Route path="report-cards" element={<ReportCardModule schoolId={tenant.schoolId} canManage={["teacher","principal","vice_principal","school_admin","academic_coordinator"].includes(role || "")} />} />
                <Route path="support" element={<SupportModule schoolId={tenant.schoolId} />} />
                <Route path="complaints" element={<PrincipalComplaintsModule />} />
                <Route path="parent-notes" element={<PrincipalParentNotesModule />} />
                <Route path="counseling" element={<CounselingModule schoolId={tenant.schoolId} />} />
                <Route path="ai-counselor" element={<AICounselorMode schoolId={tenant.schoolId} />} />
                {/* Principal-only extras */}
                <Route path="attendance-heatmap" element={<AttendanceHeatmapPage />} />
                <Route path="collaboration" element={<CollaborationHubPage />} />
                <Route path="budget-simulator" element={<BudgetSimulatorPage />} />
                {createCatalogRouteElements({
                  roles: role ? [role] : [],
                  ctx: { schoolId: tenant.schoolId, schoolSlug: tenant.slug, role },
                  exclude: [
                    "admin","presence-debug","schools","messages","users","directory","crm",
                    "leads","follow-ups","calls","sources","campaigns","academic","timetable",
                    "attendance","fees","fees-pro","fee-vouchers","invoices","payments",
                    "expenses","payroll","ledger","vendors","tax","admissions","reports","leaves",
                    "staff-attendance","salaries","contracts","reviews","documents","notices","holidays","diary",
                    "exams","report-cards","support","complaints","parent-notes","counseling",
                    "attendance-heatmap","collaboration","budget-simulator",
                  ],
                })}
                <Route path="*" element={<Navigate to={`/${tenant.slug}/${role}`} replace />} />
              </Routes>
            </Suspense>
          </RouteGuard>
        )}
      </div>
    </TenantShell>
  );
};

export default TenantDashboard;
