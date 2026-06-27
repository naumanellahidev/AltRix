import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, CalendarDays, AlertTriangle, FileDown, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ALL_FIELDS, buildDatesheetPDF, DatesheetField } from "./datesheetPdf";

const SECTION_ALL = "__all";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  examId: string;
  examName: string;
  canManage: boolean;
}

interface Row {
  id: string;
  subject_id: string | null;
  class_section_id: string | null;
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number | null;
  passing_marks: number | null;
  room: string | null;
  instructions: string | null;
  invigilator_user_id: string | null;
}

export default function ExamDatesheetDialog({ open, onOpenChange, schoolId, examId, examName, canManage }: Props) {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const { user } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string; class_name?: string }[]>([]);
  const [staff, setStaff] = useState<{ user_id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [exportSection, setExportSection] = useState<string>(SECTION_ALL);
  const [schoolName, setSchoolName] = useState<string>("");
  const [sending, setSending] = useState(false);

  // PDF options
  const [fields, setFields] = useState<DatesheetField[]>(ALL_FIELDS.filter((f) => f.default).map((f) => f.key));
  const [paperQR, setPaperQR] = useState(false);
  const [hallTicketQR, setHallTicketQR] = useState(true);


  const loadConflicts = async () => {
    const { data } = await (supabase as any).rpc("check_exam_subject_conflicts", { _school_id: schoolId, _exam_id: examId });
    setConflicts(data || []);
  };

  const load = async () => {
    if (!open) return;
    setLoading(true);
    const [subs, secs, ds, dir, sch] = await Promise.all([
      (supabase as any).from("subjects").select("id,name").eq("school_id", schoolId).order("name"),
      (supabase as any).from("class_sections").select("id,name,class_id,academic_classes(name)").eq("school_id", schoolId),
      (supabase as any).from("exam_subjects").select("*").eq("exam_id", examId).order("exam_date").order("start_time"),
      (supabase as any).rpc("get_school_user_directory", { _school_id: schoolId }),
      (supabase as any).from("schools").select("name").eq("id", schoolId).maybeSingle(),
    ]);
    setSubjects(subs.data || []);
    setSections((secs.data || []).map((s: any) => ({ id: s.id, name: s.name, class_name: s.academic_classes?.name })));
    setRows(ds.data || []);
    setStaff((dir.data || []).map((d: any) => ({ user_id: d.user_id, display_name: d.display_name })));
    setSchoolName(sch.data?.name || "");
    setLoading(false);
    loadConflicts();
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [open, examId]);

  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    conflicts.forEach((c: any) => { s.add(c.a_id); s.add(c.b_id); });
    return s;
  }, [conflicts]);

  const addRow = async () => {
    const { data, error } = await (supabase as any)
      .from("exam_subjects")
      .insert({ school_id: schoolId, exam_id: examId, max_marks: 100, passing_marks: 40, duration_minutes: 60 })
      .select().single();
    if (error) return toast.error(error.message);
    setRows((r) => [...r, data]);
  };

  // Add-by-section dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addSection, setAddSection] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const generateForSection = async () => {
    if (!addSection) return toast.error("Pick a class/section");
    setGenerating(true);
    try {
      // Resolve subjects linked to this section (try section_subjects then class_section_subjects)
      let subjIds: string[] = [];
      const ss = await (supabase as any).from("section_subjects").select("subject_id").eq("class_section_id", addSection);
      if (!ss.error && ss.data?.length) subjIds = ss.data.map((x: any) => x.subject_id);
      if (subjIds.length === 0) {
        const css = await (supabase as any).from("class_section_subjects").select("subject_id").eq("class_section_id", addSection);
        if (!css.error && css.data?.length) subjIds = css.data.map((x: any) => x.subject_id);
      }
      if (subjIds.length === 0) {
        toast.error("No subjects assigned to this section. Add subjects first or use 'Add blank paper'.");
        return;
      }
      // Skip subjects already added for this section in this exam
      const existing = new Set(
        rows.filter((r) => r.class_section_id === addSection && r.subject_id).map((r) => r.subject_id as string)
      );
      const toInsert = subjIds
        .filter((id) => !existing.has(id))
        .map((subject_id) => ({
          school_id: schoolId, exam_id: examId, class_section_id: addSection,
          subject_id, max_marks: 100, passing_marks: 40, duration_minutes: 60,
        }));
      if (toInsert.length === 0) { toast.info("All subjects for this section are already on the datesheet."); setAddOpen(false); return; }
      const { data, error } = await (supabase as any).from("exam_subjects").insert(toInsert).select();
      if (error) throw error;
      setRows((r) => [...r, ...(data || [])]);
      toast.success(`Added ${data?.length || 0} paper${(data?.length || 0) !== 1 ? "s" : ""}`);
      setAddOpen(false); setAddSection("");
      loadConflicts();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally { setGenerating(false); }
  };

  const updateRow = async (id: string, patch: Partial<Row>) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await (supabase as any).from("exam_subjects").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else loadConflicts();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("exam_subjects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Paper removed");
    loadConflicts();
  };

  const lookups = useMemo(() => ({
    subjects: new Map(subjects.map((s) => [s.id, s.name])),
    sections: new Map(sections.map((s) => [s.id, `${s.class_name ? s.class_name + " — " : ""}${s.name}`])),
    staff: new Map(staff.map((s) => [s.user_id, s.display_name])),
  }), [subjects, sections, staff]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "section">("all");

  const exportPdf = async () => {
    const useSection = exportScope === "section" && exportSection !== SECTION_ALL ? exportSection : null;
    const filtered = useSection ? rows.filter((r) => r.class_section_id === useSection) : rows;
    if (filtered.length === 0) return toast.error("No papers to export for this scope");
    if (fields.length === 0) return toast.error("Pick at least one column");
    const sectionLabel = useSection ? lookups.sections.get(useSection) : undefined;
    const doc = await buildDatesheetPDF(filtered, { schoolName, examName, sectionLabel }, { fields, includePaperQR: paperQR }, lookups);
    doc.save(`datesheet-${examName.replace(/\s+/g, "_")}${sectionLabel ? "-" + sectionLabel.replace(/\s+/g, "_") : "-all"}.pdf`);
    toast.success("Datesheet exported");
    setExportOpen(false);
  };

  // scheduleAt: if provided (ISO), notifications are deferred and processed by cron at that time
  const sendToParents = async (scheduleAt?: string | null) => {
    if (fields.length === 0) return toast.error("Pick at least one column");
    setSending(true);
    try {
      const sectionIds = Array.from(new Set(rows.map((r) => r.class_section_id).filter(Boolean))) as string[];
      if (sectionIds.length === 0) { toast.error("No papers with sections assigned"); return; }
      const { data: enrolls, error: eErr } = await (supabase as any)
        .from("student_enrollments")
        .select("student_id,class_section_id,students!inner(id,first_name,last_name,student_code,school_id)")
        .in("class_section_id", sectionIds)
        .is("end_date", null)
        .eq("school_id", schoolId);
      if (eErr) throw eErr;
      const students = (enrolls || []) as any[];
      if (students.length === 0) { toast.error("No enrolled students found"); return; }

      let success = 0; let failed = 0; let firstErr = "";
      const completedSections = new Set<string>();
      for (const en of students) {
        const studentRows = rows.filter((r) => r.class_section_id === en.class_section_id);
        if (studentRows.length === 0) continue;
        const secLabel = lookups.sections.get(en.class_section_id);
        const studentLabel = `${en.students.first_name} ${en.students.last_name}`;
        const slug = schoolSlug || schoolId;
        const hallTicketUrl = `${window.location.origin}/${slug}/verify-ticket/${examId}/${en.student_id}`;
        try {
          const doc = await buildDatesheetPDF(studentRows, {
            schoolName, examName, sectionLabel: secLabel,
            studentLabel, studentCode: en.students.student_code,
            hallTicketUrl: hallTicketQR ? hallTicketUrl : undefined,
          }, { fields, includePaperQR: paperQR, includeHallTicketQR: hallTicketQR }, lookups);
          const blob = doc.output("blob");
          const path = `${schoolId}/${examId}/${en.student_id}.pdf`;
          const { error: upErr } = await (supabase as any).storage.from("exam-datesheets").upload(path, blob, {
            upsert: true, contentType: "application/pdf",
          });
          if (upErr) throw upErr;
          const { error: distErr } = await (supabase as any).from("exam_datesheet_distributions").upsert({
            school_id: schoolId, exam_id: examId, student_id: en.student_id,
            class_section_id: en.class_section_id, file_path: path, generated_by: user?.id ?? null,
            generated_at: new Date().toISOString(),
            notify_at: scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString(),
            notified_at: scheduleAt ? null : new Date().toISOString(),
          }, { onConflict: "exam_id,student_id" } as any);
          if (distErr) throw distErr;

          completedSections.add(en.class_section_id);
          success++;
        } catch (err: any) {
          console.error("send fail", en.student_id, err);
          if (!firstErr) firstErr = err?.message || String(err);
          failed++;
        }
      }
      let notified = 0;
      if (success > 0 && !scheduleAt) {
        for (const sectionId of Array.from(completedSections)) {
          const { data: count, error: notifyErr } = await (supabase as any).rpc("notify_exam_datesheet_ready", {
            _exam_id: examId,
            _class_section_id: sectionId,
          });
          if (notifyErr) throw notifyErr;
          notified += Number(count || 0);
        }
      }
      if (success > 0) {
        if (scheduleAt) toast.success(`Scheduled ${success} datesheet${success !== 1 ? "s" : ""} for ${format(new Date(scheduleAt), "PPp")}${failed ? ` (${failed} failed)` : ""}`);
        else toast.success(`Sent to ${success} student${success !== 1 ? "s" : ""}; ${notified} concerned people notified${failed ? ` (${failed} failed)` : ""}`);
      }
      if (success === 0 && failed > 0) toast.error(`All ${failed} failed${firstErr ? `: ${firstErr}` : ""}`);
      loadSchedules();
    } catch (e: any) {
      toast.error(e.message || "Send failed");
    } finally { setSending(false); }
  };

  // Scheduled distributions list
  const [schedules, setSchedules] = useState<any[]>([]);
  const loadSchedules = async () => {
    const { data } = await (supabase as any)
      .from("exam_datesheet_distributions")
      .select("id,student_id,notify_at,notified_at,class_section_id,students(first_name,last_name)")
      .eq("exam_id", examId)
      .order("notify_at", { ascending: true });
    setSchedules(data || []);
  };
  useEffect(() => { if (open) loadSchedules(); /* eslint-disable-next-line */ }, [open, examId]);
  const updateSchedule = async (id: string, notify_at: string | null) => {
    const { error } = await (supabase as any).from("exam_datesheet_distributions")
      .update({ notify_at: notify_at ? new Date(notify_at).toISOString() : null, notified_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Schedule updated"); loadSchedules();
  };
  const cancelSchedule = async (id: string) => {
    const { error } = await (supabase as any).from("exam_datesheet_distributions")
      .update({ notify_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Schedule cancelled"); loadSchedules();
  };

  // Schedule dialog
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>("");

  const toggleField = (k: DatesheetField) =>
    setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));





  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Datesheet — {examName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline"><Settings2 className="mr-1 h-4 w-4" />PDF options</Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Columns</p>
                  <div className="space-y-1.5">
                    {ALL_FIELDS.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={fields.includes(f.key)} onCheckedChange={() => toggleField(f.key)} />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 border-t pt-3 space-y-1.5">
                    <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">QR codes</p>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={paperQR} onCheckedChange={(v) => setPaperQR(!!v)} /> Per-paper QR
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={hallTicketQR} onCheckedChange={(v) => setHallTicketQR(!!v)} /> Hall ticket link QR
                    </label>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" variant="outline" onClick={() => { setExportScope("all"); setExportSection(SECTION_ALL); setExportOpen(true); }}>
                <FileDown className="mr-1 h-4 w-4" />Export PDF
              </Button>
              {canManage && (
                <>
                  <Button size="sm" variant="default" disabled={sending} onClick={() => sendToParents()}>
                    <Send className="mr-1 h-4 w-4" />{sending ? "Sending…" : "Send now"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={sending} onClick={() => { setScheduleAt(""); setScheduleOpen(true); }}>
                    <CalendarDays className="mr-1 h-4 w-4" />Schedule send
                  </Button>
                </>
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-1 h-4 w-4" />Add blank paper</Button>
                <Button size="sm" onClick={() => { setAddSection(""); setAddOpen(true); }}>
                  <Plus className="mr-1 h-4 w-4" />Generate for class
                </Button>
              </div>
            )}
          </div>

          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Export datesheet PDF</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choose what to include in the PDF.</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={exportScope === "all"} onChange={() => setExportScope("all")} />
                    Whole school (all classes & sections)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={exportScope === "section"} onChange={() => setExportScope("section")} />
                    Specific class / section
                  </label>
                </div>
                {exportScope === "section" && (
                  <Select value={exportSection} onValueChange={setExportSection}>
                    <SelectTrigger><SelectValue placeholder="Choose class / section" /></SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.class_name ? `${s.class_name} — ` : ""}{s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Button>
                <Button onClick={exportPdf} disabled={exportScope === "section" && (exportSection === SECTION_ALL || !exportSection)}>
                  <FileDown className="mr-1 h-4 w-4" />Download
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Generate datesheet for a class</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Pick a class/section. We'll add one paper per subject assigned to it — you can then set dates, times and rooms.</p>
                <Select value={addSection} onValueChange={setAddSection}>
                  <SelectTrigger><SelectValue placeholder="Choose class / section" /></SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.class_name ? `${s.class_name} — ` : ""}{s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={generateForSection} disabled={generating || !addSection}>
                  {generating ? "Generating…" : "Generate papers"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Schedule send to parents</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">PDFs are generated now and stored. Parents will be notified at the date/time you choose. You can change or cancel the schedule afterwards in the list below.</p>
                <div>
                  <label className="text-sm font-medium">Notify parents at</label>
                  <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
                <Button disabled={!scheduleAt || sending} onClick={async () => { await sendToParents(scheduleAt); setScheduleOpen(false); }}>
                  <CalendarDays className="mr-1 h-4 w-4" />{sending ? "Saving…" : "Schedule"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {schedules.length > 0 && (
            <div className="rounded-md border">
              <div className="px-3 py-2 border-b bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                Scheduled / sent datesheets ({schedules.length})
              </div>
              <div className="max-h-44 overflow-y-auto">
                <Table>
                  <TableBody>
                    {schedules.map((s) => {
                      const pending = s.notify_at && !s.notified_at;
                      const sent = !!s.notified_at;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs">
                            <span className="font-semibold text-slate-800">{lookups.sections.get(s.class_section_id) || "—"}</span>
                            {s.students && <span className="block text-[10px] text-slate-400">{s.students.first_name} {s.students.last_name || ""}</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {sent ? `Sent ${format(new Date(s.notified_at), "PPp")}`
                              : pending ? `Scheduled ${format(new Date(s.notify_at), "PPp")}`
                              : "Not scheduled"}
                          </TableCell>
                          <TableCell className="w-[200px]">
                            {canManage && !sent && (
                              <Input type="datetime-local" className="h-7 text-xs"
                                defaultValue={s.notify_at ? new Date(s.notify_at).toISOString().slice(0,16) : ""}
                                onBlur={(e) => e.target.value && e.target.value !== (s.notify_at ? new Date(s.notify_at).toISOString().slice(0,16) : "") && updateSchedule(s.id, e.target.value)} />
                            )}
                          </TableCell>
                          <TableCell className="w-[80px]">
                            {canManage && pending && (
                              <Button size="sm" variant="ghost" onClick={() => cancelSchedule(s.id)}>Cancel</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}


          {conflicts.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{conflicts.length} scheduling conflict{conflicts.length !== 1 && "s"} detected</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc pl-5 text-xs space-y-0.5">
                  {conflicts.slice(0, 5).map((c: any, i: number) => (
                    <li key={i}>
                      {c.conflict_type === "room" ? `Room "${c.room}"` : "Invigilator"} double-booked on {c.exam_date} ({c.a_start?.slice(0,5)}–{c.a_end?.slice(0,5)} vs {c.b_start?.slice(0,5)}–{c.b_end?.slice(0,5)})
                    </li>
                  ))}
                  {conflicts.length > 5 && <li>…and {conflicts.length - 5} more</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class / Section</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Dur (min)</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Pass</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Invigilator</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                    No papers yet. {canManage && "Click \"Add paper\" to build the datesheet."}
                  </TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id} className={conflictIds.has(r.id) ? "bg-destructive/5" : undefined}>
                    <TableCell className="min-w-[160px]">
                      <Select disabled={!canManage} value={r.subject_id ?? ""} onValueChange={(v) => updateRow(r.id, { subject_id: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <Select disabled={!canManage} value={r.class_section_id ?? ""} onValueChange={(v) => updateRow(r.id, { class_section_id: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.class_name ? `${s.class_name} — ` : ""}{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input disabled={!canManage} type="date" className="h-8 w-[140px]" value={r.exam_date ?? ""} onChange={(e) => updateRow(r.id, { exam_date: e.target.value })} /></TableCell>
                    <TableCell><Input disabled={!canManage} type="time" className="h-8 w-[110px]" value={r.start_time ?? ""} onChange={(e) => updateRow(r.id, { start_time: e.target.value })} /></TableCell>
                    <TableCell><Input disabled={!canManage} type="number" className="h-8 w-[80px]" value={r.duration_minutes ?? ""} onChange={(e) => updateRow(r.id, { duration_minutes: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input disabled={!canManage} type="number" className="h-8 w-[70px]" value={r.max_marks ?? ""} onChange={(e) => updateRow(r.id, { max_marks: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input disabled={!canManage} type="number" className="h-8 w-[70px]" value={r.passing_marks ?? ""} onChange={(e) => updateRow(r.id, { passing_marks: Number(e.target.value) })} /></TableCell>
                    <TableCell><Input disabled={!canManage} className="h-8 w-[100px]" placeholder="Room" value={r.room ?? ""} onChange={(e) => updateRow(r.id, { room: e.target.value })} /></TableCell>
                    <TableCell className="min-w-[160px]">
                      <Select disabled={!canManage} value={r.invigilator_user_id ?? ""} onValueChange={(v) => updateRow(r.id, { invigilator_user_id: v })}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    {canManage && <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {rows.length} paper{rows.length !== 1 && "s"} · Edits save automatically.
            </p>
          )}
        </div>
        <DialogFooter className="px-6 py-3 border-t shrink-0 bg-background"><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
