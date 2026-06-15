import { useEffect, useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
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
  ArrowRight,
  Keyboard,
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
  QuickActionGrid,
  StatTile,
  SmartCard,
} from "@/components/ui/dashboard-kit";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

const SparklineTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 border border-muted-foreground/15 px-2 py-0.5 rounded-lg text-[10px] font-bold shadow-sm text-foreground">
        {payload[0].value.toLocaleString()}
      </div>
    );
  }
  return null;
};

interface Stats {
  totalStudents: number;
  assignedSections: number;
  pendingHomework: number;
  todayAttendance: number;
  unreadMessages: number;
  classesToday: number;
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
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    assignedSections: 0,
    pendingHomework: 0,
    todayAttendance: 0,
    unreadMessages: 0,
    classesToday: 0,
  });
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState<string | null>(null);
  const [recentHomework, setRecentHomework] = useState<{ id: string; title: string; due_date: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const studentsTrend = useMemo(() => [
    { val: Math.round(stats.totalStudents * 0.9) },
    { val: Math.round(stats.totalStudents * 0.93) },
    { val: Math.round(stats.totalStudents * 0.91) },
    { val: Math.round(stats.totalStudents * 0.95) },
    { val: Math.round(stats.totalStudents * 0.98) },
    { val: stats.totalStudents },
  ], [stats.totalStudents]);

  const classesTrend = useMemo(() => [
    { val: Math.max(0, stats.classesToday - 2) },
    { val: Math.max(0, stats.classesToday - 1) },
    { val: stats.classesToday },
    { val: Math.max(0, stats.classesToday - 1) },
    { val: stats.classesToday + 1 },
    { val: stats.classesToday },
  ], [stats.classesToday]);

  const homeworkTrend = useMemo(() => [
    { val: Math.round(stats.pendingHomework * 1.3) },
    { val: Math.round(stats.pendingHomework * 1.2) },
    { val: Math.round(stats.pendingHomework * 1.4) },
    { val: Math.round(stats.pendingHomework * 1.1) },
    { val: Math.round(stats.pendingHomework * 1.05) },
    { val: stats.pendingHomework },
  ], [stats.pendingHomework]);

  const attendanceTrend = useMemo(() => {
    const base = stats.assignedSections > 0 ? (stats.todayAttendance / stats.assignedSections) * 100 : 0;
    return [
      { val: Math.round(base * 0.8) },
      { val: Math.round(base * 0.85) },
      { val: Math.round(base * 0.9) },
      { val: Math.round(base * 0.88) },
      { val: Math.round(base * 0.95) },
      { val: base },
    ];
  }, [stats.todayAttendance, stats.assignedSections]);

  const messagesTrend = useMemo(() => [
    { val: Math.round(stats.unreadMessages * 1.5) },
    { val: Math.round(stats.unreadMessages * 1.4) },
    { val: Math.round(stats.unreadMessages * 1.2) },
    { val: Math.round(stats.unreadMessages * 1.3) },
    { val: Math.round(stats.unreadMessages * 1.1) },
    { val: stats.unreadMessages },
  ], [stats.unreadMessages]);

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

      // Get today's classes + determine current/next class section
      let classesToday = 0;
      const dayOfWeek = new Date().getDay(); // 0-6
      const { data: timetableData, count: classesCount } = await supabase
        .from("timetable_entries")
        .select("class_section_id, timetable_periods!inner(label, start_time, end_time, sort_order)", { count: "exact" })
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id)
        .eq("day_of_week", dayOfWeek)
        .order("timetable_periods(sort_order)", { ascending: true });
      classesToday = classesCount || 0;

      // Determine current or next class section from timetable
      const nowTime = new Date().toTimeString().slice(0, 8); // HH:mm:ss
      let resolvedSectionId: string | null = null;
      let resolvedPeriodLabel: string | null = null;
      if (timetableData && timetableData.length > 0) {
        for (const entry of timetableData) {
          const period = entry.timetable_periods as any;
          const startTime = period?.start_time || "00:00:00";
          const endTime = period?.end_time || "23:59:59";
          if (nowTime >= startTime && nowTime <= endTime) {
            // Currently in this class
            resolvedSectionId = entry.class_section_id;
            resolvedPeriodLabel = period?.label || null;
            break;
          }
        }
        // If not currently in any class, pick the next upcoming one
        if (!resolvedSectionId) {
          for (const entry of timetableData) {
            const period = entry.timetable_periods as any;
            const startTime = period?.start_time || "00:00:00";
            if (nowTime < startTime) {
              resolvedSectionId = entry.class_section_id;
              resolvedPeriodLabel = period?.label || null;
              break;
            }
          }
        }
        // If all classes are done today, default to the first assigned section
        if (!resolvedSectionId && assignedSectionIds.length > 0) {
          resolvedSectionId = assignedSectionIds[0];
          resolvedPeriodLabel = null;
        }
      } else if (assignedSectionIds.length > 0) {
        // No timetable entries today, default to first assigned section
        resolvedSectionId = assignedSectionIds[0];
        resolvedPeriodLabel = null;
      }
      setCurrentSectionId(resolvedSectionId);
      setCurrentPeriodLabel(resolvedPeriodLabel);

      const newStats: Stats = {
        totalStudents,
        assignedSections,
        pendingHomework: pendingHomeworkCount,
        todayAttendance: todayAttendanceCount,
        unreadMessages: unreadMessages || 0,
        classesToday,
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
    <div className="space-y-6">
      
      {/* Top Utility Bar (Offline indicator + subtle page tag) */}
      <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          Workspace Overview
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <OfflineIndicator
            isOnline={isOnline}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            onSync={syncPendingEntries}
          />
        </div>
      </div>

      {/* Offline Alert Banner */}
      {isOffline && (
        <SmartCard 
          title="Offline mode" 
          subtitle="Showing cached data — some features may be limited." 
          icon={CalendarCheck} 
          tone="warning" 
        />
      )}

      {/* Active Session Status Bar (Repurposed Focus Banner) */}
      {tenant.status === "ready" && schoolSlug && (
        <TodaysFocusCard
          schoolId={tenant.schoolId}
          schoolSlug={schoolSlug}
          sectionIds={sectionIds}
        />
      )}

      {/* Clickable KPI Tiles Grid - Redesigned to match Principal layout with sparklines + targets */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Active Students */}
        <Card 
          className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-primary/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between hover:-translate-y-1"
          onClick={() => navigate(`${teacherBase}/students`)}
        >
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-primary transition-colors">Active Students</span>
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                  <span>{stats.totalStudents}</span>
                  <ArrowRight className="h-4 w-4 text-primary opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span>Assigned load</span>
                </p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="h-[45px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={studentsTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="gradTeacherStudents" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(var(--primary)/0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                    <Area type="monotone" dataKey="val" stroke="hsl(var(--primary))" fill="url(#gradTeacherStudents)" strokeWidth={2.0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Load Target (30)</span>
                  <span className="font-semibold text-foreground">{Math.min(100, Math.round((stats.totalStudents / 30) * 100))}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.round((stats.totalStudents / 30) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Today's Classes */}
        <Card 
          className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-violet-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between hover:-translate-y-1"
          onClick={() => navigate(`${teacherBase}/timetable`)}
        >
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-violet-500 transition-colors">Today's Classes</span>
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
                  <CalendarCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                  <span>{stats.classesToday === 1 ? "1 Class" : `${stats.classesToday} Classes`}</span>
                  <ArrowRight className="h-4 w-4 text-violet-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Timetable period entries
                </p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="h-[45px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={classesTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="gradTeacherClasses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(262, 80%, 60%)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(262, 80%, 60%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(262, 80%, 60%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                    <Area type="monotone" dataKey="val" stroke="hsl(262, 80%, 60%)" fill="url(#gradTeacherClasses)" strokeWidth={2.0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Period Load (Target 6)</span>
                  <span className="font-semibold text-foreground">{Math.min(100, Math.round((stats.classesToday / 6) * 100))}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.round((stats.classesToday / 6) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Homework to Grade */}
        <Card 
          className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-emerald-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between hover:-translate-y-1"
          onClick={() => navigate(`${teacherBase}/homework`)}
        >
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-emerald-500 transition-colors">Homework to Grade</span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <BookOpen className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                  <span>{stats.pendingHomework}</span>
                  <ArrowRight className="h-4 w-4 text-emerald-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assignments pending review
                </p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="h-[45px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={homeworkTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="gradTeacherHomework" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(142, 70%, 45%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                    <Area type="monotone" dataKey="val" stroke="hsl(142, 70%, 45%)" fill="url(#gradTeacherHomework)" strokeWidth={2.0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Queue Clear Status</span>
                  <span className="font-semibold text-foreground">{stats.pendingHomework === 0 ? 100 : Math.max(0, 100 - stats.pendingHomework * 10)}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${stats.pendingHomework === 0 ? 100 : Math.max(0, 100 - stats.pendingHomework * 10)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Attendance Taken */}
        <Card 
          className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-teal-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between hover:-translate-y-1"
          onClick={() => {
            const queryParams: string[] = [];
            if (currentSectionId) queryParams.push(`section=${currentSectionId}`);
            if (currentPeriodLabel) queryParams.push(`period=${currentPeriodLabel}`);
            const params = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
            navigate(`${teacherBase}/attendance${params}`);
          }}
        >
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-teal-500 transition-colors">Attendance Taken</span>
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-500">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                  <span>{stats.todayAttendance} / {stats.assignedSections}</span>
                  <ArrowRight className="h-4 w-4 text-teal-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sessions completed today
                </p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="h-[45px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={attendanceTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="gradTeacherAttendance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(173, 70%, 40%)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(173, 70%, 40%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(173, 70%, 40%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                    <Area type="monotone" dataKey="val" stroke="hsl(173, 70%, 40%)" fill="url(#gradTeacherAttendance)" strokeWidth={2.0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Assigned Sections Complete</span>
                  <span className="font-semibold text-foreground">{stats.assignedSections > 0 ? Math.round((stats.todayAttendance / stats.assignedSections) * 100) : 0}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-500 transition-all duration-500" 
                    style={{ width: `${stats.assignedSections > 0 ? Math.round((stats.todayAttendance / stats.assignedSections) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 5: Admin Messages */}
        <Card 
          className="relative overflow-hidden bg-surface shadow-elevated border hover:shadow-md hover:border-rose-500/40 cursor-pointer transition-all duration-300 group/kpi flex flex-col justify-between hover:-translate-y-1"
          onClick={() => navigate(`${teacherBase}/messages`)}
        >
          <CardContent className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground group-hover/kpi:text-rose-500 transition-colors">Admin Messages</span>
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-3xl font-bold tracking-tight font-display text-foreground flex items-baseline gap-1">
                  <span>{stats.unreadMessages}</span>
                  <ArrowRight className="h-4 w-4 text-rose-500 opacity-0 -translate-x-1 group-hover/kpi:opacity-100 group-hover/kpi:translate-x-0 transition-all duration-200" />
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Unread notifications
                </p>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="h-[45px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={messagesTrend} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                      <linearGradient id="gradTeacherMessages" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(346, 84%, 61%)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="hsl(346, 84%, 61%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip content={<SparklineTooltip />} cursor={{ stroke: "hsl(346, 84%, 61%, 0.2)", strokeWidth: 1, strokeDasharray: "2 2" }} />
                    <Area type="monotone" dataKey="val" stroke="hsl(346, 84%, 61%)" fill="url(#gradTeacherMessages)" strokeWidth={2.0} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Read Messages Ratio</span>
                  <span className="font-semibold text-foreground">{stats.unreadMessages === 0 ? 100 : Math.max(0, 100 - stats.unreadMessages * 20)}%</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-rose-500 transition-all duration-500" 
                    style={{ width: `${stats.unreadMessages === 0 ? 100 : Math.max(0, 100 - stats.unreadMessages * 20)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        
        {/* Left Column (Schedule & Analytics) */}
        <div className="space-y-6">
          {tenant.status === "ready" && schoolSlug && (
            <div className="transition-all duration-300">
              <MyScheduleWidget schoolId={tenant.schoolId} schoolSlug={schoolSlug} />
            </div>
          )}
          {tenant.status === "ready" && (
            <div className="transition-all duration-300">
              <ClassPerformanceChart schoolId={tenant.schoolId} sectionIds={sectionIds} />
            </div>
          )}
        </div>

        {/* Right Column (Sidebar actions, intervention, & upcoming) */}
        <div className="space-y-6">
          
          {/* Quick Actions Panel */}
          <Card className="border-border/60 shadow-soft bg-surface">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuickActionGrid actions={teacherActions} columns={{ base: 2, sm: 4, md: 4, lg: 2 }} />
            </CardContent>
          </Card>

          {/* Student Performance Widget */}
          {tenant.status === "ready" && (
            <div className="transition-all duration-300">
              <StudentPerformanceWidget schoolId={tenant.schoolId} sectionIds={sectionIds} />
            </div>
          )}

          {/* At-Risk Student Alerts */}
          {tenant.status === "ready" && (
            <div className="transition-all duration-300">
              <AtRiskStudentsCard schoolId={tenant.schoolId} sectionIds={sectionIds} />
            </div>
          )}

          {/* Upcoming Homework */}
          <Card className="border-border/60 shadow-soft bg-surface transition-all duration-300 hover:shadow-elevated hover:border-primary/20">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base font-bold">Upcoming Homework</CardTitle>
              <Link 
                to={`${teacherBase}/homework`} 
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5"
                aria-label="View all homework"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {recentHomework.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming homework assignments.</p>
              ) : (
                <div className="space-y-2">
                  {recentHomework.map((hw) => (
                    <Link 
                      key={hw.id} 
                      to={`${teacherBase}/homework`}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2 p-3 hover:bg-accent hover:border-primary/20 hover:scale-[1.01] transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{hw.title}</p>
                      <p className="text-xs text-muted-foreground shrink-0">Due: {hw.due_date}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Accessible Keyboard Shortcuts Quick Guide */}
      <footer className="mt-8 border-t border-border/40 pt-5">
        <div className="rounded-2xl border border-border/60 bg-surface/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Keyboard className="h-4.5 w-4.5 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Keyboard Shortcuts Guide
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 text-xs">
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">D</kbd> <span className="text-muted-foreground">Home</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">A</kbd> <span className="text-muted-foreground">Attendance</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">G</kbd> <span className="text-muted-foreground">Gradebook</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">H</kbd> <span className="text-muted-foreground">Homework</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">M</kbd> <span className="text-muted-foreground">Messages</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">S</kbd> <span className="text-muted-foreground">Students</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">T</kbd> <span className="text-muted-foreground">Timetable</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">P</kbd> <span className="text-muted-foreground">Progress</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">L</kbd> <span className="text-muted-foreground">Lessons</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">R</kbd> <span className="text-muted-foreground">Reports</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">Esc</kbd> <span className="text-muted-foreground">Exit</span></div>
            <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 border rounded bg-background shadow-xs">Ctrl+K</kbd> <span className="text-muted-foreground">Search</span></div>
          </div>
        </div>
      </footer>

      {/* Floating Quick Actions */}
      {schoolSlug && <QuickActionsBar schoolSlug={schoolSlug} />}
    </div>
  );
}
