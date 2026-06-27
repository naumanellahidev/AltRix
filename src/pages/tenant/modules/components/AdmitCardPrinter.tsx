import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Printer, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { format } from "date-fns";

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

  const generateAdmitCards = async () => {
    if (!secId) return toast.error("Pick a class section");
    setPrinting(true);
    try {
      // Save rules config to localStorage for convenience
      localStorage.setItem(`exam_rules_${examId}`, rulesText);

      // 1. Fetch enrolled students
      const { data: enrolls, error: enrollError } = await supabase
        .from("student_enrollments")
        .select("student_id, students!inner(id, first_name, last_name, student_code)")
        .eq("class_section_id", secId)
        .is("end_date", null);

      if (enrollError) throw enrollError;
      const studentsList = (enrolls || []).map((e: any) => ({
        id: e.students.id,
        name: `${e.students.first_name} ${e.students.last_name || ""}`,
        code: e.students.student_code || "N/A"
      }));

      if (studentsList.length === 0) {
        toast.error("No enrolled students found in this section");
        setPrinting(false);
        return;
      }

      // 2. Fetch exam papers/datesheet for this section
      const { data: papers, error: papersError } = await supabase
        .from("exam_subjects")
        .select("*")
        .eq("exam_id", examId)
        .eq("class_section_id", secId)
        .order("exam_date")
        .order("start_time");

      if (papersError) throw papersError;
      const papersList = papers || [];

      if (papersList.length === 0) {
        toast.error("No exam papers found for this section in this exam's datesheet.");
        setPrinting(false);
        return;
      }

      // 3. Resolve school name
      const { data: sch } = await supabase
        .from("schools")
        .select("name")
        .eq("id", schoolId)
        .maybeSingle();
      const schoolName = sch?.name || "Eduverse Academy";

      // 4. Initialize PDF document
      const doc = new jsPDF({ orientation: "portrait" });

      for (let sIdx = 0; sIdx < studentsList.length; sIdx++) {
        const student = studentsList[sIdx];
        if (sIdx > 0) {
          doc.addPage();
        }

        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        // Draw ornamental border (white and blue theme)
        doc.setDrawColor(37, 99, 235); // Blue border
        doc.setLineWidth(1.5);
        doc.rect(10, 10, pageW - 20, pageH - 20);

        doc.setDrawColor(219, 234, 254); // Soft blue inset border
        doc.setLineWidth(0.5);
        doc.rect(12, 12, pageW - 24, pageH - 24);

        // Header Title
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59); // Slate-800
        doc.text(schoolName.toUpperCase(), pageW / 2, 25, { align: "center" });

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(37, 99, 235); // Primary blue
        doc.text(`OFFICIAL EXAM HALL TICKET / ADMIT CARD`, pageW / 2, 31, { align: "center" });

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(`Academic Examination Cycle: ${examName}`, pageW / 2, 36, { align: "center" });

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.line(20, 42, pageW - 20, 42);

        // Student Info Panel (Card layout)
        doc.setFillColor(248, 250, 252); // Slate-50 background
        doc.rect(20, 48, pageW - 40, 32, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105); // Slate-600
        doc.text("STUDENT DETAILS", 25, 54);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text(`Name:`, 25, 62);
        doc.setFont("helvetica", "bold");
        doc.text(student.name, 45, 62);

        doc.setFont("helvetica", "normal");
        doc.text(`Student Code:`, 25, 68);
        doc.setFont("helvetica", "bold");
        doc.text(student.code, 50, 68);

        doc.setFont("helvetica", "normal");
        doc.text(`Class/Section:`, 25, 74);
        doc.setFont("helvetica", "bold");
        doc.text(sectionMap.get(secId) || "N/A", 50, 74);

        // Render QR Code pointing to public verification page
        try {
          const slug = schoolSlug || schoolId;
          const verifyUrl = `${window.location.origin}/${slug}/verify-ticket/${examId}/${student.id}`;
          const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 0 });
          doc.addImage(qrDataUrl, "PNG", pageW - 52, 50, 24, 24);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          doc.text("VERIFY ADMIT CARD", pageW - 40, 76, { align: "center" });
        } catch (e) {
          console.error("QR fail", e);
        }

        // Exam Table
        const tableBody = papersList.map((p) => [
          p.exam_date ? format(new Date(p.exam_date), "MMM d, yyyy (EEE)") : "—",
          p.start_time ? p.start_time.slice(0, 5) : "—",
          p.duration_minutes ? `${p.duration_minutes} mins` : "—",
          p.subject_id ? subjectMap.get(p.subject_id) || "—" : "—",
          p.room || "—",
        ]);

        autoTable(doc, {
          startY: 88,
          margin: { left: 20, right: 20 },
          head: [["Date", "Start Time", "Duration", "Exam Paper / Subject", "Examination Room"]],
          body: tableBody,
          styles: { fontSize: 9, font: "helvetica" },
          headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });

        // Instructions Footer
        const finalY = (doc as any).lastAutoTable.finalY + 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        doc.text("EXAMINATION INSTRUCTIONS & RULES:", 20, finalY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        
        // Parse custom rules from textarea
        const rulesList = rulesText.split("\n").map(r => r.trim()).filter(Boolean);
        rulesList.forEach((rule, idx) => {
          doc.text(rule, 20, finalY + 5 + (idx * 4.5));
        });

        // Signatures
        const sigY = finalY + 36;
        doc.setDrawColor(200);
        doc.line(25, sigY, 75, sigY);
        doc.line(pageW - 75, sigY, pageW - 25, sigY);

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(100);
        doc.text("Class Teacher Signature", 50, sigY + 4, { align: "center" });
        doc.text("Controller of Examinations", pageW - 50, sigY + 4, { align: "center" });
      }

      // Save compiled PDF
      doc.save(`Admit_Cards_${examName.replace(/\s+/g, "_")}_${sectionMap.get(secId)?.replace(/\s+/g, "_")}.pdf`);
      toast.success("Successfully generated and downloaded admit cards!");
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to print admit cards");
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
            onClick={generateAdmitCards} 
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
