import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
import { ParentTrustDashboard } from "@/components/ai/ParentTrustDashboard";
import { useSession } from "@/hooks/useSession";
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
          .from("finance_invoices")
          .select("id", { count: "exact", head: true })
          .eq("student_id", child.student_id)
          .eq("status", "unpaid");

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

  if (!child) {
    return (
      <SmartCard
        title="Select a child"
        subtitle="Pick a child to view their dashboard"
        icon={AlertTriangle}
        tone="warning"
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

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header showing the linked child */}
      <DashboardHeader
        name={childName}
        role={classSection || "Student"}
        subtitle="Parent view"
        initials={initials}
        right={
          stats.unreadNotifications > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
              <Bell className="h-3.5 w-3.5" />
              {stats.unreadNotifications} new
            </span>
          ) : undefined
        }
      />

      {/* KPI block: ring + tiles */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card-premium card-premium-hover flex items-center gap-5 p-5 animate-rise">
          <ProgressRing
            value={stats.attendanceRate}
            size={96}
            stroke={10}
            tone={
              stats.attendanceRate >= 90
                ? "success"
                : stats.attendanceRate >= 75
                  ? "primary"
                  : "warning"
            }
            sublabel="30 days"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Attendance
            </p>
            <p className="font-display text-xl font-semibold tracking-tight">
              {loading ? "—" : `${stats.attendanceRate}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Last 30 days summary.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatTile
            label="Latest grade"
            value={loading ? "—" : stats.recentGrade != null ? `${stats.recentGrade}%` : "—"}
            icon={GraduationCap}
            tone={
              stats.recentGrade != null && stats.recentGrade >= 80
                ? "success"
                : stats.recentGrade != null && stats.recentGrade >= 50
                  ? "info"
                  : "warning"
            }
          />
          <StatTile
            label="Unpaid fees"
            value={loading ? "—" : stats.unpaidFees}
            icon={Receipt}
            tone={stats.unpaidFees > 0 ? "destructive" : "success"}
          />
          <StatTile
            label="Open tasks"
            value={loading ? "—" : stats.pendingAssignments}
            icon={ScrollText}
            tone="info"
          />
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle title="Quick actions" />
        <QuickActionGrid actions={quickActions} columns={{ base: 4, sm: 4, md: 4, lg: 8 }} />
      </div>

      {/* AI Trust Dashboard */}
      {schoolId && user && (
        <SmartCard
          title="AI-powered insights"
          subtitle="Trust signals for your child"
          icon={Sparkles}
          tone="info"
        >
          <ParentTrustDashboard
            studentId={child.student_id}
            schoolId={schoolId}
            parentUserId={user.id}
          />
        </SmartCard>
      )}

      {/* Learning profile (compact) */}
      {schoolId && (
        <SmartCard title="Learning profile" subtitle="AI digital twin" icon={Brain}>
          <StudentDigitalTwinCard
            studentId={child.student_id}
            schoolId={schoolId}
            compact
          />
        </SmartCard>
      )}
    </div>
  );
};

export default ParentHomeModule;
