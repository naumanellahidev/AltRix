import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { Send, MessageSquarePlus, Inbox, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { ParentNewMessageDialog } from "@/components/parent/ParentNewMessageDialog";

interface ParentMessagesModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

interface Message {
  id: string;
  subject: string | null;
  content: string | null;
  sender_user_id: string;
  recipient_user_id: string;
  is_read: boolean | null;
  created_at: string;
  student_id: string | null;
}

interface Conversation {
  key: string;
  otherUserId: string;
  otherName: string;
  subject: string;
  studentId: string | null;
  messages: Message[];
  unread: number;
  lastAt: string;
}

const ParentMessagesModule = ({ child, schoolId }: ParentMessagesModuleProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // New message dialog
  const [showNewMessage, setShowNewMessage] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!currentUserId || !schoolId) return;

    setLoading(true);

    // Show ALL messages where I'm sender or recipient in this school.
    // If a child is selected, scope to that student; otherwise show everything
    // so parents without a linked child can still see messages addressed to them.
    let query = supabase
      .from("parent_messages")
      .select("id,subject,content,sender_user_id,recipient_user_id,is_read,created_at,student_id")
      .eq("school_id", schoolId)
      .or(`sender_user_id.eq.${currentUserId},recipient_user_id.eq.${currentUserId}`)
      .order("created_at", { ascending: true })
      .limit(200);

    if (child) {
      query = query.eq("student_id", child.student_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch messages:", error);
      toast.error("Failed to load messages");
    } else {
      setMessages((data || []) as Message[]);
    }

    setLoading(false);
  }, [child, currentUserId, schoolId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Fetch directory names for conversation labels
  useEffect(() => {
    if (!schoolId) return;
    supabase
      .rpc("get_school_user_directory", { _school_id: schoolId })
      .then(({ data }) => {
        if (!data) return;
        setUserNames((prev) => {
          const next = { ...prev };
          (data as any[]).forEach((d) => {
            next[d.user_id] = d.display_name || d.email || "Member";
          });
          return next;
        });
      });
  }, [schoolId]);

  // Realtime subscription — listen to all parent_messages in this school
  useEffect(() => {
    if (!schoolId) return;

    const channel = supabase
      .channel(`parent-messages-${schoolId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parent_messages",
          filter: `school_id=eq.${schoolId}`,
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [schoolId, fetchMessages]);

  // Build conversations grouped by other user + subject
  const conversations: Conversation[] = (() => {
    if (!currentUserId) return [];
    const map = new Map<string, Conversation>();
    messages.forEach((m) => {
      const other =
        m.sender_user_id === currentUserId ? m.recipient_user_id : m.sender_user_id;
      const subj = (m.subject || "").trim() || "(No subject)";
      const key = `${other}::${subj}`;
      const existing = map.get(key);
      const isUnread = !m.is_read && m.recipient_user_id === currentUserId;
      if (existing) {
        existing.messages.push(m);
        existing.unread += isUnread ? 1 : 0;
        if (m.created_at > existing.lastAt) existing.lastAt = m.created_at;
      } else {
        map.set(key, {
          key,
          otherUserId: other,
          otherName: userNames[other] || `Member ${other.slice(0, 6)}`,
          subject: subj,
          studentId: m.student_id,
          messages: [m],
          unread: isUnread ? 1 : 0,
          lastAt: m.created_at,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  })();

  const selectedConv = conversations.find((c) => c.key === selectedKey) || null;

  const handleReply = async () => {
    if (!selectedConv || !replyContent.trim() || !currentUserId || !schoolId) return;

    setSending(true);

    const replySubject = selectedConv.subject === "(No subject)" ? null : selectedConv.subject;
    // Use the conversation's student context, falling back to selected child
    const studentIdForReply = selectedConv.studentId ?? child?.student_id ?? null;

    const { error } = await supabase.from("parent_messages").insert({
      school_id: schoolId,
      student_id: studentIdForReply,
      sender_user_id: currentUserId,
      recipient_user_id: selectedConv.otherUserId,
      subject: replySubject,
      content: replyContent.trim(),
    });

    if (error) {
      console.error("Failed to send reply:", error);
      toast.error(error.message || "Failed to send reply");
    } else {
      setReplyContent("");
      await fetchMessages();
    }

    setSending(false);
  };

  const markConvRead = async (conv: Conversation) => {
    if (!currentUserId || conv.unread === 0) return;
    const ids = conv.messages
      .filter((m) => !m.is_read && m.recipient_user_id === currentUserId)
      .map((m) => m.id);
    if (ids.length === 0) return;
    await supabase.from("parent_messages").update({ is_read: true }).in("id", ids);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-sm text-muted-foreground">
            {child ? (
              <>
                Conversations about{" "}
                <span className="font-medium text-foreground">
                  {child.first_name || "your child"}
                </span>
              </>
            ) : (
              "All your conversations with school staff"
            )}
          </p>
        </div>
        <Button onClick={() => setShowNewMessage((v) => !v)} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          {showNewMessage ? "Close" : "New Message"}
        </Button>
      </div>

      <ParentNewMessageDialog
        open={showNewMessage}
        onOpenChange={setShowNewMessage}
        schoolId={schoolId}
        studentId={child?.student_id ?? null}
        childName={child?.first_name ?? "your child"}
        onSent={() => fetchMessages()}
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-primary" />
              Conversations
              {conversations.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {conversations.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : conversations.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tap "New Message" to start one.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[480px]">
                <ul className="divide-y">
                  {conversations.map((conv) => {
                    const isActive = conv.key === selectedKey;
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    return (
                      <li key={conv.key}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKey(conv.key);
                            void markConvRead(conv);
                          }}
                          className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 ${
                            isActive ? "bg-accent" : ""
                          }`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold">
                                {conv.otherName}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {format(new Date(conv.lastAt), "MMM d")}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {conv.subject}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2">
                              <span className="truncate text-xs text-muted-foreground/80">
                                {lastMsg?.sender_user_id === currentUserId ? "You: " : ""}
                                {lastMsg?.content || ""}
                              </span>
                              {conv.unread > 0 && (
                                <Badge className="ml-auto h-4 px-1.5 text-[10px]">
                                  {conv.unread}
                                </Badge>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Thread */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedConv ? (
                <span className="flex flex-col">
                  <span className="text-sm font-normal text-muted-foreground">
                    Conversation with
                  </span>
                  <span>{selectedConv.otherName}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {selectedConv.subject}
                  </span>
                </span>
              ) : (
                "Select a conversation"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {selectedConv ? (
              <>
                <ScrollArea className="h-[360px] rounded-lg border bg-muted/30 p-3">
                  <div className="space-y-3">
                    {selectedConv.messages.map((m) => {
                      const mine = m.sender_user_id === currentUserId;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              mine
                                ? "bg-primary text-primary-foreground"
                                : "bg-background border"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                            <p
                              className={`mt-1 text-[10px] ${
                                mine
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {format(new Date(m.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                <div className="flex items-end gap-2">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleReply();
                      }
                    }}
                    placeholder="Type your reply… (Ctrl/⌘+Enter to send)"
                    rows={2}
                    className="flex-1 resize-none"
                  />
                  <Button
                    onClick={handleReply}
                    disabled={sending || !replyContent.trim()}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <MessageSquarePlus className="mb-2 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Select a conversation from the left, or start a new message.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ParentMessagesModule;
