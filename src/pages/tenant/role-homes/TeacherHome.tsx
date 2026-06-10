import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  MessageSquare,
  TrendingUp,
  Users,
  GraduationCap,
  CalendarDays,
  Coins,
  ScrollText,
  HeartHandshake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AtRiskStudentsCard } from "@/components/teacher/AtRiskStudentsCard";
import { ClassPerformanceChart } from "@/components/teacher/ClassPerformanceChart";
import { MyScheduleWidget } from "@/components/teacher/MyScheduleWidget";
import { StudentPerformanceWidget } from "@/components/teacher/StudentPerformanceWidget";
import { TodaysFocusCard } from "@/components/teacher/TodaysFocusCard";
import { QuickActionsBar } from "@/components/teacher/QuickActionsBar";
import { OfflineIndicator } from "@/components/teacher/OfflineIndicator";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useTeacherKeyboardShortcuts } from "@/hooks/useTeacherKeyboardShortcuts";
import {
  DashboardHeader,
  QuickActionGrid,
  StatTile,
  SectionTitle,
  SmartCard,
} from "@/components/ui/dashboard-kit";

interface Stats {
  totalStudents: number;
  assignedSections: number;
  pendingHomework: number;
  todayAttendance: number;
  unreadMessages: number;
}

// LocalStorage cache for stats
const getStatsCacheKey = (schoolId: string, userId: string) => 
  `eduverse_teacher_stats_${schoolId}_${userId}`;

function getCachedStats(schoolId: string, userId: string): Stats | null {
  try {
    const cached = localStorage.getItem(getStatsCacheKey(schoolId, userId));
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    // Cache valid for 1 hour
    if (age > 60 * 60 * 1000) {
      localStorage.removeItem(getStatsCacheKey(schoolId, userId));
      return null;
    }
    
    return parsed.data;
  } catch {
    return null;
  }
}

function cacheStats(schoolId: string, userId: string, data: Stats) {
  try {
    localStorage.setItem(
      getStatsCacheKey(schoolId, userId),
      JSON.stringify({ data, timestamp: Date.now() })
    );
  } catch (e) {
    console.warn("Failed to cache stats:", e);
  }
}

