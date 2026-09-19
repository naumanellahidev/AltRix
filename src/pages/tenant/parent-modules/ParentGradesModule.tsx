import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { RefreshCw, WifiOff } from "lucide-react";
import { useOfflineAssessments, useOfflineStudentMarks, useOfflineSubjects } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { ratioPercent } from "@/lib/documents/decimal";

interface ParentGradesModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const ParentGradesModule = ({ child, schoolId }: ParentGradesModuleProps) => {
  // Use offline-first hooks
  const { 
    data: cachedAssessments, 
    loading: assessmentsLoading, 
    isOffline, 
    isUsingCache: assessmentsFromCache,
    refresh: refreshAssessments 
  } = useOfflineAssessments(schoolId);
  
  const { 
    data: cachedMarks, 
    loading: marksLoading,
    isUsingCache: marksFromCache,
    refresh: refreshMarks 
  } = useOfflineStudentMarks(schoolId);
  
  const { 
    data: cachedSubjects,
    isUsingCache: subjectsFromCache 
  } = useOfflineSubjects(schoolId);

  // Filter marks for this child and only show published assessments
  const childGrades = useMemo(() => {
    if (!child) return [];
    
    const childMarks = cachedMarks.filter(m => m.studentId === child.student_id);
    const publishedAssessments = cachedAssessments.filter(a => a.isPublished);
    const subjectNameById = new Map(cachedSubjects.map(s => [s.id, s.name]));
    
    return childMarks
      .map(mark => {
        const assessment = publishedAssessments.find(a => a.id === mark.assessmentId);
        if (!assessment) return null;
        
        return {
          id: mark.id,
          marks: mark.marks || 0,
          max_marks: assessment.maxMarks || 100,
          assessment_title: assessment.title,
          assessment_date: assessment.assessmentDate,
          subject_name: assessment.subjectId ? subjectNameById.get(assessment.subjectId) : null,
          computed_grade: mark.computedGrade,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.assessment_date).getTime() - new Date(a!.assessment_date).getTime());
  }, [cachedMarks, cachedAssessments, cachedSubjects, child]);

  if (!child) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a child to view grades.
      </div>
    );
  }

  const handleRefresh = () => {
    if (!isOffline) {
      refreshAssessments();
      refreshMarks();
    }
  };

  const loading = assessmentsLoading || marksLoading;
  const isUsingCache = assessmentsFromCache || marksFromCache || subjectsFromCache;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={handleRefresh} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Grades</h1>
          <p className="text-muted-foreground">
            View grades and assessment results for {child.first_name || "your child"}
          </p>
        </div>
        {!isOffline && (
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Assessment Results</CardTitle>
            <DataExportMenu
              title="Assessment Results"
              subtitle={child ? [child.first_name, child.last_name].filter(Boolean).join(" ") : undefined}
              fileNameParts={[child ? [child.first_name, child.last_name].filter(Boolean).join(" ") : null, "Assessment Results"]}
              rows={childGrades.filter(Boolean).map((g: any) => ({
                Assessment: g.assessment_title,
                Subject: g.subject_name ?? "",
                Date: g.assessment_date ? String(g.assessment_date).slice(0, 10) : "",
                Marks: g.marks != null ? `${g.marks} / ${g.max_marks}` : "Not marked",
                "%": g.marks != null ? ratioPercent(g.marks, g.max_marks) ?? "" : "",
                Grade: g.computed_grade ?? "",
              }))}
              disabled={!childGrades.length}
              size="sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {childGrades.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {isOffline ? (
                <div className="flex flex-col items-center gap-2">
                  <WifiOff className="h-6 w-6" />
                  <span>No cached grades available</span>
                </div>
              ) : (
                "No grades recorded yet."
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {childGrades.map((grade) => {
                  if (!grade) return null;
                  const percentage = grade.marks != null ? ratioPercent(grade.marks, grade.max_marks) : null;
                  return (
                    <TableRow key={grade.id}>
                      <TableCell className="font-medium">{grade.assessment_title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {grade.subject_name || "—"}
                      </TableCell>
                      <TableCell>
                        {grade.assessment_date
                          ? format(new Date(grade.assessment_date), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {grade.marks != null ? `${grade.marks} / ${grade.max_marks}` : "Not marked"}
                      </TableCell>
                      <TableCell>
                        {grade.computed_grade ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {grade.computed_grade}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{percentage != null ? `${percentage}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ParentGradesModule;
