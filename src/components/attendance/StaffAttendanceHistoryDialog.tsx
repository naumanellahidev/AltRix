import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, FileCheck, Coffee, Calendar, ChevronLeft, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type StaffStatus = "present" | "absent" | "late" | "half_day" | "leave";
const STATUS_ORDER: StaffStatus[] = ["present", "absent", "late", "half_day", "leave"];

const STATUS_CONFIG: Record<StaffStatus, { label: string; icon: any; active: string; hover: string; chip: string }> = {
  present:  { label: "Present",  icon: Check,     active: "border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-800",  hover: "hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20",  chip: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400" },
  absent:   { label: "Absent",   icon: X,         active: "border-red-600 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 dark:border-red-800",        hover: "hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20",      chip: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400" },
  late:     { label: "Late",     icon: Clock,     active: "border-amber-600 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",  hover: "hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20",  chip: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  half_day: { label: "Half Day", icon: Coffee,    active: "border-purple-600 bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800", hover: "hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20", chip: "border-purple-500/50 bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  leave:    { label: "On Leave", icon: FileCheck, active: "border-blue-600 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",     hover: "hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20",    chip: "border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400" },
};

interface StaffAttendanceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  staffMembers: any[];
  onSaveComplete?: () => void;
}

export function StaffAttendanceHistoryDialog({
  open,
  onOpenChange,
  schoolId,
  staffMembers,
  onSaveComplete,
}: StaffAttendanceHistoryDialogProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [attendanceRows, setAttendanceRows] = useState<Record<string, StaffStatus>>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [focusedRow, setFocusedRow] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchDates = async () => {
    if (!schoolId) return;
    setLoadingDates(true);
    try {
      const { data, error } = await supabase
        .from("hr_staff_attendance")
        .select("attendance_date")
        .eq("school_id", schoolId);
      if (error) throw error;
      const unique = Array.from(new Set((data ?? []).map((d: any) => String(d.attendance_date))))
        .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime());
      setDates(unique as string[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load history dates");
    } finally {
      setLoadingDates(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchDates();
      setSelectedDate(null);
      setAttendanceRows({});
      setHasChanges(false);
    }
  }, [open, schoolId]);

  const handleSelectDate = async (date: string) => {
    setLoadingAttendance(true);
    setSelectedDate(date);
    try {
      const { data, error } = await supabase
        .from("hr_staff_attendance")
        .select("user_id, status")
        .eq("school_id", schoolId!)
        .eq("attendance_date", date);
      if (error) throw error;

      const initialStatuses: Record<string, StaffStatus> = {};
      data?.forEach((row: any) => {
        initialStatuses[row.user_id] = row.status as StaffStatus;
      });
      setAttendanceRows(initialStatuses);
      setHasChanges(false);
      setFocusedRow(0);
    } catch (e: any) {
      toast.error(e.message || "Failed to load attendance for date");
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      if (!confirm("You have unsaved changes. Discard them?")) return;
    }
    setSelectedDate(null);
    setAttendanceRows({});
    setHasChanges(false);
  };

  const handleSave = async () => {
    if (!selectedDate || !schoolId) return;
    setSaving(true);
    try {
      const userRes = await supabase.auth.getUser();
      const recordedBy = userRes.data.user?.id;

      const payload = Object.entries(attendanceRows).map(([userId, status]) => ({
        school_id: schoolId,
        user_id: userId,
        attendance_date: selectedDate,
        status,
        recorded_by: recordedBy,
      }));

      if (payload.length > 0) {
        const { error } = await supabase
          .from("hr_staff_attendance")
          .upsert(payload, { onConflict: "school_id,user_id,attendance_date" });
        if (error) throw error;
      }

      toast.success("Attendance history updated successfully");
      setHasChanges(false);
      if (onSaveComplete) onSaveComplete();
    } catch (e: any) {
      toast.error(e.message || "Failed to save attendance history");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = useCallback((userId: string, status: StaffStatus) => {
    setAttendanceRows((prev) => ({
      ...prev,
      [userId]: status,
    }));
    setHasChanges(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (staffMembers.length === 0) return;
      const currentStaff = staffMembers[focusedRow];
      if (!currentStaff) return;

      const currentStatus = attendanceRows[currentStaff.userId];

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusedRow((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedRow((prev) => Math.min(staffMembers.length - 1, prev + 1));
          break;
        case "ArrowLeft": {
          e.preventDefault();
          if (currentStatus) {
            const currentIdx = STATUS_ORDER.indexOf(currentStatus);
            const newIdx = Math.max(0, currentIdx - 1);
            updateStatus(currentStaff.userId, STATUS_ORDER[newIdx]);
          } else {
            updateStatus(currentStaff.userId, "present");
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (currentStatus) {
            const currentIdx = STATUS_ORDER.indexOf(currentStatus);
            const newIdx = Math.min(STATUS_ORDER.length - 1, currentIdx + 1);
            updateStatus(currentStaff.userId, STATUS_ORDER[newIdx]);
          } else {
            updateStatus(currentStaff.userId, "present");
          }
          break;
        }
        case "p":
        case "P":
          e.preventDefault();
          updateStatus(currentStaff.userId, "present");
          break;
        case "a":
        case "A":
          e.preventDefault();
          updateStatus(currentStaff.userId, "absent");
          break;
        case "l":
        case "L":
          e.preventDefault();
          updateStatus(currentStaff.userId, "late");
          break;
        case "h":
        case "H":
          e.preventDefault();
          updateStatus(currentStaff.userId, "half_day");
          break;
        case "e":
        case "E":
          e.preventDefault();
          updateStatus(currentStaff.userId, "leave");
          break;
      }
    },
    [staffMembers, focusedRow, attendanceRows, updateStatus]
  );

  const getSessionStats = () => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let halfDay = 0;
    let leave = 0;
    let unmarked = 0;

    staffMembers.forEach((s) => {
      const status = attendanceRows[s.userId];
      if (status === "present") present++;
      else if (status === "absent") absent++;
      else if (status === "late") late++;
      else if (status === "half_day") halfDay++;
      else if (status === "leave") leave++;
      else unmarked++;
    });

    return { present, absent, late, halfDay, leave, unmarked, total: staffMembers.length };
  };

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      return format(new Date(year, month - 1, day), "EEEE, MMMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatDateShort = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      return format(new Date(year, month - 1, day), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col w-[calc(100%-2rem)] sm:max-w-4xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedDate && (
              <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            {selectedDate
              ? `Edit: ${formatDateShort(selectedDate)}`
              : "Staff Attendance History"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-2 min-h-0">
          {!selectedDate ? (
            <div className="space-y-2">
              {loadingDates ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : dates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No attendance history found.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dates.map((date) => (
                    <button
                      key={date}
                      onClick={() => handleSelectDate(date)}
                      className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
                    >
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-semibold text-sm">
                          {formatDate(date)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : loadingAttendance ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                {(() => {
                  const stats = getSessionStats();
                  return (
                    <>
                      <Badge variant="outline" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Total: {stats.total}</Badge>
                      {STATUS_ORDER.map((s) => {
                        const cfg = STATUS_CONFIG[s];
                        const Icon = cfg.icon;
                        return (
                          <Badge key={s} variant="outline" className={cn("gap-1.5", cfg.chip)}>
                            <Icon className="h-3.5 w-3.5" />
                            {cfg.label}: {stats[s]}
                          </Badge>
                        );
                      })}
                      <Badge variant="outline" className="gap-1.5">Unmarked: {stats.unmarked}</Badge>
                    </>
                  );
                })()}
              </div>

              {/* Keyboard help */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Keyboard className="h-4 w-4" />
                <span>
                  Shortcuts: <kbd className="rounded bg-muted px-1">↑↓</kbd> navigate,{" "}
                  <kbd className="rounded bg-muted px-1">P</kbd>/<kbd className="rounded bg-muted px-1">A</kbd>/<kbd className="rounded bg-muted px-1">L</kbd>/<kbd className="rounded bg-muted px-1">H</kbd>/<kbd className="rounded bg-muted px-1">E</kbd> set status
                </span>
              </div>

              {/* Table */}
              <div
                ref={tableRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md border"
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Staff</TableHead>
                        {STATUS_ORDER.map((s) => {
                          const cfg = STATUS_CONFIG[s];
                          const Icon = cfg.icon;
                          return (
                            <TableHead key={s} className="text-center w-20">
                              <span className="inline-flex items-center gap-1">
                                <Icon className="h-4 w-4" /> {cfg.label}
                              </span>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffMembers.map((staff, idx) => {
                        const currentStatus = attendanceRows[staff.userId];
                        return (
                          <TableRow
                            key={staff.userId}
                            className={cn(
                              "transition-colors",
                              idx === focusedRow && "bg-accent/50 ring-1 ring-inset ring-primary/30"
                            )}
                            onClick={() => setFocusedRow(idx)}
                          >
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="font-medium">{staff.displayName || staff.email}</div>
                              <div className="text-xs text-muted-foreground">{staff.email}</div>
                            </TableCell>
                            {STATUS_ORDER.map((status) => {
                              const cfg = STATUS_CONFIG[status];
                              const Icon = cfg.icon;
                              const isActive = currentStatus === status;
                              return (
                                <TableCell key={status} className="text-center">
                                  <button
                                    type="button"
                                    onClick={() => updateStatus(staff.userId, status)}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                                      isActive ? cfg.active : `border-muted ${cfg.hover}`
                                    )}
                                    aria-label={`Mark ${cfg.label}`}
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
              </div>

              {/* Save button */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                {hasChanges && (
                  <span className="text-sm text-amber-600 self-center mr-2 font-medium">Unsaved changes</span>
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
