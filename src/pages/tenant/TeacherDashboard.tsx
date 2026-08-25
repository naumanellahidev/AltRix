import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useMemo, lazy, Suspense } from "react";
import { LogOut, UserRound } from "lucide-react";

import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useAuthz } from "@/hooks/useAuthz";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { TeacherShell } from "@/components/tenant/TeacherShell";
import { Button } from "@/components/ui/button";

// Teacher modules
const TeacherHome = lazy(() => import("@/pages/tenant/role-homes/TeacherHome").then(m => ({ default: m.TeacherHome })));
const TeacherStudentsModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherStudentsModule").then(m => ({ default: m.TeacherStudentsModule })));
const TeacherAttendanceModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherAttendanceModule").then(m => ({ default: m.TeacherAttendanceModule })));
const TeacherHomeworkModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherHomeworkModule").then(m => ({ default: m.TeacherHomeworkModule })));
const TeacherAssignmentsModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherAssignmentsModule").then(m => ({ default: m.TeacherAssignmentsModule })));
const TeacherBehaviorModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherBehaviorModule").then(m => ({ default: m.TeacherBehaviorModule })));
const TeacherReportsModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherReportsModule").then(m => ({ default: m.TeacherReportsModule })));
const TeacherTimetableModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherTimetableModule").then(m => ({ default: m.TeacherTimetableModule })));
const TeacherAdminInboxModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherAdminInboxModule").then(m => ({ default: m.TeacherAdminInboxModule })));
const TeacherWorkspaceMessagesModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherWorkspaceMessagesModule").then(m => ({ default: m.TeacherWorkspaceMessagesModule })));
const TeacherGradebookModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherGradebookModule").then(m => ({ default: m.TeacherGradebookModule })));
const TeacherProgressModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherProgressModule").then(m => ({ default: m.TeacherProgressModule })));
const TeacherLessonPlannerModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherLessonPlannerModule").then(m => ({ default: m.TeacherLessonPlannerModule })));
const TeacherLeavesModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherLeavesModule").then(m => ({ default: m.TeacherLeavesModule })));
const TeacherAIModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherAIModule").then(m => ({ default: m.TeacherAIModule })));
const TeacherComplaintsModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherComplaintsModule").then(m => ({ default: m.TeacherComplaintsModule })));
const TeacherParentNotesModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherParentNotesModule").then(m => ({ default: m.TeacherParentNotesModule })));
const TeacherPresenceHistoryModule = lazy(() => import("@/pages/tenant/teacher-modules/TeacherPresenceHistoryModule").then(m => ({ default: m.TeacherPresenceHistoryModule })));
const NoticesModule = lazy(() => import("@/pages/tenant/modules/NoticesModule"));
const HolidaysModule = lazy(() => import("@/pages/tenant/modules/HolidaysModule"));
const DiaryModule = lazy(() => import("@/pages/tenant/modules/DiaryModule"));
const ExamsModule = lazy(() => import("@/pages/tenant/modules/ExamsModule"));
const ReportCardModule = lazy(() => import("@/pages/tenant/modules/ReportCardModule"));
const EventsModule = lazy(() => import("@/pages/tenant/modules/EventsModule"));
const LibraryModule = lazy(() => import("@/pages/tenant/modules/LibraryModule"));
const TransportModule = lazy(() => import("@/pages/tenant/modules/TransportModule"));
const HostelModule = lazy(() => import("@/pages/tenant/modules/HostelModule"));
const ExamSeatingPlanModule = lazy(() => import("@/pages/tenant/modules/ExamSeatingPlanModule").then(m => ({ default: m.ExamSeatingPlanModule })));
const StudentWellbeingModule = lazy(() => import("@/pages/tenant/modules/StudentWellbeingModule"));
const DocManagementModule = lazy(() => import("@/pages/tenant/modules/DocManagementModule"));
import { RouteGuard } from "@/components/tenant/RouteGuard";

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const TeacherDashboard = () => {
  const { schoolSlug } = useParams();
  
  // Use optimized hooks with caching
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const schoolId = useMemo(() => 
    tenant.status === "ready" ? tenant.schoolId : null, 
    [tenant.status, tenant.schoolId]
  );

  // Use optimized authorization hook
  const authz = useAuthz({
    schoolId,
    userId: user?.id ?? null,
    requiredRoles: ["teacher"],
  });
  const authzState = authz.state;
  const authzMessage = authz.message;

  // Universal background data prefetch for offline use
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

  // ─── TENANT AUTHORIZATION GATES ────────────────────────────────────────
  // Gate 1: Unknown/invalid school slug → reject before any data loads
  if (tenant.status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="rounded-3xl bg-surface p-8 shadow-elevated max-w-md text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">Institute Not Found</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The school you are trying to access does not exist or is no longer available.
          </p>
          <Button variant="outline" onClick={() => navigate(tenant.slug ? `/${tenant.slug}/auth` : "/")}>
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  // Gate 2: Tenant still resolving
  if (tenant.status === "loading" || tenant.status === "idle") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Don't show loading screen if we have cached session data
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

  // Gate 3: Authorization check — must pass before any tenant content renders
  if (authzState === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (authzState === "denied") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="rounded-3xl bg-surface p-8 shadow-elevated max-w-md text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">Access Denied</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {authzMessage || "You do not have permission to access this school or role."}
          </p>
          <Button variant="outline" onClick={() => navigate(tenant.slug ? `/${tenant.slug}/auth` : "/")}>
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  const title = tenant.status === "ready" ? `${tenant.school?.name} • Teacher` : "AltRix";

  return (
    <TeacherShell title={title} schoolSlug={tenant.slug}>
      <div className="flex flex-col gap-6">
        <RouteGuard extraAllowedPaths={[
            "students","attendance","homework","assignments","behavior","gradebook",
            "progress","lesson-plans","reports","report-cards","exams","diary",
            "notices","holidays","timetable","leaves","ai-insights","messages",
            "admin-inbox","complaints","parent-notes","presence-history",
            "events","library","transport","hostel","seating-plan","student-wellbeing","doc-management"
          ]}>
          <Suspense fallback={<DashboardLoader />}>
            <Routes>
              <Route index element={<TeacherHome />} />
              <Route path="students" element={<TeacherStudentsModule />} />
              <Route path="attendance" element={<TeacherAttendanceModule />} />
              <Route path="homework" element={<TeacherHomeworkModule />} />
              <Route path="assignments" element={<TeacherAssignmentsModule />} />
              <Route path="behavior" element={<TeacherBehaviorModule />} />
              <Route path="gradebook" element={<TeacherGradebookModule />} />
              <Route path="progress" element={<TeacherProgressModule />} />
              <Route path="lesson-plans" element={<TeacherLessonPlannerModule />} />
              <Route path="reports" element={<TeacherReportsModule />} />
              <Route path="report-cards" element={<ReportCardModule schoolId={schoolId} canManage={true} />} />
              <Route path="exams" element={<ExamsModule schoolId={schoolId} canManage={true} />} />
              <Route path="diary" element={<DiaryModule schoolId={schoolId} canManage={true} />} />
              <Route path="notices" element={<NoticesModule schoolId={schoolId} canManage={true} />} />
              <Route path="holidays" element={<HolidaysModule schoolId={schoolId} canManage={false} />} />
              <Route path="timetable" element={<TeacherTimetableModule />} />
              <Route path="leaves" element={<TeacherLeavesModule />} />
              <Route path="ai-insights" element={<TeacherAIModule />} />
              <Route path="messages" element={<TeacherWorkspaceMessagesModule />} />
              <Route path="admin-inbox" element={<TeacherAdminInboxModule />} />
              <Route path="complaints" element={<TeacherComplaintsModule />} />
              <Route path="parent-notes" element={<TeacherParentNotesModule />} />
              <Route path="presence-history" element={<TeacherPresenceHistoryModule />} />
              <Route path="events" element={<EventsModule />} />
              <Route path="library" element={<LibraryModule />} />
              <Route path="transport" element={<TransportModule />} />
              <Route path="hostel" element={<HostelModule />} />
              <Route path="seating-plan" element={<ExamSeatingPlanModule />} />
              <Route path="student-wellbeing" element={<StudentWellbeingModule />} />
              <Route path="doc-management" element={<DocManagementModule />} />
              <Route path="*" element={<Navigate to={`/${tenant.slug}/teacher`} replace />} />
            </Routes>
          </Suspense>
          </RouteGuard>
      </div>
    </TeacherShell>
  );
};

export default TeacherDashboard;
