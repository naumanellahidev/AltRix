import { useState } from "react";
import { Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
  grade_level: number | null;
}

interface EditClassDialogProps {
  classData: ClassRow;
  schoolId: string;
  onSaved: () => void;
}

export function EditClassDialog({ classData, schoolId, onSaved }: EditClassDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(classData.name);
  const [gradeLevel, setGradeLevel] = useState(classData.grade_level?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Class name is required");
      return;
    }

    setSaving(true);

    const { error } = await api
      .from("academic_classes")
      .update({
        name: name.trim(),
        grade_level: gradeLevel.trim() ? parseInt(gradeLevel, 10) : null,
      })
      .eq("id", classData.id)
      .eq("school_id", schoolId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Class updated");
    setSaving(false);
    setOpen(false);
    onSaved();
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      // Reset to current values when opening
      setName(classData.name);
      setGradeLevel(classData.grade_level?.toString() ?? "");
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Class</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Class Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grade 5"
            />
          </div>
          <div className="space-y-2">
            <Label>Grade Level</Label>
            <Input
              type="number"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="e.g. 5, 10"
              min={1}
              max={12}
            />
            <p className="text-xs text-muted-foreground">
              Optional numeric grade level (1-12)
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
