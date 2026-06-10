import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { useActiveCampus } from "@/hooks/useActiveCampus";
import { OwnerTeacherEffectiveness } from "./OwnerTeacherEffectiveness";

interface Props {
  schoolId: string | null;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

export function OwnerAcademicsModule({ schoolId }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const activeCampusId = useActiveCampus(schoolId);
  const campusEq = (q: any) => (activeCampusId ? q.eq("campus_id", activeCampusId) : q);

  // Fetch academic data
  const { data: academicData, isLoading } = useQuery({
    queryKey: ["owner_academics", schoolId, activeCampusId],
    queryFn: async () => {
      if (!schoolId) return null;

      const [classesRes, sectionsRes, studentsRes, marksRes, teachersRes, subjectsRes, assessmentsRes, atRiskRes] = await Promise.all([
        supabase.from("academic_classes").select("*").eq("school_id", schoolId),
        campusEq(supabase.from("class_sections").select("*").eq("school_id", schoolId)),
        campusEq(supabase.from("students").select("id,status,first_name,last_name").eq("school_id", schoolId)),
        campusEq(supabase.from("student_marks").select("marks,student_id,assessment_id").eq("school_id", schoolId).not("marks", "is", null)),
        supabase.from("user_roles").select("user_id").eq("school_id", schoolId).eq("role", "teacher"),
        supabase.from("subjects").select("*").eq("school_id", schoolId),
        supabase.from("academic_assessments").select("id,max_marks,subject_id").eq("school_id", schoolId),
        (supabase as any).rpc("get_at_risk_students", { _school_id: schoolId, _class_section_id: null }),
      ]);

      const classes = classesRes.data || [];
      const sections = sectionsRes.data || [];
      const students = studentsRes.data || [];
      const marks = marksRes.data || [];
      const teachers = teachersRes.data || [];
      const subjects = subjectsRes.data || [];
      const assessments = assessmentsRes.data || [];
      const assessmentMap = new Map(assessments.map((a: any) => [a.id, a]));

      // Normalize marks → percentage using assessment.max_marks
      const pctOf = (m: any) => {
        const a: any = assessmentMap.get(m.assessment_id);
        const max = Number(a?.max_marks || 0);
        if (!max) return null;
        return (Number(m.marks || 0) / max) * 100;
      };

      const pctMarks = marks.map(pctOf).filter((v): v is number => v !== null);
      const avgMarks = pctMarks.length > 0 ? pctMarks.reduce((a, b) => a + b, 0) / pctMarks.length : 0;

      // Per-student averages (as %)
      const studentPerformance: Record<string, number[]> = {};
      marks.forEach((m) => {
        const p = pctOf(m);
        if (p === null) return;
        if (!studentPerformance[m.student_id]) studentPerformance[m.student_id] = [];
        studentPerformance[m.student_id].push(p);
      });

      const performanceDistribution = { excellent: 0, good: 0, average: 0, belowAverage: 0 };
      Object.values(studentPerformance).forEach((scores) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg >= 90) performanceDistribution.excellent++;
        else if (avg >= 75) performanceDistribution.good++;
        else if (avg >= 50) performanceDistribution.average++;
        else performanceDistribution.belowAverage++;
      });

      // Real subject-level averages
      const subjectScores: Record<string, number[]> = {};
      marks.forEach((m) => {
        const a: any = assessmentMap.get(m.assessment_id);
        if (!a?.subject_id) return;
        const p = pctOf(m);
        if (p === null) return;
        if (!subjectScores[a.subject_id]) subjectScores[a.subject_id] = [];
        subjectScores[a.subject_id].push(p);
      });
      const subjectAverages = subjects.map((s: any) => {
        const arr = subjectScores[s.id] || [];
        const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        return { id: s.id, name: s.name, avg, sampleSize: arr.length };
      });

      // At-risk via RPC (handles attendance + grade decline)
      const atRiskRows = (atRiskRes as any)?.data || [];
      const atRiskStudents = atRiskRows.map((r: any) => ({
        id: r.student_id,
        first_name: r.first_name,
        last_name: r.last_name,
        reason: r.risk_reason,
        attendance_rate: r.attendance_rate,
        avg_grade: r.avg_grade_percentage,
      }));

      return {
        totalClasses: classes.length,
        totalSections: sections.length,
        totalStudents: students.length,
        activeStudents: students.filter((s) => s.status === "enrolled" || s.status === "active").length,
        totalTeachers: teachers.length,
        totalSubjects: subjects.length,
        averageMarks: Math.round(avgMarks),
        performanceDistribution,
        atRiskStudents,
        classes,
        sections,
        subjects,
        subjectAverages,
      };
    },
    enabled: !!schoolId,
  });

  const performanceChartData = useMemo(() => {
    if (!academicData) return [];
    return [
      { name: "Excellent (90+)", value: academicData.performanceDistribution.excellent, fill: "hsl(var(--primary))" },
      { name: "Good (75-89)", value: academicData.performanceDistribution.good, fill: "hsl(var(--chart-2))" },
      { name: "Average (50-74)", value: academicData.performanceDistribution.average, fill: "hsl(var(--chart-3))" },
      { name: "Below Avg (<50)", value: academicData.performanceDistribution.belowAverage, fill: "hsl(var(--destructive))" },
    ];
  }, [academicData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Academics Intelligence</h1>
        <p className="text-muted-foreground">Institution-level learning analytics and performance tracking</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{academicData?.totalClasses || 0}</p>
            <p className="text-xs text-muted-foreground">Classes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{academicData?.totalSections || 0}</p>
            <p className="text-xs text-muted-foreground">Sections</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{academicData?.activeStudents || 0}</p>
            <p className="text-xs text-muted-foreground">Active Students</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{academicData?.totalTeachers || 0}</p>
            <p className="text-xs text-muted-foreground">Teachers</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{academicData?.averageMarks || 0}%</p>
            <p className="text-xs text-muted-foreground">Avg Performance</p>
          </CardContent>
        </Card>

        <Card className={academicData?.atRiskStudents && academicData.atRiskStudents.length > 0 ? "border-red-500/50" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-red-600">
              {academicData?.atRiskStudents?.length || 0}
            </p>
            <p className="text-xs text-muted-foreground">At-Risk Students</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Performance Overview</TabsTrigger>
          <TabsTrigger value="heatmap">Subject Analysis</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Students</TabsTrigger>
          <TabsTrigger value="teachers">Teacher Effectiveness</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Grade Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={performanceChartData} 
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <XAxis 
                        type="number" 
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={85} 
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value} students`, "Count"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {performanceChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Academic Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Student-Teacher Ratio</span>
                    <span className="font-medium">
                      {academicData?.totalTeachers
                        ? Math.round((academicData.activeStudents || 0) / academicData.totalTeachers)
                        : 0}
                      :1
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, ((academicData?.activeStudents || 0) / Math.max(1, (academicData?.totalTeachers || 1) * 30)) * 100)}
                    className="mt-2 h-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Pass Rate</span>
                    <span className="font-medium">
                      {(() => {
                        const d = academicData?.performanceDistribution;
                        if (!d) return 0;
                        const total = Math.max(1, d.excellent + d.good + d.average + d.belowAverage);
                        return Math.round(((d.excellent + d.good + d.average) / total) * 100);
                      })()}
                      %
                    </span>
                  </div>
                  <Progress
                    value={(() => {
                      const d = academicData?.performanceDistribution;
                      if (!d) return 0;
                      const total = Math.max(1, d.excellent + d.good + d.average + d.belowAverage);
                      return Math.round(((d.excellent + d.good + d.average) / total) * 100);
                    })()}
                    className="mt-2 h-2"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Excellence Rate (90%+)</span>
                    <span className="font-medium">
                      {(() => {
                        const d = academicData?.performanceDistribution;
                        if (!d) return 0;
                        const total = Math.max(1, d.excellent + d.good + d.average + d.belowAverage);
                        return Math.round((d.excellent / total) * 100);
                      })()}
                      %
                    </span>
                  </div>
                  <Progress
                    value={(() => {
                      const d = academicData?.performanceDistribution;
                      if (!d) return 0;
                      const total = Math.max(1, d.excellent + d.good + d.average + d.belowAverage);
                      return Math.round((d.excellent / total) * 100);
                    })()}
                    className="mt-2 h-2"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subject Performance Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(academicData?.subjectAverages || []).map((subject: any) => {
                  const hasData = subject.avg !== null;
                  const value = hasData ? Math.round(subject.avg) : 0;
                  const tone = !hasData ? "outline" : value >= 75 ? "default" : value >= 50 ? "secondary" : "destructive";
                  return (
                    <div key={subject.id} className="rounded-xl bg-muted/50 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{subject.name}</span>
                        <Badge variant={tone as any}>
                          {hasData ? `${value}%` : "No data"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={value} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {subject.sampleSize} marks
                        </span>
                      </div>
                    </div>
                  );
                })}
                {(!academicData?.subjectAverages || academicData.subjectAverages.length === 0) && (
                  <p className="col-span-full text-center text-muted-foreground py-8">
                    No subjects configured yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="at-risk" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                At-Risk Students (low attendance, low grades, or declining)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {academicData?.atRiskStudents && academicData.atRiskStudents.length > 0 ? (
                  <div className="space-y-2">
                    {academicData.atRiskStudents.map((student: any) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between rounded-xl bg-red-500/10 p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {student.first_name} {student.last_name || ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {student.reason || "Requires intervention"}
                            {typeof student.attendance_rate === "number" && (
                              <> · Attendance {Math.round(student.attendance_rate)}%</>
                            )}
                            {typeof student.avg_grade === "number" && student.avg_grade > 0 && (
                              <> · Avg {Math.round(student.avg_grade)}%</>
                            )}
                          </p>
                        </div>
                        <Badge variant="destructive">At Risk</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No at-risk students identified
                  </p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teachers" className="mt-6 space-y-4">
          {schoolId && <OwnerTeacherEffectiveness schoolId={schoolId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
