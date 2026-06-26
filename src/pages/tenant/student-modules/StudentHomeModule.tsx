import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchStudentLabelMap } from "@/lib/student-display";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
import {
  useOfflineTimetable,
  useOfflineTimetablePeriods,
  useOfflineEnrollments,
  useOfflineStaffMembers,
} from "@/hooks/useOfflineData";
import {
  DashboardHeader,
  QuickActionGrid,
  StatTile,
  ProgressRing,
  SmartCard,
  SectionTitle,
} from "@/components/ui/dashboard-kit";
import {
  CalendarDays,
  BookOpen,
  ScrollText,
  GraduationCap,
  Brain,
  TrendingUp,
  Clock,
  AlertTriangle,
  MessageSquare,
  Award,
  HeartHandshake,
  Megaphone,
  User,
  MapPin,
  Pin,
  Calendar,
} from "lucide-react";

interface StudentStats {
  attendanceRate: number;
  totalAssignments: number;
  pendingAssignments: number;
  assessmentCount: number;
  averageGrade: number | null;
}

export function StudentHomeModule({ myStudent }: { myStudent: any }) {
  const [label, setLabel] = useState<string | null>(null);
  const [stats, setStats] = useState<StudentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [notices, setNotices] = useState<any[]>([]);

  // Fetch offline-first timetable and enrollment data
  const { data: cachedEntries } = useOfflineTimetable(schoolId);
  const { data: cachedPeriods } = useOfflineTimetablePeriods(schoolId);
  const { data: cachedEnrollments } = useOfflineEnrollments(schoolId);
  const { data: cachedStaff } = useOfflineStaffMembers(schoolId);

  useEffect(() => {
    if (myStudent.status !== "ready") {
      setLabel(null);
      setStats(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const map = await fetchStudentLabelMap(supabase, { studentIds: [myStudent.studentId] });
        if (cancelled) return;
        setLabel(map[myStudent.studentId] ?? myStudent.studentId);

        const { data: student } = await supabase
          .from("students")
          .select("school_id")
          .eq("id", myStudent.studentId)
          .single();

        if (!student || cancelled) return;
        setSchoolId(student.school_id);

        // Fetch notices
        const { data: noticesData } = await supabase
          .from("notices")
          .select("*")
          .eq("school_id", student.school_id)
          .in("audience", ["all", "students"])
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3);
        
        if (!cancelled) {
          setNotices(noticesData || []);
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: attendance } = await supabase
          .from("attendance_entries")
          .select("status")
          .eq("student_id", myStudent.studentId)
          .gte("created_at", thirtyDaysAgo.toISOString());

        const totalDays = attendance?.length || 0;
        const presentDays =
          attendance?.filter((a) => a.status === "present" || a.status === "late").length || 0;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

        const { data: assignments } = await supabase
          .from("assignments")
          .select("id, status, due_date")
          .eq("school_id", student.school_id);

        const totalAssignments = assignments?.length || 0;
        const pendingAssignments =
          assignments?.filter(
             (a) => a.status === "active" && a.due_date && new Date(a.due_date) >= new Date(),
          ).length || 0;

        const { data: marks } = await supabase
          .from("student_marks")
          .select("marks, academic_assessments!inner(max_marks)")
          .eq("student_id", myStudent.studentId);

        let averageGrade: number | null = null;
        if (marks && marks.length > 0) {
          const validMarks = marks.filter((m) => m.marks != null && m.academic_assessments);
          if (validMarks.length > 0) {
            const percentages = validMarks.map(
              (m) => (m.marks! / (m.academic_assessments as any).max_marks) * 100,
            );
            averageGrade = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);
          }
        }

        if (cancelled) return;
        setStats({
          attendanceRate,
          totalAssignments,
          pendingAssignments,
          assessmentCount: marks?.length || 0,
          averageGrade,
        });
      } catch (error) {
        console.error("Error fetching student stats:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [myStudent.status, myStudent.studentId]);

  // Timetable Calculations for "Today's Schedule" agenda
  const sectionIds = useMemo(() => {
    if (myStudent.status !== "ready") return [];
    return cachedEnrollments
      .filter((e) => e.studentId === myStudent.studentId)
      .map((e) => e.classSectionId);
  }, [cachedEnrollments, myStudent]);

  const studentEntries = useMemo(() => {
    if (!sectionIds.length) return [];
    return cachedEntries.filter((e) => sectionIds.includes(e.classSectionId));
  }, [cachedEntries, sectionIds]);

  const teacherLabelByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of cachedStaff) {
      m.set(s.userId, s.displayName || s.email);
    }
    return m;
  }, [cachedStaff]);

  const todayEntries = useMemo(() => {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const todayDayName = days[new Date().getDay()];

    return studentEntries
      .filter((e) => e.dayOfWeek?.toLowerCase() === todayDayName)
      .map((e) => {
        const period = cachedPeriods.find((p) => p.id === e.periodId);
        return {
          ...e,
          startTime: period?.startTime || e.startTime || "",
          endTime: period?.endTime || e.endTime || "",
          sortOrder: period?.sortOrder ?? 999,
        };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [studentEntries, cachedPeriods]);

  if (myStudent.status === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (myStudent.status === "error") {
    return (
      <SmartCard
        title="Account Not Linked"
        subtitle={myStudent.error}
        icon={AlertTriangle}
      >
        <p className="text-xs text-muted-foreground">
          Contact your school administration to link your student profile to this login.
        </p>
      </SmartCard>
    );
  }

  const firstName = label?.split(" ")[0] || "Student";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const quickActions = [
    { label: "Attendance", icon: CalendarDays, to: "attendance", tone: "success" as const },
    { label: "Grades", icon: GraduationCap, to: "grades", tone: "info" as const },
    { label: "Timetable", icon: Clock, to: "timetable" },
    { label: "Assignments", icon: ScrollText, to: "assignments", badge: stats?.pendingAssignments },
    { label: "Messages", icon: MessageSquare, to: "messages" },
    { label: "Report Card", icon: Award, to: "report-card", tone: "warning" as const },
    { label: "Diary", icon: BookOpen, to: "diary" },
    { label: "Support", icon: HeartHandshake, to: "support" },
  ];

  const initials = (label || "")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Top Header Row */}
      <DashboardHeader
        name={label || "Student"}
        role="Student Portal"
        subtitle={`${greeting}, ${firstName}`}
        initials={initials}
        right={
          <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 text-xs font-bold text-blue-700">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </div>
        }
      />

      {/* Main Luxury Responsive Grid (Left 2/3 and Right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left Column: Main Contents */}
        <div className="space-y-6">
          {/* Welcome Greeting Banner (White & Blue) */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50/30 p-6 shadow-[0_4px_25px_rgba(219,234,254,0.2)]">
            <div className="absolute right-4 bottom-0 opacity-10 pointer-events-none">
              <GraduationCap className="h-40 w-40 text-blue-700" />
            </div>
            <div className="max-w-xl space-y-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                Academic Dashboard
              </span>
              <h2 className="font-display text-2xl font-black tracking-tight text-slate-800">
                Welcome back, {firstName}!
              </h2>
              <p className="text-xs font-semibold text-slate-650 leading-relaxed">
                Stay updated with your daily schedule, check homework tasks, and monitor your overall attendance rating. Keep striving for excellence!
              </p>
            </div>
          </div>

          {/* Academic Summary and Performance Metrics Panel */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_20px_rgba(219,234,254,0.15)] space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-450">
              Academic Summary
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
              {/* Attendance Ring block */}
              <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100/70 sm:col-span-2">
                <ProgressRing
                  value={stats?.attendanceRate ?? 0}
                  size={80}
                  stroke={8}
                  sublabel="30 Days"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance
                  </p>
                  <p className="font-display text-lg font-extrabold text-slate-800 mt-0.5">
                    {loading ? "—" : `${stats?.attendanceRate ?? 0}%`}
                  </p>
                  <p className="text-[10px] text-slate-450 mt-1 font-medium">
                    {(stats?.attendanceRate ?? 0) >= 90 ? "Excellent standing" : "Improve attendance rate"}
                  </p>
                </div>
              </div>

              {/* Standard Stats */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <StatTile
                  label="Avg Grade"
                  value={loading ? "—" : stats?.averageGrade != null ? `${stats.averageGrade}%` : "—"}
                  icon={TrendingUp}
                  className="shadow-none border border-slate-100 bg-slate-50/30"
                />
                <StatTile
                  label="Tasks Due"
                  value={loading ? "—" : stats?.pendingAssignments ?? 0}
                  icon={ScrollText}
                  className="shadow-none border border-slate-100 bg-slate-50/30"
                />
              </div>
            </div>
          </div>

          {/* Today's Classes Schedule Widget */}
          <SmartCard
            title="Today's Timetable"
            subtitle="Scheduled classes for today"
            icon={Clock}
          >
            {todayEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 border border-dashed rounded-xl p-4">
                <CalendarDays className="h-8 w-8 text-blue-300 mb-2 animate-pulse" />
                <p className="text-xs font-bold text-slate-500">No classes scheduled for today</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Enjoy your day or catch up on homework tasks!</p>
              </div>
            ) : (
              <div className="relative pl-4 space-y-4 border-l-2 border-blue-100">
                {todayEntries.map((entry, idx) => {
                  const teacherName = entry.teacherUserId
                    ? teacherLabelByUserId.get(entry.teacherUserId) ?? "Teacher"
                    : "No Teacher Assigned";
                  return (
                    <div key={idx} className="relative group">
                      {/* Interactive dot highlight on timeline */}
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-600 ring-4 ring-white transition-all group-hover:scale-125" />
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/30 border border-slate-100 rounded-xl p-3.5 transition-all hover:border-blue-100 hover:bg-blue-50/10">
                        <div className="space-y-1">
                          <p className="text-xs font-extrabold text-slate-800">{entry.subjectName}</p>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-450 font-bold">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {teacherName}
                            </span>
                            {entry.room && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                Room {entry.room}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Time label slot */}
                        {entry.startTime && (
                          <div className="inline-flex items-center shrink-0 self-start sm:self-center bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 border border-blue-100/50">
                            {entry.startTime} - {entry.endTime}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SmartCard>

          {/* School Broadcast notices feed */}
          <SmartCard
            title="School Broadcasts"
            subtitle="Important announcements and notices"
            icon={Megaphone}
            action={{ label: "View all", to: "notices" }}
          >
            {notices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-slate-450">
                <p className="text-xs font-bold">No announcements posted recently</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="flex items-start gap-3 bg-slate-50/35 border border-slate-100 rounded-xl p-4 transition-all hover:border-blue-100 hover:bg-blue-50/10"
                  >
                    <span className="mt-0.5 h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                      {notice.pinned ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                    </span>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-extrabold text-slate-800 truncate">{notice.title}</h4>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0">
                          {new Date(notice.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {notice.body && (
                        <p className="text-[10px] font-semibold text-slate-650 leading-relaxed line-clamp-2">
                          {notice.body}
                        </p>
                      )}
                      {notice.priority === "urgent" && (
                        <span className="inline-flex items-center rounded bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold text-rose-600 uppercase tracking-widest border border-rose-100">
                          Urgent
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SmartCard>
        </div>

        {/* Right Column: Quick Actions & AI Twin Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions Board */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_25px_rgba(219,234,254,0.15)] space-y-4">
            <SectionTitle title="Quick Actions" />
            <QuickActionGrid actions={quickActions} columns={{ base: 2, sm: 2, md: 4, lg: 2 }} />
          </div>

          {/* AI Digital Learning Twin Card */}
          {schoolId && myStudent.status === "ready" && (
            <SmartCard
              title="AI Learning Profile"
              subtitle="Personalized insights powered by AI"
              icon={Brain}
            >
              <StudentDigitalTwinCard studentId={myStudent.studentId} schoolId={schoolId} />
            </SmartCard>
          )}
        </div>
      </div>
    </div>
  );
}
