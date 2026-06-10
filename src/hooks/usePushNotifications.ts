import { useEffect, useState, useCallback } from "react";
import { supabase, USE_FASTAPI } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";

interface PushNotificationOptions {
  schoolId: string | null;
  userId: string | null;
  enabled?: boolean;
}

export function usePushNotifications({ schoolId, userId, enabled = true }: PushNotificationOptions) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);

  // Check if notifications are supported
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  // Request permission
  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch {
      return false;
    }
  }, [supported]);

  // Show notification
  const showNotification = useCallback((title: string, body: string, options?: { 
    icon?: string; 
    tag?: string; 
    onClick?: () => void;
  }) => {
    if (!supported || permission !== "granted") return null;

    try {
      const notification = new Notification(title, {
        body,
        icon: options?.icon || "/favicon.ico",
        tag: options?.tag || "message",
        requireInteraction: false,
        silent: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        options?.onClick?.();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      return notification;
    } catch {
      return null;
    }
  }, [supported, permission]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!enabled || !schoolId || !userId || permission !== "granted") return;

    const channel = supabase
      .channel(`push-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_message_recipients",
          filter: `recipient_user_id=eq.${userId}`,
        },
        async (payload) => {
          let message: { content: string; sender_user_id: string } | null = null;
          let senderName = "Someone";

          if (USE_FASTAPI) {
            try {
              const msgResp = await apiClient.get<any>(`/messages/${payload.new.message_id}`);
              message = msgResp.data;
              if (message) {
                const profileResp = await apiClient.get<any>(`/auth/profiles/${message.sender_user_id}`);
                senderName = profileResp.data.display_name || profileResp.data.full_name || "Someone";
              }
            } catch (err) {
              console.error("Failed to fetch notification details from FastAPI", err);
            }
          } else {
            const { data: msgData } = await supabase
              .from("admin_messages")
              .select("content, sender_user_id")
              .eq("id", payload.new.message_id)
              .maybeSingle();
            message = msgData;

            if (message) {
              const { data: senderProfile } = await (supabase as any)
                .from("profiles")
                .select("display_name")
                .eq("id", message.sender_user_id)
                .maybeSingle();
              senderName = senderProfile?.display_name || "Someone";
            }
          }

          if (!message) return;

          const preview = message.content.length > 50 
            ? message.content.substring(0, 50) + "..." 
            : message.content;

          showNotification(`New message from ${senderName}`, preview, {
            tag: `message-${payload.new.message_id}`,
            onClick: () => {
              // Focus on messages - could navigate to specific conversation
              window.focus();
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, schoolId, userId, permission, showNotification]);

  return {
    supported,
    permission,
    requestPermission,
    showNotification,
    isEnabled: supported && permission === "granted",
  };
}
