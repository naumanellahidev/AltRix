import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { MessageCircle, Send } from "lucide-react";

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

  const load = async () => {
    setLoading(true);
    const source = usePrincipalView
      ? "complaint_feedbacks_principal_view"
      : "complaint_feedbacks";
    const { data, error } = await (supabase as any)
      .from(source)
      .select("id, author_user_id, author_role, content, created_at")
      .eq("complaint_id", complaintId)
      .order("created_at", { ascending: true });
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    setItems((data ?? []) as Feedback[]);
  };

  useEffect(() => {
    load();
  }, [complaintId]);

  const submit = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    const { error } = await (supabase as any).from("complaint_feedbacks").insert({
      complaint_id: complaintId,
      school_id: schoolId,
      author_user_id: user.id,
      author_role: authorRole,
      content: text.trim(),
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
    toast.success("Feedback posted");
    load();
  };

  const labelFor = (f: Feedback) => {
    if (anonymousAuthors && f.author_role === "sender") return "Anonymous student";
    if (f.author_user_id && nameLookup[f.author_user_id]) return nameLookup[f.author_user_id];
    return f.author_role.charAt(0).toUpperCase() + f.author_role.slice(1);
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        Conversation ({items.length})
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No feedback yet — start the conversation.</p>
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <div key={f.id} className="rounded-md bg-background p-2 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] capitalize">
                  {f.author_role}
                </Badge>
                <span>{labelFor(f)}</span>
                <span className="ml-auto">
                  {format(new Date(f.created_at), "MMM d, h:mm a")}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{f.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write feedback…"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={sending || !text.trim()} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {sending ? "Posting…" : "Post feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ComplaintThread;
