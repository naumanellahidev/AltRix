import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  complaint: {
    id: string;
    subject: string;
    content: string;
    category: string | null;
  } | null;
  categories: string[];
  onSaved: () => void;
}

export function EditComplaintDialog({
  open,
  onOpenChange,
  complaint,
  categories,
  onSaved,
}: Props) {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (complaint) {
      setSubject(complaint.subject);
      setContent(complaint.content);
      setCategory(complaint.category || categories[0] || "Other");
    }
  }, [complaint, categories]);

  const save = async () => {
    if (!complaint) return;
    if (!subject.trim() || !content.trim()) return toast.error("Subject and details required");
    setSaving(true);
    const { error } = await (supabase as any)
      .from("complaints")
      .update({
        subject: subject.trim(),
        content: content.trim(),
        category,
      })
      .eq("id", complaint.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Complaint updated");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit complaint</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Details</Label>
            <Textarea
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditComplaintDialog;
