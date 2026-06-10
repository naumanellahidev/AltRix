import { useEffect, useState, useMemo, useCallback } from "react";
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import {
  Mail,
  Send,
  Inbox,
  Clock,
  CheckCircle,
  Circle,
  ChevronRight,
  ArrowLeft,
  User,
  Users,
  Search,
  Filter,
  Trash2,
  Reply,
  Calendar,
  X,
  Loader2,
  Paperclip,
  FileText,
  Image,
  Download,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SendMessageDialog } from "@/components/principal/SendMessageDialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  subject: string | null;
  content: string;
  priority: string;
  status: string;
  created_at: string;
  sender_user_id: string;
  sender_name?: string;
  recipient_count?: number;
  recipients?: { user_id: string; name: string; is_read: boolean; read_at?: string }[];
  is_sent: boolean;
  is_read?: boolean;
  attachment_urls?: string[];
}

interface Props {
  schoolId: string;
  canCompose?: boolean;
}

export function WorkspaceMessagesTab({ schoolId, canCompose = true }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  // Reply
  const [replyContent, setReplyContent] = useState("");
  const [replying, setReplying] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setLoading(false);
      return;
    }
    setCurrentUserId(user.user.id);

    // Fetch all messages for this school where user is sender or recipient
    const { data: sentMessages } = await supabase
      .from("admin_messages")
      .select("*")
      .eq("school_id", schoolId)
      .eq("sender_user_id", user.user.id)
      .order("created_at", { ascending: false });

    // Fetch messages received (via recipients table)
    const { data: recipientRows } = await supabase
      .from("admin_message_recipients")
      .select("message_id, is_read, read_at, admin_messages(*)")
      .eq("recipient_user_id", user.user.id);

    // Collect all unique user IDs for profile lookup
    const userIds = new Set<string>();
    sentMessages?.forEach((m) => userIds.add(m.sender_user_id));
    recipientRows?.forEach((r) => {
      const msg = r.admin_messages as any;
      if (msg?.sender_user_id) userIds.add(msg.sender_user_id);
    });

    // Fetch profiles from profiles table using user_id
    if (userIds.size > 0) {
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(userIds));

      const map: Record<string, string> = {};
      (profiles as any[] || []).forEach((p: any) => {
        if (p.id && p.display_name) {
          map[p.id] = p.display_name;
        }
      });

      // If still missing, try school_user_directory
      const missingIds = Array.from(userIds).filter((id) => !map[id]);
      if (missingIds.length > 0) {
        const { data: directoryEntries } = await supabase
          .from("school_user_directory")
          .select("user_id, display_name, email")
          .eq("school_id", schoolId)
          .in("user_id", missingIds);

        directoryEntries?.forEach((d) => {
          if (d.user_id) {
            map[d.user_id] = d.display_name || d.email || "User";
          }
        });
      }

      setProfileMap(map);
    }

    // Process sent messages
    const sent: Message[] = (sentMessages || []).map((m) => ({
      id: m.id,
      subject: m.subject,
      content: m.content,
      priority: m.priority || "normal",
      status: m.status || "open",
      created_at: m.created_at,
      sender_user_id: m.sender_user_id,
      is_sent: true,
      attachment_urls: (m as any).attachment_urls || [],
    }));

    // Process received messages
    const received: Message[] = (recipientRows || [])
      .filter((r) => r.admin_messages)
      .map((r) => {
        const msg = r.admin_messages as any;
        return {
          id: msg.id,
          subject: msg.subject,
          content: msg.content,
          priority: msg.priority || "normal",
          status: msg.status || "open",
          created_at: msg.created_at,
          sender_user_id: msg.sender_user_id,
          is_sent: false,
          is_read: r.is_read,
          attachment_urls: msg.attachment_urls || [],
        };
      });

    // Merge and dedupe
    const allMap = new Map<string, Message>();
    sent.forEach((m) => allMap.set(m.id, m));
    received.forEach((m) => {
      if (!allMap.has(m.id)) allMap.set(m.id, m);
    });

    const all = Array.from(allMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Fetch recipient counts for sent messages
    for (const msg of all.filter((m) => m.is_sent)) {
      const { count } = await supabase
        .from("admin_message_recipients")
        .select("*", { count: "exact", head: true })
        .eq("message_id", msg.id);
      msg.recipient_count = count || 0;
    }

    setMessages(all);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription for read status updates
  useEffect(() => {
    if (!schoolId || !currentUserId) return;

    const channel = supabase
      .channel(`workspace-read-status-${schoolId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_message_recipients",
        },
        (payload) => {
          const newRow = payload.new as { message_id: string; is_read: boolean; read_at: string | null; recipient_user_id: string };
          
          // Update messages list to reflect read status
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === newRow.message_id) {
                // For sent messages, update recipients
                if (m.is_sent && m.recipients) {
                  return {
                    ...m,
                    recipients: m.recipients.map((r) =>
                      r.user_id === newRow.recipient_user_id
                        ? { ...r, is_read: newRow.is_read, read_at: newRow.read_at || undefined }
                        : r
                    ),
                  };
                }
                // For received messages, update is_read
                if (!m.is_sent && newRow.recipient_user_id === currentUserId) {
                  return { ...m, is_read: newRow.is_read };
                }
              }
              return m;
            })
          );

          // Also update selected message if viewing it
          setSelectedMessage((prev) => {
            if (!prev || prev.id !== newRow.message_id) return prev;
            
            if (prev.is_sent && prev.recipients) {
              return {
                ...prev,
                recipients: prev.recipients.map((r) =>
                  r.user_id === newRow.recipient_user_id
                    ? { ...r, is_read: newRow.is_read, read_at: newRow.read_at || undefined }
                    : r
                ),
              };
            }
            
            return prev;
          });
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
        () => {
          // New message received - refresh messages list
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, currentUserId, fetchMessages]);

  const markAsRead = async (message: Message) => {
    if (message.is_sent || message.is_read) return;

    await supabase
      .from("admin_message_recipients")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("message_id", message.id)
      .eq("recipient_user_id", currentUserId);

    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, is_read: true } : m))
    );
  };

  // Filter logic
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const senderName = profileMap[m.sender_user_id] || "";
        const matchesSearch =
          m.subject?.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          senderName.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Priority
      if (priorityFilter !== "all" && m.priority !== priorityFilter) return false;

      // Read status (only for received messages)
      if (readFilter !== "all") {
        if (m.is_sent) return true;
        if (readFilter === "read" && !m.is_read) return false;
        if (readFilter === "unread" && m.is_read) return false;
      }

      // Date range
      const msgDate = parseISO(m.created_at);
      if (dateFrom && isBefore(msgDate, startOfDay(dateFrom))) return false;
      if (dateTo && isAfter(msgDate, endOfDay(dateTo))) return false;

      return true;
    });
  }, [messages, searchQuery, priorityFilter, readFilter, dateFrom, dateTo, profileMap]);

  const sentMessages = useMemo(() => filteredMessages.filter((m) => m.is_sent), [filteredMessages]);
  const receivedMessages = useMemo(() => filteredMessages.filter((m) => !m.is_sent), [filteredMessages]);
  const unreadCount = useMemo(
    () => messages.filter((m) => !m.is_sent && !m.is_read).length,
    [messages]
  );

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-primary/10 text-primary",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    urgent: "bg-destructive/10 text-destructive",
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSelectMessage = async (message: Message) => {
    setSelectedMessage(message);
    setReplyContent("");
    await markAsRead(message);

    // Load recipients for sent messages
    if (message.is_sent) {
      const { data } = await supabase
        .from("admin_message_recipients")
        .select("recipient_user_id, is_read, read_at")
        .eq("message_id", message.id);

      if (data) {
        const userIds = data.map((r) => r.recipient_user_id);
        
        // Fetch from profiles
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);

        const nameMap: Record<string, string> = {};
        (profiles as any[] || []).forEach((p: any) => {
          if (p.id && p.display_name) {
            nameMap[p.id] = p.display_name;
          }
        });

        // Fallback to directory for missing names
        const missingIds = userIds.filter((id) => !nameMap[id]);
        if (missingIds.length > 0) {
          const { data: dirEntries } = await supabase
            .from("school_user_directory")
            .select("user_id, display_name, email")
            .eq("school_id", schoolId)
            .in("user_id", missingIds);

          dirEntries?.forEach((d) => {
            if (d.user_id) {
              nameMap[d.user_id] = d.display_name || d.email || "User";
            }
          });
        }

        const recipients = data.map((r) => ({
          user_id: r.recipient_user_id,
          name: nameMap[r.recipient_user_id] || "User",
          is_read: r.is_read,
          read_at: r.read_at,
        }));

        setSelectedMessage((prev) => (prev ? { ...prev, recipients } : prev));
      }
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !selectedMessage || !currentUserId) return;

    setReplying(true);
    try {
      const { data: messageData, error: messageError } = await supabase
        .from("admin_messages")
        .insert({
          school_id: schoolId,
          sender_user_id: currentUserId,
          subject: `Re: ${selectedMessage.subject || "(No subject)"}`,
          content: replyContent.trim(),
          priority: "normal",
          status: "sent",
        })
        .select("id")
        .single();

      if (messageError) throw messageError;

      await supabase.from("admin_message_recipients").insert({
        message_id: messageData.id,
        recipient_user_id: selectedMessage.sender_user_id,
      });

      await supabase.from("app_notifications").insert({
        school_id: schoolId,
        user_id: selectedMessage.sender_user_id,
        title: `Reply: ${selectedMessage.subject || "New Message"}`,
        body: replyContent.trim().substring(0, 100) + (replyContent.length > 100 ? "..." : ""),
        type: "admin_message",
      });

      toast({ title: "Reply sent successfully" });
      setReplyContent("");
      fetchMessages();
    } catch (error: any) {
      toast({ title: "Failed to send reply", description: error.message, variant: "destructive" });
    } finally {
      setReplying(false);
    }
  };

  const handleDeleteMessage = async (message: Message, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingMessageId(message.id);
    setDeleting(true);
    try {
      if (message.is_sent) {
        // User sent this message - they can delete the message itself
        // The recipients will be cascade deleted due to FK constraint
        const { error: deleteError } = await supabase
          .from("admin_messages")
          .delete()
          .eq("id", message.id)
          .eq("sender_user_id", currentUserId);
        
        if (deleteError) throw deleteError;
      } else {
        // User received this message - mark as read and remove from local state only
        // We can't delete recipient records, but we can mark them read
        await supabase
          .from("admin_message_recipients")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("message_id", message.id)
          .eq("recipient_user_id", currentUserId);
      }

      toast({ title: message.is_sent ? "Message deleted" : "Message removed" });
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (selectedMessage?.id === message.id) {
        setSelectedMessage(null);
      }
    } catch (error: any) {
      console.error("Delete message error:", error);
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } finally {
      setDeletingMessageId(null);
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("all");
    setReadFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = searchQuery || priorityFilter !== "all" || readFilter !== "all" || dateFrom || dateTo;

  const MessageCard = ({ message, onClick }: { message: Message; onClick: () => void }) => {
    const senderName = profileMap[message.sender_user_id] || "User";
    
    return (
      <div className="group relative">
        <button
          onClick={onClick}
          className={cn(
            "w-full rounded-xl border bg-background p-3 text-left transition-all hover:bg-accent/50 sm:p-4",
            !message.is_sent && !message.is_read && "border-primary/30 bg-primary/5"
          )}
        >
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className={cn(
                "text-xs font-medium",
                message.is_sent ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
              )}>
                {message.is_sent ? <Send className="h-4 w-4" /> : getInitials(senderName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">
                  {message.is_sent ? "You" : senderName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.created_at), "MMM d, h:mm a")}
                </span>
                {!message.is_sent && !message.is_read && (
                  <Badge variant="default" className="text-[10px] h-4 px-1.5">
                    New
                  </Badge>
                )}
              </div>
              <p className="font-medium text-sm mt-0.5 truncate">
                {message.subject || "(No subject)"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {message.content}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className={`text-[10px] h-5 ${priorityColors[message.priority]}`}>
                  {message.priority}
                </Badge>
                {message.is_sent && message.recipient_count !== undefined && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {message.recipient_count} recipient{message.recipient_count !== 1 ? "s" : ""}
                  </span>
                )}
                {message.attachment_urls && message.attachment_urls.length > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {message.attachment_urls.length}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 sm:h-5 sm:w-5" />
          </div>
        </button>
        
        {/* Delete button overlay - visible on mobile, hover on desktop */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-12 top-1/2 -translate-y-1/2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => e.stopPropagation()}
            >
              {deletingMessageId === message.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Message?</AlertDialogTitle>
              <AlertDialogDescription>
                {message.is_sent
                  ? "This will permanently delete the message for all recipients."
                  : "This will remove the message from your inbox."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => handleDeleteMessage(message, e)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  // Mobile: Show detail view when message is selected
  if (selectedMessage) {
    const senderName = profileMap[selectedMessage.sender_user_id] || "User";
    
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedMessage(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Messages</span>
          <span className="sm:hidden">Back</span>
        </Button>

        <Card className="overflow-hidden">
          {/* Chat Header */}
          <CardHeader className="border-b bg-muted/30 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className={cn(
                    "text-sm font-medium",
                    selectedMessage.is_sent ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                  )}>
                    {selectedMessage.is_sent ? <Send className="h-5 w-5" /> : getInitials(senderName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base sm:text-lg">
                    {selectedMessage.is_sent ? "You" : senderName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedMessage.subject || "(No subject)"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-xs ${priorityColors[selectedMessage.priority]}`}>
                  {selectedMessage.priority}
                </Badge>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Message?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {selectedMessage.is_sent
                          ? "This will permanently delete the message for all recipients."
                          : "This will remove the message from your inbox."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteMessage(selectedMessage)}
                        disabled={deleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Chat-style message bubble */}
            <div className="p-4 sm:p-6 space-y-4">
              {/* Message bubble */}
              <div className={cn(
                "flex gap-3",
                selectedMessage.is_sent ? "flex-row-reverse" : "flex-row"
              )}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={cn(
                    "text-xs",
                    selectedMessage.is_sent ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                  )}>
                    {selectedMessage.is_sent ? "Y" : getInitials(senderName)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  "flex flex-col w-fit",
                  selectedMessage.is_sent ? "items-end" : "items-start"
                )}
                style={{ maxWidth: "85%" }}
                >
                  <div className={cn(
                    "rounded-2xl px-4 py-2.5 inline-block",
                    selectedMessage.is_sent 
                      ? "bg-primary text-primary-foreground rounded-tr-sm" 
                      : "bg-muted rounded-tl-sm"
                  )}>
                    <p className="whitespace-pre-wrap text-sm sm:text-base leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]">{selectedMessage.content}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground px-1">
                    <Clock className="h-3 w-3" />
                    <span>{format(new Date(selectedMessage.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                    {selectedMessage.is_sent && selectedMessage.recipient_count !== undefined && (
                      <>
                        <span>•</span>
                        <span>{selectedMessage.recipient_count} recipient{selectedMessage.recipient_count !== 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Attachments */}
              {selectedMessage.attachment_urls && selectedMessage.attachment_urls.length > 0 && (
                <div className="rounded-xl border p-3 sm:p-4 bg-muted/20">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Attachments ({selectedMessage.attachment_urls.length})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedMessage.attachment_urls.map((url, idx) => {
                      const fileName = url.split("/").pop() || "Attachment";
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                      
                      const handleDownload = async () => {
                        const { data } = await supabase.storage
                          .from("message-attachments")
                          .createSignedUrl(url, 60);
                        
                        if (data?.signedUrl) {
                          window.open(data.signedUrl, "_blank");
                        }
                      };

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-lg bg-background border p-2.5 text-sm"
                        >
                          {isImage ? (
                            <Image className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="flex-1 truncate text-xs">{fileName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1.5 h-7 px-2"
                            onClick={handleDownload}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recipients List (for sent messages) */}
              {selectedMessage.is_sent && selectedMessage.recipients && (
                <div className="rounded-xl border p-3 sm:p-4 bg-muted/20">
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Recipients ({selectedMessage.recipients.length})
                  </p>
                  <ScrollArea className="max-h-[180px]">
                    <div className="space-y-2">
                      {selectedMessage.recipients.map((r) => (
                        <div
                          key={r.user_id}
                          className="flex items-center gap-3 rounded-lg bg-background border p-2.5"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                              {getInitials(r.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.is_read ? (
                              <div className="flex items-center gap-1.5 text-primary">
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-xs">
                                  {r.read_at ? format(new Date(r.read_at), "MMM d, h:mm a") : "Read"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Circle className="h-4 w-4" />
                                <span className="text-xs">Pending</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Reply Section (for received messages) */}
            {!selectedMessage.is_sent && (
              <div className="border-t bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      Y
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <Textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Type your reply..."
                      rows={3}
                      className="resize-none bg-background"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleReply}
                        disabled={replying || !replyContent.trim()}
                        className="gap-2"
                      >
                        {replying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Reply
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Messages</h2>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread message${unreadCount !== 1 ? "s" : ""}` : "All caught up!"}
          </p>
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="shrink-0"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
          {canCompose && (
            <SendMessageDialog
              schoolId={schoolId}
              onMessageSent={fetchMessages}
              trigger={
                <Button className="gap-2">
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Compose</span>
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Read Status</label>
                <Select value={readFilter} onValueChange={setReadFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Messages</SelectItem>
                    <SelectItem value="unread">Unread Only</SelectItem>
                    <SelectItem value="read">Read Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">From Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">To Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Message Tabs */}
      <Tabs defaultValue="inbox" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1">
          <TabsTrigger value="inbox" className="gap-1.5 py-2 text-xs sm:gap-2 sm:text-sm">
            <Inbox className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Inbox</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-1.5 py-2 text-xs sm:gap-2 sm:text-sm">
            <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>Sent</span>
            <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
              {sentMessages.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5 py-2 text-xs sm:gap-2 sm:text-sm">
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>All</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-2 mt-0">
          {receivedMessages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Inbox className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveFilters ? "No messages match your filters" : "No messages in your inbox"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {receivedMessages.map((m) => (
                <MessageCard key={m.id} message={m} onClick={() => handleSelectMessage(m)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent" className="space-y-2 mt-0">
          {sentMessages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Send className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveFilters ? "No messages match your filters" : "No sent messages yet"}
                </p>
                {!hasActiveFilters && canCompose && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the Compose button to send your first message
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sentMessages.map((m) => (
                <MessageCard key={m.id} message={m} onClick={() => handleSelectMessage(m)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-2 mt-0">
          {filteredMessages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Mail className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {hasActiveFilters ? "No messages match your filters" : "No message history"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredMessages.map((m) => (
                <MessageCard key={m.id} message={m} onClick={() => handleSelectMessage(m)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
