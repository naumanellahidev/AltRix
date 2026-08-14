import { useState, useEffect } from "react";
import { Send, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

interface Guardian {
  id: string;
  user_id: string;
  full_name: string;
}

interface QuickMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  schoolId: string;
}

export function QuickMessageDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  schoolId,
}: QuickMessageDialogProps) {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open || !studentId) return;

    const fetchGuardians = async () => {
      setLoading(true);
      const { data } = await api
        .from("student_guardians")
        .select("id, user_id, full_name")
        .eq("student_id", studentId)
        .not("user_id", "is", null);

      setGuardians((data as Guardian[]) || []);
      setLoading(false);
    };

    fetchGuardians();
    // Pre-fill subject with student context
    setSubject(`Regarding ${studentName}'s Academic Progress`);
    setContent("");
  }, [open, studentId, studentName]);

  const handleSend = async () => {
    if (!content.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }

    if (guardians.length === 0) {
      toast({ title: "No parent accounts linked to this student", variant: "destructive" });
      return;
    }

    setSending(true);

    const { data: user } = await api.auth.getUser();
    const userId = user.user?.id;

    if (!userId) {
      toast({ title: "Authentication error", variant: "destructive" });
      setSending(false);
      return;
    }

    // Send message to all guardians with accounts
    const messages = guardians.map((g) => ({
      school_id: schoolId,
      student_id: studentId,
      sender_user_id: userId,
      recipient_user_id: g.user_id,
      subject: subject.trim() || null,
      content: content.trim(),
    }));

    const { error } = await api.from("parent_messages").insert(messages);

    if (error) {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }

    toast({
      title: "Message sent",
      description: `Sent to ${guardians.length} parent(s) of ${studentName}`,
    });
    setSending(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Message Parent of {studentName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading guardians...</p>
          ) : guardians.length === 0 ? (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                No parent accounts are linked to this student. Ask your administrator to set up
                parent accounts for {studentName}.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Sending to:</p>
                <div className="flex flex-wrap gap-1">
                  {guardians.map((g) => (
                    <span key={g.id} className="text-sm font-medium">
                      {g.full_name}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Optional subject"
                />
              </div>

              <div>
                <Label htmlFor="content">Message *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  placeholder="Write your message to the parent..."
                />
              </div>

              <Button onClick={handleSend} disabled={sending || !content.trim()} className="w-full">
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Sending..." : "Send Message"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
