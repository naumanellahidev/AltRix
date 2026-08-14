import { useEffect, useState } from "react";
import { Award, MessageSquare, TrendingDown, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { QuickMessageDialog } from "./QuickMessageDialog";

interface StudentPerformance {
  student_id: string;
  student_name: string;
  average_score: number;
  assessment_count: number;
}

interface SectionAverage {
  section_id: string;
  section_label: string;
  average: number;
  student_count: number;
}

interface StudentPerformanceWidgetProps {
  schoolId: string;
  sectionIds: string[];
}

export function StudentPerformanceWidget({ schoolId, sectionIds }: StudentPerformanceWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [sectionAverages, setSectionAverages] = useState<SectionAverage[]>([]);
  const [topStudents, setTopStudents] = useState<StudentPerformance[]>([]);
  const [strugglingStudents, setStrugglingStudents] = useState<StudentPerformance[]>([]);
  const [overallStats, setOverallStats] = useState({ totalStudents: 0, overallAverage: 0 });
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; student: StudentPerformance | null }>({
    open: false,
    student: null,
  });

  useEffect(() => {
    if (!schoolId || sectionIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchPerformanceData = async () => {
      setLoading(true);

      try {
        // Fetch section details
        const { data: sections } = await api
          .from("class_sections")
          .select("id, name, academic_classes(name)")
          .in("id", sectionIds);

        const sectionLabels = new Map<string, string>();
        (sections ?? []).forEach((s: any) => {
          sectionLabels.set(s.id, `${s.academic_classes?.name || ""} • ${s.name}`.trim());
        });

        // Fetch assessments for these sections
        const { data: assessments } = await api
          .from("academic_assessments")
          .select("id, class_section_id, max_marks")
          .eq("school_id", schoolId)
          .in("class_section_id", sectionIds);

        if (!assessments || assessments.length === 0) {
          setLoading(false);
          return;
        }

        const assessmentIds = assessments.map((a) => a.id);
        const maxMarksByAssessment = new Map<string, number>();
        const sectionByAssessment = new Map<string, string>();
        assessments.forEach((a) => {
          maxMarksByAssessment.set(a.id, a.max_marks);
          sectionByAssessment.set(a.id, a.class_section_id);
        });

        // Fetch student marks - use the actual table name
        const { data: marks } = await api
          .from("student_marks")
          .select("assessment_id, student_id, marks")
          .in("assessment_id", assessmentIds);

        if (!marks || marks.length === 0) {
          setLoading(false);
          return;
        }

        // Fetch student names
        const studentIds = [...new Set(marks.map((r) => r.student_id))];
        const { data: students } = await api
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds);

        const studentNames = new Map<string, string>();
        (students ?? []).forEach((s: any) => {
          studentNames.set(s.id, `${s.first_name} ${s.last_name}`.trim());
        });

        // Fetch enrollments to map students to sections
        const { data: enrollments } = await api
          .from("student_enrollments")
          .select("student_id, class_section_id")
          .eq("school_id", schoolId)
          .in("class_section_id", sectionIds);

        const studentSections = new Map<string, string>();
        (enrollments ?? []).forEach((e: any) => {
          studentSections.set(e.student_id, e.class_section_id);
        });

        // Calculate per-student performance (percentage scores)
        const studentScores = new Map<string, { total: number; count: number }>();
        marks.forEach((r) => {
          const maxMarks = maxMarksByAssessment.get(r.assessment_id) || 100;
          const percentage = ((r.marks ?? 0) / maxMarks) * 100;
          const current = studentScores.get(r.student_id) || { total: 0, count: 0 };
          studentScores.set(r.student_id, {
            total: current.total + percentage,
            count: current.count + 1,
          });
        });

        // Build student performance list
        const performances: StudentPerformance[] = [];
        studentScores.forEach((scores, studentId) => {
          performances.push({
            student_id: studentId,
            student_name: studentNames.get(studentId) || "Unknown",
            average_score: scores.total / scores.count,
            assessment_count: scores.count,
          });
        });

        // Sort and get top 5 and bottom 5
        performances.sort((a, b) => b.average_score - a.average_score);
        setTopStudents(performances.slice(0, 5));
        
        const struggling = performances.filter((p) => p.average_score < 60);
        struggling.sort((a, b) => a.average_score - b.average_score);
        setStrugglingStudents(struggling.slice(0, 5));

        // Calculate section averages
        const sectionScores = new Map<string, { total: number; count: number }>();
        performances.forEach((p) => {
          const sectionId = studentSections.get(p.student_id);
          if (sectionId) {
            const current = sectionScores.get(sectionId) || { total: 0, count: 0 };
            sectionScores.set(sectionId, {
              total: current.total + p.average_score,
              count: current.count + 1,
            });
          }
        });

        const sectionAvgs: SectionAverage[] = [];
        sectionScores.forEach((scores, sectionId) => {
          sectionAvgs.push({
            section_id: sectionId,
            section_label: sectionLabels.get(sectionId) || "Unknown",
            average: scores.total / scores.count,
            student_count: scores.count,
          });
        });
        sectionAvgs.sort((a, b) => b.average - a.average);
        setSectionAverages(sectionAvgs);

        // Overall stats
        const totalStudents = performances.length;
        const overallAverage = performances.reduce((sum, p) => sum + p.average_score, 0) / (totalStudents || 1);
        setOverallStats({ totalStudents, overallAverage });
      } catch (err) {
        console.error("Error fetching performance data:", err);
      }

      setLoading(false);
    };

    void fetchPerformanceData();
  }, [schoolId, sectionIds]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (sectionIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sections assigned.</p>
        </CardContent>
      </Card>
    );
  }

  if (overallStats.totalStudents === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No assessment results available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Award className="h-5 w-5" />
          Student Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Overall Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold">{overallStats.totalStudents}</p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-3 w-3" /> Students Assessed
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold">{overallStats.overallAverage.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Class Average</p>
          </div>
        </div>

        {/* Section Averages */}
        {sectionAverages.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Section Averages</p>
            <div className="space-y-2">
              {sectionAverages.map((section) => (
                <div key={section.section_id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs truncate">{section.section_label}</span>
                      <span className="text-xs font-medium">{section.average.toFixed(1)}%</span>
                    </div>
                    <Progress value={section.average} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Performers */}
        {topStudents.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Performers
            </p>
            <div className="space-y-1.5">
              {topStudents.slice(0, 3).map((student, index) => (
                <div key={student.student_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                      {index + 1}
                    </span>
                    <span className="truncate">{student.student_name}</span>
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {student.average_score.toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Struggling Students */}
        {strugglingStudents.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              Need Attention
              <span className="text-xs text-muted-foreground font-normal ml-1">(click to message parent)</span>
            </p>
            <div className="space-y-1.5">
              {strugglingStudents.slice(0, 3).map((student) => (
                <div
                  key={student.student_id}
                  className="flex items-center justify-between text-sm group rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setMessageDialog({ open: true, student })}
                >
                  <span className="truncate text-muted-foreground group-hover:text-foreground">
                    {student.student_name}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-destructive border-destructive/50">
                      {student.average_score.toFixed(1)}%
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMessageDialog({ open: true, student });
                          }}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Message parent</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Message Dialog */}
        {messageDialog.student && (
          <QuickMessageDialog
            open={messageDialog.open}
            onOpenChange={(open) => setMessageDialog({ open, student: open ? messageDialog.student : null })}
            studentId={messageDialog.student.student_id}
            studentName={messageDialog.student.student_name}
            schoolId={schoolId}
          />
        )}
      </CardContent>
    </Card>
  );
}
