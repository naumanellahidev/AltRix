import { useCallback, useEffect, useState } from "react";
import { supabase, USE_FASTAPI, setUseFastAPI } from "@/integrations/supabase/client";
import { apiClient, isNetworkOrProxyError } from "@/lib/api-client";

export type PresenceStatus = "in_class" | "left" | "late" | "completed";

export interface PresenceRow {
  id: string;
  timetable_entry_id: string;
  status: PresenceStatus;
  entered_at: string | null;
  left_at: string | null;
  period_date: string;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Manages the current teacher's period-presence rows.
 */
export function useTeacherPresence(
  schoolId: string | null,
  teacherUserId: string | null,
  selectedDate?: string
) {
  const [rows, setRows] = useState<Map<string, PresenceRow>>(new Map());
  const [saving, setSaving] = useState<string | null>(null);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "live" | "reconnecting" | "offline"
  >("connecting");
  const [lastEcho, setLastEcho] = useState<
    { entryId: string; status: PresenceStatus; ts: number } | null
  >(null);

  const dateStr = selectedDate || todayISO();

  const load = useCallback(async () => {
    if (!schoolId || !teacherUserId) return;

    const runSupabaseLoad = async () => {
      const { data: res, error } = await (supabase as any)
        .from("teacher_period_presence")
        .select("id, timetable_entry_id, status, entered_at, left_at, period_date")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", teacherUserId)
        .eq("period_date", dateStr);
      if (error) throw error;
      return res || [];
    };

    try {
      let data: PresenceRow[] = [];
      let useFastApiActive = USE_FASTAPI;
      if (useFastApiActive) {
        try {
          const resp = await apiClient.get<PresenceRow[]>("/teachers/presence", {
            params: {
              teacher_user_id: teacherUserId,
              period_date: dateStr,
            },
          });
          data = resp.data;
        } catch (apiErr: any) {
          if (isNetworkOrProxyError(apiErr)) {
            console.warn("Failed to load teacher presence via FastAPI, falling back to Supabase", apiErr);
            setUseFastAPI(false);
            useFastApiActive = false;
          } else {
            throw apiErr;
          }
        }
      }

      if (!useFastApiActive) {
        data = await runSupabaseLoad();
      }

      const map = new Map<string, PresenceRow>();
      data.forEach((r) => map.set(r.timetable_entry_id, r));
      setRows(map);
    } catch (err) {
      console.error("Failed to load teacher presence", err);
    }
  }, [schoolId, teacherUserId, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  // Reconnect on network restore / tab refocus
  useEffect(() => {
    const bump = () => {
      setRealtimeStatus("reconnecting");
      setReconnectVersion((v) => v + 1);
    };
    const onOnline = () => bump();
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", () => setRealtimeStatus("offline"));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", () => setRealtimeStatus("offline"));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Realtime sync of own presence — merge payload directly for instant updates
  useEffect(() => {
    if (!schoolId || !teacherUserId) return;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`teacher_presence_self_${teacherUserId}_${reconnectVersion}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teacher_period_presence",
          filter: `teacher_user_id=eq.${teacherUserId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row?.timetable_entry_id) {
            load();
            return;
          }
          if (row.period_date !== dateStr) return;
          setRows((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") {
              next.delete(row.timetable_entry_id);
            } else {
              next.set(row.timetable_entry_id, {
                id: row.id,
                timetable_entry_id: row.timetable_entry_id,
                status: row.status,
                entered_at: row.entered_at ?? null,
                left_at: row.left_at ?? null,
                period_date: row.period_date,
              });
            }
            return next;
          });
          if (payload.eventType !== "DELETE" && row.status) {
            setLastEcho({
              entryId: row.timetable_entry_id,
              status: row.status as PresenceStatus,
              ts: Date.now(),
            });
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("live");
          load();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("reconnecting");
          if (backoffTimer) clearTimeout(backoffTimer);
          backoffTimer = setTimeout(() => {
            setReconnectVersion((v) => v + 1);
          }, 2000);
        }
      });
    return () => {
      if (backoffTimer) clearTimeout(backoffTimer);
      supabase.removeChannel(ch);
    };
  }, [schoolId, teacherUserId, load, reconnectVersion, dateStr]);

  const setStatus = useCallback(
    async (
      timetableEntryId: string,
      status: PresenceStatus,
      opts?: { reason?: string | null; startTime?: string | null },
    ) => {
      if (!schoolId || !teacherUserId) return;
      if (saving === timetableEntryId) return { error: null, effectiveStatus: status };
      setSaving(timetableEntryId);
      const nowIso = new Date().toISOString();
      const existing = rows.get(timetableEntryId);

      let effectiveStatus: PresenceStatus = status;
      if (status === "in_class" && opts?.startTime) {
        const [h, m] = opts.startTime.split(":").map(Number);
        const startMin = h * 60 + m;
        const now = new Date();
        const curMin = now.getHours() * 60 + now.getMinutes();
        if (curMin > startMin + 5) effectiveStatus = "late";
      }

      if (
        existing &&
        existing.status === effectiveStatus &&
        (opts?.reason ?? null) === null
      ) {
        setSaving(null);
        return { error: null, effectiveStatus };
      }

      const payload: Record<string, unknown> = {
        school_id: schoolId,
        teacher_user_id: teacherUserId,
        timetable_entry_id: timetableEntryId,
        period_date: dateStr,
        status: effectiveStatus,
        reason: opts?.reason ?? null,
      };
      if (effectiveStatus === "in_class" || effectiveStatus === "late") {
        payload.entered_at = existing?.entered_at ?? nowIso;
        payload.left_at = effectiveStatus === "late" ? existing?.left_at ?? null : null;
      } else if (effectiveStatus === "left" || effectiveStatus === "completed") {
        payload.entered_at = existing?.entered_at ?? nowIso;
        payload.left_at = nowIso;
      }

      // Optimistic local update — flip status immediately for instant feedback
      const optimisticRow: PresenceRow = {
        id: existing?.id ?? `optimistic-${timetableEntryId}`,
        timetable_entry_id: timetableEntryId,
        status: effectiveStatus,
        entered_at: (payload.entered_at as string | null) ?? null,
        left_at: (payload.left_at as string | null) ?? null,
        period_date: dateStr,
      };
      const prevRow = existing ?? null;
      setRows((prev) => {
        const next = new Map(prev);
        next.set(timetableEntryId, optimisticRow);
        return next;
      });

      let error: any = null;
      let useFastApiActive = USE_FASTAPI;
      if (useFastApiActive) {
        try {
          await apiClient.post("/teachers/presence", {
            timetable_entry_id: timetableEntryId,
            status: effectiveStatus,
            period_date: dateStr,
            reason: opts?.reason ?? null,
            entered_at: (payload.entered_at as string | null) ?? null,
            left_at: (payload.left_at as string | null) ?? null,
          }, {
            params: {
              teacher_user_id: teacherUserId,
            },
          });
        } catch (err: any) {
          if (isNetworkOrProxyError(err)) {
            console.warn("Failed to set teacher presence via FastAPI, falling back to Supabase", err);
            setUseFastAPI(false);
            useFastApiActive = false;
          } else {
            error = err;
          }
        }
      }

      if (!useFastApiActive) {
        const { error: upsertErr } = await (supabase as any)
          .from("teacher_period_presence")
          .upsert(payload, {
            onConflict: "school_id,teacher_user_id,timetable_entry_id,period_date",
          });
        error = upsertErr;
      }

      setSaving(null);
      if (error) {
        // Roll back optimistic change on failure
        setRows((prev) => {
          const next = new Map(prev);
          if (prevRow) next.set(timetableEntryId, prevRow);
          else next.delete(timetableEntryId);
          return next;
        });
      } else {
        await load();
      }
      return { error, effectiveStatus };
    },
    [schoolId, teacherUserId, rows, load, saving, dateStr],
  );

  return { rows, setStatus, saving, refetch: load, realtimeStatus, lastEcho };
}
