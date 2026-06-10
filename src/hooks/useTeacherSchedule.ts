import { useCallback, useEffect, useState } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { getCachedTimetable, cacheTimetable, CachedTimetableEntry } from "@/lib/offline-db";

export interface ScheduleEntry {
  id: string;
  subjectName: string;
  periodId: string;
  periodLabel: string;
  startTime: string | null;
  endTime: string | null;
  sortOrder: number;
  room: string | null;
  sectionLabel: string | null;
}

export interface PeriodLog {
  id: string;
  timetableEntryId: string;
  status: string;
  notes: string | null;
  topicsCovered: string | null;
}

interface UseTeacherScheduleResult {
  entries: ScheduleEntry[];
  periodLogs: Map<string, PeriodLog>;
  loading: boolean;
  error: string | null;
  isOffline: boolean;
  refetch: () => void;
}

// Local cache for period logs (persisted in localStorage)
const PERIOD_LOGS_CACHE_KEY = "eduverse_period_logs_cache";

function getCachedPeriodLogs(schoolId: string, date: string): Map<string, PeriodLog> {
  try {
    const cached = localStorage.getItem(`${PERIOD_LOGS_CACHE_KEY}_${schoolId}_${date}`);
    if (!cached) return new Map();
    const data: [string, PeriodLog][] = JSON.parse(cached);
    return new Map(data);
  } catch {
    return new Map();
  }
}

