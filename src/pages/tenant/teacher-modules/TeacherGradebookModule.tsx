import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Save, Download, Plus, Trash2, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { exportToCSV } from "@/lib/csv";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Grade bands for distribution
const GRADE_BANDS = [
  { label: "A (90-100%)", min: 90, max: 100, color: "hsl(var(--chart-1))" },
  { label: "B (80-89%)", min: 80, max: 89.99, color: "hsl(var(--chart-2))" },
  { label: "C (70-79%)", min: 70, max: 79.99, color: "hsl(var(--chart-3))" },
  { label: "D (60-69%)", min: 60, max: 69.99, color: "hsl(var(--chart-4))" },
  { label: "F (<60%)", min: 0, max: 59.99, color: "hsl(var(--chart-5))" },
];

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Assessment {
  id: string;
  title: string;
  max_marks: number;
  assessment_date: string;
  subject_id: string | null;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
}

interface Mark {
  student_id: string;
  assessment_id: string;
  marks: number | null;
  computed_grade: string | null;
}

// Pre-configured assessment templates
const ASSESSMENT_TEMPLATES = [
  { label: "Quiz", title: "Quiz", max_marks: 20 },
  { label: "Class Test", title: "Class Test", max_marks: 50 },
  { label: "Midterm Exam", title: "Midterm Exam", max_marks: 100 },
  { label: "Final Exam", title: "Final Exam", max_marks: 100 },
  { label: "Assignment", title: "Assignment", max_marks: 25 },
  { label: "Project", title: "Project", max_marks: 50 },
  { label: "Practical", title: "Practical", max_marks: 30 },
  { label: "Presentation", title: "Presentation", max_marks: 20 },
];

