import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
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
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SendMessageDialog } from "./SendMessageDialog";

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
  recipients?: { user_id: string; name: string; is_read: boolean }[];
  is_sent: boolean;
  is_read?: boolean;
}

interface Props {
  schoolId: string;
}

export function PrincipalMessagesTab({ schoolId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchMessages();
  }, [schoolId]);

  const fetchMessages = async () => {
    setLoading(true);

    const { data: user } = await api.auth.getUser();
    if (!user.user) {
      setLoading(false);
      return;
    }
    setCurrentUserId(user.user.id);

    // Fetch all messages for this school where user is sender or recipient
    const { data: sentMessages } = await api
      .from("admin_messages")
      .select("*")
      .eq("school_id", schoolId)
      .eq("sender_user_id", user.user.id)
      .order("created_at", { ascending: false });

    // Fetch messages received (via recipients table)
    const { data: recipientRows } = await api
      .from("admin_message_recipients")
      .select("message_id, is_read, admin_messages(*)")
      .eq("recipient_user_id", user.user.id);

    // Collect all unique user IDs for profile lookup
    const userIds = new Set<string>();
    sentMessages?.forEach((m) => userIds.add(m.sender_user_id));
    recipientRows?.forEach((r) => {
      const msg = r.admin_messages as any;
      if (msg?.sender_user_id) userIds.add(msg.sender_user_id);
    });

    // Fetch profiles
    if (userIds.size > 0) {
      const { data: profiles } = await api
        .from("profiles")
        .select("id, display_name")
        .in("id", Array.from(userIds));

      const map: Record<string, string> = {};
      profiles?.forEach((p) => {
        map[p.id] = p.display_name || "Unknown User";
      });
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
      const { count } = await api
        .from("admin_message_recipients")
        .select("*", { count: "exact", head: true })
        .eq("message_id", msg.id);
      msg.recipient_count = count || 0;
    }

    setMessages(all);
    setLoading(false);
  };

  const markAsRead = async (message: Message) => {
    if (message.is_sent || message.is_read) return;

    await api
      .from("admin_message_recipients")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("message_id", message.id)
      .eq("recipient_user_id", currentUserId);

    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, is_read: true } : m))
    );
  };

  const sentMessages = useMemo(() => messages.filter((m) => m.is_sent), [messages]);
  const receivedMessages = useMemo(() => messages.filter((m) => !m.is_sent), [messages]);
  const unreadCount = useMemo(
    () => receivedMessages.filter((m) => !m.is_read).length,
    [receivedMessages]
  );

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    normal: "bg-primary/10 text-primary",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    urgent: "bg-destructive/10 text-destructive",
  };

  const handleSelectMessage = async (message: Message) => {
    setSelectedMessage(message);
    await markAsRead(message);

    // Load recipients for sent messages
    if (message.is_sent) {
      const { data } = await api
        .from("admin_message_recipients")
        .select("recipient_user_id, is_read")
        .eq("message_id", message.id);

      if (data) {
        const userIds = data.map((r) => r.recipient_user_id);
        const { data: profiles } = await api
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);

        const recipients = data.map((r) => ({
          user_id: r.recipient_user_id,
          name: profiles?.find((p) => p.id === r.recipient_user_id)?.display_name || "Unknown",
          is_read: r.is_read,
        }));

        setSelectedMessage((prev) => (prev ? { ...prev, recipients } : prev));
      }
    }
  };

  const MessageCard = ({ message, onClick }: { message: Message; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-full rounded-xl border bg-background p-3 text-left transition-all hover:bg-accent/50 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {message.is_sent ? (
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 sm:h-10 sm:w-10">
              <Send className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
            </div>
          ) : (
            <div className="grid h-8 w-8 place-items-center rounded-full bg-accent sm:h-10 sm:w-10">
              {message.is_read ? (
                <Mail className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />
              ) : (
                <Circle className="h-3.5 w-3.5 fill-primary text-primary sm:h-4 sm:w-4" />
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm sm:text-base truncate">
              {message.subject || "(No subject)"}
            </p>
            <Badge variant="secondary" className={`text-[10px] sm:text-xs shrink-0 ${priorityColors[message.priority]}`}>
              {message.priority}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 sm:text-sm">
            {message.content}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground sm:text-xs">
            <Clock className="h-3 w-3" />
            <span>{format(new Date(message.created_at), "MMM d, yyyy h:mm a")}</span>
            {message.is_sent && message.recipient_count !== undefined && (
              <>
                <span>•</span>
                <Users className="h-3 w-3" />
                <span>{message.recipient_count} recipients</span>
              </>
            )}
            {!message.is_sent && (
              <>
                <span>•</span>
                <span>From: {profileMap[message.sender_user_id] || "Unknown"}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 sm:h-5 sm:w-5" />
      </div>
    </button>
  );

  // Mobile: Show detail view when message is selected
  if (selectedMessage) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedMessage(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Messages</span>
          <span className="sm:hidden">Back</span>
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 shrink-0 sm:h-12 sm:w-12">
                {selectedMessage.is_sent ? (
                  <Send className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                ) : (
                  <Inbox className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base sm:text-lg break-words">
                  {selectedMessage.subject || "(No subject)"}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className={`text-xs ${priorityColors[selectedMessage.priority]}`}>
                    {selectedMessage.priority}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(selectedMessage.created_at), "MMMM d, yyyy h:mm a")}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-muted/50 p-3 sm:p-4">
              <p className="whitespace-pre-wrap text-sm sm:text-base">{selectedMessage.content}</p>
            </div>

            {selectedMessage.is_sent && selectedMessage.recipients && (
              <div>
                <p className="text-sm font-medium mb-2">
                  Recipients ({selectedMessage.recipients.length})
                </p>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2">
                    {selectedMessage.recipients.map((r) => (
                      <div
                        key={r.user_id}
                        className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 text-sm"
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{r.name}</span>
                        {r.is_read ? (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {!selectedMessage.is_sent && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>From: {profileMap[selectedMessage.sender_user_id] || "Unknown"}</span>
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
      {/* Compose Button */}
      <div className="flex justify-end">
        <SendMessageDialog
          schoolId={schoolId}
          onMessageSent={fetchMessages}
          trigger={
            <Button className="gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Compose Message</span>
              <span className="sm:hidden">Compose</span>
            </Button>
          }
        />
      </div>

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
                <p className="mt-2 text-sm text-muted-foreground">No messages in your inbox</p>
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
                <p className="mt-2 text-sm text-muted-foreground">No sent messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the Compose button to send your first message
                </p>
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
          {messages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Mail className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No message history</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {messages.map((m) => (
                <MessageCard key={m.id} message={m} onClick={() => handleSelectMessage(m)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
