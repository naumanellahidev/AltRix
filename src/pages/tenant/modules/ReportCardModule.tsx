import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Printer,
  Search,
  User,
  GraduationCap,
  ArrowLeft,
  Calendar,
  CalendarRange,
  ClipboardList,
  Sparkles,
  Plus,
  Send,
  Users,
  Pencil,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface Exam { id: string; name: string; term_label: string | null; start_date?: string | null; end_date?: string | null; }
interface Student { id: string; first_name: string; last_name: string | null; student_code?: string | null; section_id?: string | null; }
interface Subject { id: string; name: string; }
interface Result { id?: string; subject_id: string; marks_obtained: number | null; max_marks: number; grade: string | null; remarks: string | null; }
interface Card { id?: string; exam_id?: string | null; total_marks: number | null; max_total: number | null; percentage: number | null; gpa: number | null; overall_grade: string | null; teacher_remarks: string | null; principal_remarks: string | null; attendance_percentage: number | null; is_published: boolean; period_type?: string; period_label?: string | null; period_start?: string | null; period_end?: string | null; academic_year?: string | null; published_at?: string | null; }
interface ClassRow { id: string; name: string; }
interface SectionRow { id: string; name: string; class_id: string; }
interface AssessmentRow { id: string; title: string; subject_id: string | null; assessment_date: string | null; max_marks: number; is_published?: boolean | null; assessment_type?: string | null; weightage_percent?: number | null; class_section_id?: string | null; }
interface MarkRow { assessment_id: string; marks: number | null; computed_grade: string | null; }
interface ReportCardRow {
  id: string;
  exam_id: string | null;
  student_id: string;
  period_type: string;
  period_label: string | null;
  percentage: number | null;
  overall_grade: string | null;
  is_published: boolean;
  published_at: string | null;
  updated_at: string | null;
}

type PeriodType = "exam" | "monthly" | "annual";

interface Props { schoolId: string | null; canManage?: boolean; studentIdLocked?: string | null; }

