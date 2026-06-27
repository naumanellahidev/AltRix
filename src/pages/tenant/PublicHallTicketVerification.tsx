import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Calendar, MapPin, User, FileText, Loader2, BookOpen } from "lucide-react";
import { format } from "date-fns";

export default function PublicHallTicketVerification() {
  const { schoolSlug, examId, studentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [school, setSchool] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [papers, setPapers] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [rules, setRules] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!schoolSlug || !examId || !studentId) return;
      setLoading(true);
      try {
        // 1. Resolve student info
        const { data: stud } = await supabase
          .from("students")
          .select("*")
          .eq("id", studentId)
          .maybeSingle();
        setStudent(stud);

        // 2. Resolve school / tenant
        const { data: sch } = await supabase
          .from("schools")
          .select("*")
          .eq("id", schoolSlug) // The QR code puts schoolId here
          .maybeSingle();
        setSchool(sch);

        // 3. Resolve exam cycle
        const { data: ex } = await supabase
          .from("exams")
          .select("*")
          .eq("id", examId)
          .maybeSingle();
        setExam(ex);

        // 4. Resolve static subjects and sections
        const [subs, secs, examPapers] = await Promise.all([
          supabase.from("subjects").select("id, name"),
          supabase.from("class_sections").select("id, name, academic_classes(name)"),
          supabase.from("exam_subjects").select("*").eq("exam_id", examId)
        ]);

        setSubjects(subs.data || []);
        setSections(secs.data || []);

        // Filter papers specifically for the student's class section
        if (stud) {
          const { data: enroll } = await supabase
            .from("student_enrollments")
            .select("class_section_id")
            .eq("student_id", studentId)
            .is("end_date", null)
            .maybeSingle();
          
          if (enroll) {
            const studentPapers = (examPapers.data || []).filter(
              p => p.class_section_id === enroll.class_section_id
            );
            setPapers(studentPapers.sort(
              (a, b) => (a.exam_date || "").localeCompare(b.exam_date || "") || (a.start_time || "").localeCompare(b.start_time || "")
            ));
          }
        }

        // Load rules
        const savedRules = localStorage.getItem(`exam_rules_${examId}`);
        if (savedRules) {
          setRules(savedRules.split("\n").map(r => r.trim()).filter(Boolean));
        } else {
          setRules([
            "1. Candidates must report to the examination room at least 15 minutes before the start time.",
            "2. Candidates will not be admitted to the hall after 30 minutes of paper commencement.",
            "3. Carrying mobile phones, smartwatches, or unauthorized study materials into the hall is strictly prohibited.",
            "4. This admit card must be presented along with student ID card for verification.",
            "5. Invigilator's instructions must be adhered to at all times."
          ]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolSlug, examId, studentId]);

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s.name])), [subjects]);
  const sectionMap = useMemo(() => new Map(sections.map(s => [s.id, `${s.academic_classes?.name || ""} • ${s.name}`])), [sections]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold text-slate-500">Verifying hall ticket credentials...</p>
      </div>
    );
  }

  if (!student || !exam) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-slate-100 shadow-elevated rounded-2xl bg-white text-center p-8">
          <div className="h-12 w-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="font-display text-lg font-black text-slate-800">Verification Failed</h2>
          <p className="text-xs text-slate-455 mt-2">
            The scanned QR code is either invalid or refers to a student record that does not exist in our database.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
      <Card className="max-w-2xl w-full border-slate-100 shadow-elevated rounded-3xl bg-white overflow-hidden">
        {/* Verification banner header */}
        <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-soft">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
              Genuine Document
            </Badge>
            <h2 className="font-display text-base font-bold text-slate-800 mt-1">Verified Examination Admit Card</h2>
          </div>
        </div>

        <CardHeader className="border-b border-slate-50 px-6 py-6 bg-slate-50/20">
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start text-center sm:text-left">
            {student.profile_image_url ? (
              <img src={student.profile_image_url} alt="" className="h-20 w-20 rounded-2xl object-cover ring-4 ring-slate-100" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center ring-4 ring-slate-100">
                <User className="h-8 w-8" />
              </div>
            )}
            <div className="space-y-1.5 flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student Profile</span>
              <h3 className="font-display text-xl font-bold text-slate-800 truncate">
                {student.first_name} {student.last_name || ""}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start text-xs font-semibold text-slate-550">
                <span className="bg-slate-100 px-2 py-0.5 rounded-md">Roll No: {student.student_code || "—"}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                  {sectionMap.get(papers[0]?.class_section_id) || "Enrolled Section"}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Exam info */}
          <div className="bg-blue-50/20 border border-blue-100/50 rounded-2xl p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">Active Examination Cycle</span>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{exam.name}</p>
            </div>
          </div>

          {/* Paper list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Paper & Schedule Details
            </h4>
            <div className="border rounded-2xl overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold text-slate-700">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">Time</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700">Subject Paper</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-700 text-center">Room</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {papers.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-xs text-slate-400">No scheduled papers found.</TableCell></TableRow>
                  ) : (
                    papers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs font-semibold text-slate-800">
                          {p.exam_date ? format(new Date(p.exam_date), "MMM d, yyyy (EEE)") : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-500">
                          {p.start_time ? p.start_time.slice(0, 5) : "—"} ({p.duration_minutes}m)
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-805">
                          {p.subject_id ? subjectMap.get(p.subject_id) || "—" : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-blue-600 text-center">
                          {p.room || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Rules list */}
          <div className="space-y-2 border-t pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              Exam Instructions & Guidelines
            </h4>
            <ul className="text-[11px] text-slate-550 leading-relaxed space-y-1 pl-4 list-disc">
              {rules.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ul>
          </div>
        </CardContent>

        <div className="bg-slate-50 border-t px-6 py-4 text-center text-[10px] text-slate-400">
          Secure verification provided by {school?.name || "AltRix Academy"} • Powered by AltRix OS
        </div>
      </Card>
    </div>
  );
}
