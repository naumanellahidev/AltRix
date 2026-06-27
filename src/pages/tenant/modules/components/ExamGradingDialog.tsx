import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, AlertTriangle, Save, RefreshCw, FileSpreadsheet, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  schoolId: string;
  examId: string;
  examName: string;
  subjectId: string;
  subjectName: string;
  classSectionId: string;
  classSectionName: string;
  maxMarks: number;
  passingMarks: number;
}

interface StudentRow {
  student_id: string;
  first_name: string;
  last_name: string | null;
  student_code: string | null;
  marks_obtained: number | null;
  grade: string | null;
  remarks: string | null;
  saving?: boolean;
}

const getGradeSymbol = (pct: number) => {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
};

export default function ExamGradingDialog({
  open, onOpenChange, schoolId, examId, examName,
  subjectId, subjectName, classSectionId, classSectionName, maxMarks, passingMarks
}: Props) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [locking, setLocking] = useState(false);

  const load = async () => {
    if (!open || !classSectionId) return;
    setLoading(true);
    try {
      // 1. Fetch students in the section
      const { data: enrolls, error: enrollError } = await supabase
        .from("student_enrollments")
        .select("student_id, students!inner(id, first_name, last_name, student_code)")
        .eq("class_section_id", classSectionId)
        .is("end_date", null);

      if (enrollError) throw enrollError;
      const studentList = (enrolls || []).map((e: any) => ({
        id: e.students.id,
        first_name: e.students.first_name,
        last_name: e.students.last_name,
        student_code: e.students.student_code,
      }));

      // 2. Fetch existing exam results for these students, exam & subject
      const studentIds = studentList.map(s => s.id);
      let existingResults: any[] = [];
      if (studentIds.length > 0) {
        const { data: marksData, error: marksError } = await supabase
          .from("exam_results")
          .select("*")
          .eq("exam_id", examId)
          .eq("subject_id", subjectId)
          .in("student_id", studentIds);
        if (marksError) throw marksError;
        existingResults = marksData || [];
      }

      // 3. Check if grading is locked (if report card is already published, or lock flag exists)
      // For safety, we can check if report_cards exist and are published
      let isAnyPublished = false;
      if (studentIds.length > 0) {
        const { data: rcData } = await supabase
          .from("report_cards")
          .select("is_published")
          .eq("exam_id", examId)
          .in("student_id", studentIds)
          .eq("is_published", true)
          .limit(1);
        if (rcData && rcData.length > 0) {
          isAnyPublished = true;
        }
      }
      setLocked(isAnyPublished);

      const resultMap = new Map(existingResults.map(r => [r.student_id, r]));

      const initialRows: StudentRow[] = studentList.map(s => {
        const r = resultMap.get(s.id);
        return {
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          student_code: s.student_code,
          marks_obtained: r ? r.marks_obtained : null,
          grade: r ? r.grade : null,
          remarks: r ? r.remarks : null,
        };
      });

      setRows(initialRows.sort((a, b) => a.first_name.localeCompare(b.first_name)));
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to load class roster");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [open, examId, subjectId, classSectionId]);

  const handleCellBlur = async (studentId: string, obtained: number | null, remarks: string | null) => {
    if (locked) return;
    
    // Toggle loading state on the row
    setRows(prev => prev.map(r => r.student_id === studentId ? { ...r, saving: true } : r));

    try {
      let grade = null;
      if (obtained !== null) {
        if (obtained < 0 || obtained > maxMarks) {
          toast.error("Marks obtained cannot exceed max marks or be negative");
          setRows(prev => prev.map(r => r.student_id === studentId ? { ...r, saving: false } : r));
          return;
        }
        const pct = (obtained / maxMarks) * 100;
        grade = getGradeSymbol(pct);
      }

      const { error } = await supabase
        .from("exam_results")
        .upsert({
          school_id: schoolId,
          exam_id: examId,
          student_id: studentId,
          subject_id: subjectId,
          marks_obtained: obtained,
          max_marks: maxMarks,
          grade,
          remarks: remarks || null
        }, { onConflict: "exam_id,student_id,subject_id" });

      if (error) throw error;

      setRows(prev => prev.map(r => 
        r.student_id === studentId 
          ? { ...r, marks_obtained: obtained, grade, remarks, saving: false } 
          : r
      ));
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to save grade for student");
      setRows(prev => prev.map(r => r.student_id === studentId ? { ...r, saving: false } : r));
    }
  };

  const handleLockGrading = async () => {
    setLocking(true);
    try {
      // Simulate lock by creating draft report cards for the class so they are ready for principal review
      const savePromises = rows.map(async (row) => {
        if (row.marks_obtained === null) return;
        
        // Find if report card exists
        const { data: existingCard } = await supabase
          .from("report_cards")
          .select("id, teacher_remarks, principal_remarks, attendance_percentage, is_published, published_at")
          .eq("school_id", schoolId)
          .eq("student_id", row.student_id)
          .eq("exam_id", examId)
          .maybeSingle();

        const allStudentMarks = [row.marks_obtained];
        const pct = (row.marks_obtained / maxMarks) * 100;
        const grade = getGradeSymbol(pct);

        const payload = {
          school_id: schoolId,
          student_id: row.student_id,
          exam_id: examId,
          total_marks: row.marks_obtained,
          max_total: maxMarks,
          percentage: Math.round(pct * 100) / 100,
          overall_grade: grade,
          period_type: "exam",
          period_label: examName,
          teacher_remarks: existingCard?.teacher_remarks || "Grading locked by Subject Teacher.",
          principal_remarks: existingCard?.principal_remarks || null,
          attendance_percentage: existingCard?.attendance_percentage || null,
          is_published: existingCard?.is_published || false,
          published_at: existingCard?.published_at || null,
        };

        return supabase.from("report_cards").upsert(payload, { onConflict: "exam_id,student_id" });
      });

      await Promise.all(savePromises);
      setLocked(true);
      toast.success("Subject grades finalized and submitted to Principal/Admins!");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to finalize grading");
    } finally {
      setLocking(false);
    }
  };

  const classAvg = useMemo(() => {
    const scored = rows.filter(r => r.marks_obtained !== null);
    if (scored.length === 0) return 0;
    const sum = scored.reduce((acc, curr) => acc + (curr.marks_obtained || 0), 0);
    return Math.round((sum / (scored.length * maxMarks)) * 100);
  }, [rows, maxMarks]);

  const passRate = useMemo(() => {
    const scored = rows.filter(r => r.marks_obtained !== null);
    if (scored.length === 0) return 0;
    const passed = scored.filter(r => (r.marks_obtained || 0) >= passingMarks).length;
    return Math.round((passed / scored.length) * 100);
  }, [rows, passingMarks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] max-h-[85vh] p-0 flex flex-col overflow-hidden bg-white border border-slate-100 rounded-2xl shadow-elevated">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="font-display text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Grading Workspace
              </DialogTitle>
              <p className="text-xs text-slate-455">
                {examName} · <span className="font-bold text-blue-600">{subjectName}</span> · {classSectionName}
              </p>
            </div>
            {locked ? (
              <Badge className="bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1 text-[11px] font-bold rounded-lg flex items-center gap-1 shrink-0">
                <Lock className="h-3 w-3" />
                Grades Locked
              </Badge>
            ) : (
              <Button 
                onClick={handleLockGrading}
                disabled={locking || rows.length === 0}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold gap-1.5 shadow-soft shrink-0"
              >
                {locking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                Finalize & Lock Grades
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Analytics stats */}
        <div className="grid grid-cols-3 border-b bg-slate-50/20 text-center shrink-0">
          <div className="py-3 border-r border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class Average</span>
            <p className="font-display text-lg font-black text-slate-800 mt-0.5">{classAvg}%</p>
          </div>
          <div className="py-3 border-r border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pass Rate</span>
            <p className="font-display text-lg font-black text-slate-800 mt-0.5">{passRate}%</p>
          </div>
          <div className="py-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Students Evaluated</span>
            <p className="font-display text-lg font-black text-slate-800 mt-0.5">
              {rows.filter(r => r.marks_obtained !== null).length} / {rows.length}
            </p>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-xs font-medium">Loading roster and marks...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 gap-3">
              <AlertTriangle className="h-10 w-10 text-amber-400" />
              <div>
                <p className="text-sm font-bold text-slate-800">No Enrolled Students</p>
                <p className="text-xs text-slate-400 mt-0.5">No active student enrollments were found for {classSectionName}.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/40 sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[120px] font-semibold text-slate-700">Student Code</TableHead>
                  <TableHead className="font-semibold text-slate-700">Student Name</TableHead>
                  <TableHead className="w-[120px] font-semibold text-slate-700 text-center">Marks Obtained</TableHead>
                  <TableHead className="w-[80px] font-semibold text-slate-700 text-center">Max Marks</TableHead>
                  <TableHead className="w-[100px] font-semibold text-slate-700 text-center">Grade</TableHead>
                  <TableHead className="min-w-[200px] font-semibold text-slate-700">Teacher Remarks</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const percent = row.marks_obtained !== null ? (row.marks_obtained / maxMarks) * 100 : 0;
                  const isPassed = row.marks_obtained !== null && row.marks_obtained >= passingMarks;
                  
                  return (
                    <TableRow key={row.student_id} className="hover:bg-slate-50/30">
                      <TableCell className="font-medium text-slate-500 text-xs">{row.student_code || "—"}</TableCell>
                      <TableCell className="font-semibold text-slate-800 text-sm">
                        {row.first_name} {row.last_name || ""}
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min={0}
                          max={maxMarks}
                          disabled={locked}
                          defaultValue={row.marks_obtained !== null ? row.marks_obtained : ""}
                          placeholder="—"
                          className="h-8 w-20 text-center mx-auto rounded-lg border-slate-200 focus-visible:ring-blue-500 text-xs font-bold"
                          onBlur={(e) => {
                            const val = e.target.value === "" ? null : Number(e.target.value);
                            if (val !== row.marks_obtained) {
                              handleCellBlur(row.student_id, val, row.remarks);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center text-slate-400 font-semibold text-xs">{maxMarks}</TableCell>
                      <TableCell className="text-center">
                        {row.marks_obtained !== null ? (
                          <Badge variant="outline" className={`text-[10px] font-bold rounded-full px-2 py-0 border ${
                            isPassed 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                              : "bg-rose-50 text-rose-700 border-rose-100"
                          }`}>
                            {row.grade} ({Math.round(percent)}%)
                          </Badge>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Add notes..."
                          disabled={locked}
                          defaultValue={row.remarks || ""}
                          className="h-8 w-full rounded-lg border-slate-200 focus-visible:ring-blue-500 text-xs"
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val !== (row.remarks || "")) {
                              handleCellBlur(row.student_id, row.marks_obtained, val);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {row.saving && <Loader2 className="h-4 w-4 animate-spin text-blue-500 mx-auto" />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 bg-slate-50/50">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs font-semibold">
            Close Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
