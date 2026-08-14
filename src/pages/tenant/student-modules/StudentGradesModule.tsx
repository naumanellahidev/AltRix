import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw, WifiOff } from "lucide-react";
import { useOfflineAssessments, useOfflineStudentMarks, useOfflineSubjects } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

export function StudentGradesModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
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

  // Filter marks for this student
  const studentMarks = useMemo(() => {
    if (myStudent.status !== "ready") return [];
    return cachedMarks.filter(m => m.studentId === myStudent.studentId);
  }, [cachedMarks, myStudent]);

  // Only show published assessments
  const publishedAssessments = useMemo(() => {
    return cachedAssessments.filter(a => a.isPublished);
  }, [cachedAssessments]);

  const markByAssessment = useMemo(() => {
    const map = new Map<string, typeof studentMarks[0]>();
    for (const m of studentMarks) map.set(m.assessmentId, m);
    return map;
  }, [studentMarks]);

  const subjectNameById = useMemo(() => 
    new Map(cachedSubjects.map((s) => [s.id, s.name])), 
    [cachedSubjects]
  );

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
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={handleRefresh} />
      
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your published assessments & marks</p>
        {!isOffline && (
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Assessment</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Marks</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {publishedAssessments.map((a) => {
            const m = markByAssessment.get(a.id);
            const percentage = m?.marks != null ? ((m.marks / a.maxMarks) * 100).toFixed(1) : null;
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {a.subjectId ? subjectNameById.get(a.subjectId) ?? "—" : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(a.assessmentDate).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {m?.marks != null ? (
                    <span>
                      {m.marks} / {a.maxMarks}
                      <span className="ml-1 text-xs text-muted-foreground">({percentage}%)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {m?.computedGrade ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {m.computedGrade}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">
                  —
                </TableCell>
              </TableRow>
            );
          })}
          {publishedAssessments.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                {isOffline ? (
                  <div className="flex flex-col items-center gap-2">
                    <WifiOff className="h-6 w-6" />
                    <span>No cached assessments available</span>
                  </div>
                ) : (
                  "No published assessments found yet."
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
