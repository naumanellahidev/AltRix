import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchStudentLabelMap } from "@/lib/student-display";
import { CheckCircle, Clock, XCircle, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Conversation = {
  id: string;
  school_id: string;
  student_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Message = { id: string; content: string; sender_user_id: string; created_at: string };

export function SupportInbox({ schoolId }: { schoolId?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const refreshConversations = async () => {
    let q = supabase
      .from("support_conversations")
      .select("id,school_id,student_id,status,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (schoolId) q = q.eq("school_id", schoolId);
    const { data } = await q;
    const next = (data ?? []) as Conversation[];
    setConversations(next);

    const studentIds = next.map((c) => c.student_id);
    const map = await fetchStudentLabelMap(supabase, {
      schoolId,
      studentIds,
    });
    setLabels(map);
  };

  const refreshMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("id,content,sender_user_id,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    setMessages((data ?? []) as Message[]);
  };

  useEffect(() => {
    void refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    if (!selected?.id) return;
    void refreshMessages(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;

    const channel = supabase
      .channel(`support:staff:${selected.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_messages", filter: `conversation_id=eq.${selected.id}` },
        () => {
          void refreshMessages(selected.id);
          void refreshConversations();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Also subscribe to conversation updates
  useEffect(() => {
    if (!schoolId) return;

    const channel = supabase
      .channel(`support:conversations:${schoolId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_conversations", filter: `school_id=eq.${schoolId}` },
        () => {
          void refreshConversations();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;
    if (!selected?.id) return;
    setBusy(true);
    try {
      const authed = await supabase.auth.getUser();
      const senderId = authed.data.user?.id;
      if (!senderId) return;
      const { error } = await supabase.from("support_messages").insert({
        school_id: selected.school_id,
        conversation_id: selected.id,
        sender_user_id: senderId,
        content,
      });
      if (error) throw error;
      setDraft("");

      // Notify student
      try {
        const { data: student } = await supabase
          .from("students")
          .select("user_id")
          .eq("id", selected.student_id)
          .maybeSingle();

        if (student?.user_id) {
          await supabase.from("app_notifications").insert({
            school_id: selected.school_id,
            user_id: student.user_id,
            type: "support",
            title: "Support Ticket Reply",
            body: `School support has replied to your ticket.`,
            entity_type: "support_conversations",
            entity_id: selected.id
          });
        }
      } catch (e) {
        console.warn("Failed to notify student:", e);
      }

      // Notify guardians
      try {
        const { data: guardians } = await supabase
          .from("student_guardians")
          .select("user_id")
          .eq("student_id", selected.student_id);

        const parentIds = (guardians ?? []).map((g: any) => g.user_id).filter(Boolean);
        if (parentIds.length > 0) {
          const notifs = parentIds.map(pid => ({
            school_id: selected.school_id,
            user_id: pid,
            type: "support",
            title: "Support Ticket Reply",
            body: `School support has replied to the support ticket for your child.`,
            entity_type: "support_conversations",
            entity_id: selected.id
          }));
          await supabase.from("app_notifications").insert(notifs);
        }
      } catch (e) {
        console.warn("Failed to notify guardians:", e);
      }
      
      // If ticket was resolved, reopen it when staff replies
      if (selected.status === "resolved") {
        await updateStatus(selected.id, "open");
      }
    } catch (err: any) {
      toast.error("Failed to send", { description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (conversationId: string, newStatus: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("support_conversations")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (error) throw error;
      
      toast.success(`Ticket ${newStatus === "resolved" ? "resolved" : "reopened"}`);
      
      // Update local state
      setConversations(prev => 
        prev.map(c => c.id === conversationId ? { ...c, status: newStatus } : c)
      );
      if (selected?.id === conversationId) {
        setSelected(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err: any) {
      toast.error("Failed to update status", { description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (statusFilter !== "all") {
      list = list.filter(c => c.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => {
        const studentName = (labels[c.student_id] ?? c.student_id).toLowerCase();
        return studentName.includes(q);
      });
    }
    return list;
  }, [conversations, statusFilter, searchQuery, labels]);

  const selectedLabel = useMemo(() => {
    if (!selected) return "Select a ticket";
    const who = labels[selected.student_id] ?? selected.student_id;
    return who;
  }, [labels, selected]);

  const statusCounts = useMemo(() => {
    const open = conversations.filter(c => c.status === "open").length;
    const resolved = conversations.filter(c => c.status === "resolved").length;
    return { open, resolved, all: conversations.length };
  }, [conversations]);

  const getStatusBadge = (status: string) => {
    if (status === "open") {
      return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
    }
    if (status === "resolved") {
      return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20"><CheckCircle className="h-3 w-3 mr-1" />Resolved</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
      {/* Ticket List */}
      <div className="rounded-3xl bg-surface p-4 shadow-elevated flex flex-col h-[calc(100vh-200px)] max-h-[700px]">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display text-lg font-semibold tracking-tight">Support Inbox</p>
          <Button variant="ghost" size="icon" onClick={refreshConversations}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Search Input */}
        <div className="relative mb-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student name…"
            className="text-xs"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({statusCounts.all})
          </Button>
          <Button
            variant={statusFilter === "open" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("open")}
          >
            Open ({statusCounts.open})
          </Button>
          <Button
            variant={statusFilter === "resolved" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("resolved")}
          >
            Resolved ({statusCounts.resolved})
          </Button>
        </div>

        <ScrollArea className="flex-1 rounded-2xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConversations.map((c) => (
                <TableRow
                  key={c.id}
                  className={`cursor-pointer transition-colors ${selected?.id === c.id ? "bg-accent/40" : "hover:bg-muted/50"}`}
                  onClick={() => setSelected(c)}
                >
                  <TableCell className="font-medium">{labels[c.student_id] ?? c.student_id.slice(0, 8)}</TableCell>
                  <TableCell>{getStatusBadge(c.status)}</TableCell>
                </TableRow>
              ))}
              {filteredConversations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-muted-foreground py-8 text-center">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No tickets found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Conversation Detail */}
      <div className="rounded-3xl bg-surface p-4 shadow-elevated flex flex-col h-[calc(100vh-200px)] max-h-[700px]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">{selectedLabel}</p>
            {selected && (
              <div className="mt-1 flex items-center gap-2">
                {getStatusBadge(selected.status)}
                <span className="text-xs text-muted-foreground">
                  Last updated: {new Date(selected.updated_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
          {selected && (
            <div className="flex gap-2">
              {selected.status === "open" ? (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateStatus(selected.id, "resolved")}
                  disabled={busy}
                  className="text-primary hover:text-primary/80"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Resolve
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => updateStatus(selected.id, "open")}
                  disabled={busy}
                  className="text-warning hover:text-warning/80"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reopen
                </Button>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className="rounded-2xl bg-background p-3 border">
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
              </div>
            ))}
            {selected && messages.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              </div>
            )}
            {!selected && (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Pick a conversation to view messages.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {selected && (
          <div className="mt-4 flex gap-2 pt-4 border-t">
            <Input 
              value={draft} 
              onChange={(e) => setDraft(e.target.value)} 
              placeholder="Type your reply…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button variant="hero" disabled={busy || !draft.trim()} onClick={send}>
              Send
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
