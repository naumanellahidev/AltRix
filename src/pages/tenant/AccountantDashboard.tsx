import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useMemo, lazy, Suspense } from "react";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useAuthz } from "@/hooks/useAuthz";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { AccountantShell } from "@/components/tenant/AccountantShell";

const AccountantHomeModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantHomeModule").then(m => ({ default: m.AccountantHomeModule })));
const AccountantInvoicesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantInvoicesModule").then(m => ({ default: m.AccountantInvoicesModule })));
const AccountantPaymentsModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantPaymentsModule").then(m => ({ default: m.AccountantPaymentsModule })));
const AccountantExpensesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantExpensesModule").then(m => ({ default: m.AccountantExpensesModule })));
const AccountantPayrollModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantPayrollModule").then(m => ({ default: m.AccountantPayrollModule })));
const AccountantReportsModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantReportsModule").then(m => ({ default: m.AccountantReportsModule })));
const AccountantMessagesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantMessagesModule").then(m => ({ default: m.AccountantMessagesModule })));
const AccountantLedgerModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantLedgerModule").then(m => ({ default: m.AccountantLedgerModule })));
const AccountantVendorsModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantVendorsModule").then(m => ({ default: m.AccountantVendorsModule })));
const AccountantTaxModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantTaxModule").then(m => ({ default: m.AccountantTaxModule })));
const FeesUnifiedModule = lazy(() => import("@/pages/tenant/modules/FeesUnifiedModule"));
const OwnerFinanceModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerFinanceModule").then(m => ({ default: m.OwnerFinanceModule })));

import { RouteGuard } from "@/components/tenant/RouteGuard";
import { ModuleErrorBoundary } from "@/components/tenant/ModuleErrorBoundary";
import { createCatalogRouteElements } from "@/components/tenant/AutoCatalogRoutes";
import { useFinanceRealtime } from "@/hooks/useFinanceRealtime";

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const AccountantDashboard = () => {
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
    requiredRoles: ["accountant"],
  });
  const authzState = authz.state;

  // Universal prefetch for offline support
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

  // Keep every finance tab in realtime sync
  useFinanceRealtime(schoolId);

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

  if (authzState === "denied") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          <p className="font-display text-xl font-semibold tracking-tight">Access Denied</p>
          <p className="mt-2 text-sm text-muted-foreground">You do not have Accountant access.</p>
        </div>
      </div>
    );
  }

  return (
    <AccountantShell title={`${tenant.school?.name || "AltRix"} • Finance`} subtitle="Accounting & Finance" schoolSlug={tenant.slug}>
      <RouteGuard extraAllowedPaths={[
        "finance","fees","invoices","payments","expenses","payroll","reports","messages",
        "fees-pro","fee-vouchers","ledger","vendors","tax",
      ]}>
      <Suspense fallback={<DashboardLoader />}>
        <Routes>
          <Route index element={<ModuleErrorBoundary name="Dashboard"><AccountantHomeModule /></ModuleErrorBoundary>} />
          <Route path="finance" element={<ModuleErrorBoundary name="Finance & Cashflow"><OwnerFinanceModule schoolId={schoolId} role="accountant" /></ModuleErrorBoundary>} />
          <Route path="fees" element={<ModuleErrorBoundary name="Fees Center"><FeesUnifiedModule /></ModuleErrorBoundary>} />
          <Route path="fees-pro" element={<Navigate to={`/${tenant.slug}/accountant/fees?tab=advanced`} replace />} />
          <Route path="fee-vouchers" element={<Navigate to={`/${tenant.slug}/accountant/fees?tab=vouchers`} replace />} />
          <Route path="invoices" element={<ModuleErrorBoundary name="Invoices"><AccountantInvoicesModule /></ModuleErrorBoundary>} />
          <Route path="payments" element={<ModuleErrorBoundary name="Payments"><AccountantPaymentsModule /></ModuleErrorBoundary>} />
          <Route path="expenses" element={<ModuleErrorBoundary name="Expenses"><AccountantExpensesModule /></ModuleErrorBoundary>} />
          <Route path="payroll" element={<ModuleErrorBoundary name="Payroll"><AccountantPayrollModule /></ModuleErrorBoundary>} />
          <Route path="ledger" element={<ModuleErrorBoundary name="Ledger"><AccountantLedgerModule /></ModuleErrorBoundary>} />
          <Route path="vendors" element={<ModuleErrorBoundary name="Vendors"><AccountantVendorsModule /></ModuleErrorBoundary>} />
          <Route path="tax" element={<ModuleErrorBoundary name="Tax Center"><AccountantTaxModule /></ModuleErrorBoundary>} />
          <Route path="reports" element={<ModuleErrorBoundary name="Reports"><AccountantReportsModule /></ModuleErrorBoundary>} />
          <Route path="messages" element={<ModuleErrorBoundary name="Messages"><AccountantMessagesModule /></ModuleErrorBoundary>} />
          {createCatalogRouteElements({
            roles: ["accountant"],
            ctx: { schoolId, schoolSlug: tenant.slug, role: "accountant" },
            exclude: ["fees","fees-pro","fee-vouchers","invoices","payments","expenses","payroll","ledger","vendors","tax","reports","messages"],
          })}
          <Route path="*" element={<Navigate to={`/${tenant.slug}/accountant`} replace />} />
        </Routes>
      </Suspense>
      </RouteGuard>
    </AccountantShell>
  );
};

export default AccountantDashboard;
