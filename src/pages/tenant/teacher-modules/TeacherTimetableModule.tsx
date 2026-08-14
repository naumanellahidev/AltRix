import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { useOfflineTimetable, useOfflineTimetablePeriods } from "@/hooks/useOfflineData";
import { OfflineBanner } from "@/components/offline/OfflineAwareModule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodTimetableGrid, type PeriodTimetableEntry } from "@/components/timetable/PeriodTimetableGrid";
import { TimetableConflictAlert } from "@/components/timetable/TimetableConflictAlert";
import { DayFilterTabs } from "@/components/timetable/DayFilterTabs";
import { CurrentPeriodIndicator } from "@/components/timetable/CurrentPeriodIndicator";
import { WorkloadChart } from "@/components/timetable/WorkloadChart";
import { PeriodNotesDialog } from "@/components/timetable/PeriodNotesDialog";
import { SectionTimetableDialog } from "@/components/timetable/SectionTimetableDialog";
import { Button } from "@/components/ui/button";
import { Printer, Coffee, Download, FileText, Calendar, NotebookPen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { openTimetablePdf, downloadTimetableHtml, type TimetablePdfData } from "@/lib/timetable-pdf";
import { downloadTimetableIcs } from "@/lib/timetable-ics";
import { useConflictDetection } from "@/pages/tenant/modules/components/timetable/useConflictDetection";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Period = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  is_break: boolean;
};

interface TimetableEntry {
  id: string;
  subject_name: string;
  day_of_week: number;
  period_id: string;
  room: string | null;
  teacher_user_id: string | null;
  section_label: string | null;
  class_section_id: string | null;
}

interface SectionInfo {
  id: string;
  label: string;
}

type AllEntryRow = {
  id: string;
  day_of_week: number;
  period_id: string;
  subject_name: string;
  teacher_user_id: string | null;
  room: string | null;
  class_section_id: string;
};

type PeriodLog = {
  id: string;
  timetable_entry_id: string;
  topic_covered: string | null;
  notes: string | null;
  logged_at: string;
};

