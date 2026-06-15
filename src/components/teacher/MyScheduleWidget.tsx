import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, ChevronRight, Clock, Coffee, DoorOpen, Info, LogIn, Pencil, RotateCcw, Wifi, WifiOff, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodLogDialog } from "./PeriodLogDialog";
import { useTeacherSchedule, ScheduleEntry, PeriodLog } from "@/hooks/useTeacherSchedule";
import { useTeacherPresence } from "@/hooks/useTeacherPresence";
import { useSession } from "@/hooks/useSession";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MyScheduleWidgetProps {
  schoolId: string | null;
  schoolSlug: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon-Fri

function formatTime(time: string | null): string {
  if (!time) return "";
  return time.slice(0, 5);
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <Check className="h-3.5 w-3.5 text-primary" />;
    case "partial":
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    case "cancelled":
      return <X className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return null;
  }
}

function getDateForDayOfWeek(targetDayOfWeek: number, referenceDate: Date): string {
  const refDayOfWeek = referenceDate.getDay();
  const diff = targetDayOfWeek - refDayOfWeek;
  const targetDate = new Date(referenceDate);
  targetDate.setDate(referenceDate.getDate() + diff);
  
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBeautifully(dateStr: string): string {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MyScheduleWidget({ schoolId, schoolSlug }: MyScheduleWidgetProps) {
  const { user } = useSession();

  // Reference date for the active week
  const [currentWeekRefDate, setCurrentWeekRefDate] = useState(() => new Date());

  // Determine initial day: today if weekday, else Monday
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });

  const calculatedDate = useMemo(() => {
    return getDateForDayOfWeek(selectedDay, currentWeekRefDate);
  }, [selectedDay, currentWeekRefDate]);

  const { rows: presenceRows, setStatus: setPresenceStatus, saving: presenceSaving, realtimeStatus } =
    useTeacherPresence(schoolId, user?.id ?? null, calculatedDate);

  const { entries, periodLogs, loading, error, isOffline, refetch } = useTeacherSchedule(schoolId, selectedDay, calculatedDate);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEntry, setDialogEntry] = useState<ScheduleEntry | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    entryId: string;
    label: string;
    reasonType: "late" | "left";
    onSubmit: (reason: string | null) => Promise<void> | void;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [infoLog, setInfoLog] = useState<{ entry: ScheduleEntry; log: PeriodLog } | null>(null);

  const todayStr = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const isToday = calculatedDate === todayStr;
  const todayDayOfWeek = new Date().getDay();

  // Determine current period index (only for today)
  const currentPeriodIndex = useMemo(() => {
    if (!isToday || entries.length === 0) return -1;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.startTime && entry.endTime) {
        const [startH, startM] = entry.startTime.split(":").map(Number);
        const [endH, endM] = entry.endTime.split(":").map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;

        if (currentMinutes >= startMins && currentMinutes <= endMins) {
          return i;
        }
      }
    }
    return -1;
  }, [entries, isToday]);

  const handleResetToToday = () => {
    const today = new Date();
    setCurrentWeekRefDate(today);
    const day = today.getDay();
    const mappedDay = day >= 1 && day <= 5 ? day : 1;
    setSelectedDay(mappedDay);
    refetch();
  };

  const handleOpenLog = (entry: ScheduleEntry) => {
    setDialogEntry(entry);
    setDialogOpen(true);
  };

  const handleLogSaved = (logStatus: string) => {
    refetch();
    if (logStatus === "completed" && dialogEntry) {
      setPresenceStatus(dialogEntry.id, "completed");
    }
  };

  // Map ScheduleEntry to PeriodLogDialog's expected format
  const dialogEntryForLog = dialogEntry
    ? {
        id: dialogEntry.id,
        subject_name: dialogEntry.subjectName,
        period_id: dialogEntry.periodId,
        room: dialogEntry.room,
        section_label: dialogEntry.sectionLabel,
        period_label: dialogEntry.periodLabel,
        start_time: dialogEntry.startTime,
        end_time: dialogEntry.endTime,
        sort_order: dialogEntry.sortOrder,
      }
    : null;

  const existingLog = dialogEntry ? periodLogs.get(dialogEntry.id) : undefined;
  const existingLogForDialog = existingLog
    ? {
        id: existingLog.id,
        timetable_entry_id: existingLog.timetableEntryId,
        status: existingLog.status,
        notes: existingLog.notes,
        topics_covered: existingLog.topicsCovered,
      }
    : undefined;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg">My Schedule</CardTitle>
            <p className="text-sm text-muted-foreground">
              {FULL_DAY_NAMES[selectedDay]}, {formatDateBeautifully(calculatedDate)} {isToday && "(Today)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              title={`Realtime: ${realtimeStatus}`}
            >
              {realtimeStatus === "live" ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="hidden sm:inline">Live</span>
                </>
              ) : realtimeStatus === "offline" ? (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">Offline</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3 w-3 animate-pulse" />
                  <span className="hidden sm:inline">Reconnecting…</span>
                </>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
              onClick={handleResetToToday}
              title="Reset to Today"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                  title="Select Date"
                >
                  <CalendarDays className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border border-border/80 shadow-lg" align="end">
                <Calendar
                  mode="single"
                  selected={currentWeekRefDate}
                  onSelect={(date) => {
                    if (date) {
                      setCurrentWeekRefDate(date);
                      const day = date.getDay();
                      const mappedDay = day >= 1 && day <= 5 ? day : 1;
                      setSelectedDay(mappedDay);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day Selector */}
          <div className="flex p-1 bg-muted/65 rounded-lg gap-1 mb-5 border border-muted-foreground/5 shadow-inner">
            {WEEKDAYS.map((day) => {
              const isSelected = selectedDay === day;
              const isTodayDay = day === todayDayOfWeek;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-background text-foreground shadow-sm border border-border/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                  }`}
                >
                  <span>{DAY_NAMES[day]}</span>
                  {isTodayDay && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Today" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-border/20 p-4 bg-card">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              ))}
            </div>
          )}

          {/* Offline Notice */}
          {!loading && isOffline && entries.length > 0 && (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <span>📶</span> Showing cached schedule (offline)
              </p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-3 border-destructive/20 text-destructive hover:bg-destructive/5" onClick={refetch}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
              <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground/75">
                <Coffee className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">No Classes Scheduled</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
                There are no scheduled classes for you on {FULL_DAY_NAMES[selectedDay]}.
              </p>
            </div>
          )}

          {/* Schedule Entries */}
          {!loading && !error && entries.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {entries.slice(0, 6).map((entry, index) => {
                  const log = periodLogs.get(entry.id);
                  const isCurrent = index === currentPeriodIndex;
                  const presence = presenceRows.get(entry.id);
                  const isIn = presence?.status === "in_class";
                  const isLate = presence?.status === "late";
                  const isOut = presence?.status === "left";
                  const isCompletedPresence = presence?.status === "completed";
                  const hasLog = !!log;

                  // Determine if this lecture is in the future
                  let isFuture = false;
                  if (calculatedDate > todayStr) {
                    isFuture = true;
                  } else if (calculatedDate === todayStr && entry.startTime) {
                    const [h, m] = entry.startTime.split(":").map(Number);
                    const startMin = h * 60 + m;
                    const now = new Date();
                    const curMin = now.getHours() * 60 + now.getMinutes();
                    isFuture = curMin < startMin;
                  }

                  return (
                    <div
                      key={entry.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.02)] ${
                        isCurrent
                          ? "border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.01] border-l-[4px] border-l-primary"
                          : hasLog || isCompletedPresence
                          ? "border-primary/10 bg-primary/[0.005] border-l-[4px] border-l-primary/30"
                          : isIn || isLate
                          ? "border-primary/20 bg-primary/[0.01] border-l-[4px] border-l-primary/60"
                          : isOut
                          ? "border-border/50 bg-card border-l-[4px] border-l-primary/20"
                          : "border-border/40 bg-card border-l-[4px] border-l-transparent"
                      }`}
                    >
                                       {/* Top Header: Period & Status on Row 1, Time on Row 2 */}
                      <div className="border-b border-border/40 pb-2 mb-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-muted-foreground/80 tracking-wider uppercase bg-muted/60 px-2 py-0.5 rounded whitespace-nowrap">
                            {entry.periodLabel}
                          </span>
                          
                          {/* Status Indicators */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {hasLog && (
                              <span
                                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium border border-primary/20 cursor-pointer hover:bg-primary/15 transition-colors"
                                onClick={() => setInfoLog({ entry, log })}
                                title="Click to view log details"
                              >
                                {getStatusIcon(log.status)}
                                <span className="capitalize">{log.status}</span>
                                <Info className="h-3 w-3 text-primary/80 ml-0.5" />
                              </span>
                            )}
                            {isCurrent && !hasLog && (
                              <span className="inline-flex items-center bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide shadow-sm animate-pulse">
                                Active
                              </span>
                            )}
                            {!hasLog && (isIn || isLate) && (
                              <span className="inline-flex items-center bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium border border-primary/20">
                                In Class {isLate && "(Late)"}
                              </span>
                            )}
                            {!hasLog && isOut && (
                              <span className="inline-flex items-center bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-medium border border-border/30">
                                Checked Out
                              </span>
                            )}
                          </div>
                        </div>

                        {entry.startTime && (
                          <div className="text-xs font-semibold tabular-nums text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
                            {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                          </div>
                        )}
                      </div>

                      {/* Middle Row: Subject Name, Badges & Action Button */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-bold text-foreground tracking-tight">
                            {entry.subjectName}
                          </p>
                          
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {entry.sectionLabel && (
                              <span className="inline-flex items-center bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px] font-medium border border-border/30">
                                {entry.sectionLabel}
                              </span>
                            )}
                            {entry.room && (
                              <span className="inline-flex items-center bg-muted/60 text-muted-foreground px-2 py-0.5 rounded text-[10px] font-medium border border-border/30">
                                Room {entry.room}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Action Button */}
                        <div className="self-end flex-shrink-0">
                          {(() => {
                            const busy = presenceSaving === entry.id;
                            const handleSet = async (
                              status: "in_class" | "left" | "completed",
                              reason?: string | null,
                            ) => {
                              await setPresenceStatus(entry.id, status, {
                                reason: reason ?? null,
                                startTime: entry.startTime,
                              });
                            };
                            const askReasonAndSet = (status: "in_class" | "left") => {
                              setReasonDialog({
                                entryId: entry.id,
                                label: `${entry.subjectName} • ${entry.periodLabel}`,
                                reasonType: status === "in_class" ? "late" : "left",
                                onSubmit: (reason) => handleSet(status, reason),
                              });
                            };
                            const onGreen = () => {
                              if (entry.startTime) {
                                const [h, m] = entry.startTime.split(":").map(Number);
                                const startMin = h * 60 + m;
                                const now = new Date();
                                if (now.getHours() * 60 + now.getMinutes() > startMin + 5) {
                                  askReasonAndSet("in_class");
                                  return;
                                }
                              }
                              handleSet("in_class");
                            };

                            if (hasLog) {
                              return (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 flex items-center gap-1.5 rounded-md border border-border/40"
                                  onClick={() => handleOpenLog(entry)}
                                  title="Edit lecture log"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span>Edit Log</span>
                                </Button>
                              );
                            }

                            if (isOut || isCompletedPresence) {
                              return (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  disabled={busy}
                                  className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md shadow-sm font-medium"
                                  onClick={() => handleOpenLog(entry)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Log Class</span>
                                </Button>
                              );
                            }

                            if (isIn || isLate) {
                              return (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    className="h-8 px-2.5 text-xs border-primary/20 text-primary hover:bg-primary/5 flex items-center gap-1.5 rounded-md font-medium"
                                    onClick={() => askReasonAndSet("left")}
                                  >
                                    <DoorOpen className="h-3.5 w-3.5" />
                                    <span>Check Out</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    disabled={busy}
                                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md"
                                    onClick={() => handleOpenLog(entry)}
                                    title="Log class directly"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              );
                            }

                            return (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  disabled={busy || isFuture}
                                  className="h-8 px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-md shadow-sm font-medium"
                                  onClick={onGreen}
                                  title={isFuture ? "Check-in is only available once the lecture starts" : undefined}
                                >
                                  <LogIn className="h-3.5 w-3.5" />
                                  <span>Check In</span>
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  disabled={busy || isFuture}
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md"
                                  onClick={() => handleOpenLog(entry)}
                                  title={isFuture ? "Logging is only available once the lecture starts" : "Log class directly"}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {entries.length > 6 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{entries.length - 6} more periods
                </p>
              )}
            </div>
          )}

          {/* View Full Timetable Link */}
          <div className="mt-4 pt-3 border-t">
            <Button variant="ghost" size="sm" asChild className="w-full">
              <Link to={`/${schoolSlug}/teacher/timetable`}>
                View Full Timetable <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Period Log Dialog */}
      {dialogEntryForLog && schoolId && (
        <PeriodLogDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          entry={dialogEntryForLog}
          schoolId={schoolId}
          existingLog={existingLogForDialog}
          onSaved={handleLogSaved}
        />
      )}

      {/* Period Log Details Dialog */}
      <Dialog open={!!infoLog} onOpenChange={(o) => !o && setInfoLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {infoLog && getStatusIcon(infoLog.log.status)}
              <span className="capitalize">{infoLog?.log.status}</span>
            </DialogTitle>
            <DialogDescription>
              {infoLog?.entry.subjectName} • {infoLog?.entry.periodLabel}
              {infoLog?.entry.sectionLabel && ` • ${infoLog.entry.sectionLabel}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Topics Covered</p>
              <p className="text-sm whitespace-pre-wrap">
                {infoLog?.log.topicsCovered || <span className="italic text-muted-foreground">No topics recorded</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">
                {infoLog?.log.notes || <span className="italic text-muted-foreground">No notes</span>}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (infoLog) {
                  const entry = infoLog.entry;
                  setInfoLog(null);
                  handleOpenLog(entry);
                }
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <Button onClick={() => setInfoLog(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reason Dialog for Late/Left */}
      <Dialog
        open={!!reasonDialog}
        onOpenChange={(o) => {
          if (!o) {
            setReasonDialog(null);
            setReasonText("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.reasonType === "late" ? "Late-Reason" : "Left-Reason"} (optional)
            </DialogTitle>
            <DialogDescription>
              {reasonDialog?.label}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="e.g. Stuck in traffic, called to office…"
            rows={3}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                const d = reasonDialog;
                setReasonDialog(null);
                setReasonText("");
                if (d) await d.onSubmit(null);
              }}
            >
              Skip
            </Button>
            <Button
              onClick={async () => {
                const d = reasonDialog;
                const r = reasonText.trim() || null;
                setReasonDialog(null);
                setReasonText("");
                if (d) await d.onSubmit(r);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
