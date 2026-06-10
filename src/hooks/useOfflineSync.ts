import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface OfflineEntry {
  id: string;
  type: "attendance" | "period_log";
  data: Record<string, unknown>;
  timestamp: number;
  synced: boolean;
}

const STORAGE_KEY = "eduverse_offline_queue";

export function useOfflineSync(schoolId: string | null, userId: string | null) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load pending count from storage
  useEffect(() => {
    const queue = getQueue();
    setPendingCount(queue.filter((e) => !e.synced).length);
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingEntries();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [schoolId, userId]);

  const getQueue = useCallback((): OfflineEntry[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const saveQueue = useCallback((queue: OfflineEntry[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      setPendingCount(queue.filter((e) => !e.synced).length);
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }, []);

  const addToQueue = useCallback(
    (type: OfflineEntry["type"], data: Record<string, unknown>) => {
      const entry: OfflineEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        timestamp: Date.now(),
        synced: false,
      };

      const queue = getQueue();
      queue.push(entry);
      saveQueue(queue);

      // Try to sync immediately if online
      if (navigator.onLine) {
        syncPendingEntries();
      }

      return entry.id;
    },
    [getQueue, saveQueue]
  );

  const syncPendingEntries = useCallback(async () => {
    if (!schoolId || !userId || isSyncing) return;

    const queue = getQueue();
    const pending = queue.filter((e) => !e.synced);

    if (pending.length === 0) return;

    setIsSyncing(true);

    for (const entry of pending) {
      try {
        if (entry.type === "attendance") {
          const { session_id, student_id, status, note } = entry.data as {
            session_id: string;
            student_id: string;
            status: string;
            note?: string;
          };

          const { error } = await supabase.from("attendance_entries").upsert(
            {
              school_id: schoolId,
              session_id,
              student_id,
              status,
              note: note || null,
              created_by: userId,
            },
            { onConflict: "school_id,session_id,student_id" }
          );

          if (!error) {
            entry.synced = true;
          }
        } else if (entry.type === "period_log") {
          const { timetable_entry_id, log_date, topic, notes } =
            entry.data as {
              timetable_entry_id: string;
              log_date: string;
              topic?: string;
              notes?: string;
            };

          // Use logged_at instead of log_date based on schema
          const { error } = await (supabase as any).from("timetable_period_logs").upsert(
            {
              school_id: schoolId,
              timetable_entry_id,
              logged_at: log_date,
              topic_covered: topic || "",
              notes: notes || null,
              teacher_user_id: userId,
            },
            { onConflict: "school_id,timetable_entry_id,logged_at" }
          );

          if (!error) {
            entry.synced = true;
          }
        }
      } catch (error) {
        console.error(`Failed to sync entry ${entry.id}:`, error);
      }
    }

    saveQueue(queue);
    setIsSyncing(false);
  }, [schoolId, userId, isSyncing, getQueue, saveQueue]);

  // Expose function to save attendance offline
  const saveAttendanceOffline = useCallback(
    (sessionId: string, studentId: string, status: string, note?: string) => {
      return addToQueue("attendance", {
        session_id: sessionId,
        student_id: studentId,
        status,
        note,
      });
    },
    [addToQueue]
  );

  // Expose function to save period log offline
  const savePeriodLogOffline = useCallback(
    (
      timetableEntryId: string,
      logDate: string,
      topic?: string,
      notes?: string
    ) => {
      return addToQueue("period_log", {
        timetable_entry_id: timetableEntryId,
        log_date: logDate,
        topic,
        notes,
      });
    },
    [addToQueue]
  );

  // Clear synced entries older than 24 hours
  const clearOldEntries = useCallback(() => {
    const queue = getQueue();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const filtered = queue.filter(
      (e) => !e.synced || e.timestamp > oneDayAgo
    );
    saveQueue(filtered);
  }, [getQueue, saveQueue]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    saveAttendanceOffline,
    savePeriodLogOffline,
    syncPendingEntries,
    clearOldEntries,
  };
}
