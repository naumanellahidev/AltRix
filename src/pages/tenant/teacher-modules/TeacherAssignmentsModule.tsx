import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Users, CheckCircle, Clock, FileCheck, MessageSquare, Paperclip, AlertTriangle } from "lucide-react";
import { AttachmentsList } from "@/components/assignments/AttachmentsList";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  max_marks: number;
  due_date: string | null;
  class_section_id: string;
  section_name: string;
  status: string;
}

interface Submission {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string | null;
  submission_text: string | null;
  attachment_urls: string[] | null;
  submitted_at: string;
  status: string;
  marks_obtained: number | null;
  feedback: string | null;
  days_late: number;
  penalty_applied: number;
  marks_before_penalty: number | null;
}

interface StudentResult {
  student_id: string;
  first_name: string;
  last_name: string | null;
  marks_obtained: number | null;
  grade: string | null;
  remarks: string | null;
}

export function TeacherAssignmentsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Add assignment dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    title: "",
    description: "",
    max_marks: "100",
    due_date: "",
    class_section_id: "",
  });

  // View submissions dialog
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [savingGrade, setSavingGrade] = useState(false);

  // Grade dialog
  const [gradeOpen, setGradeOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeForm, setGradeForm] = useState({ marks: "", feedback: "" });

  // Enter results dialog (legacy)
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [savingResults, setSavingResults] = useState(false);

  const [filterSection, setFilterSection] = useState<string>("all");

  useEffect(() => {
    if (tenant.status !== "ready") return;
    fetchData();
  }, [tenant.status, tenant.schoolId]);

  const fetchData = async () => {
    setLoading(true);

    // Only get assignments for THIS teacher
    const { data: teacherAssignments } = await supabase
      .from("teacher_assignments")
      .select("class_section_id")
      .eq("school_id", tenant.schoolId)
      .eq("teacher_user_id", user?.id);

    if (!teacherAssignments?.length) {
      setLoading(false);
      return;
    }

    const sectionIds = teacherAssignments.map((a) => a.class_section_id);

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

    const enrichedSections = sectionData.map((s) => ({
      id: s.id,
      name: s.name,
      class_name: classMap.get(s.class_id) || "Unknown",
    }));

    setSections(enrichedSections);

    // Fetch assignments
    const { data: assignmentData } = await supabase
      .from("assignments")
      .select("*")
      .eq("school_id", tenant.schoolId)
      .in("class_section_id", sectionIds)
      .order("created_at", { ascending: false });

    const sectionMap = new Map(enrichedSections.map((s) => [s.id, `${s.class_name} - ${s.name}`]));

    const enrichedAssignments = (assignmentData || []).map((a) => ({
      ...a,
      section_name: sectionMap.get(a.class_section_id) || "",
    }));

    setAssignments(enrichedAssignments as any);
    setLoading(false);
  };

  const handleAddAssignment = async () => {
    if (!newAssignment.title.trim() || !newAssignment.class_section_id) {
      toast.error("Title and section are required");
      return;
    }

    const { error } = await supabase.from("assignments").insert({
      school_id: tenant.schoolId,
      class_section_id: newAssignment.class_section_id,
      teacher_user_id: user?.id,
      title: newAssignment.title.trim(),
      description: newAssignment.description.trim() || null,
      max_marks: parseFloat(newAssignment.max_marks) || 100,
      due_date: newAssignment.due_date || null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Assignment created successfully");
    setAddOpen(false);
    setNewAssignment({
      title: "",
      description: "",
      max_marks: "100",
      due_date: "",
      class_section_id: "",
    });
    fetchData();
  };

  const openResultsDialog = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);

    // Load students
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", assignment.class_section_id);

    if (!enrollments?.length) {
      setResults([]);
      setResultsOpen(true);
      return;
    }

    const studentIds = enrollments.map((e) => e.student_id);
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    // Load existing results
    const { data: existingResults } = await (supabase as any)
      .from("student_results")
      .select("student_id, marks_obtained, grade, remarks")
      .eq("assignment_id", assignment.id);

    const resultMap = new Map((existingResults as any[])?.map((r: any) => [r.student_id, r]) || []);

    const studentResults: StudentResult[] = (students || []).map((s) => {
      const existing = resultMap.get(s.id);
      return {
        student_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        marks_obtained: existing?.marks_obtained ?? null,
        grade: existing?.grade ?? null,
        remarks: existing?.remarks ?? null,
      };
    });

    setResults(studentResults);
    setResultsOpen(true);
  };

  const updateResult = (studentId: string, field: keyof StudentResult, value: string | number | null) => {
    setResults((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, [field]: value } : r))
    );
  };

  const saveResults = async () => {
    if (!selectedAssignment) return;

    setSavingResults(true);

    const { data: user } = await supabase.auth.getUser();

    const payload = results
      .filter((r) => r.marks_obtained !== null)
      .map((r) => ({
        school_id: tenant.schoolId,
        student_id: r.student_id,
        assignment_id: selectedAssignment.id,
        marks_obtained: r.marks_obtained,
        grade: r.grade,
        remarks: r.remarks,
        graded_by: user.user?.id,
        graded_at: new Date().toISOString(),
      }));

    const { error } = await (supabase as any).from("student_results").upsert(payload, {
      onConflict: "school_id,student_id,assignment_id",
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Results saved successfully");
      setResultsOpen(false);
    }

    setSavingResults(false);
  };

  // Load student submissions for an assignment
  const openSubmissionsDialog = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    
    // Load enrolled students
    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("school_id", tenant.schoolId)
      .eq("class_section_id", assignment.class_section_id);

    if (!enrollments?.length) {
      setSubmissions([]);
      setSubmissionsOpen(true);
      return;
    }

    const studentIds = enrollments.map((e) => e.student_id);
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    // Load submissions
    const { data: subs } = await supabase
      .from("assignment_submissions")
      .select("*")
      .eq("school_id", tenant.schoolId)
      .eq("assignment_id", assignment.id);

    const subMap = new Map((subs || []).map((s: any) => [s.student_id, s]));
    
    const enriched: Submission[] = (students || []).map((s: any) => {
      const sub = subMap.get(s.id) as any;
      return {
        id: sub?.id || "",
        student_id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        submission_text: sub?.submission_text || null,
        attachment_urls: sub?.attachment_urls || null,
        submitted_at: sub?.submitted_at || "",
        status: sub?.status || "not_submitted",
        marks_obtained: sub?.marks_obtained ?? null,
        feedback: sub?.feedback || null,
        days_late: sub?.days_late || 0,
        penalty_applied: sub?.penalty_applied || 0,
        marks_before_penalty: sub?.marks_before_penalty ?? null,
      };
    });

    setSubmissions(enriched);
    setSubmissionsOpen(true);
  };

  const openGradeDialog = (sub: Submission) => {
    setSelectedSubmission(sub);
    // Show marks before penalty if graded, otherwise empty
    setGradeForm({
      marks: sub.marks_before_penalty?.toString() || sub.marks_obtained?.toString() || "",
      feedback: sub.feedback || "",
    });
    setGradeOpen(true);
  };

  // Calculate late penalty (simplified - no per-day penalty columns)
  const calculatePenalty = (rawMarks: number, daysLate: number, _maxMarks: number) => {
    if (!selectedAssignment || daysLate <= 0) return { finalMarks: rawMarks, penalty: 0 };
    return { finalMarks: rawMarks, penalty: 0 };
  };

  const saveGrade = async () => {
    if (!selectedSubmission || !selectedAssignment) return;
    
    setSavingGrade(true);
    
    const rawMarks = gradeForm.marks ? parseFloat(gradeForm.marks) : null;
    let finalMarks = rawMarks;
    let penaltyApplied = 0;
    
    // Apply late penalty if submission was late
    if (rawMarks !== null && selectedSubmission.days_late > 0) {
      const { finalMarks: calculated, penalty } = calculatePenalty(
        rawMarks, 
        selectedSubmission.days_late, 
        selectedAssignment.max_marks
      );
      finalMarks = calculated;
      penaltyApplied = penalty;
    }
    
    const { error } = await supabase
      .from("assignment_submissions")
      .update({
        marks_obtained: finalMarks,
        marks_before_penalty: rawMarks,
        penalty_applied: penaltyApplied,
        feedback: gradeForm.feedback || null,
        status: "graded",
        graded_by: user?.id,
        graded_at: new Date().toISOString(),
      })
      .eq("id", selectedSubmission.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(penaltyApplied > 0 ? `Grade saved with ${penaltyApplied}% late penalty!` : "Grade saved!");
      setGradeOpen(false);
      openSubmissionsDialog(selectedAssignment);
    }
    setSavingGrade(false);
  };

  const getSubmissionStats = (assignment: Assignment) => {
    const subs = submissions.filter((s) => s.status !== "not_submitted");
    const graded = submissions.filter((s) => s.status === "graded");
    return { submitted: subs.length, graded: graded.length, total: submissions.length };
  };

  const filteredAssignments = filterSection === "all"
    ? assignments
    : assignments.filter((a) => a.class_section_id === filterSection);

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
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterSection} onValueChange={setFilterSection}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.class_name} - {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Section *</Label>
                <Select
                  value={newAssignment.class_section_id}
                  onValueChange={(v) => setNewAssignment((p) => ({ ...p, class_section_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
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
              
              <div>
                <Label>Title *</Label>
                <Input
                  value={newAssignment.title}
                  onChange={(e) => setNewAssignment((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={newAssignment.description}
                  onChange={(e) => setNewAssignment((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Marks</Label>
                  <Input
                    type="number"
                    value={newAssignment.max_marks}
                    onChange={(e) => setNewAssignment((p) => ({ ...p, max_marks: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={newAssignment.due_date}
                    onChange={(e) => setNewAssignment((p) => ({ ...p, due_date: e.target.value }))}
                  />
                </div>
              </div>
              
              
              <Button onClick={handleAddAssignment} className="w-full">
                Create Assignment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Assignments List */}
      <Card>
        <CardHeader>
          <CardTitle>Assignments ({filteredAssignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments found.</p>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map((a) => (
                <div key={a.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{a.title}</p>
                        <Badge variant="outline" className="text-xs capitalize">
                          {a.status || "active"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{a.section_name}</p>
                      {a.description && <p className="mt-2 text-sm">{a.description}</p>}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Max: {a.max_marks} marks {a.due_date && `• Due: ${a.due_date}`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => openSubmissionsDialog(a)}>
                        <FileCheck className="mr-1 h-4 w-4" /> Submissions
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openResultsDialog(a)}>
                        <Users className="mr-1 h-4 w-4" /> Quick Grade
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Submissions Dialog */}
      <Dialog open={submissionsOpen} onOpenChange={setSubmissionsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Submissions: {selectedAssignment?.title}
            </DialogTitle>
            <DialogDescription>
              Max: {selectedAssignment?.max_marks} marks
              {selectedAssignment?.due_date && ` • Due: ${selectedAssignment.due_date}`}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="all" className="mt-4">
            <TabsList>
              <TabsTrigger value="all">All ({submissions.length})</TabsTrigger>
              <TabsTrigger value="submitted">
                Submitted ({submissions.filter((s) => s.status !== "not_submitted").length})
              </TabsTrigger>
              <TabsTrigger value="graded">
                Graded ({submissions.filter((s) => s.status === "graded").length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({submissions.filter((s) => s.status === "not_submitted").length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-4 space-y-2">
              {submissions.map((sub) => (
                <SubmissionRow 
                  key={sub.student_id} 
                  sub={sub} 
                  maxMarks={selectedAssignment?.max_marks || 100}
                  onGrade={() => openGradeDialog(sub)}
                />
              ))}
            </TabsContent>
            
            <TabsContent value="submitted" className="mt-4 space-y-2">
              {submissions.filter((s) => s.status !== "not_submitted").map((sub) => (
                <SubmissionRow 
                  key={sub.student_id} 
                  sub={sub} 
                  maxMarks={selectedAssignment?.max_marks || 100}
                  onGrade={() => openGradeDialog(sub)}
                />
              ))}
            </TabsContent>
            
            <TabsContent value="graded" className="mt-4 space-y-2">
              {submissions.filter((s) => s.status === "graded").map((sub) => (
                <SubmissionRow 
                  key={sub.student_id} 
                  sub={sub} 
                  maxMarks={selectedAssignment?.max_marks || 100}
                  onGrade={() => openGradeDialog(sub)}
                />
              ))}
            </TabsContent>
            
            <TabsContent value="pending" className="mt-4 space-y-2">
              {submissions.filter((s) => s.status === "not_submitted").map((sub) => (
                <SubmissionRow 
                  key={sub.student_id} 
                  sub={sub} 
                  maxMarks={selectedAssignment?.max_marks || 100}
                  onGrade={() => openGradeDialog(sub)}
                />
              ))}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Grade Submission Dialog */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
            <DialogDescription>
              {selectedSubmission?.first_name} {selectedSubmission?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Late submission warning */}
            {selectedSubmission && selectedSubmission.days_late > 0 && selectedAssignment && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Late Submission ({selectedSubmission.days_late} day{selectedSubmission.days_late !== 1 ? "s" : ""} late)
                  </p>
                </div>
              </div>
            )}
            
            {selectedSubmission?.submission_text && (
              <div>
                <Label className="text-muted-foreground">Student's Answer</Label>
                <div className="mt-2 rounded-lg border p-3 text-sm max-h-40 overflow-y-auto bg-muted/50">
                  {selectedSubmission.submission_text}
                </div>
              </div>
            )}
            
            {selectedSubmission?.attachment_urls && selectedSubmission.attachment_urls.length > 0 && (
              <AttachmentsList attachmentUrls={selectedSubmission.attachment_urls} />
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Marks (out of {selectedAssignment?.max_marks})</Label>
                <Input
                  type="number"
                  min={0}
                  max={selectedAssignment?.max_marks}
                  value={gradeForm.marks}
                  onChange={(e) => setGradeForm((p) => ({ ...p, marks: e.target.value }))}
                  className="mt-1"
                />
                {gradeForm.marks && selectedSubmission && selectedSubmission.days_late > 0 && selectedAssignment && (
                  <p className="text-xs text-muted-foreground mt-1">
                    After penalty: {calculatePenalty(
                      parseFloat(gradeForm.marks),
                      selectedSubmission.days_late,
                      selectedAssignment.max_marks
                    ).finalMarks} marks
                  </p>
                )}
              </div>
              <div className="flex items-end">
                {gradeForm.marks && selectedAssignment && (
                  <Badge variant="secondary" className="mb-2">
                    {((parseFloat(gradeForm.marks) / selectedAssignment.max_marks) * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
            </div>
            
            <div>
              <Label>Feedback</Label>
              <Textarea
                value={gradeForm.feedback}
                onChange={(e) => setGradeForm((p) => ({ ...p, feedback: e.target.value }))}
                placeholder="Add feedback for the student..."
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}>Cancel</Button>
            <Button onClick={saveGrade} disabled={savingGrade}>
              {savingGrade ? "Saving..." : "Save Grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enter Results Dialog (Quick Grade) */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Quick Grade: {selectedAssignment?.title}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (Max: {selectedAssignment?.max_marks})
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Marks</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r) => (
                      <TableRow key={r.student_id}>
                        <TableCell className="font-medium">
                          {r.first_name} {r.last_name}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            className="w-20"
                            value={r.marks_obtained ?? ""}
                            onChange={(e) =>
                              updateResult(
                                r.student_id,
                                "marks_obtained",
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-16"
                            value={r.grade ?? ""}
                            onChange={(e) => updateResult(r.student_id, "grade", e.target.value || null)}
                            placeholder="A/B/C"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={r.remarks ?? ""}
                            onChange={(e) => updateResult(r.student_id, "remarks", e.target.value || null)}
                            placeholder="Optional"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4">
                  <Button onClick={saveResults} disabled={savingResults}>
                    {savingResults ? "Saving..." : "Save Results"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Submission row component
function SubmissionRow({ 
  sub, 
  maxMarks, 
  onGrade 
}: { 
  sub: Submission; 
  maxMarks: number; 
  onGrade: () => void;
}) {
  const getStatusBadge = () => {
    switch (sub.status) {
      case "graded":
        return <Badge variant="default" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Graded</Badge>;
      case "submitted":
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Submitted</Badge>;
      case "late":
        return <Badge variant="destructive" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Late</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Not Submitted</Badge>;
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{sub.first_name} {sub.last_name}</p>
            {sub.attachment_urls && sub.attachment_urls.length > 0 && (
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            )}
            {sub.days_late > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                {sub.days_late}d late
              </Badge>
            )}
          </div>
          {sub.submitted_at && (
            <p className="text-xs text-muted-foreground">
              Submitted: {new Date(sub.submitted_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {sub.status === "graded" && (
          <div className="text-right">
            <p className="font-medium">{sub.marks_obtained}/{maxMarks}</p>
            {sub.penalty_applied > 0 && sub.marks_before_penalty !== null && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                -{sub.penalty_applied}% penalty (was {sub.marks_before_penalty})
              </p>
            )}
            {sub.penalty_applied === 0 && (
              <p className="text-xs text-muted-foreground">
                {((sub.marks_obtained || 0) / maxMarks * 100).toFixed(0)}%
              </p>
            )}
          </div>
        )}
        {getStatusBadge()}
        {sub.status !== "not_submitted" && (
          <Button size="sm" variant="outline" onClick={onGrade}>
            <MessageSquare className="h-4 w-4 mr-1" /> {sub.status === "graded" ? "Edit" : "Grade"}
          </Button>
        )}
      </div>
    </div>
  );
}
