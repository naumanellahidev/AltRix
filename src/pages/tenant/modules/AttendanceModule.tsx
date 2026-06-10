import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { useAttendanceData, StudentRow, AttendanceSession, StudentAttendanceStats } from "@/hooks/useAttendanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, FileCheck, Keyboard, History, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttendanceHistoryDialog } from "@/components/attendance/AttendanceHistoryDialog";
import { StudentAttendanceStatsCard } from "@/components/attendance/StudentAttendanceStatsCard";
import { AttendancePercentageBadge } from "@/components/attendance/AttendancePercentageBadge";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { useOfflineSections, useOfflineClasses, useOfflineTeacherAssignments } from "@/hooks/useOfflineData";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

const STATUS_ORDER: StudentRow["status"][] = ["present", "absent", "late", "excused"];

export function AttendanceModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const perms = useSchoolPermissions(schoolId);

  // Only teachers, principals (and ownership roles) may add/edit attendance.
  // Counselors and other school members get a read-only view.
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [canEditLoading, setCanEditLoading] = useState<boolean>(true);
  useEffect(() => {
    if (!schoolId) { setCanEditLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).rpc("can_edit_attendance", { _school_id: schoolId });
      if (!cancelled) { setCanEdit(!!data); setCanEditLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [schoolId]);

  const offlineSections = useOfflineSections(schoolId);
  const offlineClasses = useOfflineClasses(schoolId);
  const offlineTeacherAssignments = useOfflineTeacherAssignments(schoolId);
  const isOffline = offlineSections.isOffline;
  const isUsingCache = offlineSections.isUsingCache || offlineClasses.isUsingCache;

  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [periodLabel, setPeriodLabel] = useState<string>("Period 1");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<AttendanceSession[]>([]);
  const [studentStats, setStudentStats] = useState<StudentAttendanceStats[]>([]);
  const [showStats, setShowStats] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const {
    loadSessionData,
    saveAttendance,
    loadSessionHistory,
    loadStudentAttendanceStats,
    loadSessionEntries,
  } = useAttendanceData(schoolId);

  const stats = useMemo(() => ({
    present: rows.filter((r) => r.status === "present").length,
    absent: rows.filter((r) => r.status === "absent").length,
    late: rows.filter((r) => r.status === "late").length,
    excused: rows.filter((r) => r.status === "excused").length,
  }), [rows]);

  const studentPercentageMap = useMemo(() => {
    const map = new Map<string, number>();
    studentStats.forEach((s) => map.set(s.student_id, s.attendance_percentage));
    return map;
  }, [studentStats]);

  // Load sections
  useEffect(() => {
    if (perms.loading || canEditLoading || !schoolId || !user?.id) return;
    let cancelled = false;

    const loadAll = async () => {
      const [{ data: sec }, { data: cls }] = await Promise.all([
        supabase.from("class_sections").select("id,name,class_id").eq("school_id", schoolId).order("name"),
        supabase.from("academic_classes").select("id,name").eq("school_id", schoolId),
      ]);
      const classMap = new Map((cls ?? []).map((c: any) => [c.id, c.name]));
      return (sec ?? []).map((s: any) => ({
        id: s.id, name: s.name, class_name: classMap.get(s.class_id) ?? "Class",
      }));
    };

    const load = async () => {
      // Principal/admin/coordinator OR any read-only viewer (e.g. counselor):
      // load every section in the school.
      if (perms.canManageStudents || !canEdit) {
        const enriched = await loadAll();
        if (!cancelled) {
          setSections(enriched);
          if (enriched.length > 0 && !selectedSection) setSelectedSection(enriched[0].id);
          setLoading(false);
        }
        return;
      }

      // Teacher: only assigned sections
      const { data: ta } = await supabase
        .from("teacher_subject_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id);
      const ids = [...new Set((ta ?? []).map((x: any) => x.class_section_id as string))];
      if (ids.length === 0) {
        if (!cancelled) { setSections([]); setLoading(false); }
        return;
      }
      const [{ data: sec }, { data: cls }] = await Promise.all([
        supabase.from("class_sections").select("id,name,class_id").eq("school_id", schoolId).in("id", ids),
        supabase.from("academic_classes").select("id,name").eq("school_id", schoolId),
      ]);
      const classMap = new Map((cls ?? []).map((c: any) => [c.id, c.name]));
      const enriched = (sec ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        class_name: classMap.get(s.class_id) ?? "Class",
      }));
      if (!cancelled) {
        setSections(enriched);
        if (enriched.length > 0 && !selectedSection) setSelectedSection(enriched[0].id);
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, user?.id, perms.loading, perms.canManageStudents, canEdit, canEditLoading]);

  const loadSession = async () => {
    if (!selectedSection) return;
    const result = await loadSessionData(selectedSection, sessionDate, periodLabel, { readOnly: !canEdit });
    if (result) {
      setSessionId(result.sessionId);
      setRows(result.rows);
      setFocusedRow(0);
      loadStats();
    }
  };

  const loadStats = async () => {
    if (!selectedSection) return;
    setLoadingStats(true);
    const s = await loadStudentAttendanceStats(selectedSection);
    setStudentStats(s);
    setLoadingStats(false);
  };

  const handleSaveAttendance = async () => {
    if (!sessionId) return;
    setSaving(true);
    await saveAttendance(sessionId, rows);
    loadStats();
    setSaving(false);
  };

  const handleOpenHistory = async () => {
    if (!selectedSection) return;
    const history = await loadSessionHistory(selectedSection);
    setHistoryData(history);
    setShowHistory(true);
  };

  const handleHistorySave = async (historySessionId: string, historyRows: StudentRow[]): Promise<boolean> => {
    const success = await saveAttendance(historySessionId, historyRows);
    if (success) loadStats();
    return success;
  };

  const updateStatus = useCallback((studentId: string, status: StudentRow["status"]) => {
    setRows((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)));
  }, []);

  const markAll = (status: StudentRow["status"]) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rows.length === 0) return;
      const currentStudent = rows[focusedRow];
      if (!currentStudent) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusedRow((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedRow((prev) => Math.min(rows.length - 1, prev + 1));
          break;
        case "ArrowLeft": {
          e.preventDefault();
          const idx = STATUS_ORDER.indexOf(currentStudent.status);
          updateStatus(currentStudent.student_id, STATUS_ORDER[Math.max(0, idx - 1)]);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const idx = STATUS_ORDER.indexOf(currentStudent.status);
          updateStatus(currentStudent.student_id, STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, idx + 1)]);
          break;
        }
        case "p": case "P": e.preventDefault(); updateStatus(currentStudent.student_id, "present"); break;
        case "a": case "A": e.preventDefault(); updateStatus(currentStudent.student_id, "absent"); break;
        case "l": case "L": e.preventDefault(); updateStatus(currentStudent.student_id, "late"); break;
        case "e": case "E": e.preventDefault(); updateStatus(currentStudent.student_id, "excused"); break;
        case "Enter":
          e.preventDefault();
          if (focusedRow < rows.length - 1) setFocusedRow((prev) => prev + 1);
          break;
      }
    },
    [rows, focusedRow, updateStatus]
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No sections found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} />

      {/* Session Selection */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{canEdit ? "Mark Attendance" : "Attendance (read-only)"}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {!canEdit
                ? "View-only access. Only teachers and principals can add or edit attendance."
                : perms.canManageStudents
                  ? "All sections are available"
                  : "Only your assigned sections are shown"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowStats(!showStats)} disabled={!selectedSection}>
              <BarChart3 className="h-4 w-4 mr-1" />
              {showStats ? "Hide Stats" : "View Stats"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleOpenHistory} disabled={!selectedSection}>
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label>Section</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.class_name} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
            <div>
              <Label>Period</Label>
              <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={loadSession} className="w-full">
                Load Session
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student Stats */}
      {showStats && <StudentAttendanceStatsCard stats={studentStats} loading={loadingStats} />}

      {/* Attendance Table */}
      {(sessionId || (!canEdit && rows.length > 0)) && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Students ({rows.length})</CardTitle>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => markAll("present")}>All Present</Button>
                <Button size="sm" variant="outline" onClick={() => markAll("absent")}>All Absent</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled in this section.</p>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="mb-4 flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-3">
                  <Badge variant="outline" className="gap-1.5 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400">
                    <Check className="h-3.5 w-3.5" /> Present: {stats.present}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400">
                    <X className="h-3.5 w-3.5" /> Absent: {stats.absent}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" /> Late: {stats.late}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                    <FileCheck className="h-3.5 w-3.5" /> Excused: {stats.excused}
                  </Badge>
                </div>

                {/* Keyboard Shortcuts (editors only) */}
                {canEdit && (
                  <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Keyboard className="h-4 w-4" />
                    <span>
                      Shortcuts: <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate, <kbd className="rounded bg-muted px-1">←→</kbd> change status,{" "}
                      <kbd className="rounded bg-muted px-1">P</kbd> present,{" "}
                      <kbd className="rounded bg-muted px-1">A</kbd> absent,{" "}
                      <kbd className="rounded bg-muted px-1">L</kbd> late,{" "}
                      <kbd className="rounded bg-muted px-1">E</kbd> excused
                    </span>
                  </div>
                )}

                <div tabIndex={canEdit ? 0 : -1} onKeyDown={canEdit ? handleKeyDown : undefined} className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md">
                  <Table ref={tableRef}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead className="w-24">Attendance</TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1"><Check className="h-4 w-4 text-green-600" /> Present</span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1"><X className="h-4 w-4 text-red-600" /> Absent</span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1"><Clock className="h-4 w-4 text-amber-600" /> Late</span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1"><FileCheck className="h-4 w-4 text-blue-600" /> Excused</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, idx) => {
                        const percentage = studentPercentageMap.get(r.student_id);
                        const isLowAttendance = percentage !== undefined && percentage < 75;
                        return (
                          <TableRow
                            key={r.student_id}
                            className={cn(
                              "transition-colors",
                              idx === focusedRow && "bg-accent/50 ring-1 ring-inset ring-primary/30",
                              isLowAttendance && "bg-red-50/30 dark:bg-red-900/10"
                            )}
                            onClick={() => setFocusedRow(idx)}
                          >
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                            <TableCell>
                              {percentage !== undefined ? (
                                <AttendancePercentageBadge percentage={percentage} />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {(["present", "absent", "late", "excused"] as const).map((status) => {
                              const config = {
                                present: { icon: Check, active: "border-green-600 bg-green-100 text-green-700", hover: "hover:border-green-400 hover:bg-green-50" },
                                absent: { icon: X, active: "border-red-600 bg-red-100 text-red-700", hover: "hover:border-red-400 hover:bg-red-50" },
                                late: { icon: Clock, active: "border-amber-600 bg-amber-100 text-amber-700", hover: "hover:border-amber-400 hover:bg-amber-50" },
                                excused: { icon: FileCheck, active: "border-blue-600 bg-blue-100 text-blue-700", hover: "hover:border-blue-400 hover:bg-blue-50" },
                              }[status];
                              const Icon = config.icon;
                              return (
                                <TableCell key={status} className="text-center">
                                  <button
                                    type="button"
                                    onClick={() => canEdit && updateStatus(r.student_id, status)}
                                    disabled={!canEdit}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                      r.status === status ? config.active : `border-muted ${canEdit ? config.hover : ""}`,
                                      !canEdit && "cursor-default opacity-80"
                                    )}
                                    aria-label={`Mark ${status}`}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </button>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {canEdit && (
                  <div className="mt-4">
                    <Button onClick={handleSaveAttendance} disabled={saving}>
                      {saving ? "Saving..." : "Save Attendance"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <AttendanceHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        sessions={historyData}
        onLoadSession={loadSessionEntries}
        onSaveSession={handleHistorySave}
      />
    </div>
  );
}
