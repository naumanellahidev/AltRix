import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { OwnerShell } from "@/components/tenant/OwnerShell";
import { RouteGuard } from "@/components/tenant/RouteGuard";
import { createCatalogRouteElements } from "@/components/tenant/AutoCatalogRoutes";

// Import all owner modules dynamically
const OwnerOverviewModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerOverviewModule").then(m => ({ default: m.OwnerOverviewModule })));
const OwnerAcademicsModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerAcademicsModule").then(m => ({ default: m.OwnerAcademicsModule })));
const OwnerAdmissionsModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerAdmissionsModule").then(m => ({ default: m.OwnerAdmissionsModule })));
const OwnerHrModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerHrModule").then(m => ({ default: m.OwnerHrModule })));
const OwnerFinanceModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerFinanceModule").then(m => ({ default: m.OwnerFinanceModule })));
const OwnerWellbeingModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerWellbeingModule").then(m => ({ default: m.OwnerWellbeingModule })));
const OwnerComplianceModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerComplianceModule").then(m => ({ default: m.OwnerComplianceModule })));
const OwnerCampusesModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerCampusesModule").then(m => ({ default: m.OwnerCampusesModule })));
const OwnerBrandModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerBrandModule").then(m => ({ default: m.OwnerBrandModule })));
const OwnerSecurityModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerSecurityModule").then(m => ({ default: m.OwnerSecurityModule })));
const OwnerSupportModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerSupportModule").then(m => ({ default: m.OwnerSupportModule })));
const OwnerAdvisorModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerAdvisorModule").then(m => ({ default: m.OwnerAdvisorModule })));
const OwnerAIModule = lazy(() => import("@/pages/tenant/owner-modules/OwnerAIModule").then(m => ({ default: m.OwnerAIModule })));
const MessagesModule = lazy(() => import("@/pages/tenant/modules/MessagesModule").then(m => ({ default: m.MessagesModule })));
const UsersModule = lazy(() => import("@/pages/tenant/modules/UsersModule").then(m => ({ default: m.UsersModule })));
const CrmModule = lazy(() => import("@/pages/tenant/modules/CrmModule").then(m => ({ default: m.CrmModule })));
const AcademicModule = lazy(() => import("@/pages/tenant/modules/AcademicModule").then(m => ({ default: m.AcademicModule })));
const AttendanceModule = lazy(() => import("@/pages/tenant/modules/AttendanceModule").then(m => ({ default: m.AttendanceModule })));
const ReportsModule = lazy(() => import("@/pages/tenant/modules/ReportsModule").then(m => ({ default: m.ReportsModule })));
const TimetableBuilderModule = lazy(() => import("@/pages/tenant/modules/TimetableBuilderModule").then(m => ({ default: m.TimetableBuilderModule })));
const HrLeavesModule = lazy(() => import("@/pages/tenant/hr-modules/HrLeavesModule").then(m => ({ default: m.HrLeavesModule })));
const HrSalariesModule = lazy(() => import("@/pages/tenant/hr-modules/HrSalariesModule").then(m => ({ default: m.HrSalariesModule })));
const HrContractsModule = lazy(() => import("@/pages/tenant/hr-modules/HrContractsModule").then(m => ({ default: m.HrContractsModule })));
const HrReviewsModule = lazy(() => import("@/pages/tenant/hr-modules/HrReviewsModule").then(m => ({ default: m.HrReviewsModule })));
const HrDocumentsModule = lazy(() => import("@/pages/tenant/hr-modules/HrDocumentsModule").then(m => ({ default: m.HrDocumentsModule })));
const MarketingLeadsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingLeadsModule").then(m => ({ default: m.MarketingLeadsModule })));
const MarketingFollowUpsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingFollowUpsModule").then(m => ({ default: m.MarketingFollowUpsModule })));
const MarketingCallsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCallsModule").then(m => ({ default: m.MarketingCallsModule })));
const MarketingSourcesModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingSourcesModule").then(m => ({ default: m.MarketingSourcesModule })));
const MarketingCampaignsModule = lazy(() => import("@/pages/tenant/marketing-modules/MarketingCampaignsModule").then(m => ({ default: m.MarketingCampaignsModule })));
const AccountantFeesModule = lazy(() => import("@/pages/tenant/accountant-modules/AccountantFeesModule").then(m => ({ default: m.AccountantFeesModule })));
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
const FeeVouchersModule = lazy(() => import("@/pages/tenant/modules/FeeVouchersModule"));
const FeesUnifiedModule = lazy(() => import("@/pages/tenant/modules/FeesUnifiedModule"));
const CounselingModule = lazy(() => import("@/pages/tenant/modules/CounselingModule").then(m => ({ default: m.CounselingModule })));

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

