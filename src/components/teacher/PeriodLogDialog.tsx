import { useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

interface PeriodLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: {
    id: string;
    subject_name: string;
    period_label: string;
    section_label: string | null;
  };
  schoolId: string;
  existingLog?: {
    id: string;
    status: string;
    notes: string | null;
    topics_covered: string | null;
  } | null;
  onSaved: () => void;
}

export function PeriodLogDialog({
  open,
  onOpenChange,
  entry,
  schoolId,
  existingLog,
  onSaved,
}: PeriodLogDialogProps) {
  const [status, setStatus] = useState<string>(existingLog?.status || "completed");
  const [notes, setNotes] = useState(existingLog?.notes || "");
  const [topicsCovered, setTopicsCovered] = useState(existingLog?.topics_covered || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast.error("Not authenticated");
      setSaving(false);
      return;
    }

    const logData = {
      school_id: schoolId,
      teacher_user_id: user.user.id,
      timetable_entry_id: entry.id,
      logged_at: new Date().toISOString().slice(0, 10),
      status,
      notes: notes.trim() || null,
      topic_covered: topicsCovered.trim() || null,
    };

    let error;
    if (existingLog) {
      const result = await (supabase as any)
        .from("teacher_period_logs")
        .update({
          status,
          notes: notes.trim() || null,
          topic_covered: topicsCovered.trim() || null,
        })
        .eq("id", existingLog.id);
      error = result.error;
    } else {
      const result = await (supabase as any)
        .from("teacher_period_logs")
        .upsert(logData, { onConflict: "school_id,timetable_entry_id,logged_at" });
      error = result.error;
    }

    setSaving(false);

    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }

    toast.success(existingLog ? "Period log updated" : "Period marked as completed");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {existingLog ? "Edit Period Log" : "Mark Period Complete"}
          </DialogTitle>
          <DialogDescription>
            {entry.subject_name} • {entry.period_label}
            {entry.section_label && ` • ${entry.section_label}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <RadioGroup value={status} onValueChange={setStatus} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="completed" id="completed" />
                <Label htmlFor="completed" className="flex items-center gap-1 cursor-pointer">
                  <Check className="h-4 w-4 text-primary" /> Completed
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="flex items-center gap-1 cursor-pointer">
                  <Clock className="h-4 w-4 text-muted-foreground" /> Partial
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cancelled" id="cancelled" />
                <Label htmlFor="cancelled" className="flex items-center gap-1 cursor-pointer">
                  <X className="h-4 w-4 text-destructive" /> Cancelled
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topics">Topics Covered</Label>
            <Textarea
              id="topics"
              placeholder="What topics did you cover today?"
              value={topicsCovered}
              onChange={(e) => setTopicsCovered(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any observations, issues, or reminders..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : existingLog ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
