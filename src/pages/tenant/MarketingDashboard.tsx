import { useMemo, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useAuthz } from "@/hooks/useAuthz";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { MarketingShell } from "@/components/tenant/MarketingShell";

const MarketingHomeModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingHomeModule").then(m => ({ default: m.MarketingHomeModule })));
const MarketingLeadsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingLeadsModule").then(m => ({ default: m.MarketingLeadsModule })));
const MarketingFollowUpsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingFollowUpsModule").then(m => ({ default: m.MarketingFollowUpsModule })));
const MarketingCallsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCallsModule").then(m => ({ default: m.MarketingCallsModule })));
const MarketingSourcesModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingSourcesModule").then(m => ({ default: m.MarketingSourcesModule })));
const MarketingCampaignsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCampaignsModule").then(m => ({ default: m.MarketingCampaignsModule })));
const MarketingReportsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingReportsModule").then(m => ({ default: m.MarketingReportsModule })));
const MarketingMessagesModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingMessagesModule").then(m => ({ default: m.MarketingMessagesModule })));
const MarketingTemplatesModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingTemplatesModule").then(m => ({ default: m.MarketingTemplatesModule })));
const MarketingIntakeModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingIntakeModule").then(m => ({ default: m.MarketingIntakeModule })));
import { RouteGuard } from "@/components/tenant/RouteGuard";

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const MarketingDashboard = () => {
  const { schoolSlug } = useParams();
  
  // Use optimized hooks with caching
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();

  const schoolId = useMemo(() => 
    tenant.status === "ready" ? tenant.schoolId : null, 
    [tenant.status, tenant.schoolId]
  );

  // Use optimized authorization hook
  const authz = useAuthz({
    schoolId,
    userId: user?.id ?? null,
    requiredRoles: ["marketing_staff", "counselor"],
  });
  const authzState = authz.state;

  // Universal prefetch for offline support
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

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

  if (!user) return <Navigate to={`/${tenant.slug}/auth`} replace />;

  if (authzState === "denied") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          <p className="font-display text-xl font-semibold tracking-tight">Access Denied</p>
          <p className="mt-2 text-sm text-muted-foreground">You do not have Marketing/CRM access.</p>
        </div>
      </div>
    );
  }

  return (
    <MarketingShell title={`${tenant.school?.name || "AltRix"} • Marketing`} subtitle="CRM & campaigns" schoolSlug={tenant.slug}>
      <RouteGuard extraAllowedPaths={[
        "leads","follow-ups","calls","sources","campaigns","reports",
        "messages","templates","intake"
      ]}>
      <Suspense fallback={<DashboardLoader />}>
        <Routes>
          <Route index element={<MarketingHomeModule />} />
          <Route path="leads" element={<MarketingLeadsModule />} />
          <Route path="follow-ups" element={<MarketingFollowUpsModule />} />
          <Route path="calls" element={<MarketingCallsModule />} />
          <Route path="sources" element={<MarketingSourcesModule />} />
          <Route path="campaigns" element={<MarketingCampaignsModule />} />
          <Route path="reports" element={<MarketingReportsModule />} />
          <Route path="messages" element={<MarketingMessagesModule />} />
          <Route path="templates" element={<MarketingTemplatesModule />} />
          <Route path="intake" element={<MarketingIntakeModule />} />
          <Route path="*" element={<Navigate to={`/${tenant.slug}/marketing`} replace />} />
        </Routes>
      </Suspense>
      </RouteGuard>
    </MarketingShell>
  );
};

export default MarketingDashboard;
