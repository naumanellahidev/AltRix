import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
import { ParentTrustDashboard } from "@/components/ai/ParentTrustDashboard";
import { useSession } from "@/hooks/useSession";
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
  Calendar,
  GraduationCap,
  Receipt,
  Bell,
  Brain,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  ScrollText,
  HeartPulse,
  BookOpen,
  HeartHandshake,
  Megaphone,
  User,
  MapPin,
  Pin,
  Clock,
} from "lucide-react";

interface ParentHomeModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const ParentHomeModule = ({ child, schoolId }: ParentHomeModuleProps) => {
  const { user } = useSession();
  const [stats, setStats] = useState({
    attendanceRate: 0,
    pendingAssignments: 0,
    unpaidFees: 0,
    unreadNotifications: 0,
    recentGrade: null as number | null,
  });
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<any[]>([]);

  // Fetch offline-first timetable and enrollment data for the selected child
  const { data: cachedEntries } = useOfflineTimetable(schoolId);
  const { data: cachedPeriods } = useOfflineTimetablePeriods(schoolId);
  const { data: cachedEnrollments } = useOfflineEnrollments(schoolId);
  const { data: cachedStaff } = useOfflineStaffMembers(schoolId);

  useEffect(() => {
    if (!child || !schoolId) return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: attendance } = await supabase
          .from("attendance_entries")
          .select("status")
          .eq("student_id", child.student_id)
          .gte("created_at", thirtyDaysAgo.toISOString());

        const totalDays = attendance?.length || 0;
        const presentDays =
          attendance?.filter((a) => a.status === "present" || a.status === "late").length || 0;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

        const { count: pendingAssignments } = await supabase
          .from("assignments")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "active")
          .gte("due_date", new Date().toISOString().split("T")[0]);

        const { count: unpaidFees } = await supabase
          .from("fee_invoices")
          .select("id", { count: "exact", head: true })
          .eq("student_id", child.student_id)
          .not("status", "eq", "paid")
          .not("status", "eq", "cancelled");

        const { data: u } = await supabase.auth.getUser();
        const { count: unreadNotifications } = await supabase
          .from("app_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", u.user?.id || "")
          .is("read_at", null);

        const { data: recentMarks } = await supabase
          .from("student_marks")
          .select("marks, academic_assessments!inner(max_marks)")
          .eq("student_id", child.student_id)
          .order("created_at", { ascending: false })
          .limit(1);

