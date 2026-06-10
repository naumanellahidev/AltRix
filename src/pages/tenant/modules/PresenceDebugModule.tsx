import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Activity, Trash2, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PresenceEvent {
  id: string;
  receivedAt: string;
  eventType: string;
  schoolId: string | null;
  timetableEntryId: string | null;
  teacherUserId: string | null;
  status: string | null;
  periodDate: string | null;
  reason: string | null;
  matchesSchool: boolean;
}

function fmt(d: string) {
  const date = new Date(d);
  return date.toLocaleTimeString(undefined, { hour12: false }) +
    "." + String(date.getMilliseconds()).padStart(3, "0");
}

export default function PresenceDebugModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId],
  );

  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [channelState, setChannelState] = useState<string>("connecting");
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase
      .channel(`presence_debug_${schoolId}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teacher_period_presence",
        },
        (payload) => {
          if (pausedRef.current) return;
          const row = (payload.new ?? payload.old) as any;
          const ev: PresenceEvent = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            receivedAt: new Date().toISOString(),
            eventType: payload.eventType,
            schoolId: row?.school_id ?? null,
            timetableEntryId: row?.timetable_entry_id ?? null,
            teacherUserId: row?.teacher_user_id ?? null,
            status: row?.status ?? null,
            periodDate: row?.period_date ?? null,
            reason: row?.reason ?? null,
            matchesSchool: row?.school_id === schoolId,
          };
          setEvents((prev) => [ev, ...prev].slice(0, 200));
        },
      )
      .subscribe((status) => {
        setChannelState(status);
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [schoolId]);

  const stats = useMemo(() => {
    const total = events.length;
    const matching = events.filter((e) => e.matchesSchool).length;
    const other = total - matching;
    const byType = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
      return acc;
    }, {});
    return { total, matching, other, byType };
  }, [events]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Presence Realtime Debug
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  channelState === "SUBSCRIBED"
                    ? "bg-primary animate-pulse"
                    : "bg-destructive"
                }`}
              />
              {channelState}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPaused((p) => !p)}
              className="gap-1"
            >
              {paused ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEvents([])}
              className="gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground">Total events</p>
              <p className="text-lg font-semibold">{stats.total}</p>
            </div>
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
              <p className="text-muted-foreground">This school</p>
              <p className="text-lg font-semibold">{stats.matching}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground">Other schools</p>
              <p className="text-lg font-semibold">{stats.other}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground">Types</p>
              <p className="truncate text-xs">
                {Object.entries(stats.byType)
                  .map(([k, v]) => `${k}:${v}`)
                  .join("  ") || "—"}
              </p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            School ID:{" "}
            <code className="rounded bg-muted px-1 py-0.5">{schoolId ?? "—"}</code>
          </div>

          <ScrollArea className="h-[420px] rounded-md border">
            {events.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Waiting for teacher_period_presence events…
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="text-left">
                    <th className="px-2 py-1.5">Time</th>
                    <th className="px-2 py-1.5">Event</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">School</th>
                    <th className="px-2 py-1.5">Timetable Entry</th>
                    <th className="px-2 py-1.5">Teacher</th>
                    <th className="px-2 py-1.5">Date</th>
                    <th className="px-2 py-1.5">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr
                      key={e.id}
                      className={`border-t ${
                        e.matchesSchool ? "" : "opacity-50"
                      }`}
                    >
                      <td className="px-2 py-1 font-mono">{fmt(e.receivedAt)}</td>
                      <td className="px-2 py-1">
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {e.eventType}
                        </Badge>
                      </td>
                      <td className="px-2 py-1 font-medium">{e.status ?? "—"}</td>
                      <td className="px-2 py-1 font-mono">
                        {e.schoolId ? e.schoolId.slice(0, 8) : "—"}
                        {!e.matchesSchool && e.schoolId && (
                          <span className="ml-1 text-destructive">≠</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {e.timetableEntryId ? e.timetableEntryId.slice(0, 8) : "—"}
                      </td>
                      <td className="px-2 py-1 font-mono">
                        {e.teacherUserId ? e.teacherUserId.slice(0, 8) : "—"}
                      </td>
                      <td className="px-2 py-1">{e.periodDate ?? "—"}</td>
                      <td className="px-2 py-1 truncate max-w-[160px]">
                        {e.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
