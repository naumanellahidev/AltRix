import { useEffect, useState, useCallback } from "react";
import { supabase, USE_FASTAPI, setUseFastAPI } from "@/integrations/supabase/client";
import { apiClient, isNetworkOrProxyError } from "@/lib/api-client";

interface UnreadMessagesResult {
  unreadCount: number;
  loading: boolean;
}

export function useUnreadMessages(schoolId: string | null): UnreadMessagesResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        setLoading(false);
        return;
      }
      setUserId(user.user.id);

      let count = 0;
      const runSupabaseCount = async () => {
        const { count: c } = await supabase
          .from("admin_message_recipients")
          .select("id, admin_messages!inner(school_id)", { count: "exact", head: true })
          .eq("recipient_user_id", user.user.id)
          .eq("is_read", false)
          .eq("admin_messages.school_id", schoolId);
        return c || 0;
      };

      let useFastApiActive = USE_FASTAPI;
      if (useFastApiActive) {
        try {
          const resp = await apiClient.get<{ count: number }>("/messages/unread-count");
          count = resp.data.count;
        } catch (apiErr: any) {
          if (isNetworkOrProxyError(apiErr)) {
            console.warn("Failed to fetch unread message count via FastAPI, falling back to Supabase", apiErr);
            setUseFastAPI(false);
            useFastApiActive = false;
          } else {
            throw apiErr;
          }
        }
      }

      if (!useFastApiActive) {
        count = await runSupabaseCount();
      }

      setUnreadCount(count);
    } catch (err) {
      console.error("Error fetching unread messages:", err);
    }

    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Realtime subscription for message recipient changes (new messages and read status updates)
  useEffect(() => {
    if (!schoolId || !userId) return;

    const channel = supabase
      .channel(`unread-messages-rt-${schoolId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_message_recipients",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          void fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, userId, fetchUnreadCount]);

  return { unreadCount, loading };
}
