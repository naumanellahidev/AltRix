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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
}

interface SectionRow {
  id: string;
  name: string;
  class_id: string;
  room: string | null;
}

interface EditSectionDialogProps {
  section: SectionRow;
  classes: ClassRow[];
  schoolId: string;
  onSaved: () => void;
}

export function EditSectionDialog({ section, classes, schoolId, onSaved }: EditSectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(section.name);
  const [classId, setClassId] = useState(section.class_id);
  const [room, setRoom] = useState(section.room ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Section name is required");
      return;
    }
    if (!classId) {
      toast.error("Please select a class");
      return;
    }

    setSaving(true);

    const { error } = await api
      .from("class_sections")
      .update({
        name: name.trim(),
        class_id: classId,
        room: room.trim() || null,
      })
      .eq("id", section.id)
      .eq("school_id", schoolId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success("Section updated");
    setSaving(false);
    setOpen(false);
    onSaved();
  };

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setName(section.name);
      setClassId(section.class_id);
      setRoom(section.room ?? "");
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
          <DialogTitle>Edit Section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Section Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. A, B, Science"
            />
          </div>
          <div className="space-y-2">
            <Label>Belongs to Class *</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Room Number</Label>
            <Input
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="e.g. 101, Lab-A"
            />
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
