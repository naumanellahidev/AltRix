import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAttendanceData, StudentRow, AttendanceSession, StudentAttendanceStats } from "@/hooks/useAttendanceData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, FileCheck, Keyboard, History, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttendanceHistoryDialog } from "@/components/attendance/AttendanceHistoryDialog";
import { StudentAttendanceStatsCard } from "@/components/attendance/StudentAttendanceStatsCard";
import { AttendancePercentageBadge } from "@/components/attendance/AttendancePercentageBadge";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

const STATUS_ORDER: StudentRow["status"][] = ["present", "absent", "late", "excused"];

export function TeacherAttendanceModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const autoLoadedRef = useRef(false);

  const {
    loadSessionData,
    saveAttendance,
    loadSessionHistory,
    loadStudentAttendanceStats,
    loadSessionEntries,
  } = useAttendanceData(tenant.schoolId);

  // Summary stats for current session
  const stats = useMemo(() => {
    return {
      present: rows.filter((r) => r.status === "present").length,
      absent: rows.filter((r) => r.status === "absent").length,
      late: rows.filter((r) => r.status === "late").length,
      excused: rows.filter((r) => r.status === "excused").length,
    };
  }, [rows]);

  // Create a map of student attendance percentages for the current view
  const studentPercentageMap = useMemo(() => {
    const map = new Map<string, number>();
    studentStats.forEach((s) => {
      map.set(s.student_id, s.attendance_percentage);
    });
    return map;
  }, [studentStats]);

  useEffect(() => {
    if (tenant.status !== "ready") return;

    const fetchSections = async () => {
      // Get current teacher's user id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Only get assignments for THIS teacher
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", tenant.schoolId)
        .eq("teacher_user_id", userId);

      if (!assignments?.length) {
        setLoading(false);
        return;
      }

      const sectionIds = assignments.map((a) => a.class_section_id);

      const { data: sectionData } = await supabase
        .from("class_sections")
        .select("id, name, class_id")
        .in("id", sectionIds);

      if (!sectionData?.length) {
        setLoading(false);
        return;
      }

      const classIds = [...new Set(sectionData.map((s) => s.class_id))];
      const { data: classes } = await supabase
        .from("academic_classes")
        .select("id, name")
        .in("id", classIds);

      const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

      const enriched = sectionData.map((s) => ({
        id: s.id,
        name: s.name,
        class_name: classMap.get(s.class_id) || "Unknown",
      }));

      setSections(enriched);

      // Check if a section was passed via URL search params (e.g. from dashboard card)
      const sectionParam = searchParams.get("section");
      const matchedSection = sectionParam
        ? enriched.find((s) => s.id === sectionParam)
        : null;

      if (matchedSection) {
        setSelectedSection(matchedSection.id);
      } else if (enriched.length > 0) {
        setSelectedSection(enriched[0].id);
      }
      setLoading(false);
    };

    fetchSections();
  }, [tenant.status, tenant.schoolId]);

  // Auto-load session when navigated from dashboard card with ?section= param
  useEffect(() => {
    if (autoLoadedRef.current) return;
    const sectionParam = searchParams.get("section");
    if (!sectionParam || !selectedSection || selectedSection !== sectionParam) return;
    if (sections.length === 0) return;

    autoLoadedRef.current = true;
    const periodParam = searchParams.get("period");
    if (periodParam) {
      setPeriodLabel(periodParam);
    }

    // Clear the search param so refreshes don't re-trigger
    setSearchParams({}, { replace: true });
    // Trigger session load
    loadSession(periodParam || undefined);
  }, [selectedSection, sections, searchParams]);

  const loadSession = async (customPeriod?: string) => {
    if (!selectedSection) return;

    try {
      const result = await loadSessionData(selectedSection, sessionDate, customPeriod || periodLabel);
      if (result) {
        setSessionId(result.sessionId);
        setRows(result.rows);
        setFocusedRow(0);

        // Also load stats in background
        loadStats();
      }
    } catch (err: any) {
      console.error("Failed to load session:", err);
      toast({ title: "Failed to load session", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    }
  };

  const loadStats = async () => {
    if (!selectedSection) return;
    setLoadingStats(true);
    try {
      const stats = await loadStudentAttendanceStats(selectedSection);
      setStudentStats(stats);
    } catch (err: any) {
      console.error("Failed to load attendance stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      await saveAttendance(sessionId, rows);
      // Reload stats after saving
      loadStats();
    } catch (err: any) {
      console.error("Failed to save attendance:", err);
      toast({ title: "Failed to save attendance", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async () => {
    if (!selectedSection) return;
    try {
      const history = await loadSessionHistory(selectedSection);
      setHistoryData(history);
      setShowHistory(true);
    } catch (err: any) {
      console.error("Failed to load history:", err);
      toast({ title: "Failed to load history", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
    }
  };

  const handleHistorySave = async (historySessionId: string, historyRows: StudentRow[]): Promise<boolean> => {
    const success = await saveAttendance(historySessionId, historyRows);
    if (success) {
      // Reload stats after historical edit
      loadStats();
    }
    return success;
  };

  const updateStatus = useCallback((studentId: string, status: StudentRow["status"]) => {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r))
    );
  }, []);

  const markAll = (status: StudentRow["status"]) => {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  };

  // Keyboard navigation handler
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
          const currentIdx = STATUS_ORDER.indexOf(currentStudent.status);
          const newIdx = Math.max(0, currentIdx - 1);
          updateStatus(currentStudent.student_id, STATUS_ORDER[newIdx]);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const currentIdx = STATUS_ORDER.indexOf(currentStudent.status);
          const newIdx = Math.min(STATUS_ORDER.length - 1, currentIdx + 1);
          updateStatus(currentStudent.student_id, STATUS_ORDER[newIdx]);
          break;
        }
        case "p":
        case "P":
          e.preventDefault();
          updateStatus(currentStudent.student_id, "present");
          break;
        case "a":
        case "A":
          e.preventDefault();
          updateStatus(currentStudent.student_id, "absent");
          break;
        case "l":
        case "L":
          e.preventDefault();
          updateStatus(currentStudent.student_id, "late");
          break;
        case "e":
        case "E":
          e.preventDefault();
          updateStatus(currentStudent.student_id, "excused");
          break;
        case "Enter":
          e.preventDefault();
          if (focusedRow < rows.length - 1) {
            setFocusedRow((prev) => prev + 1);
          }
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
          <p className="text-muted-foreground">No classes assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Session Selection */}
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Mark Attendance</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowStats(!showStats)}
              disabled={!selectedSection}
            >
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
      {showStats && (
        <StudentAttendanceStatsCard stats={studentStats} loading={loadingStats} />
      )}

      {/* Attendance Table */}
      {sessionId && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Students ({rows.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => markAll("present")}>
                All Present
              </Button>
              <Button size="sm" variant="outline" onClick={() => markAll("absent")}>
                All Absent
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled in this section.</p>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="mb-4 flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-3">
                  <Badge variant="outline" className="gap-1.5 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400">
                    <Check className="h-3.5 w-3.5" />
                    Present: {stats.present}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400">
                    <X className="h-3.5 w-3.5" />
                    Absent: {stats.absent}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                    Late: {stats.late}
                  </Badge>
                  <Badge variant="outline" className="gap-1.5 border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400">
                    <FileCheck className="h-3.5 w-3.5" />
                    Excused: {stats.excused}
                  </Badge>
                </div>

                {/* Keyboard Shortcuts Help */}
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

                <div
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md overflow-x-auto"
                >
                  <Table ref={tableRef}>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead className="w-24">Attendance</TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <Check className="h-4 w-4 text-green-600" /> Present
                          </span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <X className="h-4 w-4 text-red-600" /> Absent
                          </span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <Clock className="h-4 w-4 text-amber-600" /> Late
                          </span>
                        </TableHead>
                        <TableHead className="text-center">
                          <span className="flex items-center justify-center gap-1">
                            <FileCheck className="h-4 w-4 text-blue-600" /> Excused
                          </span>
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
                            <TableCell className="font-medium">
                              {r.first_name} {r.last_name}
                            </TableCell>
                            <TableCell>
                              {percentage !== undefined ? (
                                <AttendancePercentageBadge percentage={percentage} />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => updateStatus(r.student_id, "present")}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                  r.status === "present"
                                    ? "border-green-600 bg-green-100 text-green-700"
                                    : "border-muted hover:border-green-400 hover:bg-green-50"
                                )}
                                aria-label="Mark present"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => updateStatus(r.student_id, "absent")}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                  r.status === "absent"
                                    ? "border-red-600 bg-red-100 text-red-700"
                                    : "border-muted hover:border-red-400 hover:bg-red-50"
                                )}
                                aria-label="Mark absent"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => updateStatus(r.student_id, "late")}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                  r.status === "late"
                                    ? "border-amber-600 bg-amber-100 text-amber-700"
                                    : "border-muted hover:border-amber-400 hover:bg-amber-50"
                                )}
                                aria-label="Mark late"
                              >
                                <Clock className="h-4 w-4" />
                              </button>
                            </TableCell>
                            <TableCell className="text-center">
                              <button
                                type="button"
                                onClick={() => updateStatus(r.student_id, "excused")}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                  r.status === "excused"
                                    ? "border-blue-600 bg-blue-100 text-blue-700"
                                    : "border-muted hover:border-blue-400 hover:bg-blue-50"
                                )}
                                aria-label="Mark excused"
                              >
                                <FileCheck className="h-4 w-4" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4">
                  <Button onClick={handleSaveAttendance} disabled={saving}>
                    {saving ? "Saving..." : "Save Attendance"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* History Dialog */}
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
