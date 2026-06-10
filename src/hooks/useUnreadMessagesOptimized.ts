import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { useRealtimeTable } from "@/hooks/useRealtime";

interface UnreadMessagesResult {
  unreadCount: number;
  loading: boolean;
}

export function useUnreadMessagesOptimized(
  schoolId: string | null,
  userId: string | null
): UnreadMessagesResult {
  const queryClient = useQueryClient();

  const { data: unreadCount = 0, isLoading } = useQuery({
    queryKey: ["unread_messages", schoolId, userId],
    queryFn: async () => {
      if (!schoolId || !userId) return 0;

      if (USE_FASTAPI) {
        const resp = await apiClient.get<{ count: number }>("/messages/unread-count");
        return resp.data.count;
      } else {
        const { count } = await supabase
          .from("admin_message_recipients")
          .select("id, admin_messages!inner(school_id)", { count: "exact", head: true })
          .eq("recipient_user_id", userId)
          .eq("is_read", false)
          .eq("admin_messages.school_id", schoolId);

        return count || 0;
      }
    },
    enabled: !!schoolId && !!userId,
    staleTime: 10 * 1000, // Cache for 10 seconds
    gcTime: 30 * 1000,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["unread_messages", schoolId, userId] });
  }, [queryClient, schoolId, userId]);

  // Realtime subscription
  useRealtimeTable({
    channel: `unread-messages-optimized-${schoolId}-${userId}`,
    table: "admin_message_recipients",
    filter: userId ? `recipient_user_id=eq.${userId}` : undefined,
    enabled: !!schoolId && !!userId,
    onChange: invalidate,
  });

  return { unreadCount, loading: isLoading };
}