function cachePeriodLogs(schoolId: string, date: string, logs: Map<string, PeriodLog>) {
  try {
    const data = Array.from(logs.entries());
    localStorage.setItem(`${PERIOD_LOGS_CACHE_KEY}_${schoolId}_${date}`, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

export function useTeacherSchedule(
  schoolId: string | null,
  dayOfWeek: number
): UseTeacherScheduleResult {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [periodLogs, setPeriodLogs] = useState<Map<string, PeriodLog>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      setEntries([]);
      setPeriodLogs(new Map());
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const todayDate = new Date().toISOString().split("T")[0];

      // Try to load from cache first (for instant display)
      try {
        const cachedEntries = await getCachedTimetable(schoolId!, dayOfWeek);
        if (cachedEntries.length > 0 && !cancelled) {
          const mappedEntries: ScheduleEntry[] = cachedEntries.map(e => ({
            id: e.id,
            subjectName: e.subjectName,
            periodId: e.periodId,
            periodLabel: e.periodLabel,
            startTime: e.startTime,
            endTime: e.endTime,
            sortOrder: e.sortOrder,
            room: e.room,
            sectionLabel: e.sectionLabel,
          }));
          mappedEntries.sort((a, b) => a.sortOrder - b.sortOrder);
          setEntries(mappedEntries);
          
          // Also load cached period logs
          const cachedLogs = getCachedPeriodLogs(schoolId!, todayDate);
          if (cachedLogs.size > 0) {
            setPeriodLogs(cachedLogs);
          }
          
          // If offline, stop here
          if (!navigator.onLine) {
            setLoading(false);
            return;
          }
        }
      } catch {
        // Continue with network fetch
      }

      // If offline and no cache, show error
      if (!navigator.onLine) {
        if (cancelled) return;
        setError("You are offline. Schedule data is not available.");
        setLoading(false);
        return;
      }

      try {
        let enrichedEntries: ScheduleEntry[] = [];
        let logsMap = new Map<string, PeriodLog>();

        if (USE_FASTAPI) {
          // Get current user
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            throw new Error("Not authenticated");
          }
          const userId = userData.user.id;

          const resp = await apiClient.get<{ entries: ScheduleEntry[]; periodLogs: Record<string, PeriodLog> }>("/teachers/schedule", {
            params: {
              teacher_user_id: userId,
              day_of_week: dayOfWeek,
            },
          });
          
          if (cancelled) return;
          enrichedEntries = resp.data.entries ?? [];
          Object.entries(resp.data.periodLogs ?? {}).forEach(([key, log]) => {
            logsMap.set(key, log);
          });
        } else {
          // Get current user
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData.user) {
            throw new Error("Not authenticated");
          }
          const userId = userData.user.id;

          // Fetch periods for this school
          const { data: periods, error: periodsError } = await supabase
            .from("timetable_periods")
            .select("id, label, sort_order, start_time, end_time, is_break")
            .eq("school_id", schoolId)
            .order("sort_order", { ascending: true });

          if (periodsError) throw periodsError;

          const periodMap = new Map<string, { label: string; sortOrder: number; startTime: string | null; endTime: string | null; isBreak: boolean }>();
          (periods ?? []).forEach((p) => {
            periodMap.set(p.id, {
              label: p.label,
              sortOrder: p.sort_order,
              startTime: p.start_time,
              endTime: p.end_time,
              isBreak: p.is_break ?? false,
            });
          });

          // Fetch timetable entries for this teacher on the selected day
          const { data: timetableEntries, error: entriesError } = await supabase
            .from("timetable_entries")
            .select(`
              id,
              subject_name,
              period_id,
              room,
              class_section_id,
              start_time,
              end_time
            `)
            .eq("school_id", schoolId)
            .eq("teacher_user_id", userId)
            .eq("day_of_week", dayOfWeek);

          if (entriesError) throw entriesError;

          if (cancelled) return;

          // Get section labels separately to avoid RLS join issues
          const sectionIds = [...new Set((timetableEntries ?? []).map((e) => e.class_section_id).filter(Boolean))];
          
          let sectionMap = new Map<string, string>();
          if (sectionIds.length > 0) {
            const { data: sections } = await supabase
              .from("class_sections")
              .select("id, name, academic_classes(name)")
              .in("id", sectionIds);

            (sections ?? []).forEach((s: any) => {
              const className = s.academic_classes?.name ?? "";
              const sectionName = s.name ?? "";
              sectionMap.set(s.id, `${className} • ${sectionName}`.trim());
            });
          }

          // Build enriched entries
          enrichedEntries = (timetableEntries ?? []).map((e) => {
            const period = e.period_id ? periodMap.get(e.period_id) : null;
            return {
              id: e.id,
              subjectName: e.subject_name,
              periodId: e.period_id ?? "",
              periodLabel: period?.label ?? "",
              startTime: e.start_time ?? period?.startTime ?? null,
              endTime: e.end_time ?? period?.endTime ?? null,
              sortOrder: period?.sortOrder ?? 999,
              room: e.room,
              sectionLabel: e.class_section_id ? sectionMap.get(e.class_section_id) ?? null : null,
            };
          });

          // Sort by period order
          enrichedEntries.sort((a, b) => a.sortOrder - b.sortOrder);

          if (cancelled) return;

          // Fetch today's period logs for these entries
          const entryIds = enrichedEntries.map((e) => e.id);
          
          if (entryIds.length > 0) {
            const { data: logs } = await (supabase as any)
              .from("teacher_period_logs")
              .select("id, timetable_entry_id, status, notes, topics_covered")
              .eq("teacher_user_id", userId)
              .eq("log_date", todayDate)
              .in("timetable_entry_id", entryIds);

            ((logs as any[]) ?? []).forEach((log: any) => {
              logsMap.set(log.timetable_entry_id, {
                id: log.id,
                timetableEntryId: log.timetable_entry_id,
                status: log.status,
                notes: log.notes,
                topicsCovered: log.topics_covered,
              });
            });
          }
        }

        // Cache entries for offline use
        const entriesToCache: CachedTimetableEntry[] = enrichedEntries.map(e => ({
          id: e.id,
          schoolId: schoolId!,
          dayOfWeek,
          periodId: e.periodId,
          periodLabel: e.periodLabel,
          subjectName: e.subjectName,
          classSectionId: null,
          sectionLabel: e.sectionLabel,
          room: e.room,
          startTime: e.startTime,
          endTime: e.endTime,
          sortOrder: e.sortOrder,
          cachedAt: Date.now(),
        }));
        
        if (entriesToCache.length > 0) {
          await cacheTimetable(entriesToCache);
        }

        if (logsMap.size > 0) {
          // Cache period logs
          cachePeriodLogs(schoolId!, todayDate, logsMap);
        }

        if (cancelled) return;

        setEntries(enrichedEntries);
        setPeriodLogs(logsMap);
      } catch (err: any) {
        if (!cancelled) {
          // If network error and we have cached data, show it
          const cachedEntries = await getCachedTimetable(schoolId!, dayOfWeek);
          if (cachedEntries.length > 0) {
            const mappedEntries: ScheduleEntry[] = cachedEntries.map(e => ({
              id: e.id,
              subjectName: e.subjectName,
              periodId: e.periodId,
              periodLabel: e.periodLabel,
              startTime: e.startTime,
              endTime: e.endTime,
              sortOrder: e.sortOrder,
              room: e.room,
              sectionLabel: e.sectionLabel,
            }));
            mappedEntries.sort((a, b) => a.sortOrder - b.sortOrder);
            setEntries(mappedEntries);
            setError(null);
          } else {
            setError(err.message ?? "Failed to load schedule");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [schoolId, dayOfWeek, refreshKey]);

  return { entries, periodLogs, loading, error, isOffline, refetch };
}
