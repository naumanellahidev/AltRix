import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Filter, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Section = { id: string; name: string; class_id: string };
type ClassRow = { id: string; name: string };

type AttendanceSessionRow = {
  id: string;
  session_date: string;
  period_label: string;
  class_section_id: string;
};

type AttendanceSummaryRow = {
  session_id: string;
  date: string;
  period: string;
  className: string;
  sectionName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
};

type AssessmentRow = {
  id: string;
  title: string;
  max_marks: number;
  assessment_date: string;
  class_section_id: string;
  subject_id: string | null;
  is_published: boolean;
};

type MarkRow = {
  assessment_id: string;
  student_id: string;
  marks: number | null;
  computed_grade: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type EnrollmentRow = {
  student_id: string;
  class_section_id: string;
};

type SubjectRow = { id: string; name: string };

type StudentReportRow = {
  student_id: string;
  name: string;
  className: string;
  sectionName: string;
  avgPercent: number | null;
  lastGrade: string | null;
};

function downloadCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (/[\",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(",");
  const body = rows.map((r) => keys.map((k) => escape((r as any)[k])).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const perms = useSchoolPermissions(schoolId);

  const [sections, setSections] = useState<Section[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  // Attendance report state
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceSectionId, setAttendanceSectionId] = useState<string>("all");
  const [attendanceSummaries, setAttendanceSummaries] = useState<AttendanceSummaryRow[]>([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);

  // Grades report state
  const [gradesSectionId, setGradesSectionId] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [studentRows, setStudentRows] = useState<StudentReportRow[]>([]);
  const [gradesBusy, setGradesBusy] = useState(false);

  useEffect(() => {
    if (perms.loading) return;
    const load = async () => {
      if (!schoolId || !user?.id) return;

      const { data: cls } = await supabase.from("academic_classes").select("id,name").eq("school_id", schoolId);
      setClasses((cls ?? []) as ClassRow[]);

      // Admins: all sections. Teachers: only assigned sections.
      if (perms.canManageStudents) {
        const { data: sec } = await supabase
          .from("class_sections")
          .select("id,name,class_id")
          .eq("school_id", schoolId)
          .order("name");
        setSections((sec ?? []) as Section[]);
        return;
      }

      const { data: ta } = await supabase
        .from("teacher_subject_assignments")
        .select("class_section_id")
        .eq("school_id", schoolId)
        .eq("teacher_user_id", user.id);

      const ids = [...new Set((ta ?? []).map((x: any) => x.class_section_id as string))];
      if (ids.length === 0) {
        setSections([]);
        return;
      }

      const { data: sec } = await supabase
        .from("class_sections")
        .select("id,name,class_id")
        .eq("school_id", schoolId)
        .in("id", ids);

      setSections((sec ?? []) as Section[]);
    };

    void load();
  }, [schoolId, user?.id, perms.loading, perms.canManageStudents]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const runAttendance = async () => {
    if (!schoolId) return;
    setAttendanceBusy(true);
    try {
      let q = supabase
        .from("attendance_sessions")
        .select("id,session_date,period_label,class_section_id")
        .eq("school_id", schoolId)
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: false })
        .limit(250);

      if (attendanceSectionId !== "all") q = q.eq("class_section_id", attendanceSectionId);

      const { data: sess, error: sErr } = await q;
      if (sErr) return toast.error(sErr.message);

      const sessions = (sess ?? []) as AttendanceSessionRow[];
      if (sessions.length === 0) {
        setAttendanceSummaries([]);
        return;
      }

      const sessionIds = sessions.map((s) => s.id);
      const { data: entries, error: eErr } = await supabase
        .from("attendance_entries")
        .select("session_id,status")
        .eq("school_id", schoolId)
        .in("session_id", sessionIds);
      if (eErr) return toast.error(eErr.message);

      const statusCounts = new Map<string, { present: number; absent: number; late: number; excused: number }>();
      (entries ?? []).forEach((r: any) => {
        const sid = r.session_id as string;
        const st = (r.status as string) || "present";
        const acc = statusCounts.get(sid) ?? { present: 0, absent: 0, late: 0, excused: 0 };
        if (st === "absent") acc.absent += 1;
        else if (st === "late") acc.late += 1;
        else if (st === "excused") acc.excused += 1;
        else acc.present += 1;
        statusCounts.set(sid, acc);
      });

      const rows: AttendanceSummaryRow[] = sessions.map((s) => {
        const counts = statusCounts.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
        const sec = sectionById.get(s.class_section_id);
        const clsName = sec ? classById.get(sec.class_id) ?? "Class" : "Class";
        const secName = sec ? sec.name : "Section";
        const total = counts.present + counts.absent + counts.late + counts.excused;
        return {
          session_id: s.id,
          date: s.session_date,
          period: s.period_label || "",
          className: clsName,
          sectionName: secName,
          present: counts.present,
          absent: counts.absent,
          late: counts.late,
          excused: counts.excused,
          total,
        };
      });

      setAttendanceSummaries(rows);
    } finally {
      setAttendanceBusy(false);
    }
  };

  const exportAttendanceCsv = () => {
    if (attendanceSummaries.length === 0) return toast.error("No rows to export");

    downloadCsv(
      `reports_attendance_${tenant.slug}_${from}_to_${to}.csv`,
      attendanceSummaries.map((r) => ({
        date: r.date,
        period: r.period,
        class: r.className,
        section: r.sectionName,
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        total: r.total,
      }))
    );
  };

  const runGrades = async () => {
    if (!schoolId) return;
    setGradesBusy(true);
    try {
      // Load students + enrollments for section filter
      const [studentsRes, enrollmentsRes, subjectsRes] = await Promise.all([
        supabase.from("students").select("id,first_name,last_name").eq("school_id", schoolId).limit(1000),
        supabase.from("student_enrollments").select("student_id,class_section_id").eq("school_id", schoolId).limit(1000),
        supabase.from("subjects").select("id,name").eq("school_id", schoolId).limit(1000),
      ]);

      if (studentsRes.error) return toast.error(studentsRes.error.message);
      if (enrollmentsRes.error) return toast.error(enrollmentsRes.error.message);
      if (subjectsRes.error) return toast.error(subjectsRes.error.message);

      const students = (studentsRes.data ?? []) as StudentRow[];
      const enrollments = (enrollmentsRes.data ?? []) as EnrollmentRow[];
      const subjects = (subjectsRes.data ?? []) as SubjectRow[];
      const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

      const enrollmentByStudent = new Map(enrollments.map((e) => [e.student_id, e.class_section_id]));

      const filteredStudents = students.filter((s) => {
        const secId = enrollmentByStudent.get(s.id) ?? null;
        if (!secId) return false;
        if (gradesSectionId !== "all" && secId !== gradesSectionId) return false;
        const name = `${s.first_name} ${s.last_name ?? ""}`.trim().toLowerCase();
        if (query.trim() && !name.includes(query.trim().toLowerCase())) return false;
        return true;
      });

      if (filteredStudents.length === 0) {
        setStudentRows([]);
        return;
      }

      // Load published assessments in these sections
      const secIds = new Set(filteredStudents.map((s) => enrollmentByStudent.get(s.id)!).filter(Boolean));
      const { data: assessments, error: aErr } = await supabase
        .from("academic_assessments")
        .select("id,title,max_marks,assessment_date,class_section_id,subject_id,is_published")
        .eq("school_id", schoolId)
        .eq("is_published", true)
        .in("class_section_id", Array.from(secIds))
        .limit(1000);

      if (aErr) return toast.error(aErr.message);

      const assessmentRows = (assessments ?? []) as AssessmentRow[];
      const assessmentById = new Map(assessmentRows.map((a) => [a.id, a]));

      // Load marks for filtered students
      const studentIds = filteredStudents.map((s) => s.id);
      const { data: marks, error: mErr } = await supabase
        .from("student_marks")
        .select("assessment_id,student_id,marks,computed_grade")
        .eq("school_id", schoolId)
        .in("student_id", studentIds)
        .limit(2000);

      if (mErr) return toast.error(mErr.message);

      const markRows = (marks ?? []) as MarkRow[];

      // Aggregate per student: avg % across marks where assessment is published
      const agg = new Map<string, { sumPct: number; count: number; lastGrade: string | null }>();
      for (const r of markRows) {
        const a = assessmentById.get(r.assessment_id);
        if (!a) continue;
        if (!a.max_marks || a.max_marks <= 0) continue;
        if (r.marks == null) continue;

        const pct = (Number(r.marks) / Number(a.max_marks)) * 100;
        const cur = agg.get(r.student_id) ?? { sumPct: 0, count: 0, lastGrade: null };
        cur.sumPct += pct;
        cur.count += 1;
        cur.lastGrade = r.computed_grade ?? cur.lastGrade;
        agg.set(r.student_id, cur);
      }

      const rows: StudentReportRow[] = filteredStudents.map((s) => {
        const secId = enrollmentByStudent.get(s.id) ?? null;
        const sec = secId ? sectionById.get(secId) : undefined;
        const clsName = sec ? classById.get(sec.class_id) ?? "Class" : "Class";
        const secName = sec ? sec.name : "Section";

        const a = agg.get(s.id);
        const avgPercent = a && a.count > 0 ? Math.round((a.sumPct / a.count) * 10) / 10 : null;

        return {
          student_id: s.id,
          name: `${s.first_name} ${s.last_name ?? ""}`.trim(),
          className: clsName,
          sectionName: secName,
          avgPercent,
          lastGrade: a?.lastGrade ?? null,
        };
      });

      // Attach a little contextual toast if subjects are missing
      if (subjects.length === 0) {
        toast.message("No subjects configured", {
          description: "Subjects are required to fully label grade reports.",
        });
      } else {
        // keep eslint happy about unused
        void subjectNameById;
      }

      setStudentRows(rows);
    } finally {
      setGradesBusy(false);
    }
  };

  const exportGradesCsv = () => {
    if (studentRows.length === 0) return toast.error("No rows to export");
    downloadCsv(
      `reports_grades_${tenant.slug}_${gradesSectionId}.csv`,
      studentRows.map((r) => ({
        student: r.name,
        class: r.className,
        section: r.sectionName,
        avg_percent: r.avgPercent ?? "",
        last_grade: r.lastGrade ?? "",
      }))
    );
  };

  const sectionLabel = (s: Section) => `${classById.get(s.class_id) ?? "Class"} • ${s.name}`;

  return (
    <div className="space-y-4">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Reports</CardTitle>
          <p className="text-sm text-muted-foreground">Attendance + Grades with section filters and CSV export.</p>
        </CardHeader>
        <CardContent>
          {perms.error && (
            <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{perms.error}</div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList className="w-full">
          <TabsTrigger value="attendance" className="flex-1">Attendance</TabsTrigger>
          <TabsTrigger value="grades" className="flex-1">Grades</TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Attendance Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                <Select value={attendanceSectionId} onValueChange={setAttendanceSectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {sectionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="hero" onClick={runAttendance} disabled={attendanceBusy}>
                  <Filter className="mr-2 h-4 w-4" /> Run
                </Button>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">Sessions: {attendanceSummaries.length}</div>
                <Button variant="soft" onClick={exportAttendanceCsv} disabled={attendanceSummaries.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-2xl border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">P</TableHead>
                      <TableHead className="text-right">A</TableHead>
                      <TableHead className="text-right">L</TableHead>
                      <TableHead className="text-right">E</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceSummaries.map((r) => (
                      <TableRow key={r.session_id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.date}</TableCell>
                        <TableCell className="font-medium">{r.className}</TableCell>
                        <TableCell>{r.sectionName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.period || "—"}</TableCell>
                        <TableCell className="text-right">{r.present}</TableCell>
                        <TableCell className="text-right">{r.absent}</TableCell>
                        <TableCell className="text-right">{r.late}</TableCell>
                        <TableCell className="text-right">{r.excused}</TableCell>
                        <TableCell className="text-right font-medium">{r.total}</TableCell>
                      </TableRow>
                    ))}
                    {attendanceSummaries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-muted-foreground">
                          Run a report to see results.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades" className="space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Grades Report</CardTitle>
              <p className="text-sm text-muted-foreground">Search students and compute an average from published assessments.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <Select value={gradesSectionId} onValueChange={setGradesSectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {sectionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="md:col-span-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student name" className="pl-9" />
                  </div>
                </div>

                <Button variant="hero" onClick={runGrades} disabled={gradesBusy}>
                  <Filter className="mr-2 h-4 w-4" /> Run
                </Button>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">Students: {studentRows.length}</div>
                <Button variant="soft" onClick={exportGradesCsv} disabled={studentRows.length === 0}>
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-2xl border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead className="text-right">Avg %</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentRows.map((r) => (
                      <TableRow key={r.student_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.className}</TableCell>
                        <TableCell>{r.sectionName}</TableCell>
                        <TableCell className="text-right">{r.avgPercent ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{r.lastGrade ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {studentRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          Run a report to see results.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