export function TeacherGradebookModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [editedMarks, setEditedMarks] = useState<Map<string, number | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedSection, setSelectedSection] = useState<string>("");
  
  // New assessment form state
  const [showNewAssessment, setShowNewAssessment] = useState(false);
  const [newAssessment, setNewAssessment] = useState({
    title: "",
    max_marks: 100,
    assessment_date: new Date().toISOString().slice(0, 10),
    subject_id: "",
  });
  const [creatingAssessment, setCreatingAssessment] = useState(false);
  
  // Grade distribution chart state
  const [chartAssessment, setChartAssessment] = useState<Assessment | null>(null);

  const applyTemplate = (template: typeof ASSESSMENT_TEMPLATES[0]) => {
    setNewAssessment((p) => ({
      ...p,
      title: template.title,
      max_marks: template.max_marks,
    }));
  };

  // Calculate grade distribution for a specific assessment
  const getGradeDistribution = (assessment: Assessment) => {
    const distribution = GRADE_BANDS.map((band) => ({
      ...band,
      count: 0,
    }));

    let totalMarks = 0;
    let graded = 0;

    students.forEach((student) => {
      const mark = getMark(student.id, assessment.id);
      if (mark !== null) {
        const percentage = (mark / assessment.max_marks) * 100;
        totalMarks += percentage;
        graded++;
        
        const band = distribution.find((b) => percentage >= b.min && percentage <= b.max);
        if (band) band.count++;
      }
    });

    return {
      distribution,
      stats: {
        total: students.length,
        graded,
        average: graded > 0 ? totalMarks / graded : 0,
        passRate: graded > 0 ? (distribution.filter((d) => d.min >= 60).reduce((sum, d) => sum + d.count, 0) / graded) * 100 : 0,
      },
    };
  };

  useEffect(() => {
    if (schoolId && user?.id) {
      loadSections();
      loadSubjects();
    }
  }, [schoolId, user?.id]);

  useEffect(() => {
    if (selectedSection && schoolId) {
      loadGradebook();
    }
  }, [selectedSection, schoolId]);

  const loadSubjects = async () => {
    const { data } = await api
      .from("subjects")
      .select("id, name")
      .eq("school_id", schoolId!)
      .order("name");
    setSubjects((data as Subject[]) || []);
  };

  const loadSections = async () => {
    const { data: assignments } = await api
      .from("teacher_assignments")
      .select("class_section_id")
      .eq("school_id", schoolId!)
      .eq("teacher_user_id", user!.id);

    const sectionIds = [...new Set(assignments?.map((a) => a.class_section_id) || [])];
    if (sectionIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data: secs } = await api
      .from("class_sections")
      .select("id, name, class_id")
      .in("id", sectionIds);

    const { data: classes } = await api.from("academic_classes").select("id, name");
    const classMap = new Map(classes?.map((c) => [c.id, c.name]) || []);

    const mapped = (secs || []).map((s) => ({
      id: s.id,
      name: s.name,
      class_name: classMap.get(s.class_id) || "",
    }));

    setSections(mapped);
    if (mapped.length > 0 && !selectedSection) {
      setSelectedSection(mapped[0].id);
    }
    setLoading(false);
  };

  const loadGradebook = async () => {
    setLoading(true);

    // Load assessments for section
    const { data: assessData } = await api
      .from("academic_assessments")
      .select("id, title, max_marks, assessment_date, subject_id")
      .eq("school_id", schoolId!)
      .eq("class_section_id", selectedSection)
      .order("assessment_date", { ascending: true });

    setAssessments((assessData as Assessment[]) || []);

    // Load students in section
    const { data: enrollments } = await api
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", schoolId!)
      .eq("class_section_id", selectedSection);

    const studentIds = enrollments?.map((e) => e.student_id) || [];

    if (studentIds.length > 0) {
      const { data: studs } = await api
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds)
        .order("first_name");

      setStudents((studs as Student[]) || []);

      // Load marks
      const assessmentIds = assessData?.map((a) => a.id) || [];
      if (assessmentIds.length > 0) {
        const { data: marksData } = await api
          .from("student_marks")
          .select("student_id, assessment_id, marks, computed_grade")
          .eq("school_id", schoolId!)
          .in("assessment_id", assessmentIds);

        const MARK_KEY_DELIMITER = "::";
        const marksMap = new Map<string, Mark>();
        marksData?.forEach((m) => {
          marksMap.set(`${m.student_id}${MARK_KEY_DELIMITER}${m.assessment_id}`, m as Mark);
        });
        setMarks(marksMap);
      }
    } else {
      setStudents([]);
      setMarks(new Map());
    }

    setEditedMarks(new Map());
    setLoading(false);
  };

  const createAssessment = async () => {
    if (!schoolId || !selectedSection) return;
    if (!newAssessment.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setCreatingAssessment(true);
    const { error } = await api.from("academic_assessments").insert({
      school_id: schoolId,
      class_section_id: selectedSection,
      teacher_user_id: user?.id,
      title: newAssessment.title.trim(),
      max_marks: newAssessment.max_marks,
      assessment_date: newAssessment.assessment_date,
      subject_id: newAssessment.subject_id || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Assessment created");
      setShowNewAssessment(false);
      setNewAssessment({
        title: "",
        max_marks: 100,
        assessment_date: new Date().toISOString().slice(0, 10),
        subject_id: "",
      });
      loadGradebook();
    }
    setCreatingAssessment(false);
  };

  const deleteAssessment = async (assessmentId: string) => {
    if (!schoolId) return;
    
    // Check if marks exist
    const { data: existingMarks } = await api
      .from("student_marks")
      .select("id")
      .eq("school_id", schoolId)
      .eq("assessment_id", assessmentId)
      .limit(1);

    if ((existingMarks || []).length > 0) {
      toast.error("Cannot delete: marks exist for this assessment");
      return;
    }

    const { error } = await api
      .from("academic_assessments")
      .delete()
      .eq("school_id", schoolId)
      .eq("id", assessmentId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Assessment deleted");
      loadGradebook();
    }
  };

  // Use a delimiter that won't appear in UUIDs
  const MARK_KEY_DELIMITER = "::";

  const getMark = (studentId: string, assessmentId: string): number | null => {
    const key = `${studentId}${MARK_KEY_DELIMITER}${assessmentId}`;
    if (editedMarks.has(key)) {
      return editedMarks.get(key) ?? null;
    }
    return marks.get(key)?.marks ?? null;
  };

  const getGrade = (studentId: string, assessmentId: string): string | null => {
    return marks.get(`${studentId}${MARK_KEY_DELIMITER}${assessmentId}`)?.computed_grade ?? null;
  };

  const updateMark = (studentId: string, assessmentId: string, value: string) => {
    const key = `${studentId}${MARK_KEY_DELIMITER}${assessmentId}`;
    const numValue = value === "" ? null : parseFloat(value);
    setEditedMarks((prev) => new Map(prev).set(key, numValue));
  };

  const saveMarks = async () => {
    if (editedMarks.size === 0) {
      toast.info("No changes to save");
      return;
    }

    setSaving(true);
    const updates: { school_id: string; student_id: string; assessment_id: string; marks: number | null }[] = [];

    editedMarks.forEach((value, key) => {
      const [student_id, assessment_id] = key.split(MARK_KEY_DELIMITER);
      updates.push({
        school_id: schoolId!,
        student_id,
        assessment_id,
        marks: value,
      });
    });

    const { error } = await api
      .from("student_marks")
      .upsert(updates, { onConflict: "school_id,student_id,assessment_id" });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Saved ${updates.length} marks`);
      loadGradebook();
    }
    setSaving(false);
  };

  const exportGradebook = () => {
    const rows = students.map((student) => {
      const row: Record<string, string | number> = {
        "Student Name": `${student.first_name} ${student.last_name || ""}`.trim(),
      };
      assessments.forEach((a) => {
        const mark = getMark(student.id, a.id);
        row[a.title] = mark ?? "";
      });
      return row;
    });
    
    const section = sections.find((s) => s.id === selectedSection);
    exportToCSV(rows, `gradebook-${section?.class_name}-${section?.name}`);
    toast.success("Gradebook exported");
  };

  const studentAverages = useMemo(() => {
    const avgs = new Map<string, number>();
    students.forEach((student) => {
      let total = 0;
      let count = 0;
      assessments.forEach((a) => {
        const mark = getMark(student.id, a.id);
        if (mark !== null) {
          total += (mark / a.max_marks) * 100;
          count++;
        }
      });
      if (count > 0) {
        avgs.set(student.id, total / count);
      }
    });
    return avgs;
  }, [students, assessments, marks, editedMarks]);

  if (loading && sections.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-lg font-medium">No Assigned Sections</p>
          <p className="text-sm text-muted-foreground">
            You need to be assigned to sections to view the gradebook.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Select value={selectedSection} onValueChange={setSelectedSection}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select section" />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.class_name} • {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Dialog open={showNewAssessment} onOpenChange={setShowNewAssessment}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-1" /> New Assessment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Assessment</DialogTitle>
                <DialogDescription>
                  Add a new assessment for this section. Students will be graded on this.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Template quick-select */}
                <div className="space-y-2">
                  <Label>Quick Templates</Label>
                  <div className="flex flex-wrap gap-2">
                    {ASSESSMENT_TEMPLATES.map((t) => (
                      <Badge
                        key={t.label}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent transition-colors px-3 py-1"
                        onClick={() => applyTemplate(t)}
                      >
                        {t.label} ({t.max_marks})
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newAssessment.title}
                    onChange={(e) => setNewAssessment((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g., Midterm Exam, Quiz 1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max_marks">Max Marks</Label>
                    <Input
                      id="max_marks"
                      type="number"
                      min={1}
                      max={1000}
                      value={newAssessment.max_marks}
                      onChange={(e) => setNewAssessment((p) => ({ ...p, max_marks: Number(e.target.value) || 100 }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newAssessment.assessment_date}
                      onChange={(e) => setNewAssessment((p) => ({ ...p, assessment_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject (optional)</Label>
                  <Select 
                    value={newAssessment.subject_id || "none"} 
                    onValueChange={(v) => setNewAssessment((p) => ({ ...p, subject_id: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No subject</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewAssessment(false)}>Cancel</Button>
                <Button onClick={createAssessment} disabled={creatingAssessment}>
                  {creatingAssessment ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={exportGradebook} disabled={students.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={saveMarks} disabled={saving || editedMarks.size === 0}>
            <Save className="h-4 w-4 mr-1" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Gradebook Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gradebook</CardTitle>
          <CardDescription>
            Enter marks for each student. Grades are calculated automatically based on thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : assessments.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No assessments created for this section yet.
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background min-w-[150px]">Student</TableHead>
                    {assessments.map((a) => (
                      <TableHead key={a.id} className="text-center min-w-[140px]">
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-xs">{a.title}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-primary"
                            onClick={() => setChartAssessment(a)}
                            title="View grade distribution"
                          >
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteAssessment(a.id)}
                            title="Delete assessment"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">/{a.max_marks}</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-center min-w-[80px]">Avg %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        {student.first_name} {student.last_name}
                      </TableCell>
                      {assessments.map((a) => {
                        const mark = getMark(student.id, a.id);
                        const grade = getGrade(student.id, a.id);
                        const key = `${student.id}-${a.id}`;
                        const isEdited = editedMarks.has(key);

                        return (
                          <TableCell key={a.id} className="p-1">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={a.max_marks}
                                step={0.5}
                                value={mark ?? ""}
                                onChange={(e) => updateMark(student.id, a.id, e.target.value)}
                                className={`w-16 text-center ${isEdited ? "ring-2 ring-primary" : ""}`}
                              />
                              {grade && !isEdited && (
                                <Badge variant="secondary" className="text-xs">
                                  {grade}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        {studentAverages.has(student.id) ? (
                          <Badge
                            variant={studentAverages.get(student.id)! >= 60 ? "default" : "destructive"}
                          >
                            {studentAverages.get(student.id)!.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grade Distribution Chart Dialog */}
      <Dialog open={!!chartAssessment} onOpenChange={(open) => !open && setChartAssessment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Grade Distribution</DialogTitle>
            <DialogDescription>
              {chartAssessment?.title} — Max: {chartAssessment?.max_marks} marks
            </DialogDescription>
          </DialogHeader>
          {chartAssessment && (() => {
            const { distribution, stats } = getGradeDistribution(chartAssessment);
            return (
              <div className="space-y-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-semibold">{stats.graded}/{stats.total}</div>
                    <div className="text-xs text-muted-foreground">Graded</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-semibold">{stats.average.toFixed(1)}%</div>
                    <div className="text-xs text-muted-foreground">Average</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-semibold">{stats.passRate.toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">Pass Rate</div>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-semibold">
                      {distribution.reduce((max, d) => d.count > max.count ? d : max, distribution[0]).label.split(" ")[0]}
                    </div>
                    <div className="text-xs text-muted-foreground">Most Common</div>
                  </div>
                </div>

                {/* Bar Chart */}
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis 
                        type="category" 
                        dataKey="label" 
                        width={80} 
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value} students`, "Count"]}
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--popover))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap justify-center gap-3 text-xs">
                  {distribution.map((band) => (
                    <div key={band.label} className="flex items-center gap-1">
                      <div 
                        className="h-3 w-3 rounded-sm" 
                        style={{ backgroundColor: band.color }} 
                      />
                      <span>{band.label}: {band.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
