import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, ChevronRight, Clock, Coffee, DoorOpen, Info, LogIn, Pencil, Wifi, WifiOff, X } from "lucide-react";
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
      return <X className="h-3.5 w-3.5 text-destructive" />;
    default:
      return null;
  }
}

export function MyScheduleWidget({ schoolId, schoolSlug }: MyScheduleWidgetProps) {
  // Determine initial day: today if weekday, else Monday
  const { user } = useSession();
  const { rows: presenceRows, setStatus: setPresenceStatus, saving: presenceSaving, realtimeStatus } =
    useTeacherPresence(schoolId, user?.id ?? null);

  // Determine initial day: today if weekday, else Monday
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });

  const { entries, periodLogs, loading, error, isOffline, refetch } = useTeacherSchedule(schoolId, selectedDay);

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

  const todayDayOfWeek = new Date().getDay();
  const isToday = selectedDay === todayDayOfWeek;

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

  const handleOpenLog = (entry: ScheduleEntry) => {
    setDialogEntry(entry);
    setDialogOpen(true);
  };

  const handleLogSaved = () => {
    refetch();
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
              {FULL_DAY_NAMES[selectedDay]} {isToday && "(Today)"}
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
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Day Selector */}
          <div className="flex gap-1 mb-4">
            {WEEKDAYS.map((day) => (
              <Button
                key={day}
                variant={selectedDay === day ? "default" : "outline"}
                size="sm"
                className="flex-1 px-2"
                onClick={() => setSelectedDay(day)}
              >
                {DAY_NAMES[day]}
                {day === todayDayOfWeek && <span className="ml-1 text-xs">•</span>}
              </Button>
            ))}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Offline Notice */}
          {!loading && isOffline && entries.length > 0 && (
            <div className="mb-3 rounded-lg border border-muted bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground text-center">
                📶 Showing cached schedule (offline)
              </p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={refetch}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Coffee className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No classes scheduled for {FULL_DAY_NAMES[selectedDay]}.
              </p>
            </div>
          )}

          {/* Schedule Entries */}
          {!loading && !error && entries.length > 0 && (
            <div className="space-y-2">
              {entries.slice(0, 6).map((entry, index) => {
                const log = periodLogs.get(entry.id);
                const isCurrent = index === currentPeriodIndex;

                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      isCurrent ? "border-primary bg-primary/5" : ""
                    } ${log ? "border-green-500/40 bg-green-500/10 dark:bg-green-500/15" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{entry.subjectName}</p>
                        {log && (
                          <>
                            <span
                              className="flex items-center gap-0.5"
                              title={`${log.status}${log.topicsCovered ? `: ${log.topicsCovered}` : ""}`}
                            >
                              {getStatusIcon(log.status)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setInfoLog({ entry, log })}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="View details"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {isCurrent && (
                          <Badge variant="default" className="text-xs px-1.5 py-0">
                            Now
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry.periodLabel}</span>
                        {entry.startTime && (
                          <span>
                            • {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {entry.sectionLabel && (
                        <Badge variant="outline" className="text-xs whitespace-nowrap hidden sm:inline-flex">
                          {entry.sectionLabel}
                        </Badge>
                      )}
                      {entry.room && (
                        <Badge variant="secondary" className="text-xs">
                          {entry.room}
                        </Badge>
                      )}
                      {isToday && (() => {
                        const presence = presenceRows.get(entry.id);
                        const isIn = presence?.status === "in_class";
                        const isLate = presence?.status === "late";
                        const isOut = presence?.status === "left";
                        const busy = presenceSaving === entry.id;
                        const handleSet = async (
                          status: "in_class" | "left",
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
                          // If after start, will become Late — ask for reason
                          if (entry.startTime) {
                            const [h, m] = entry.startTime.split(":").map(Number);
                            const startMin = h * 60 + m;
                            const now = new Date();
                            if (now.getHours() * 60 + now.getMinutes() > startMin) {
                              askReasonAndSet("in_class");
                              return;
                            }
                          }
                          handleSet("in_class");
                        };
                        return (
                          <>
                            <Button
                              type="button"
                              size="icon"
                              disabled={busy}
                              onClick={onGreen}
                              title="I'm in class"
                              className={`h-7 w-7 rounded-full ${
                                isIn || isLate
                                  ? isLate
                                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                                  : "bg-background text-primary border border-primary/40 hover:bg-primary/10"
                              }`}
                            >
                              <LogIn className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              disabled={busy}
                              onClick={() => askReasonAndSet("left")}
                              title="Left the class"
                              className={`h-7 w-7 rounded-full ${
                                isOut
                                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  : "bg-background text-destructive border border-destructive/40 hover:bg-destructive/10"
                              }`}
                            >
                              <DoorOpen className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        );
                      })()}
                      <Button
                        variant={log ? "ghost" : "outline"}
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenLog(entry)}
                        title={log ? "Edit log" : "Mark complete"}
                      >
                        {log ? <Pencil className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
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