        // Fetch parent/school-wide notices
        const { data: noticesData } = await supabase
          .from("notices")
          .select("*")
          .eq("school_id", schoolId)
          .in("audience", ["all", "parents"])
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3);

        setNotices(noticesData || []);

        let recentGrade: number | null = null;
        if (recentMarks && recentMarks.length > 0 && recentMarks[0].marks != null) {
          const mark = recentMarks[0];
          recentGrade = Math.round(
            (mark.marks! / (mark.academic_assessments as any).max_marks) * 100,
          );
        }

        setStats({
          attendanceRate,
          pendingAssignments: pendingAssignments || 0,
          unpaidFees: unpaidFees || 0,
          unreadNotifications: unreadNotifications || 0,
          recentGrade,
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [child, schoolId]);

  // Timetable Calculations for selected child's Today's Schedule
  const sectionIds = useMemo(() => {
    if (!child) return [];
    return cachedEnrollments
      .filter((e) => e.studentId === child.student_id)
      .map((e) => e.classSectionId);
  }, [cachedEnrollments, child]);

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

  if (!child) {
    return (
      <SmartCard
        title="Select a child"
        subtitle="Pick a child to view their dashboard"
        icon={AlertTriangle}
      >
        <p className="text-xs text-muted-foreground">
          If you don't see your children listed, please contact the school administration.
        </p>
      </SmartCard>
    );
  }

  const childName =
    [child.first_name, child.last_name].filter(Boolean).join(" ") || "Your Child";
  const classSection = [child.class_name, child.section_name].filter(Boolean).join(" / ");
  const initials = childName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  const quickActions = [
    { label: "Attendance", icon: Calendar, to: "attendance", tone: "success" as const },
    { label: "Grades", icon: GraduationCap, to: "grades", tone: "info" as const },
    {
      label: "Fees",
      icon: Receipt,
      to: "fees",
      tone: "warning" as const,
      badge: stats.unpaidFees,
    },
    {
      label: "Messages",
      icon: MessageSquare,
      to: "messages",
      badge: stats.unreadNotifications,
    },
    { label: "Behavior", icon: HeartPulse, to: "behavior" },
    { label: "Diary", icon: BookOpen, to: "diary" },
    { label: "Timetable", icon: Calendar, to: "timetable" },
    { label: "Support", icon: HeartHandshake, to: "support" },
  ];

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Top Header Row */}
      <DashboardHeader
        name={childName}
        role={classSection || "Student"}
        subtitle="Parent view"
        initials={initials}
        right={
          <div className="flex items-center gap-2">
            {stats.unreadNotifications > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-100 shrink-0">
                <Bell className="h-3.5 w-3.5" />
                {stats.unreadNotifications} unread
              </span>
            )}
            <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 text-xs font-bold text-blue-700 shrink-0">
              <Calendar className="h-3.5 w-3.5" />
              {formattedDate}
            </div>
          </div>
        }
      />

      {/* Main Luxury Responsive Grid (Left 2/3 and Right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left Column: Main Contents */}
        <div className="space-y-6">
          {/* Welcome/Overview card */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-white to-blue-50/30 p-6 shadow-[0_4px_25px_rgba(219,234,254,0.2)]">
            <div className="absolute right-4 bottom-0 opacity-10 pointer-events-none">
              <User className="h-40 w-40 text-blue-700" />
            </div>
            <div className="max-w-xl space-y-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-widest">
                Parent Overview Hub
              </span>
              <h2 className="font-display text-2xl font-black tracking-tight text-slate-800">
                Monitoring {child.first_name || "Your Child"}
              </h2>
              <p className="text-xs font-semibold text-slate-655 leading-relaxed">
                Review academic standing, pay fee invoices, and check daily schedule. This portal keeps you in full sync with your child's progress.
              </p>
            </div>
          </div>

          {/* Child Metrics and Analytics summary panel */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_20px_rgba(219,234,254,0.15)] space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-450">
              Child's Metrics
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
              {/* Attendance Ring Block */}
              <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100/70 sm:col-span-2">
                <ProgressRing
                  value={stats.attendanceRate}
                  size={80}
                  stroke={8}
                  sublabel="30 Days"
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance
                  </p>
                  <p className="font-display text-lg font-extrabold text-slate-800 mt-0.5">
                    {loading ? "—" : `${stats.attendanceRate}%`}
                  </p>
                  <p className="text-[10px] text-slate-450 mt-1 font-medium">
                    {stats.attendanceRate >= 90 ? "Excellent attendance record" : "Attendance needs monitoring"}
                  </p>
                </div>
              </div>

              {/* Standard Stats Grid */}
              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <StatTile
                  label="Latest Grade"
                  value={loading ? "—" : stats.recentGrade != null ? `${stats.recentGrade}%` : "—"}
                  icon={GraduationCap}
                  className="shadow-none border border-slate-100 bg-slate-50/30"
                />
                <StatTile
                  label="Open Tasks"
                  value={loading ? "—" : stats.pendingAssignments}
                  icon={ScrollText}
                  className="shadow-none border border-slate-100 bg-slate-50/30"
                />
              </div>
            </div>
          </div>

          {/* Today's Child Timetable agenda widget */}
          <SmartCard
            title="Today's Classes"
            subtitle={`Daily timetable schedule for ${child.first_name}`}
            icon={Clock}
          >
            {todayEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 border border-dashed rounded-xl p-4">
                <Clock className="h-8 w-8 text-blue-355 mb-2 animate-pulse" />
                <p className="text-xs font-bold text-slate-500">No classes scheduled for today</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Your child is free from classes today.</p>
              </div>
            ) : (
              <div className="relative pl-4 space-y-4 border-l-2 border-blue-100">
                {todayEntries.map((entry, idx) => {
                  const teacherName = entry.teacherUserId
                    ? teacherLabelByUserId.get(entry.teacherUserId) ?? "Teacher"
                    : "No Teacher Assigned";
                  return (
                    <div key={idx} className="relative group">
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

          {/* School broadcasts for parents */}
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
                        <p className="text-[10px] font-semibold text-slate-655 leading-relaxed line-clamp-2">
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

        {/* Right Column: Actions and AI insights sidebar */}
        <div className="space-y-6">
          {/* Quick Actions Board */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_25px_rgba(219,234,254,0.15)] space-y-4">
            <SectionTitle title="Quick Actions" />
            <QuickActionGrid actions={quickActions} columns={{ base: 2, sm: 2, md: 4, lg: 2 }} />
          </div>

          {/* AI Trust Signals */}
          {schoolId && user && (
            <SmartCard
              title="AI Insights"
              subtitle="Trust signals for your child"
              icon={Sparkles}
            >
              <ParentTrustDashboard
                studentId={child.student_id}
                schoolId={schoolId}
                parentUserId={user.id}
              />
            </SmartCard>
          )}

          {/* AI Learning Profile (Twin) */}
          {schoolId && (
            <SmartCard title="Learning Profile" subtitle="AI digital twin" icon={Brain}>
              <StudentDigitalTwinCard
                studentId={child.student_id}
                schoolId={schoolId}
                compact
              />
            </SmartCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentHomeModule;
