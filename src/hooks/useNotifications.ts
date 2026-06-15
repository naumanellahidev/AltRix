import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { toast } from "@/components/ui/sonner";

export type AppNotification = {
  id: string;
  school_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    // First chime note (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);
    
    // Second harmonic note (E5) slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.08);
    gain2.gain.setValueAtTime(0.06, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn("Failed to play notification chime:", e);
  }
}

export function useNotifications(schoolId: string | null) {
  const { user, loading } = useSession();
  const qc = useQueryClient();

  const enabled = !loading && !!user?.id && !!schoolId;

  const queryKey = useMemo(() => ["app_notifications", schoolId, user?.id], [schoolId, user?.id]);

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      if (USE_FASTAPI) {
        const response = await apiClient.get("/notifications");
        return response.data as AppNotification[];
      }
      const { data, error } = await supabase
        .from("app_notifications")
        .select("id,school_id,user_id,type,title,body,entity_type,entity_id,read_at,created_at")
        .eq("school_id", schoolId!)
        // Scope strictly to the signed-in recipient. Without this, roles like
        // principal/owner can read other users' notifications via RLS, which
        // makes the bell/banner keep resurfacing rows that `markAllRead`
        // (correctly scoped to the current user) can never clear.
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  useRealtimeTable({
    channel: `rt:app_notifications:${schoolId}:${user?.id ?? ""}`,
    table: "app_notifications",
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    enabled,
    onChange: (payload: any) => {
      void qc.invalidateQueries({ queryKey });
      
      // If it's a new notification, play premium chime and show toast alert
      if (payload && payload.eventType === "INSERT") {
        const newNotif = payload.new as AppNotification;
        if (newNotif) {
          playNotificationSound();
          toast(newNotif.title, {
            description: newNotif.body || "New update received",
            action: {
              label: "View",
              onClick: () => {
                window.dispatchEvent(
                  new CustomEvent("eduverse:open-notification", {
                    detail: { notification: newNotif },
                  })
                );
              },
            },
          });
        }
      }
    },
  });

  const unreadCount = useMemo(() => {
    return (query.data ?? []).filter((n) => !n.read_at).length;
  }, [query.data]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        // Optimistic update
        qc.setQueryData<AppNotification[]>(queryKey, (old) =>
          (old ?? []).map((n) =>
            n.id === id ? { ...n, read_at: new Date().toISOString() } : n
          )
        );

        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/read`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", id);
          if (error) throw error;
        }
      } catch (e: any) {
        // Rollback on error
        await qc.invalidateQueries({ queryKey });
        toast.error(e?.message ?? "Failed to mark as read");
      }
    },
    [qc, queryKey]
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id || !schoolId) return;

    try {
      // Optimistic update
      qc.setQueryData<AppNotification[]>(queryKey, (old) =>
        (old ?? []).map((n) =>
          !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
        )
      );

      if (USE_FASTAPI) {
        await apiClient.post("/notifications/mark-all-read");
      } else {
        const { error } = await supabase
          .from("app_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("school_id", schoolId)
          .eq("user_id", user.id)
          .is("read_at", null);

        if (error) throw error;
      }
      toast.success("All notifications marked as read");
    } catch (e: any) {
      await qc.invalidateQueries({ queryKey });
      toast.error(e?.message ?? "Failed to mark all as read");
    }
  }, [qc, queryKey, user?.id, schoolId]);

  const clearNotification = useCallback(
    async (id: string) => {
      try {
        // Optimistic update - remove from list
        qc.setQueryData<AppNotification[]>(queryKey, (old) =>
          (old ?? []).filter((n) => n.id !== id)
        );

        if (USE_FASTAPI) {
          await apiClient.delete(`/notifications/${id}`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .delete()
            .eq("id", id);

          if (error) throw error;
        }
      } catch (e: any) {
        await qc.invalidateQueries({ queryKey });
        toast.error(e?.message ?? "Failed to remove notification");
      }
    },
    [qc, queryKey]
  );

  return {
    ...query,
    unreadCount,
    markRead,
    markAllRead,
    clearNotification,
  };
}