const calcGrade = (pct: number) => {
  if (pct >= 90) return { grade: "A+" };
  if (pct >= 80) return { grade: "A" };
  if (pct >= 70) return { grade: "B" };
  if (pct >= 60) return { grade: "C" };
  if (pct >= 50) return { grade: "D" };
  return { grade: "F" };
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const currentYear = () => new Date().getFullYear();
const academicYearLabel = () => {
  const y = currentYear();
  const m = new Date().getMonth();
  // School year roughly Aug-Jul; show "2025-2026" style.
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

export default function ReportCardModule({ schoolId, canManage: canManageProp = false, studentIdLocked }: Props) {
  const [searchParams] = useSearchParams();
  const viewCardParam = searchParams.get("view_card");

  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [enrollments, setEnrollments] = useState<{ student_id: string; class_section_id: string }[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>(studentIdLocked || "");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [card, setCard] = useState<Card>({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: null, is_published: false });
  const [school, setSchool] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [allAssessments, setAllAssessments] = useState<AssessmentRow[]>([]);
  const [allMarks, setAllMarks] = useState<MarkRow[]>([]);
  // null = no scope restriction (admin/principal/etc.). Array = teacher restricted to these section ids.
  const [teacherSectionIds, setTeacherSectionIds] = useState<string[] | null>(null);

  // Period mode
  const [periodType, setPeriodType] = useState<PeriodType>("exam");
  const [monthYear, setMonthYear] = useState<number>(currentYear());
  const [monthIdx, setMonthIdx] = useState<number>(new Date().getMonth());
  const [annualYear, setAnnualYear] = useState<string>(academicYearLabel());

  // Picker UI state
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");

  // List view (parent/student)
  const [myCards, setMyCards] = useState<ReportCardRow[]>([]);
  const [viewingCardId, setViewingCardId] = useState<string | null>(null);
  // Derived permission: a teacher (no admin role) is only allowed to view report cards, not edit them.
  const currentStudentSectionId = useMemo(
    () => enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null,
    [enrollments, studentId]
  );
  const allowedForCurrentStudent =
    teacherSectionIds === null ||
    (!!currentStudentSectionId && teacherSectionIds.includes(currentStudentSectionId));
  const isTeacherOnly = teacherSectionIds !== null;
  const canManage = canManageProp && allowedForCurrentStudent && !isTeacherOnly;
  const isReadOnlyForChild = !!studentIdLocked && !canManageProp;

  // Detect scope: if the current user has any admin-style role for this school we leave
  // teacherSectionIds=null (full access). Otherwise we restrict to sections assigned to them.
  useEffect(() => {
    if (!schoolId || !canManageProp) { setTeacherSectionIds(null); return; }
    let cancelled = false;
    (async () => {
      const { data: auth } = await (supabase as any).auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("school_id", schoolId)
        .eq("user_id", uid);
      const roleList: string[] = (roles || []).map((r: any) => r.role);
      const adminRoles = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "academic_coordinator"];
      const isAdmin = roleList.some((r) => adminRoles.includes(r));
      if (isAdmin) { if (!cancelled) setTeacherSectionIds(null); return; }
      // Gather sections assigned to this teacher
      const [ta, ss, tsa] = await Promise.all([
        (supabase as any).from("teacher_assignments").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
        (supabase as any).from("section_subjects").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
        (supabase as any).from("teacher_subject_assignments").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
      ]);
      const ids = new Set<string>();
      [...(ta.data || []), ...(ss.data || []), ...(tsa.data || [])].forEach((r: any) => {
        if (r?.class_section_id) ids.add(r.class_section_id);
      });
      if (!cancelled) setTeacherSectionIds(Array.from(ids));
    })();
    return () => { cancelled = true; };
  }, [schoolId, canManageProp]);


  // Load directory
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const [ex, st, sub, sch, cls, sec, enr] = await Promise.all([
        (supabase as any).from("exams").select("id,name,term_label,start_date,end_date").eq("school_id", schoolId).order("start_date", { ascending: false }),
        (supabase as any).from("students").select("id,first_name,last_name,student_code").eq("school_id", schoolId).order("first_name"),
        (supabase as any).from("subjects").select("id,name").eq("school_id", schoolId).order("name"),
        (supabase as any).from("schools").select("*").eq("id", schoolId).maybeSingle(),
        (supabase as any).from("academic_classes").select("id,name").eq("school_id", schoolId).order("name"),
        (supabase as any).from("class_sections").select("id,name,class_id").eq("school_id", schoolId),
        (supabase as any).from("student_enrollments").select("student_id,class_section_id").eq("school_id", schoolId),
      ]);
      setExams(ex.data || []); setStudents(st.data || []); setSubjects(sub.data || []); setSchool(sch.data);
      setClasses(cls.data || []); setSections(sec.data || []); setEnrollments(enr.data || []);
    })();
  }, [schoolId]);

  useEffect(() => {
    if (studentIdLocked) {
      setStudentId(studentIdLocked);
      setViewingCardId(null);
    }
  }, [studentIdLocked]);

  useEffect(() => {
    if (viewCardParam) {
      setViewingCardId(viewCardParam);
    }
  }, [viewCardParam]);

  // Load list of published cards for parent/student
  useEffect(() => {
    if (!isReadOnlyForChild || !schoolId || !studentId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("report_cards")
        .select("id,exam_id,student_id,period_type,period_label,percentage,overall_grade,is_published,published_at,updated_at")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .eq("is_published", true)
        .order("published_at", { ascending: false, nullsFirst: false });
      setMyCards(data || []);
    })();
  }, [isReadOnlyForChild, schoolId, studentId]);

  // Build current period_label
  const currentPeriodLabel = useMemo(() => {
    if (periodType === "monthly") return `${MONTHS[monthIdx]} ${monthYear}`;
    if (periodType === "annual") return `Annual ${annualYear}`;
    return null;
  }, [periodType, monthIdx, monthYear, annualYear]);

  const currentPeriodRange = useMemo(() => {
    if (periodType === "monthly") {
      const start = new Date(monthYear, monthIdx, 1);
      const end = new Date(monthYear, monthIdx + 1, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    if (periodType === "annual") {
      const [y1, y2] = annualYear.split("-").map((s) => parseInt(s, 10));
      if (!y1 || !y2) return { start: null, end: null };
      return { start: `${y1}-08-01`, end: `${y2}-07-31` };
    }
    return { start: null, end: null };
  }, [periodType, monthIdx, monthYear, annualYear]);

  // Load card + results for chosen context
  useEffect(() => {
    if (!studentId || !schoolId) return;
    if (isReadOnlyForChild && !viewingCardId) return; // wait until parent opens a specific card
    (async () => {
      let rcQuery = (supabase as any).from("report_cards").select("*").eq("school_id", schoolId).eq("student_id", studentId);
      if (viewingCardId) {
        rcQuery = rcQuery.eq("id", viewingCardId).maybeSingle();
      } else if (periodType === "exam") {
        if (!examId) {
          rcQuery = Promise.resolve({ data: null });
        } else {
          rcQuery = rcQuery.eq("exam_id", examId).maybeSingle();
        }
      } else {
        rcQuery = rcQuery.is("exam_id", null).eq("period_type", periodType).eq("period_label", currentPeriodLabel).maybeSingle();
      }

      const examIdForResults = viewingCardId ? null : (periodType === "exam" ? examId : null);

      const [res, rc, info, assessments, marks] = await Promise.all([
        examIdForResults
          ? (supabase as any).from("exam_results").select("*").eq("school_id", schoolId).eq("exam_id", examIdForResults).eq("student_id", studentId)
          : Promise.resolve({ data: [] }),
        rcQuery,
        (supabase as any).from("students").select("*").eq("id", studentId).maybeSingle(),
        (supabase as any).from("academic_assessments").select("id,subject_id,max_marks,is_published,title,assessment_date,assessment_type,weightage_percent,class_section_id").eq("school_id", schoolId),
        (supabase as any).from("student_marks").select("assessment_id,marks,computed_grade").eq("school_id", schoolId).eq("student_id", studentId),
      ]);

      const loadedCard: any = (rc as any).data || null;
      setAllAssessments(assessments.data || []);
      setAllMarks(marks.data || []);

      // If viewing existing saved card and it has exam_id, load its exam_results too
      let savedResults: any[] = res.data || [];
      if (loadedCard?.exam_id && (!savedResults || savedResults.length === 0)) {
        const { data } = await (supabase as any)
          .from("exam_results").select("*")
          .eq("school_id", schoolId).eq("exam_id", loadedCard.exam_id).eq("student_id", studentId);
        savedResults = data || [];
      }

      const map: Record<string, Result> = {};
      savedResults.forEach((r: any) => { map[r.subject_id] = r; });

      // Determine which assessments are in scope for the period
      const studentSectionId = enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null;
      const inScope = (assessments.data || []).filter((a: any) => {
        if (a.is_published === false) return false;
        // Strictly scope to the student's class section so quizzes/tests added for one class
        // do not leak into other classes' report cards.
        if (studentSectionId && a.class_section_id && a.class_section_id !== studentSectionId) return false;
        if (loadedCard?.exam_id || examIdForResults) return true; // exam mode: include all (existing fallback behavior)
        if (periodType === "monthly") {
          const d = a.assessment_date ? new Date(a.assessment_date) : null;
          if (!d) return false;
          return d.getFullYear() === monthYear && d.getMonth() === monthIdx;
        }
        if (periodType === "annual") {
          const d = a.assessment_date ? new Date(a.assessment_date) : null;
          if (!d || !currentPeriodRange.start || !currentPeriodRange.end) return false;
          return d >= new Date(currentPeriodRange.start) && d <= new Date(currentPeriodRange.end);
        }
        if (loadedCard?.period_type === "monthly" && loadedCard.period_start && loadedCard.period_end) {
          const d = a.assessment_date ? new Date(a.assessment_date) : null;
          return !!d && d >= new Date(loadedCard.period_start) && d <= new Date(loadedCard.period_end);
        }
        if (loadedCard?.period_type === "annual" && loadedCard.period_start && loadedCard.period_end) {
          const d = a.assessment_date ? new Date(a.assessment_date) : null;
          return !!d && d >= new Date(loadedCard.period_start) && d <= new Date(loadedCard.period_end);
        }
        return true;
      });
      const inScopeIds = new Set(inScope.map((a: any) => a.id));
      const assessmentById = new Map<string, any>(inScope.map((a: any) => [a.id, a]));

      const perSubject: Record<string, { obtained: number; max: number }> = {};
      (marks.data || []).forEach((m: any) => {
        if (!inScopeIds.has(m.assessment_id)) return;
        const a = assessmentById.get(m.assessment_id);
        if (!a || !a.subject_id || m.marks == null) return;
        const max = Number(a.max_marks || 100);
        if (!perSubject[a.subject_id]) perSubject[a.subject_id] = { obtained: 0, max: 0 };
        perSubject[a.subject_id].obtained += Number(m.marks);
        perSubject[a.subject_id].max += max;
      });
      Object.entries(perSubject).forEach(([subjectId, v]) => {
        if (map[subjectId]) return;
        const pct = v.max > 0 ? (v.obtained / v.max) * 100 : 0;
        map[subjectId] = {
          subject_id: subjectId,
          marks_obtained: Math.round(v.obtained * 100) / 100,
          max_marks: v.max,
          grade: calcGrade(pct).grade,
          remarks: null,
        };
      });

      setResults(map);
      // Safely merge attendance_percentage: prefer the live-computed value already
      // in state; fall back to the saved value on the loaded card. Never let a
      // null/undefined from either side wipe out a known good number.
      const safeAttendance = (a: unknown, b: unknown): number | null => {
        const na = typeof a === "number" && !Number.isNaN(a) ? a : null;
        const nb = typeof b === "number" && !Number.isNaN(b) ? b : null;
        return na ?? nb;
      };
      if (loadedCard) setCard((prev) => ({ ...loadedCard, attendance_percentage: safeAttendance(prev.attendance_percentage, loadedCard.attendance_percentage) }));
      else setCard((prev) => ({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: safeAttendance(prev.attendance_percentage, null), is_published: false }));
      setStudentInfo(info.data);

      // If we opened a saved card, sync the period selector for display
      if (loadedCard) {
        if (loadedCard.exam_id) { setPeriodType("exam"); setExamId(loadedCard.exam_id); }
        else if (loadedCard.period_type === "monthly" || loadedCard.period_type === "annual") {
          setPeriodType(loadedCard.period_type);
        }
      }
    })();
  }, [examId, studentId, schoolId, periodType, currentPeriodLabel, viewingCardId, isReadOnlyForChild, monthIdx, monthYear, currentPeriodRange.start, currentPeriodRange.end, JSON.stringify(enrollments)]);

  // Auto-compute attendance % from attendance history for the selected period (read-only)
  useEffect(() => {
    if (!studentId || !schoolId) return;
    const studentSectionId = enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null;
    if (!studentSectionId) return;

    let start: string | null = null;
    let end: string | null = null;
    if (card.period_start && card.period_end) {
      start = card.period_start; end = card.period_end;
    } else if (periodType === "exam" && examId) {
      const ex: any = (exams as any[]).find((e: any) => e.id === examId);
      start = ex?.start_date || null; end = ex?.end_date || null;
    } else if (currentPeriodRange.start && currentPeriodRange.end) {
      start = currentPeriodRange.start; end = currentPeriodRange.end;
    }

    (async () => {
      let sessionsQ = (supabase as any)
        .from("attendance_sessions")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class_section_id", studentSectionId);
      if (start) sessionsQ = sessionsQ.gte("session_date", start);
      if (end) sessionsQ = sessionsQ.lte("session_date", end);
      const { data: sessions } = await sessionsQ;
      const sessionIds = (sessions || []).map((s: any) => s.id);
      if (sessionIds.length === 0) {
        // No sessions in this period — keep any previously known value
        // (saved on card or computed earlier) rather than blanking it out.
        return;
      }
      const { data: entries } = await (supabase as any)
        .from("attendance_entries")
        .select("status")
        .eq("student_id", studentId)
        .in("session_id", sessionIds);
      const total = entries?.length || 0;
      if (total === 0) {
        // Student has no entries — keep existing value instead of wiping it.
        return;
      }
      const attended = (entries || []).filter((e: any) => e.status === "present" || e.status === "late").length;
      const raw = (attended / total) * 100;
      const pct = Number.isFinite(raw) ? Math.round(raw * 10) / 10 : null;
      if (pct == null) return;
      setCard((c) => ({ ...c, attendance_percentage: pct }));
    })();
  }, [studentId, schoolId, periodType, examId, currentPeriodRange.start, currentPeriodRange.end, card.period_start, card.period_end, JSON.stringify(enrollments), exams]);

  const updateMark = (subjectId: string, marks: number, max: number) => {
    setResults((prev) => ({ ...prev, [subjectId]: { ...(prev[subjectId] || {}), subject_id: subjectId, marks_obtained: marks, max_marks: max, grade: calcGrade((marks / max) * 100).grade, remarks: prev[subjectId]?.remarks || null } }));
  };

  const totals = useMemo(() => {
    let total = 0, max = 0;
    Object.values(results).forEach((r) => { if (r.marks_obtained != null) { total += Number(r.marks_obtained); max += Number(r.max_marks || 100); } });
    const pct = max > 0 ? (total / max) * 100 : 0;
    const g = calcGrade(pct);
    return { total, max, pct: Math.round(pct * 100) / 100, grade: g.grade };
  }, [results]);

  // Per-assessment appendix for the loaded card
  const appendix = useMemo(() => {
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const studentSectionId = enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null;
    let scope = allAssessments.filter((a) => {
      if (a.is_published === false) return false;
      if (studentSectionId && a.class_section_id && a.class_section_id !== studentSectionId) return false;
      return true;
    });
    if (card.exam_id || (periodType === "exam" && examId)) {
      // exam mode — show all marks for this student (existing behavior)
    } else if (card.period_type === "monthly" && card.period_start && card.period_end) {
      const s = new Date(card.period_start), e = new Date(card.period_end);
      scope = scope.filter((a) => a.assessment_date && new Date(a.assessment_date) >= s && new Date(a.assessment_date) <= e);
    } else if (card.period_type === "annual" && card.period_start && card.period_end) {
      const s = new Date(card.period_start), e = new Date(card.period_end);
      scope = scope.filter((a) => a.assessment_date && new Date(a.assessment_date) >= s && new Date(a.assessment_date) <= e);
    } else if (periodType === "monthly") {
      scope = scope.filter((a) => {
        if (!a.assessment_date) return false;
        const d = new Date(a.assessment_date);
        return d.getFullYear() === monthYear && d.getMonth() === monthIdx;
      });
    } else if (periodType === "annual" && currentPeriodRange.start && currentPeriodRange.end) {
      const s = new Date(currentPeriodRange.start), e = new Date(currentPeriodRange.end);
      scope = scope.filter((a) => a.assessment_date && new Date(a.assessment_date) >= s && new Date(a.assessment_date) <= e);
    }
    const markByA = new Map(allMarks.map((m) => [m.assessment_id, m]));
    return scope
      .map((a) => ({
        id: a.id,
        title: a.title,
        subject_id: a.subject_id,
        subject: a.subject_id ? subjectName.get(a.subject_id) ?? "—" : "—",
        date: a.assessment_date,
        max: a.max_marks,
        type: a.assessment_type || "test",
        marks: markByA.get(a.id)?.marks ?? null,
        grade: markByA.get(a.id)?.computed_grade ?? null,
      }))
      .sort((x, y) => (x.date || "").localeCompare(y.date || ""));
  }, [allAssessments, allMarks, subjects, card, periodType, examId, monthIdx, monthYear, currentPeriodRange.start, currentPeriodRange.end, studentId, JSON.stringify(enrollments)]);

  // ───── Per-subject × per-category breakdown (quiz/test/assignment/project/exam/etc.)
  const CATEGORY_ORDER: { key: string; label: string }[] = [
    { key: "quiz", label: "Quizzes" },
    { key: "test", label: "Tests" },
    { key: "assignment", label: "Assignments" },
    { key: "project", label: "Projects" },
    { key: "classwork", label: "Classwork" },
    { key: "homework", label: "Homework" },
    { key: "practical", label: "Practical" },
    { key: "oral", label: "Oral" },
    { key: "presentation", label: "Presentation" },
    { key: "lab", label: "Lab" },
    { key: "midterm", label: "Mid-term" },
    { key: "exam", label: "Exam" },
    { key: "final", label: "Final" },
  ];

  const categoryBreakdown = useMemo(() => {
    // Filter assessments by current period scope
    const inScope = appendix.map((a) => a.id);
    const inScopeSet = new Set(inScope);
    const markByA = new Map(allMarks.map((m) => [m.assessment_id, m]));

    // matrix: subjectId -> categoryKey -> { obtained, max }
    const matrix: Record<string, Record<string, { obtained: number; max: number }>> = {};
    const usedCategories = new Set<string>();

    allAssessments.forEach((a) => {
      if (!inScopeSet.has(a.id)) return;
      if (!a.subject_id) return;
      const cat = (a.assessment_type || "test").toLowerCase();
      const m = markByA.get(a.id);
      if (m?.marks == null) return;
      usedCategories.add(cat);
      const max = Number(a.max_marks || 100);
      if (!matrix[a.subject_id]) matrix[a.subject_id] = {};
      if (!matrix[a.subject_id][cat]) matrix[a.subject_id][cat] = { obtained: 0, max: 0 };
      matrix[a.subject_id][cat].obtained += Number(m.marks);
      matrix[a.subject_id][cat].max += max;
    });

    const visibleCategories = CATEGORY_ORDER.filter((c) => usedCategories.has(c.key));
    return { matrix, visibleCategories };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssessments, allMarks, appendix]);

  const enriched = useMemo(() => {
    return students.map((s) => {
      const enr = enrollments.find((e) => e.student_id === s.id);
      const sec = sections.find((x) => x.id === enr?.class_section_id);
      const cls = classes.find((c) => c.id === sec?.class_id);
      return { ...s, section_id: sec?.id ?? null, class_id: cls?.id ?? null, classLabel: cls ? `${cls.name}${sec ? ` • ${sec.name}` : ""}` : "Unassigned" };
    });
  }, [students, enrollments, sections, classes]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((s) => {
      // Teachers (non-admin) can only see students from sections assigned to them.
      if (teacherSectionIds !== null) {
        if (!s.section_id || !teacherSectionIds.includes(s.section_id)) return false;
      }
      const fullName = `${s.first_name} ${s.last_name || ""}`.toLowerCase();
      if (q && !fullName.includes(q) && !(s.student_code || "").toLowerCase().includes(q)) return false;
      if (classFilter !== "all" && s.class_id !== classFilter) return false;
      if (sectionFilter !== "all" && s.section_id !== sectionFilter) return false;
      return true;
    });
  }, [enriched, search, classFilter, sectionFilter, teacherSectionIds]);


  const periodTitle = useMemo(() => {
    if (card.exam_id) return exams.find((e) => e.id === card.exam_id)?.name || "Exam Report";
    if (card.period_label) return card.period_label;
    if (periodType === "exam") return exams.find((e) => e.id === examId)?.name || "Cumulative Results";
    return currentPeriodLabel || "Report Card";
  }, [card, exams, examId, periodType, currentPeriodLabel]);

  const save = async () => {
    if (!schoolId || !studentId) { toast.error("Select a student"); return null; }
    if (periodType === "exam" && !examId) { toast.error("Select an exam"); return null; }
    const userResp = await (supabase as any).auth.getUser();
    const uid = userResp.data?.user?.id ?? null;

    if (periodType === "exam") {
      for (const subjectId of Object.keys(results)) {
        const r = results[subjectId];
        if (r.marks_obtained == null) continue;
        await (supabase as any).from("exam_results").upsert({
          school_id: schoolId, exam_id: examId, student_id: studentId, subject_id: subjectId,
          marks_obtained: r.marks_obtained, max_marks: r.max_marks, grade: r.grade, remarks: r.remarks,
        }, { onConflict: "exam_id,student_id,subject_id" });
      }
    }

    const basePayload: any = {
      school_id: schoolId, student_id: studentId,
      total_marks: totals.total, max_total: totals.max, percentage: totals.pct,
      gpa: null, overall_grade: totals.grade,
      teacher_remarks: card.teacher_remarks, principal_remarks: card.principal_remarks,
      attendance_percentage: card.attendance_percentage,
      is_published: card.is_published, // preserve current state, do NOT auto-publish on save
      published_at: (card as any).published_at ?? null,
      last_edited_by: uid,
      period_type: periodType,
    };

    let onConflict: string;
    if (periodType === "exam") {
      basePayload.exam_id = examId;
      basePayload.period_label = exams.find((e) => e.id === examId)?.name ?? null;
      onConflict = "exam_id,student_id";
    } else {
      basePayload.exam_id = null;
      basePayload.period_label = currentPeriodLabel;
      basePayload.period_start = currentPeriodRange.start;
      basePayload.period_end = currentPeriodRange.end;
      basePayload.academic_year = periodType === "annual" ? annualYear : null;
      onConflict = "school_id,student_id,period_type,period_label";
    }

    const { data, error } = await (supabase as any)
      .from("report_cards")
      .upsert(basePayload, { onConflict })
      .select("id,is_published,published_at")
      .maybeSingle();
    if (error) { toast.error(error.message); return null; }
    toast.success("Saved as draft");
    if (data) setCard((c) => ({ ...c, id: data.id, is_published: data.is_published, published_at: data.published_at }));
    return data?.id ?? null;
  };

  const notifyPublish = async (studentIds: string[], published: boolean) => {
    if (!schoolId || studentIds.length === 0) return;
    const title = published ? "New report card published" : "Report card unpublished";
    const body = `${periodTitle} — ${published ? "now available on your dashboard" : "temporarily withdrawn"}.`;
    
    // Resolve recipients: student profile_id + guardians
    const [{ data: studs }, { data: guards }] = await Promise.all([
      (supabase as any).from("students").select("id,profile_id").in("id", studentIds),
      (supabase as any).from("student_guardians").select("student_id,user_id").in("student_id", studentIds),
    ]);

    // Query card IDs to set as entity_id
    let cardsQuery = (supabase as any)
      .from("report_cards")
      .select("id,student_id")
      .eq("school_id", schoolId)
      .eq("period_type", periodType)
      .in("student_id", studentIds);
    if (periodType === "exam") {
      cardsQuery = cardsQuery.eq("exam_id", examId);
    } else {
      cardsQuery = cardsQuery.eq("period_label", currentPeriodLabel);
    }
    const { data: cards } = await cardsQuery;
    const studentCardMap = new Map<string, string>();
    (cards || []).forEach((c: any) => {
      studentCardMap.set(c.student_id, c.id);
    });

    const notifRows: any[] = [];
    (studs || []).forEach((s: any) => {
      if (s.profile_id) {
        const rcId = studentCardMap.get(s.id) || null;
        notifRows.push({
          school_id: schoolId, user_id: s.profile_id,
          type: published ? "report_card_published" : "report_card_unpublished",
          title, body, entity_type: "report_card", entity_id: rcId,
        });
      }
    });
    (guards || []).forEach((g: any) => {
      if (g.user_id) {
        const rcId = studentCardMap.get(g.student_id) || null;
        notifRows.push({
          school_id: schoolId, user_id: g.user_id,
          type: published ? "report_card_published" : "report_card_unpublished",
          title, body, entity_type: "report_card", entity_id: rcId,
        });
      }
    });

    if (notifRows.length > 0) {
      await (supabase as any).from("app_notifications").insert(notifRows);
    }
  };

  const publishIndividual = async (publish: boolean) => {
    // Ensure saved first
    let id = card.id;
    if (!id) {
      id = await save();
      if (!id) return;
    }
    const { error } = await (supabase as any)
      .from("report_cards")
      .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setCard((c) => ({ ...c, is_published: publish, published_at: publish ? new Date().toISOString() : null }));
    await notifyPublish([studentId], publish);
    toast.success(publish ? "Published — sent to parent dashboard" : "Unpublished");
  };

  // Whole-class publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSectionId, setPublishSectionId] = useState<string>("");
  const [publishBusy, setPublishBusy] = useState(false);

  const publishWholeClass = async (publish: boolean) => {
    if (!schoolId) return;
    if (!publishSectionId) return toast.error("Select a section");
    setPublishBusy(true);
    try {
      const sectionStudentIds = enrollments
        .filter((e) => e.class_section_id === publishSectionId)
        .map((e) => e.student_id);
      if (sectionStudentIds.length === 0) { toast.error("No students in section"); return; }

      let query = (supabase as any)
        .from("report_cards")
        .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
        .eq("school_id", schoolId)
        .in("student_id", sectionStudentIds);
      if (periodType === "exam") {
        if (!examId) return toast.error("Select an exam first");
        query = query.eq("exam_id", examId);
      } else {
        query = query.eq("period_type", periodType).eq("period_label", currentPeriodLabel);
      }
      const { data, error } = await query.select("student_id");
      if (error) return toast.error(error.message);
      const affected = (data || []).map((r: any) => r.student_id);
      if (affected.length === 0) {
        toast.error("No saved report cards found for this section — save students' cards first.");
        return;
      }
      await notifyPublish(affected, publish);
      toast.success(`${publish ? "Published" : "Unpublished"} ${affected.length} report card${affected.length === 1 ? "" : "s"}`);
      setPublishDialogOpen(false);
    } finally {
      setPublishBusy(false);
    }
  };

  // ───────── Inline "+ add quiz/test/assignment" for current student/subject
  const [addOpen, setAddOpen] = useState(false);
  const [addSubjectId, setAddSubjectId] = useState<string>("");
  const [addType, setAddType] = useState<string>("quiz");
  const [addTitle, setAddTitle] = useState("");
  const [addMax, setAddMax] = useState<number>(10);
  const [addMarks, setAddMarks] = useState<number>(0);
  const [addDate, setAddDate] = useState<string>(new Date().toISOString().slice(0, 10));

  const openAddFor = (subjectId: string) => {
    setAddSubjectId(subjectId);
    setAddType("quiz");
    setAddTitle("");
    setAddMax(10);
    setAddMarks(0);
    setAddDate(new Date().toISOString().slice(0, 10));
    setAddOpen(true);
  };

  const submitAddAssessment = async () => {
    if (!schoolId || !studentId || !addSubjectId) return;
    if (!addTitle.trim()) return toast.error("Title required");
    const enr = enrollments.find((e) => e.student_id === studentId);
    if (!enr?.class_section_id) return toast.error("Student has no class section");
    const userResp = await (supabase as any).auth.getUser();
    const uid = userResp.data?.user?.id ?? null;

    const { data: a, error: aErr } = await (supabase as any)
      .from("academic_assessments")
      .insert({
        school_id: schoolId,
        class_section_id: enr.class_section_id,
        subject_id: addSubjectId,
        title: addTitle.trim(),
        assessment_type: addType,
        assessment_date: addDate,
        max_marks: addMax,
        is_published: true,
        published_at: new Date().toISOString(),
        created_by: uid,
      })
      .select("id,subject_id,max_marks,is_published,title,assessment_date,assessment_type,weightage_percent,class_section_id")
      .single();
    if (aErr || !a) return toast.error(aErr?.message || "Failed to add");

    const pct = addMax > 0 ? (addMarks / addMax) * 100 : 0;
    const { error: mErr } = await (supabase as any)
      .from("student_marks")
      .upsert({
        school_id: schoolId,
        assessment_id: a.id,
        student_id: studentId,
        marks: addMarks,
        computed_grade: calcGrade(pct).grade,
        created_by: uid,
      }, { onConflict: "school_id,assessment_id,student_id" });
    if (mErr) return toast.error(mErr.message);

    setAllAssessments((prev) => [...prev, a as any]);
    setAllMarks((prev) => [...prev, { assessment_id: a.id, marks: addMarks, computed_grade: calcGrade(pct).grade } as any]);
    toast.success(`${addType[0].toUpperCase() + addType.slice(1)} added`);
    setAddOpen(false);
  };

  // Edit an existing assessment + the current student's mark for it
  const [editAssessmentId, setEditAssessmentId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<string>("quiz");
  const [editMax, setEditMax] = useState<number>(10);
  const [editMarks, setEditMarks] = useState<number>(0);
  const [editDate, setEditDate] = useState<string>("");

  const openEditAssessment = (id: string) => {
    const a = allAssessments.find((x) => x.id === id);
    if (!a) return;
    const m = allMarks.find((x) => x.assessment_id === id);
    setEditAssessmentId(id);
    setEditTitle(a.title || "");
    setEditType((a.assessment_type || "quiz").toLowerCase());
    setEditMax(Number(a.max_marks || 0));
    setEditMarks(Number(m?.marks ?? 0));
    setEditDate(a.assessment_date || new Date().toISOString().slice(0, 10));
  };

  const submitEditAssessment = async () => {
    if (!schoolId || !studentId || !editAssessmentId) return;
    if (!editTitle.trim()) return toast.error("Title required");
    const userResp = await (supabase as any).auth.getUser();
    const uid = userResp.data?.user?.id ?? null;

    const { error: aErr } = await (supabase as any)
      .from("academic_assessments")
      .update({
        title: editTitle.trim(),
        assessment_type: editType,
        assessment_date: editDate,
        max_marks: editMax,
      })
      .eq("id", editAssessmentId)
      .eq("school_id", schoolId);
    if (aErr) return toast.error(aErr.message);

    const pct = editMax > 0 ? (editMarks / editMax) * 100 : 0;
    const { error: mErr } = await (supabase as any)
      .from("student_marks")
      .upsert({
        school_id: schoolId,
        assessment_id: editAssessmentId,
        student_id: studentId,
        marks: editMarks,
        computed_grade: calcGrade(pct).grade,
        created_by: uid,
      }, { onConflict: "school_id,assessment_id,student_id" });
    if (mErr) return toast.error(mErr.message);

    setAllAssessments((prev) => prev.map((a) =>
      a.id === editAssessmentId
        ? { ...a, title: editTitle.trim(), assessment_type: editType, assessment_date: editDate, max_marks: editMax }
        : a
    ));
    setAllMarks((prev) => {
      const exists = prev.some((m) => m.assessment_id === editAssessmentId);
      if (exists) {
        return prev.map((m) => m.assessment_id === editAssessmentId
          ? { ...m, marks: editMarks, computed_grade: calcGrade(pct).grade }
          : m);
      }
      return [...prev, { assessment_id: editAssessmentId, marks: editMarks, computed_grade: calcGrade(pct).grade } as any];
    });
    toast.success("Updated");
    setEditAssessmentId(null);
  };

  const deleteAssessment = async (id: string) => {
    if (!schoolId) return;
    if (!confirm("Delete this assessment? This removes it and all student marks for it.")) return;
    // Delete marks first (in case FK is not cascading), then assessment
    await (supabase as any).from("student_marks").delete().eq("school_id", schoolId).eq("assessment_id", id);
    const { error } = await (supabase as any).from("academic_assessments").delete().eq("school_id", schoolId).eq("id", id);
    if (error) return toast.error(error.message);
    setAllAssessments((prev) => prev.filter((a) => a.id !== id));
    setAllMarks((prev) => prev.filter((m) => m.assessment_id !== id));
    toast.success("Deleted");
  };




  const showPicker = !studentIdLocked;
  const today = format(new Date(), "MMMM d, yyyy");

  // ───────────── Parent / Student LIST view ─────────────
  if (isReadOnlyForChild && !viewingCardId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">Report Cards</h2>
          <p className="text-sm text-muted-foreground">All published monthly, exam and annual report cards</p>
        </div>

        {myCards.length === 0 ? (
          <Card>
            <CardContent className="grid place-items-center py-16 text-center">
              <GraduationCap className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-medium">No report cards yet</p>
              <p className="text-sm text-muted-foreground">Cards will appear here as soon as they are published.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myCards.map((c) => {
              const ex = c.exam_id ? exams.find((e) => e.id === c.exam_id) : null;
              const title = ex?.name || c.period_label || "Report Card";
              const Icon = c.period_type === "annual" ? Sparkles : c.period_type === "monthly" ? Calendar : c.period_type === "exam" ? FileText : ClipboardList;
              return (
                <button
                  key={c.id}
                  onClick={() => setViewingCardId(c.id)}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium leading-tight">{title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{c.period_type}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize">{c.overall_grade || "—"}</Badge>
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Percentage</p>
                      <p className="font-display text-2xl font-bold">{c.percentage != null ? `${Number(c.percentage).toFixed(1)}%` : "—"}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {c.published_at ? format(new Date(c.published_at), "MMM d, yyyy") : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          {isReadOnlyForChild && viewingCardId && (
            <Button variant="ghost" size="sm" onClick={() => { setViewingCardId(null); setCard({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: null, is_published: false }); }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> All cards
            </Button>
          )}
          <div>
            <h2 className="font-display text-2xl font-semibold">Report Cards</h2>
            <p className="text-sm text-muted-foreground">Monthly, exam-based and annual cumulative reports</p>
          </div>
        </div>
        <Button variant="outline" onClick={async () => {
          const el = document.getElementById("report-card-print") as HTMLElement | null;
          if (!el) return toast.error("No report card to export");
          try {
            el.classList.add("exporting-pdf");
            const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: el.scrollWidth });
            el.classList.remove("exporting-pdf");
            const pdf = new jsPDF("p", "mm", "a4");
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            const margin = 8;
            const availW = pageW - margin * 2;
            const availH = pageH - margin * 2;
            const ratio = canvas.width / canvas.height;
            let w = availW; let h = w / ratio;
            if (h > availH) { h = availH; w = h * ratio; }
            const x = (pageW - w) / 2; const y = (pageH - h) / 2;
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
            const name = (studentInfo ? `${studentInfo.first_name}-${studentInfo.last_name || ""}` : "report-card").replace(/\s+/g, "_");
            pdf.save(`${name}_report-card.pdf`);
          } catch (e: any) {
            el.classList.remove("exporting-pdf");
            toast.error(e?.message || "Failed to export PDF");
          }
        }}>
          <Printer className="mr-2 h-4 w-4" />Download PDF
        </Button>
      </div>

      {/* Period selector — staff or "create" mode */}
      {!isReadOnlyForChild && (
        <div className="rounded-2xl border bg-card p-3 print:hidden">
          <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <TabsList>
              <TabsTrigger value="exam"><FileText className="mr-1 h-4 w-4" />Exam</TabsTrigger>
              <TabsTrigger value="monthly"><Calendar className="mr-1 h-4 w-4" />Monthly</TabsTrigger>
              <TabsTrigger value="annual"><CalendarRange className="mr-1 h-4 w-4" />Annual</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {periodType === "exam" && (
              <Select value={examId} onValueChange={setExamId}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.term_label ? ` (${e.term_label})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {periodType === "monthly" && (
              <>
                <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(monthYear)} onValueChange={(v) => setMonthYear(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, i) => currentYear() - 3 + i).map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {periodType === "annual" && (
              <Select value={annualYear} onValueChange={setAnnualYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 6 }, (_, i) => currentYear() - 3 + i).map((y) => (
                    <SelectItem key={`${y}-${y + 1}`} value={`${y}-${y + 1}`}>{`${y}-${y + 1}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 print:hidden lg:grid-cols-[320px_1fr]">
        {showPicker && (
          <div className="rounded-2xl border bg-card p-3">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setSectionFilter("all"); }}>
                  <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classes
                      .filter((c) => teacherSectionIds === null || sections.some((s) => s.class_id === c.id && teacherSectionIds.includes(s.id)))
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections
                      .filter((s) => classFilter === "all" || s.class_id === classFilter)
                      .filter((s) => teacherSectionIds === null || teacherSectionIds.includes(s.id))
                      .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScrollArea className="mt-3 h-[460px] pr-2">
              <div className="space-y-1">
                {filteredStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStudentId(s.id)}
                    className={`w-full rounded-xl border p-2 text-left transition-colors hover:bg-muted/50 ${studentId === s.id ? "border-primary bg-primary/5" : "border-transparent"}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.first_name} {s.last_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{s.classLabel}{s.student_code ? ` • ${s.student_code}` : ""}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredStudents.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No students match your filters</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {(!studentId || !studentInfo) && (
          <div className="grid place-items-center rounded-2xl border bg-card p-12 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Select a student</p>
            <p className="text-sm text-muted-foreground">Pick a student, then choose Exam, Monthly, or Annual to build the report.</p>
          </div>
        )}
      </div>

      {studentId && studentInfo && (
        <div
          id="report-card-print"
          className="relative mx-auto overflow-hidden rounded-3xl bg-white text-black shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)] ring-1 ring-black/5 print:rounded-none print:shadow-none print:ring-0"
          style={{ maxWidth: 860 }}
        >
          {/* Decorative top band */}
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55) 0, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.35) 0, transparent 45%)" }} />
            <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            <div className="relative flex h-full items-center justify-between px-8">
              <div className="flex items-center gap-4">
                {school?.logo_url ? (
                  <img src={school.logo_url} alt="School logo" className="h-16 w-16 rounded-xl bg-white/95 object-contain p-1.5 shadow-lg" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl bg-white/95 shadow-lg">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div>
                  <p className="font-display text-2xl font-bold leading-tight tracking-tight">{school?.name || "School"}</p>
                  {school?.motto && <p className="text-[11px] italic opacity-90">"{school.motto}"</p>}
                  <p className="text-[11px] opacity-90">{[school?.address, school?.phone, school?.email].filter(Boolean).join(" • ")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur">
                  {(card.period_type || periodType) === "annual" ? "Annual Report" : (card.period_type || periodType) === "monthly" ? "Monthly Report" : "Official Report"}
                </p>
                {card.is_published && <p className="mt-2 text-[10px] font-bold text-emerald-200">● PUBLISHED</p>}
              </div>
            </div>
          </div>

          {/* Watermark */}
          {school?.logo_url && (
            <img src={school.logo_url} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.035]" />
          )}

          <div className="relative px-8 pb-8 pt-6">
            {/* Title + meta */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-dashed border-gray-300 pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Academic Report Card</p>
                <p className="font-display text-2xl font-bold tracking-tight">{periodTitle}</p>
              </div>
              <p className="text-xs text-gray-500">Issued <strong className="text-gray-700">{today}</strong></p>
            </div>

            {/* Student profile card */}
            <div className="relative mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 md:grid-cols-[auto_1fr]">
              {studentInfo.profile_image_url ? (
                <img src={studentInfo.profile_image_url} alt="" className="h-24 w-24 rounded-2xl object-cover ring-2 ring-primary/20" />
              ) : (
                <div className="grid h-24 w-24 place-items-center rounded-2xl bg-primary/10 ring-2 ring-primary/20">
                  <User className="h-10 w-10 text-primary" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm md:grid-cols-3">
                <p><span className="text-gray-500">Name:</span> <strong>{studentInfo.first_name} {studentInfo.last_name}</strong></p>
                <p><span className="text-gray-500">Roll No:</span> <strong>{studentInfo.student_code || "—"}</strong></p>
                <p><span className="text-gray-500">Class:</span> <strong>{(() => { const e = enrollments.find(x => x.student_id === studentId); const sec = sections.find(s => s.id === e?.class_section_id); const cls = classes.find(c => c.id === sec?.class_id); return cls?.name || "—"; })()}</strong></p>
                <p><span className="text-gray-500">Section:</span> <strong>{(() => { const e = enrollments.find(x => x.student_id === studentId); const sec = sections.find(s => s.id === e?.class_section_id); return sec?.name || "—"; })()}</strong></p>
                <p><span className="text-gray-500">DOB:</span> <strong>{studentInfo.date_of_birth ? format(new Date(studentInfo.date_of_birth), "MMM d, yyyy") : "—"}</strong></p>
                <p><span className="text-gray-500">Parent:</span> <strong>{studentInfo.parent_name || "—"}</strong></p>
                <p><span className="text-gray-500">Phone:</span> <strong>{studentInfo.phone || studentInfo.parent_phone || "—"}</strong></p>
                <p className="md:col-span-2"><span className="text-gray-500">Address:</span> <strong>{studentInfo.address || "—"}</strong></p>
              </div>
            </div>

          <table className="relative mt-5 w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "22%" }} className="print:hidden" />
            </colgroup>
            <thead>
              <tr className="bg-primary/10 text-left">
                <th className="border border-gray-300 p-2">Subject</th>
                <th className="border border-gray-300 p-2 text-center">Marks</th>
                <th className="border border-gray-300 p-2 text-center">Max</th>
                <th className="border border-gray-300 p-2 text-center">%</th>
                <th className="border border-gray-300 p-2 text-center">Grade</th>
                <th className="border border-gray-300 p-2 print:hidden">Remarks</th>
              </tr>
            </thead>

            <tbody>
              {subjects.map((s) => {
                const r = results[s.id];
                const max = r?.max_marks || 100;
                const obtained = r?.marks_obtained;
                const pct = obtained != null && max > 0 ? Math.round((Number(obtained) / Number(max)) * 100) : null;
                return (
                  <tr key={s.id}>
                    <td className="border border-gray-300 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>{s.name}</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openAddFor(s.id)}
                            className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 print:hidden"
                            title="Add quiz / test / assignment"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="border border-gray-300 p-2 text-center">
                      {canManage ? (
                        <Input type="number" className="mx-auto h-8 w-20 text-center text-black" value={r?.marks_obtained ?? ""} onChange={(e) => updateMark(s.id, Number(e.target.value), max)} />
                      ) : (obtained ?? "—")}
                    </td>
                    <td className="border border-gray-300 p-2 text-center">
                      {canManage ? (
                        <Input type="number" className="mx-auto h-8 w-20 text-center text-black" value={r?.max_marks ?? 100} onChange={(e) => updateMark(s.id, Number(r?.marks_obtained || 0), Number(e.target.value))} />
                      ) : max}
                    </td>

                    <td className="border border-gray-300 p-2 text-center">{pct != null ? `${pct}%` : "—"}</td>
                    <td className="border border-gray-300 p-2 text-center font-semibold">{r?.grade ?? "—"}</td>
                    <td className="border border-gray-300 p-2 print:hidden">
                      {canManage ? (
                        <Input className="h-8 text-black" value={r?.remarks ?? ""} onChange={(e) => setResults({ ...results, [s.id]: { ...(results[s.id] || { subject_id: s.id, marks_obtained: null, max_marks: 100, grade: null, remarks: null }), remarks: e.target.value } })} />
                      ) : (r?.remarks || "—")}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold">
                <td className="border border-gray-300 p-2">TOTAL</td>
                <td className="border border-gray-300 p-2 text-center">{totals.total}</td>
                <td className="border border-gray-300 p-2 text-center">{totals.max}</td>
                <td className="border border-gray-300 p-2 text-center">{totals.pct}%</td>
                <td className="border border-gray-300 p-2 text-center">{totals.grade}</td>
                <td className="border border-gray-300 p-2 print:hidden"></td>
              </tr>
            </tbody>
          </table>

          {/* Premium summary tiles */}
          <div className="relative mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-4 ring-1 ring-primary/20">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Percentage</p>
              <p className="font-display text-3xl font-bold text-primary">{totals.pct}%</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Marks</p>
              <p className="font-display text-3xl font-bold text-amber-700">{totals.total}<span className="text-base font-medium text-gray-500"> / {totals.max}</span></p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 p-4 ring-1 ring-emerald-200">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Overall Grade</p>
              <p className="font-display text-3xl font-bold text-emerald-700">{totals.grade}</p>
            </div>
          </div>

          {/* Category breakdown — Quizzes / Tests / Assignments / Projects / Exam etc. */}
          {categoryBreakdown.visibleCategories.length > 0 && (
            <div className="relative mt-6">
              <p className="mb-2 text-sm font-semibold">Continuous Assessment Breakdown</p>
              <div className="overflow-x-auto rounded-xl ring-1 ring-gray-200">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-gradient-to-r from-primary/10 to-primary/5 text-left">
                      <th className="p-2 font-semibold">Subject</th>
                      {categoryBreakdown.visibleCategories.map((c) => (
                        <th key={c.key} className="p-2 text-center font-semibold">{c.label}</th>
                      ))}
                      <th className="p-2 text-center font-semibold">Combined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((s) => {
                      const row = categoryBreakdown.matrix[s.id];
                      if (!row) return null;
                      let tObt = 0, tMax = 0;
                      Object.values(row).forEach((v) => { tObt += v.obtained; tMax += v.max; });
                      if (tMax === 0) return null;
                      return (
                        <tr key={s.id} className="border-t border-gray-200">
                          <td className="p-2 font-medium">{s.name}</td>
                          {categoryBreakdown.visibleCategories.map((c) => {
                            const v = row[c.key];
                            return (
                              <td key={c.key} className="p-2 text-center text-gray-700">
                                {v ? <span><strong>{v.obtained}</strong><span className="text-gray-400">/{v.max}</span></span> : <span className="text-gray-300">—</span>}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center font-semibold text-primary">
                            {tObt}/{tMax}<span className="ml-1 text-[10px] text-gray-500">({tMax ? Math.round((tObt/tMax)*100) : 0}%)</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">Includes all published quizzes, tests, assignments, projects and exam-style assessments in this period.</p>
            </div>
          )}


          {/* Per-assessment appendix */}
          {appendix.length > 0 && (
            <div className="relative mt-5">
              <p className="mb-1 text-sm font-semibold">Assessments, Assignments &amp; Tasks</p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-left">
                    <th className="border border-gray-300 p-1.5">Title</th>
                    <th className="border border-gray-300 p-1.5">Subject</th>
                    <th className="border border-gray-300 p-1.5">Date</th>
                    <th className="border border-gray-300 p-1.5 text-center">Marks</th>
                    <th className="border border-gray-300 p-1.5 text-center">Grade</th>
                    {canManage && <th className="border border-gray-300 p-1.5 text-center print:hidden">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {appendix.map((a) => (
                    <tr key={a.id}>
                      <td className="border border-gray-300 p-1.5">{a.title}</td>
                      <td className="border border-gray-300 p-1.5">{a.subject}</td>
                      <td className="border border-gray-300 p-1.5">{a.date ? format(new Date(a.date), "MMM d, yyyy") : "—"}</td>
                      <td className="border border-gray-300 p-1.5 text-center">{a.marks != null ? `${a.marks} / ${a.max}` : "—"}</td>
                      <td className="border border-gray-300 p-1.5 text-center">{a.grade ?? "—"}</td>
                      {canManage && (
                        <td className="border border-gray-300 p-1.5 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAssessment(a.id)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteAssessment(a.id)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="relative mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Class Teacher Remarks</p>
              {canManage ? (
                <Textarea className="mt-1 text-black" rows={3} value={card.teacher_remarks || ""} onChange={(e) => setCard({ ...card, teacher_remarks: e.target.value })} />
              ) : <p className="mt-1 min-h-[60px] rounded border border-gray-200 p-2 text-sm">{card.teacher_remarks || "—"}</p>}
            </div>
            <div>
              <p className="text-sm font-semibold">Principal Remarks</p>
              {canManage ? (
                <Textarea className="mt-1 text-black" rows={3} value={card.principal_remarks || ""} onChange={(e) => setCard({ ...card, principal_remarks: e.target.value })} />
              ) : <p className="mt-1 min-h-[60px] rounded border border-gray-200 p-2 text-sm">{card.principal_remarks || "—"}</p>}
            </div>
          </div>

          <div className="relative mt-4 text-sm">
            <p>
              <strong>Attendance:</strong>{" "}
              <span>{card.attendance_percentage != null ? `${card.attendance_percentage}%` : "—"}</span>
              <span className="ml-2 text-xs text-gray-500 print:hidden">(auto from attendance records)</span>
            </p>
          </div>


          <div className="relative mt-12 grid grid-cols-3 gap-4 text-center text-xs text-gray-600">
            <div><div className="border-t border-gray-500 px-4 pt-1">Class Teacher</div></div>
            <div><div className="border-t border-gray-500 px-4 pt-1">Principal</div></div>
            <div><div className="border-t border-gray-500 px-4 pt-1">Parent / Guardian</div></div>
          </div>

          <div className="relative mt-4 border-t border-dashed border-gray-300 pt-2 text-center text-[10px] text-gray-500">
            This is a computer-generated document by AltRix • {school?.name || "School"} • {today}
          </div>
          </div>
        </div>
      )}

      {canManage && studentId && (
        <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur print:hidden">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {periodType === "exam"
                ? (examId ? "Ready to save exam report card" : "Pick an exam to enable saving")
                : `Ready to save ${periodType} report card — ${currentPeriodLabel}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {card.is_published
                ? "Published — visible on student & parent dashboards."
                : "Save first. Publish separately when ready to release to parents."}
            </p>
          </div>
          <Button variant="outline" disabled={periodType === "exam" && !examId} onClick={() => save()}>
            Save
          </Button>
          {card.is_published ? (
            <Button variant="secondary" onClick={() => publishIndividual(false)}>
              Unpublish
            </Button>
          ) : (
            <Button disabled={periodType === "exam" && !examId} onClick={() => publishIndividual(true)}>
              <Send className="mr-1.5 h-4 w-4" /> Publish to parent
            </Button>
          )}
          <Button
            variant="outline"
            disabled={periodType === "exam" && !examId}
            onClick={() => {
              const enr = enrollments.find((e) => e.student_id === studentId);
              setPublishSectionId(enr?.class_section_id || "");
              setPublishDialogOpen(true);
            }}
          >
            <Users className="mr-1.5 h-4 w-4" /> Publish whole class
          </Button>
        </div>
      )}

      {/* Add quiz/test/assignment dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add marks entry</DialogTitle>
            <DialogDescription>
              Quickly log a quiz, test or assignment for this student. It will be reflected in the report card.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={addType} onValueChange={setAddType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="classwork">Classwork</SelectItem>
                    <SelectItem value="homework">Homework</SelectItem>
                    <SelectItem value="practical">Practical</SelectItem>
                    <SelectItem value="oral">Oral</SelectItem>
                    <SelectItem value="presentation">Presentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="e.g. Chapter 3 quiz" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marks obtained</Label>
                <Input type="number" value={addMarks} onChange={(e) => setAddMarks(Number(e.target.value))} />
              </div>
              <div>
                <Label>Out of</Label>
                <Input type="number" value={addMax} onChange={(e) => setAddMax(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAddAssessment}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit assessment dialog */}
      <Dialog open={!!editAssessmentId} onOpenChange={(o) => !o && setEditAssessmentId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit marks entry</DialogTitle>
            <DialogDescription>
              Update this assessment's details and the current student's marks for it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="classwork">Classwork</SelectItem>
                    <SelectItem value="homework">Homework</SelectItem>
                    <SelectItem value="practical">Practical</SelectItem>
                    <SelectItem value="oral">Oral</SelectItem>
                    <SelectItem value="presentation">Presentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Marks obtained</Label>
                <Input type="number" value={editMarks} onChange={(e) => setEditMarks(Number(e.target.value))} />
              </div>
              <div>
                <Label>Out of</Label>
                <Input type="number" value={editMax} onChange={(e) => setEditMax(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssessmentId(null)}>Cancel</Button>
            <Button onClick={submitEditAssessment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Publish whole class dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish whole class</DialogTitle>
            <DialogDescription>
              Publish or unpublish saved report cards for every student in a section.
              Only cards that have already been saved will be affected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Section</Label>
              <Select value={publishSectionId} onValueChange={setPublishSectionId}>
                <SelectTrigger><SelectValue placeholder="Select a section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => {
                    const cls = classes.find((c) => c.id === s.class_id);
                    return <SelectItem key={s.id} value={s.id}>{cls?.name ? `${cls.name} • ` : ""}{s.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Scope: <strong>{periodType === "exam" ? (exams.find((e) => e.id === examId)?.name || "Exam") : currentPeriodLabel}</strong>
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={publishBusy} onClick={() => publishWholeClass(false)}>Unpublish all</Button>
            <Button disabled={publishBusy} onClick={() => publishWholeClass(true)}>
              <Send className="mr-1.5 h-4 w-4" /> Publish all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
