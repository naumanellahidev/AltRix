import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Subject = { id: string; name: string };
type Section = { id: string; name: string; class_id: string };
type ClassRow = { id: string; name: string };

export type AssessmentType =
  | "quiz" | "test" | "assignment" | "project" | "exam"
  | "classwork" | "homework" | "midterm" | "final"
  | "practical" | "oral" | "presentation" | "lab";

export const ASSESSMENT_TYPES: { value: AssessmentType; label: string }[] = [
  { value: "quiz", label: "Quiz" },
  { value: "test", label: "Test" },
  { value: "assignment", label: "Assignment" },
  { value: "project", label: "Project" },
  { value: "exam", label: "Exam" },
  { value: "midterm", label: "Mid-term" },
  { value: "final", label: "Final" },
  { value: "classwork", label: "Classwork" },
  { value: "homework", label: "Homework" },
  { value: "practical", label: "Practical" },
  { value: "oral", label: "Oral" },
  { value: "presentation", label: "Presentation" },
  { value: "lab", label: "Lab" },
];

type AssessmentRow = {
  id: string;
  title: string;
  assessment_date: string;
  max_marks: number;
  term_label: string | null;
  subject_id: string | null;
  class_section_id: string;
  is_published: boolean;
  assessment_type: AssessmentType | null;
  weightage_percent: number | null;
  passing_marks: number | null;
};

type StudentRow = { id: string; first_name: string; last_name: string | null };
type MarkRow = { id: string; student_id: string; marks: number | null; remarks: string | null };

const assessmentSchema = z.object({
  class_section_id: z.string().min(1, "Section is required"),
  subject_id: z.string().min(1, "Subject is required"),
  title: z.string().trim().min(2, "Title is required"),
  term_label: z.string().trim().optional(),
  assessment_date: z.string().min(1, "Date is required"),
  max_marks: z.coerce.number().positive().max(1000),
  assessment_type: z.string().min(1, "Type is required"),
  weightage_percent: z.coerce.number().min(0).max(100).optional().nullable(),
  passing_marks: z.coerce.number().min(0).max(1000).optional().nullable(),
});

