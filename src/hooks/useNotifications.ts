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
  category: string;
  action_url: string | null;
  priority: string;
  icon: string | null;
  color: string | null;
  metadata: Record<string, any> | null;
  archived_at: string | null;
  is_favorite: boolean;
  is_pinned: boolean;
};

export interface NotificationFilters {
  page?: number;
  limit?: number;
  unread_only?: boolean;
  archived_only?: boolean;
  category?: string;
  priority?: string;
  is_favorite?: boolean;
  is_pinned?: boolean;
  query?: string;
}

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

export function useNotifications(schoolId: string | null, filters?: NotificationFilters) {
  const { user, loading } = useSession();
  const qc = useQueryClient();

  const enabled = !loading && !!user?.id && !!schoolId;

  const queryKey = useMemo(
    () => ["app_notifications", schoolId, user?.id, JSON.stringify(filters || {})],
    [schoolId, user?.id, JSON.stringify(filters || {})]
  );

  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      if (USE_FASTAPI) {
        const response = await apiClient.get("/notifications", { params: filters });
        return response.data as AppNotification[];
      }
      
      // Supabase Fallback
      let q = supabase
        .from("app_notifications")
        .select("*")
        .eq("school_id", schoolId!)
        .eq("user_id", user!.id);
      
      if (filters?.archived_only) {
        q = q.not("archived_at", "is", null);
      } else {
        q = q.is("archived_at", null);
      }
      
      if (filters?.unread_only) {
        q = q.is("read_at", null);
      }
      
      if (filters?.category) {
        q = q.eq("category", filters.category);
      }
      if (filters?.priority) {
        q = q.eq("priority", filters.priority);
      }
      if (filters?.is_favorite !== undefined) {
        q = q.eq("is_favorite", filters.is_favorite);
      }
      if (filters?.is_pinned !== undefined) {
        q = q.eq("is_pinned", filters.is_pinned);
      }
      if (filters?.query) {
        q = q.or(`title.ilike.%${filters.query}%,body.ilike.%${filters.query}%`);
      }
      
      const page = filters?.page || 1;
      const limit = filters?.limit || 20;
      const offset = (page - 1) * limit;
      
      const { data, error } = await q
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  // Query for counts
  const countsQuery = useQuery({
    queryKey: ["app_notifications_counts", schoolId, user?.id],
    enabled,
    queryFn: async () => {
      if (USE_FASTAPI) {
        const response = await apiClient.get("/notifications/counts");
        return response.data as { unread: number; read: number; archived: number; total: number };
      }
      
      // Supabase count fallback
      const { data: allNotifs, error } = await supabase
        .from("app_notifications")
        .select("read_at, archived_at")
        .eq("school_id", schoolId!)
        .eq("user_id", user!.id);
        
      if (error) throw error;
      const raw = allNotifs ?? [];
      const unread = raw.filter(n => !n.read_at && !n.archived_at).length;
      const read = raw.filter(n => n.read_at && !n.archived_at).length;
      const archived = raw.filter(n => n.archived_at).length;
      
      return {
        unread,
        read,
        archived,
        total: raw.length
      };
    }
  });

  useRealtimeTable({
    channel: `rt:app_notifications:${schoolId}:${user?.id ?? ""}`,
    table: "app_notifications",
    filter: user?.id ? `user_id=eq.${user.id}` : undefined,
    enabled,
    onChange: (payload: any) => {
      void qc.invalidateQueries({ queryKey: ["app_notifications"] });
      void qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
      
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
    return countsQuery.data?.unread ?? 0;
  }, [countsQuery.data]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/read`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", id);
          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
        await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to mark as read");
      }
    },
    [qc]
  );

  const archiveNotification = useCallback(
    async (id: string) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/archive`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", id);
          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
        await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
        toast.success("Notification archived");
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to archive notification");
      }
    },
    [qc]
  );

  const restoreNotification = useCallback(
    async (id: string) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/restore`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ archived_at: null })
            .eq("id", id);
          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
        await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
        toast.success("Notification restored to inbox");
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to restore notification");
      }
    },
    [qc]
  );

  const toggleFavorite = useCallback(
    async (id: string, currentVal: boolean) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/favorite`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ is_favorite: !currentVal })
            .eq("id", id);
          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to update favorite status");
      }
    },
    [qc]
  );

  const togglePin = useCallback(
    async (id: string, currentVal: boolean) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.post(`/notifications/${id}/pin`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .update({ is_pinned: !currentVal })
            .eq("id", id);
          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to update pinned status");
      }
    },
    [qc]
  );

  const markAllRead = useCallback(async () => {
    if (!user?.id || !schoolId) return;

    try {
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
      await qc.invalidateQueries({ queryKey: ["app_notifications"] });
      await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
      toast.success("All notifications marked as read");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to mark all as read");
    }
  }, [qc, user?.id, schoolId]);

  const clearNotification = useCallback(
    async (id: string) => {
      try {
        if (USE_FASTAPI) {
          await apiClient.delete(`/notifications/${id}`);
        } else {
          const { error } = await supabase
            .from("app_notifications")
            .delete()
            .eq("id", id);

          if (error) throw error;
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
        await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to remove notification");
      }
    },
    [qc]
  );

  const bulkAction = useCallback(
    async (action: "read" | "unread" | "archive" | "restore" | "delete", ids: string[]) => {
      if (ids.length === 0) return;
      try {
        if (USE_FASTAPI) {
          await apiClient.post("/notifications/bulk-action", {
            action,
            notification_ids: ids
          });
        } else {
          let q = supabase.from("app_notifications");
          if (action === "delete") {
            const { error } = await q.delete().in("id", ids);
            if (error) throw error;
          } else {
            const updateFields: any = {};
            if (action === "read") updateFields.read_at = new Date().toISOString();
            if (action === "unread") updateFields.read_at = null;
            if (action === "archive") updateFields.archived_at = new Date().toISOString();
            if (action === "restore") updateFields.archived_at = null;
            
            const { error } = await q.update(updateFields).in("id", ids);
            if (error) throw error;
          }
        }
        await qc.invalidateQueries({ queryKey: ["app_notifications"] });
        await qc.invalidateQueries({ queryKey: ["app_notifications_counts"] });
        toast.success(`Bulk action '${action}' completed successfully`);
      } catch (e: any) {
        toast.error(e?.message ?? "Bulk action failed");
      }
    },
    [qc]
  );

  return {
    ...query,
    unreadCount,
    counts: countsQuery.data || { unread: 0, read: 0, archived: 0, total: 0 },
    markRead,
    archiveNotification,
    restoreNotification,
    toggleFavorite,
    togglePin,
    markAllRead,
    clearNotification,
    bulkAction,
  };
}