export function TeacherHome() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const { user } = useSession();
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    assignedSections: 0,
    pendingHomework: 0,
    todayAttendance: 0,
    unreadMessages: 0,
  });
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [recentHomework, setRecentHomework] = useState<{ id: string; title: string; due_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Initialize keyboard shortcuts
  useTeacherKeyboardShortcuts(schoolSlug || "", tenant.status === "ready");

  // Initialize offline sync
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const { isOnline, pendingCount, isSyncing, syncPendingEntries } = useOfflineSync(
    schoolId,
    user?.id ?? null
  );

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (tenant.status !== "ready" || !user) return;

    const fetchStats = async () => {
      const schoolId = tenant.schoolId;

      // Try to load from cache first (especially when offline)
      const cachedData = getCachedStats(schoolId, user.id);
      if (cachedData) {
        setStats(cachedData);
        setLoading(false);
        
        // If offline, stop here
        if (!navigator.onLine) return;
      } else {
        setLoading(true);
      }

      // If offline and no cache, show empty state
      if (!navigator.onLine && !cachedData) {
        setLoading(false);
        return;
      }

      // Get assigned sections for this teacher
      const { data: assignments } = await (supabase as any)
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id);

      const assignedSectionIds = [...new Set((assignments as any[])?.map((a: any) => a.class_section_id as string) || [])] as string[];
      setSectionIds(assignedSectionIds);
      const assignedSections = assignedSectionIds.length;

      // Get total students in assigned sections
      let totalStudents = 0;
      if (assignedSectionIds.length > 0) {
        const { count } = await (supabase as any)
          .from("student_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .in("class_section_id", assignedSectionIds as string[]);
        totalStudents = count || 0;
      }

      // Get pending homework - only for THIS teacher's sections or created by this teacher
      const today = new Date().toISOString().split("T")[0];
      let pendingHomeworkCount = 0;
      if (assignedSectionIds.length > 0) {
        const { count } = await supabase
          .from("homework")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "active")
          .gte("due_date", today)
          .or(`class_section_id.in.(${assignedSectionIds.join(",")}),teacher_user_id.eq.${user.id}`);
        pendingHomeworkCount = count || 0;
      }

      // Get today's attendance sessions - only for THIS teacher's sections
      let todayAttendanceCount = 0;
      if (assignedSectionIds.length > 0) {
        const { count } = await (supabase as any)
          .from("attendance_sessions")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("session_date", today)
          .in("class_section_id", assignedSectionIds as string[]);
        todayAttendanceCount = count || 0;
      }

      // Get unread messages
      const { count: unreadMessages } = await supabase
        .from("admin_message_recipients")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("is_read", false);

      // Get recent homework - only for THIS teacher's sections or created by this teacher
      let homework: { id: string; title: string; due_date: string }[] = [];
      if (assignedSectionIds.length > 0) {
        const { data } = await supabase
          .from("homework")
          .select("id, title, due_date")
          .eq("school_id", schoolId)
          .eq("status", "active")
          .or(`class_section_id.in.(${assignedSectionIds.join(",")}),teacher_user_id.eq.${user.id}`)
          .order("due_date", { ascending: true })
          .limit(5);
        homework = data || [];
      }

      const newStats: Stats = {
        totalStudents,
        assignedSections,
        pendingHomework: pendingHomeworkCount,
        todayAttendance: todayAttendanceCount,
        unreadMessages: unreadMessages || 0,
      };

      setStats(newStats);
      cacheStats(schoolId, user.id, newStats);
      setRecentHomework(homework);
      setLoading(false);
    };

    fetchStats().catch(() => {
      // On error, try to use cached data
      if (tenant.schoolId && user.id) {
        const cachedData = getCachedStats(tenant.schoolId, user.id);
        if (cachedData) {
          setStats(cachedData);
        }
      }
      setLoading(false);
    });
  }, [tenant.status, tenant.schoolId, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    );
  }

  const teacherBase = `/${schoolSlug}/teacher`;
  const teacherActions = [
    { label: "Attendance", icon: ClipboardCheck, to: `${teacherBase}/attendance`, tone: "success" as const },
    { label: "Gradebook", icon: GraduationCap, to: `${teacherBase}/gradebook`, tone: "info" as const },
    { label: "Homework", icon: BookOpen, to: `${teacherBase}/homework`, badge: stats.pendingHomework },
    { label: "Assignments", icon: ScrollText, to: `${teacherBase}/assignments` },
    { label: "Lessons", icon: CalendarDays, to: `${teacherBase}/lesson-plans` },
    { label: "Reports", icon: BarChart3, to: `${teacherBase}/reports`, tone: "info" as const },
    { label: "Messages", icon: MessageSquare, to: `${teacherBase}/messages`, badge: stats.unreadMessages },
    { label: "Leaves", icon: HeartHandshake, to: `${teacherBase}/leaves`, tone: "warning" as const },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <DashboardHeader
        name="Teacher Workspace"
        role="Teacher"
        subtitle={tenant.status === "ready" ? tenant.school?.name ?? undefined : undefined}
        right={
          <OfflineIndicator
            isOnline={isOnline}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            onSync={syncPendingEntries}
          />
        }
      />

      {/* Offline Notice */}
      {isOffline && (
        <SmartCard title="Offline mode" subtitle="Showing cached data — some features may be limited." icon={CalendarCheck} tone="warning" />
      )}

      {/* Today's Focus */}
      {tenant.status === "ready" && schoolSlug && (
        <TodaysFocusCard
          schoolId={tenant.schoolId}
          schoolSlug={schoolSlug}
          sectionIds={sectionIds}
        />
      )}

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label="Students" value={stats.totalStudents} icon={Users} tone="info" />
        <StatTile label="Sections" value={stats.assignedSections} icon={CalendarCheck} />
        <StatTile label="Homework" value={stats.pendingHomework} icon={BookOpen} tone={stats.pendingHomework > 0 ? "warning" : "success"} />
        <StatTile label="Attendance" value={stats.todayAttendance} icon={ClipboardCheck} tone="success" />
        <StatTile label="Messages" value={stats.unreadMessages} icon={MessageSquare} tone={stats.unreadMessages > 0 ? "destructive" : "default"} />
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle title="Quick actions" />
        <QuickActionGrid actions={teacherActions} columns={{ base: 4, sm: 4, md: 4, lg: 8 }} />
      </div>

      {/* Schedule + Performance */}
      {tenant.status === "ready" && schoolSlug && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MyScheduleWidget schoolId={tenant.schoolId} schoolSlug={schoolSlug} />
          <StudentPerformanceWidget schoolId={tenant.schoolId} sectionIds={sectionIds} />
        </div>
      )}

      {/* Analytics */}
      {tenant.status === "ready" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AtRiskStudentsCard schoolId={tenant.schoolId} sectionIds={sectionIds} />
          <ClassPerformanceChart schoolId={tenant.schoolId} sectionIds={sectionIds} />
        </div>
      )}

      {/* Upcoming Homework */}
      <Card className="card-premium">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Upcoming Homework</CardTitle>
        </CardHeader>
        <CardContent>
          {recentHomework.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming homework assignments.</p>
          ) : (
            <div className="space-y-2">
              {recentHomework.map((hw) => (
                <div key={hw.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2 p-3">
                  <p className="text-sm font-medium truncate">{hw.title}</p>
                  <p className="text-xs text-muted-foreground shrink-0">Due: {hw.due_date}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Quick Actions */}
      {schoolSlug && <QuickActionsBar schoolSlug={schoolSlug} />}
    </div>
  );
}
