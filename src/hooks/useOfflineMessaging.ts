import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  cacheConversations,
  getCachedConversations,
  updateCachedConversation,
  cacheMessages,
  getCachedMessages,
  addPendingMessage,
  markMessageSynced,
  getPendingMessages,
  cacheContacts,
  getCachedContacts,
  clearMessagesForConversation,
  addToOfflineQueue,
  getPendingQueueItems,
  markQueueItemSynced,
  CachedConversation,
  CachedMessage,
  CachedContact,
} from "@/lib/offline-db";

interface Conversation {
  id: string;
  recipientId: string;
  recipientName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isGroup: boolean;
  hasAttachment?: boolean;
  lastSenderName?: string;
  isSentByMe?: boolean;
}

interface ChatMessage {
  id: string;
  content: string;
  sender_user_id: string;
  created_at: string;
  is_mine: boolean;
  is_read: boolean;
  attachment_urls?: string[];
  subject?: string;
  reply_to_id?: string;
  isPending?: boolean;
}

interface UserEntry {
  user_id: string;
  display_name: string;
  email?: string;
  role?: string;
  canMessage?: boolean;
}

interface UseOfflineMessagingOptions {
  schoolId: string;
  userId: string | null;
  enabled?: boolean;
}

export function useOfflineMessaging({
  schoolId,
  userId,
  enabled = true,
}: UseOfflineMessagingOptions) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const syncInProgress = useRef(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (enabled) syncPendingMessages();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled]);

  // Load pending count on mount
  useEffect(() => {
    if (!schoolId) return;
    getPendingMessages(schoolId).then((msgs) => setPendingCount(msgs.length));
  }, [schoolId]);

  // Cache conversations when online
  const prefetchAndCacheConversations = useCallback(async (
    conversations: Conversation[]
  ) => {
    if (!schoolId) return;
    
    const cached: CachedConversation[] = conversations.map((c) => ({
      id: c.recipientId,
      schoolId,
      recipientId: c.recipientId,
      recipientName: c.recipientName,
      lastMessage: c.lastMessage,
      lastMessageTime: c.lastMessageTime,
      unreadCount: c.unreadCount,
      hasAttachment: c.hasAttachment || false,
      lastSenderName: c.lastSenderName || "",
      isSentByMe: c.isSentByMe || false,
      cachedAt: Date.now(),
    }));
    
    await cacheConversations(cached);
  }, [schoolId]);

  // Get cached conversations when offline
  const getOfflineConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!schoolId) return [];
    
    const cached = await getCachedConversations(schoolId);
    return cached.map((c) => ({
      id: c.recipientId,
      recipientId: c.recipientId,
      recipientName: c.recipientName,
      lastMessage: c.lastMessage,
      lastMessageTime: c.lastMessageTime,
      unreadCount: c.unreadCount,
      isGroup: false,
      hasAttachment: c.hasAttachment,
      lastSenderName: c.lastSenderName,
      isSentByMe: c.isSentByMe,
    }));
  }, [schoolId]);

  // Cache messages for a conversation
  const prefetchAndCacheMessages = useCallback(async (
    partnerId: string,
    messages: ChatMessage[]
  ) => {
    if (!schoolId) return;
    
    const cached: CachedMessage[] = messages.map((m) => ({
      id: m.id,
      schoolId,
      conversationPartnerId: partnerId,
      content: m.content,
      senderUserId: m.sender_user_id,
      createdAt: m.created_at,
      isMine: m.is_mine,
      isRead: m.is_read,
      attachmentUrls: m.attachment_urls || [],
      subject: m.subject || null,
      replyToId: m.reply_to_id || null,
      cachedAt: Date.now(),
      isPending: m.isPending,
    }));
    
    await cacheMessages(cached);
  }, [schoolId]);

  // Get cached messages when offline
  const getOfflineMessages = useCallback(async (partnerId: string): Promise<ChatMessage[]> => {
    if (!schoolId) return [];
    
    const cached = await getCachedMessages(schoolId, partnerId);
    return cached.map((m) => ({
      id: m.id,
      content: m.content,
      sender_user_id: m.senderUserId,
      created_at: m.createdAt,
      is_mine: m.isMine,
      is_read: m.isRead,
      attachment_urls: m.attachmentUrls,
      subject: m.subject || undefined,
      reply_to_id: m.replyToId || undefined,
      isPending: m.isPending,
    }));
  }, [schoolId]);

  // Cache contacts/users for offline composer
  const prefetchAndCacheContacts = useCallback(async (users: UserEntry[]) => {
    if (!schoolId) return;
    
    const cached: CachedContact[] = users.map((u) => ({
      id: u.user_id,
      schoolId,
      userId: u.user_id,
      displayName: u.display_name,
      email: u.email || null,
      role: u.role || null,
      canMessage: u.canMessage ?? true,
      cachedAt: Date.now(),
    }));
    
    await cacheContacts(cached);
  }, [schoolId]);

  // Get cached contacts when offline
  const getOfflineContacts = useCallback(async (): Promise<UserEntry[]> => {
    if (!schoolId) return [];
    
    const cached = await getCachedContacts(schoolId);
    return cached.map((c) => ({
      user_id: c.userId,
      display_name: c.displayName,
      email: c.email || undefined,
      role: c.role || undefined,
      canMessage: c.canMessage,
    }));
  }, [schoolId]);

  // Send message (works both online and offline)
  const sendMessage = useCallback(async (
    recipientId: string,
    recipientName: string,
    content: string,
    subject: string = "Direct Message",
    replyToId?: string
  ): Promise<{ id: string; isPending: boolean }> => {
    if (!schoolId || !userId) throw new Error("Not authenticated");
    
    const localId = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // Create optimistic message for UI
    const pendingMessage: CachedMessage = {
      id: localId,
      schoolId,
      conversationPartnerId: recipientId,
      content,
      senderUserId: userId,
      createdAt: now,
      isMine: true,
      isRead: false,
      attachmentUrls: [],
      subject,
      replyToId: replyToId || null,
      cachedAt: Date.now(),
      isPending: true,
      localId,
    };
    
    // Add to local cache immediately
    await addPendingMessage(pendingMessage);
    setPendingCount((c) => c + 1);
    
    // Update conversation in cache
    await updateCachedConversation({
      id: recipientId,
      schoolId,
      recipientId,
      recipientName,
      lastMessage: content.substring(0, 40) + (content.length > 40 ? "…" : ""),
      lastMessageTime: now,
      unreadCount: 0,
      hasAttachment: false,
      lastSenderName: "You",
      isSentByMe: true,
    });
    
    if (navigator.onLine) {
      // Try to send immediately
      try {
        const { data: message, error: msgError } = await api
          .from("admin_messages")
          .insert({
            school_id: schoolId,
            sender_user_id: userId,
            subject,
            content,
            priority: "normal",
            reply_to_id: replyToId || null,
            created_by: userId,
          })
          .select("id")
          .single();
        
        if (msgError) throw msgError;
        
        const { error: recError } = await api
          .from("admin_message_recipients")
          .insert({
            message_id: message.id,
            recipient_user_id: recipientId,
          });
        
        if (recError) throw recError;
        
        // Mark as synced
        await markMessageSynced(localId, message.id);
        setPendingCount((c) => Math.max(0, c - 1));
        
        return { id: message.id, isPending: false };
      } catch (error) {
        console.error("Failed to send message online, queueing:", error);
        // Fall through to queue
      }
    }
    
    // Queue for later sync
    await addToOfflineQueue({
      type: "message",
      data: {
        recipient_user_ids: [recipientId],
        subject,
        content,
        priority: "normal",
        reply_to_id: replyToId,
        local_id: localId,
      },
      priority: "high",
    });
    
    toast.info("Message saved. Will send when online.");
    return { id: localId, isPending: true };
  }, [schoolId, userId]);

  // Sync pending messages
  const syncPendingMessages = useCallback(async () => {
    if (!schoolId || !userId || syncInProgress.current || !navigator.onLine) return;
    
    syncInProgress.current = true;
    setIsSyncing(true);
    
    try {
      const pending = await getPendingQueueItems();
      const messagesToSync = pending.filter((item) => item.type === "message" && !item.synced);
      
      if (messagesToSync.length === 0) {
        setIsSyncing(false);
        syncInProgress.current = false;
        return;
      }
      
      let syncedCount = 0;
      
      for (const item of messagesToSync) {
        if (item.retryCount >= 5) continue;
        
        try {
          const { recipient_user_ids, subject, content, priority, local_id } = item.data as any;
          
          const { data: message, error: msgError } = await api
            .from("admin_messages")
            .insert({
              school_id: schoolId,
              sender_user_id: userId,
              subject,
              content,
              priority: priority || "normal",
              created_by: userId,
            })
            .select("id")
            .single();
          
          if (msgError) throw msgError;
          
          const recipients = (recipient_user_ids as string[]).map((recipientId) => ({
            message_id: message.id,
            recipient_user_id: recipientId,
          }));
          
          const { error: recError } = await api
            .from("admin_message_recipients")
            .insert(recipients);
          
          if (recError) throw recError;
          
          await markQueueItemSynced(item.id);
          
          if (local_id) {
            await markMessageSynced(local_id, message.id);
          }
          
          syncedCount++;
        } catch (error) {
          console.error("Failed to sync message:", error);
        }
      }
      
      if (syncedCount > 0) {
        toast.success(`Sent ${syncedCount} queued message${syncedCount > 1 ? "s" : ""}`);
      }
      
      const remaining = await getPendingMessages(schoolId);
      setPendingCount(remaining.length);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
    }
  }, [schoolId, userId]);

  // Clear conversation cache
  const clearConversationCache = useCallback(async (partnerId: string) => {
    if (!schoolId) return;
    await clearMessagesForConversation(schoolId, partnerId);
  }, [schoolId]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    prefetchAndCacheConversations,
    getOfflineConversations,
    prefetchAndCacheMessages,
    getOfflineMessages,
    prefetchAndCacheContacts,
    getOfflineContacts,
    sendMessage,
    syncPendingMessages,
    clearConversationCache,
  };
}
