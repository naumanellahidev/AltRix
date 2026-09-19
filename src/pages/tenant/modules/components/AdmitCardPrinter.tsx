import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Printer, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildAdmitCards, printBlob, type AdmitPaper, type AdmitStudent } from "@/lib/documents";
import { triggerDownload } from "@/lib/documents/deliver";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  examId: string;
  examName: string;
  sections: { id: string; name: string; class_name?: string }[];
  subjects: { id: string; name: string }[];
}

const DEFAULT_RULES = `1. Candidates must report to the examination room at least 15 minutes before the start time.
2. Candidates will not be admitted to the hall after 30 minutes of paper commencement.
3. Carrying mobile phones, smartwatches, or unauthorized study materials into the hall is strictly prohibited.
4. This admit card must be presented along with student ID card for verification.
5. Invigilator's instructions must be adhered to at all times.`;

export default function AdmitCardPrinter({
  open, onOpenChange, schoolId, examId, examName, sections, subjects
}: Props) {
  const { schoolSlug } = useParams<{ schoolSlug: string }>();
  const [secId, setSecId] = useState("");
  const [rulesText, setRulesText] = useState(DEFAULT_RULES);
  const [printing, setPrinting] = useState(false);

  // Load custom saved rules from localStorage if they exist
  useEffect(() => {
    const saved = localStorage.getItem(`exam_rules_${examId}`);
    if (saved) {
      setRulesText(saved);
    } else {
      setRulesText(DEFAULT_RULES);
    }
  }, [examId, open]);

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects]);
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, `${s.class_name ? s.class_name + " — " : ""}${s.name}`])), [sections]);

  const generateAdmitCards = async (mode: "print" | "download" = "download") => {
    if (!secId) return toast.error("Pick a class section");
    setPrinting(true);
    const id = toast.loading("Preparing admit cards…");
    try {
      // Rules are remembered on this device for the next run of this exam.
      localStorage.setItem(`exam_rules_${examId}`, rulesText);

      const [{ data: enrolls, error: enrollError }, { data: papers, error: papersError }] = await Promise.all([
        api
          .from("student_enrollments")
          .select("student_id, students!inner(id, first_name, last_name, student_code, roll_number, profile_image_url)")
          .eq("class_section_id", secId)
          .eq("school_id", schoolId)
          .is("end_date", null),
        api
          .from("exam_subjects")
          .select("*")
          .eq("exam_id", examId)
          .eq("class_section_id", secId)
          .order("exam_date")
          .order("start_time"),
      ]);
      if (enrollError) throw enrollError;
      if (papersError) throw papersError;

      const students: AdmitStudent[] = (enrolls || [])
        .map((e: any) => ({
          id: e.students.id,
          name: [e.students.first_name, e.students.last_name].filter(Boolean).join(" "),
          code: e.students.student_code ?? null,
          rollNumber: e.students.roll_number ?? null,
          photoUrl: e.students.profile_image_url ?? null,
        }))
        .sort((a: AdmitStudent, b: AdmitStudent) =>
          String(a.rollNumber ?? a.name).localeCompare(String(b.rollNumber ?? b.name), undefined, { numeric: true }),
        );
      const paperRows: AdmitPaper[] = (papers || []).map((p: any) => ({
        exam_date: p.exam_date,
        start_time: p.start_time,
        duration_minutes: p.duration_minutes,
        subject: p.subject_id ? subjectMap.get(p.subject_id) ?? "Paper" : "Paper",
        room: p.room,
      }));

      const slug = schoolSlug || schoolId;
      const { doc, fileName, warnings } = await buildAdmitCards(students, paperRows, {
        examName,
        sectionLabel: sectionMap.get(secId) ?? "",
        verifyUrl: (studentId) => `${window.location.origin}/${slug}/verify-ticket/${examId}/${studentId}`,
        rules: rulesText.split("\n").map((r) => r.trim()).filter(Boolean),
      });

      if (mode === "print") printBlob(doc.blob());
      else triggerDownload(doc.blob(), fileName);
      const done =
        mode === "print"
          ? `Sent ${students.length} admit card${students.length === 1 ? "" : "s"} to print`
          : `Downloaded ${fileName}`;
      if (warnings.length) toast.warning(`${done}. Note: ${warnings.join("; ")}`, { id, duration: 10000 });
      else toast.success(done, { id });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ? `Admit cards could not be produced: ${e.message}` : "Admit cards could not be produced", { id });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border border-slate-100 rounded-2xl shadow-elevated">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold text-slate-800">Print Bulk Admit Cards</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Generate printable, official admit cards (with exam rooms, invigilators, student details, venue lists, rules, and student verification QR codes) for a class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Class / Section</label>
            <Select value={secId} onValueChange={setSecId}>
              <SelectTrigger className="rounded-xl border-slate-200">
                <SelectValue placeholder="Pick class section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.class_name ? `${s.class_name} — ` : ""}{s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Exam Instructions / Rules (Configurable)</label>
            <Textarea
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              placeholder="Enter exam rules (one per line)..."
              rows={6}
              className="rounded-xl border-slate-200 text-xs font-medium focus-visible:ring-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button 
            variant="outline"
            onClick={() => generateAdmitCards("download")}
            disabled={printing || !secId}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download PDF
          </Button>
          <Button
            onClick={() => generateAdmitCards("print")}
            disabled={printing || !secId}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-soft"
          >
            {printing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Compiling PDFs...
              </>
            ) : (
              <>
                <Printer className="h-3.5 w-3.5" />
                Print Admit Cards
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
