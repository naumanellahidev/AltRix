import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Clock, Eye, Paperclip, WifiOff, AlertCircle, Search, Calendar, TrendingUp, Award, FileText, BookOpen, User } from "lucide-react";
import { ChildInfo } from "@/hooks/useMyChildren";
import { useOfflineAssignments, useOfflineHomework, useOfflineEnrollments } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

type Assignment = { 
  id: string; 
  title: string; 
  description: string | null;
  due_date: string | null; 
  status: string;
  max_marks: number;
};

type Submission = {
  id: string;
  assignment_id: string;
  content: string | null;
  attachment_urls: string[] | null;
  submitted_at: string;
  status: string;
  marks: number | null;
  feedback: string | null;
};

type Homework = { id: string; title: string; due_date: string; status: string };

export function parseRawQuizToJSON(text: string): { questions: any[]; instructions: string } | null {
  if (!text) return null;
  if (text.startsWith("[ALTRIX_QUIZ_JSON]:")) return null;

  const questions: any[] = [];
  const lines = text.split("\n");
  
  let currentQuestion: any = null;
  let instructionsLines: string[] = [];
  let isParsingQuestions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const qMatch = line.match(/^(?:\*\*|)?(?:Q(?:uestion)?\s*[-.:\d\s]+|\d+\.)/i);
    
    if (qMatch) {
      isParsingQuestions = true;
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      
      const cleanQuestion = line.replace(/^\**/, "").replace(/\*\*$/, "").replace(/^[Q|q](?:uestion)?\s*[-.:\d\s]+/, "").replace(/^\d+\.\s*/, "").trim();
      currentQuestion = {
        questionNumber: questions.length + 1,
        question: cleanQuestion,
        options: {},
        correctAnswer: "",
        explanation: ""
      };
      continue;
    }

    if (!isParsingQuestions) {
      instructionsLines.push(line);
      continue;
    }

    const optMatch = line.match(/^(?:\*\*|)?([A-D])[-.)\s]+(.*)/i);
    if (optMatch && currentQuestion) {
      const letter = optMatch[1].toUpperCase();
      const optionText = optMatch[2].replace(/\*\*$/, "").trim();
      currentQuestion.options[letter] = optionText;
      continue;
    }

    const ansMatch = line.match(/(?:Correct\s+)?Answer\s*[-.:\s*]+([A-D])/i);
    if (ansMatch && currentQuestion) {
      currentQuestion.correctAnswer = ansMatch[1].toUpperCase();
      continue;
    }

    const expMatch = line.match(/(?:Explanation|Exp)\s*[-.:\s*]+(.*)/i);
    if (expMatch && currentQuestion) {
      currentQuestion.explanation = expMatch[1].replace(/\*+$/, "").trim();
      continue;
    }

    if (currentQuestion) {
      if (currentQuestion.explanation) {
        currentQuestion.explanation += " " + line;
      } else if (Object.keys(currentQuestion.options).length === 0) {
        currentQuestion.question += " " + line;
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  if (questions.length > 0) {
    questions.forEach((q) => {
      if (!q.correctAnswer) q.correctAnswer = "A";
      const optionList: string[] = [];
      ["A", "B", "C", "D"].forEach((letter) => {
        if (q.options[letter]) {
          optionList.push(q.options[letter]);
        }
      });
      if (optionList.length === 0) {
        optionList.push("Option A", "Option B", "Option C", "Option D");
      }
      q.options = optionList;
    });

    return {
      questions,
      instructions: instructionsLines.join("\n") || "Please complete the following quiz questions generated for our topic."
    };
  }

  return null;
}

export function getAssignmentType(description: string | null, title: string | null): {
  type: "mcq" | "written_test" | "paragraph" | "test" | "other";
  label: string;
  cleanDescription: string;
} {
  const desc = description || "";
  const t = title || "";

  if (desc.startsWith("[ALTRIX_QUIZ_JSON]:")) {
    return { type: "mcq", label: "MCQ Quiz", cleanDescription: desc.substring(19) };
  }
  
  if (desc.startsWith("[ALTRIX_TYPE:written_test]:")) {
    return { type: "written_test", label: "Written Test", cleanDescription: desc.substring(27) };
  }
  if (desc.startsWith("[ALTRIX_TYPE:paragraph]:")) {
    return { type: "paragraph", label: "Paragraph Assignment", cleanDescription: desc.substring(24) };
  }
  if (desc.startsWith("[ALTRIX_TYPE:test]:")) {
    return { type: "test", label: "Test Assignment", cleanDescription: desc.substring(19) };
  }
  if (desc.startsWith("[ALTRIX_TYPE:other]:")) {
    return { type: "other", label: "General Assignment", cleanDescription: desc.substring(20) };
  }

  const hasOptions = desc.match(/[A-D]\s*[-.)]\s*\w+/i);
  const isQuizTitle = t.toLowerCase().includes("quiz") || t.toLowerCase().includes("mcq");
  
  if (isQuizTitle || (hasOptions && desc.toLowerCase().includes("correct answer"))) {
    return { type: "mcq", label: "MCQ Quiz", cleanDescription: desc };
  }
  if (t.toLowerCase().includes("written test") || t.toLowerCase().includes("written-test")) {
    return { type: "written_test", label: "Written Test", cleanDescription: desc };
  }
  if (t.toLowerCase().includes("paragraph")) {
    return { type: "paragraph", label: "Paragraph Assignment", cleanDescription: desc };
  }
  if (t.toLowerCase().includes("test")) {
    return { type: "test", label: "Test Assignment", cleanDescription: desc };
  }

  return { type: "other", label: "General Assignment", cleanDescription: desc };
}

