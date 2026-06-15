import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageSquare, Send, User, ShieldAlert, Loader2 } from "lucide-react";

interface Feedback {
  id: string;
  author_user_id: string | null;
  author_role: string;
  content: string;
  created_at: string;
}

interface Props {
  complaintId: string;
  schoolId: string;
  authorRole: "sender" | "receiver" | "principal";
  /** Hide identities (used by principal viewing anonymous student complaints) */
  anonymousAuthors?: boolean;
  /** Optional name lookup for non-anonymous threads */
  nameLookup?: Record<string, string>;
  /** Use the masked principal view instead of the table */
  usePrincipalView?: boolean;
}

export function ComplaintThread({
  complaintId,
  schoolId,
  authorRole,
  anonymousAuthors = false,
  nameLookup = {},
  usePrincipalView = false,
}: Props) {
  const { user } = useSession();
  const [items, setItems] = useState<Feedback[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!complaintId) return;
    const source = usePrincipalView
      ? "complaint_feedbacks_principal_view"
      : "complaint_feedbacks";
    const { data, error } = await (supabase as any)
      .from(source)
      .select("id, author_user_id, author_role, content, created_at")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("Failed to load feedbacks:", error.message);
      return;
    }
    setItems((data ?? []) as Feedback[]);
    setLoading(false);
  };

  useEffect(() => {
    load();

    if (!complaintId) return;

    const channel = supabase
      .channel(`complaint_feedbacks_changes:${complaintId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaint_feedbacks",
          filter: `complaint_id=eq.${complaintId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [complaintId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  const submit = async () => {
    if (!user || !text.trim() || !complaintId) return;
    setSending(true);
    const textToSend = text.trim();
    setText(""); // Clear input early for responsive feel
    
    const { error } = await (supabase as any).from("complaint_feedbacks").insert({
      complaint_id: complaintId,
      school_id: schoolId,
      author_user_id: user.id,
      author_role: authorRole,
      content: textToSend,
    });
    
    setSending(false);
    if (error) {
      toast.error(error.message);
      setText(textToSend); // Restore text on error
      return;
    }

    // Notify appropriate participants
    try {
      const { data: complaintData } = await supabase
        .from("complaints")
        .select("sender_user_id, flow, school_id, student_id")
        .eq("id", complaintId)
        .single();
      
      if (complaintData) {
        const fallbackSchoolId = schoolId || complaintData.school_id;
        
        if (authorRole === "sender") {
          const { data: staffRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("school_id", fallbackSchoolId)
            .in("role", ["principal", "school_admin", "school_owner"]);
          const staffUserIds = Array.from(new Set((staffRoles ?? []).map(r => r.user_id).filter(Boolean)));
          
          let parentUserIds: string[] = [];
          if (complaintData.flow === "teacher_to_parent" && complaintData.student_id) {
            const { data: guardians } = await supabase
              .from("student_guardians")
              .select("user_id")
              .eq("student_id", complaintData.student_id);
            parentUserIds = Array.from(new Set((guardians ?? []).map(g => g.user_id).filter(Boolean)));
          }
          
          const recipients = Array.from(new Set([...staffUserIds, ...parentUserIds]));
          const notifs = recipients.map(uid => ({
            school_id: fallbackSchoolId,
            user_id: uid,
            type: "complaint",
            title: "New Feedback on Complaint",
            body: `New feedback posted on a complaint.`,
            entity_type: "complaints",
            entity_id: complaintId
          }));
          if (notifs.length > 0) {
            await supabase.from("app_notifications").insert(notifs);
          }
        } else if (authorRole === "receiver") {
          const { data: staffRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("school_id", fallbackSchoolId)
            .in("role", ["principal", "school_admin", "school_owner"]);
          const staffUserIds = Array.from(new Set((staffRoles ?? []).map(r => r.user_id).filter(Boolean)));
          
          const recipients = Array.from(new Set([
            ...(complaintData.sender_user_id ? [complaintData.sender_user_id] : []),
            ...staffUserIds
          ]));
          
          const notifs = recipients.map(uid => ({
            school_id: fallbackSchoolId,
            user_id: uid,
            type: "complaint",
            title: "New Feedback on Complaint",
            body: `A parent posted feedback on a complaint.`,
            entity_type: "complaints",
            entity_id: complaintId
          }));
          if (notifs.length > 0) {
            await supabase.from("app_notifications").insert(notifs);
          }
        } else if (authorRole === "principal") {
          let parentUserIds: string[] = [];
          if (complaintData.flow === "teacher_to_parent" && complaintData.student_id) {
            const { data: guardians } = await supabase
              .from("student_guardians")
              .select("user_id")
              .eq("student_id", complaintData.student_id);
            parentUserIds = Array.from(new Set((guardians ?? []).map(g => g.user_id).filter(Boolean)));
          }
          
          const recipients = Array.from(new Set([
            ...(complaintData.sender_user_id ? [complaintData.sender_user_id] : []),
            ...parentUserIds
          ]));
          
          const notifs = recipients.map(uid => ({
            school_id: fallbackSchoolId,
            user_id: uid,
            type: "complaint",
            title: "New Feedback on Complaint",
            body: `The principal/staff posted feedback on a complaint.`,
            entity_type: "complaints",
            entity_id: complaintId
          }));
          if (notifs.length > 0) {
            await supabase.from("app_notifications").insert(notifs);
          }
        }
      }
    } catch (notifErr) {
      console.warn("Failed to notify about complaint feedback:", notifErr);
    }

    toast.success("Message sent");
    load();
  };

  const getAuthorDisplay = (f: Feedback) => {
    if (anonymousAuthors && f.author_role === "sender") {
      return {
        name: "Anonymous Student",
        roleLabel: "Student",
        badgeStyle: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
        icon: ShieldAlert,
      };
    }
    
    const name = f.author_user_id && nameLookup[f.author_user_id] 
      ? nameLookup[f.author_user_id] 
      : f.author_role === "principal" 
        ? "Principal Desk" 
        : f.author_role === "sender" 
          ? "Submitter" 
          : "Respondent";
          
    const roleLabel = f.author_role.charAt(0).toUpperCase() + f.author_role.slice(1);
    
    let badgeStyle = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (f.author_role === "principal") {
      badgeStyle = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/50";
    } else if (f.author_role === "receiver") {
      badgeStyle = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/50";
    }

    return {
      name,
      roleLabel,
      badgeStyle,
      icon: User,
    };
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-muted/10 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span>Discussion History ({items.length})</span>
      </div>

      {/* Messages Area */}
      <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1 py-1 scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-6 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Loading messages...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground space-y-2">
            <MessageSquare className="h-8 w-8 mx-auto opacity-30 stroke-[1.5]" />
            <p className="text-xs font-medium">No replies yet. Start the conversation below.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((f) => {
              const meta = getAuthorDisplay(f);
              const isMe = f.author_user_id === user?.id || f.author_role === authorRole;
              const Icon = meta.icon;

              return (
                <div
                  key={f.id}
                  className={`flex flex-col max-w-[85%] ${
                    isMe ? "ml-auto items-end" : "mr-auto items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground font-medium">
                    {!isMe && (
                      <>
                        <span className="font-semibold text-foreground">{meta.name}</span>
                        <Badge variant="outline" className={`py-0 px-1 text-[9px] font-bold ${meta.badgeStyle}`}>
                          {meta.roleLabel}
                        </Badge>
                      </>
                    )}
                    {isMe && <span className="font-semibold text-foreground">You</span>}
                    <span>•</span>
                    <span>{format(new Date(f.created_at), "h:mm a")}</span>
                  </div>

                  <div
                    className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-300 ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-tr-none"
                        : "bg-card text-foreground border rounded-tl-none hover:border-slate-300/80 dark:hover:border-slate-700/80"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{f.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="space-y-2 pt-2 border-t">
        <div className="relative">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your response / status update note..."
            className="pr-12 text-sm resize-none rounded-xl border-slate-200/80 focus-visible:ring-primary focus-visible:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={sending || !text.trim()}
            className="absolute right-2.5 bottom-2.5 h-8 w-8 rounded-lg shadow-sm transition-transform active:scale-95 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground italic pl-1">
          Press Enter to send, Shift + Enter for a new line.
        </p>
      </div>
    </div>
  );
}

export default ComplaintThread;