// Cache key for owner auth
const OWNER_AUTHZ_CACHE = "eduverse_owner_authz_cache_strict_v2";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface CachedOwnerAuthz {
  schoolId: string;
  userId: string;
  authorized: boolean;
  timestamp: number;
}

function getCachedOwnerAuthz(schoolId: string, userId: string): boolean | null {
  try {
    const cached = localStorage.getItem(OWNER_AUTHZ_CACHE);
    if (!cached) return null;
    const data: CachedOwnerAuthz = JSON.parse(cached);
    if (
      data.schoolId === schoolId &&
      data.userId === userId &&
      Date.now() - data.timestamp < CACHE_DURATION
    ) {
      return data.authorized;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedOwnerAuthz(schoolId: string, userId: string, authorized: boolean) {
  try {
    const data: CachedOwnerAuthz = { schoolId, userId, authorized, timestamp: Date.now() };
    localStorage.setItem(OWNER_AUTHZ_CACHE, JSON.stringify(data));
  } catch {
    // Ignore
  }
}

export default function OwnerDashboard() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();

  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );

  const [authzState, setAuthzState] = useState<"checking" | "ok" | "denied">("checking");
  const [authzMessage, setAuthzMessage] = useState<string | null>(null);

  const title = useMemo(() => {
    if (tenant.status === "ready") return `${tenant.school.name} • Owner`;
    return "AltRix • Owner";
  }, [tenant.status, tenant.school]);

  // Universal prefetch for offline support
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

  useEffect(() => {
    if (tenant.status !== "ready") return;
    if (!user) return;

    const schoolIdVal = tenant.schoolId;
    const userId = user.id;

    // Check cache first
    const cachedAuth = getCachedOwnerAuthz(schoolIdVal, userId);
    
    // If offline and we have cache, use it immediately
    if (!navigator.onLine && cachedAuth !== null) {
      setAuthzState(cachedAuth ? "ok" : "denied");
      if (!cachedAuth) {
        setAuthzMessage("You do not have the School Owner role for this institution.");
      }
      return;
    }

    // If we have valid cache, use it while we verify in background
    if (cachedAuth === true) {
      setAuthzState("ok");
      if (!navigator.onLine) return;
    } else {
      setAuthzState("checking");
    }

    // Skip network check if offline
    if (!navigator.onLine) {
      if (cachedAuth !== null) {
        setAuthzState(cachedAuth ? "ok" : "denied");
      }
      return;
    }

    let cancelled = false;

    (async () => {
      const { data: ownedSchools, error: ownerErr } = await (supabase as any).rpc("owner_schools_strict");

      if (cancelled) return;
      if (ownerErr) {
        setAuthzState("denied");
        setAuthzMessage(ownerErr.message);
        setCachedOwnerAuthz(schoolIdVal, userId, false);
        return;
      }

      const ownsCurrentSchool = Array.isArray(ownedSchools) && ownedSchools.some((school: any) => school.id === schoolIdVal);
      if (!ownsCurrentSchool) {
        setAuthzState("denied");
        setAuthzMessage("You do not have the School Owner role for this institution.");
        setCachedOwnerAuthz(schoolIdVal, userId, false);
        return;
      }

      setAuthzState("ok");
      setCachedOwnerAuthz(schoolIdVal, userId, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.status, tenant.schoolId, user]);

  // Don't show loading if we have cached user
  if (loading && !user) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading executive dashboard…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${tenant.slug}/auth`} replace />;
  }

  if (authzState === "denied") {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="max-w-md rounded-3xl bg-surface p-8 shadow-elevated text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-2xl">🚫</span>
          </div>
          <h2 className="mt-4 font-display text-xl font-semibold">Access Denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">{authzMessage}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = `/${tenant.slug}/auth`;
            }}
            className="mt-6 rounded-xl bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <OwnerShell title={title} subtitle="Executive Command Center" schoolSlug={tenant.slug}>
      {authzState === "checking" && !getCachedOwnerAuthz(schoolId || "", user?.id || "") ? (
        <div className="rounded-3xl bg-surface p-8 shadow-elevated text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Verifying executive access…</p>
        </div>
      ) : (
        <RouteGuard extraAllowedPaths={[
          "academics","admissions","finance","fees","hr","wellbeing","compliance",
          "campuses","brand","security","support","advisor","ai","messages",
          "ledger","vendors","tax",
        ]}>
        <Suspense fallback={<DashboardLoader />}>
          <Routes>
            <Route index element={<OwnerOverviewModule schoolId={schoolId} />} />
            <Route path="academics" element={<OwnerAcademicsModule schoolId={schoolId} />} />
            <Route path="academic" element={<AcademicModule />} />
            <Route path="timetable" element={<TimetableBuilderModule />} />
            <Route path="attendance" element={<AttendanceModule />} />
            <Route path="exams" element={<ExamsModule schoolId={schoolId} canManage />} />
            <Route path="report-cards" element={<ReportCardModule schoolId={schoolId} canManage />} />
            <Route path="diary" element={<DiaryModule schoolId={schoolId} canManage />} />
            <Route path="admissions" element={<OwnerAdmissionsModule schoolId={schoolId} />} />
            <Route path="users" element={<UsersModule />} />
            <Route path="leaves" element={<HrLeavesModule />} />
            <Route path="salaries" element={<HrSalariesModule />} />
            <Route path="contracts" element={<HrContractsModule />} />
            <Route path="reviews" element={<HrReviewsModule />} />
            <Route path="documents" element={<HrDocumentsModule />} />
            <Route path="crm" element={<CrmModule />} />
            <Route path="leads" element={<MarketingLeadsModule />} />
            <Route path="follow-ups" element={<MarketingFollowUpsModule />} />
            <Route path="calls" element={<MarketingCallsModule />} />
            <Route path="sources" element={<MarketingSourcesModule />} />
            <Route path="campaigns" element={<MarketingCampaignsModule />} />
            <Route path="parent-notes" element={<PrincipalParentNotesModule />} />
            <Route path="finance" element={<OwnerFinanceModule schoolId={schoolId} role="school_owner" />} />
            <Route path="fees" element={<FeesUnifiedModule />} />
            <Route path="invoices" element={<AccountantInvoicesModule />} />
            <Route path="payments" element={<AccountantPaymentsModule />} />
            <Route path="expenses" element={<AccountantExpensesModule />} />
            <Route path="payroll" element={<AccountantPayrollModule />} />
            <Route path="ledger" element={<AccountantLedgerModule />} />
            <Route path="vendors" element={<AccountantVendorsModule />} />
            <Route path="tax" element={<AccountantTaxModule />} />
            <Route path="fees-pro" element={<Navigate to={`/${schoolSlug}/school_owner/fees?tab=advanced`} replace />} />
            <Route path="fee-vouchers" element={<Navigate to={`/${schoolSlug}/school_owner/fees?tab=vouchers`} replace />} />
            <Route path="hr" element={<OwnerHrModule schoolId={schoolId} />} />
            <Route path="wellbeing" element={<OwnerWellbeingModule schoolId={schoolId} />} />
            <Route path="compliance" element={<OwnerComplianceModule schoolId={schoolId} />} />
            <Route path="campuses" element={<OwnerCampusesModule schoolId={schoolId} />} />
            <Route path="brand" element={<OwnerBrandModule schoolId={schoolId} />} />
            <Route path="security" element={<OwnerSecurityModule schoolId={schoolId} />} />
            <Route path="support" element={<OwnerSupportModule schoolId={schoolId} />} />
            <Route path="advisor" element={<OwnerAdvisorModule schoolId={schoolId} />} />
            <Route path="ai" element={<OwnerAIModule schoolId={schoolId} />} />
            <Route path="messages" element={<MessagesModule schoolId={schoolId} />} />
            <Route path="notices" element={<NoticesModule schoolId={schoolId} canManage />} />
            <Route path="holidays" element={<HolidaysModule schoolId={schoolId} canManage />} />
            <Route path="reports" element={<ReportsModule />} />
            <Route path="complaints" element={<PrincipalComplaintsModule />} />
            <Route path="counseling" element={<CounselingModule schoolId={schoolId} />} />
            {createCatalogRouteElements({
              roles: ["school_owner"],
              ctx: { schoolId, schoolSlug: tenant.slug, role: "school_owner" },
              exclude: [
                "academics","academic","timetable","attendance","exams","report-cards","diary",
                "admissions","users","leaves","salaries","contracts","reviews","documents",
                "crm","leads","follow-ups","calls","sources","campaigns","parent-notes",
                "fees","fees-pro","fee-vouchers","invoices","payments","expenses",
                "payroll","ledger","vendors","tax",
                "hr","wellbeing","compliance","campuses","brand","security","support",
                "advisor","ai","messages","notices","holidays","reports","complaints","counseling",
              ],
            })}
          </Routes>
        </Suspense>
        </RouteGuard>
      )}
    </OwnerShell>
  );
}