function safeNum(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function AssessmentManagerCard({
  schoolId,
}: {
  schoolId: string | null;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allowedSubjectIds, setAllowedSubjectIds] = useState<Set<string>>(new Set());

  const [filterSectionId, setFilterSectionId] = useState<string>("");
  const [filterSubjectId, setFilterSubjectId] = useState<string>("");
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [busy, setBusy] = useState(false);

  // editor state
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    class_section_id: "",
    subject_id: "",
    title: "",
    term_label: "",
    assessment_date: new Date().toISOString().slice(0, 10),
    max_marks: 100,
    assessment_type: "test" as AssessmentType,
    weightage_percent: "" as string | number,
    passing_marks: "" as string | number,
  });
  const [filterType, setFilterType] = useState<string>("");

  // marks entry
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [marks, setMarks] = useState<Map<string, MarkRow>>(new Map());
  const [marksDraft, setMarksDraft] = useState<Map<string, { marks: string; remarks: string }>>(new Map());

  const sectionLabelById = useMemo(() => {
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.id, `${classNameById.get(s.class_id) ?? "Class"} • ${s.name}`);
    return m;
  }, [classes, sections]);

  const subjectNameById = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const activeAssessment = useMemo(
    () => (activeAssessmentId ? assessments.find((a) => a.id === activeAssessmentId) ?? null : null),
    [activeAssessmentId, assessments]
  );

  const refreshStatic = async () => {
    if (!schoolId) return;
    const [{ data: c }, { data: s }, { data: subj }] = await Promise.all([
      supabase.from("academic_classes").select("id,name").eq("school_id", schoolId).order("name"),
      supabase.from("class_sections").select("id,name,class_id").eq("school_id", schoolId).order("name"),
      supabase.from("subjects").select("id,name").eq("school_id", schoolId).order("name"),
    ]);
    setClasses((c ?? []) as ClassRow[]);
    setSections((s ?? []) as Section[]);
    setSubjects((subj ?? []) as Subject[]);
  };

  const refreshAllowedSubjects = async (sectionId: string) => {
    if (!schoolId || !sectionId) {
      setAllowedSubjectIds(new Set());
      return;
    }
    const { data } = await supabase
      .from("class_section_subjects")
      .select("subject_id")
      .eq("school_id", schoolId)
      .eq("class_section_id", sectionId);
    setAllowedSubjectIds(new Set((data ?? []).map((r: any) => r.subject_id as string)));
  };

  const refreshAssessments = async () => {
    if (!schoolId) return;
    setBusy(true);
    try {
      let q = supabase
        .from("academic_assessments")
        .select("id,title,assessment_date,max_marks,term_label,subject_id,class_section_id,is_published,assessment_type,weightage_percent,passing_marks")
        .eq("school_id", schoolId)
        .order("assessment_date", { ascending: false })
        .limit(200);

      if (filterSectionId) q = q.eq("class_section_id", filterSectionId);
      if (filterSubjectId) q = q.eq("subject_id", filterSubjectId);
      if (filterTerm.trim()) q = q.eq("term_label", filterTerm.trim());
      if (filterFrom) q = q.gte("assessment_date", filterFrom);
      if (filterTo) q = q.lte("assessment_date", filterTo);
      if (filterType) q = q.eq("assessment_type", filterType);

      const { data, error } = await q;
      if (error) return toast.error(error.message);
      setAssessments((data ?? []) as any);
    } finally {
      setBusy(false);
    }
  };

  const refreshMarks = async (assessmentId: string) => {
    if (!schoolId) return;

    const a = assessments.find((x) => x.id === assessmentId);
    if (!a) return;

    const [{ data: enr }, { data: m, error: mErr }] = await Promise.all([
      supabase
        .from("student_enrollments")
        .select("student_id, students(id, first_name, last_name)")
        .eq("school_id", schoolId)
        .eq("class_section_id", a.class_section_id)
        .is("end_date", null)
        .limit(500),
      supabase
        .from("student_marks")
        .select("id,student_id,marks,remarks")
        .eq("school_id", schoolId)
        .eq("assessment_id", assessmentId)
        .limit(1000),
    ]);

    if (mErr) toast.error(mErr.message);

    const st = (enr ?? [])
      .map((r: any) => r.students)
      .filter(Boolean)
      .map((s: any) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name })) as StudentRow[];

    const mm = new Map<string, MarkRow>();
    for (const row of (m ?? []) as any[]) {
      mm.set(row.student_id, row as MarkRow);
    }
    setStudents(st);
    setMarks(mm);

    const draft = new Map<string, { marks: string; remarks: string }>();
    for (const s of st) {
      const existing = mm.get(s.id);
      draft.set(s.id, {
        marks: existing?.marks === null || existing?.marks === undefined ? "" : String(existing.marks),
        remarks: existing?.remarks ?? "",
      });
    }
    setMarksDraft(draft);
  };

  useEffect(() => {
    void refreshStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  useEffect(() => {
    void refreshAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, filterSectionId, filterSubjectId, filterTerm, filterFrom, filterTo, filterType]);

  useEffect(() => {
    void refreshAllowedSubjects(form.class_section_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, form.class_section_id]);

  const subjectsForSection = useMemo(() => {
    if (!allowedSubjectIds.size) return [];
    return subjects.filter((s) => allowedSubjectIds.has(s.id));
  }, [subjects, allowedSubjectIds]);

  const startCreate = () => {
    setEditId(null);
    setForm({
      class_section_id: filterSectionId || "",
      subject_id: filterSubjectId || "",
      title: "",
      term_label: filterTerm || "",
      assessment_date: new Date().toISOString().slice(0, 10),
      max_marks: 100,
      assessment_type: (filterType as AssessmentType) || "test",
      weightage_percent: "",
      passing_marks: "",
    });
  };

  const startEdit = (a: AssessmentRow) => {
    setEditId(a.id);
    setForm({
      class_section_id: a.class_section_id,
      subject_id: a.subject_id ?? "",
      title: a.title,
      term_label: a.term_label ?? "",
      assessment_date: a.assessment_date,
      max_marks: a.max_marks,
      assessment_type: (a.assessment_type as AssessmentType) || "test",
      weightage_percent: a.weightage_percent ?? "",
      passing_marks: a.passing_marks ?? "",
    });
  };

  const saveAssessment = async () => {
    if (!schoolId) return;

    const parsed = assessmentSchema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Invalid form");

    setBusy(true);
    try {
      const payload: any = {
        school_id: schoolId,
        class_section_id: parsed.data.class_section_id,
        subject_id: parsed.data.subject_id,
        title: parsed.data.title,
        term_label: parsed.data.term_label?.trim() || null,
        assessment_date: parsed.data.assessment_date,
        max_marks: parsed.data.max_marks,
        assessment_type: parsed.data.assessment_type,
        weightage_percent: parsed.data.weightage_percent === undefined || parsed.data.weightage_percent === null || (parsed.data.weightage_percent as any) === "" ? null : parsed.data.weightage_percent,
        passing_marks: parsed.data.passing_marks === undefined || parsed.data.passing_marks === null || (parsed.data.passing_marks as any) === "" ? null : parsed.data.passing_marks,
      };

      const q = editId
        ? supabase.from("academic_assessments").update(payload).eq("school_id", schoolId).eq("id", editId)
        : supabase.from("academic_assessments").insert(payload);

      const { error } = await q;
      if (error) return toast.error(error.message);

      toast.success(editId ? "Assessment updated" : "Assessment created");
      setEditId(null);
      await refreshAssessments();
    } finally {
      setBusy(false);
    }
  };

  const deleteAssessment = async (id: string) => {
    if (!schoolId) return;
    setBusy(true);
    try {
      // Safe delete: block if marks exist.
      const { data: marksAny } = await supabase
        .from("student_marks")
        .select("id")
        .eq("school_id", schoolId)
        .eq("assessment_id", id)
        .limit(1);

      if ((marksAny ?? []).length) {
        return toast.error("Can't delete: marks already exist for this assessment.");
      }

      const { error } = await supabase.from("academic_assessments").delete().eq("school_id", schoolId).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("Assessment deleted");
      if (activeAssessmentId === id) setActiveAssessmentId(null);
      await refreshAssessments();
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (a: AssessmentRow) => {
    if (!schoolId) return;
    const next = !a.is_published;
    const { error } = await supabase
      .from("academic_assessments")
      .update({ is_published: next, published_at: next ? new Date().toISOString() : null })
      .eq("school_id", schoolId)
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    await refreshAssessments();
  };

  const setDraft = (studentId: string, patch: Partial<{ marks: string; remarks: string }>) => {
    setMarksDraft((prev) => {
      const next = new Map(prev);
      const cur = next.get(studentId) ?? { marks: "", remarks: "" };
      next.set(studentId, { ...cur, ...patch });
      return next;
    });
  };

  const saveAllMarks = async () => {
    if (!schoolId || !activeAssessment) return;
    setBusy(true);
    try {
      const max = Number(activeAssessment.max_marks) || 100;
      const rows: any[] = [];
      for (const s of students) {
        const d = marksDraft.get(s.id);
        const n = safeNum(d?.marks);
        if (n !== null && (n < 0 || n > max)) {
          return toast.error(`Invalid marks for ${s.first_name}: must be 0–${max} (or blank).`);
        }
        rows.push({
          school_id: schoolId,
          assessment_id: activeAssessment.id,
          student_id: s.id,
          marks: n,
          remarks: (d?.remarks ?? "").trim() || null,
          graded_at: new Date().toISOString(),
        });
      }

      const { error } = await supabase.from("student_marks").upsert(rows, { onConflict: "school_id,assessment_id,student_id" });
      if (error) return toast.error(error.message);
      toast.success("Marks saved");
      await refreshMarks(activeAssessment.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="font-display text-xl">Assessments & Marks</CardTitle>
        <p className="text-sm text-muted-foreground">Create assessments, enter marks, and publish results.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <Select value={filterSectionId} onValueChange={setFilterSectionId}>
            <SelectTrigger>
              <SelectValue placeholder="Filter: section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {sectionLabelById.get(s.id) ?? s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterSubjectId}
            onValueChange={setFilterSubjectId}
            disabled={!subjects.length}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter: subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input value={filterTerm} onChange={(e) => setFilterTerm(e.target.value)} placeholder="Filter: term" />
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <Select value={filterType || "__all"} onValueChange={(v) => setFilterType(v === "__all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter: type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {ASSESSMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-muted-foreground">
            {busy ? "Working…" : `${assessments.length} assessments`}
          </div>
          <div className="flex gap-2">
            <Button
              variant="soft"
              onClick={() => {
                // normalize "All" sentinel
                if (filterSectionId === "__all") setFilterSectionId("");
                if (filterSubjectId === "__all") setFilterSubjectId("");
                void refreshAssessments();
              }}
              disabled={!schoolId}
            >
              Refresh
            </Button>
            <Button variant="hero" onClick={startCreate} disabled={!schoolId}>
              New assessment
            </Button>
          </div>
        </div>

        {(editId !== null || form.title || form.class_section_id || form.subject_id) && (
          <div className="rounded-2xl bg-surface-2 p-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
              <Select
                value={form.class_section_id}
                onValueChange={(v) => {
                  setForm((p) => ({ ...p, class_section_id: v, subject_id: "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sectionLabelById.get(s.id) ?? s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={form.subject_id}
                onValueChange={(v) => setForm((p) => ({ ...p, subject_id: v }))}
                disabled={!form.class_section_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {(subjectsForSection.length ? subjectsForSection : subjects).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Assessment title"
              />
              <Input
                value={form.term_label}
                onChange={(e) => setForm((p) => ({ ...p, term_label: e.target.value }))}
                placeholder="Term"
              />
              <Input
                type="date"
                value={form.assessment_date}
                onChange={(e) => setForm((p) => ({ ...p, assessment_date: e.target.value }))}
              />
              <Input
                type="number"
                value={String(form.max_marks)}
                onChange={(e) => setForm((p) => ({ ...p, max_marks: Number(e.target.value || 0) }))}
                placeholder="Max"
              />
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              <Select value={form.assessment_type} onValueChange={(v) => setForm((p) => ({ ...p, assessment_type: v as AssessmentType }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={String(form.weightage_percent)}
                onChange={(e) => setForm((p) => ({ ...p, weightage_percent: e.target.value }))}
                placeholder="Weightage % (optional)"
              />
              <Input
                type="number"
                value={String(form.passing_marks)}
                onChange={(e) => setForm((p) => ({ ...p, passing_marks: e.target.value }))}
                placeholder="Passing marks (optional)"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="hero" onClick={saveAssessment} disabled={busy || !schoolId}>
                {editId ? "Save changes" : "Create"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditId(null);
                  setForm((p) => ({ ...p, title: "" }));
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-auto rounded-2xl border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
                      {a.assessment_type ?? "test"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{sectionLabelById.get(a.class_section_id) ?? a.class_section_id}</TableCell>
                  <TableCell className="text-muted-foreground">{a.subject_id ? subjectNameById.get(a.subject_id) ?? "—" : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(a.assessment_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.max_marks}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{a.weightage_percent != null ? `${a.weightage_percent}%` : "—"}</TableCell>
                  <TableCell>
                    <Button variant="soft" size="sm" onClick={() => void togglePublish(a)}>
                      {a.is_published ? "Published" : "Draft"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setActiveAssessmentId(a.id);
                          await refreshMarks(a.id);
                        }}
                      >
                        Enter marks
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(a)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void deleteAssessment(a.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {assessments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-sm text-muted-foreground">
                    No assessments found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {activeAssessment && (
          <div className="rounded-3xl bg-surface p-5 shadow-elevated">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-display text-lg font-semibold">Marks Entry</p>
                <p className="text-sm text-muted-foreground">
                  {activeAssessment.title} • {sectionLabelById.get(activeAssessment.class_section_id) ?? "Section"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="soft" onClick={() => void refreshMarks(activeAssessment.id)} disabled={busy}>
                  Refresh
                </Button>
                <Button variant="hero" onClick={saveAllMarks} disabled={busy}>
                  Save all
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-auto rounded-2xl border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-[140px]">Marks</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s) => {
                    const d = marksDraft.get(s.id) ?? { marks: "", remarks: "" };
                    const existing = marks.get(s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.first_name} {s.last_name ?? ""}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={d.marks}
                            onChange={(e) => setDraft(s.id, { marks: e.target.value })}
                            placeholder={`0–${activeAssessment.max_marks}`}
                            inputMode="decimal"
                          />
                          {existing?.id && <p className="mt-1 text-xs text-muted-foreground">Saved</p>}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={d.remarks}
                            onChange={(e) => setDraft(s.id, { remarks: e.target.value })}
                            placeholder="Optional remarks"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {students.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No students found for this section.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
