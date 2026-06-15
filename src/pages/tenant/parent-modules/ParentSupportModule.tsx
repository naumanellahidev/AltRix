import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { ChildInfo } from "@/hooks/useMyChildren";
import { format } from "date-fns";
import { Send, LifeBuoy } from "lucide-react";

interface ParentSupportModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

interface Message {
  id: string;
  content: string;
  sender_user_id: string;
  created_at: string;
}

const ParentSupportModule = ({ child, schoolId }: ParentSupportModuleProps) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Fetch or create conversation
  const initConversation = useCallback(async () => {
    if (!child || !schoolId) return;

    setLoading(true);

    // Look for existing conversation
    const { data: existing } = await supabase
      .from("support_conversations")
      .select("id")
      .eq("school_id", schoolId)
      .eq("student_id", child.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      setConversationId(existing.id);
    } else {
      // Create new conversation
      const { data: created, error } = await supabase
        .from("support_conversations")
        .insert({ school_id: schoolId, student_id: child.student_id })
        .select("id")
        .single();

      if (error) {
        console.error("Failed to create conversation:", error);
      } else if (created) {
        setConversationId(created.id);
      }
    }

    setLoading(false);
  }, [child, schoolId]);

  useEffect(() => {
    initConversation();
  }, [initConversation]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    const { data, error } = await supabase
      .from("support_messages")
      .select("id, content, sender_user_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) {
      console.error("Failed to fetch messages:", error);
    } else {
      setMessages(data || []);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`parent-support-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleSend = async () => {
    if (!draft.trim() || !conversationId || !currentUserId || !schoolId) return;

    setSending(true);

    const { error } = await supabase.from("support_messages").insert({
      school_id: schoolId,
      conversation_id: conversationId,
      sender_user_id: currentUserId,
      content: draft.trim(),
    });

    if (error) {
      console.error("Failed to send message:", error);
    } else {
      setDraft("");

      // Notify support staff
      try {
        const { data: staffRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("school_id", schoolId)
          .in("role", ["counselor", "principal", "school_admin", "school_owner"]);

        if (staffRoles && staffRoles.length > 0) {
          const userIds = Array.from(new Set(staffRoles.map(r => r.user_id).filter(Boolean)));
          const notificationRows = userIds.map(uid => ({
            school_id: schoolId,
            user_id: uid,
            type: "support",
            title: "New Support Message",
            body: `A parent has sent a support message regarding student ${child?.first_name || "member"}.`,
            entity_type: "support_conversations",
            entity_id: conversationId
          }));
          await supabase.from("app_notifications").insert(notificationRows);
        }
      } catch (notifErr) {
        console.warn("Failed to notify staff about parent support message:", notifErr);
      }
    }

    setSending(false);
  };

  if (!child) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Please select a child to access support.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground">
          Chat with school support regarding {child.first_name || "your child"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5" />
            Support Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <>
              <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-4">
                {messages.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No messages yet. Start by sending a message below.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-3 max-w-[80%] ${
                          msg.sender_user_id === currentUserId
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "bg-background border"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.sender_user_id === currentUserId
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {format(new Date(msg.created_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your message..."
                  rows={2}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ParentSupportModule;
