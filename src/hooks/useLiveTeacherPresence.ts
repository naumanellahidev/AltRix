import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

export interface LiveTeacherStatus {
  teacherUserId: string;
  teacherName: string;
  status: "in_class" | "left" | "late" | "not_checked_in";
  enteredAt: string | null;
  leftAt: string | null;
  updatedAt: string | null;
  subject: string;
  sectionLabel: string | null;
  className: string | null;
  room: string | null;
  periodLabel: string;
  startTime: string | null;
  endTime: string | null;
  timetableEntryId: string;
}

interface TimetableEntry {
  id: string;
  subject_name: string;
  teacher_user_id: string | null;
  class_section_id: string | null;
  room: string | null;
  period_id: string;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
}

interface Period {
  id: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
  is_break: boolean;
}

function timeToMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function useLiveTeacherPresence(schoolId: string | null) {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [sections, setSections] = useState<Map<string, { name: string; class_name: string | null }>>(new Map());
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [presenceRows, setPresenceRows] = useState<Map<string, { status: string; entered_at: string | null; left_at: string | null; updated_at: string; reason: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  // Tick every minute so "current" period is always fresh
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadStatic = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/teachers/live-presence");
        setEntries(resp.data.entries ?? []);
        setPeriods(resp.data.periods ?? []);
        
        const sMap = new Map<string, { name: string; class_name: string | null }>();
        Object.entries(resp.data.sections ?? {}).forEach(([key, s]: [string, any]) => {
          sMap.set(key, { name: s.name, class_name: s.class_name });
        });
        setSections(sMap);
        
        const tMap = new Map<string, string>();
        Object.entries(resp.data.teachers ?? {}).forEach(([key, val]: [string, any]) => {
          tMap.set(key, val);
        });
        setTeachers(tMap);
      } else {
        const today = new Date().getDay();
        const [ttRes, periodsRes, sectionsRes, dirRes] = await Promise.all([
          supabase
            .from("timetable_entries")
            .select("id, subject_name, teacher_user_id, class_section_id, room, period_id, day_of_week, start_time, end_time")
            .eq("school_id", schoolId)
            .eq("day_of_week", today),
          supabase
            .from("timetable_periods")
            .select("id, label, start_time, end_time, sort_order, is_break")
            .eq("school_id", schoolId)
            .order("sort_order"),
          supabase
            .from("class_sections")
            .select("id, name, class_id, academic_classes(name)")
            .eq("school_id", schoolId),
          supabase.rpc("get_school_user_directory", { _school_id: schoolId }),
        ]);

        setEntries((ttRes.data as TimetableEntry[] | null) ?? []);
        setPeriods((periodsRes.data as Period[] | null) ?? []);
        const sMap = new Map<string, { name: string; class_name: string | null }>();
        (sectionsRes.data as any[] | null)?.forEach((s) => {
          sMap.set(s.id, { name: s.name, class_name: s.academic_classes?.name ?? null });
        });
        setSections(sMap);
        const tMap = new Map<string, string>();
        (dirRes.data as any[] | null)?.forEach((u) => {
          tMap.set(u.user_id, u.display_name ?? u.email ?? "Teacher");
        });
        setTeachers(tMap);
      }
    } catch (e) {
      console.error("Failed to load static teacher live presence", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  const loadPresence = useCallback(async () => {
    if (!schoolId) return;
    try {
      if (USE_FASTAPI) {
        const resp = await apiClient.get<any>("/teachers/live-presence");
        const presenceMap = new Map<string, { status: string; entered_at: string | null; left_at: string | null; updated_at: string; reason: string | null }>();
        Object.entries(resp.data.presenceRows ?? {}).forEach(([key, r]: [string, any]) => {
          presenceMap.set(key, {
            status: r.status,
            entered_at: r.entered_at,
            left_at: r.left_at,
            updated_at: r.updated_at,
            reason: r.reason ?? null,
          });
        });
        setPresenceRows(presenceMap);
      } else {
        const { data } = await (supabase as any)
          .from("teacher_period_presence")
          .select("timetable_entry_id, status, entered_at, left_at, updated_at, reason")
          .eq("school_id", schoolId)
          .eq("period_date", todayISO());
        const map = new Map<string, { status: string; entered_at: string | null; left_at: string | null; updated_at: string; reason: string | null }>();
        (data as any[] | null)?.forEach((r) => {
          map.set(r.timetable_entry_id, {
            status: r.status,
            entered_at: r.entered_at,
            left_at: r.left_at,
            updated_at: r.updated_at,
            reason: r.reason ?? null,
          });
        });
        setPresenceRows(map);
      }
    } catch (e) {
      console.error("Failed to load teacher presence data", e);
    }
  }, [schoolId]);

  useEffect(() => {
    loadStatic();
  }, [loadStatic]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  const [reconnectVersion, setReconnectVersion] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "live" | "reconnecting" | "offline"
  >("connecting");

  // Reconnect on network restore / tab refocus
  useEffect(() => {
    const bump = () => {
      setRealtimeStatus("reconnecting");
      setReconnectVersion((v) => v + 1);
    };
    const onOnline = () => bump();
    const onOffline = () => setRealtimeStatus("offline");
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`live_presence_${schoolId}_${reconnectVersion}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "teacher_period_presence",
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (row?.school_id && row.school_id !== schoolId) return;
          if (!row?.timetable_entry_id) {
            loadPresence();
            return;
          }
          if (payload.eventType === "DELETE") {
            setPresenceRows((prev) => {
              const next = new Map(prev);
              next.delete(row.timetable_entry_id);
              return next;
            });
          } else {
            setPresenceRows((prev) => {
              const next = new Map(prev);
              next.set(row.timetable_entry_id, {
                status: row.status,
                entered_at: row.entered_at ?? null,
                left_at: row.left_at ?? null,
                updated_at: row.updated_at ?? new Date().toISOString(),
                reason: row.reason ?? null,
              });
              return next;
            });
            loadPresence();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("live");
          loadPresence();
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
  }, [schoolId, loadPresence, reconnectVersion]);

  const periodMap = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);

  const liveTeachers = useMemo<LiveTeacherStatus[]>(() => {
    const curMin = now.getHours() * 60 + now.getMinutes();
    const result: LiveTeacherStatus[] = [];
    entries.forEach((e) => {
      if (!e.teacher_user_id) return;
      const p = periodMap.get(e.period_id);
      const start = timeToMin(e.start_time ?? p?.start_time ?? null);
      const end = timeToMin(e.end_time ?? p?.end_time ?? null);
      if (start == null || end == null) return;
      if (curMin < start || curMin > end) return;
      if (p?.is_break) return;
      const presence = presenceRows.get(e.id);
      const sec = e.class_section_id ? sections.get(e.class_section_id) : undefined;
      result.push({
        teacherUserId: e.teacher_user_id,
        teacherName: teachers.get(e.teacher_user_id) ?? "Teacher",
        status: (presence?.status as any) ?? "not_checked_in",
        enteredAt: presence?.entered_at ?? null,
        leftAt: presence?.left_at ?? null,
        updatedAt: presence?.updated_at ?? null,
        subject: e.subject_name,
        sectionLabel: sec?.name ?? null,
        className: sec?.class_name ?? null,
        room: e.room,
        periodLabel: p?.label ?? "Period",
        startTime: e.start_time ?? p?.start_time ?? null,
        endTime: e.end_time ?? p?.end_time ?? null,
        timetableEntryId: e.id,
      });
    });
    return result.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [entries, periodMap, presenceRows, sections, teachers, now]);

  // Per-teacher full-day timeline (all scheduled periods today, with current status)
  const teacherTimelines = useMemo(() => {
    type TimelineEntry = {
      timetableEntryId: string;
      periodLabel: string;
      startTime: string | null;
      endTime: string | null;
      subject: string;
      sectionLabel: string | null;
      className: string | null;
      room: string | null;
      status: "in_class" | "left" | "late" | "not_checked_in";
      enteredAt: string | null;
      leftAt: string | null;
      reason: string | null;
    };
    const byTeacher = new Map<string, { teacherName: string; entries: TimelineEntry[] }>();
    entries.forEach((e) => {
      if (!e.teacher_user_id) return;
      const p = periodMap.get(e.period_id);
      if (p?.is_break) return;
      const presence = presenceRows.get(e.id);
      const sec = e.class_section_id ? sections.get(e.class_section_id) : undefined;
      const item: TimelineEntry = {
        timetableEntryId: e.id,
        periodLabel: p?.label ?? "Period",
        startTime: e.start_time ?? p?.start_time ?? null,
        endTime: e.end_time ?? p?.end_time ?? null,
        subject: e.subject_name,
        sectionLabel: sec?.name ?? null,
        className: sec?.class_name ?? null,
        room: e.room,
        status: (presence?.status as any) ?? "not_checked_in",
        enteredAt: presence?.entered_at ?? null,
        leftAt: presence?.left_at ?? null,
        reason: presence?.reason ?? null,
      };
      const bucket = byTeacher.get(e.teacher_user_id) ?? {
        teacherName: teachers.get(e.teacher_user_id) ?? "Teacher",
        entries: [],
      };
      bucket.entries.push(item);
      byTeacher.set(e.teacher_user_id, bucket);
    });
    return Array.from(byTeacher.entries())
      .map(([teacherUserId, v]) => ({
        teacherUserId,
        teacherName: v.teacherName,
        entries: v.entries.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
      }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [entries, periodMap, presenceRows, sections, teachers]);

  // Lookup helpers for toast notifications
  const lookupEntry = useCallback(
    (entryId: string) => {
      const e = entries.find((x) => x.id === entryId);
      if (!e) return null;
      const p = periodMap.get(e.period_id);
      const sec = e.class_section_id ? sections.get(e.class_section_id) : undefined;
      return {
        teacherName: e.teacher_user_id ? teachers.get(e.teacher_user_id) ?? "Teacher" : "Teacher",
        subject: e.subject_name,
        periodLabel: p?.label ?? "Period",
        sectionLabel: sec?.name ?? null,
      };
    },
    [entries, periodMap, sections, teachers],
  );

  return { liveTeachers, teacherTimelines, lookupEntry, loading, refetch: loadPresence, realtimeStatus };
}
