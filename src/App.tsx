import { useEffect, lazy, Suspense, useMemo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import Index from "./pages/Index";

const NotFound = lazy(() => import("./pages/NotFound"));
const PlatformAuth = lazy(() => import("./pages/platform/PlatformAuth"));
const PlatformDashboardPage = lazy(() => import("./pages/platform/PlatformDashboardPage"));
const PlatformDirectoryPage = lazy(() => import("./pages/platform/PlatformDirectoryPage"));
const PlatformSchoolsPage = lazy(() => import("./pages/platform/PlatformSchoolsPage"));
const PlatformUpdatePassword = lazy(() => import("./pages/platform/PlatformUpdatePassword"));
const PlatformRecoverMaster = lazy(() => import("./pages/platform/PlatformRecoverMaster"));
const PlatformBillingPage = lazy(() => import("./pages/platform/PlatformBillingPage"));
const PlatformRevenuePage = lazy(() => import("./pages/platform/PlatformRevenuePage"));
const PlatformAuditPage = lazy(() => import("./pages/platform/PlatformAuditPage"));
const PlatformHealthPage = lazy(() => import("./pages/platform/PlatformHealthPage"));
const PlatformSecurityPage = lazy(() => import("./pages/platform/PlatformSecurityPage"));
const PlatformSettingsPage = lazy(() => import("./pages/platform/PlatformSettingsPage"));
const PlatformSupportPage = lazy(() => import("./pages/platform/PlatformSupportPage"));
const PlatformAddonsPage = lazy(() => import("./pages/platform/PlatformAddonsPage"));
const PlatformDatabasePage = lazy(() => import("./pages/platform/PlatformDatabasePage"));
const PlatformDomainsPage = lazy(() => import("./pages/platform/PlatformDomainsPage"));

const TenantDashboard = lazy(() => import("./pages/tenant/TenantDashboard"));
const TeacherDashboard = lazy(() => import("./pages/tenant/TeacherDashboard"));
const HrDashboard = lazy(() => import("./pages/tenant/HrDashboard"));
const AccountantDashboard = lazy(() => import("./pages/tenant/AccountantDashboard"));
const MarketingDashboard = lazy(() => import("./pages/tenant/MarketingDashboard"));
const StudentDashboard = lazy(() => import("./pages/tenant/StudentDashboard"));
const ParentDashboard = lazy(() => import("./pages/tenant/ParentDashboard"));
const TenantBootstrap = lazy(() => import("./pages/tenant/TenantBootstrap"));
const OwnerDashboard = lazy(() => import("./pages/tenant/OwnerDashboard"));
const PublicInquiryPage = lazy(() => import("./pages/tenant/PublicInquiryPage"));
const PublicHallTicketVerification = lazy(() => import("./pages/tenant/PublicHallTicketVerification"));
const UnifiedHub = lazy(() => import("./pages/tenant/UnifiedHub"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

import PlatformAdminGuard from "./components/super-admin/PlatformAdminGuard";

import { PoweredByFooter } from "./components/global/PoweredByFooter";
import { KeyboardShortcutsOverlay } from "./components/global/KeyboardShortcutsOverlay";
import { ArrowKeyAccelerator } from "./components/global/ArrowKeyAccelerator";

import AltrixCopilot from "@/components/ai/AltrixCopilot";
import { useSession } from "@/hooks/useSession";

const LazyFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

function CopilotWrapper() {
  const location = useLocation();
  const { user } = useSession();

  const isTenantRoute = useMemo(() => {
    if (!user) return false;
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return false;
    const first = parts[0];
    if (["super_admin", "auth", "reset-password", "platform"].includes(first)) return false;
    if (parts[1] === "auth" || parts[1] === "bootstrap") return false;
    return true;
  }, [location.pathname, user]);

  if (!isTenantRoute) return null;

  return <AltrixCopilot />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 1000, // 15 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true, // auto refresh on window focus
      retry: 1,
    },
  },
});

