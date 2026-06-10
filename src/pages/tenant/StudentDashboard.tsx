import { useEffect, useState, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useMyStudentId } from "@/hooks/useMyStudentId";
import { useUniversalPrefetch } from "@/hooks/useUniversalPrefetch";
import { StudentShell } from "@/components/tenant/StudentShell";

const StudentHomeModule = lazy(() => import("@/pages/tenant/student-modules/StudentHomeModule").then(m => ({ default: m.StudentHomeModule })));
const StudentAttendanceModule = lazy(() => import("@/pages/tenant/student-modules/StudentAttendanceModule").then(m => ({ default: m.StudentAttendanceModule })));
const StudentGradesModule = lazy(() => import("@/pages/tenant/student-modules/StudentGradesModule").then(m => ({ default: m.StudentGradesModule })));
const StudentTimetableModule = lazy(() => import("@/pages/tenant/student-modules/StudentTimetableModule").then(m => ({ default: m.StudentTimetableModule })));
const StudentAssignmentsModule = lazy(() => import("@/pages/tenant/student-modules/StudentAssignmentsModule").then(m => ({ default: m.StudentAssignmentsModule })));
const StudentCertificatesModule = lazy(() => import("@/pages/tenant/student-modules/StudentCertificatesModule").then(m => ({ default: m.StudentCertificatesModule })));
const StudentSupportModule = lazy(() => import("@/pages/tenant/student-modules/StudentSupportModule").then(m => ({ default: m.StudentSupportModule })));
const StudentMessagesModule = lazy(() => import("@/pages/tenant/student-modules/StudentMessagesModule").then(m => ({ default: m.StudentMessagesModule })));
const StudentAIModule = lazy(() => import("@/pages/tenant/student-modules/StudentAIModule").then(m => ({ default: m.StudentAIModule })));
const StudentComplaintsModule = lazy(() => import("@/pages/tenant/student-modules/StudentComplaintsModule"));
const NoticesModule = lazy(() => import("@/pages/tenant/modules/NoticesModule"));
const HolidaysModule = lazy(() => import("@/pages/tenant/modules/HolidaysModule"));
const DiaryModule = lazy(() => import("@/pages/tenant/modules/DiaryModule"));
const ExamsModule = lazy(() => import("@/pages/tenant/modules/ExamsModule"));
const ReportCardModule = lazy(() => import("@/pages/tenant/modules/ReportCardModule"));
import { RouteGuard } from "@/components/tenant/RouteGuard";

const DashboardLoader = () => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

// Cache key for student auth
const STUDENT_AUTHZ_CACHE = "eduverse_student_authz_cache";

interface CachedStudentAuthz {
  schoolId: string;
  userId: string;
  authorized: boolean;
  timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function getCachedStudentAuthz(schoolId: string, userId: string): boolean | null {
  try {
    const cached = localStorage.getItem(STUDENT_AUTHZ_CACHE);
    if (!cached) return null;
    const data: CachedStudentAuthz = JSON.parse(cached);
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

function setCachedStudentAuthz(schoolId: string, userId: string, authorized: boolean) {
  try {
    const data: CachedStudentAuthz = { schoolId, userId, authorized, timestamp: Date.now() };
    localStorage.setItem(STUDENT_AUTHZ_CACHE, JSON.stringify(data));
  } catch {
    // Ignore
  }
}

const StudentDashboard = () => {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const { user, loading } = useSession();
  const [authzState, setAuthzState] = useState<"checking" | "ok" | "denied">("checking");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const myStudent = useMyStudentId(schoolId);

  // Universal prefetch for offline support
  useUniversalPrefetch({
    schoolId,
    userId: user?.id ?? null,
    enabled: !!schoolId && !!user && authzState === 'ok',
  });

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (tenant.status !== "ready") return;
    if (!user) return;

    const schoolIdVal = tenant.schoolId;
    const userId = user.id;

    // Check cache first
    const cachedAuth = getCachedStudentAuthz(schoolIdVal, userId);
    
    // If offline and we have cache, use it immediately
    if (!navigator.onLine && cachedAuth !== null) {
      setAuthzState(cachedAuth ? "ok" : "denied");
      return;
    }

    // If we have valid cache, use it while we verify in background
    if (cachedAuth === true) {
      setAuthzState("ok");
      // Only verify in background if online
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
      try {
        const { data: psa } = await supabase
          .from("platform_super_admins")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (psa?.user_id) {
          setAuthzState("ok");
          setCachedStudentAuthz(schoolIdVal, userId, true);
          return;
        }

        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("id")
          .eq("school_id", schoolIdVal)
          .eq("user_id", userId)
          .eq("role", "student")
          .maybeSingle();
        if (cancelled) return;
        const authorized = !!roleRow;
        setAuthzState(authorized ? "ok" : "denied");
        setCachedStudentAuthz(schoolIdVal, userId, authorized);
      } catch {
        // On network error, use cache if available
        if (cachedAuth !== null) {
          setAuthzState(cachedAuth ? "ok" : "denied");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.status, tenant.schoolId, user, isOnline]);

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
          <p className="mt-2 text-sm text-muted-foreground">You do not have Student access.</p>
        </div>
      </div>
    );
  }

  // If the account is authorized as a student but not linked to an actual student record,
  // show a clear blocking message for all tabs (otherwise every module looks "empty").
  if (myStudent.status === "error") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          <p className="font-display text-xl font-semibold tracking-tight">Account Not Linked</p>
          <p className="mt-2 text-sm text-muted-foreground">{myStudent.error}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ask your school administration to link your student profile to this login.
          </p>
        </div>
      </div>
    );
  }

  const title = `${tenant.school?.name || "AltRix"} • Student`;

  return (
    <StudentShell title={title} subtitle="Read-only student portal" schoolSlug={tenant.slug}>
      <RouteGuard extraAllowedPaths={[
        "attendance","grades","timetable","assignments","certificates",
        "ai-insights","messages","support","notices","holidays","diary",
        "exams","report-card","complaints",
      ]}>
      <Suspense fallback={<DashboardLoader />}>
        <Routes>
          <Route index element={<StudentHomeModule myStudent={myStudent} />} />
          <Route path="attendance" element={<StudentAttendanceModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="grades" element={<StudentGradesModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="timetable" element={<StudentTimetableModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="assignments" element={<StudentAssignmentsModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="certificates" element={<StudentCertificatesModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="ai-insights" element={<StudentAIModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="messages" element={<StudentMessagesModule />} />
          <Route path="support" element={<StudentSupportModule myStudent={myStudent} schoolId={schoolId} />} />
          <Route path="notices" element={<NoticesModule schoolId={schoolId} canManage={false} />} />
          <Route path="holidays" element={<HolidaysModule schoolId={schoolId} canManage={false} />} />
          <Route path="diary" element={<DiaryModule schoolId={schoolId} canManage={false} />} />
          <Route path="exams" element={<ExamsModule schoolId={schoolId} canManage={false} />} />
          <Route path="report-card" element={<ReportCardModule schoolId={schoolId} canManage={false} studentIdLocked={myStudent.status === "ready" ? myStudent.studentId : null} />} />
          <Route path="complaints" element={<StudentComplaintsModule schoolId={schoolId} />} />
          <Route path="*" element={<Navigate to={`/${tenant.slug}/student`} replace />} />
        </Routes>
      </Suspense>
      </RouteGuard>
    </StudentShell>
  );
};

export default StudentDashboard;
