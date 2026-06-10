import { useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLiveTeacherPresence } from "@/hooks/useLiveTeacherPresence";
import { exportToCSV } from "@/lib/csv";

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
  return "Scheduled";
}

function statusDotClass(s: string): string {
  if (s === "in_class") return "bg-primary";
  if (s === "left") return "bg-destructive";
  if (s === "late") return "bg-accent";
  return "bg-muted-foreground/40";
}

export function LiveTeacherPresenceCard({ schoolId }: Props) {
  const { schoolSlug } = useParams();
  const { liveTeachers, teacherTimelines, lookupEntry, loading, realtimeStatus } =
    useLiveTeacherPresence(schoolId);

  const [timelineOpen, setTimelineOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_class" | "late" | "left" | "not_checked_in"
  >("all");

  const filteredLive = useMemo(() => {
    const q = search.trim().toLowerCase();
    return liveTeachers.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.teacherName.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.sectionLabel ?? "").toLowerCase().includes(q) ||
        (t.className ?? "").toLowerCase().includes(q) ||
        (t.room ?? "").toLowerCase().includes(q)
      );
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
            <Badge variant="outline" className="gap-1">
              <Radio className="h-3 w-3" />
              {filteredLive.length}/{liveTeachers.length} active
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
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "All"],
                ["in_class", "In Class"],
                ["late", "Late"],
                ["left", "Left"],
                ["not_checked_in", "Pending"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={statusFilter === key ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </Button>
            ))}
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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredLive.map((t) => {
              const isIn = t.status === "in_class";
              const isLeft = t.status === "left";
              const isLate = t.status === "late";
              const accent = isIn
                ? "border-primary/40 bg-primary/5"
                : isLeft
                  ? "border-destructive/40 bg-destructive/5"
                  : isLate
                    ? "border-accent/60 bg-accent/10"
                    : "border-border bg-muted/30";
              return (
                <div
                  key={t.timetableEntryId}
                  className={`rounded-xl border p-3 transition-colors ${accent}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{t.teacherName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.subject}
                        {t.sectionLabel && ` • ${t.className ?? ""} ${t.sectionLabel}`}
                      </p>
                    </div>
                    {isIn && (
                      <Badge className="bg-primary text-primary-foreground gap-1 shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> In Class
                      </Badge>
                    )}
                    {isLeft && (
                      <Badge variant="destructive" className="gap-1 shrink-0">
                        <XCircle className="h-3 w-3" /> Left
                      </Badge>
                    )}
                    {isLate && (
                      <Badge className="bg-accent text-accent-foreground gap-1 shrink-0">
                        <Clock className="h-3 w-3" /> Late
                      </Badge>
                    )}
                    {t.status === "not_checked_in" && (
                      <Badge variant="outline" className="gap-1 shrink-0">
                        <CircleDashed className="h-3 w-3" /> Pending
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t.periodLabel} • {formatTime(t.startTime)}–{formatTime(t.endTime)}
                    </span>
                    {t.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {t.room}
                      </span>
                    )}
                    {t.updatedAt && (
                      <span className="ml-auto">Updated {timeAgo(t.updatedAt)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Collapsible per-teacher daily timeline */}
        {teacherTimelines.length > 0 && (
          <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <History className="h-4 w-4" />
                  Today's Teaching Timeline ({teacherTimelines.length} teachers)
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${timelineOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {teacherTimelines.map((t) => (
                <Collapsible key={t.teacherUserId}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between font-normal"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{t.teacherName}</span>
                        <span className="flex items-center gap-1">
                          {t.entries.map((e) => (
                            <span
                              key={e.timetableEntryId}
                              className={`h-2 w-2 rounded-full ${statusDotClass(e.status)}`}
                              title={`${e.periodLabel}: ${statusLabel(e.status)}`}
                            />
                          ))}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.entries.length} period{t.entries.length === 1 ? "" : "s"}
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1 space-y-1 pl-3">
                    {t.entries.map((e) => (
                      <div
                        key={e.timetableEntryId}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${statusDotClass(e.status)}`}
                          />
                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {e.periodLabel} • {formatTime(e.startTime)}–
                              {formatTime(e.endTime)}
                            </p>
                            <p className="text-muted-foreground truncate">
                              {e.subject}
                              {e.sectionLabel && ` • ${e.className ?? ""} ${e.sectionLabel}`}
                              {e.room && ` • ${e.room}`}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="ml-2 shrink-0">
                          {statusLabel(e.status)}
                        </Badge>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
