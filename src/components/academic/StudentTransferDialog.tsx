import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ClassRow {
  id: string;
  name: string;
}

interface SectionRow {
  id: string;
  name: string;
  class_id: string;
}

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string | null;
  section_label?: string;
}

interface StudentTransferDialogProps {
  schoolId: string;
  students: StudentRow[];
  classes: ClassRow[];
  sections: SectionRow[];
  onTransferComplete: () => void;
}

export function StudentTransferDialog({
  schoolId,
  students,
  classes,
  sections,
  onTransferComplete,
}: StudentTransferDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const getSectionLabel = (section: SectionRow) => {
    const cls = classes.find((c) => c.id === section.class_id);
    return `${cls?.name ?? "Class"} • ${section.name}`;
  };

  const handleTransfer = async () => {
    if (!selectedStudentId || !targetSectionId) {
      toast.error("Select both a student and target section");
      return;
    }

    setTransferring(true);

    try {
      // First, check if student already has an enrollment
      const { data: existing } = await api
        .from("student_enrollments")
        .select("id, class_section_id")
        .eq("school_id", schoolId)
        .eq("student_id", selectedStudentId)
        .maybeSingle();

      if (existing) {
        // Update existing enrollment
        const { error } = await api
          .from("student_enrollments")
          .update({ class_section_id: targetSectionId })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new enrollment
        const { error } = await api
          .from("student_enrollments")
          .insert({
            school_id: schoolId,
            student_id: selectedStudentId,
            class_section_id: targetSectionId,
          });

        if (error) throw error;
      }

      const student = students.find((s) => s.id === selectedStudentId);
      const targetSection = sections.find((s) => s.id === targetSectionId);

      toast.success(
        `${student?.first_name} transferred to ${getSectionLabel(targetSection!)}`
      );

      setSelectedStudentId("");
      setTargetSectionId("");
      setOpen(false);
      onTransferComplete();
    } catch (error: any) {
      toast.error(error.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Transfer Student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transfer Student to Another Section
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Select Student</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span>{s.first_name} {s.last_name ?? ""}</span>
                      {s.section_label && (
                        <span className="text-xs text-muted-foreground">
                          ({s.section_label})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStudent && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm">
                <span className="font-medium">{selectedStudent.first_name} {selectedStudent.last_name ?? ""}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Current: {selectedStudent.section_label || "Not enrolled in any section"}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Transfer To</Label>
            <Select value={targetSectionId} onValueChange={setTargetSectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose target section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {getSectionLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleTransfer}
            disabled={!selectedStudentId || !targetSectionId || transferring}
            className="w-full"
          >
            {transferring ? "Transferring..." : "Confirm Transfer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
