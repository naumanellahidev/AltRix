import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

import type { SubjectRow } from "./SubjectCatalogCard";

export type SectionRow = { id: string; name: string; class_id: string };
export type ClassRow = { id: string; name: string };
export type ClassSectionSubjectRow = { id: string; class_section_id: string; subject_id: string };

export function SectionSubjectsCard({
  schoolId,
  classes,
  sections,
  subjects,
  classSectionSubjects,
  onChanged,
}: {
  schoolId: string | null;
  classes: ClassRow[];
  sections: SectionRow[];
  subjects: SubjectRow[];
  classSectionSubjects: ClassSectionSubjectRow[];
  onChanged: () => Promise<void>;
}) {
  const [sectionId, setSectionId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");

  const sectionLabel = (s: SectionRow) => `${classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • ${s.name}`;

  const subjectsInSection = useMemo(() => {
    if (!sectionId) return [];
    const ids = new Set(classSectionSubjects.filter((r) => r.class_section_id === sectionId).map((r) => r.subject_id));
    return subjects
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sectionId, classSectionSubjects, subjects]);

  const add = async () => {
    if (!schoolId) return;
    if (!sectionId) return toast.error("Pick a section");
    if (!subjectId) return toast.error("Pick a subject");

    const { error } = await api.from("class_section_subjects").insert({
      school_id: schoolId,
      class_section_id: sectionId,
      subject_id: subjectId,
    });
    if (error) return toast.error(error.message);
    toast.success("Subject added to section");
    setSubjectId("");
    await onChanged();
  };

  const remove = async (rowId: string) => {
    if (!schoolId) return;
    const { error } = await api.from("class_section_subjects").delete().eq("school_id", schoolId).eq("id", rowId);
    if (error) return toast.error(error.message);
    toast.success("Subject removed from section");
    await onChanged();
  };

  const rowsForSection = useMemo(
    () => classSectionSubjects.filter((r) => r.class_section_id === sectionId),
    [classSectionSubjects, sectionId]
  );

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="font-display text-xl">Subjects per Section</CardTitle>
        <p className="text-sm text-muted-foreground">Students stay in the same section; teachers/subjects vary within it.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Select value={sectionId} onValueChange={(v) => setSectionId(v)}>
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
              <SelectValue placeholder="Pick subject" />
            </SelectTrigger>
            <SelectContent>
              {subjects
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Button variant="hero" onClick={add}>
            <Plus className="mr-2 h-4 w-4" /> Add to section
          </Button>
        </div>

        <ScrollArea className="h-[250px] rounded-2xl border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsForSection.map((r) => {
                const subj = subjects.find((s) => s.id === r.subject_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{subj?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => remove(r.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {sectionId && rowsForSection.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    No subjects assigned to this section.
                  </TableCell>
                </TableRow>
              )}
              {!sectionId && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground">
                    Pick a section to manage its subjects.
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
