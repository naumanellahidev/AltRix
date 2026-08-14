import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Minus, User } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
}

interface StudentStats {
  attendance_rate: number;
  total_sessions: number;
  avg_grade: number;
  recent_avg_grade: number;
  grade_trend: "up" | "down" | "stable";
  assessments: { date: string; title: string; percentage: number }[];
}

export function TeacherProgressModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);

  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [stats, setStats] = useState<StudentStats | null>(null);

  useEffect(() => {
    if (schoolId && user?.id) {
      loadSections();
    }
  }, [schoolId, user?.id]);

  useEffect(() => {
    if (selectedSection && schoolId) {
      loadStudents();
    }
  }, [selectedSection, schoolId]);

  useEffect(() => {
    if (selectedStudent && schoolId && selectedSection) {
      loadStudentStats();
    }
  }, [selectedStudent, schoolId, selectedSection]);

  const loadSections = async () => {
    const { data: assignments } = await api
      .from("teacher_assignments")
      .select("class_section_id")
      .eq("school_id", schoolId!)
      .eq("teacher_user_id", user!.id);

    const sectionIds = [...new Set(assignments?.map((a) => a.class_section_id) || [])];
    if (sectionIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data: secs } = await api
      .from("class_sections")
      .select("id, name, class_id")
      .in("id", sectionIds);

    const { data: classes } = await api.from("academic_classes").select("id, name");
    const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

    const mapped = (secs || []).map((s) => ({
      id: s.id,
      name: s.name,
      class_name: classMap.get(s.class_id) || "",
    }));

    setSections(mapped);
    if (mapped.length > 0 && !selectedSection) {
      setSelectedSection(mapped[0].id);
    }
    setLoading(false);
  };

  const loadStudents = async () => {
    const { data: enrollments } = await api
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", schoolId!)
      .eq("class_section_id", selectedSection);

    const studentIds = enrollments?.map((e) => e.student_id) || [];

    if (studentIds.length > 0) {
      const { data } = await api
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds)
        .order("first_name");

      setStudents((data as Student[]) || []);
      if (data && data.length > 0 && !selectedStudent) {
        setSelectedStudent(data[0].id);
      }
    } else {
      setStudents([]);
      setSelectedStudent("");
    }
  };

  const loadStudentStats = async () => {
    setLoadingStats(true);

    // Get attendance stats
    const { data: entries } = await api
      .from("attendance_entries")
      .select("status, session_id!inner(class_section_id)")
      .eq("school_id", schoolId!)
      .eq("student_id", selectedStudent);

    const sectionEntries = entries?.filter(
      (e: any) => e.session_id?.class_section_id === selectedSection
    ) || [];

    const presentCount = sectionEntries.filter(
      (e) => e.status === "present" || e.status === "late"
    ).length;
    const attendance_rate = sectionEntries.length > 0
      ? (presentCount / sectionEntries.length) * 100
      : 100;

    // Get grade stats
    const { data: marksData } = await api
      .from("student_marks")
      .select("marks, assessment_id!inner(id, title, max_marks, assessment_date, class_section_id)")
      .eq("school_id", schoolId!)
      .eq("student_id", selectedStudent)
      .order("assessment_id(assessment_date)", { ascending: true });

    const sectionMarks = marksData?.filter(
      (m: any) => m.assessment_id?.class_section_id === selectedSection
    ) || [];

    const assessments = sectionMarks.map((m: any) => ({
      date: m.assessment_id.assessment_date,
      title: m.assessment_id.title,
      percentage: (m.marks / m.assessment_id.max_marks) * 100,
    }));

    const totalAvg = assessments.length > 0
      ? assessments.reduce((sum, a) => sum + a.percentage, 0) / assessments.length
      : 0;

    const recentAssessments = assessments.slice(-5);
    const recentAvg = recentAssessments.length > 0
      ? recentAssessments.reduce((sum, a) => sum + a.percentage, 0) / recentAssessments.length
      : 0;

    const olderAssessments = assessments.slice(0, -5);
    const olderAvg = olderAssessments.length > 0
      ? olderAssessments.reduce((sum, a) => sum + a.percentage, 0) / olderAssessments.length
      : recentAvg;

    let grade_trend: "up" | "down" | "stable" = "stable";
    if (recentAvg > olderAvg + 5) grade_trend = "up";
    else if (recentAvg < olderAvg - 5) grade_trend = "down";

    setStats({
      attendance_rate,
      total_sessions: sectionEntries.length,
      avg_grade: totalAvg,
      recent_avg_grade: recentAvg,
      grade_trend,
      assessments,
    });

    setLoadingStats(false);
  };

  const getTrendIcon = () => {
    if (!stats) return null;
    switch (stats.grade_trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-lg font-medium">No Assigned Sections</p>
          <p className="text-sm text-muted-foreground">
            You need to be assigned to sections to track student progress.
          </p>
        </CardContent>
      </Card>
    );
  }

  const selectedStudentData = students.find((s) => s.id === selectedStudent);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={selectedSection} onValueChange={(v) => {
          setSelectedSection(v);
          setSelectedStudent("");
          setStats(null);
        }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.class_name} • {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedStudent} onValueChange={setSelectedStudent}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select student" />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedStudentData && stats && (
        <>
          {/* Student Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle>
                    {selectedStudentData.first_name} {selectedStudentData.last_name}
                  </CardTitle>
                  <CardDescription>
                    {sections.find((s) => s.id === selectedSection)?.class_name} •{" "}
                    {sections.find((s) => s.id === selectedSection)?.name}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Stats Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Attendance Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stats.attendance_rate.toFixed(1)}%</span>
                  <span className="text-xs text-muted-foreground">
                    of {stats.total_sessions} sessions
                  </span>
                </div>
                <Progress value={stats.attendance_rate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Overall Average</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stats.avg_grade.toFixed(1)}%</span>
                </div>
                <Progress value={stats.avg_grade} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Recent Average</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stats.recent_avg_grade.toFixed(1)}%</span>
                  <span className="text-xs text-muted-foreground">last 5 assessments</span>
                </div>
                <Progress value={stats.recent_avg_grade} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Grade Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {getTrendIcon()}
                  <Badge
                    variant={
                      stats.grade_trend === "up"
                        ? "default"
                        : stats.grade_trend === "down"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {stats.grade_trend === "up"
                      ? "Improving"
                      : stats.grade_trend === "down"
                      ? "Declining"
                      : "Stable"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Grade History Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assessment History</CardTitle>
              <CardDescription>Performance across all assessments</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.assessments.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No assessment data available yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart 
                    data={stats.assessments}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => format(new Date(v), "MMM d")}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      height={30}
                      dy={5}
                    />
                    <YAxis 
                      domain={[0, 100]} 
                      tick={{ fontSize: 10 }} 
                      tickLine={false}
                      axisLine={false}
                      width={35}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg border bg-card p-2 shadow-md">
                              <p className="font-medium text-sm">{data.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(data.date), "MMM d, yyyy")}
                              </p>
                              <p className="text-base font-bold">{data.percentage.toFixed(2)}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="percentage"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))", r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {loadingStats && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-[300px]" />
        </div>
      )}
    </div>
  );
}
