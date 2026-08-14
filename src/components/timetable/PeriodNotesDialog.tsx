import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, MapPin, Users } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

type PeriodInfo = {
  id: string;
  subject_name: string | null;
  room: string | null;
  section_label: string | null;
  period_label: string;
  day_label: string;
};

type PeriodNote = {
  id: string;
  topic_covered: string | null;
  notes: string | null;
  logged_at: string;
};

export function PeriodNotesDialog({
  open,
  onOpenChange,
  schoolId,
  entryId,
  periodInfo,
  existingNote,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  entryId: string;
  periodInfo: PeriodInfo;
  existingNote: PeriodNote | null;
  onSaved: () => void;
}) {
  const [topic, setTopic] = useState(existingNote?.topic_covered ?? "");
  const [notes, setNotes] = useState(existingNote?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTopic(existingNote?.topic_covered ?? "");
    setNotes(existingNote?.notes ?? "");
  }, [existingNote, open]);

  const handleSave = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic covered");
      return;
    }

    setSaving(true);
    try {
      const { data: user } = await api.auth.getUser();
      const userId = user.user?.id;

      if (existingNote) {
        const { error } = await api
          .from("timetable_period_logs" as any)
          .update({
            topic_covered: topic.trim(),
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingNote.id);

        if (error) throw error;
        toast.success("Period log updated");
      } else {
        const { error } = await api.from("timetable_period_logs" as any).insert({
          school_id: schoolId,
          timetable_entry_id: entryId,
          teacher_user_id: userId,
          topic_covered: topic.trim(),
          notes: notes.trim() || null,
          logged_at: new Date().toISOString(),
        });

        if (error) throw error;
        toast.success("Period log saved");
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Error saving period log:", err);
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] p-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            Period Log
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-4 sm:px-6">
          <div className="space-y-4 pb-4">
            {/* Period Info */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-muted/50 p-2.5 sm:p-3">
              <Badge variant="secondary" className="gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {periodInfo.day_label} • {periodInfo.period_label}
              </Badge>
              {periodInfo.subject_name && (
                <Badge variant="outline" className="text-xs">{periodInfo.subject_name}</Badge>
              )}
              {periodInfo.section_label && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Users className="h-3 w-3" />
                  {periodInfo.section_label}
                </Badge>
              )}
              {periodInfo.room && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <MapPin className="h-3 w-3" />
                  {periodInfo.room}
                </Badge>
              )}
            </div>

            {/* Topic */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="topic" className="text-sm">Topic Covered *</Label>
              <Input
                id="topic"
                placeholder="e.g., Chapter 5: Quadratic Equations"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="notes" className="text-sm">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Observations, homework assigned, student questions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 flex-col-reverse sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : existingNote ? "Update" : "Save Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