export default function App() {
  // Prevent single failing async task from hard-crashing the whole shell (white screen)
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      // Suppress benign aborts (e.g. cancelled in-flight fetches when a component re-renders/unmounts)
      const name = reason?.name || reason?.error?.name;
      const message: string = reason?.message || reason?.error?.message || "";
      if (name === "AbortError" || /aborted/i.test(message)) {
        event.preventDefault();
        return;
      }
      console.error("Unhandled rejection:", reason);
      toast.error("An unexpected error occurred. Please try again.");
      event.preventDefault();
    };

    // Global Enter key: if focused element is inside a dialog/form, submit the closest form or click the primary button
    const handleGlobalEnter = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement;
      // Skip if target is a textarea or already a button/link
      if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "A") return;
      // Skip if inside a select/combobox
      if (target.closest("[role='listbox']") || target.closest("[role='combobox']")) return;

      // Find closest dialog content and click its primary (last) button
      const dialog = target.closest("[role='dialog']");
      if (dialog) {
        const footer = dialog.querySelector("[class*='DialogFooter'], footer");
        if (footer) {
          const buttons = footer.querySelectorAll("button:not([disabled])");
          const primary = buttons[buttons.length - 1] as HTMLButtonElement | undefined;
          if (primary) {
            event.preventDefault();
            primary.click();
          }
        }
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("keydown", handleGlobalEnter);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("keydown", handleGlobalEnter);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ArrowKeyAccelerator />
        <KeyboardShortcutsOverlay />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<PlatformAuth />} />
              <Route path="/auth/update-password" element={<PlatformUpdatePassword />} />
              <Route path="/auth/recover-master" element={<PlatformRecoverMaster />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Global Super Admin (platform-level) */}
              <Route element={<PlatformAdminGuard />}>
                <Route path="/super_admin" element={<PlatformDashboardPage />} />
                <Route path="/super_admin/directory" element={<PlatformDirectoryPage />} />
                <Route path="/super_admin/schools" element={<PlatformSchoolsPage />} />
                <Route path="/super_admin/billing" element={<PlatformBillingPage />} />
                <Route path="/super_admin/revenue" element={<PlatformRevenuePage />} />
                <Route path="/super_admin/audit" element={<PlatformAuditPage />} />
                <Route path="/super_admin/health" element={<PlatformHealthPage />} />
                <Route path="/super_admin/security" element={<PlatformSecurityPage />} />
                <Route path="/super_admin/settings" element={<PlatformSettingsPage />} />
                <Route path="/super_admin/support" element={<PlatformSupportPage />} />
                <Route path="/super_admin/addons" element={<PlatformAddonsPage />} />
                <Route path="/super_admin/database" element={<PlatformDatabasePage />} />
                <Route path="/super_admin/domains" element={<PlatformDomainsPage />} />
              </Route>


              {/* Back-compat aliases */}
              <Route path="/platform" element={<Navigate to="/super_admin" replace />} />
              <Route path="/platform/directory" element={<Navigate to="/super_admin/directory" replace />} />
              <Route path="/platform/schools" element={<Navigate to="/super_admin/schools" replace />} />

              <Route path="/:schoolSlug/auth" element={<Index />} />
              <Route path="/:schoolSlug/hub" element={<UnifiedHub />} />
              <Route path="/:schoolSlug/bootstrap" element={<TenantBootstrap />} />
              <Route path="/:schoolSlug/inquiry" element={<PublicInquiryPage />} />
              <Route path="/:schoolSlug/verify-ticket/:examId/:studentId" element={<PublicHallTicketVerification />} />
              <Route path="/:schoolSlug/teacher/*" element={<TeacherDashboard />} />
              <Route path="/:schoolSlug/hr/*" element={<HrDashboard />} />
              <Route path="/:schoolSlug/accountant/*" element={<AccountantDashboard />} />
              <Route path="/:schoolSlug/marketing/*" element={<MarketingDashboard />} />
              <Route path="/:schoolSlug/student/*" element={<StudentDashboard />} />
              <Route path="/:schoolSlug/parent/*" element={<ParentDashboard />} />
              <Route path="/:schoolSlug/school_owner/*" element={<OwnerDashboard />} />
              <Route path="/:schoolSlug/:role/*" element={<TenantDashboard />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <CopilotWrapper />
          <PoweredByFooter />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

