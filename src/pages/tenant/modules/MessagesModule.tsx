import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import {
  Send,
  Search,
  Check,
  CheckCheck,
  Paperclip,
  FileText,
  Download,
  X,
  Loader2,
  Plus,
  ArrowLeft,
  Trash2,
  MessageCircle,
  Reply,
  CornerDownRight,
  AlertCircle,
  Forward,
  Clock,
  CalendarClock,
  WifiOff,
  CloudOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useUserRole } from "@/hooks/useUserRole";
import { useOfflineMessaging } from "@/hooks/useOfflineMessaging";
import {
  ReplyPreview,
  ReplyIndicator,
  TypingIndicator,
} from "@/components/messages/MessageThreadComponents";
import { MessageSearchDialog } from "@/components/messages/MessageSearchDialog";
import { ReadReceiptIndicator } from "@/components/messages/ReadReceiptIndicator";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { PushNotificationBanner } from "@/components/messages/PushNotificationBanner";
import { MessageReactions, PinnedMessagesCount } from "@/components/messages/MessageReactions";
import { DeleteConversationDialog, type DeleteMode } from "@/components/messages/DeleteConversationDialog";
import { ScheduleMessageDialog } from "@/components/messages/ScheduleMessageDialog";
import { ScheduledMessagesTab } from "@/components/messages/ScheduledMessagesTab";

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
  isPending?: boolean; // Offline pending message
}

interface UserEntry {
  user_id: string;
  display_name: string;
  email?: string;
  role?: string;
  canMessage?: boolean;
}

interface Props {
  schoolId: string;
  isStudentPortal?: boolean;
}

