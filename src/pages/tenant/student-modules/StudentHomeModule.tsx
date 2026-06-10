import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchStudentLabelMap } from "@/lib/student-display";
import { StudentDigitalTwinCard } from "@/components/ai/StudentDigitalTwinCard";
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
        tone="destructive"
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

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Top header */}
      <DashboardHeader
        name={label || "Student"}
        role="Student Portal"
        subtitle={`${greeting}, ${firstName}`}
        initials={initials}
      />

      {/* KPI tiles + ring */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card-premium card-premium-hover flex items-center gap-5 p-5 animate-rise">
          <ProgressRing
            value={stats?.attendanceRate ?? 0}
            size={96}
            stroke={10}
            tone={
              (stats?.attendanceRate ?? 0) >= 90
                ? "success"
                : (stats?.attendanceRate ?? 0) >= 75
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
              {loading ? "—" : `${stats?.attendanceRate ?? 0}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Keep it above 90% for best results.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatTile
            label="Avg Grade"
            value={loading ? "—" : stats?.averageGrade != null ? `${stats.averageGrade}%` : "—"}
            icon={TrendingUp}
            tone={
              stats?.averageGrade != null && stats.averageGrade >= 80
                ? "success"
                : stats?.averageGrade != null && stats.averageGrade >= 50
                  ? "info"
                  : "warning"
            }
          />
          <StatTile
            label="Assignments"
            value={loading ? "—" : stats?.totalAssignments ?? 0}
            icon={ScrollText}
            tone="info"
            delta={
              stats && stats.pendingAssignments > 0
                ? { value: `${stats.pendingAssignments} due soon`, positive: false }
                : undefined
            }
          />
          <StatTile
            label="Assessments"
            value={loading ? "—" : stats?.assessmentCount ?? 0}
            icon={BookOpen}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionTitle title="Quick actions" />
        <QuickActionGrid actions={quickActions} columns={{ base: 4, sm: 4, md: 4, lg: 8 }} />
      </div>

      {/* AI Digital Twin */}
      {schoolId && myStudent.status === "ready" && (
        <SmartCard
          title="Your AI Learning Profile"
          subtitle="Personalized insights powered by AI"
          icon={Brain}
          tone="info"
        >
          <StudentDigitalTwinCard studentId={myStudent.studentId} schoolId={schoolId} />
        </SmartCard>
      )}
    </div>
  );
}
