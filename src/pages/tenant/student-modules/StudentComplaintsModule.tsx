import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, ShieldAlert, Plus, EyeOff, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";
import { EditComplaintDialog } from "@/components/complaints/EditComplaintDialog";

interface Complaint {
  id: string;
  subject: string;
  content: string;
  category: string | null;
  status: string;
  created_at: string;
  resolution_note: string | null;
}

const CATEGORIES = ["Bullying", "Teacher", "Facilities", "Safety", "Academic", "Other"];

export default function StudentComplaintsModule({ schoolId }: { schoolId: string | null }) {
  const { user } = useSession();
  const [items, setItems] = useState<Complaint[]>([]);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (!schoolId || !user) return;
    const { data } = await (supabase as any)
      .from("complaints")
      .select("id, subject, content, category, status, created_at, resolution_note")
      .eq("school_id", schoolId)
      .eq("flow", "student_to_principal")
      .eq("sender_user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Complaint[]);
  };

  useEffect(() => {
    load();
  }, [schoolId, user?.id]);

  const submit = async () => {
    if (!schoolId || !user) return;
    if (!subject.trim() || !content.trim()) return toast.error("Subject and details required");
    setSending(true);
    const { error } = await (supabase as any).from("complaints").insert({
      school_id: schoolId,
      flow: "student_to_principal",
      sender_user_id: user.id,
      subject: subject.trim(),
      content: content.trim(),
      category,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Complaint sent anonymously to the principal");
    setSubject("");
    setContent("");
    setCategory("Other");
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Anonymous Complaints
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell the principal anything safely. Your identity is hidden — staff cannot see who sent
            it.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            <strong>Privacy guarantee:</strong> Your name, class, and account are never shown to
            principals or teachers. Only you can see your own submissions on this page.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your submissions ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">You haven't filed any complaints.</p>
          )}
          {items.map((c) => {
            const editable = c.status !== "resolved" && c.status !== "dismissed";
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.subject}</p>
                  {c.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {c.category}
                    </Badge>
                  )}
                  <Badge
                    variant={c.status === "resolved" ? "default" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {c.status.replace("_", " ")}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.content}</p>
                {c.resolution_note && (
                  <p className="mt-2 rounded bg-muted/50 p-2 text-sm">
                    <strong>Principal's note:</strong> {c.resolution_note}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {editable && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    {isOpen ? "Hide" : "Show"} feedback
                  </Button>
                </div>
                {isOpen && schoolId && (
                  <div className="mt-3">
                    <ComplaintThread
                      complaintId={c.id}
                      schoolId={schoolId}
                      authorRole="sender"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <EditComplaintDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        complaint={editing}
        categories={CATEGORIES}
        onSaved={load}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> File anonymous complaint
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Short summary"
              />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Explain what happened. The principal will see this without your name."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending}>
              {sending ? "Sending…" : "Send anonymously"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
