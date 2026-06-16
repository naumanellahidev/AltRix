import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Radio,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDashed,
  ChevronDown,
  History,
  Download,
  Search,
  Activity,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLiveTeacherPresence, LiveTeacherStatus } from "@/hooks/useLiveTeacherPresence";
import { exportToCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";

interface Props {
  schoolId: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ago`;
}

function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

function statusLabel(s: string): string {
  if (s === "in_class") return "In Class";
  if (s === "left") return "Left";
  if (s === "late") return "Late";
  if (s === "completed") return "Completed";
  return "Scheduled";
}

function statusDotClass(s: string): string {
  if (s === "completed") return "bg-green-500";
  if (s === "in_class" || s === "late") return "bg-blue-500";
  if (s === "left" || s === "not_checked_in") return "bg-red-500";
  return "bg-muted-foreground/20";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LiveTeacherPresenceCard({ schoolId }: Props) {
  const { schoolSlug } = useParams();
  const { liveTeachers, teacherTimelines, lookupEntry, loading, realtimeStatus } =
    useLiveTeacherPresence(schoolId);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<LiveTeacherStatus | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_class" | "late" | "left" | "completed" | "not_checked_in"
  >("all");

  // A teacher is considered physically "active/in class" if they checked in (either in_class or late)
  const activeCount = useMemo(() => {
    return liveTeachers.filter((t) => t.status === "in_class" || t.status === "late").length;
  }, [liveTeachers]);

  const filteredLive = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = liveTeachers.filter((t) => {
      if (statusFilter !== "all") {
        if (statusFilter === "in_class") {
          // If filtering by "In Class", include both regular check-ins and late check-ins
          if (t.status !== "in_class" && t.status !== "late") return false;
        } else {
          if (t.status !== statusFilter) return false;
        }
      }
      if (!q) return true;
      return (
        t.teacherName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.sectionLabel ?? "").toLowerCase().includes(q) ||
        (t.className ?? "").toLowerCase().includes(q) ||
        (t.room ?? "").toLowerCase().includes(q)
      );
    });

    const priority: Record<string, number> = {
      in_class: 1,
      late: 2,
      left: 3,
      not_checked_in: 4,
      completed: 5,
    };

    return filtered.sort((a, b) => {
      const pA = priority[a.status] ?? 6;
      const pB = priority[b.status] ?? 6;
      if (pA !== pB) return pA - pB;
      return a.teacherName.localeCompare(b.teacherName);
    });
  }, [liveTeachers, search, statusFilter]);

  const handleExport = () => {
    const rows: Array<Record<string, string>> = [];
    teacherTimelines.forEach((t) => {
      t.entries.forEach((e) => {
        rows.push({
          Teacher: t.teacherName,
          Period: e.periodLabel,
          Start: e.startTime ?? "",
          End: e.endTime ?? "",
          Subject: e.subject,
          Class: [e.className, e.sectionLabel].filter(Boolean).join(" "),
          Room: e.room ?? "",
          Status: statusLabel(e.status),
          Reason: e.reason ?? "",
          "Entered At": e.enteredAt ?? "",
          "Left At": e.leftAt ?? "",
        });
      });
    });
    if (rows.length === 0) {
      toast("Nothing to export yet");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    exportToCSV(rows, `teacher-presence-${today}`);
  };

  // Toast on real status changes (skip initial silent fetch)
  const seenRef = useRef<Map<string, string>>(new Map()); // entryId -> last status
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase
      .channel(`live_presence_toasts_${schoolId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teacher_period_presence",
          filter: `school_id=eq.${schoolId}`,
        },
        (payload) => {
          if (!initializedRef.current) return;
          const row = (payload.new ?? payload.old) as
            | { timetable_entry_id: string; status: string; reason?: string | null }
            | undefined;
          if (!row) return;
          const prev = seenRef.current.get(row.timetable_entry_id);
          if (prev === row.status) return;
          seenRef.current.set(row.timetable_entry_id, row.status);
          const info = lookupEntry(row.timetable_entry_id);
          const teacher = info?.teacherName ?? "A teacher";
          const ctx = info
            ? `${info.subject} • ${info.periodLabel}${info.sectionLabel ? ` (${info.sectionLabel})` : ""}`
            : "";
          const label = statusLabel(row.status);
          const message = `${teacher} — ${label}`;
          const desc = [ctx, row.reason ? `Reason: ${row.reason}` : null]
            .filter(Boolean)
            .join("  •  ");
          if (row.status === "in_class") toast.success(message, { description: desc });
          else if (row.status === "left") toast.error(message, { description: desc });
          else if (row.status === "late") toast.warning(message, { description: desc });
          else if (row.status === "completed") toast.success(message, { description: desc });
          else toast(message, { description: desc });
        },
      )
      .subscribe();

    // Allow a moment for initial state to settle so we don't toast existing rows
    const t = setTimeout(() => {
      initializedRef.current = true;
    }, 1500);

    return () => {
      clearTimeout(t);
      initializedRef.current = false;
      supabase.removeChannel(ch);
    };
  }, [schoolId, lookupEntry]);

  return (
    <Card className="shadow-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            Live — Who's Teaching Now
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1"
              title={`Realtime: ${realtimeStatus}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  realtimeStatus === "live"
                    ? "bg-primary animate-pulse"
                    : realtimeStatus === "offline"
                      ? "bg-destructive"
                      : "bg-accent animate-pulse"
                }`}
              />
              {realtimeStatus === "live"
                ? "Live"
                : realtimeStatus === "offline"
                  ? "Offline"
                  : "Reconnecting…"}
            </Badge>
            <Badge variant="outline" className="gap-1 font-semibold border-primary/20 bg-primary/5 text-primary">
              <Radio className="h-3 w-3 animate-pulse text-primary" />
              <span>{activeCount}/{liveTeachers.length} active</span>
            </Badge>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-1">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            {schoolSlug && (
              <Button size="sm" variant="ghost" asChild className="gap-1">
                <Link to={`/${schoolSlug}/principal/presence-debug`} title="Realtime event log">
                  <Activity className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teacher, subject, room…"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 sm:mt-0">
            {(
              [
                ["all", "All"],
                ["in_class", "In Class"],
                ["late", "Late"],
                ["left", "Left"],
                ["completed", "Completed"],
                ["not_checked_in", "Pending"],
              ] as const
            ).map(([key, label]) => {
              const isActive = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full px-3.5 py-1 text-xs transition-all duration-200 border font-medium ${
                    isActive
                      ? "bg-primary/10 text-primary border-primary/20 font-semibold"
                      : "bg-card text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filteredLive.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {liveTeachers.length === 0
              ? "No periods are running right now."
              : "No teachers match the current filter."}
          </p>
        ) : (
          <div className="w-full overflow-x-auto pb-3 pt-1 px-1 custom-scrollbar transition-all duration-300">
            <div className="flex gap-3">
              {filteredLive.map((t) => {
                const isIn = t.status === "in_class";
                const isLeft = t.status === "left";
                const isLate = t.status === "late";
                const isCompleted = t.status === "completed";

                const borderStyles = isIn
                  ? "border-primary/20 bg-primary/[0.015] border-l-[4px] border-l-primary"
                  : isLate
                  ? "border-primary/20 bg-primary/[0.005] border-l-[4px] border-l-primary/60"
                  : isCompleted
                  ? "border-primary/10 bg-card border-l-[4px] border-l-primary/30"
                  : isLeft
                  ? "border-border/60 bg-muted/10 border-l-[4px] border-l-muted-foreground/30"
                  : "border-border bg-card border-l-[4px] border-l-transparent";

                return (
                  <div
                    key={t.timetableEntryId}
                    onClick={() => setSelectedTeacher(t)}
                    className={`rounded-xl border p-3.5 transition-all duration-200 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-md hover:scale-[1.005] flex flex-col justify-between w-[280px] sm:w-[310px] flex-shrink-0 ${borderStyles}`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-foreground text-base tracking-tight">{t.teacherName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                        {t.subject}
                        {t.sectionLabel && ` • ${t.className ?? ""} ${t.sectionLabel}`}
                      </p>
                    </div>
                    <div className="mt-3.5 pt-2.5 border-t border-border/30 text-[11px] text-muted-foreground font-medium space-y-1.5">
                      <div className="flex items-center justify-between gap-x-2 gap-y-1 flex-wrap">
                        <span className="flex items-center gap-1 min-w-0">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground/70 flex-shrink-0" />
                          <span className="truncate">{t.periodLabel} • {formatTime(t.startTime)}–{formatTime(t.endTime)}</span>
                        </span>
                        {t.updatedAt && (
                          <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-auto">{timeAgo(t.updatedAt)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {t.room ? (
                          <span className="flex items-center gap-1 min-w-0 truncate">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                            {t.room}
                          </span>
                        ) : (
                          <span></span>
                        )}
                        <div className="flex items-center shrink-0">
                          {isIn && (
                            <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground font-semibold px-2 py-0.5 rounded-full text-[10px] shadow-sm">
                              <CheckCircle2 className="h-3 w-3" /> In Class
                            </span>
                          )}
                          {isLeft && (
                            <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border font-semibold px-2 py-0.5 rounded-full text-[10px]">
                              <XCircle className="h-3 w-3" /> Left
                            </span>
                          )}
                          {isLate && (
                            <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                              <Clock className="h-3 w-3" /> Late
                            </span>
                          )}
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 bg-primary/5 text-primary border border-primary/15 font-semibold px-2 py-0.5 rounded-full text-[10px]">
                              <CheckCircle2 className="h-3 w-3" /> Completed
                            </span>
                          )}
                          {t.status === "not_checked_in" && (
                            <span className="inline-flex items-center gap-1 bg-muted/50 text-muted-foreground/80 border border-border/50 font-medium px-2 py-0.5 rounded-full text-[10px]">
                              <CircleDashed className="h-3 w-3" /> Pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible per-teacher daily timeline */}
        {teacherTimelines.length > 0 && (
          <div className="border border-border/60 rounded-xl overflow-hidden bg-muted/5 mt-4">
            <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3.5 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" />
                    <span>Today's Teaching Timeline</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                      {teacherTimelines.length} teachers
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      timelineOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border/60 bg-card">
                <div className={cn(
                  "divide-y divide-border/40",
                  teacherTimelines.length > 5 && "max-h-[250px] overflow-y-auto custom-scrollbar"
                )}>
                  {teacherTimelines.map((t) => (
                    <Collapsible key={t.teacherUserId}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-foreground text-sm">{t.teacherName}</span>
                            <span className="flex items-center gap-1.5">
                              {t.entries.map((e) => (
                                <span
                                  key={e.timetableEntryId}
                                  className={`h-2.5 w-2.5 rounded-full border border-background shadow-[0_0_0_1px_rgba(0,0,0,0.05)] ${statusDotClass(e.status)}`}
                                  title={`${e.periodLabel}: ${statusLabel(e.status)}`}
                                />
                              ))}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-medium">
                              {t.entries.length} period{t.entries.length === 1 ? "" : "s"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/75" />
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="bg-muted/10 pb-3 px-3 divide-y divide-border/30">
                        {t.entries.map((e) => (
                          <div
                            key={e.timetableEntryId}
                            className="flex items-center justify-between py-2.5 text-xs first:pt-1 last:pb-1"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${statusDotClass(e.status)}`}
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">
                                  {e.periodLabel} • {formatTime(e.startTime)}–{formatTime(e.endTime)}
                                </p>
                                <p className="text-muted-foreground text-[11px] mt-0.5 truncate font-medium">
                                  {e.subject}
                                  {e.sectionLabel && ` • ${e.className ?? ""} ${e.sectionLabel}`}
                                  {e.room && ` • Room ${e.room}`}
                                </p>
                              </div>
                            </div>
                            <span className="ml-2 shrink-0 bg-muted px-2 py-0.5 rounded text-[10px] font-semibold text-muted-foreground border border-border/40">
                              {statusLabel(e.status)}
                            </span>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>

      {/* Teacher Detail Dialog */}
      <Dialog open={!!selectedTeacher} onOpenChange={(open) => !open && setSelectedTeacher(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="pb-3 border-b border-border/50">
            <DialogTitle className="text-xl font-bold tracking-tight">
              {selectedTeacher?.teacherName}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground font-medium">
              Teacher Lecture Presence Details
            </DialogDescription>
          </DialogHeader>

          {selectedTeacher && (
            <div className="space-y-5 py-4">
              {/* Status Badge Block */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-muted/50">
                <span className="text-sm font-medium text-foreground">Current Status</span>
                {selectedTeacher.status === "in_class" && (
                  <Badge className="bg-primary text-primary-foreground gap-1.5 px-3 py-1 text-xs font-semibold border-none">
                    <CheckCircle2 className="h-3.5 w-3.5" /> In Class
                  </Badge>
                )}
                {selectedTeacher.status === "left" && (
                  <Badge className="bg-muted text-muted-foreground border border-border gap-1.5 px-3 py-1 text-xs font-semibold">
                    <XCircle className="h-3.5 w-3.5" /> Left Lecture
                  </Badge>
                )}
                {selectedTeacher.status === "late" && (
                  <Badge className="bg-primary/15 text-primary border border-primary/25 gap-1.5 px-3 py-1 text-xs font-semibold">
                    <Clock className="h-3.5 w-3.5" /> Late Arrival
                  </Badge>
                )}
                {selectedTeacher.status === "completed" && (
                  <Badge className="bg-primary/10 text-primary border border-primary/20 gap-1.5 px-3 py-1 text-xs font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                  </Badge>
                )}
                {selectedTeacher.status === "not_checked_in" && (
                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground/80 border border-border/50 gap-1.5 px-3 py-1 text-xs font-semibold">
                    <CircleDashed className="h-3.5 w-3.5" /> Pending Check-In
                  </Badge>
                )}
              </div>

              {/* Lecture Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 p-4 rounded-2xl border border-muted/50 font-medium">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Subject</p>
                  <p className="font-semibold text-foreground">{selectedTeacher.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Class & Section</p>
                  <p className="font-semibold text-foreground">
                    {selectedTeacher.className && selectedTeacher.sectionLabel
                      ? `${selectedTeacher.className} • ${selectedTeacher.sectionLabel}`
                      : selectedTeacher.sectionLabel || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Period & Time</p>
                  <p className="font-semibold text-foreground">
                    {selectedTeacher.periodLabel} ({formatTime(selectedTeacher.startTime)} - {formatTime(selectedTeacher.endTime)})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Lecture Room</p>
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {selectedTeacher.room || "TBD"}
                  </p>
                </div>
              </div>

              {/* Timestamp Logs */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Log Timeline</h4>
                <div className="border rounded-2xl divide-y divide-border/40 overflow-hidden bg-card">
                  <div className="flex justify-between items-center p-3 text-sm font-medium">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary/70" /> Entered Room At
                    </span>
                    <span className="font-semibold text-foreground">{formatDateTime(selectedTeacher.enteredAt)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 text-sm font-medium">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground/60" /> Left Room At
                    </span>
                    <span className="font-semibold text-foreground">{formatDateTime(selectedTeacher.leftAt)}</span>
                  </div>
                </div>
              </div>

              {/* Reason / Notes */}
              {selectedTeacher.reason && (
                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-sm">
                  <p className="font-semibold text-primary mb-1">Teacher's Note / Delay Reason</p>
                  <p className="text-foreground whitespace-pre-wrap font-medium">{selectedTeacher.reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
