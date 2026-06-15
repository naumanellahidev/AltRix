import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchStudentLabelMap } from "@/lib/student-display";

type Conversation = { id: string; status: string };
type Message = { id: string; content: string; sender_user_id: string; created_at: string };

export function StudentSupportModule({ myStudent, schoolId }: { myStudent: any; schoolId: string }) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [studentLabel, setStudentLabel] = useState<string | null>(null);

  const refresh = async () => {
    if (myStudent.status !== "ready") return;
    const { data: conv } = await supabase
      .from("support_conversations")
      .select("id,status")
      .eq("school_id", schoolId)
      .eq("student_id", myStudent.studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setConversation((conv as Conversation) ?? null);

    if (!conv?.id) {
      setMessages([]);
      return;
    }
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("id,content,sender_user_id,created_at")
      .eq("school_id", schoolId)
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((msgs ?? []) as Message[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myStudent.status]);

  useEffect(() => {
    if (myStudent.status !== "ready") {
      setStudentLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const map = await fetchStudentLabelMap(supabase, { schoolId, studentIds: [myStudent.studentId] });
      if (cancelled) return;
      setStudentLabel(map[myStudent.studentId] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [myStudent.status, myStudent.studentId, schoolId]);

  useEffect(() => {
    if (myStudent.status !== "ready") return;
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`support:${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages", filter: `conversation_id=eq.${conversation.id}` },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, myStudent.status]);

  const ensureConversation = async () => {
    if (myStudent.status !== "ready") return null;
    if (conversation) return conversation;
    const { data } = await supabase
      .from("support_conversations")
      .insert({ school_id: schoolId, student_id: myStudent.studentId })
      .select("id,status")
      .maybeSingle();
    const c = (data as Conversation) ?? null;
    setConversation(c);
    return c;
  };

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      const conv = await ensureConversation();
      if (!conv) return;
      const authed = await supabase.auth.getUser();
      const senderId = authed.data.user?.id;
      if (!senderId) return;

      await supabase.from("support_messages").insert({
        school_id: schoolId,
        conversation_id: conv.id,
        sender_user_id: senderId,
        content,
      });

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
            body: `A student (${studentLabel || "anonymous"}) has sent a support message.`,
            entity_type: "support_conversations",
            entity_id: conv.id
          }));
          await supabase.from("app_notifications").insert(notificationRows);
        }
      } catch (notifErr) {
        console.warn("Failed to notify staff about support message:", notifErr);
      }

      setDraft("");
      // Realtime subscription will refresh.
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => conversation?.status ?? "no ticket", [conversation]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {studentLabel ? `${studentLabel} • ` : ""}Support ticket: {statusLabel}
        </p>
        <Button variant="soft" onClick={refresh}>Refresh</Button>
      </div>

      <div className="rounded-3xl bg-background p-4 shadow-elevated">
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className="rounded-2xl bg-surface p-3">
              <p className="text-sm">{m.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
            </div>
          ))}
          {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        </div>

        <div className="mt-4 flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your message…" />
          <Button variant="hero" disabled={busy} onClick={send}>Send</Button>
        </div>
      </div>
    </div>
  );
}
