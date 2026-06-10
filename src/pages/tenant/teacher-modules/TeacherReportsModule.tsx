import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface StudentReport {
  student_id: string;
  first_name: string;
  last_name: string | null;
  assignments: { title: string; marks: number | null; max_marks: number; grade: string | null }[];
  attendance: { present: number; absent: number; late: number; total: number };
  average_percentage: number | null;
}

export function TeacherReportsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [reports, setReports] = useState<StudentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (tenant.status !== "ready") return;

    const fetchSections = async () => {
      // Get current teacher's user id
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        setLoading(false);
        return;
      }

      // Only get assignments for THIS teacher
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("class_section_id")
        .eq("school_id", tenant.schoolId)
        .eq("teacher_user_id", userId);

      if (!assignments?.length) {
        setLoading(false);
        return;
      }

      const sectionIds = assignments.map((a) => a.class_section_id);

      const { data: sectionData } = await supabase
        .from("class_sections")
        .select("id, name, class_id")
        .in("id", sectionIds);

      if (!sectionData?.length) {
        setLoading(false);
        return;
      }

      const classIds = [...new Set(sectionData.map((s) => s.class_id))];
      const { data: classes } = await supabase
        .from("academic_classes")
        .select("id, name")
        .in("id", classIds);

      const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

      const enriched = sectionData.map((s) => ({
        id: s.id,
        name: s.name,
        class_name: classMap.get(s.class_id) || "Unknown",
      }));

      setSections(enriched);
      if (enriched.length > 0) {
        setSelectedSection(enriched[0].id);
      }
      setLoading(false);
    };

    fetchSections();
  }, [tenant.status, tenant.schoolId]);

  const generateReports = async () => {
    if (!selectedSection) return;

    setGenerating(true);

    // Get students
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", selectedSection);

    if (!enrollments?.length) {
      setReports([]);
      setGenerating(false);
      return;
    }

    const studentIds = enrollments.map((e) => e.student_id);
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    // Get assignments for this section
    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("id, title, max_marks")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", selectedSection);

    // Get all results
    const assignmentIds = assignmentData?.map((a) => a.id) || [];
    const { data: resultsData } = await (supabase as any)
      .from("student_results")
      .select("student_id, assignment_id, marks_obtained, grade")
      .in("assignment_id", assignmentIds);

    // Get attendance sessions
    const { data: sessions } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", selectedSection);

    const sessionIds = sessions?.map((s) => s.id) || [];

    // Get attendance entries
    const { data: attendanceData } = await supabase
      .from("attendance_entries")
      .select("student_id, status")
      .in("session_id", sessionIds);

    // Build reports
    const studentReports: StudentReport[] = (students || []).map((student) => {
      // Assignments
      const studentResults = resultsData?.filter((r) => r.student_id === student.id) || [];
      const assignmentMap = new Map(assignmentData?.map((a: any) => [a.id, a]) || []);

      const assignments = studentResults.map((r) => {
        const assignment = assignmentMap.get(r.assignment_id) as any;
        return {
          title: assignment?.title || "Unknown",
          marks: r.marks_obtained,
          max_marks: assignment?.max_marks || 100,
          grade: r.grade,
        };
      });

      // Calculate average
      const gradedAssignments = assignments.filter((a) => a.marks !== null);
      const totalPercentage = gradedAssignments.reduce(
        (sum, a) => sum + ((a.marks || 0) / a.max_marks) * 100,
        0
      );
      const average = gradedAssignments.length > 0 ? totalPercentage / gradedAssignments.length : null;

      // Attendance
      const studentAttendance = attendanceData?.filter((a) => a.student_id === student.id) || [];
      const attendance = {
        present: studentAttendance.filter((a) => a.status === "present").length,
        absent: studentAttendance.filter((a) => a.status === "absent").length,
        late: studentAttendance.filter((a) => a.status === "late").length,
        total: studentAttendance.length,
      };

      return {
        student_id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        assignments,
        attendance,
        average_percentage: average,
      };
    });

    setReports(studentReports);
    setGenerating(false);
    toast({ title: "Reports generated successfully" });
  };

  const exportReportCard = (report: StudentReport) => {
    const section = sections.find((s) => s.id === selectedSection);
    const content = `
REPORT CARD
===========
Student: ${report.first_name} ${report.last_name || ""}
Class: ${section?.class_name} - ${section?.name}
Generated: ${new Date().toLocaleDateString()}

ATTENDANCE SUMMARY
------------------
Present: ${report.attendance.present}
Absent: ${report.attendance.absent}
Late: ${report.attendance.late}
Total Sessions: ${report.attendance.total}
Attendance Rate: ${report.attendance.total > 0 ? ((report.attendance.present / report.attendance.total) * 100).toFixed(1) : 0}%

ACADEMIC PERFORMANCE
--------------------
${report.assignments.length > 0 ? report.assignments.map((a) => `${a.title}: ${a.marks ?? "N/A"}/${a.max_marks} ${a.grade ? `(${a.grade})` : ""}`).join("\n") : "No assignments graded yet."}

Average: ${report.average_percentage !== null ? report.average_percentage.toFixed(1) + "%" : "N/A"}
    `.trim();

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${report.first_name}-${report.last_name || ""}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No classes assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Report Cards</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <Label>Section</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.class_name} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateReports} disabled={generating}>
              <FileText className="mr-2 h-4 w-4" />
              {generating ? "Generating..." : "Generate Reports"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Student Reports ({reports.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Assignments</TableHead>
                  <TableHead>Average</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.student_id}>
                    <TableCell className="font-medium">
                      {r.first_name} {r.last_name}
                    </TableCell>
                    <TableCell>{r.assignments.length} graded</TableCell>
                    <TableCell>
                      {r.average_percentage !== null ? (
                        <span
                          className={`font-medium ${
                            r.average_percentage >= 70
                              ? "text-green-600"
                              : r.average_percentage >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {r.average_percentage.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {r.attendance.total > 0 ? (
                        <span>
                          {((r.attendance.present / r.attendance.total) * 100).toFixed(0)}% ({r.attendance.present}/
                          {r.attendance.total})
                        </span>
                      ) : (
                        "No data"
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => exportReportCard(r)}>
                        <Download className="mr-1 h-3 w-3" /> Export
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
