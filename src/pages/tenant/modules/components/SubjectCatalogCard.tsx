import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export type SubjectRow = { id: string; name: string; code: string | null };

export function SubjectCatalogCard({
  schoolId,
  subjects,
  onChanged,
}: {
  schoolId: string | null;
  subjects: SubjectRow[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const sorted = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name)),
    [subjects]
  );

  const create = async () => {
    if (!schoolId) return;
    const n = name.trim();
    if (!n) return toast.error("Subject name required");
    const c = code.trim();

    const { error } = await supabase
      .from("subjects")
      .insert({ school_id: schoolId, name: n, code: c || null });
    if (error) return toast.error(error.message);
    setName("");
    setCode("");
    toast.success("Subject created");
    await onChanged();
  };

  const remove = async (subjectId: string) => {
    if (!schoolId) return;
    if (!confirm("Remove this subject? It will be unassigned from all sections and teachers.")) return;

    // Clean up dependent rows first to avoid FK violations
    const cleanups = await Promise.all([
      supabase.from("teacher_subject_assignments").delete().eq("school_id", schoolId).eq("subject_id", subjectId),
      supabase.from("class_section_subjects").delete().eq("school_id", schoolId).eq("subject_id", subjectId),
      supabase.from("academic_assessments").delete().eq("school_id", schoolId).eq("subject_id", subjectId),
    ]);
    const cleanupErr = cleanups.find((r) => r.error)?.error;
    if (cleanupErr) return toast.error(cleanupErr.message);

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("school_id", schoolId)
      .eq("id", subjectId);
    if (error) return toast.error(error.message);
    toast.success("Subject removed");
    await onChanged();
  };

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="font-display text-xl">Subject Catalog</CardTitle>
        <p className="text-sm text-muted-foreground">School-wide list of subjects (reused by sections)</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Subject name (e.g. Mathematics)"
            className="md:col-span-3"
          />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code (optional)"
            className="md:col-span-1"
          />
          <Button variant="hero" onClick={create} className="md:col-span-1">
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>

        <ScrollArea className="h-[280px] rounded-2xl border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.code ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => remove(s.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No subjects yet.
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