export function getQuizData(description: string | null): { questions: any[]; instructions: string } | null {
  if (!description) return null;
  if (description.startsWith("[ALTRIX_QUIZ_JSON]:")) {
    try {
      return JSON.parse(description.substring(19));
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  return parseRawQuizToJSON(description);
}

export function getBadgeStyle(type: string): string {
  switch (type) {
    case "mcq":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "written_test":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "paragraph":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "test":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

interface ParentAssignmentsModuleProps {
  child: ChildInfo | null;
  schoolId: string | null;
}

export default function ParentAssignmentsModule({ child, schoolId }: ParentAssignmentsModuleProps) {
  const [submissions, setSubmissions] = useState<Map<string, Submission>>(new Map());
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [viewSubmission, setViewSubmission] = useState<Submission | null>(null);
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);

  // Fetch offline-first data hooks
  const { 
    data: cachedAssignments, 
    loading: assignmentsLoading, 
    isOffline, 
    isUsingCache: assignmentsFromCache,
    refresh: refreshAssignments 
  } = useOfflineAssignments(schoolId);
  
  const { 
    data: cachedHomework, 
    loading: homeworkLoading, 
    isUsingCache: homeworkFromCache,
    refresh: refreshHomework 
  } = useOfflineHomework(schoolId);

  const {
    data: cachedEnrollments,
    isUsingCache: enrollmentsFromCache,
  } = useOfflineEnrollments(schoolId);

  const childSectionIds = useMemo(() => {
    if (!child) return [] as string[];
    return cachedEnrollments
      .filter((e) => e.studentId === child.student_id)
      .map((e) => e.classSectionId);
  }, [cachedEnrollments, child]);

  // Filter assignments/homework based on class section
  const assignments = useMemo(() => {
    const allowed = new Set(childSectionIds);
    return cachedAssignments
      .filter((a) => !allowed.size || allowed.has(a.classSectionId))
      .map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.dueDate,
        status: a.status,
        max_marks: a.maxMarks,
      })) as Assignment[];
  }, [cachedAssignments, childSectionIds]);

  const homework = useMemo(() => {
    const allowed = new Set(childSectionIds);
    return cachedHomework
      .filter((h) => !allowed.size || allowed.has(h.classSectionId))
      .map(h => ({
        id: h.id,
        title: h.title,
        due_date: h.dueDate || '',
        status: h.status,
      })) as Homework[];
  }, [cachedHomework, childSectionIds]);

  const refreshSubmissions = async () => {
    if (!child || isOffline || !schoolId) return;
    
    const { data: subs } = await supabase
      .from("assignment_submissions")
      .select("id,assignment_id,content,attachment_urls,submitted_at,status,marks,feedback")
      .eq("school_id", schoolId)
      .eq("student_id", child.student_id);
    
    const subMap = new Map<string, Submission>();
    (subs ?? []).forEach((s: any) => subMap.set(s.assignment_id, s as Submission));
    setSubmissions(subMap);
  };

  useEffect(() => {
    refreshSubmissions();
  }, [child?.student_id, schoolId, isOffline]);

  const openViewDialog = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    if (sub) {
      setViewSubmission(sub);
      setSelectedAssignment(assignment);
      setViewOpen(true);
    }
  };

  const openDetailModal = (assignment: Assignment) => {
    setViewingAssignment(assignment);
    setDetailOpen(true);
  };

  const getSubmissionStatus = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    if (!sub) return { label: "Not Submitted", variant: "outline" as const, icon: Clock };
    if (sub.status === "graded") return { label: `Graded: ${sub.marks}/${assignment.max_marks}`, variant: "default" as const, icon: CheckCircle };
    if (sub.status === "late") return { label: "Submitted Late", variant: "secondary" as const, icon: CheckCircle };
    return { label: "Submitted", variant: "secondary" as const, icon: CheckCircle };
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const hasAttachments = (assignment: Assignment) => {
    const sub = submissions.get(assignment.id);
    return sub?.attachment_urls && sub.attachment_urls.length > 0;
  };

  const stats = useMemo(() => {
    const total = assignments.length;
    const todo = assignments.filter(a => !submissions.has(a.id)).length;
    const gradedSubs = Array.from(submissions.values()).filter(s => s.status === 'graded' && s.marks !== null);
    const completed = Array.from(submissions.values()).length;
    
    let totalPct = 0;
    let gradedCount = 0;
    gradedSubs.forEach(s => {
      const assignment = assignments.find(a => a.id === s.assignment_id);
      if (assignment && assignment.max_marks > 0) {
        totalPct += (s.marks! / assignment.max_marks) * 100;
        gradedCount++;
      }
    });
    const avgScore = gradedCount > 0 ? `${(totalPct / gradedCount).toFixed(0)}%` : "—";
    const overdue = assignments.filter(a => !submissions.has(a.id) && a.due_date && new Date(a.due_date) < new Date()).length;
    
    return { total, todo, completed, avgScore, overdue };
  }, [assignments, submissions]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      const sub = submissions.get(a.id);
      const titleMatches = a.title?.toLowerCase().includes(searchTerm.toLowerCase());
      const descMatches = a.description?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      const matchesSearch = !searchTerm || titleMatches || descMatches;
      
      const isOverdueVal = a.due_date && new Date(a.due_date) < new Date() && !sub;

      let matchesStatus = true;
      if (filterStatus === "todo") {
        matchesStatus = !sub;
      } else if (filterStatus === "submitted") {
        matchesStatus = sub?.status === "submitted" || sub?.status === "late";
      } else if (filterStatus === "graded") {
        matchesStatus = sub?.status === "graded";
      } else if (filterStatus === "overdue") {
        matchesStatus = isOverdueVal;
      }

      return matchesSearch && matchesStatus;
    });
  }, [assignments, submissions, searchTerm, filterStatus]);

  if (!child) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <User className="h-12 w-12 text-slate-300" />
        <h3 className="font-display text-lg font-semibold text-slate-800">No Child Selected</h3>
        <p className="max-w-md text-sm text-slate-500">
          Please select one of your children in the sidebar to view their assignments and quizzes.
        </p>
      </div>
    );
  }

  const handleRefresh = () => {
    if (!isOffline) {
      refreshAssignments();
      refreshHomework();
      refreshSubmissions();
    }
  };

  const loading = assignmentsLoading || homeworkLoading;
  const isUsingCache = assignmentsFromCache || homeworkFromCache || enrollmentsFromCache;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={handleRefresh} />
      
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Assignments</h1>
        <p className="text-sm text-slate-500">
          Track assignments, homework, and quizzes for <span className="font-bold text-slate-700">{[child.first_name, child.last_name].filter(Boolean).join(" ")}</span>.
        </p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50/40 to-indigo-50/10 border-slate-200/80 shadow-sm transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Assigned Tasks</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.total}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-700">
              <BookOpen className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-50/40 to-orange-50/10 border-slate-200/80 shadow-sm transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">To Do / Pending</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.todo}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-amber-100/80 flex items-center justify-center text-amber-700">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50/40 to-teal-50/10 border-slate-200/80 shadow-sm transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Average Grade</span>
              <p className="text-3xl font-extrabold text-slate-800">{stats.avgScore}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-100/80 flex items-center justify-center text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-rose-50/40 to-red-50/10 border-slate-200/80 shadow-sm transition-all duration-200 hover:shadow-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Overdue Tasks</span>
              <p className="text-3xl font-extrabold text-rose-700">{stats.overdue}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-rose-100/80 flex items-center justify-center text-rose-700">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs list */}
      <Tabs defaultValue="assignments" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <TabsList className="bg-slate-100/80">
            <TabsTrigger value="assignments" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600">Assignments</TabsTrigger>
            <TabsTrigger value="homework" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-600">Homework</TabsTrigger>
          </TabsList>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:w-[480px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search by title..."
                className="pl-8 h-9 text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="todo">Pending / To Do</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="graded">Graded</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Assignments Tab Content */}
        <TabsContent value="assignments" className="mt-4 space-y-4">
          {filteredAssignments.length === 0 ? (
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardContent className="py-12 text-center text-slate-400">
                {isOffline ? (
                  <div className="flex flex-col items-center gap-2">
                    <WifiOff className="h-8 w-8" />
                    <p className="text-sm font-medium">No cached assignments available</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileText className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium">No assignments found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredAssignments.map((a) => {
                const status = getSubmissionStatus(a);
                const sub = submissions.get(a.id);
                const overdue = isOverdue(a.due_date) && !sub;
                
                const { type, label, cleanDescription } = getAssignmentType(a.description, a.title);

                return (
                  <Card 
                    key={a.id} 
                    onClick={() => openDetailModal(a)}
                    className={`rounded-xl border border-slate-200 bg-white p-1 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer ${
                      overdue ? "border-rose-200 shadow-[0_1px_4px_rgba(244,63,94,0.04)]" : ""
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base font-bold text-slate-800">{a.title}</CardTitle>
                            <Badge variant="outline" className={`text-[10px] font-semibold rounded-full uppercase tracking-wider ${getBadgeStyle(type)}`}>
                              {label}
                            </Badge>
                            {hasAttachments(a) && (
                              <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                            )}
                          </div>
                          {cleanDescription && (
                            <CardDescription className="text-xs text-slate-650 pt-1 line-clamp-2 max-w-2xl">
                              {cleanDescription}
                            </CardDescription>
                          )}
                        </div>
                        <Badge variant={status.variant} className="flex items-center gap-1 shrink-0 text-[10px] font-bold rounded-full px-2">
                          <status.icon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-450 font-semibold flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Award className="h-3.5 w-3.5" /> Max {a.max_marks} marks
                          </span>
                          {a.due_date && (
                            <span className={`flex items-center gap-1 ${overdue ? "text-rose-600" : ""}`}>
                              <Calendar className="h-3.5 w-3.5" /> Due {new Date(a.due_date).toLocaleDateString()}
                              {overdue && " (Overdue)"}
                            </span>
                          )}
                        </div>
                        {!isOffline && sub && (
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="outline" className="border-slate-200 text-slate-650 font-semibold h-8 text-xs" onClick={() => openViewDialog(a)}>
                              <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" /> {sub.status === "graded" ? "View Result" : "View Submission"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        {/* Homework Tab Content */}
        <TabsContent value="homework" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {homework.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.title}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(h.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">{h.status}</TableCell>
                </TableRow>
              ))}
              {homework.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {isOffline ? "No cached homework available." : "No homework found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* View Submission detail Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>View Child Submission</DialogTitle>
            <DialogDescription>
              Details of the submitted assignment.
            </DialogDescription>
          </DialogHeader>

          {viewSubmission && (
            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-400 block">Submitted At</span>
                <p className="text-sm text-slate-700">{new Date(viewSubmission.submitted_at).toLocaleString()}</p>
              </div>

              {(() => {
                const quizData = selectedAssignment ? getQuizData(selectedAssignment.description) : null;
                const studentQuizAnswers = (() => {
                  if (viewSubmission?.content?.startsWith("[ALTRIX_QUIZ_SUBMISSION]:")) {
                    try {
                      return JSON.parse(viewSubmission.content.substring(25));
                    } catch (e) {
                      console.error(e);
                    }
                  }
                  return {};
                })();

                return quizData ? (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 block">Quiz Performance</span>
                    <div className="border rounded-lg p-4 space-y-4 max-h-[300px] overflow-y-auto bg-slate-50/50">
                      {quizData.questions.map((q: any) => {
                        const childAnswer = studentQuizAnswers[q.questionNumber];
                        const isCorrect = childAnswer === q.correctAnswer;
                        
                        return (
                          <div key={q.questionNumber} className="space-y-1 border-b pb-3 last:border-b-0 last:pb-0">
                            <p className="text-xs font-bold text-slate-700">Q{q.questionNumber}: {q.question}</p>
                            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                              {q.options.map((val: string, idx: number) => {
                                const optionLetter = String.fromCharCode(65 + idx);
                                const isSelected = childAnswer === optionLetter;
                                const isRightOption = q.correctAnswer === optionLetter;
                                return (
                                  <div 
                                    key={optionLetter} 
                                    className={`p-2 rounded border ${
                                      isSelected 
                                        ? isCorrect ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-rose-50 border-rose-300 text-rose-800"
                                        : isRightOption ? "bg-emerald-50/40 border-emerald-200/80 text-emerald-800" : "bg-white border-slate-100"
                                    }`}
                                  >
                                    <span className="font-bold mr-1">{optionLetter}.</span> {val}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="text-[11px] pt-1 flex justify-between">
                              <span className={isCorrect ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                                Child's Choice: {childAnswer || "None"} ({isCorrect ? "Correct" : "Incorrect"})
                              </span>
                              <span className="text-emerald-700 font-semibold">Correct Answer: {q.correctAnswer}</span>
                            </div>
                            {q.explanation && (
                              <p className="text-[10px] text-slate-500 italic mt-1 bg-slate-100 p-2 rounded">
                                <strong>Explanation:</strong> {q.explanation}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-400 block">Submission Content</span>
                    <div className="text-sm bg-slate-50 p-3 rounded-lg border border-slate-200/60 max-h-[200px] overflow-y-auto whitespace-pre-wrap text-slate-700">
                      {viewSubmission.content}
                    </div>
                  </div>
                );
              })()}

              {viewSubmission.attachment_urls && viewSubmission.attachment_urls.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 block">Attachments</span>
                  <div className="flex flex-col gap-1">
                    {viewSubmission.attachment_urls.map((path, idx) => {
                      const name = path.split("/").pop() || path;
                      return (
                        <a
                          key={idx}
                          href={supabase.storage.from("assignment-submissions").getPublicUrl(path).data.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Paperclip className="h-3 w-3" /> {name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t pt-3 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 block">Marks Obtained</span>
                  <p className="text-sm font-bold text-slate-800">
                    {viewSubmission.marks !== null ? `${viewSubmission.marks} / ${selectedAssignment?.max_marks}` : "Pending Grading"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 block">Feedback</span>
                  <p className="text-sm text-slate-600 italic">
                    {viewSubmission.feedback || "No feedback provided."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {viewingAssignment && (() => {
            const sub = submissions.get(viewingAssignment.id);
            const quizData = getQuizData(viewingAssignment.description);
            const isQuiz = !!quizData;
            const { type, label, cleanDescription } = getAssignmentType(viewingAssignment.description, viewingAssignment.title);

            return (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg font-bold text-slate-800">
                      {viewingAssignment?.title}
                    </DialogTitle>
                    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${getBadgeStyle(type)}`}>
                      {label}
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs">
                    Review assignment details and instructions.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3">
                  {/* Due Date & Marks Info */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Max Marks: {viewingAssignment.max_marks}</span>
                    {viewingAssignment.due_date && (
                      <span className={isOverdue(viewingAssignment.due_date) ? "text-rose-600" : ""}>
                        Due: {new Date(viewingAssignment.due_date).toLocaleDateString()} {isOverdue(viewingAssignment.due_date) && "(Overdue)"}
                      </span>
                    )}
                  </div>

                  {/* Instructions / Quiz Questions */}
                  {quizData ? (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-500 block">Quiz Instructions & Questions</span>
                      <div className="space-y-3">
                        <p className="text-xs text-slate-600 italic">
                          {quizData.instructions || "Review the multiple-choice questions below:"}
                        </p>
                        <div className="space-y-3 max-h-[350px] overflow-y-auto border border-slate-100 rounded-lg p-3 bg-slate-50/30">
                          {quizData.questions.map((q: any) => (
                            <div key={q.questionNumber} className="space-y-1 pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                              <p className="text-xs font-bold text-slate-700">Q{q.questionNumber}: {q.question}</p>
                              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                                {q.options.map((val: string, idx: number) => {
                                  const optionLetter = String.fromCharCode(65 + idx);
                                  const isCorrectOption = q.correctAnswer === optionLetter;
                                  return (
                                    <div 
                                      key={optionLetter} 
                                      className={`p-2 rounded border bg-white border-slate-150 ${isCorrectOption ? "bg-emerald-50/40 border-emerald-200/80 text-emerald-800 font-semibold" : ""}`}
                                    >
                                      <span className="font-bold mr-1">{optionLetter}.</span> {val}
                                      {isCorrectOption && " (Correct)"}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-500 block">Description & Instructions</span>
                      <div className="text-xs bg-slate-50/30 p-3 rounded-lg border border-slate-200/60 max-h-[250px] overflow-y-auto whitespace-pre-wrap text-slate-700 leading-relaxed">
                        {cleanDescription || "No instructions provided."}
                      </div>
                    </div>
                  )}

                  {/* Status details */}
                  {sub ? (
                    <div className="bg-emerald-50/40 p-3 rounded-lg border border-emerald-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-800">Child has submitted this assignment.</span>
                      <Button 
                        size="sm" 
                        className="bg-emerald-700 hover:bg-emerald-800 h-8 text-xs font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailOpen(false);
                          openViewDialog(viewingAssignment);
                        }}
                      >
                        View Submission & Grades
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-amber-50/40 p-3 rounded-lg border border-amber-100 text-xs font-semibold text-amber-800">
                      Child has not submitted this assignment yet.
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
