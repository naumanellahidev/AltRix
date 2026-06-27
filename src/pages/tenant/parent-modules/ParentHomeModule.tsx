import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
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
  ChevronRight,
  Award,
  Heart,
  BarChart2,
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
    const todayDayNum = new Date().getDay();

    return studentEntries
      .filter((e) => {
        if (e.dayOfWeek === null || e.dayOfWeek === undefined) return false;
        return Number(e.dayOfWeek) === todayDayNum;
      })
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
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display text-base font-bold text-slate-800">Select a Child</h3>
            <p className="text-xs text-slate-500 mt-1">Pick a child to view their dashboard</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          If you don't see your children listed, please contact the school administration.
        </p>
      </div>
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
    { label: "Performance KPIs", icon: BarChart2, to: "kpis", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Attendance", icon: Calendar, to: "attendance", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Grades", icon: GraduationCap, to: "grades", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Assignments", icon: ScrollText, to: "assignments", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Certificates", icon: Award, to: "certificates", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Counseling", icon: Heart, to: "counseling", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    {
      label: "Fees",
      icon: Receipt,
      to: "fees",
      bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600",
      badge: stats.unpaidFees,
    },
    {
      label: "Messages",
      icon: MessageSquare,
      to: "messages",
      bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600",
      badge: stats.unreadNotifications,
    },
    { label: "Behavior", icon: HeartPulse, to: "behavior", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Diary", icon: BookOpen, to: "diary", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Timetable", icon: Calendar, to: "timetable", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
    { label: "Support", icon: HeartHandshake, to: "support", bg: "bg-blue-50/50 hover:bg-blue-50 text-blue-600" },
  ];

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* 1. Profile Header Row */}
      <div className="rounded-2xl border border-blue-100 bg-white/95 backdrop-blur-md p-4 sm:p-6 shadow-[0_8px_30px_rgb(219,234,254,0.25)] flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 ring-2 ring-blue-50 shadow-md">
            <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white">
              {initials || "C"}
            </div>
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold tracking-tight text-slate-800 truncate">
              {childName}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                {classSection || "Student"}
              </span>
              <p className="text-xs font-semibold text-slate-400 truncate hidden sm:block">
                • Parent View
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
      </div>

      {/* 2. Responsive 2-Column Grid (Main Workspace & Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left Column: Core Dashboard panels */}
        <div className="space-y-6">
          {/* Welcome Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-white via-white to-blue-50/20 p-6 shadow-[0_4px_25px_rgba(219,234,254,0.18)]">
            <div className="absolute right-6 bottom-0 opacity-10 pointer-events-none">
              <User className="h-36 w-36 text-blue-700" />
            </div>
            <div className="max-w-xl space-y-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700 uppercase tracking-widest">
                Parent Overview Hub
              </span>
              <h2 className="font-display text-2xl font-black tracking-tight text-slate-850">
                Monitoring {child.first_name || "Your Child"}
              </h2>
              <p className="text-xs font-semibold text-slate-655 leading-relaxed">
                Review academic standing, pay fee invoices, and check daily schedule. This portal keeps you in full sync with your child's progress.
              </p>
            </div>
          </div>

          {/* Child Metrics and Analytics summary panel */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_20px_rgba(219,234,254,0.15)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Child's Performance KPIs
              </h3>
              <Link to="kpis" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                View Full Analytics <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
              {/* Circular Attendance Ring */}
              <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100/70 md:col-span-2">
                <div className="relative inline-flex flex-col items-center justify-center shrink-0">
                  <svg width={80} height={80} className="-rotate-90">
                    <circle
                      cx={40}
                      cy={40}
                      r={36}
                      fill="none"
                      stroke="rgba(219, 234, 254, 0.4)"
                      strokeWidth={8}
                    />
                    <circle
                      cx={40}
                      cy={40}
                      r={36}
                      fill="none"
                      stroke="rgb(37, 99, 235)"
                      strokeWidth={8}
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 36 * (stats.attendanceRate / 100)} ${2 * Math.PI * 36 * (1 - stats.attendanceRate / 100)}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-xs font-extrabold text-slate-800">
                      {stats.attendanceRate}%
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Present</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attendance
                  </p>
                  <p className="font-display text-lg font-extrabold text-slate-800 mt-0.5">
                    {loading ? "—" : `${stats.attendanceRate}%`}
                  </p>
                  <p className="text-[10px] text-slate-450 mt-1 font-bold">
                    {stats.attendanceRate >= 90 ? "Excellent record" : "Needs monitoring"}
                  </p>
                </div>
              </div>

              {/* Standard Stats Grid */}
              <div className="md:col-span-3 grid grid-cols-3 gap-3">
                <div className="relative overflow-hidden rounded-xl border border-slate-105 bg-slate-50/20 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450">Latest Grade</span>
                    <GraduationCap className="h-4 w-4 text-blue-605" />
                  </div>
                  <p className="font-display text-xl font-black text-slate-800 mt-2">
                    {loading ? "—" : stats.recentGrade != null ? `${stats.recentGrade}%` : "—"}
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-105 bg-slate-50/20 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-455">Open Tasks</span>
                    <ScrollText className="h-4 w-4 text-blue-605" />
                  </div>
                  <p className="font-display text-xl font-black text-slate-800 mt-2">
                    {loading ? "—" : stats.pendingAssignments}
                  </p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-slate-105 bg-slate-50/20 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-455">Unpaid Fees</span>
                    <Receipt className="h-4 w-4 text-blue-605" />
                  </div>
                  <p className="font-display text-xl font-black text-slate-800 mt-2">
                    {loading ? "—" : stats.unpaidFees}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Today's child schedule widget */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 sm:p-6 shadow-[0_4px_25px_rgb(219,234,254,0.15)] space-y-5 animate-rise">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold tracking-tight text-slate-805">Today's Classes</h3>
                <p className="text-xs text-slate-400 mt-0.5">Daily timetable schedule for {child.first_name}</p>
              </div>
              <Clock className="h-5 w-5 text-blue-600" />
            </div>

            {todayEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 border border-dashed rounded-xl p-4">
                <Clock className="h-8 w-8 text-blue-300 mb-2 animate-pulse" />
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
          </div>

          {/* School broadcasts announcements feed */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 sm:p-6 shadow-[0_4px_25px_rgb(219,234,254,0.15)] space-y-5 animate-rise">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold tracking-tight text-slate-800">School Broadcasts</h3>
                <p className="text-xs text-slate-400 mt-0.5">Announcements and notices</p>
              </div>
              <Link to="notices" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {notices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-slate-455">
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
          </div>
        </div>

        {/* Right Column: Actions Sidebar & AI profiles */}
        <div className="space-y-6">
          {/* Quick Actions Panel */}
          <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_25px_rgba(219,234,254,0.15)] space-y-3.5">
            <h3 className="font-display text-xs font-bold tracking-wider text-slate-400 uppercase">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((action, idx) => (
                <Link
                  key={idx}
                  to={action.to}
                  className="group relative flex items-center gap-2.5 rounded-xl border border-slate-100/70 bg-slate-50/20 px-3 py-2 text-left transition-all duration-200 hover:bg-blue-50/40 hover:border-blue-100 hover:text-blue-705 hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <span className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                    <action.icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold text-slate-600 group-hover:text-blue-700 truncate flex-1">{action.label}</span>
                  {action.badge !== undefined && action.badge !== 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[8px] font-bold text-white shadow-sm ring-2 ring-white">
                      {action.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* AI Parent Trust Signals */}
          {schoolId && user && (
            <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_25px_rgb(219,234,254,0.15)] space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="font-display text-sm font-bold tracking-tight text-slate-800">AI Trust Signals</h4>
                  <p className="text-[10px] font-semibold text-slate-400">Child Trust Insights</p>
                </div>
              </div>
              <ParentTrustDashboard
                studentId={child.student_id}
                schoolId={schoolId}
                parentUserId={user.id}
              />
            </div>
          )}

          {/* AI Learning Profile (Twin) */}
          {schoolId && (
            <div className="rounded-2xl border border-blue-50 bg-white p-5 shadow-[0_4px_25px_rgb(219,234,254,0.15)] space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Brain className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="font-display text-sm font-bold tracking-tight text-slate-800">Learning Profile</h4>
                  <p className="text-[10px] font-semibold text-slate-400">AI Digital Twin</p>
                </div>
              </div>
              <StudentDigitalTwinCard
                studentId={child.student_id}
                schoolId={schoolId}
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentHomeModule;
