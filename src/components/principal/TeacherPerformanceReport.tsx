import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarCheck, BookOpen, FileText, Trophy, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, addWeeks, addMonths } from "date-fns";

interface TeacherPerformanceReportProps {
  schoolId: string;
  teacherUserId: string;
  teacherName: string;
}

type PeriodMode = "week" | "month";

interface AttendanceSessionSummary {
  id: string;
  session_date: string;
  period_label: string;
  section_name: string;
  class_name: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

interface HomeworkRow {
  id: string;
  title: string;
  due_date: string | null;
  section_name: string;
  class_name: string;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  due_date: string | null;
  section_name: string;
  class_name: string;
  max_marks: number | null;
  avg_marks: number | null;
  submissions: number;
}

interface AssessmentRow {
  id: string;
  title: string;
  assessment_date: string | null;
  section_name: string;
  class_name: string;
  max_marks: number;
  avg_marks: number | null;
  total_students: number;
  is_published: boolean;
}

export function TeacherPerformanceReport({ schoolId, teacherUserId, teacherName }: TeacherPerformanceReportProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSessionSummary[]>([]);
  const [homeworkList, setHomeworkList] = useState<HomeworkRow[]>([]);
  const [assignmentList, setAssignmentList] = useState<AssignmentRow[]>([]);
  const [assessmentList, setAssessmentList] = useState<AssessmentRow[]>([]);

  const dateRange = useMemo(() => {
    if (periodMode === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate),
    };
  }, [periodMode, currentDate]);

