import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChildInfo } from "@/hooks/useMyChildren";
import { PeriodTimetableGrid, type PeriodTimetableEntry } from "@/components/timetable/PeriodTimetableGrid";
import { Button } from "@/components/ui/button";
import { WifiOff, RefreshCw } from "lucide-react";
import { TimetableDocumentActions } from "@/components/timetable/TimetableDocumentActions";
import { useOfflineTimetable, useOfflineTimetablePeriods, useOfflineEnrollments, useOfflineStaffMembers } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

interface ParentTimetableModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

const ParentTimetableModule = ({ child, schoolId }: ParentTimetableModuleProps) => {
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

  // Get child's section ID
  const sectionId = useMemo(() => {
    if (!child) return null;
    const enrollment = cachedEnrollments.find(e => e.studentId === child.student_id);
    return enrollment?.classSectionId || null;
  }, [cachedEnrollments, child]);

  // Filter entries for child's section
  const childEntries = useMemo(() => {
    if (!sectionId) return [];
    return cachedEntries.filter(e => e.classSectionId === sectionId);
  }, [cachedEntries, sectionId]);

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
    return childEntries.map((e) => ({
      id: e.id,
      day_of_week: e.dayOfWeek,
      period_id: e.periodId,
      subject_name: e.subjectName,
      room: e.room,
      teacher_name: e.teacherUserId ? teacherLabelByUserId.get(e.teacherUserId) ?? null : null,
    }) satisfies PeriodTimetableEntry);
  }, [childEntries, teacherLabelByUserId]);

  if (!child) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a child to view timetable.
      </div>
    );
  }

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
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refreshEntries} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Timetable</h1>
          <p className="text-muted-foreground">
            Weekly schedule for {child.first_name || "your child"}
            {child.class_name && ` • ${child.class_name}`}
            {child.section_name && ` / ${child.section_name}`}
          </p>
        </div>
        <div className="flex gap-2 no-print">
          {!isOffline && (
            <Button variant="outline" size="sm" onClick={refreshEntries}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          )}
          <TimetableDocumentActions
            disabled={gridEntries.length === 0}
            input={() => ({
              title: "Class Timetable",
              subject: [child.first_name, child.last_name].filter(Boolean).join(" ") +
                (child.class_name ? ` — ${child.class_name}${child.section_name ? ` ${child.section_name}` : ""}` : ""),
              periods,
              entries: gridEntries,
              cellDetail: "teacher",
            })}
          />
        </div>
      </div>

      {gridEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {isOffline ? (
              <div className="flex flex-col items-center gap-2">
                <WifiOff className="h-8 w-8" />
                <p>No cached timetable available</p>
              </div>
            ) : (
              "No timetable entries found for this section."
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="print-area">
          <PeriodTimetableGrid periods={periods} entries={gridEntries} />
        </div>
      )}
    </div>
  );
};

export default ParentTimetableModule;