export function MessagesModule({ schoolId, isStudentPortal = false }: Props) {
  const isMobile = useIsMobile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<UserEntry[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [newChatSearch, setNewChatSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [messageReadStatus, setMessageReadStatus] = useState<Record<string, { is_read: boolean; read_at: string | null }>>({});
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardSending, setForwardSending] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<"inbox" | "scheduled">("inbox");
  // Map of partner_user_id -> cleared_at timestamp (to filter old messages)
  const [clearedConversations, setClearedConversations] = useState<Map<string, string>>(new Map());
  const [scheduledCount, setScheduledCount] = useState(0);

  // Get current user's role for restrictions
  const { isStudent, isStaff, loading: roleLoading } = useUserRole(schoolId, currentUserId);

  // Offline messaging hook
  const offlineMessaging = useOfflineMessaging({
    schoolId,
    userId: currentUserId,
    enabled: true,
  });

  // Push notifications hook
  const { supported: pushSupported, permission: pushPermission, requestPermission } = usePushNotifications({
    schoolId,
    userId: currentUserId,
    enabled: true,
  });

  // Typing indicator hook
  const { isPartnerTyping, handleTyping, stopTyping } = useTypingIndicator({
    schoolId,
    conversationPartnerId: selectedConversation?.recipientId || "",
    currentUserId: currentUserId || "",
    currentUserName,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setLoading(false);
      return;
    }
    setCurrentUserId(user.user.id);

    // Fetch current user's display name for typing indicator
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.user.id)
      .maybeSingle();
    setCurrentUserName(profile?.display_name || user.user.email || "User");

    // Fetch cleared conversations for this user (with timestamp to filter old messages)
    const { data: clearedRows } = await supabase
      .from("cleared_conversations")
      .select("partner_user_id, cleared_at")
      .eq("school_id", schoolId)
      .eq("user_id", user.user.id);
    
    // Map of partner_user_id -> cleared_at timestamp
    const clearedMap = new Map<string, string>();
    (clearedRows || []).forEach((r) => {
      if (r.partner_user_id && r.cleared_at) {
        clearedMap.set(r.partner_user_id, r.cleared_at);
      }
    });
    setClearedConversations(clearedMap);

    // Fetch scheduled messages count
    const { count: schedCount } = await supabase
      .from("scheduled_messages")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("sender_user_id", user.user.id)
      .eq("status", "pending");
    setScheduledCount(schedCount || 0);

    // Fetch all messages where user is sender
    const { data: sentMessages } = await supabase
      .from("admin_messages")
      .select("*, admin_message_recipients(recipient_user_id, is_read)")
      .eq("school_id", schoolId)
      .eq("sender_user_id", user.user.id)
      .order("created_at", { ascending: false });

    // Fetch messages received
    const { data: receivedRows } = await supabase
      .from("admin_message_recipients")
      .select("message_id, is_read, admin_messages!inner(*)")
      .eq("recipient_user_id", user.user.id)
      .eq("admin_messages.school_id", schoolId);

    // Collect unique user IDs
    const userIds = new Set<string>();
    sentMessages?.forEach((m) => {
      m.admin_message_recipients?.forEach((r: any) => userIds.add(r.recipient_user_id));
    });
    receivedRows?.forEach((r) => {
      const msg = r.admin_messages as any;
      if (msg?.sender_user_id) userIds.add(msg.sender_user_id);
    });

    // Fetch profiles
    const map: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", Array.from(userIds));

      profiles?.forEach((p) => {
        if (p.user_id && p.display_name) map[p.user_id] = p.display_name;
      });

      const missingIds = Array.from(userIds).filter((id) => !map[id]);
      if (missingIds.length > 0) {
        const { data: directoryEntries } = await supabase
          .from("school_user_directory")
          .select("user_id, display_name, email")
          .eq("school_id", schoolId)
          .in("user_id", missingIds);

        directoryEntries?.forEach((d) => {
          if (d.user_id) map[d.user_id] = d.display_name || d.email || "User";
        });
      }
    }
    setProfileMap(map);

    // Build conversation list grouped by conversation partner
    const conversationMap = new Map<string, Conversation>();

    // From sent messages
    sentMessages?.forEach((m) => {
      const recipients = m.admin_message_recipients || [];
      if (recipients.length === 1) {
        const recipientId = recipients[0].recipient_user_id;
        // Skip if conversation is cleared AND message is before cleared_at
        const clearedAt = clearedMap.get(recipientId);
        if (clearedAt && new Date(m.created_at) <= new Date(clearedAt)) return;
        
        const existing = conversationMap.get(recipientId);
        const hasAttachment = (m as any).attachment_urls && (m as any).attachment_urls.length > 0;
        const msgContent = m.content.substring(0, 40) + (m.content.length > 40 ? "…" : "");
        
        if (!existing || new Date(m.created_at) > new Date(existing.lastMessageTime)) {
          conversationMap.set(recipientId, {
            id: recipientId,
            recipientId,
            recipientName: map[recipientId] || "User",
            lastMessage: hasAttachment && !m.content.trim() ? "Attachment" : msgContent,
            lastMessageTime: m.created_at,
            unreadCount: 0,
            isGroup: false,
            hasAttachment,
            lastSenderName: "You",
            isSentByMe: true,
          });
        }
      }
    });

    // From received messages
    receivedRows?.forEach((r) => {
      const msg = r.admin_messages as any;
      if (!msg) return;
      const senderId = msg.sender_user_id;
      
      // Skip if conversation is cleared AND message is before cleared_at
      const clearedAt = clearedMap.get(senderId);
      if (clearedAt && new Date(msg.created_at) <= new Date(clearedAt)) return;
      
      const existing = conversationMap.get(senderId);
      const isNewer = !existing || new Date(msg.created_at) > new Date(existing.lastMessageTime);
      const hasAttachment = msg.attachment_urls && msg.attachment_urls.length > 0;
      const msgContent = msg.content.substring(0, 40) + (msg.content.length > 40 ? "…" : "");
      const senderName = map[senderId] || "User";
      
      if (!existing) {
        conversationMap.set(senderId, {
          id: senderId,
          recipientId: senderId,
          recipientName: senderName,
          lastMessage: hasAttachment && !msg.content.trim() ? "Attachment" : msgContent,
          lastMessageTime: msg.created_at,
          unreadCount: r.is_read ? 0 : 1,
          isGroup: false,
          hasAttachment,
          lastSenderName: senderName,
          isSentByMe: false,
        });
      } else {
        if (isNewer) {
          existing.lastMessage = hasAttachment && !msg.content.trim() ? "Attachment" : msgContent;
          existing.lastMessageTime = msg.created_at;
          existing.hasAttachment = hasAttachment;
          existing.lastSenderName = senderName;
          existing.isSentByMe = false;
        }
        if (!r.is_read) existing.unreadCount++;
      }
    });

    const convList = Array.from(conversationMap.values()).sort(
      (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

    setConversations(convList);
    
    // Cache conversations for offline use
    if (navigator.onLine && convList.length > 0) {
      offlineMessaging.prefetchAndCacheConversations(convList);
    }
    
    setLoading(false);
  }, [schoolId, offlineMessaging.prefetchAndCacheConversations]);

  const fetchAllUsers = useCallback(async () => {
    // Fetch all users in the school
    const { data } = await supabase
      .from("school_user_directory")
      .select("user_id, display_name, email")
      .eq("school_id", schoolId);

    // For students, we need to filter to only show staff (teachers, principals, etc.)
    // Fetch all user roles to determine who can be messaged
    const userIds = (data || []).map((d) => d.user_id).filter(Boolean);
    
    let roleData: { user_id: string; role: string }[] = [];
    if (userIds.length > 0) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("school_id", schoolId)
        .in("user_id", userIds);
      roleData = (roles || []) as { user_id: string; role: string }[];
    }

    const staffRoles = [
      "super_admin", "school_owner", "principal", "vice_principal",
      "school_admin", "academic_coordinator", "teacher", "accountant", "hr_manager",
      "counselor", "marketing_staff"
    ];

    const users: UserEntry[] = (data || [])
      .filter((d) => d.user_id && d.user_id !== currentUserId)
      .map((d) => {
        const userRoles = roleData.filter((r) => r.user_id === d.user_id);
        const isUserStaff = userRoles.some((r) => staffRoles.includes(r.role));
        const isUserStudent = userRoles.some((r) => r.role === "student") && !isUserStaff;
        
        // Students can only message staff
        // Staff can message anyone
        const canMessage = isStudent ? isUserStaff : true;
        
        return {
          user_id: d.user_id!,
          display_name: d.display_name || d.email || "User",
          email: d.email || undefined,
          role: isUserStaff ? "Staff" : isUserStudent ? "Student" : "Member",
          canMessage,
        };
      });

    setAllUsers(users);
  }, [schoolId, currentUserId, isStudent]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (currentUserId) fetchAllUsers();
  }, [fetchAllUsers, currentUserId]);

  // Handle opening chat from notification (URL param or custom event)
  const [searchParams, setSearchParams] = useSearchParams();
  
  const openChatByMessageId = useCallback(async (messageId: string) => {
    if (!schoolId || !currentUserId) return;
    
    try {
      // Fetch the message to get the sender_user_id
      const { data: message } = await supabase
        .from("admin_messages")
        .select("sender_user_id")
        .eq("id", messageId)
        .single();
      
      if (!message) return;
      
      // Find the partner ID (could be sender or recipient depending on who we are)
      const partnerId = message.sender_user_id === currentUserId 
        ? null // Need to find recipient
        : message.sender_user_id;
      
      let targetPartnerId = partnerId;
      
      if (!targetPartnerId) {
        // We sent this message, find the recipient
        const { data: recipient } = await supabase
          .from("admin_message_recipients")
          .select("recipient_user_id")
          .eq("message_id", messageId)
          .single();
        
        targetPartnerId = recipient?.recipient_user_id || null;
      }
      
      if (!targetPartnerId) return;
      
      // Get partner's name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", targetPartnerId)
        .maybeSingle();
      
      const partnerName = profile?.display_name || "User";
      
      // Create or find conversation and select it
      const conv: Conversation = {
        id: targetPartnerId,
        recipientId: targetPartnerId,
        recipientName: partnerName,
        lastMessage: "",
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
        isGroup: false,
      };
      
      setSelectedConversation(conv);
      await loadConversationMessages(targetPartnerId);
      
      // Clear the search param
      setSearchParams((prev) => {
        prev.delete("open_message");
        return prev;
      });
    } catch (error) {
      console.error("Failed to open chat from notification:", error);
    }
  }, [schoolId, currentUserId, setSearchParams, clearedConversations]);
  
  // Handle URL param on mount and when conversations load
  useEffect(() => {
    const messageId = searchParams.get("open_message");
    if (messageId && currentUserId && !loading) {
      openChatByMessageId(messageId);
    }
  }, [searchParams, currentUserId, loading, openChatByMessageId]);
  
  // Listen for custom event from notification click
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ messageId: string }>) => {
      if (e.detail?.messageId) {
        openChatByMessageId(e.detail.messageId);
      }
    };
    
    window.addEventListener("eduverse:open-chat-from-notification", handleOpenChat as EventListener);
    return () => {
      window.removeEventListener("eduverse:open-chat-from-notification", handleOpenChat as EventListener);
    };
  }, [openChatByMessageId]);

  // Helper to update a single conversation in the list without reloading all
  const updateConversationInList = useCallback((
    senderId: string,
    messageContent: string,
    messageTime: string,
    hasAttachment: boolean,
    incrementUnread: boolean
  ) => {
    setConversations((prev) => {
      const existingIndex = prev.findIndex((c) => c.recipientId === senderId);
      const senderName = profileMap[senderId] || "User";
      const msgContent = messageContent.substring(0, 40) + (messageContent.length > 40 ? "…" : "");
      
      if (existingIndex >= 0) {
        // Update existing conversation
        const updated = [...prev];
        const existing = updated[existingIndex];
        updated[existingIndex] = {
          ...existing,
          lastMessage: hasAttachment && !messageContent.trim() ? "Attachment" : msgContent,
          lastMessageTime: messageTime,
          hasAttachment,
          lastSenderName: senderName,
          isSentByMe: false,
          unreadCount: incrementUnread ? existing.unreadCount + 1 : existing.unreadCount,
        };
        // Re-sort to move this conversation to top
        return updated.sort((a, b) => 
          new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
        );
      } else {
        // New conversation - add to top
        const newConv: Conversation = {
          id: senderId,
          recipientId: senderId,
          recipientName: senderName,
          lastMessage: hasAttachment && !messageContent.trim() ? "Attachment" : msgContent,
          lastMessageTime: messageTime,
          unreadCount: incrementUnread ? 1 : 0,
          isGroup: false,
          hasAttachment,
          lastSenderName: senderName,
          isSentByMe: false,
        };
        return [newConv, ...prev];
      }
    });
  }, [profileMap]);

  // Realtime subscription for read status updates and new messages
  useEffect(() => {
    if (!schoolId || !currentUserId) return;

    const channel = supabase
      .channel(`messages-realtime-${schoolId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_message_recipients",
        },
        (payload) => {
          const newRow = payload.new as { message_id: string; is_read: boolean; read_at: string | null; recipient_user_id: string };
          
          // Update read status in current messages if viewing this message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newRow.message_id && m.is_mine
                ? { ...m, is_read: newRow.is_read }
                : m
            )
          );

          // Update read status map for read receipts
          setMessageReadStatus((prev) => ({
            ...prev,
            [newRow.message_id]: {
              is_read: newRow.is_read,
              read_at: newRow.read_at,
            },
          }));

          // Update unread count in conversations list when marking as read
          if (newRow.recipient_user_id === currentUserId && newRow.is_read) {
            setConversations((prev) =>
              prev.map((c) => {
                // We need to find which conversation this message belongs to
                // For now, we'll decrement unread if it's > 0 for matching messages
                return c;
              })
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_message_recipients",
          filter: `recipient_user_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newRow = payload.new as { message_id: string; recipient_user_id: string };
          
          // Fetch the new message details
          const { data: newMessage } = await supabase
            .from("admin_messages")
            .select("id, content, sender_user_id, created_at, attachment_urls, subject, reply_to_id")
            .eq("id", newRow.message_id)
            .single();
          
          if (!newMessage) return;
          
          const senderId = newMessage.sender_user_id;
          const hasAttachment = newMessage.attachment_urls && newMessage.attachment_urls.length > 0;
          
          // Check if this sender is in the cleared conversations
          const clearedAt = clearedConversations.get(senderId);
          if (clearedAt && new Date(newMessage.created_at) <= new Date(clearedAt)) {
            return; // Skip if message is before cleared timestamp
          }
          
          // Update the conversation list efficiently (just update/add this one conversation)
          const isViewingThisConversation = selectedConversation?.recipientId === senderId;
          updateConversationInList(
            senderId,
            newMessage.content,
            newMessage.created_at,
            hasAttachment,
            !isViewingThisConversation // Only increment unread if not viewing this conversation
          );
          
          // If currently viewing this conversation, add the message directly
          if (isViewingThisConversation) {
            const chatMessage: ChatMessage = {
              id: newMessage.id,
              content: newMessage.content,
              sender_user_id: senderId,
              created_at: newMessage.created_at,
              is_mine: false,
              is_read: false,
              attachment_urls: newMessage.attachment_urls || [],
              subject: newMessage.subject || undefined,
              reply_to_id: newMessage.reply_to_id || undefined,
            };
            
            // Add message to the list if not already present
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMessage.id)) {
                return prev; // Already exists, skip
              }
              return [...prev, chatMessage].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
            
            // Mark as read since we're viewing it
            supabase
              .from("admin_message_recipients")
              .update({ is_read: true, read_at: new Date().toISOString() })
              .eq("message_id", newMessage.id)
              .eq("recipient_user_id", currentUserId)
              .then();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, currentUserId, selectedConversation, clearedConversations, updateConversationInList]);

  const loadConversationMessages = async (partnerId: string) => {
    if (!currentUserId) return;
    setMessagesLoading(true);

    // Check if this conversation was cleared (to filter old messages)
    const clearedAt = clearedConversations.get(partnerId);

    // Get messages sent by me to this partner (with read_at timestamps)
    const { data: sent } = await supabase
      .from("admin_messages")
      .select("*, admin_message_recipients!inner(recipient_user_id, is_read, read_at)")
      .eq("school_id", schoolId)
      .eq("sender_user_id", currentUserId)
      .eq("admin_message_recipients.recipient_user_id", partnerId)
      .order("created_at", { ascending: true });

    // Get messages received from this partner
    const { data: receivedRows } = await supabase
      .from("admin_message_recipients")
      .select("message_id, is_read, read_at, admin_messages!inner(*)")
      .eq("recipient_user_id", currentUserId)
      .eq("admin_messages.sender_user_id", partnerId)
      .eq("admin_messages.school_id", schoolId);

    const chatMessages: ChatMessage[] = [];
    const readStatusMap: Record<string, { is_read: boolean; read_at: string | null }> = {};

    sent?.forEach((m) => {
      // Skip messages before cleared_at timestamp
      if (clearedAt && new Date(m.created_at) <= new Date(clearedAt)) return;
      
      const recipient = (m.admin_message_recipients as any[])?.[0];
      chatMessages.push({
        id: m.id,
        content: m.content,
        sender_user_id: m.sender_user_id,
        created_at: m.created_at,
        is_mine: true,
        is_read: recipient?.is_read || false,
        attachment_urls: (m as any).attachment_urls || [],
        subject: m.subject,
        reply_to_id: (m as any).reply_to_id || undefined,
      });
      // Store read status with timestamp
      readStatusMap[m.id] = {
        is_read: recipient?.is_read || false,
        read_at: recipient?.read_at || null,
      };
    });

    receivedRows?.forEach((r) => {
      const msg = r.admin_messages as any;
      if (!msg) return;
      // Skip messages before cleared_at timestamp
      if (clearedAt && new Date(msg.created_at) <= new Date(clearedAt)) return;
      
      chatMessages.push({
        id: msg.id,
        content: msg.content,
        sender_user_id: msg.sender_user_id,
        created_at: msg.created_at,
        is_mine: false,
        is_read: r.is_read,
        attachment_urls: msg.attachment_urls || [],
        subject: msg.subject,
        reply_to_id: msg.reply_to_id || undefined,
      });
    });

    chatMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Mark received messages as read
    for (const msg of chatMessages.filter((m) => !m.is_mine && !m.is_read)) {
      await supabase
        .from("admin_message_recipients")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("message_id", msg.id)
        .eq("recipient_user_id", currentUserId);
    }

    setMessages(chatMessages);
    setMessageReadStatus(readStatusMap);
    setMessagesLoading(false);

    // Update unread count in conversation
    setConversations((prev) =>
      prev.map((c) => (c.recipientId === partnerId ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    loadConversationMessages(conv.recipientId);
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && attachments.length === 0) || !currentUserId || !selectedConversation) return;

    const sentContent = messageText.trim() || "[Attachment]";
    const sentTime = new Date().toISOString();
    const hasAttachmentFlag = attachments.length > 0;
    
    setSending(true);
    try {
      // Upload attachments if any
      let attachmentUrls: string[] = [];
      if (attachments.length > 0) {
        for (const file of attachments) {
          const fileName = `${currentUserId}/${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("message-attachments")
            .upload(fileName, file);
          if (!uploadError) {
            attachmentUrls.push(fileName);
          }
        }
      }

      const { data: messageData, error: messageError } = await supabase
        .from("admin_messages")
        .insert({
          school_id: schoolId,
          sender_user_id: currentUserId,
          subject: replyingTo ? "Reply" : "Direct Message",
          content: sentContent,
          priority: "normal",
          status: "sent",
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
          reply_to_id: replyingTo?.id || null,
        })
        .select("id, created_at")
        .single();

      if (messageError) throw messageError;

      await supabase.from("admin_message_recipients").insert({
        message_id: messageData.id,
        recipient_user_id: selectedConversation.recipientId,
      });

      // Add notification
      await supabase.from("app_notifications").insert({
        school_id: schoolId,
        user_id: selectedConversation.recipientId,
        title: replyingTo ? "New Reply" : "New Message",
        body: sentContent.substring(0, 100) || "Sent you an attachment",
        type: "admin_message",
      });

      // Add message directly to current chat (optimistic update)
      const newChatMessage: ChatMessage = {
        id: messageData.id,
        content: sentContent,
        sender_user_id: currentUserId,
        created_at: messageData.created_at,
        is_mine: true,
        is_read: false,
        attachment_urls: attachmentUrls,
        subject: replyingTo ? "Reply" : "Direct Message",
        reply_to_id: replyingTo?.id || undefined,
      };
      
      setMessages((prev) => [...prev, newChatMessage]);
      
      // Update conversation list efficiently (move to top, update last message)
      setConversations((prev) => {
        const existingIndex = prev.findIndex((c) => c.recipientId === selectedConversation.recipientId);
        const msgPreview = sentContent.substring(0, 40) + (sentContent.length > 40 ? "…" : "");
        
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastMessage: hasAttachmentFlag && !sentContent.trim() ? "Attachment" : msgPreview,
            lastMessageTime: messageData.created_at,
            hasAttachment: hasAttachmentFlag,
            lastSenderName: "You",
            isSentByMe: true,
          };
          // Move to top
          return updated.sort((a, b) => 
            new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
          );
        }
        return prev;
      });

      setMessageText("");
      setAttachments([]);
      setReplyingTo(null);
      stopTyping();
    } catch (error: any) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleStartNewChat = async () => {
    if (selectedUsers.length === 0 || !currentUserId) return;

    setSending(true);
    try {
      const recipientId = selectedUsers[0];
      
      // Check if conversation already exists
      const existingConv = conversations.find((c) => c.recipientId === recipientId);
      if (existingConv) {
        setSelectedConversation(existingConv);
        loadConversationMessages(recipientId);
        setShowNewChat(false);
        setSelectedUsers([]);
        setNewChatSearch("");
        setSending(false);
        return;
      }

      // Create new conversation with first message
      const newConv: Conversation = {
        id: recipientId,
        recipientId,
        recipientName: allUsers.find((u) => u.user_id === recipientId)?.display_name || "User",
        lastMessage: "",
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
        isGroup: false,
      };

      setConversations((prev) => [newConv, ...prev]);
      setSelectedConversation(newConv);
      setMessages([]);
      setShowNewChat(false);
      setSelectedUsers([]);
      setNewChatSearch("");
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async (conv: Conversation, mode: DeleteMode = "clear_for_me") => {
    if (!currentUserId) return;
    
    try {
      if (mode === "clear_for_me") {
        // "Clear for me" - just mark this conversation as cleared for the current user
        // The conversation will be hidden from their view but preserved for the other party
        const { error } = await supabase
          .from("cleared_conversations")
          .upsert({
            school_id: schoolId,
            user_id: currentUserId,
            partner_user_id: conv.recipientId,
            cleared_at: new Date().toISOString(),
          }, { onConflict: "school_id,user_id,partner_user_id" });

        if (error) throw error;
        
        // Update local cleared map with timestamp
        const clearedAt = new Date().toISOString();
        setClearedConversations((prev) => new Map([...prev, [conv.recipientId, clearedAt]]));
      } else {
        // "Delete for everyone" - permanently delete messages I sent
        const { data: sentRows, error: sentRowsError } = await supabase
          .from("admin_messages")
          .select("id, admin_message_recipients!inner(recipient_user_id)")
          .eq("school_id", schoolId)
          .eq("sender_user_id", currentUserId)
          .eq("admin_message_recipients.recipient_user_id", conv.recipientId);

        if (sentRowsError) throw sentRowsError;

        const sentIds = (sentRows || []).map((r) => r.id).filter(Boolean);
        if (sentIds.length > 0) {
          const { error: deleteSentError } = await supabase
            .from("admin_messages")
            .delete()
            .in("id", sentIds)
            .eq("sender_user_id", currentUserId);
          if (deleteSentError) throw deleteSentError;
        }

        // Also delete received message links (clears from my view)
        const { data: receivedLinks, error: receivedLinksError } = await supabase
          .from("admin_message_recipients")
          .select("id, message_id, admin_messages!inner(sender_user_id, school_id)")
          .eq("recipient_user_id", currentUserId)
          .eq("admin_messages.sender_user_id", conv.recipientId)
          .eq("admin_messages.school_id", schoolId);

        if (receivedLinksError) throw receivedLinksError;

        const receivedLinkIds = (receivedLinks || []).map((r) => r.id).filter(Boolean);
        if (receivedLinkIds.length > 0) {
          const { error: deleteReceivedError } = await supabase
            .from("admin_message_recipients")
            .delete()
            .in("id", receivedLinkIds)
            .eq("recipient_user_id", currentUserId);
          if (deleteReceivedError) throw deleteReceivedError;
        }
      }

      toast({ 
        title: mode === "delete_for_everyone" ? "Conversation deleted" : "Chat cleared" 
      });
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (selectedConversation?.id === conv.id) {
        setSelectedConversation(null);
        setMessages([]);
      }
    } catch (error: any) {
      console.error("Delete conversation error:", error);
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    }
  };

  // Handle scheduling a message
  const handleScheduleMessage = async (scheduledAt: Date) => {
    if (!messageText.trim() || !currentUserId || !selectedConversation) {
      throw new Error("Missing message content or recipient");
    }

    const { error } = await supabase
      .from("scheduled_messages")
      .insert({
        school_id: schoolId,
        sender_user_id: currentUserId,
        recipient_user_ids: [selectedConversation.recipientId],
        subject: null,
        content: messageText.trim(),
        scheduled_at: scheduledAt.toISOString(),
        message_type: "admin",
      });

    if (error) throw error;

    setMessageText("");
    setScheduledCount((prev) => prev + 1);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + attachments.length > 5) {
      toast({ title: "Max 5 attachments", variant: "destructive" });
      return;
    }
    setAttachments((prev) => [...prev, ...files].slice(0, 5));
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadAttachment = async (path: string) => {
    const { data } = await supabase.storage.from("message-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const parseDateSafe = (dateStr: string) => {
    const d = parseISO(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatMessageTime = (dateStr: string) => {
    const date = parseDateSafe(dateStr);
    if (!date) return "";
    // Date is shown via the day separator; keep bubbles consistent.
    return format(date, "h:mm a");
  };

  const formatConversationTime = (dateStr: string) => {
    const date = parseDateSafe(dateStr);
    if (!date) return "";
    if (isToday(date)) return format(date, "h:mm a");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMM d");
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.recipientName.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const filteredNewChatUsers = useMemo(() => {
    let users = allUsers;
    
    // Filter to only show users that can be messaged
    if (isStudent) {
      users = users.filter((u) => u.canMessage !== false);
    }
    
    if (!newChatSearch) return users;
    const q = newChatSearch.toLowerCase();
    return users.filter(
      (u) => u.display_name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [allUsers, newChatSearch, isStudent]);

  const filteredForwardUsers = useMemo(() => {
    let users = allUsers.filter((u) => u.user_id !== currentUserId);
    
    if (isStudent) {
      users = users.filter((u) => u.canMessage !== false);
    }
    
    if (!forwardSearch) return users;
    const q = forwardSearch.toLowerCase();
    return users.filter(
      (u) => u.display_name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [allUsers, forwardSearch, isStudent, currentUserId]);

  const handleForwardMessage = async (recipientId: string) => {
    if (!forwardingMessage || !currentUserId) return;
    
    setForwardSending(true);
    try {
      // Strip any existing forwarded prefix to avoid stacking labels
      const cleanContent = forwardingMessage.content.replace(/^(📤 Forwarded message:\n\n)+/g, "");
      const forwardedContent = `📤 Forwarded message:\n\n${cleanContent}`;
      
      const { data: newMsg, error } = await supabase
        .from("admin_messages")
        .insert({
          school_id: schoolId,
          sender_user_id: currentUserId,
          subject: forwardingMessage.subject ? `Fwd: ${forwardingMessage.subject}` : null,
          content: forwardedContent,
          attachment_urls: forwardingMessage.attachment_urls || [],
        })
        .select("id, created_at")
        .single();

      if (error) throw error;

      await supabase.from("admin_message_recipients").insert({
        message_id: newMsg.id,
        recipient_user_id: recipientId,
      });

      // Create notification
      await supabase.from("app_notifications").insert({
        school_id: schoolId,
        user_id: recipientId,
        type: "message",
        title: "New message",
        body: `${currentUserName} forwarded a message to you`,
        entity_type: "admin_message",
        entity_id: newMsg.id,
        created_by: currentUserId,
      });

      // Update conversation list efficiently
      const hasAttachmentFlag = (forwardingMessage.attachment_urls?.length || 0) > 0;
      setConversations((prev) => {
        const existingIndex = prev.findIndex((c) => c.recipientId === recipientId);
        const recipientName = profileMap[recipientId] || allUsers.find(u => u.user_id === recipientId)?.display_name || "User";
        const msgPreview = forwardedContent.substring(0, 40) + (forwardedContent.length > 40 ? "…" : "");
        
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            lastMessage: hasAttachmentFlag && !forwardedContent.trim() ? "Attachment" : msgPreview,
            lastMessageTime: newMsg.created_at,
            hasAttachment: hasAttachmentFlag,
            lastSenderName: "You",
            isSentByMe: true,
          };
          return updated.sort((a, b) => 
            new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
          );
        } else {
          // New conversation
          const newConv: Conversation = {
            id: recipientId,
            recipientId,
            recipientName,
            lastMessage: hasAttachmentFlag && !forwardedContent.trim() ? "Attachment" : msgPreview,
            lastMessageTime: newMsg.created_at,
            unreadCount: 0,
            isGroup: false,
            hasAttachment: hasAttachmentFlag,
            lastSenderName: "You",
            isSentByMe: true,
          };
          return [newConv, ...prev];
        }
      });

      toast({ title: "Message forwarded successfully" });
      setForwardingMessage(null);
      setForwardSearch("");
    } catch (err: any) {
      toast({ title: "Failed to forward message", description: err.message, variant: "destructive" });
    } finally {
      setForwardSending(false);
    }
  };

  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + c.unreadCount, 0), [conversations]);

  // Mobile: show conversation list or chat view
  const showChatOnMobile = isMobile && selectedConversation;

  return (
    <div className="space-y-5">
      {/* Premium hero header */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-500/10 via-background to-background p-5 md:p-6">
        <div className="absolute -top-20 -right-12 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400 font-semibold">
                Direct Messages
              </p>
              <h2 className="font-display text-2xl font-bold tracking-tight truncate">Conversations</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time chats with staff, parents and students
                {totalUnread > 0 && <span className="text-primary font-semibold"> · {totalUnread} unread</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Push Notification Banner */}
      <PushNotificationBanner
        permission={pushPermission}
        supported={pushSupported}
        onRequestPermission={requestPermission}
      />

      <div className="flex h-[calc(100vh-16rem)] max-h-[calc(100dvh-14rem)] min-h-[400px] overflow-hidden rounded-2xl border bg-background shadow-elevated sm:h-[calc(100vh-16rem)]">
      {/* Conversation List */}
      <div
        className={cn(
          "flex w-full flex-col border-r lg:w-80",
          showChatOnMobile && "hidden lg:flex"
        )}
      >
        {/* Header with Tabs */}
        <div className="flex flex-col border-b">
          <div className="flex items-center justify-between p-3 pb-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Messages</h2>
              {totalUnread > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New Conversation</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search users..."
                      value={newChatSearch}
                      onChange={(e) => setNewChatSearch(e.target.value)}
                    />
                    {isStudent && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Students can only message teachers and staff members.</span>
                      </div>
                    )}
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {filteredNewChatUsers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                            <p className="mt-2 text-sm text-muted-foreground">
                              {isStudent ? "No staff members found" : "No users found"}
                            </p>
                          </div>
                        ) : (
                          filteredNewChatUsers.map((user) => (
                            <button
                              key={user.user_id}
                              onClick={() => {
                                setSelectedUsers([user.user_id]);
                                handleStartNewChat();
                              }}
                              className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                            >
                              <Avatar className="h-10 w-10">
                                <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium">{user.display_name}</p>
                                  {user.role && (
                                    <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
                                      {user.role}
                                    </Badge>
                                  )}
                                </div>
                                {user.email && (
                                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                )}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
              <MessageSearchDialog
                schoolId={schoolId}
                currentUserId={currentUserId || ""}
                profileMap={profileMap}
                onSelectMessage={(messageId, partnerId) => {
                  setActiveTab("inbox");
                  if (partnerId) {
                    const conv = conversations.find(c => c.recipientId === partnerId);
                    if (conv) {
                      handleSelectConversation(conv);
                      setTimeout(() => {
                        const el = document.getElementById(`msg-${messageId}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.classList.add("ring-2", "ring-primary", "ring-offset-2");
                        setTimeout(() => el?.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2000);
                      }, 500);
                    }
                  }
                }}
              />
            </div>
          </div>
          
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "inbox" | "scheduled")} className="w-full">
            <TabsList className="w-full justify-start rounded-none border-0 bg-transparent h-10 p-0 px-3">
              <TabsTrigger 
                value="inbox" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3"
              >
                Inbox
              </TabsTrigger>
              <TabsTrigger 
                value="scheduled" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3"
              >
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                Scheduled
                {scheduledCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                    {scheduledCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Search - only show in inbox tab */}
        {activeTab === "inbox" && (
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        )}

        {/* Scheduled Messages Tab */}
        {activeTab === "scheduled" && (
          <ScheduledMessagesTab
            schoolId={schoolId}
            currentUserId={currentUserId || ""}
            profileMap={profileMap}
            onSendNow={() => {
              setScheduledCount((prev) => Math.max(0, prev - 1));
              fetchConversations();
            }}
          />
        )}

        {/* Conversation List - only show in inbox tab */}
        {activeTab === "inbox" && (
          <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No conversations yet</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowNewChat(true)}>
                Start a conversation
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredConversations.map((conv) => (
                <div key={conv.id} className="group relative">
                  <button
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/50",
                      selectedConversation?.id === conv.id && "bg-accent"
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(conv.recipientName)}
                        </AvatarFallback>
                      </Avatar>
                      {conv.unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {/* Always-visible delete icon in front of name */}
                          <DeleteConversationDialog
                            recipientName={conv.recipientName}
                            onDelete={async (mode) => handleDeleteConversation(conv, mode)}
                          />

                          <p className={cn("truncate font-medium", conv.unreadCount > 0 && "font-semibold")}>
                            {conv.recipientName}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatConversationTime(conv.lastMessageTime)}
                        </span>
                      </div>
                      {/* Enhanced last message preview */}
                      <div className={cn(
                        "mt-0.5 flex items-center gap-1.5 text-sm",
                        conv.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"
                      )}>
                        {conv.hasAttachment && (
                          <Paperclip className="h-3 w-3 shrink-0" />
                        )}
                        {conv.lastSenderName && (
                          <span className="shrink-0 text-xs font-medium">
                            {conv.isSentByMe ? "You:" : `${conv.lastSenderName.split(" ")[0]}:`}
                          </span>
                        )}
                        <p className="truncate">
                          {conv.lastMessage || "No messages yet"}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        )}
      </div>

      {/* Chat Area */}
      <div className={cn("flex flex-1 flex-col overflow-hidden", !showChatOnMobile && isMobile && "hidden lg:flex")}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 border-b p-4">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(selectedConversation.recipientName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold">{selectedConversation.recipientName}</p>
              </div>
              <DeleteConversationDialog
                recipientName={selectedConversation.recipientName}
                onDelete={async (mode) => handleDeleteConversation(selectedConversation, mode)}
                trigger={
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                }
              />
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 px-1">
                  {messages.map((msg, idx) => {
                    const showDate =
                      idx === 0 ||
                      format(parseISO(msg.created_at), "yyyy-MM-dd") !==
                        format(parseISO(messages[idx - 1].created_at), "yyyy-MM-dd");

                    const parentMessage = msg.reply_to_id
                      ? messages.find((m) => m.id === msg.reply_to_id)
                      : undefined;

                    return (
                      <div key={msg.id} id={`msg-${msg.id}`} className="w-full transition-all duration-300 rounded-lg">
                        {showDate && (
                          <div className="my-4 flex items-center justify-center">
                            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                              {isToday(parseISO(msg.created_at))
                                ? "Today"
                                : isYesterday(parseISO(msg.created_at))
                                  ? "Yesterday"
                                  : format(parseISO(msg.created_at), "MMMM d, yyyy")}
                            </span>
                          </div>
                        )}
                        
                        {/* Message row container */}
                        <div 
                          className={cn(
                            "group flex w-full",
                            msg.is_mine ? "justify-end" : "justify-start"
                          )}
                        >
                          {/* Inner flex container for bubble + actions */}
                          <div 
                            className={cn(
                              "flex items-end gap-1.5 min-w-0",
                              msg.is_mine ? "flex-row-reverse" : "flex-row",
                              isMobile ? "max-w-[85%]" : "max-w-[70%]"
                            )}
                          >
                            {/* Message Bubble */}
                            <div className={cn(
                              "flex flex-col gap-0.5 min-w-0",
                              msg.is_mine ? "items-end" : "items-start"
                            )}>
                              <div
                                className={cn(
                                  "max-w-full rounded-2xl px-3.5 py-2 inline-block",
                                  msg.is_mine
                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                    : "bg-muted rounded-bl-sm"
                                )}
                              >
                                {/* Reply indicator */}
                                {parentMessage && (
                                  <div
                                    className={cn(
                                      "mb-2 flex items-center gap-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                                      msg.is_mine
                                        ? "border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground/80"
                                        : "border-muted-foreground/30 bg-background/50 text-muted-foreground"
                                    )}
                                  >
                                    <CornerDownRight className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {parentMessage.content.substring(0, 40)}
                                      {parentMessage.content.length > 40 ? "..." : ""}
                                    </span>
                                  </div>
                                )}
                                <p className="whitespace-pre-wrap text-sm leading-snug break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                  {msg.content}
                                </p>
                                
                                {/* Attachments */}
                                {msg.attachment_urls && msg.attachment_urls.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {msg.attachment_urls.map((url, i) => {
                                      const fileName = url.split("/").pop() || "File";
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => downloadAttachment(url)}
                                          className={cn(
                                            "flex items-center gap-2 rounded-lg p-2 text-xs transition-colors w-full",
                                            msg.is_mine
                                              ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
                                              : "bg-background hover:bg-accent"
                                          )}
                                        >
                                          <FileText className="h-4 w-4 shrink-0" />
                                          <span className="truncate flex-1 text-left">{fileName.substring(fileName.indexOf("-") + 1)}</span>
                                          <Download className="h-3 w-3 shrink-0" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                
                                <div
                                  className={cn(
                                    "mt-0.5 flex items-center gap-1",
                                    msg.is_mine ? "justify-end" : "justify-start"
                                  )}
                                >
                                  <span className={cn(
                                    "text-[10px]",
                                    msg.is_mine ? "text-primary-foreground/70" : "text-muted-foreground"
                                  )}>
                                    {formatMessageTime(msg.created_at)}
                                  </span>
                                  {msg.is_mine && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        {msg.is_read ? (
                                          <CheckCheck className="h-3 w-3 text-primary-foreground/70 cursor-help" />
                                        ) : (
                                          <Check className="h-3 w-3 text-primary-foreground/50 cursor-help" />
                                        )}
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        {msg.is_read
                                          ? `Read ${messageReadStatus[msg.id]?.read_at ? (parseDateSafe(messageReadStatus[msg.id].read_at!) ? format(parseDateSafe(messageReadStatus[msg.id].read_at!)!, "MMM d, h:mm a") : "") : ""}`
                                          : "Delivered"
                                        }
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                              
                              {/* Reactions */}
                              <MessageReactions
                                messageId={msg.id}
                                schoolId={schoolId}
                                currentUserId={currentUserId || ""}
                                isMine={msg.is_mine}
                              />
                            </div>

                            {/* Action buttons - visible on mobile tap, hover on desktop */}
                            <div className={cn(
                              "mb-1 flex shrink-0 gap-0.5 rounded-lg p-0.5 transition-opacity",
                              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                              isMobile ? "bg-muted/60 shadow-sm" : "bg-transparent"
                            )}>
                              <button
                                onClick={() => setReplyingTo(msg)}
                                className="rounded p-1.5 hover:bg-accent active:bg-accent"
                                title="Reply"
                              >
                                <Reply className="h-3.5 w-3.5 text-foreground/70" />
                              </button>
                              <button
                                onClick={() => setForwardingMessage(msg)}
                                className="rounded p-1.5 hover:bg-accent active:bg-accent"
                                title="Forward"
                              >
                                <Forward className="h-3.5 w-3.5 text-foreground/70" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Typing Indicator */}
            <TypingIndicator
              isTyping={isPartnerTyping}
              userName={selectedConversation.recipientName}
            />

            {/* Reply Preview */}
            {replyingTo && (
              <div className="border-t bg-muted/30 px-4 py-2">
                <ReplyPreview
                  parentMessage={replyingTo}
                  onClear={() => setReplyingTo(null)}
                  isMine={replyingTo.is_mine}
                />
              </div>
            )}

            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <div className="border-t bg-muted/50 p-2">
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="max-w-[100px] truncate">{file.name}</span>
                      <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Message Input - Fixed at bottom on mobile */}
            <div className="shrink-0 border-t bg-background p-2 sm:p-4">
              <div className="flex w-full items-end gap-1.5 sm:gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  accept="*/*"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 sm:h-10 sm:w-10"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Textarea
                  placeholder={replyingTo ? "Type a reply..." : "Type a message..."}
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    handleTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="min-h-[36px] max-h-24 min-w-0 flex-1 resize-none text-sm sm:min-h-[44px] sm:max-h-32"
                  rows={1}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 sm:h-10 sm:w-10"
                      disabled={!messageText.trim() && attachments.length === 0}
                      onClick={() => setShowScheduleDialog(true)}
                    >
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Schedule message</TooltipContent>
                </Tooltip>
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 sm:h-10 sm:w-10"
                  disabled={sending || (!messageText.trim() && attachments.length === 0)}
                  onClick={handleSendMessage}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" />
                  ) : (
                    <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-primary/10 p-6">
              <MessageCircle className="h-12 w-12 text-primary" />
            </div>
            <h3 className="mt-6 text-xl font-semibold">Welcome to Messages</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Select a conversation to start chatting, or start a new conversation with any user in your workspace.
            </p>
            <Button className="mt-6" onClick={() => setShowNewChat(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Conversation
            </Button>
          </div>
        )}
      </div>
      </div>

      {/* Forward Message Dialog */}
      <Dialog open={!!forwardingMessage} onOpenChange={(open) => !open && setForwardingMessage(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Forward className="h-5 w-5" />
              Forward Message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Message Preview */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Message to forward:</p>
              <p className="text-sm line-clamp-3" style={{ wordBreak: "break-word" }}>
                {forwardingMessage?.content}
              </p>
              {forwardingMessage?.attachment_urls && forwardingMessage.attachment_urls.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  <span>{forwardingMessage.attachment_urls.length} attachment(s)</span>
                </div>
              )}
            </div>

            <Input
              placeholder="Search users..."
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
            />
            {isStudent && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Students can only forward to teachers and staff.</span>
              </div>
            )}
            <ScrollArea className="h-56">
              <div className="space-y-2">
                {filteredForwardUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  filteredForwardUsers.map((user) => (
                    <button
                      key={user.user_id}
                      onClick={() => handleForwardMessage(user.user_id)}
                      disabled={forwardSending}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getInitials(user.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{user.display_name}</p>
                          {user.role && (
                            <Badge variant="secondary" className="text-[10px] h-4 shrink-0">
                              {user.role}
                            </Badge>
                          )}
                        </div>
                        {user.email && (
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                      {forwardSending && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Message Dialog */}
      <ScheduleMessageDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onSchedule={handleScheduleMessage}
        messagePreview={messageText.trim() || undefined}
      />
    </div>
  );
}
