import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useRealtimeTable } from "@/hooks/useRealtime";

interface UnreadMessagesResult {
  unreadCount: number;
  unreadAdminCount: number;
  unreadParentCount: number;
  loading: boolean;
}

export function useUnreadMessagesOptimized(
  schoolId: string | null,
  userId: string | null
): UnreadMessagesResult {
  const queryClient = useQueryClient();

  const { data = { unreadAdminCount: 0, unreadParentCount: 0 }, isLoading } = useQuery({
    queryKey: ["unread_messages_counts", schoolId, userId],
    queryFn: async () => {
      if (!schoolId || !userId) return { unreadAdminCount: 0, unreadParentCount: 0 };

      let unreadAdminCount = 0;
      let unreadParentCount = 0;

      // 1. Fetch admin messages unread count
      if (USE_FASTAPI) {
        try {
          const resp = await apiClient.get<{ count: number }>("/messages/unread-count");
          unreadAdminCount = resp.data.count;
        } catch (e) {
          console.warn("Failed to fetch admin unread count from FastAPI, falling back", e);
          const { count } = await supabase
            .from("admin_message_recipients")
            .select("id, admin_messages!inner(school_id)", { count: "exact", head: true })
            .eq("recipient_user_id", userId)
            .eq("is_read", false)
            .eq("admin_messages.school_id", schoolId);
          unreadAdminCount = count || 0;
        }
      } else {
        const { count } = await supabase
          .from("admin_message_recipients")
          .select("id, admin_messages!inner(school_id)", { count: "exact", head: true })
          .eq("recipient_user_id", userId)
          .eq("is_read", false)
          .eq("admin_messages.school_id", schoolId);
        unreadAdminCount = count || 0;
      }

      // 2. Fetch parent messages unread count
      const { count: parentCount } = await supabase
        .from("parent_messages")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("recipient_user_id", userId)
        .eq("is_read", false);
      unreadParentCount = parentCount || 0;

      return { unreadAdminCount, unreadParentCount };
    },
    enabled: !!schoolId && !!userId,
    staleTime: 5 * 1000, // Snackier cache for faster visual feedback
    gcTime: 15 * 1000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["unread_messages_counts", schoolId, userId] });
  }, [queryClient, schoolId, userId]);

  // Realtime subscription for admin_message_recipients
  useRealtimeTable({
    channel: `unread-admin-recipients-optimized-${schoolId}-${userId}`,
    table: "admin_message_recipients",
    filter: userId ? `recipient_user_id=eq.${userId}` : undefined,
    enabled: !!schoolId && !!userId,
    onChange: invalidate,
  });

  // Realtime subscription for parent_messages
  useRealtimeTable({
    channel: `unread-parent-messages-optimized-${schoolId}-${userId}`,
    table: "parent_messages",
    filter: userId ? `recipient_user_id=eq.${userId}` : undefined,
    enabled: !!schoolId && !!userId,
    onChange: invalidate,
  });

  return {
    unreadCount: data.unreadAdminCount,
    unreadAdminCount: data.unreadAdminCount,
    unreadParentCount: data.unreadParentCount,
    loading: isLoading,
  };
}
