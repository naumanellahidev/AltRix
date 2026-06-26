import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Users, CheckCircle, Clock, FileCheck, MessageSquare, Paperclip, AlertTriangle, Check, AlertCircle, Info, Trash2, Search, Filter, Calendar, TrendingUp, Award, FileText, BookOpen } from "lucide-react";
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
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
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

  // Search, Filters & Modals
  const [filterSection, setFilterSection] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<boolean>(false);

  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);

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

    // Fetch all submissions for these assignments to compute stats
    const assignmentIds = (assignmentData || []).map((a) => a.id);
    if (assignmentIds.length > 0) {
      const { data: subData } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, status, marks_obtained")
        .in("assignment_id", assignmentIds);
      setAllSubmissions(subData || []);
    } else {
      setAllSubmissions([]);
    }

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

  const handleDeleteAssignment = async (assignmentId: string) => {
    setDeletingAssignment(true);
    try {
      // 1. Delete student results first (prevent FK issues)
      const { error: resultsError } = await supabase
        .from("student_results")
        .delete()
        .eq("assignment_id", assignmentId);

      if (resultsError) {
        toast.error(`Error deleting results: ${resultsError.message}`);
        setDeletingAssignment(false);
        return;
      }

      // 2. Delete submissions
      const { error: subsError } = await supabase
        .from("assignment_submissions")
        .delete()
        .eq("assignment_id", assignmentId);

      if (subsError) {
        toast.error(`Error deleting submissions: ${subsError.message}`);
        setDeletingAssignment(false);
        return;
      }

      // 3. Delete assignment
      const { error: assignmentError } = await supabase
        .from("assignments")
        .delete()
        .eq("id", assignmentId);

      if (assignmentError) {
        toast.error(`Error deleting assignment: ${assignmentError.message}`);
        setDeletingAssignment(false);
        return;
      }

      toast.success("Assignment deleted successfully");
      setDeleteConfirmOpen(false);
      setAssignmentToDelete(null);
      if (detailOpen && viewingAssignment?.id === assignmentId) {
        setDetailOpen(false);
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "An error occurred during deletion");
    } finally {
      setDeletingAssignment(false);
    }
  };

  const openDetailModal = (assignment: Assignment) => {
    setViewingAssignment(assignment);
    setDetailOpen(true);
  };

  const triggerDeleteConfirm = (assignment: Assignment, e: React.MouseEvent) => {
    e.stopPropagation();
    setAssignmentToDelete(assignment);
    setDeleteConfirmOpen(true);
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

  const stats = useMemo(() => {
    const total = assignments.length;
    const toGrade = allSubmissions.filter(s => s.status === 'submitted' || s.status === 'late').length;
    
    let totalPct = 0;
    let gradedCount = 0;
    allSubmissions.filter(s => s.status === 'graded' && s.marks_obtained !== null).forEach(s => {
      const assignment = assignments.find(a => a.id === s.assignment_id);
      if (assignment && assignment.max_marks > 0) {
        totalPct += (s.marks_obtained / assignment.max_marks) * 100;
        gradedCount++;
      }
    });
    const classAvg = gradedCount > 0 ? `${(totalPct / gradedCount).toFixed(0)}%` : "—";
    
    const active = assignments.filter(a => !a.due_date || new Date(a.due_date) >= new Date()).length;
    
    return { total, toGrade, classAvg, active };
  }, [assignments, allSubmissions]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const matchesSection = filterSection === "all" || a.class_section_id === filterSection;
      
      const titleMatches = a.title?.toLowerCase().includes(searchTerm.toLowerCase());
      const descMatches = a.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      const matchesSearch = !searchTerm || titleMatches || descMatches;
      
      const isQuiz = a.description?.startsWith("[ALTRIX_QUIZ_JSON]:");
      const matchesType = filterType === "all" 
        || (filterType === "quiz" && isQuiz) 
        || (filterType === "standard" && !isQuiz);

      const isPastDue = a.due_date && new Date(a.due_date) < new Date();
      const matchesStatus = filterStatus === "all"
        || (filterStatus === "active" && !isPastDue)
        || (filterStatus === "past_due" && isPastDue);

      return matchesSection && matchesSearch && matchesType && matchesStatus;
    });
  }, [assignments, filterSection, searchTerm, filterType, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-12 text-center">
          <BookOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No classes assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50/40 to-indigo-50/10 border-slate-200/80 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Total Assignments</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.total}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-700">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50/40 to-orange-50/10 border-slate-200/80 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">To Grade</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.toGrade}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50/40 to-teal-50/10 border-slate-200/80 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Class Avg Score</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.classAvg}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-100/80 flex items-center justify-center text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50/40 to-violet-50/10 border-slate-200/80 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Active Tasks</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.active}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-indigo-100/80 flex items-center justify-center text-indigo-700">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search assignments by title or description..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterSection} onValueChange={setFilterSection}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sections" />
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

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="quiz">MCQ Quizzes</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-700 hover:bg-blue-600">
                  <Plus className="mr-1.5 h-4 w-4" /> Create
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
                  
                  <Button onClick={handleAddAssignment} className="w-full bg-blue-700 hover:bg-blue-600">
                    Create Assignment
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Assignments List */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-lg font-bold text-slate-800">Assignments ({filteredAssignments.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium">No assignments found matching the search/filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssignments.map((a) => {
                const isQuiz = a.description?.startsWith("[ALTRIX_QUIZ_JSON]:");
                const isPastDue = a.due_date && new Date(a.due_date) < new Date();
                
                return (
                  <div 
                    key={a.id} 
                    onClick={() => openDetailModal(a)}
                    className="rounded-xl border border-slate-200 p-5 bg-white hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-800 text-base">{a.title}</h3>
                        {isQuiz && (
                          <Badge className="bg-blue-600 text-white text-[10px] hover:bg-blue-500 font-semibold px-2 py-0.5 rounded-full">
                            MCQ Quiz
                          </Badge>
                        )}
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isPastDue 
                              ? "border-rose-200 text-rose-700 bg-rose-50/50" 
                              : "border-emerald-250 text-emerald-700 bg-emerald-50/50"
                          }`}
                        >
                          {isPastDue ? "Past Due" : "Active"}
                        </Badge>
                      </div>
                      <p className="text-xs font-semibold text-slate-500">{a.section_name}</p>
                      
                      {a.description && (
                        <div className="text-xs text-slate-600 line-clamp-2 max-w-2xl pt-1">
                          {isQuiz ? (
                            (() => {
                              try {
                                const quizData = JSON.parse(a.description.substring(19));
                                return quizData.instructions || "Please complete the MCQ Quiz.";
                              } catch (e) {
                                return a.description;
                              }
                            })()
                          ) : (
                            a.description
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-slate-400 font-medium pt-2">
                        <span className="flex items-center gap-1">
                          <Award className="h-3.5 w-3.5 text-slate-400" /> Max {a.max_marks} marks
                        </span>
                        {a.due_date && (
                          <span className={`flex items-center gap-1 ${isPastDue ? "text-rose-600 font-semibold" : ""}`}>
                            <Calendar className="h-3.5 w-3.5" /> Due {new Date(a.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="border-slate-200 text-slate-650 hover:bg-slate-50 font-semibold" onClick={() => openSubmissionsDialog(a)}>
                        <FileCheck className="mr-1 h-3.5 w-3.5 text-blue-600" /> Submissions
                      </Button>
                      <Button size="sm" variant="outline" className="border-slate-200 text-slate-650 hover:bg-slate-50 font-semibold" onClick={() => openResultsDialog(a)}>
                        <Users className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Quick Grade
                      </Button>
                      <Button size="icon" variant="ghost" className="text-slate-400 hover:text-rose-600 hover:bg-rose-50" onClick={(e) => triggerDeleteConfirm(a, e)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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
            
           {(() => {
              const isQuiz = selectedAssignment?.description?.startsWith("[ALTRIX_QUIZ_JSON]:");
              let quizData: any = null;
              if (isQuiz && selectedAssignment?.description) {
                try {
                  quizData = JSON.parse(selectedAssignment.description.substring(19));
                } catch (e) {
                  console.error(e);
                }
              }

              const studentAnswers = (() => {
                if (selectedSubmission?.submission_text?.startsWith("[ALTRIX_QUIZ_SUBMISSION]:")) {
                  try {
                    return JSON.parse(selectedSubmission.submission_text.substring(25));
                  } catch (e) {
                    console.error(e);
                  }
                }
                return null;
              })();

              if (isQuiz && quizData && studentAnswers) {
                return (
                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Student MCQ Responses</Label>
                    {quizData.questions.map((q: any) => {
                      const studentChoice = studentAnswers[q.questionNumber] || "";
                      const correctChoice = q.correctAnswer;
                      const isStudentCorrect = studentChoice === correctChoice;

                      return (
                        <div key={q.questionNumber} className={`p-4 rounded-xl border space-y-3 ${
                          isStudentCorrect ? "bg-emerald-50/20 border-emerald-250" : "bg-rose-50/20 border-rose-250"
                        }`}>
                          <div className="flex items-start gap-2">
                            <span className={`text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              isStudentCorrect ? "bg-emerald-600" : "bg-rose-600"
                            }`}>
                              Q{q.questionNumber}
                            </span>
                            <p className="text-xs font-semibold text-slate-800 leading-normal">{q.question}</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {q.options.map((opt: string, idx: number) => {
                              const optionLetter = String.fromCharCode(65 + idx);
                              const isSelectedByStudent = studentChoice === optionLetter;
                              const isOptionCorrect = correctChoice === optionLetter;

                              let optionStyle = "bg-white border-slate-200 text-slate-650";
                              let icon = null;

                              if (isOptionCorrect) {
                                optionStyle = "bg-emerald-50 border-emerald-350 text-emerald-900 font-semibold shadow-[0_1px_5px_rgba(16,185,129,0.08)]";
                                icon = <Check className="h-4 w-4 text-emerald-600" />;
                              } else if (isSelectedByStudent) {
                                optionStyle = "bg-rose-50 border-rose-350 text-rose-900 font-semibold";
                                icon = <AlertCircle className="h-4 w-4 text-rose-650" />;
                              }

                              return (
                                <div
                                  key={idx}
                                  className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2.5 ${optionStyle}`}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                      isOptionCorrect
                                        ? "bg-emerald-100 border border-emerald-300 text-emerald-700"
                                        : isSelectedByStudent
                                        ? "bg-rose-100 border border-rose-300 text-rose-700"
                                        : "bg-slate-100 border border-slate-200 text-slate-400"
                                    }`}>
                                      {optionLetter}
                                    </span>
                                    <span className="leading-snug">{opt}</span>
                                  </div>
                                  {icon}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <>
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
                </>
              );
            })()}
            
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

      {/* Assignment Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewingAssignment && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {viewingAssignment.description?.startsWith("[ALTRIX_QUIZ_JSON]:") && (
                    <Badge className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold rounded-full px-2">
                      MCQ Quiz
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] font-semibold rounded-full uppercase tracking-wider">
                    {viewingAssignment.status || "active"}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-bold text-slate-850">{viewingAssignment.title}</DialogTitle>
                <DialogDescription className="text-xs text-slate-550">
                  Section: {viewingAssignment.section_name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Score and Due Date Widget */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider block">Max Marks</span>
                    <span className="text-sm font-bold text-slate-850">{viewingAssignment.max_marks} marks</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold uppercase tracking-wider block">Due Date</span>
                    <span className="text-sm font-bold text-slate-850">
                      {viewingAssignment.due_date ? new Date(viewingAssignment.due_date).toLocaleDateString() : "No due date"}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-slate-500 font-bold uppercase tracking-wider block">Completion</span>
                    <span className="text-sm font-bold text-slate-850">
                      {(() => {
                        const total = allSubmissions.filter(s => s.assignment_id === viewingAssignment.id).length;
                        const graded = allSubmissions.filter(s => s.assignment_id === viewingAssignment.id && s.status === 'graded').length;
                        return `${graded} graded / ${total} submitted`;
                      })()}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description / Instructions</h4>
                  <div className="text-slate-700 bg-white border border-slate-200 rounded-xl p-4 text-xs whitespace-pre-wrap leading-relaxed shadow-sm">
                    {(() => {
                      const isQuiz = viewingAssignment.description?.startsWith("[ALTRIX_QUIZ_JSON]:");
                      if (isQuiz && viewingAssignment.description) {
                        try {
                          const quizData = JSON.parse(viewingAssignment.description.substring(19));
                          return quizData.instructions || "Please complete the MCQ Quiz.";
                        } catch (e) {
                          return viewingAssignment.description;
                        }
                      }
                      return viewingAssignment.description || "No description provided.";
                    })()}
                  </div>
                </div>

                {/* Quiz Questions List if MCQ Quiz */}
                {(() => {
                  const isQuiz = viewingAssignment.description?.startsWith("[ALTRIX_QUIZ_JSON]:");
                  let quizData: any = null;
                  if (isQuiz && viewingAssignment.description) {
                    try {
                      quizData = JSON.parse(viewingAssignment.description.substring(19));
                    } catch (e) {
                      console.error(e);
                    }
                  }

                  if (isQuiz && quizData) {
                    return (
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quiz Questions ({quizData.questions?.length})</h4>
                        <div className="space-y-3">
                          {quizData.questions.map((q: any) => (
                            <div key={q.questionNumber} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                              <div className="flex items-start gap-2">
                                <span className="text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 shrink-0">
                                  Q{q.questionNumber}
                                </span>
                                <p className="text-xs font-semibold text-slate-800 leading-normal">{q.question}</p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {q.options.map((opt: string, idx: number) => {
                                  const optionLetter = String.fromCharCode(65 + idx);
                                  const isOptionCorrect = q.correctAnswer === optionLetter;

                                  let optionStyle = "bg-white border-slate-200 text-slate-650";
                                  let icon = null;

                                  if (isOptionCorrect) {
                                    optionStyle = "bg-emerald-50 border-emerald-350 text-emerald-950 font-semibold shadow-[0_1px_5px_rgba(16,185,129,0.06)]";
                                    icon = <Check className="h-4 w-4 text-emerald-600" />;
                                  }

                                  return (
                                    <div
                                      key={idx}
                                      className={`p-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${optionStyle}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                          isOptionCorrect
                                            ? "bg-emerald-100 border border-emerald-300 text-emerald-700"
                                            : "bg-slate-100 border border-slate-200 text-slate-400"
                                        }`}>
                                          {optionLetter}
                                        </span>
                                        <span className="leading-snug">{opt}</span>
                                      </div>
                                      {icon}
                                    </div>
                                  );
                                })}
                              </div>

                              {q.explanation && (
                                <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100/60 text-[10px] flex gap-2">
                                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <span className="text-blue-800 font-bold uppercase tracking-wider block">
                                      Explanation:
                                    </span>
                                    <p className="text-slate-700 leading-relaxed font-medium">
                                      {q.explanation}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <DialogFooter className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <Button 
                  variant="ghost" 
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold"
                  onClick={(e) => triggerDeleteConfirm(viewingAssignment, e)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete Assignment
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    variant="outline"
                    className="border-slate-200 font-semibold text-slate-700" 
                    onClick={() => {
                      setDetailOpen(false);
                      openResultsDialog(viewingAssignment);
                    }}
                  >
                    <Users className="h-4 w-4 mr-1.5 text-emerald-600" /> Quick Grade
                  </Button>
                  <Button 
                    className="bg-blue-700 hover:bg-blue-600 font-semibold"
                    onClick={() => {
                      setDetailOpen(false);
                      openSubmissionsDialog(viewingAssignment);
                    }}
                  >
                    <FileCheck className="h-4 w-4 mr-1.5" /> Submissions
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Delete Assignment?
            </DialogTitle>
            <DialogDescription className="pt-2 text-xs leading-relaxed text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-800">"{assignmentToDelete?.title}"</span>? 
              <br/><br/>
              This action is permanent and will cascade to delete <strong className="text-rose-600 font-semibold">all student submissions and results</strong> associated with this assignment.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              className="border-slate-200 font-semibold text-slate-700" 
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              className="bg-rose-600 hover:bg-rose-700 font-semibold"
              disabled={deletingAssignment}
              onClick={() => assignmentToDelete && handleDeleteAssignment(assignmentToDelete.id)}
            >
              {deletingAssignment ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
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