export function TeacherTimetableModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const schoolName = useMemo(() => (tenant.status === "ready" ? tenant.school.name : "School"), [tenant.status, tenant.school]);
  
  const [myEntries, setMyEntries] = useState<TimetableEntry[]>([]);
  const [sectionEntries, setSectionEntries] = useState<TimetableEntry[]>([]);
  const [allSchoolEntries, setAllSchoolEntries] = useState<AllEntryRow[]>([]);
  const [viewMode, setViewMode] = useState<"mine" | "sections">("mine");
  const [selectedDay, setSelectedDay] = useState<number>(-1); // -1 = all days
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodLogs, setPeriodLogs] = useState<PeriodLog[]>([]);
  const [directory, setDirectory] = useState<Array<{ user_id: string; display_name: string | null; email: string }>>([]);
  const [mySections, setMySections] = useState<SectionInfo[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("Teacher");
  const [loading, setLoading] = useState(true);

  // Period notes dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedEntryForNotes, setSelectedEntryForNotes] = useState<TimetableEntry | null>(null);

  // Section timetable dialog state
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [selectedSectionForView, setSelectedSectionForView] = useState<SectionInfo | null>(null);

  // Build section label map for conflict detection
  const sectionLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of mySections) m.set(s.id, s.label);
    return m;
  }, [mySections]);

  // Conflict detection
  const conflictMap = useConflictDetection(allSchoolEntries, "", sectionLabelById);

  // Filter conflicts to only show those affecting current user's entries
  const myConflicts = useMemo(() => {
    const filtered = new Map<string, typeof conflictMap extends Map<string, infer V> ? V : never>();
    const entries = viewMode === "mine" ? myEntries : sectionEntries;
    for (const e of entries) {
      const conflicts = conflictMap.get(e.id);
      if (conflicts && conflicts.length > 0) {
        filtered.set(e.id, conflicts);
      }
    }
    return filtered;
  }, [conflictMap, myEntries, sectionEntries, viewMode]);

  // Entry labels for conflict alert display
  const entryLabels = useMemo(() => {
    const m = new Map<string, string>();
    const entries = viewMode === "mine" ? myEntries : sectionEntries;
    for (const e of entries) {
      m.set(e.id, `${e.subject_name} (${e.section_label || "Unknown section"})`);
    }
    return m;
  }, [myEntries, sectionEntries, viewMode]);

  // Period label lookup
  const periodLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of periods) m.set(p.id, p.label);
    return m;
  }, [periods]);

  // Period logs by entry ID
  const logsByEntryId = useMemo(() => {
    const m = new Map<string, PeriodLog>();
    for (const log of periodLogs) {
      m.set(log.timetable_entry_id, log);
    }
    return m;
  }, [periodLogs]);

  const fetchTimetable = useCallback(async () => {
    if (tenant.status !== "ready") return;
    setLoading(true);

    const { data: user } = await api.auth.getUser();
    const userId = user.user?.id ?? null;

    if (!userId) {
      console.error("TeacherTimetableModule: No user ID found");
      setLoading(false);
      return;
    }

    setCurrentUserId(userId);

    const [{ data: p }, { data: dir }, { data: allEntries }, { data: logs }] = await Promise.all([
      api
        .from("timetable_periods")
        .select("id,label,sort_order,start_time,end_time,is_break")
        .eq("school_id", tenant.schoolId)
        .order("sort_order", { ascending: true }),
      api.from("school_user_directory").select("user_id,display_name,email").eq("school_id", tenant.schoolId),
      api
        .from("timetable_entries")
        .select("id,subject_name,day_of_week,period_id,room,teacher_user_id,class_section_id")
        .eq("school_id", tenant.schoolId),
      api
        .from("timetable_period_logs" as any)
        .select("id,timetable_entry_id,topic_covered,notes,logged_at")
        .eq("school_id", tenant.schoolId)
        .eq("teacher_user_id", userId)
        .order("logged_at", { ascending: false }),
    ]);

    setPeriods((p ?? []) as Period[]);
    setDirectory((dir ?? []) as any);
    setAllSchoolEntries((allEntries ?? []) as AllEntryRow[]);
    setPeriodLogs(((logs ?? []) as unknown[]) as PeriodLog[]);
    const currentUserDir = (dir ?? []).find((d: any) => d.user_id === userId);
    if (currentUserDir) {
      setCurrentUserName((currentUserDir as any).display_name || (currentUserDir as any).email || "Teacher");
    }

    const { data: assignments } = await api
      .from("teacher_assignments")
      .select("class_section_id")
      .eq("school_id", tenant.schoolId)
      .eq("teacher_user_id", userId);
    const sectionIds = (assignments ?? []).map((a) => a.class_section_id).filter(Boolean) as string[];

    const entrySectionIds = new Set<string>();
    for (const e of allEntries ?? []) {
      if (e.class_section_id) entrySectionIds.add(e.class_section_id);
    }

    const sectionIdsToLabel = Array.from(new Set([...sectionIds, ...Array.from(entrySectionIds)]));
    const sectionLabelById = new Map<string, string>();

    if (sectionIdsToLabel.length > 0) {
      const { data: secs } = await api
        .from("class_sections")
        .select("id, name, academic_classes(name)")
        .in("id", sectionIdsToLabel);

      for (const s of secs ?? []) {
        sectionLabelById.set(s.id, `${(s as any).academic_classes?.name || ""} • ${(s as any).name}`.trim());
      }
    }

    if (sectionIds.length > 0) {
      setMySections(
        sectionIds
          .map((id) => ({ id, label: sectionLabelById.get(id) ?? id }))
          .filter((s) => !!s.label),
      );
    } else {
      setMySections([]);
    }

    const enrichedAll: TimetableEntry[] = (allEntries ?? []).map((e: any) => ({
      id: e.id,
      subject_name: e.subject_name,
      day_of_week: e.day_of_week,
      period_id: e.period_id,
      room: e.room,
      teacher_user_id: e.teacher_user_id,
      class_section_id: e.class_section_id,
      section_label: e.class_section_id ? sectionLabelById.get(e.class_section_id) ?? null : null,
    }));

    const mineEnriched = enrichedAll.filter((e) => e.teacher_user_id === userId);
    const sectionSet = new Set(sectionIds);
    const sectionEnriched = enrichedAll.filter((e) => e.class_section_id && sectionSet.has(e.class_section_id));

    setMyEntries(mineEnriched);
    setSectionEntries(sectionEnriched);

    if (mineEnriched.length === 0 && sectionEnriched.length > 0) setViewMode("sections");
    setLoading(false);
  }, [tenant.status, tenant.schoolId]);

  useEffect(() => {
    void fetchTimetable();
  }, [fetchTimetable]);

  useRealtimeTable({
    channel: `teacher-timetable-${schoolId}`,
    table: "timetable_entries",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: () => void fetchTimetable(),
  });

  const teacherLabelByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of directory) m.set(d.user_id, d.display_name ?? d.email);
    return m;
  }, [directory]);

  // Apply day filter
  const entries = useMemo(() => {
    const base = viewMode === "mine" ? myEntries : sectionEntries;
    if (selectedDay === -1) return base;
    return base.filter((e) => e.day_of_week === selectedDay);
  }, [viewMode, myEntries, sectionEntries, selectedDay]);

  const gridEntries = useMemo(() => {
    return entries.map((e) => ({
      id: e.id,
      day_of_week: e.day_of_week,
      period_id: e.period_id,
      subject_name: e.subject_name,
      room: e.room,
      teacher_name: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? null : null,
      section_label: e.section_label,
    }) satisfies PeriodTimetableEntry);
  }, [entries, teacherLabelByUserId]);

  // Stats
  const baseEntries = viewMode === "mine" ? myEntries : sectionEntries;
  const uniqueSections = useMemo(() => new Set(baseEntries.map((e) => e.class_section_id).filter(Boolean)).size, [baseEntries]);
  const totalPeriods = baseEntries.length;
  const uniqueSubjects = useMemo(() => new Set(baseEntries.map((e) => e.subject_name).filter(Boolean)).size, [baseEntries]);
  const conflictCount = myConflicts.size;

  // Handlers
  const handleExportPdf = useCallback(() => {
    const pdfData: TimetablePdfData = {
      teacherName: currentUserName,
      schoolName,
      periods,
      entries: baseEntries.map((e) => ({
        day_of_week: e.day_of_week,
        period_id: e.period_id,
        subject_name: e.subject_name,
        room: e.room,
        section_label: e.section_label,
        teacher_name: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? null : null,
      })),
      generatedAt: new Date().toLocaleString(),
    };
    openTimetablePdf(pdfData);
  }, [currentUserName, schoolName, periods, baseEntries, teacherLabelByUserId]);

  const handleDownloadHtml = useCallback(() => {
    const pdfData: TimetablePdfData = {
      teacherName: currentUserName,
      schoolName,
      periods,
      entries: baseEntries.map((e) => ({
        day_of_week: e.day_of_week,
        period_id: e.period_id,
        subject_name: e.subject_name,
        room: e.room,
        section_label: e.section_label,
        teacher_name: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? null : null,
      })),
      generatedAt: new Date().toLocaleString(),
    };
    downloadTimetableHtml(pdfData);
  }, [currentUserName, schoolName, periods, baseEntries, teacherLabelByUserId]);

  const handleExportIcs = useCallback(() => {
    downloadTimetableIcs({
      teacherName: currentUserName,
      schoolName,
      periods,
      entries: baseEntries.map((e) => ({
        day_of_week: e.day_of_week,
        period_id: e.period_id,
        subject_name: e.subject_name,
        room: e.room,
        section_label: e.section_label,
        teacher_name: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? null : null,
      })),
      weeksAhead: 4,
    });
    toast.success("Calendar file downloaded! Import it to Google Calendar or Outlook.");
  }, [currentUserName, schoolName, periods, baseEntries, teacherLabelByUserId]);

  const handleOpenNotes = (entry: TimetableEntry) => {
    setSelectedEntryForNotes(entry);
    setNotesDialogOpen(true);
  };

  const handleSectionClick = (section: SectionInfo) => {
    setSelectedSectionForView(section);
    setSectionDialogOpen(true);
  };

  // Get entries for selected section
  const sectionDialogEntries = useMemo(() => {
    if (!selectedSectionForView) return [];
    return (allSchoolEntries as TimetableEntry[])
      .filter((e) => e.class_section_id === selectedSectionForView.id)
      .map((e) => ({
        id: e.id,
        day_of_week: e.day_of_week,
        period_id: e.period_id,
        subject_name: e.subject_name,
        room: e.room,
        teacher_name: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? null : null,
        section_label: null,
      }) satisfies PeriodTimetableEntry);
  }, [selectedSectionForView, allSchoolEntries, teacherLabelByUserId]);

  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  if (loading && !isOffline) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Offline Banner */}
      {isOffline && <OfflineBanner isUsingCache={true} />}

      {/* Current Period Indicator */}
      <CurrentPeriodIndicator periods={periods} className="no-print" />

      {/* Conflict Alert */}
      {conflictCount > 0 && (
        <TimetableConflictAlert conflicts={myConflicts} entryLabels={entryLabels} />
      )}

      {/* Day Filter */}
      <div className="no-print">
        <DayFilterTabs selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary" className="text-sm">
          {totalPeriods} periods
        </Badge>
        <Badge variant="secondary" className="text-sm">
          {uniqueSections} sections
        </Badge>
        <Badge variant="secondary" className="text-sm">
          {uniqueSubjects} subjects
        </Badge>
        {periods.some((p) => p.is_break) && (
          <Badge variant="outline" className="text-sm">
            <Coffee className="mr-1 h-3 w-3" />
            {periods.filter((p) => p.is_break).length} breaks
          </Badge>
        )}
        {conflictCount > 0 && (
          <Badge variant="destructive" className="text-sm">
            {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between no-print">
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <SelectTrigger className="w-full sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">My periods ({myEntries.length})</SelectItem>
            <SelectItem value="sections">All assigned sections ({sectionEntries.length})</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportIcs} disabled={baseEntries.length === 0}>
            <Calendar className="mr-2 h-4 w-4" /> Sync Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={baseEntries.length === 0}>
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadHtml} disabled={baseEntries.length === 0}>
            <Download className="mr-2 h-4 w-4" /> HTML
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Workload Chart */}
      <WorkloadChart entries={baseEntries} periods={periods} />

      {/* Assigned sections list - now clickable */}
      {mySections.length > 0 && (
        <Card className="no-print">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              My Assigned Sections (click to view full timetable)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mySections.map((s) => (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => handleSectionClick(s)}
                >
                  {s.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Timetable Grid */}
      <Card className="print-area">
        <CardHeader className="no-print">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {selectedDay === -1 ? "My Weekly Schedule" : `${DAYS[selectedDay]} Schedule`}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {viewMode === "mine"
                  ? "Periods where you are the assigned teacher"
                  : "All periods in your assigned sections"}
              </p>
            </div>
            {viewMode === "mine" && entries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date().getDay();
                  const todayEntry = entries.find((e) => e.day_of_week === today);
                  if (todayEntry) {
                    handleOpenNotes(todayEntry);
                  } else if (entries[0]) {
                    handleOpenNotes(entries[0]);
                  }
                }}
              >
                <NotebookPen className="mr-2 h-4 w-4" /> Log Period
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No timetable entries found for this view.
            </p>
          ) : (
            <PeriodTimetableGrid periods={periods} entries={gridEntries} />
          )}
        </CardContent>
      </Card>

      {/* Period Notes Dialog */}
      {selectedEntryForNotes && schoolId && (
        <PeriodNotesDialog
          open={notesDialogOpen}
          onOpenChange={setNotesDialogOpen}
          schoolId={schoolId}
          entryId={selectedEntryForNotes.id}
          periodInfo={{
            id: selectedEntryForNotes.id,
            subject_name: selectedEntryForNotes.subject_name,
            room: selectedEntryForNotes.room,
            section_label: selectedEntryForNotes.section_label,
            period_label: periodLabelById.get(selectedEntryForNotes.period_id) ?? "Period",
            day_label: DAYS[selectedEntryForNotes.day_of_week] ?? "Day",
          }}
          existingNote={logsByEntryId.get(selectedEntryForNotes.id) ?? null}
          onSaved={fetchTimetable}
        />
      )}

      {/* Section Timetable Dialog */}
      {selectedSectionForView && (
        <SectionTimetableDialog
          open={sectionDialogOpen}
          onOpenChange={setSectionDialogOpen}
          sectionLabel={selectedSectionForView.label}
          periods={periods}
          entries={sectionDialogEntries}
        />
      )}
    </div>
  );
}
