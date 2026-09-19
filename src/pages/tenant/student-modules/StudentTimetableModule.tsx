import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PeriodTimetableGrid, type PeriodTimetableEntry } from "@/components/timetable/PeriodTimetableGrid";
import { WifiOff, RefreshCw } from "lucide-react";
import { TimetableDocumentActions } from "@/components/timetable/TimetableDocumentActions";
import { useOfflineTimetable, useOfflineTimetablePeriods, useOfflineEnrollments, useOfflineStaffMembers } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

export function StudentTimetableModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
  // Use offline-first hooks
  const { 
    data: cachedEntries, 
    loading: entriesLoading, 
    isOffline, 
    isUsingCache: entriesFromCache,
    refresh: refreshEntries 
  } = useOfflineTimetable(schoolId);
  
  const { 
    data: cachedPeriods, 
    loading: periodsLoading,
    isUsingCache: periodsFromCache 
  } = useOfflineTimetablePeriods(schoolId);
  
  const { 
    data: cachedEnrollments,
    isUsingCache: enrollmentsFromCache 
  } = useOfflineEnrollments(schoolId);
  
  const { 
    data: cachedStaff,
    isUsingCache: staffFromCache 
  } = useOfflineStaffMembers(schoolId);

  // Get student's section IDs
  const sectionIds = useMemo(() => {
    if (myStudent.status !== "ready") return [];
    return cachedEnrollments
      .filter(e => e.studentId === myStudent.studentId)
      .map(e => e.classSectionId);
  }, [cachedEnrollments, myStudent]);

  // Filter entries for student's sections
  const studentEntries = useMemo(() => {
    if (!sectionIds.length) return [];
    return cachedEntries.filter(e => sectionIds.includes(e.classSectionId));
  }, [cachedEntries, sectionIds]);

  // Build teacher lookup
  const teacherLabelByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of cachedStaff) {
      m.set(s.userId, s.displayName || s.email);
    }
    return m;
  }, [cachedStaff]);

  // Convert periods to grid format
  const periods = useMemo(() => {
    return cachedPeriods.map(p => ({
      id: p.id,
      label: p.label,
      sort_order: p.sortOrder,
      start_time: p.startTime,
      end_time: p.endTime,
    }));
  }, [cachedPeriods]);

  // Convert entries to grid format
  const gridEntries = useMemo(() => {
    return studentEntries.map((e) => ({
      id: e.id,
      day_of_week: e.dayOfWeek,
      period_id: e.periodId,
      subject_name: e.subjectName,
      room: e.room,
      teacher_name: e.teacherUserId ? teacherLabelByUserId.get(e.teacherUserId) ?? null : null,
    }) satisfies PeriodTimetableEntry);
  }, [studentEntries, teacherLabelByUserId]);

  const loading = entriesLoading || periodsLoading;
  const isUsingCache = entriesFromCache || periodsFromCache || enrollmentsFromCache || staffFromCache;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refreshEntries} />
      
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Your timetable</p>
        <div className="flex gap-2 no-print">
          {!isOffline && (
            <Button variant="outline" size="sm" onClick={refreshEntries}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          )}
          <TimetableDocumentActions
            disabled={gridEntries.length === 0}
            input={() => ({ title: "Class Timetable", subject: "My timetable", periods, entries: gridEntries, cellDetail: "teacher" })}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Sections: {sectionIds.length ? sectionIds.join(", ") : "—"}
      </p>

      {gridEntries.length === 0 ? (
        <div className="rounded-3xl bg-surface p-6 shadow-elevated">
          {isOffline ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <WifiOff className="h-8 w-8" />
              <p className="text-sm">No cached timetable available</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No timetable entries yet.</p>
          )}
        </div>
      ) : (
        <div className="print-area">
          <PeriodTimetableGrid periods={periods} entries={gridEntries} />
        </div>
      )}
    </div>
  );
}
