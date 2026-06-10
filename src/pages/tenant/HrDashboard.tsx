import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useMemo, lazy, Suspense } from "react";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useAuthz } from "@/hooks/useAuthz";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { HrShell } from "@/components/tenant/HrShell";

const HrHomeModule = lazy(() => import("@/pages/tenant/hr-modules/HrHomeModule").then(m => ({ default: m.HrHomeModule })));
const HrUsersModule = lazy(() => import("@/pages/tenant/hr-modules/HrUsersModule").then(m => ({ default: m.HrUsersModule })));
const HrLeavesModule = lazy(() => import("@/pages/tenant/hr-modules/HrLeavesModule").then(m => ({ default: m.HrLeavesModule })));
const HrAttendanceModule = lazy(() => import("@/pages/tenant/hr-modules/HrAttendanceModule").then(m => ({ default: m.HrAttendanceModule })));
const HrSalariesModule = lazy(() => import("@/pages/tenant/hr-modules/HrSalariesModule").then(m => ({ default: m.HrSalariesModule })));
const HrContractsModule = lazy(() => import("@/pages/tenant/hr-modules/HrContractsModule").then(m => ({ default: m.HrContractsModule })));
const HrReviewsModule = lazy(() => import("@/pages/tenant/hr-modules/HrReviewsModule").then(m => ({ default: m.HrReviewsModule })));
const HrDocumentsModule = lazy(() => import("@/pages/tenant/hr-modules/HrDocumentsModule").then(m => ({ default: m.HrDocumentsModule })));
const HrSupportModule = lazy(() => import("@/pages/tenant/hr-modules/HrSupportModule").then(m => ({ default: m.HrSupportModule })));
const HrMessagesModule = lazy(() => import("@/pages/tenant/hr-modules/HrMessagesModule").then(m => ({ default: m.HrMessagesModule })));
const HrRecruitmentModule = lazy(() => import("@/pages/tenant/hr-modules/HrRecruitmentModule").then(m => ({ default: m.HrRecruitmentModule })));
const HrOnboardingModule = lazy(() => import("@/pages/tenant/hr-modules/HrOnboardingModule").then(m => ({ default: m.HrOnboardingModule })));
const HrOffboardingModule = lazy(() => import("@/pages/tenant/hr-modules/HrOffboardingModule").then(m => ({ default: m.HrOffboardingModule })));
const HrPayrollModule = lazy(() => import("@/pages/tenant/hr-modules/HrPayrollModule").then(m => ({ default: m.HrPayrollModule })));
const HrAnalyticsModule = lazy(() => import("@/pages/tenant/hr-modules/HrAnalyticsModule").then(m => ({ default: m.HrAnalyticsModule })));
const NoticesModule = lazy(() => import("@/pages/tenant/modules/NoticesModule"));
const HolidaysModule = lazy(() => import("@/pages/tenant/modules/HolidaysModule"));
import { RouteGuard } from "@/components/tenant/RouteGuard";

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const HrDashboard = () => {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();

  const schoolId = useMemo(() =>
    tenant.status === "ready" ? tenant.schoolId : null,
    [tenant.status, tenant.schoolId]
  );

  const authz = useAuthz({
    schoolId,
    userId: user?.id ?? null,
    requiredRoles: ["hr_manager"],
  });
  const authzState = authz.state;

  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

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

  if (authzState === "denied") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          <p className="font-display text-xl font-semibold tracking-tight">Access Denied</p>
          <p className="mt-2 text-sm text-muted-foreground">You do not have HR Manager access.</p>
        </div>
      </div>
    );
  }

  return (
    <HrShell title={`${tenant.school?.name || "AltRix"} • HR`} subtitle="Human Resources" schoolSlug={tenant.slug}>
      <RouteGuard extraAllowedPaths={[
        "users","leaves","attendance","salaries","contracts","reviews","documents",
        "support","messages","notices","holidays",
        "recruitment","onboarding","offboarding","payroll","analytics",
      ]}>
      <Suspense fallback={<DashboardLoader />}>
        <Routes>
          <Route index element={<HrHomeModule />} />
          <Route path="users" element={<HrUsersModule />} />
          <Route path="recruitment" element={<HrRecruitmentModule />} />
          <Route path="onboarding" element={<HrOnboardingModule />} />
          <Route path="offboarding" element={<HrOffboardingModule />} />
          <Route path="leaves" element={<HrLeavesModule />} />
          <Route path="attendance" element={<HrAttendanceModule />} />
          <Route path="salaries" element={<HrSalariesModule />} />
          <Route path="payroll" element={<HrPayrollModule />} />
          <Route path="contracts" element={<HrContractsModule />} />
          <Route path="reviews" element={<HrReviewsModule />} />
          <Route path="documents" element={<HrDocumentsModule />} />
          <Route path="analytics" element={<HrAnalyticsModule />} />
          <Route path="support" element={<HrSupportModule />} />
          <Route path="messages" element={<HrMessagesModule />} />
          <Route path="notices" element={<NoticesModule schoolId={schoolId} canManage={true} />} />
          <Route path="holidays" element={<HolidaysModule schoolId={schoolId} canManage={true} />} />
          <Route path="*" element={<Navigate to={`/${tenant.slug}/hr`} replace />} />
        </Routes>
      </Suspense>
      </RouteGuard>
    </HrShell>
  );
};

export default HrDashboard;
