import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { RealtimeChannel } from "@/lib/api";

interface TypingUser {
  user_id: string;
  display_name: string;
  typing_at: string;
}

interface UseTypingIndicatorOptions {
  schoolId: string;
  conversationPartnerId: string;
  currentUserId: string;
  currentUserName: string;
}

export function useTypingIndicator({
  schoolId,
  conversationPartnerId,
  currentUserId,
  currentUserName,
}: UseTypingIndicatorOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Clean up stale typing indicators (older than 3 seconds)
  const cleanupStaleTyping = useCallback(() => {
    setTypingUsers((prev) =>
      prev.filter((u) => Date.now() - new Date(u.typing_at).getTime() < 3000)
    );
  }, []);

  useEffect(() => {
    if (!schoolId || !conversationPartnerId || !currentUserId) return;

    // Create a unique channel for this conversation pair
    const channelName = `typing:${schoolId}:${[currentUserId, conversationPartnerId].sort().join("-")}`;
    
    const channel = api.channel(channelName, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string; display_name: string; typing_at: string }>();
        const typingList: TypingUser[] = [];
        
        Object.values(state).forEach((presences) => {
          presences.forEach((presence) => {
            if (presence.user_id !== currentUserId) {
              typingList.push({
                user_id: presence.user_id,
                display_name: presence.display_name,
                typing_at: presence.typing_at,
              });
            }
          });
        });
        
        setTypingUsers(typingList);
      })
      .subscribe();

    channelRef.current = channel;

    // Cleanup stale typing indicators periodically
    const cleanupInterval = setInterval(cleanupStaleTyping, 1000);

    return () => {
      clearInterval(cleanupInterval);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [schoolId, conversationPartnerId, currentUserId, cleanupStaleTyping]);

  const startTyping = useCallback(() => {
    if (!channelRef.current || isTypingRef.current) return;
    
    isTypingRef.current = true;
    channelRef.current.track({
      user_id: currentUserId,
      display_name: currentUserName,
      typing_at: new Date().toISOString(),
    });
  }, [currentUserId, currentUserName]);

  const stopTyping = useCallback(() => {
    if (!channelRef.current || !isTypingRef.current) return;
    
    isTypingRef.current = false;
    channelRef.current.untrack();
  }, []);

  const handleTyping = useCallback(() => {
    startTyping();
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 2000);
  }, [startTyping, stopTyping]);

  const isPartnerTyping = typingUsers.some((u) => u.user_id === conversationPartnerId);

  return {
    typingUsers,
    isPartnerTyping,
    handleTyping,
    stopTyping,
  };
}
