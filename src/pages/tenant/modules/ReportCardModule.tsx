import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
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
  Save,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Download,
  Award,
  BookOpen,
  Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { exportCleanDocumentToPdf } from "@/lib/pdfExportEngine";

interface Exam { id: string; name: string; term_label: string | null; start_date?: string | null; end_date?: string | null; }
interface Student { id: string; first_name: string; last_name: string | null; student_code?: string | null; section_id?: string | null; class_id?: string | null; classLabel?: string; }
interface Subject { id: string; name: string; }
interface Result { id?: string; subject_id: string; marks_obtained: number | null; max_marks: number; grade: string | null; remarks: string | null; }
interface CardData { id?: string; exam_id?: string | null; total_marks: number | null; max_total: number | null; percentage: number | null; gpa: number | null; overall_grade: string | null; teacher_remarks: string | null; principal_remarks: string | null; attendance_percentage: number | null; is_published: boolean; period_type?: string; period_label?: string | null; period_start?: string | null; period_end?: string | null; academic_year?: string | null; published_at?: string | null; }
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

const getGradeBadge = (grade: string | null) => {
  if (!grade) return "bg-slate-100 text-slate-500 border-slate-200";
  switch (grade.toUpperCase()) {
    case "A+":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300";
    case "A":
      return "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300";
    case "B":
      return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300";
    case "C":
      return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300";
    case "D":
      return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300";
    case "F":
      return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const currentYear = () => new Date().getFullYear();
const academicYearLabel = () => {
  const y = currentYear();
  const m = new Date().getMonth();
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
  const [card, setCard] = useState<CardData>({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: null, is_published: false });
  const [school, setSchool] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [allAssessments, setAllAssessments] = useState<AssessmentRow[]>([]);
  const [allMarks, setAllMarks] = useState<MarkRow[]>([]);
  const [teacherSectionIds, setTeacherSectionIds] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  useEffect(() => {
    if (!schoolId || !canManageProp) { setTeacherSectionIds(null); return; }
    let cancelled = false;
    (async () => {
      const { data: auth } = await (api as any).auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data: roles } = await (api as any)
        .from("user_roles")
        .select("role")
        .eq("school_id", schoolId)
        .eq("user_id", uid);
      const roleList: string[] = (roles || []).map((r: any) => r.role);
      const adminRoles = ["super_admin", "school_owner", "principal", "vice_principal", "school_admin", "academic_coordinator"];
      const isAdmin = roleList.some((r) => adminRoles.includes(r));
      if (isAdmin) { if (!cancelled) setTeacherSectionIds(null); return; }
      
      const [ta, ss, tsa] = await Promise.all([
        (api as any).from("teacher_assignments").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
        (api as any).from("section_subjects").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
        (api as any).from("teacher_subject_assignments").select("class_section_id").eq("school_id", schoolId).eq("teacher_user_id", uid),
      ]);
      const ids = new Set<string>();
      [...(ta.data || []), ...(ss.data || []), ...(tsa.data || [])].forEach((r: any) => {
        if (r?.class_section_id) ids.add(r.class_section_id);
      });
      if (!cancelled) setTeacherSectionIds(Array.from(ids));
    })();
    return () => { cancelled = true; };
  }, [schoolId, canManageProp]);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const [ex, st, sub, sch, cls, sec, enr] = await Promise.all([
        (api as any).from("exams").select("id,name,term_label,start_date,end_date").eq("school_id", schoolId).order("start_date", { ascending: false }),
        (api as any).from("students").select("id,first_name,last_name,student_code").eq("school_id", schoolId).order("first_name"),
        (api as any).from("subjects").select("id,name").eq("school_id", schoolId).order("name"),
        (api as any).from("schools").select("*").eq("id", schoolId).maybeSingle(),
        (api as any).from("academic_classes").select("id,name").eq("school_id", schoolId).order("name"),
        (api as any).from("class_sections").select("id,name,class_id").eq("school_id", schoolId),
        (api as any).from("student_enrollments").select("student_id,class_section_id").eq("school_id", schoolId),
      ]);
      setExams(ex.data || []); setStudents(st.data || []); setSubjects(sub.data || []); setSchool(sch.data);
      setClasses(cls.data || []); setSections(sec.data || []); setEnrollments(enr.data || []);
      if (!examId && ex.data && ex.data.length > 0) {
        setExamId(ex.data[0].id);
      }
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

  useEffect(() => {
    if (!isReadOnlyForChild || !schoolId || !studentId) return;
    (async () => {
      const { data } = await (api as any)
        .from("report_cards")
        .select("id,exam_id,student_id,period_type,period_label,percentage,overall_grade,is_published,published_at,updated_at")
        .eq("school_id", schoolId)
        .eq("student_id", studentId)
        .eq("is_published", true)
        .order("published_at", { ascending: false, nullsFirst: false });
      setMyCards(data || []);
    })();
  }, [isReadOnlyForChild, schoolId, studentId]);

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
    if (isReadOnlyForChild && !viewingCardId) return;
    (async () => {
      let rcQuery = (api as any).from("report_cards").select("*").eq("school_id", schoolId).eq("student_id", studentId);
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
          ? (api as any).from("exam_results").select("*").eq("school_id", schoolId).eq("exam_id", examIdForResults).eq("student_id", studentId)
          : Promise.resolve({ data: [] }),
        rcQuery,
        (api as any).from("students").select("*").eq("id", studentId).maybeSingle(),
        (api as any).from("academic_assessments").select("id,subject_id,max_marks,is_published,title,assessment_date,assessment_type,weightage_percent,class_section_id").eq("school_id", schoolId),
        (api as any).from("student_marks").select("assessment_id,marks,computed_grade").eq("school_id", schoolId).eq("student_id", studentId),
      ]);

      const loadedCard: any = (rc as any).data || null;
      setAllAssessments(assessments.data || []);
      setAllMarks(marks.data || []);

      let savedResults: any[] = res.data || [];
      if (loadedCard?.exam_id && (!savedResults || savedResults.length === 0)) {
        const { data } = await (api as any)
          .from("exam_results").select("*")
          .eq("school_id", schoolId).eq("exam_id", loadedCard.exam_id).eq("student_id", studentId);
        savedResults = data || [];
      }

      const map: Record<string, Result> = {};
      savedResults.forEach((r: any) => { map[r.subject_id] = r; });

      const studentSectionId = enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null;
      const inScope = (assessments.data || []).filter((a: any) => {
        if (a.is_published === false) return false;
        if (studentSectionId && a.class_section_id && a.class_section_id !== studentSectionId) return false;
        if (loadedCard?.exam_id || examIdForResults) return true;
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
      setHasUnsavedChanges(false);

      const safeAttendance = (a: unknown, b: unknown): number | null => {
        const na = typeof a === "number" && !Number.isNaN(a) ? a : null;
        const nb = typeof b === "number" && !Number.isNaN(b) ? b : null;
        return na ?? nb;
      };
      if (loadedCard) setCard((prev) => ({ ...loadedCard, attendance_percentage: safeAttendance(prev.attendance_percentage, loadedCard.attendance_percentage) }));
      else setCard((prev) => ({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: safeAttendance(prev.attendance_percentage, null), is_published: false }));
      setStudentInfo(info.data);

      if (loadedCard) {
        if (loadedCard.exam_id) { setPeriodType("exam"); setExamId(loadedCard.exam_id); }
        else if (loadedCard.period_type === "monthly" || loadedCard.period_type === "annual") {
          setPeriodType(loadedCard.period_type);
        }
      }
    })();
  }, [examId, studentId, schoolId, periodType, currentPeriodLabel, viewingCardId, isReadOnlyForChild, monthIdx, monthYear, currentPeriodRange.start, currentPeriodRange.end, JSON.stringify(enrollments)]);

  // Auto-compute attendance %
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
      let sessionsQ = (api as any)
        .from("attendance_sessions")
        .select("id")
        .eq("school_id", schoolId)
        .eq("class_section_id", studentSectionId);
      if (start) sessionsQ = sessionsQ.gte("session_date", start);
      if (end) sessionsQ = sessionsQ.lte("session_date", end);
      const { data: sessions } = await sessionsQ;
      const sessionIds = (sessions || []).map((s: any) => s.id);
      if (sessionIds.length === 0) return;
      
      const { data: entries } = await (api as any)
        .from("attendance_entries")
        .select("status")
        .eq("student_id", studentId)
        .in("session_id", sessionIds);
      const total = entries?.length || 0;
      if (total === 0) return;
      const attended = (entries || []).filter((e: any) => e.status === "present" || e.status === "late").length;
      const raw = (attended / total) * 100;
      const pct = Number.isFinite(raw) ? Math.round(raw * 10) / 10 : null;
      if (pct == null) return;
      setCard((c) => ({ ...c, attendance_percentage: pct }));
    })();
  }, [studentId, schoolId, periodType, examId, currentPeriodRange.start, currentPeriodRange.end, card.period_start, card.period_end, JSON.stringify(enrollments), exams]);

  const updateMark = (subjectId: string, marks: number | null, max: number) => {
    setHasUnsavedChanges(true);
    setResults((prev) => {
      const m = marks === null || Number.isNaN(marks) ? null : Number(marks);
      const mx = Number(max) || 100;
      const pct = m != null && mx > 0 ? (m / mx) * 100 : 0;
      return {
        ...prev,
        [subjectId]: {
          ...(prev[subjectId] || {}),
          subject_id: subjectId,
          marks_obtained: m,
          max_marks: mx,
          grade: m != null ? calcGrade(pct).grade : null,
          remarks: prev[subjectId]?.remarks || null,
        }
      };
    });
  };

  const totals = useMemo(() => {
    let total = 0, max = 0;
    Object.values(results).forEach((r) => {
      if (r.marks_obtained != null) {
        total += Number(r.marks_obtained);
        max += Number(r.max_marks || 100);
      }
    });
    const pct = max > 0 ? (total / max) * 100 : 0;
    const g = calcGrade(pct);
    return { total, max, pct: Math.round(pct * 100) / 100, grade: g.grade };
  }, [results]);

  const appendix = useMemo(() => {
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
    const studentSectionId = enrollments.find((e) => e.student_id === studentId)?.class_section_id ?? null;
    let scope = allAssessments.filter((a) => {
      if (a.is_published === false) return false;
      if (studentSectionId && a.class_section_id && a.class_section_id !== studentSectionId) return false;
      return true;
    });
    if (card.exam_id || (periodType === "exam" && examId)) {
      // exam mode
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
    const inScope = appendix.map((a) => a.id);
    const inScopeSet = new Set(inScope);
    const markByA = new Map(allMarks.map((m) => [m.assessment_id, m]));

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

  const currentStudentIdx = useMemo(() => {
    return filteredStudents.findIndex((s) => s.id === studentId);
  }, [filteredStudents, studentId]);

  const handlePrevStudent = () => {
    if (currentStudentIdx > 0) {
      setStudentId(filteredStudents[currentStudentIdx - 1].id);
    }
  };

  const handleNextStudent = () => {
    if (currentStudentIdx >= 0 && currentStudentIdx < filteredStudents.length - 1) {
      setStudentId(filteredStudents[currentStudentIdx + 1].id);
    }
  };

  const periodTitle = useMemo(() => {
    if (card.exam_id) return exams.find((e) => e.id === card.exam_id)?.name || "Exam Report";
    if (card.period_label) return card.period_label;
    if (periodType === "exam") return exams.find((e) => e.id === examId)?.name || "Cumulative Results";
    return currentPeriodLabel || "Report Card";
  }, [card, exams, examId, periodType, currentPeriodLabel]);

  const save = useCallback(async () => {
    if (!schoolId || !studentId) { toast.error("Select a student first"); return null; }
    if (periodType === "exam" && !examId) { toast.error("Select an exam first"); return null; }
    setIsSaving(true);
    try {
      const userResp = await (api as any).auth.getUser();
      const uid = userResp.data?.user?.id ?? null;

      if (periodType === "exam") {
        for (const subjectId of Object.keys(results)) {
          const r = results[subjectId];
          if (r.marks_obtained == null) continue;
          await (api as any).from("exam_results").upsert({
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
        is_published: card.is_published,
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

      const { data, error } = await (api as any)
        .from("report_cards")
        .upsert(basePayload, { onConflict })
        .select("id,is_published,published_at")
        .maybeSingle();
      if (error) { toast.error(error.message); return null; }
      toast.success("Marks & remarks saved successfully!");
      setHasUnsavedChanges(false);
      if (data) setCard((c) => ({ ...c, id: data.id, is_published: data.is_published, published_at: data.published_at }));
      return data?.id ?? null;
    } finally {
      setIsSaving(false);
    }
  }, [schoolId, studentId, periodType, examId, results, totals, card, exams, currentPeriodLabel, currentPeriodRange, annualYear]);

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canManage && studentId) {
          save();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canManage, studentId, save]);

  const notifyPublish = async (studentIds: string[], published: boolean, cardMap?: Map<string, string>) => {
    if (!schoolId || studentIds.length === 0) return;
    const title = published ? "New report card published" : "Report card unpublished";
    const body = `${periodTitle} — ${published ? "now available on your dashboard" : "temporarily withdrawn"}.`;
    
    const [{ data: studs }, { data: guards }] = await Promise.all([
      (api as any).from("students").select("id,profile_id").in("id", studentIds),
      (api as any).from("student_guardians").select("student_id,user_id").in("student_id", studentIds),
    ]);

    const studentCardMap = new Map<string, string>();
    if (cardMap) {
      cardMap.forEach((val, key) => studentCardMap.set(key, val));
    } else {
      let cardsQuery = (api as any)
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
      (cards || []).forEach((c: any) => {
        studentCardMap.set(c.student_id, c.id);
      });
    }

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
      await (api as any).from("app_notifications").insert(notifRows);
    }
  };

  const publishIndividual = async (publish: boolean) => {
    let id = card.id;
    if (!id || hasUnsavedChanges) {
      id = await save();
      if (!id) return;
    }
    const { error } = await (api as any)
      .from("report_cards")
      .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setCard((c) => ({ ...c, is_published: publish, published_at: publish ? new Date().toISOString() : null }));
    
    const cardMap = new Map<string, string>();
    if (id) cardMap.set(studentId, id);
    await notifyPublish([studentId], publish, cardMap);
    
    toast.success(publish ? "Published — now visible to parent & student" : "Unpublished — moved back to draft");
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

      let query = (api as any)
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
      const { data, error } = await query.select("id,student_id");
      if (error) return toast.error(error.message);
      const affected = (data || []).map((r: any) => r.student_id);
      if (affected.length === 0) {
        toast.error("No saved report cards found for this section — save students' cards first.");
        return;
      }
      
      const cardMap = new Map<string, string>();
      (data || []).forEach((r: any) => {
        if (r.id && r.student_id) cardMap.set(r.student_id, r.id);
      });
      await notifyPublish(affected, publish, cardMap);
      
      toast.success(`${publish ? "Published" : "Unpublished"} ${affected.length} report card${affected.length === 1 ? "" : "s"}`);
      setPublishDialogOpen(false);
    } finally {
      setPublishBusy(false);
    }
  };

  // Inline "+ add quiz/test/assignment"
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
    const userResp = await (api as any).auth.getUser();
    const uid = userResp.data?.user?.id ?? null;

    const { data: a, error: aErr } = await (api as any)
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
    if (aErr || !a) return toast.error(aErr?.message || "Failed to add assessment");

    const pct = addMax > 0 ? (addMarks / addMax) * 100 : 0;
    const { error: mErr } = await (api as any)
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
    toast.success(`${addType[0].toUpperCase() + addType.slice(1)} added successfully!`);
    setAddOpen(false);
  };

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
    const userResp = await (api as any).auth.getUser();
    const uid = userResp.data?.user?.id ?? null;

    const { error: aErr } = await (api as any)
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
    const { error: mErr } = await (api as any)
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
    toast.success("Updated assessment mark");
    setEditAssessmentId(null);
  };

  const deleteAssessment = async (id: string) => {
    if (!schoolId) return;
    if (!confirm("Delete this assessment? This removes it and all student marks for it.")) return;
    await (api as any).from("student_marks").delete().eq("school_id", schoolId).eq("assessment_id", id);
    const { error } = await (api as any).from("academic_assessments").delete().eq("school_id", schoolId).eq("id", id);
    if (error) return toast.error(error.message);
    setAllAssessments((prev) => prev.filter((a) => a.id !== id));
    setAllMarks((prev) => prev.filter((m) => m.assessment_id !== id));
    toast.success("Deleted");
  };

  const showPicker = !studentIdLocked;
  const today = format(new Date(), "MMMM d, yyyy");

  const exportPdf = async () => {
    const el = document.getElementById("report-card-print");
    if (!el) return toast.error("No report card to export");
    const name = (studentInfo ? `${studentInfo.first_name}_${studentInfo.last_name || ""}` : "Report_Card").replace(/\s+/g, "_");
    try {
      await exportCleanDocumentToPdf(el, {
        filename: `${name}_official_transcript.pdf`,
        orientation: "portrait",
        scale: 2.5,
      });
      toast.success("Official report card PDF downloaded successfully!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export PDF");
    }
  };

  // ───────────── Parent / Student LIST view ─────────────
  if (isReadOnlyForChild && !viewingCardId) {
    return (
      <div className="space-y-6 pb-24">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">Report Cards</h2>
          <p className="text-sm text-muted-foreground">Official published examination, monthly, and annual academic transcripts.</p>
        </div>

        {myCards.length === 0 ? (
          <Card className="rounded-2xl border-slate-200 dark:border-slate-800 shadow-sm">
            <CardContent className="grid place-items-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">No report cards released yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">Official evaluations and transcripts will appear here once finalized by the school faculty.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myCards.map((c) => {
              const ex = c.exam_id ? exams.find((e) => e.id === c.exam_id) : null;
              const title = ex?.name || c.period_label || "Academic Report Card";
              const Icon = c.period_type === "annual" ? Sparkles : c.period_type === "monthly" ? Calendar : c.period_type === "exam" ? FileText : ClipboardList;
              return (
                <button
                  key={c.id}
                  onClick={() => setViewingCardId(c.id)}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100 leading-snug">{title}</p>
                        <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mt-0.5">{c.period_type}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`font-extrabold px-2.5 py-0.5 text-xs ${getGradeBadge(c.overall_grade)}`}>
                      {c.overall_grade || "—"}
                    </Badge>
                  </div>
                  <div className="mt-5 flex items-end justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Score</p>
                      <p className="font-display text-2xl font-black text-primary">{c.percentage != null ? `${Number(c.percentage).toFixed(1)}%` : "—"}</p>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium">
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
    <div className="space-y-6 pb-36 sm:pb-28">
      {/* ─── TOP HEADER BAR ─── */}
      <div className="flex flex-col gap-4 print:hidden md:flex-row md:items-center md:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          {isReadOnlyForChild && viewingCardId && (
            <Button variant="outline" size="sm" onClick={() => { setViewingCardId(null); setCard({ total_marks: 0, max_total: 0, percentage: 0, gpa: 0, overall_grade: "", teacher_remarks: "", principal_remarks: "", attendance_percentage: null, is_published: false }); }} className="gap-1.5 font-semibold">
              <ArrowLeft className="h-4 w-4" /> Back to Cards
            </Button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Report Cards Studio</h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold uppercase">
                {periodType} Evaluation
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Comprehensive marks entry, continuous assessment aggregation, GPA grading, and printable PDF cards.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {studentId && (
            <Button variant="outline" onClick={exportPdf} className="shadow-xs font-semibold gap-2 border-slate-300 dark:border-slate-700">
              <Download className="h-4 w-4 text-blue-600" /> Export PDF
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              onClick={() => {
                const enr = enrollments.find((e) => e.student_id === studentId);
                setPublishSectionId(enr?.class_section_id || sections[0]?.id || "");
                setPublishDialogOpen(true);
              }}
              className="font-semibold gap-2"
            >
              <Users className="h-4 w-4 text-indigo-600" /> Batch Publish Class
            </Button>
          )}
        </div>
      </div>

      {/* ─── PERIOD SELECTOR TABS ─── */}
      {!isReadOnlyForChild && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-3.5 sm:p-4.5 shadow-sm backdrop-blur-sm print:hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="overflow-x-auto no-scrollbar">
              <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <TabsList className="inline-flex h-10 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <TabsTrigger value="exam" className="rounded-lg text-xs font-bold px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-xs">
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Exam Assessment
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className="rounded-lg text-xs font-bold px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-xs">
                    <Calendar className="mr-1.5 h-3.5 w-3.5" /> Monthly Progress
                  </TabsTrigger>
                  <TabsTrigger value="annual" className="rounded-lg text-xs font-bold px-4 py-1.5 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-xs">
                    <CalendarRange className="mr-1.5 h-3.5 w-3.5" /> Annual Transcript
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
              {periodType === "exam" && (
                <div className="flex items-center gap-2 min-w-[240px]">
                  <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Exam Term:</Label>
                  <Select value={examId} onValueChange={setExamId}>
                    <SelectTrigger className="h-9 font-semibold bg-white dark:bg-slate-950"><SelectValue placeholder="Select examination" /></SelectTrigger>
                    <SelectContent>
                      {exams.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.term_label ? ` (${e.term_label})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {periodType === "monthly" && (
                <div className="flex items-center gap-2">
                  <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(parseInt(v, 10))}>
                    <SelectTrigger className="h-9 font-semibold w-36 bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(monthYear)} onValueChange={(v) => setMonthYear(parseInt(v, 10))}>
                    <SelectTrigger className="h-9 font-semibold w-28 bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => currentYear() - 3 + i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {periodType === "annual" && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Session:</Label>
                  <Select value={annualYear} onValueChange={setAnnualYear}>
                    <SelectTrigger className="h-9 font-semibold w-36 bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 6 }, (_, i) => currentYear() - 3 + i).map((y) => (
                        <SelectItem key={`${y}-${y + 1}`} value={`${y}-${y + 1}`}>{`${y}-${y + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DESKTOP TWO-COLUMN WORKSPACE ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] xl:grid-cols-[360px_1fr] gap-6 items-start print:block">
        
        {/* ─── LEFT PANEL: STUDENT DIRECTORY SELECTOR ─── */}
        {showPicker && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 print:hidden sticky top-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Student Directory
              </span>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                {filteredStudents.length} Students
              </span>
            </div>

            <div className="space-y-2.5 pt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-8 h-9 text-xs font-medium bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  placeholder="Search name or roll number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setSectionFilter("all"); }}>
                  <SelectTrigger className="h-8 text-xs font-semibold"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes
                      .filter((c) => teacherSectionIds === null || sections.some((s) => s.class_id === c.id && teacherSectionIds.includes(s.id)))
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={sectionFilter} onValueChange={setSectionFilter}>
                  <SelectTrigger className="h-8 text-xs font-semibold"><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sections
                      .filter((s) => classFilter === "all" || s.class_id === classFilter)
                      .filter((s) => teacherSectionIds === null || teacherSectionIds.includes(s.id))
                      .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="mt-3 h-[calc(100vh-360px)] min-h-[380px] pr-1">
              <div className="space-y-1.5">
                {filteredStudents.map((s, idx) => {
                  const isSelected = studentId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStudentId(s.id)}
                      className={`w-full rounded-xl p-2.5 text-left transition-all duration-150 flex items-center justify-between border ${
                        isSelected
                          ? "bg-primary/10 border-primary text-primary shadow-xs ring-1 ring-primary/30"
                          : "bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold shrink-0 ${isSelected ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                          {s.first_name[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold leading-tight">{s.first_name} {s.last_name || ""}</p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.classLabel}{s.student_code ? ` • ${s.student_code}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-semibold text-slate-400 shrink-0">
                        #{idx + 1}
                      </span>
                    </button>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    <GraduationCap className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    No students matching search or filters
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ─── RIGHT PANEL: ACTIVE REPORT CARD STUDIO WORKSPACE ─── */}
        <div className="space-y-4 min-w-0">
          
          {(!studentId || !studentInfo) && (
            <Card className="rounded-3xl border-dashed border-2 border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-16 text-center">
              <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <GraduationCap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Select a Student from Directory</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1.5">Choose any student from the left panel to load their academic results, enter marks, write remarks, and generate their official report card.</p>
            </Card>
          )}

          {studentId && studentInfo && (
            <>
              {/* ─── DESKTOP STUDIO TOP CONTROL TOOLBAR ─── */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm print:hidden">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevStudent}
                    disabled={currentStudentIdx <= 0}
                    className="h-8 w-8 rounded-lg"
                    title="Previous Student"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                      {studentInfo.first_name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                        {studentInfo.first_name} {studentInfo.last_name || ""}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Student {currentStudentIdx + 1} of {filteredStudents.length}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextStudent}
                    disabled={currentStudentIdx >= filteredStudents.length - 1}
                    className="h-8 w-8 rounded-lg"
                    title="Next Student"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                  {hasUnsavedChanges ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[11px] font-bold gap-1">
                      <AlertCircle className="h-3 w-3" /> Unsaved Changes (Ctrl+S)
                    </Badge>
                  ) : card.is_published ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[11px] font-bold gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Published
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[11px] font-semibold gap-1">
                      <Check className="h-3 w-3 text-slate-400" /> Saved as Draft
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {canManage && (
                    <Button
                      onClick={() => save()}
                      disabled={isSaving || (periodType === "exam" && !examId)}
                      className={`font-bold gap-2 text-white shadow-md transition-all ${
                        hasUnsavedChanges
                          ? "bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/50"
                          : "bg-slate-800 hover:bg-slate-900"
                      }`}
                    >
                      <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Report Card"}
                    </Button>
                  )}

                  {canManage && (
                    card.is_published ? (
                      <Button variant="outline" onClick={() => publishIndividual(false)} className="text-xs font-semibold">
                        Unpublish
                      </Button>
                    ) : (
                      <Button onClick={() => publishIndividual(true)} disabled={periodType === "exam" && !examId} className="bg-primary font-semibold text-xs gap-1.5 shadow-xs">
                        <Send className="h-3.5 w-3.5" /> Publish to Parent
                      </Button>
                    )
                  )}
                </div>
              </div>

              {/* ─── PRINTABLE LUXURY REPORT CARD PAPER ─── */}
              <div
                id="report-card-print"
                className="relative mx-auto overflow-hidden rounded-3xl bg-white text-slate-900 shadow-xl ring-1 ring-slate-200/80 print:rounded-none print:shadow-none print:ring-0 w-full"
              >
                {/* ─── DECORATIVE BANNER ─── */}
                <div className="relative h-32 overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-primary text-white">
                  <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.7) 0, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.4) 0, transparent 45%)" }} />
                  <div className="relative flex h-full items-center justify-between px-8">
                    <div className="flex items-center gap-4">
                      {school?.logo_url ? (
                        <img src={school.logo_url} alt="School logo" className="h-16 w-16 rounded-2xl bg-white object-contain p-1.5 shadow-md ring-2 ring-white/20" />
                      ) : (
                        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-primary shadow-md">
                          <BookOpen className="h-8 w-8" />
                        </div>
                      )}
                      <div>
                        <p className="font-display text-2xl font-black leading-tight tracking-tight">{school?.name || "Campus Institute"}</p>
                        {school?.motto && <p className="text-xs italic opacity-90 font-medium">"{school.motto}"</p>}
                        <p className="text-[11px] opacity-80 mt-0.5">{[school?.address, school?.phone, school?.email].filter(Boolean).join(" • ")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="rounded-full bg-white/20 px-3.5 py-1 text-[11px] font-extrabold uppercase tracking-widest backdrop-blur-sm border border-white/20">
                        {(card.period_type || periodType) === "annual" ? "Annual Transcript" : (card.period_type || periodType) === "monthly" ? "Monthly Evaluation" : "Examination Report"}
                      </p>
                      {card.is_published && (
                        <p className="mt-2 text-[10px] font-bold text-emerald-300 flex items-center justify-end gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> VERIFIED &amp; PUBLISHED
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Watermark */}
                {school?.logo_url && (
                  <img src={school.logo_url} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.03]" />
                )}

                <div className="relative p-6 sm:p-8 space-y-6">
                  {/* ─── DOCUMENT TITLE & DATE ─── */}
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Official Academic Transcript</p>
                      <p className="font-display text-2xl font-extrabold text-slate-900 tracking-tight">{periodTitle}</p>
                    </div>
                    <p className="text-xs text-slate-500">Issued On: <strong className="text-slate-800 font-semibold">{today}</strong></p>
                  </div>

                  {/* ─── STUDENT PROFILE CARD ─── */}
                  <div className="grid grid-cols-1 gap-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5 md:grid-cols-[auto_1fr] items-center">
                    {studentInfo.profile_image_url ? (
                      <img src={studentInfo.profile_image_url} alt="" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-primary/20 shadow-sm" />
                    ) : (
                      <div className="grid h-20 w-20 place-items-center rounded-2xl bg-primary/10 text-primary ring-2 ring-primary/20 font-black text-2xl">
                        {studentInfo.first_name[0]}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
                      <div><span className="text-slate-500 font-medium block">Student Name</span><strong className="text-slate-900 text-sm">{studentInfo.first_name} {studentInfo.last_name || ""}</strong></div>
                      <div><span className="text-slate-500 font-medium block">Roll / Code</span><strong className="text-slate-900 font-mono text-sm">{studentInfo.student_code || "—"}</strong></div>
                      <div><span className="text-slate-500 font-medium block">Class &amp; Section</span><strong className="text-slate-900 text-sm">{(() => { const e = enrollments.find(x => x.student_id === studentId); const sec = sections.find(s => s.id === e?.class_section_id); const cls = classes.find(c => c.id === sec?.class_id); return `${cls?.name || "Class"} • ${sec?.name || "Sec"}`; })()}</strong></div>
                      <div><span className="text-slate-500 font-medium block">Date of Birth</span><strong className="text-slate-900">{studentInfo.date_of_birth ? format(new Date(studentInfo.date_of_birth), "MMM d, yyyy") : "—"}</strong></div>
                      <div><span className="text-slate-500 font-medium block">Parent / Guardian</span><strong className="text-slate-900">{studentInfo.parent_name || "—"}</strong></div>
                      <div><span className="text-slate-500 font-medium block">Contact Number</span><strong className="text-slate-900 font-mono">{studentInfo.phone || studentInfo.parent_phone || "—"}</strong></div>
                      <div className="md:col-span-2"><span className="text-slate-500 font-medium block">Residential Address</span><strong className="text-slate-900 truncate block">{studentInfo.address || "—"}</strong></div>
                    </div>
                  </div>

                  {/* ─── REDESIGNED & SPACIOUS SUBJECT MARKS TABLE (FIXES COLLAPSING BORDERS) ─── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" /> Subject Marks &amp; Academic Performance
                      </h4>
                      {canManage && (
                        <span className="text-[11px] text-slate-500 font-medium print:hidden">
                          Type marks directly into boxes. Press <kbd className="font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded border">Ctrl+S</kbd> to save.
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 text-slate-800 border-b border-slate-200 text-xs uppercase font-extrabold tracking-wider">
                            <th className="py-3 px-4 w-[28%]">Subject</th>
                            <th className="py-3 px-3 text-center w-[16%]">Marks Obtained</th>
                            <th className="py-3 px-3 text-center w-[14%]">Max Marks</th>
                            <th className="py-3 px-3 text-center w-[12%]">Percentage</th>
                            <th className="py-3 px-3 text-center w-[10%]">Grade</th>
                            <th className="py-3 px-4 w-[20%] print:hidden">Teacher Remarks</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100 text-xs">
                          {subjects.map((s) => {
                            const r = results[s.id];
                            const max = r?.max_marks || 100;
                            const obtained = r?.marks_obtained;
                            const pct = obtained != null && max > 0 ? Math.round((Number(obtained) / Number(max)) * 100) : null;
                            const grade = r?.grade || (pct != null ? calcGrade(pct).grade : null);

                            return (
                              <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                                {/* Subject Name */}
                                <td className="py-3 px-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-slate-900 text-sm">{s.name}</span>
                                    {canManage && (
                                      <button
                                        type="button"
                                        onClick={() => openAddFor(s.id)}
                                        className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors print:hidden"
                                        title="Add Quiz / Test / Assignment"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Marks Obtained Input */}
                                <td className="py-2.5 px-3">
                                  {canManage ? (
                                    <div className="flex justify-center">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={max}
                                        className="h-9 w-24 text-center font-extrabold text-slate-900 bg-slate-50/80 border-slate-300 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-lg text-sm shadow-2xs"
                                        placeholder="0"
                                        value={obtained ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value === "" ? null : Number(e.target.value);
                                          updateMark(s.id, val, max);
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <div className="text-center font-bold text-slate-900 text-sm">{obtained ?? "—"}</div>
                                  )}
                                </td>

                                {/* Max Marks Input */}
                                <td className="py-2.5 px-3">
                                  {canManage ? (
                                    <div className="flex justify-center">
                                      <Input
                                        type="number"
                                        min={1}
                                        className="h-9 w-20 text-center font-semibold text-slate-600 bg-slate-50/60 border-slate-200 focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-lg text-xs"
                                        value={max}
                                        onChange={(e) => updateMark(s.id, obtained ?? 0, Number(e.target.value))}
                                      />
                                    </div>
                                  ) : (
                                    <div className="text-center font-medium text-slate-600">{max}</div>
                                  )}
                                </td>

                                {/* Percentage Badge */}
                                <td className="py-2.5 px-3 text-center align-middle">
                                  {pct != null ? (
                                    <span className="inline-block text-center px-2.5 py-1 rounded-md text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 min-w-[46px] leading-tight box-border">
                                      {pct}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium">—</span>
                                  )}
                                </td>

                                {/* Grade Badge */}
                                <td className="py-2.5 px-3 text-center align-middle">
                                  {grade ? (
                                    <span className={`inline-block text-center px-2.5 py-1 rounded-md text-xs font-black border min-w-[36px] leading-tight box-border ${getGradeBadge(grade)}`}>
                                      {grade}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 font-medium">—</span>
                                  )}
                                </td>

                                {/* Remarks Input */}
                                <td className="py-2 px-4 print:hidden">
                                  {canManage ? (
                                    <Input
                                      className="h-8.5 text-xs border-slate-200 focus:bg-white rounded-lg"
                                      placeholder="Add subject remark..."
                                      value={r?.remarks ?? ""}
                                      onChange={(e) => {
                                        setHasUnsavedChanges(true);
                                        setResults({
                                          ...results,
                                          [s.id]: {
                                            ...(results[s.id] || { subject_id: s.id, marks_obtained: null, max_marks: 100, grade: null, remarks: null }),
                                            remarks: e.target.value
                                          }
                                        });
                                      }}
                                    />
                                  ) : (
                                    <span className="text-slate-600 text-xs italic">{r?.remarks || "—"}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* ─── SUMMARY TOTALS ROW ─── */}
                          <tr className="bg-slate-100/90 font-extrabold border-t-2 border-slate-300 text-slate-900">
                            <td className="py-3 px-4 uppercase text-xs tracking-wider font-black">CUMULATIVE TOTAL</td>
                            <td className="py-3 px-3 text-center text-sm font-black text-slate-900">{totals.total}</td>
                            <td className="py-3 px-3 text-center text-sm font-bold text-slate-600">{totals.max}</td>
                            <td className="py-3 px-3 text-center text-sm font-black text-primary align-middle">
                              <span className="inline-block text-center px-2.5 py-1 rounded-md text-xs font-black bg-blue-100 text-blue-800 border border-blue-300 min-w-[46px] leading-tight box-border">
                                {totals.pct}%
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center align-middle">
                              <span className={`inline-block text-center px-2.5 py-1 rounded-md text-xs font-black border min-w-[36px] leading-tight box-border ${getGradeBadge(totals.grade)}`}>
                                {totals.grade}
                              </span>
                            </td>
                            <td className="py-3 px-4 print:hidden"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ─── LUXURY KPI METRIC TILES (NON-COLLAPSING PADDED CARDS) ─── */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
                    <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 sm:p-5 border border-blue-200/90 shadow-2xs flex flex-col justify-between min-h-[105px] box-border">
                      <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-blue-700 leading-snug">Percentage Score</p>
                      <p className="font-display text-2xl sm:text-3xl font-black text-blue-800 my-1 sm:my-1.5 leading-none">{totals.pct}%</p>
                      <div className="w-full bg-blue-200/80 h-2 rounded-full overflow-hidden mt-auto">
                        <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: `${Math.min(100, totals.pct)}%` }} />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 sm:p-5 border border-amber-200/90 shadow-2xs flex flex-col justify-between min-h-[105px] box-border">
                      <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-amber-700 leading-snug">Aggregate Marks</p>
                      <p className="font-display text-2xl sm:text-3xl font-black text-amber-800 my-1 sm:my-1.5 leading-none">
                        {totals.total} <span className="text-xs sm:text-sm font-bold text-amber-600">/ {totals.max}</span>
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-amber-700/90 font-semibold leading-tight mt-auto truncate">{subjects.length} Evaluated Subjects</p>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 sm:p-5 border border-emerald-200/90 shadow-2xs flex flex-col justify-between min-h-[105px] box-border">
                      <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 leading-snug">Overall Grade</p>
                      <p className="font-display text-2xl sm:text-3xl font-black text-emerald-800 my-1 sm:my-1.5 leading-none">{totals.grade}</p>
                      <p className="text-[10px] sm:text-[11px] text-emerald-700/90 font-semibold leading-tight mt-auto truncate">Standard Grading Scale</p>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-fuchsia-50/50 p-4 sm:p-5 border border-purple-200/90 shadow-2xs flex flex-col justify-between min-h-[105px] box-border">
                      <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-purple-700 leading-snug">Attendance Rate</p>
                      <p className="font-display text-2xl sm:text-3xl font-black text-purple-800 my-1 sm:my-1.5 leading-none">
                        {card.attendance_percentage != null ? `${card.attendance_percentage}%` : "—"}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-purple-700/90 font-semibold leading-tight mt-auto truncate">Synced from daily roll call</p>
                    </div>
                  </div>

                  {/* ─── CONTINUOUS ASSESSMENT BREAKDOWN MATRIX ─── */}
                  {categoryBreakdown.visibleCategories.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-600" /> Continuous Assessment Breakdown (Quizzes, Tests, Tasks)
                      </h4>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 text-left">
                              <th className="py-2.5 px-3">Subject</th>
                              {categoryBreakdown.visibleCategories.map((c) => (
                                <th key={c.key} className="py-2.5 px-3 text-center">{c.label}</th>
                              ))}
                              <th className="py-2.5 px-3 text-center text-primary font-black">Total Weight</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {subjects.map((s) => {
                              const row = categoryBreakdown.matrix[s.id];
                              if (!row) return null;
                              let tObt = 0, tMax = 0;
                              Object.values(row).forEach((v) => { tObt += v.obtained; tMax += v.max; });
                              if (tMax === 0) return null;
                              return (
                                <tr key={s.id} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 font-bold text-slate-900">{s.name}</td>
                                  {categoryBreakdown.visibleCategories.map((c) => {
                                    const v = row[c.key];
                                    return (
                                      <td key={c.key} className="py-2 px-3 text-center text-slate-700">
                                        {v ? <span><strong>{v.obtained}</strong><span className="text-slate-400">/{v.max}</span></span> : <span className="text-slate-300">—</span>}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2 px-3 text-center font-black text-primary">
                                    {tObt}/{tMax} <span className="text-[10px] text-slate-500 font-normal">({tMax ? Math.round((tObt/tMax)*100) : 0}%)</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── PER-ASSESSMENT APPENDIX TABLE ─── */}
                  {appendix.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <ClipboardList className="h-4 w-4 text-slate-600" /> Individual Assessment Logs &amp; Marks
                        </h4>
                      </div>
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 text-left">
                              <th className="py-2.5 px-3">Title</th>
                              <th className="py-2.5 px-3">Subject</th>
                              <th className="py-2.5 px-3">Date</th>
                              <th className="py-2.5 px-3 text-center">Marks Obtained</th>
                              <th className="py-2.5 px-3 text-center">Grade</th>
                              {canManage && <th className="py-2.5 px-3 text-center print:hidden">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {appendix.map((a) => (
                              <tr key={a.id} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-semibold text-slate-900">{a.title}</td>
                                <td className="py-2 px-3 text-slate-600">{a.subject}</td>
                                <td className="py-2 px-3 text-slate-500">{a.date ? format(new Date(a.date), "MMM d, yyyy") : "—"}</td>
                                <td className="py-2 px-3 text-center font-bold text-slate-900">{a.marks != null ? `${a.marks} / ${a.max}` : "—"}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${getGradeBadge(a.grade)}`}>
                                    {a.grade ?? "—"}
                                  </span>
                                </td>
                                {canManage && (
                                  <td className="py-2 px-3 text-center print:hidden">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEditAssessment(a.id)} title="Edit">
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-rose-600 hover:text-rose-700" onClick={() => deleteAssessment(a.id)} title="Delete">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── REMARKS SECTION ─── */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>Class Teacher Observations &amp; Remarks</span>
                        {canManage && (
                          <span className="text-[10px] text-slate-400 font-normal">Auto-saved with report</span>
                        )}
                      </Label>
                      {canManage ? (
                        <Textarea
                          className="text-xs text-slate-900 bg-slate-50/70 border-slate-200 focus:bg-white rounded-xl resize-none"
                          rows={3}
                          placeholder="e.g. Excellent critical thinking and active classroom participation..."
                          value={card.teacher_remarks || ""}
                          onChange={(e) => {
                            setHasUnsavedChanges(true);
                            setCard({ ...card, teacher_remarks: e.target.value });
                          }}
                        />
                      ) : (
                        <p className="min-h-[70px] rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700 italic">
                          {card.teacher_remarks || "No teacher remarks recorded."}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                        <span>Principal / Academic Head Remarks</span>
                        {canManage && (
                          <span className="text-[10px] text-slate-400 font-normal">Official Endorsement</span>
                        )}
                      </Label>
                      {canManage ? (
                        <Textarea
                          className="text-xs text-slate-900 bg-slate-50/70 border-slate-200 focus:bg-white rounded-xl resize-none"
                          rows={3}
                          placeholder="e.g. Promoted to next academic term with distinction..."
                          value={card.principal_remarks || ""}
                          onChange={(e) => {
                            setHasUnsavedChanges(true);
                            setCard({ ...card, principal_remarks: e.target.value });
                          }}
                        />
                      ) : (
                        <p className="min-h-[70px] rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700 italic">
                          {card.principal_remarks || "No principal remarks recorded."}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ─── OFFICIAL SIGNATURE BLOCK ─── */}
                  <div className="pt-8 pb-4 grid grid-cols-3 gap-6 text-center text-xs text-slate-600">
                    <div>
                      <div className="h-10 flex items-end justify-center font-cursive text-slate-400">
                        {card.is_published ? "Class Teacher Stamp" : ""}
                      </div>
                      <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">Class Teacher</div>
                    </div>
                    <div>
                      <div className="h-10 flex items-end justify-center font-cursive text-slate-400">
                        {card.is_published ? "Principal Seal" : ""}
                      </div>
                      <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">Principal</div>
                    </div>
                    <div>
                      <div className="h-10 flex items-end justify-center font-cursive text-slate-400">
                        {/* Parent signature line */}
                      </div>
                      <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">Parent / Guardian</div>
                    </div>
                  </div>

                  {/* Footer Seal */}
                  <div className="border-t border-dashed border-slate-200 pt-3 text-center text-[10px] text-slate-400 font-mono">
                    AltRix Verified Computer-Generated Academic Record • {school?.name || "Institute"} • Verification Ref: {card.id || "DRAFT-EVAL"}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── STICKY BOTTOM SAVE & PUBLISH ACTION BAR (NEVER COLLIDES WITH MOBILE NAV) ─── */}
      {canManage && studentId && (
        <div className="sticky bottom-20 md:bottom-4 z-30 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md print:hidden transition-all">
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Save className="h-4 w-4 text-emerald-600" />
              {periodType === "exam"
                ? (examId ? "Ready to save exam evaluation" : "Pick an exam to enable saving")
                : `Ready to save ${periodType} evaluation — ${currentPeriodLabel}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {card.is_published
                ? "Published — live on student and guardian dashboards."
                : hasUnsavedChanges
                ? "You have unsaved changes. Click Save or press Ctrl+S."
                : "Saved as draft. Click Publish when ready to release."}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            <Button
              onClick={() => save()}
              disabled={isSaving || (periodType === "exam" && !examId)}
              className={`font-bold shadow-md gap-2 ${
                hasUnsavedChanges
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50 animate-pulse"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
            >
              <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Report Card"}
            </Button>

            {card.is_published ? (
              <Button variant="outline" onClick={() => publishIndividual(false)} className="text-xs font-semibold">
                Unpublish
              </Button>
            ) : (
              <Button
                onClick={() => publishIndividual(true)}
                disabled={periodType === "exam" && !examId}
                className="bg-primary text-white font-bold text-xs gap-1.5 shadow-md"
              >
                <Send className="h-3.5 w-3.5" /> Publish to Parent
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
              className="text-xs font-semibold gap-1.5"
            >
              <Users className="h-3.5 w-3.5 text-indigo-600" /> Whole Class
            </Button>
          </div>
        </div>
      )}

      {/* ─── ADD ASSESSMENT DIALOG ─── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Add Continuous Assessment</DialogTitle>
            <DialogDescription>
              Quickly record a quiz, test, assignment, or project marks entry for this student.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Assessment Type</Label>
                <Select value={addType} onValueChange={setAddType}>
                  <SelectTrigger className="h-9 font-semibold text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="classwork">Classwork</SelectItem>
                    <SelectItem value="homework">Homework</SelectItem>
                    <SelectItem value="practical">Practical</SelectItem>
                    <SelectItem value="oral">Oral Exam</SelectItem>
                    <SelectItem value="presentation">Presentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Date</Label>
                <Input type="date" className="h-9 text-xs" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Assessment Title</Label>
              <Input className="h-9 text-xs" value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="e.g. Chapter 4 Trigonometry Quiz" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Marks Obtained</Label>
                <Input type="number" min={0} className="h-9 font-bold text-xs" value={addMarks} onChange={(e) => setAddMarks(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Total Max Marks</Label>
                <Input type="number" min={1} className="h-9 font-semibold text-xs" value={addMax} onChange={(e) => setAddMax(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAddAssessment} className="font-bold bg-primary text-white">Save Assessment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT ASSESSMENT DIALOG ─── */}
      <Dialog open={!!editAssessmentId} onOpenChange={(o) => !o && setEditAssessmentId(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Assessment Entry</DialogTitle>
            <DialogDescription>
              Update assessment details and student marks.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Type</Label>
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger className="h-9 font-semibold text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quiz">Quiz</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="classwork">Classwork</SelectItem>
                    <SelectItem value="homework">Homework</SelectItem>
                    <SelectItem value="practical">Practical</SelectItem>
                    <SelectItem value="oral">Oral Exam</SelectItem>
                    <SelectItem value="presentation">Presentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Date</Label>
                <Input type="date" className="h-9 text-xs" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Title</Label>
              <Input className="h-9 text-xs" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Marks Obtained</Label>
                <Input type="number" min={0} className="h-9 font-bold text-xs" value={editMarks} onChange={(e) => setEditMarks(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Out of (Max)</Label>
                <Input type="number" min={1} className="h-9 font-semibold text-xs" value={editMax} onChange={(e) => setEditMax(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditAssessmentId(null)}>Cancel</Button>
            <Button onClick={submitEditAssessment} className="font-bold bg-primary text-white">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── PUBLISH WHOLE CLASS DIALOG ─── */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Batch Release Section Report Cards</DialogTitle>
            <DialogDescription>
              Publish or unpublish saved academic report cards for all students in a section simultaneously.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div>
              <Label className="text-xs font-semibold">Select Class Section</Label>
              <Select value={publishSectionId} onValueChange={setPublishSectionId}>
                <SelectTrigger className="h-9 font-semibold text-xs"><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => {
                    const cls = classes.find((c) => c.id === s.class_id);
                    return <SelectItem key={s.id} value={s.id}>{cls?.name ? `${cls.name} • ` : ""}{s.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border">
              Target Evaluation: <strong>{periodType === "exam" ? (exams.find((e) => e.id === examId)?.name || "Exam") : currentPeriodLabel}</strong>
            </p>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" disabled={publishBusy} onClick={() => publishWholeClass(false)}>Unpublish All</Button>
            <Button disabled={publishBusy} onClick={() => publishWholeClass(true)} className="font-bold bg-primary text-white gap-1.5">
              <Send className="h-3.5 w-3.5" /> Publish All Cards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
