import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { CalendarDays, Clock, MessageSquareText } from "lucide-react";

interface AuditRow {
  id: string;
  timetable_entry_id: string;
  period_date: string;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  created_at: string;
}

interface EntryInfo {
  subject_name: string;
  period_label: string;
  start_time: string | null;
  end_time: string | null;
  section_label: string | null;
  class_name: string | null;
  room: string | null;
}

function statusLabel(s: string) {
  if (s === "in_class") return "In Class";
  if (s === "left") return "Left";
  if (s === "late") return "Late";
  return s;
}

function statusBadge(s: string) {
  if (s === "in_class") return "bg-primary text-primary-foreground";
  if (s === "left") return "bg-destructive text-destructive-foreground";
  if (s === "late") return "bg-accent text-accent-foreground";
  return "bg-muted text-muted-foreground";
}

function formatDateLabel(d: string) {
  const today = new Date().toISOString().split("T")[0];
  if (d === today) return "Today";
  const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (d === y) return "Yesterday";
  return new Date(d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function TeacherPresenceHistoryModule() {
  const { schoolSlug } = useParams();
  const { schoolId } = useTenantOptimized(schoolSlug);
  const { user } = useSession();

  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [entries, setEntries] = useState<Map<string, EntryInfo>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const { data: auditData } = await (supabase as any)
        .from("teacher_presence_audit")
        .select("id, timetable_entry_id, period_date, old_status, new_status, reason, created_at")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id)
        .gte("period_date", since)
        .order("created_at", { ascending: false });

      const rows = (auditData as AuditRow[] | null) ?? [];
      const entryIds = Array.from(new Set(rows.map((r) => r.timetable_entry_id)));

      const entryMap = new Map<string, EntryInfo>();
      if (entryIds.length > 0) {
        const { data: ttData } = await supabase
          .from("timetable_entries")
          .select(
            "id, subject_name, room, start_time, end_time, timetable_periods(label, start_time, end_time), class_sections(name, academic_classes(name))",
          )
          .in("id", entryIds);
        (ttData as any[] | null)?.forEach((e) => {
          entryMap.set(e.id, {
            subject_name: e.subject_name ?? "Class",
            period_label: e.timetable_periods?.label ?? "Period",
            start_time: e.start_time ?? e.timetable_periods?.start_time ?? null,
            end_time: e.end_time ?? e.timetable_periods?.end_time ?? null,
            section_label: e.class_sections?.name ?? null,
            class_name: e.class_sections?.academic_classes?.name ?? null,
            room: e.room ?? null,
          });
        });
      }

      if (cancelled) return;
      setEntries(entryMap);
      setAudit(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, user?.id]);

  const grouped = useMemo(() => {
    const m = new Map<string, AuditRow[]>();
    audit.forEach((r) => {
      const arr = m.get(r.period_date) ?? [];
      arr.push(r);
      m.set(r.period_date, arr);
    });
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [audit]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> My Presence History
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Today and the last 7 days of check-ins and check-outs.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}

          {!loading &&
            grouped.map(([date, rows]) => (
              <div key={date} className="space-y-2">
                <h3 className="text-sm font-semibold">{formatDateLabel(date)}</h3>
                <div className="space-y-2">
                  {rows.map((r) => {
                    const info = entries.get(r.timetable_entry_id);
                    return (
                      <div
                        key={r.id}
                        className="flex items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={statusBadge(r.new_status)}>
                              {r.old_status
                                ? `${statusLabel(r.old_status)} → ${statusLabel(r.new_status)}`
                                : statusLabel(r.new_status)}
                            </Badge>
                            {info && (
                              <span className="text-sm font-medium truncate">
                                {info.subject_name}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {info?.period_label}
                            {info?.start_time &&
                              ` • ${info.start_time.slice(0, 5)}–${info.end_time?.slice(0, 5) ?? ""}`}
                            {info?.section_label &&
                              ` • ${info.class_name ?? ""} ${info.section_label}`}
                            {info?.room && ` • Room ${info.room}`}
                          </p>
                          {r.reason && (
                            <p className="mt-1 flex items-start gap-1 text-xs">
                              <MessageSquareText className="h-3 w-3 mt-0.5 text-muted-foreground" />
                              <span>{r.reason}</span>
                            </p>
                          )}
                        </div>
                        <span className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(r.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default TeacherPresenceHistoryModule;
