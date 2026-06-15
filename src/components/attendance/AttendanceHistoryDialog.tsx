import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, FileCheck, Calendar, ChevronLeft, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { AttendanceSession, StudentRow } from "@/hooks/useAttendanceData";

interface AttendanceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: AttendanceSession[];
  onLoadSession: (sessionId: string) => Promise<StudentRow[]>;
  onSaveSession: (sessionId: string, rows: StudentRow[]) => Promise<boolean>;
}

const STATUS_ORDER: StudentRow["status"][] = ["present", "absent", "late", "excused"];

export function AttendanceHistoryDialog({
  open,
  onOpenChange,
  sessions,
  onLoadSession,
  onSaveSession,
}: AttendanceHistoryDialogProps) {
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [focusedRow, setFocusedRow] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setSelectedSession(null);
      setRows([]);
      setHasChanges(false);
    }
  }, [open]);

  const handleSelectSession = async (session: AttendanceSession) => {
    setLoading(true);
    setSelectedSession(session);
    const data = await onLoadSession(session.id);
    setRows(data);
    setHasChanges(false);
    setFocusedRow(0);
    setLoading(false);
  };

  const handleBack = () => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setSelectedSession(null);
    setRows([]);
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!selectedSession) return;
    setSaving(true);
    const success = await onSaveSession(selectedSession.id, rows);
    if (success) {
      setHasChanges(false);
    }
    setSaving(false);
  };

  const updateStatus = useCallback((studentId: string, status: StudentRow["status"]) => {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r))
    );
    setHasChanges(true);
  }, []);

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
      }
    },
    [rows, focusedRow, updateStatus]
  );

  const getSessionStats = () => {
    return {
      present: rows.filter((r) => r.status === "present").length,
      absent: rows.filter((r) => r.status === "absent").length,
      late: rows.filter((r) => r.status === "late").length,
      excused: rows.filter((r) => r.status === "excused").length,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedSession && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {selectedSession
              ? `Edit: ${format(new Date(selectedSession.session_date), "MMM d, yyyy")} - ${selectedSession.period_label}`
              : "Attendance History"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {selectedSession
              ? "Edit attendance records for the selected session"
              : "View and select past attendance sessions"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {!selectedSession ? (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No attendance history found.
                </p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
                  >
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="font-medium">
                        {format(new Date(session.session_date), "EEEE, MMMM d, yyyy")}
                      </p>
                      <p className="text-sm text-muted-foreground">{session.period_label}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-3">
                {(() => {
                  const stats = getSessionStats();
                  return (
                    <>
                      <Badge variant="outline" className="gap-1.5 border-green-500/50 bg-green-500/10 text-green-700">
                        <Check className="h-3.5 w-3.5" />
                        Present: {stats.present}
                      </Badge>
                      <Badge variant="outline" className="gap-1.5 border-red-500/50 bg-red-500/10 text-red-700">
                        <X className="h-3.5 w-3.5" />
                        Absent: {stats.absent}
                      </Badge>
                      <Badge variant="outline" className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-700">
                        <Clock className="h-3.5 w-3.5" />
                        Late: {stats.late}
                      </Badge>
                      <Badge variant="outline" className="gap-1.5 border-blue-500/50 bg-blue-500/10 text-blue-700">
                        <FileCheck className="h-3.5 w-3.5" />
                        Excused: {stats.excused}
                      </Badge>
                    </>
                  );
                })()}
              </div>

              {/* Keyboard help */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Keyboard className="h-4 w-4" />
                <span>
                  <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate,{" "}
                  <kbd className="rounded bg-muted px-1">P</kbd>/<kbd className="rounded bg-muted px-1">A</kbd>/<kbd className="rounded bg-muted px-1">L</kbd>/<kbd className="rounded bg-muted px-1">E</kbd> set status
                </span>
              </div>

              {/* Table */}
              <div
                ref={tableRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead className="text-center w-20">Present</TableHead>
                      <TableHead className="text-center w-20">Absent</TableHead>
                      <TableHead className="text-center w-20">Late</TableHead>
                      <TableHead className="text-center w-20">Excused</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow
                        key={r.student_id}
                        className={cn(
                          "transition-colors",
                          idx === focusedRow && "bg-accent/50 ring-1 ring-inset ring-primary/30"
                        )}
                        onClick={() => setFocusedRow(idx)}
                      >
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          {r.first_name} {r.last_name}
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
                                onClick={() => updateStatus(r.student_id, status)}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                  r.status === status ? config.active : `border-muted ${config.hover}`
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </button>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Save button */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                {hasChanges && (
                  <span className="text-sm text-amber-600 self-center mr-2">Unsaved changes</span>
                )}
                <Button onClick={handleSave} disabled={saving || !hasChanges}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