  const dateLabel = useMemo(() => {
    if (periodMode === "week") {
      return `${format(dateRange.start, "MMM d")} – ${format(dateRange.end, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [periodMode, dateRange, currentDate]);

  const navigate = (dir: "prev" | "next") => {
    setCurrentDate((d) =>
      periodMode === "week"
        ? dir === "next" ? addWeeks(d, 1) : subWeeks(d, 1)
        : dir === "next" ? addMonths(d, 1) : subMonths(d, 1)
    );
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const from = dateRange.start.toISOString().slice(0, 10);
    const to = dateRange.end.toISOString().slice(0, 10);

    try {
      // Get teacher's assigned section IDs
      const { data: assignments } = await (supabase as any)
        .from("teacher_subject_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", teacherUserId);

      const sectionIds = [...new Set((assignments ?? []).map((a: any) => a.class_section_id as string))];
      if (sectionIds.length === 0) {
        setAttendanceSessions([]);
        setHomeworkList([]);
        setAssignmentList([]);
        setAssessmentList([]);
        return;
      }

      // Fetch sections and classes for labels
      const [{ data: sections }, { data: classes }] = await Promise.all([
        (supabase as any).from("class_sections").select("id,name,class_id").eq("school_id", schoolId).in("id", sectionIds),
        (supabase as any).from("academic_classes").select("id,name").eq("school_id", schoolId),
      ]);

      const classMap = new Map<string, string>((classes ?? []).map((c: any) => [c.id, c.name]));
      const sectionMap = new Map<string, { name: string; className: string }>((sections ?? []).map((s: any) => [s.id, { name: s.name, className: classMap.get(s.class_id) ?? "Class" }]));

      const getSectionLabel = (secId: string): { name: string; className: string } => sectionMap.get(secId) ?? { name: "Section", className: "Class" };

      // 1. Attendance sessions created by this teacher in date range
      const { data: sessData } = await supabase
        .from("attendance_sessions")
        .select("id,session_date,period_label,class_section_id")
        .eq("school_id", schoolId)
        .eq("created_by", teacherUserId)
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: false });

      const sessions = sessData ?? [];
      let attendanceRows: AttendanceSessionSummary[] = [];

      if (sessions.length > 0) {
        const sessionIds = sessions.map((s: any) => s.id);
        const { data: entries } = await supabase
          .from("attendance_entries")
          .select("session_id,status")
          .eq("school_id", schoolId)
          .in("session_id", sessionIds);

        const counts = new Map<string, { present: number; absent: number; late: number; excused: number }>();
        (entries ?? []).forEach((e: any) => {
          const acc = counts.get(e.session_id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
          if (e.status === "absent") acc.absent++;
          else if (e.status === "late") acc.late++;
          else if (e.status === "excused") acc.excused++;
          else acc.present++;
          counts.set(e.session_id, acc);
        });

        attendanceRows = sessions.map((s: any) => {
          const c = counts.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
          const sec = getSectionLabel(s.class_section_id);
          return {
            id: s.id,
            session_date: s.session_date,
            period_label: s.period_label || "",
            section_name: sec.name,
            class_name: sec.className,
            ...c,
            total: c.present + c.absent + c.late + c.excused,
          };
        });
      }
      setAttendanceSessions(attendanceRows);

      // 2. Homework created in date range
      const { data: hwData } = await (supabase as any)
        .from("homework")
        .select("id,title,due_date,class_section_id,created_at")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", teacherUserId)
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString())
        .order("created_at", { ascending: false });

      setHomeworkList((hwData ?? []).map((h: any) => {
        const sec = getSectionLabel(h.class_section_id);
        return { id: h.id, title: h.title, due_date: h.due_date, section_name: sec.name, class_name: sec.className, created_at: h.created_at };
      }));

      // 3. Assignments created in date range
      const { data: asnData } = await supabase
        .from("assignments")
        .select("id,title,due_date,class_section_id,max_marks,created_at")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", teacherUserId)
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString())
        .order("created_at", { ascending: false });

      const asnList = asnData ?? [];
      let assignmentRows: AssignmentRow[] = [];

      if (asnList.length > 0) {
        const asnIds = asnList.map((a: any) => a.id);
        const { data: results } = await (supabase as any)
          .from("student_results")
          .select("assignment_id,marks_obtained")
          .in("assignment_id", asnIds);

        const resultAgg = new Map<string, { sum: number; count: number }>();
        (results ?? []).forEach((r: any) => {
          const acc = resultAgg.get(r.assignment_id) ?? { sum: 0, count: 0 };
          if (r.marks_obtained != null) {
            acc.sum += Number(r.marks_obtained);
            acc.count++;
          }
          resultAgg.set(r.assignment_id, acc);
        });

        assignmentRows = asnList.map((a: any) => {
          const sec = getSectionLabel(a.class_section_id);
          const agg = resultAgg.get(a.id);
          return {
            id: a.id,
            title: a.title,
            due_date: a.due_date,
            section_name: sec.name,
            class_name: sec.className,
            max_marks: a.max_marks,
            avg_marks: agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : null,
            submissions: agg?.count ?? 0,
          };
        });
      }
      setAssignmentList(assignmentRows);

      // 4. Assessments (grades) in date range for teacher's sections
      const { data: assessData } = await (supabase as any)
        .from("academic_assessments")
        .select("id,title,assessment_date,class_section_id,max_marks,is_published")
        .eq("school_id", schoolId)
        .in("class_section_id", sectionIds as string[])
        .gte("assessment_date", from)
        .lte("assessment_date", to)
        .order("assessment_date", { ascending: false });

      const assessments = assessData ?? [];
      let assessmentRows: AssessmentRow[] = [];

      if (assessments.length > 0) {
        const assessIds = assessments.map((a: any) => a.id);
        const { data: marks } = await supabase
          .from("student_marks")
          .select("assessment_id,marks")
          .eq("school_id", schoolId)
          .in("assessment_id", assessIds);

        const markAgg = new Map<string, { sum: number; count: number }>();
        (marks ?? []).forEach((m: any) => {
          const acc = markAgg.get(m.assessment_id) ?? { sum: 0, count: 0 };
          if (m.marks != null) {
            acc.sum += Number(m.marks);
            acc.count++;
          }
          markAgg.set(m.assessment_id, acc);
        });

        assessmentRows = assessments.map((a: any) => {
          const sec = getSectionLabel(a.class_section_id);
          const agg = markAgg.get(a.id);
          return {
            id: a.id,
            title: a.title,
            assessment_date: a.assessment_date,
            section_name: sec.name,
            class_name: sec.className,
            max_marks: a.max_marks,
            is_published: a.is_published,
            avg_marks: agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : null,
            total_students: agg?.count ?? 0,
          };
        });
      }
      setAssessmentList(assessmentRows);
    } finally {
      setLoading(false);
    }
  }, [schoolId, teacherUserId, dateRange]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Period selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[140px] text-center text-xs font-medium sm:min-w-[180px] sm:text-sm">
              {dateLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Attendance</p>
          </div>
          <p className="mt-1 font-display text-xl font-semibold">{attendanceSessions.length}</p>
          <p className="text-[10px] text-muted-foreground">sessions taken</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Homework</p>
          </div>
          <p className="mt-1 font-display text-xl font-semibold">{homeworkList.length}</p>
          <p className="text-[10px] text-muted-foreground">assigned</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Assignments</p>
          </div>
          <p className="mt-1 font-display text-xl font-semibold">{assignmentList.length}</p>
          <p className="text-[10px] text-muted-foreground">created</p>
        </div>
        <div className="rounded-xl border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Assessments</p>
          </div>
          <p className="mt-1 font-display text-xl font-semibold">{assessmentList.length}</p>
          <p className="text-[10px] text-muted-foreground">conducted</p>
        </div>
      </div>

      {/* Detailed tabs */}
      <Tabs defaultValue="attendance" className="space-y-3">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="attendance" className="text-[10px] sm:text-xs">Attendance</TabsTrigger>
          <TabsTrigger value="homework" className="text-[10px] sm:text-xs">Homework</TabsTrigger>
          <TabsTrigger value="assignments" className="text-[10px] sm:text-xs">Assignments</TabsTrigger>
          <TabsTrigger value="assessments" className="text-[10px] sm:text-xs">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance">
          <div className="overflow-auto rounded-xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">A</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceSessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap text-xs">{s.session_date}</TableCell>
                    <TableCell className="text-xs font-medium">{s.class_name}</TableCell>
                    <TableCell className="text-xs">{s.section_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.period_label || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{s.present}</TableCell>
                    <TableCell className="text-right text-xs">{s.absent}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{s.total}</TableCell>
                  </TableRow>
                ))}
                {attendanceSessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                      No attendance sessions in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="homework">
          <div className="overflow-auto rounded-xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {homeworkList.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs font-medium">{h.title}</TableCell>
                    <TableCell className="text-xs">{h.class_name}</TableCell>
                    <TableCell className="text-xs">{h.section_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{h.due_date ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{h.created_at?.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
                {homeworkList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                      No homework assigned in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <div className="overflow-auto rounded-xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentList.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs font-medium">{a.title}</TableCell>
                    <TableCell className="text-xs">{a.class_name}</TableCell>
                    <TableCell className="text-xs">{a.section_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{a.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{a.max_marks ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{a.avg_marks ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{a.submissions}</TableCell>
                  </TableRow>
                ))}
                {assignmentList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                      No assignments in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="assessments">
          <div className="overflow-auto rounded-xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessmentList.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs font-medium">{a.title}</TableCell>
                    <TableCell className="text-xs">{a.class_name}</TableCell>
                    <TableCell className="text-xs">{a.section_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{a.assessment_date ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{a.max_marks}</TableCell>
                    <TableCell className="text-right text-xs">{a.avg_marks ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{a.total_students}</TableCell>
                    <TableCell>
                      <Badge variant={a.is_published ? "default" : "secondary"} className="text-[10px]">
                        {a.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {assessmentList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground">
                      No assessments in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
