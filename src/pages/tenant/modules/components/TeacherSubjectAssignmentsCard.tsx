import { useMemo, useState } from "react";
import { UserCog } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

import type { SubjectRow } from "./SubjectCatalogCard";
import type { ClassRow, SectionRow, ClassSectionSubjectRow } from "./SectionSubjectsCard";

export type TeacherRow = { user_id: string; email: string; display_name: string | null };
export type TeacherSubjectAssignmentRow = {
  id: string;
  class_section_id: string;
  subject_id: string;
  teacher_user_id: string;
};

export function TeacherSubjectAssignmentsCard({
  schoolId,
  classes,
  sections,
  subjects,
  classSectionSubjects,
  teachers,
  teacherSubjectAssignments,
  onChanged,
}: {
  schoolId: string | null;
  classes: ClassRow[];
  sections: SectionRow[];
  subjects: SubjectRow[];
  classSectionSubjects: ClassSectionSubjectRow[];
  teachers: TeacherRow[];
  teacherSubjectAssignments: TeacherSubjectAssignmentRow[];
  onChanged: () => Promise<void>;
}) {
  const [sectionId, setSectionId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [teacherUserId, setTeacherUserId] = useState<string>("");

  const sectionLabel = (s: SectionRow) => `${classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • ${s.name}`;

  const subjectIdsForSection = useMemo(() => {
    if (!sectionId) return new Set<string>();
    return new Set(classSectionSubjects.filter((r) => r.class_section_id === sectionId).map((r) => r.subject_id));
  }, [classSectionSubjects, sectionId]);

  const subjectsForSection = useMemo(() => {
    const ids = subjectIdsForSection;
    return subjects
      .filter((s) => ids.has(s.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, subjectIdsForSection]);

  const currentAssignmentsForSection = useMemo(
    () => teacherSubjectAssignments.filter((r) => r.class_section_id === sectionId),
    [teacherSubjectAssignments, sectionId]
  );

  const assign = async () => {
    if (!schoolId) return;
    if (!sectionId) return toast.error("Pick a section");
    if (!subjectId) return toast.error("Pick a subject");
    if (!teacherUserId) return toast.error("Pick a teacher");
    if (!subjectIdsForSection.has(subjectId)) return toast.error("That subject is not added to the selected section yet.");

    const { error } = await api
      .from("teacher_subject_assignments")
      .upsert(
        {
          school_id: schoolId,
          class_section_id: sectionId,
          subject_id: subjectId,
          teacher_user_id: teacherUserId,
        },
        { onConflict: "school_id,class_section_id,subject_id" }
      );
    if (error) return toast.error(error.message);
    toast.success("Teacher assigned to subject");
    await onChanged();
  };

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="font-display text-xl">Teacher per Subject (Section)</CardTitle>
        <p className="text-sm text-muted-foreground">One teacher per subject in a section; timetable updates automatically.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <Select value={sectionId} onValueChange={(v) => {
            setSectionId(v);
            setSubjectId("");
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Pick section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {sectionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder={sectionId ? "Pick subject" : "Pick section first"} />
            </SelectTrigger>
            <SelectContent>
              {subjectsForSection.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={teacherUserId} onValueChange={setTeacherUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick teacher" />
            </SelectTrigger>
            <SelectContent>
              {teachers.map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.display_name ?? t.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="hero" onClick={assign}>
            <UserCog className="mr-2 h-4 w-4" /> Assign
          </Button>
        </div>

        <ScrollArea className="h-[250px] rounded-2xl border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Teacher</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectionId && currentAssignmentsForSection.map((r) => {
                const subj = subjects.find((s) => s.id === r.subject_id);
                const teacher = teachers.find((t) => t.user_id === r.teacher_user_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{subj?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{teacher?.display_name ?? teacher?.email ?? "—"}</TableCell>
                  </TableRow>
                );
              })}

              {sectionId && currentAssignmentsForSection.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No teacher-subject assignments for this section yet.
                  </TableCell>
                </TableRow>
              )}
              {!sectionId && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    Pick a section to see and manage assignments.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
