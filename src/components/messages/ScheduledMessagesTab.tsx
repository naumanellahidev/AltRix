import { useEffect, useState } from "react";
import { format, isPast, parseISO } from "date-fns";
import { Clock, Trash2, Send, Loader2, CalendarClock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ScheduledMessage {
  id: string;
  subject: string | null;
  content: string;
  scheduled_at: string;
  status: string;
  recipient_user_ids: string[];
  created_at: string;
  message_type: string;
}

interface Props {
  schoolId: string;
  currentUserId: string;
  profileMap: Record<string, string>;
  onSendNow?: (message: ScheduledMessage) => void;
}

export function ScheduledMessagesTab({ schoolId, currentUserId, profileMap, onSendNow }: Props) {
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<ScheduledMessage | null>(null);

  const fetchScheduled = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("scheduled_messages")
      .select("*")
      .eq("school_id", schoolId)
      .eq("sender_user_id", currentUserId)
      .in("status", ["pending"])
      .order("scheduled_at", { ascending: true });

    setMessages((data as unknown as ScheduledMessage[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (schoolId && currentUserId) {
      fetchScheduled();
    }
  }, [schoolId, currentUserId]);

  const handleCancel = async (msg: ScheduledMessage) => {
    setCancellingId(msg.id);
    try {
      const { error } = await supabase
        .from("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", msg.id)
        .eq("sender_user_id", currentUserId);

      if (error) throw error;

      toast({ title: "Scheduled message cancelled" });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch (err: any) {
      toast({ title: "Failed to cancel", description: err.message, variant: "destructive" });
    } finally {
      setCancellingId(null);
      setConfirmCancel(null);
    }
  };

  const handleSendNow = async (msg: ScheduledMessage) => {
    setSendingId(msg.id);
    try {
      // Create the actual message now - use empty string if subject is null (DB requires non-null)
      const { data: newMsg, error: msgError } = await supabase
        .from("admin_messages")
        .insert({
          school_id: schoolId,
          sender_user_id: currentUserId,
          subject: msg.subject || "",
          content: msg.content,
          attachment_urls: [],
        })
        .select()
        .single();

      if (msgError) throw msgError;

      // Create recipients
      for (const recipientId of msg.recipient_user_ids) {
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
          body: msg.subject || msg.content.substring(0, 60),
          entity_type: "admin_message",
          entity_id: newMsg.id,
          created_by: currentUserId,
        });
      }

      // Mark scheduled message as sent
      await supabase
        .from("scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);

      toast({ title: "Message sent now" });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      onSendNow?.(msg);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const getRecipientNames = (ids: string[]) => {
    return ids.map((id) => profileMap[id] || "User").join(", ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarClock className="h-12 w-12 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">No scheduled messages</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Schedule a message by clicking the clock icon when composing
        </p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {messages.map((msg) => {
            const scheduledDate = parseISO(msg.scheduled_at);
            const isOverdue = isPast(scheduledDate);

            return (
              <div key={msg.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={isOverdue ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        {format(scheduledDate, "MMM d, h:mm a")}
                      </Badge>
                      {isOverdue && (
                        <Badge variant="outline" className="text-xs text-destructive border-destructive">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium line-clamp-1">
                      {msg.subject || "No subject"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {msg.content}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      To: {getRecipientNames(msg.recipient_user_ids)}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleSendNow(msg)}
                      disabled={sendingId === msg.id}
                    >
                      {sendingId === msg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Send className="mr-1 h-3 w-3" />
                          Send now
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => setConfirmCancel(msg)}
                      disabled={cancellingId === msg.id}
                    >
                      {cancellingId === msg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="mr-1 h-3 w-3" />
                          Cancel
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Cancel confirmation */}
      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will not be sent. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep scheduled</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmCancel && handleCancel(confirmCancel)}
            >
              Cancel message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
