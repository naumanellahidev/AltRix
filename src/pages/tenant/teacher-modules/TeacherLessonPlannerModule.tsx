import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Clock,
  Check,
  FileDown,
  UserPlus,
  User,
  Users,
  AlertCircle,
  Info,
  GraduationCap,
  ChevronRight as ChevronRightIcon,
  Presentation,
  ListTodo,
  HelpCircle,
  Table,
  Edit3,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CurriculumPlannerAI } from "@/components/ai";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient } from "@/lib/api-client";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface LessonPlan {
  id: string;
  plan_date: string;
  period_label: string;
  topic: string;
  objectives: string | null;
  resources: string | null;
  notes: string | null;
  status: string;
  class_section_id: string;
  subject_id: string | null;
  curriculum_type?: string | null;
  grade_level?: string | null;
  lesson_duration_minutes?: number | null;
  bloom_levels?: string[] | null;
  ai_plan_data?: any | null;
  ai_slide_script?: any | null;
  ai_quiz_data?: any | null;
  ai_model_used?: string | null;
}

export function TeacherLessonPlannerModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedSection, setSelectedSection] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);

  // Form state
  const [formDate, setFormDate] = useState<string>("");
  const [formPeriod, setFormPeriod] = useState<string>("");
  const [formTopic, setFormTopic] = useState<string>("");
  const [formObjectives, setFormObjectives] = useState<string>("");
  const [formResources, setFormResources] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formSubject, setFormSubject] = useState<string>("");
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);

  // AI plan states for edit view
  const [formAiPlanData, setFormAiPlanData] = useState<any>(null);
  const [formAiSlideScript, setFormAiSlideScript] = useState<any>(null);
  const [formAiQuizData, setFormAiQuizData] = useState<any>(null);
  const [editingPlanCurriculumType, setEditingPlanCurriculumType] = useState<string | null>(null);
  const [editingPlanGradeLevel, setEditingPlanGradeLevel] = useState<string | null>(null);
  const [editingPlanDuration, setEditingPlanDuration] = useState<number | null>(null);
  const [editingPlanBlooms, setEditingPlanBlooms] = useState<string[] | null>(null);
  const [activeTab, setActiveTab] = useState("plan");
  const [isEditingAi, setIsEditingAi] = useState(false);
  const [assigningQuiz, setAssigningQuiz] = useState(false);

  const weekDays = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (schoolId && user?.id) {
      loadSections();
    }
  }, [schoolId, user?.id]);

  useEffect(() => {
    if (selectedSection && schoolId) {
      loadPlans();
      loadSubjects();
    }
  }, [selectedSection, weekStart, schoolId]);

  const loadSections = async () => {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("class_section_id")
      .eq("school_id", schoolId!)
      .eq("teacher_user_id", user!.id);

    const sectionIds = [...new Set(assignments?.map((a) => a.class_section_id) || [])];
    if (sectionIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data: secs } = await supabase
      .from("class_sections")
      .select("id, name, class_id")
      .in("id", sectionIds);

    const { data: classes } = await supabase.from("academic_classes").select("id, name");
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

  const loadSubjects = async () => {
    const { data } = await supabase
      .from("class_section_subjects")
      .select("subject_id, subjects(id, name)")
      .eq("school_id", schoolId!)
      .eq("class_section_id", selectedSection);

    setSubjects(data?.map((d: any) => d.subjects).filter(Boolean) || []);
  };

  const loadPlans = async () => {
    const weekEnd = addDays(weekStart, 5);
    const { data } = await supabase
      .from("lesson_plans")
      .select("*")
      .eq("school_id", schoolId!)
      .eq("teacher_user_id", user!.id)
      .eq("class_section_id", selectedSection)
      .gte("plan_date", format(weekStart, "yyyy-MM-dd"))
      .lte("plan_date", format(weekEnd, "yyyy-MM-dd"));

    setPlans((data as LessonPlan[]) || []);
  };

  const openNewPlan = (date: Date) => {
    setEditingPlan(null);
    setFormDate(format(date, "yyyy-MM-dd"));
    setFormPeriod("");
    setFormTopic("");
    setFormObjectives("");
    setFormResources("");
    setFormNotes("");
    setFormSubject("");
    setFormAiPlanData(null);
    setFormAiSlideScript(null);
    setFormAiQuizData(null);
    setEditingPlanCurriculumType(null);
    setEditingPlanGradeLevel(null);
    setEditingPlanDuration(null);
    setEditingPlanBlooms([]);
    setActiveTab("plan");
    setIsEditingAi(false);
    setDialogOpen(true);
  };

  const openEditPlan = (plan: LessonPlan) => {
    setEditingPlan(plan);
    setFormDate(plan.plan_date);
    setFormPeriod(plan.period_label);
    setFormTopic(plan.topic);
    setFormObjectives(plan.objectives || "");
    setFormResources(plan.resources || "");
    setFormNotes(plan.notes || "");
    setFormSubject(plan.subject_id || "");
    setFormAiPlanData(plan.ai_plan_data || null);
    setFormAiSlideScript(plan.ai_slide_script || null);
    setFormAiQuizData(plan.ai_quiz_data || null);
    setEditingPlanCurriculumType(plan.curriculum_type || null);
    setEditingPlanGradeLevel(plan.grade_level || null);
    setEditingPlanDuration(plan.lesson_duration_minutes || null);
    setEditingPlanBlooms(plan.bloom_levels || []);
    setActiveTab("plan");
    setIsEditingAi(false);
    setDialogOpen(true);
  };

  const savePlan = async () => {
    if (!formTopic.trim()) {
      toast.error("Topic is required");
      return;
    }

    setSaving(true);
    const payload = {
      school_id: schoolId!,
      teacher_user_id: user!.id,
      class_section_id: selectedSection,
      plan_date: formDate,
      period_label: formPeriod,
      topic: formTopic,
      objectives: formObjectives || null,
      resources: formResources || null,
      notes: formNotes || null,
      subject_id: formSubject || null,
      status: "draft",
      ai_plan_data: formAiPlanData,
      ai_slide_script: formAiSlideScript,
      ai_quiz_data: formAiQuizData,
      curriculum_type: editingPlanCurriculumType,
      grade_level: editingPlanGradeLevel,
      lesson_duration_minutes: editingPlanDuration,
      bloom_levels: editingPlanBlooms,
    };

    if (editingPlan) {
      const { error } = await supabase
        .from("lesson_plans")
        .update(payload)
        .eq("id", editingPlan.id);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Lesson plan updated");
        setDialogOpen(false);
        loadPlans();
      }
    } else {
      const { error } = await supabase.from("lesson_plans").insert(payload);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Lesson plan created");
        setDialogOpen(false);
        loadPlans();
      }
    }
    setSaving(false);
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from("lesson_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Lesson plan deleted");
      loadPlans();
    }
  };

  const updateAiPlanField = (stateKey: "ai_plan_data" | "ai_slide_script" | "ai_quiz_data", path: string[], value: any) => {
    if (stateKey === "ai_plan_data") {
      setFormAiPlanData((prev: any) => {
        if (!prev) return prev;
        if (path.length === 0) return value;
        const copy = JSON.parse(JSON.stringify(prev));
        let current = copy;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return copy;
      });
    } else if (stateKey === "ai_slide_script") {
      setFormAiSlideScript((prev: any) => {
        if (!prev) return prev;
        if (path.length === 0) return value;
        const copy = JSON.parse(JSON.stringify(prev));
        let current = copy;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return copy;
      });
    } else if (stateKey === "ai_quiz_data") {
      setFormAiQuizData((prev: any) => {
        if (!prev) return prev;
        if (path.length === 0) return value;
        const copy = JSON.parse(JSON.stringify(prev));
        let current = copy;
        for (let i = 0; i < path.length - 1; i++) {
          current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        return copy;
      });
    }
  };

  const handleAssignQuiz = async () => {
    if (!formAiQuizData || !selectedSection) return;

    setAssigningQuiz(true);
    try {
      const quizMarkdown = formAiQuizData
        .map((q: any) => {
          const optionsList = (q.options || [])
            .map((opt: string, k: number) => `   ${String.fromCharCode(65 + k)}. ${opt}`)
            .join("\n");
          return `**Q${q.questionNumber}: ${q.question}**\n${optionsList}\n\n*Correct Answer: ${q.correctAnswer}*\n*Explanation: ${q.explanation}*\n`;
        })
        .join("\n---\n\n");

      const payload = {
        class_section_id: selectedSection,
        title: `Quiz: ${formAiPlanData?.title || formTopic}`,
        description: `Please complete the following quiz questions generated for our topic:\n\n${quizMarkdown}`,
        due_date: formDate,
        max_marks: 5.0,
      };

      const response = await apiClient.post("/assignments", payload);
      if (response.status === 200 || response.status === 201) {
        toast.success("Quiz successfully assigned as a class assignment!");
      } else {
        throw new Error("Failed to assign quiz");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to assign quiz to class");
    } finally {
      setAssigningQuiz(false);
    }
  };

  const handleExportPDF = () => {
    if (!formAiPlanData) return;

    try {
      const doc = new jsPDF();
      let y = 20;

      // Title & Header Info
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); 
      doc.text("AltRix AI Lesson Plan", 20, y);
      y += 10;

      doc.setFontSize(14);
      doc.setTextColor(71, 85, 105); 
      doc.text(`Topic: ${formAiPlanData?.title || formTopic}`, 20, y);
      y += 7;
      doc.text(`Curriculum: ${editingPlanCurriculumType || "N/A"} | Grade: ${editingPlanGradeLevel || "N/A"}`, 20, y);
      y += 7;
      doc.text(`Duration: ${editingPlanDuration || 45} minutes | Bloom's levels: ${(editingPlanBlooms || []).join(", ")}`, 20, y);
      y += 15;

      // Objectives
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59); 
      doc.text("Learning Objectives", 20, y);
      y += 8;
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); 
      (formAiPlanData?.learningObjectives || []).forEach((obj: string) => {
        doc.text(`• ${obj}`, 20, y);
        y += 6;
      });
      y += 10;

      // Schedule Table Title
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text("Minute-by-Minute Lesson Schedule", 20, y);
      y += 8;

      doc.setFontSize(10);
      (formAiPlanData?.schedule || []).forEach((sch: any) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.setFont("Helvetica", "bold");
        doc.text(`${sch.timeRange} - ${sch.phase}`, 20, y);
        y += 5;
        doc.setFont("Helvetica", "normal");
        const actionText = `Teacher: ${sch.teacherAction}\nStudent: ${sch.studentAction}`;
        const splitText = doc.splitTextToSize(actionText, 170);
        doc.text(splitText, 25, y);
        y += (splitText.length * 5) + 5;
      });

      // Add New Page for Slides Script
      if (formAiSlideScript && formAiSlideScript.length > 0) {
        doc.addPage();
        y = 20;
        doc.setFontSize(16);
        doc.setFont("Helvetica", "bold");
        doc.text("Classroom Slides Presentation Script", 20, y);
        y += 10;

        doc.setFontSize(10);
        formAiSlideScript.forEach((slide: any) => {
          if (y > 250) {
            doc.addPage();
            y = 20;
          }
          doc.setFont("Helvetica", "bold");
          doc.text(`Slide ${slide.slideNumber}: ${slide.title}`, 20, y);
          y += 5;
          doc.setFont("Helvetica", "normal");
          
          doc.text("Key Points:", 22, y);
          y += 5;
          (slide.bulletPoints || []).forEach((bp: string) => {
            doc.text(`- ${bp}`, 25, y);
            y += 5;
          });
          
          y += 2;
          doc.setFont("Helvetica", "oblique");
          doc.text(`Visual Suggestion: ${slide.visualSuggestion}`, 22, y);
          y += 5;
          
          doc.setFont("Helvetica", "normal");
          const notesSplit = doc.splitTextToSize(`Speaker Notes: ${slide.speakerNotes}`, 160);
          doc.text(notesSplit, 22, y);
          y += (notesSplit.length * 5) + 8;
        });
      }

      doc.save(`Lesson_Plan_${formTopic.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PDF document");
    }
  };

  const getPlansForDay = (date: Date) => {
    return plans.filter((p) => isSameDay(new Date(p.plan_date), date));
  };

  if (loading) {
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
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-lg font-medium">No Assigned Sections</p>
          <p className="text-sm text-muted-foreground">
            You need to be assigned to sections to create lesson plans.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Select value={selectedSection} onValueChange={setSelectedSection}>
            <SelectTrigger className="w-full sm:w-[200px]">
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

          <Button
            onClick={() => setAiPlannerOpen(true)}
            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(59,130,246,0.25)] transition-all"
          >
            <Sparkles className="h-4 w-4" />
            AI Lesson Plan
          </Button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[150px] sm:min-w-[180px] text-center">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 5), "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {weekDays.map((day) => {
          const dayPlans = getPlansForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <Card key={day.toISOString()} className={isToday ? "ring-2 ring-primary" : ""}>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{format(day, "EEE")}</span>
                  <span className="text-muted-foreground font-normal">{format(day, "d")}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {dayPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-lg bg-accent p-2 cursor-pointer hover:bg-accent/80 transition-colors"
                    onClick={() => openEditPlan(plan)}
                  >
                    {plan.period_label && (
                      <Badge variant="secondary" className="text-xs mb-1">
                        {plan.period_label}
                      </Badge>
                    )}
                    <p className="text-xs font-medium line-clamp-2">{plan.topic}</p>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => openNewPlan(day)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Plan Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl lg:max-w-6xl w-[92vw] max-h-[90vh] h-[88vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-slate-200 text-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.15)]">
          <DialogHeader className="p-6 pb-4 border-b border-slate-200 bg-white flex flex-row items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                {editingPlan ? "Edit Lesson Plan" : "New Lesson Plan"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Plan your lesson with topic, objectives, and resources
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 h-full">
            {/* LEFT COLUMN: Metadata inputs */}
            <div className="lg:col-span-4 border-r border-slate-200 p-6 overflow-y-auto space-y-4 bg-slate-100/40 flex flex-col justify-between h-full shrink-0">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold text-xs">Date</Label>
                    <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="bg-white border-slate-200 text-slate-900" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold text-xs">Period (optional)</Label>
                    <Input
                      value={formPeriod}
                      onChange={(e) => setFormPeriod(e.target.value)}
                      placeholder="e.g., Period 1"
                      className="bg-white border-slate-200 text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs">Subject (optional)</Label>
                  <Select value={formSubject} onValueChange={setFormSubject}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold text-xs">Topic *</Label>
                  <Input
                    value={formTopic}
                    onChange={(e) => setFormTopic(e.target.value)}
                    placeholder="What will you teach?"
                    className="bg-white border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              {/* Action Buttons for Left Column */}
              <div className="flex justify-between pt-4 border-t border-slate-200 mt-6 shrink-0">
                {editingPlan && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      deletePlan(editingPlan.id);
                      setDialogOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={savePlan} disabled={saving} className="bg-blue-600 hover:bg-blue-500 text-white">
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: AI or Manual Detail display */}
            <div className="lg:col-span-8 overflow-hidden flex flex-col h-full bg-white">
              {formAiPlanData ? (
                // Render the 5 tabs for AI plan data
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  {/* Action Bar */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200/60 font-semibold text-xs">
                        AI Curriculum Plan
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setIsEditingAi(!isEditingAi)}
                        variant="outline"
                        size="sm"
                        className={`border-slate-200 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1.5 transition-all ${
                          isEditingAi ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white"
                        }`}
                      >
                        <Edit3 className="h-4 w-4" />
                        {isEditingAi ? "View Mode" : "Edit Plan"}
                      </Button>
                      <Button
                        onClick={handleExportPDF}
                        variant="outline"
                        size="sm"
                        className="bg-white border-slate-200 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1.5"
                      >
                        <FileDown className="h-4 w-4" />
                        Download PDF
                      </Button>
                      <Button
                        onClick={handleAssignQuiz}
                        disabled={assigningQuiz}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5 font-semibold border-none"
                      >
                        {assigningQuiz ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Assigning...
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4" />
                            Assign Quiz
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Tabs Component */}
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="bg-slate-50 border-b border-slate-200 justify-start h-11 p-0 rounded-none w-full flex overflow-x-auto scrollbar-none shrink-0">
                      <TabsTrigger
                        value="plan"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-4 gap-1.5 text-xs font-semibold"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Lesson Plan
                      </TabsTrigger>
                      <TabsTrigger
                        value="slides"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-4 gap-1.5 text-xs font-semibold"
                      >
                        <Presentation className="h-3.5 w-3.5" />
                        Slide Scripts
                      </TabsTrigger>
                      <TabsTrigger
                        value="activities"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-4 gap-1.5 text-xs font-semibold"
                      >
                        <ListTodo className="h-3.5 w-3.5" />
                        Activities
                      </TabsTrigger>
                      <TabsTrigger
                        value="quiz"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-4 gap-1.5 text-xs font-semibold"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Quiz questions
                      </TabsTrigger>
                      <TabsTrigger
                        value="rubric"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-4 gap-1.5 text-xs font-semibold"
                      >
                        <Table className="h-3.5 w-3.5" />
                        Rubric
                      </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="flex-1 p-6 bg-slate-50/30">
                      {/* TAB 1: Lesson Plan */}
                      <TabsContent value="plan" className="space-y-6 mt-0">
                        <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-5 shadow-sm">
                          <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                            <div className="w-full">
                              {isEditingAi ? (
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-slate-500 font-bold uppercase">Lesson Title</Label>
                                  <Input
                                    value={formAiPlanData.title || ""}
                                    onChange={(e) => updateAiPlanField("ai_plan_data", ["title"], e.target.value)}
                                    className="bg-white border-slate-200 text-slate-900 w-full font-bold text-base focus:border-blue-500 focus:ring-blue-200"
                                  />
                                </div>
                              ) : (
                                <>
                                  <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">
                                    {formAiPlanData.title}
                                  </h2>
                                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-medium">
                                    <Sparkles className="h-3 w-3 text-blue-500" />
                                    Pedagogical roadmap structured for curriculum objectives
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {/* Learning Objectives Column */}
                            <div className="md:col-span-2 bg-slate-50/50 border border-slate-100 p-4 rounded-xl space-y-3">
                              <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
                                <GraduationCap className="h-4.5 w-4.5 text-blue-600" />
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                  Learning Objectives
                                </h4>
                              </div>
                              {isEditingAi ? (
                                <div className="space-y-2">
                                  {(formAiPlanData.learningObjectives || []).map((obj: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <Input
                                        value={obj}
                                        onChange={(e) => {
                                          const newObjectives = [...formAiPlanData.learningObjectives];
                                          newObjectives[i] = e.target.value;
                                          updateAiPlanField("ai_plan_data", ["learningObjectives"], newObjectives);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-xs"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-rose-500 hover:text-rose-600 shrink-0 h-8 w-8"
                                        onClick={() => {
                                          const newObjectives = formAiPlanData.learningObjectives.filter((_: any, idx: number) => idx !== i);
                                          updateAiPlanField("ai_plan_data", ["learningObjectives"], newObjectives);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-[10px] border-slate-200 text-slate-600 mt-1 hover:bg-slate-100 bg-white"
                                    onClick={() => {
                                      const newObjectives = [...(formAiPlanData.learningObjectives || []), "New learning goal"];
                                      updateAiPlanField("ai_plan_data", ["learningObjectives"], newObjectives);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" /> Add Objective
                                  </Button>
                                </div>
                              ) : (
                                <ul className="space-y-2">
                                  {(formAiPlanData.learningObjectives || []).map((obj: string, i: number) => (
                                    <li key={i} className="text-xs text-slate-655 flex items-start gap-2">
                                      <span className="h-4 w-4 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                                      </span>
                                      <span className="leading-relaxed">{obj}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Prerequisites and Materials Column */}
                            <div className="space-y-3">
                              {/* Prerequisites */}
                              <div className="bg-slate-50/50 border border-slate-100 p-3.5 rounded-xl space-y-2">
                                <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-1.5">
                                  <BookOpen className="h-4 w-4 text-indigo-600" />
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                    Prior Knowledge
                                  </h4>
                                </div>
                                {isEditingAi ? (
                                  <Textarea
                                    value={(formAiPlanData.priorKnowledge || []).join(", ")}
                                    onChange={(e) => updateAiPlanField("ai_plan_data", ["priorKnowledge"], e.target.value.split(",").map(s => s.trim()))}
                                    placeholder="Separated by commas"
                                    className="bg-white border-slate-200 text-slate-900 text-xs min-h-[45px]"
                                  />
                                ) : (
                                  <p className="text-xs text-slate-655 leading-relaxed font-medium">
                                    {(formAiPlanData.priorKnowledge || []).join(", ") || "None specified"}
                                  </p>
                                )}
                              </div>

                              {/* Materials */}
                              <div className="bg-slate-50/50 border border-slate-100 p-3.5 rounded-xl space-y-2">
                                <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-1.5">
                                  <ListTodo className="h-4 w-4 text-blue-600" />
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                    Materials Needed
                                  </h4>
                                </div>
                                {isEditingAi ? (
                                  <Textarea
                                    value={(formAiPlanData.materialsNeeded || []).join(", ")}
                                    onChange={(e) => updateAiPlanField("ai_plan_data", ["materialsNeeded"], e.target.value.split(",").map(s => s.trim()))}
                                    placeholder="Separated by commas"
                                    className="bg-white border-slate-200 text-slate-900 text-xs min-h-[45px]"
                                  />
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {(formAiPlanData.materialsNeeded || []).map((mat: string, i: number) => (
                                      <Badge key={i} variant="outline" className="bg-blue-50/50 border-blue-100/60 text-blue-700 font-semibold px-2 py-0.5 rounded text-[10px]">
                                        {mat}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Schedule Timeline */}
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4.5 w-4.5 text-blue-600" />
                            <h3 className="text-sm font-bold text-slate-800">
                              Minute-by-Minute Classroom Roadmap
                            </h3>
                          </div>
                          <div className="relative border-l-2 border-blue-200 pl-4 ml-2 space-y-4">
                            {(formAiPlanData.schedule || []).map((item: any, i: number) => (
                              <div key={i} className="relative">
                                <div className="absolute -left-[24px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white flex items-center justify-center z-10">
                                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                </div>
                                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2.5 shadow-sm hover:shadow-md transition-shadow">
                                  {isEditingAi ? (
                                    <div className="space-y-2.5">
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-[9px] text-slate-550 uppercase font-bold">Time Range</Label>
                                          <Input
                                            value={item.timeRange}
                                            onChange={(e) => {
                                              const newSchedule = [...formAiPlanData.schedule];
                                              newSchedule[i].timeRange = e.target.value;
                                              updateAiPlanField("ai_plan_data", ["schedule"], newSchedule);
                                            }}
                                            className="bg-white border-slate-200 text-slate-900 text-xs h-8"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-[9px] text-slate-550 uppercase font-bold">Phase</Label>
                                          <Input
                                            value={item.phase}
                                            onChange={(e) => {
                                              const newSchedule = [...formAiPlanData.schedule];
                                              newSchedule[i].phase = e.target.value;
                                              updateAiPlanField("ai_plan_data", ["schedule"], newSchedule);
                                            }}
                                            className="bg-white border-slate-200 text-slate-900 text-xs h-8"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <Label className="text-[9px] text-slate-550 uppercase font-bold">Activity</Label>
                                        <Input
                                          value={item.activity}
                                          onChange={(e) => {
                                            const newSchedule = [...formAiPlanData.schedule];
                                            newSchedule[i].activity = e.target.value;
                                            updateAiPlanField("ai_plan_data", ["schedule"], newSchedule);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs h-8"
                                        />
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-[9px] text-slate-550 uppercase font-bold">Teacher Action</Label>
                                          <Textarea
                                            value={item.teacherAction}
                                            onChange={(e) => {
                                              const newSchedule = [...formAiPlanData.schedule];
                                              newSchedule[i].teacherAction = e.target.value;
                                              updateAiPlanField("ai_plan_data", ["schedule"], newSchedule);
                                            }}
                                            className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px]"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-[9px] text-slate-550 uppercase font-bold">Student Action</Label>
                                          <Textarea
                                            value={item.studentAction}
                                            onChange={(e) => {
                                              const newSchedule = [...formAiPlanData.schedule];
                                              newSchedule[i].studentAction = e.target.value;
                                              updateAiPlanField("ai_plan_data", ["schedule"], newSchedule);
                                            }}
                                            className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px]"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100/60 px-2 py-0.5 rounded font-mono">
                                          {item.timeRange}
                                        </span>
                                        <span className="text-xs font-bold text-slate-800">
                                          {item.phase}
                                        </span>
                                      </div>
                                      <div className="text-xs text-slate-700 font-semibold bg-slate-50/50 p-2 rounded border border-slate-100/60">
                                        {item.activity}
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                                        <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-xl space-y-1">
                                          <div className="flex items-center gap-1 text-blue-800 font-bold uppercase tracking-wider text-[9px]">
                                            <User className="h-3.5 w-3.5 text-blue-600" />
                                            <span>Teacher Action:</span>
                                          </div>
                                          <p className="text-slate-655 leading-relaxed font-medium">
                                            {item.teacherAction}
                                          </p>
                                        </div>
                                        <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-xl space-y-1">
                                          <div className="flex items-center gap-1 text-indigo-850 font-bold uppercase tracking-wider text-[9px]">
                                            <Users className="h-3.5 w-3.5 text-indigo-600" />
                                            <span>Student Action:</span>
                                          </div>
                                          <p className="text-slate-655 leading-relaxed font-medium">
                                            {item.studentAction}
                                          </p>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Homework & Differentiation */}
                        <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
                          <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                            <GraduationCap className="h-5 w-5 text-blue-600" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              Homework & Pedagogy Differentiation
                            </h3>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-500 font-bold uppercase">Homework Suggestion</Label>
                            {isEditingAi ? (
                              <Textarea
                                value={formAiPlanData.homeworkSuggestion || ""}
                                onChange={(e) => updateAiPlanField("ai_plan_data", ["homeworkSuggestion"], e.target.value)}
                                className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px]"
                              />
                            ) : (
                              <p className="text-xs text-slate-700 font-medium bg-slate-50 border border-slate-150/60 p-3 rounded-lg leading-relaxed">
                                {formAiPlanData.homeworkSuggestion}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                            <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Advanced Achievers</span>
                              {isEditingAi ? (
                                <Textarea
                                  value={formAiPlanData.differentiationStrategies?.advanced || ""}
                                  onChange={(e) => updateAiPlanField("ai_plan_data", ["differentiationStrategies", "advanced"], e.target.value)}
                                  className="bg-white border-slate-200 text-slate-900 text-xs mt-1.5 min-h-[70px]"
                                />
                              ) : (
                                <p className="text-[11px] text-slate-655 mt-0.5 leading-relaxed">
                                  {formAiPlanData.differentiationStrategies?.advanced}
                                </p>
                              )}
                            </div>
                            <div className="bg-amber-50/50 border border-amber-100 p-3.5 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-amber-850 uppercase tracking-wider">Support / Struggling</span>
                              {isEditingAi ? (
                                <Textarea
                                  value={formAiPlanData.differentiationStrategies?.struggling || ""}
                                  onChange={(e) => updateAiPlanField("ai_plan_data", ["differentiationStrategies", "struggling"], e.target.value)}
                                  className="bg-white border-slate-200 text-slate-900 text-xs mt-1.5 min-h-[70px]"
                                />
                              ) : (
                                <p className="text-[11px] text-slate-655 mt-0.5 leading-relaxed">
                                  {formAiPlanData.differentiationStrategies?.struggling}
                                </p>
                              )}
                            </div>
                            <div className="bg-blue-50/50 border border-blue-100 p-3.5 rounded-xl space-y-1">
                              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">ELL Scaffolding</span>
                              {isEditingAi ? (
                                <Textarea
                                  value={formAiPlanData.differentiationStrategies?.ell || ""}
                                  onChange={(e) => updateAiPlanField("ai_plan_data", ["differentiationStrategies", "ell"], e.target.value)}
                                  className="bg-white border-slate-200 text-slate-900 text-xs mt-1.5 min-h-[70px]"
                                />
                              ) : (
                                <p className="text-[11px] text-slate-655 mt-0.5 leading-relaxed">
                                  {formAiPlanData.differentiationStrategies?.ell}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      {/* TAB 2: Slide Scripts */}
                      <TabsContent value="slides" className="space-y-5 mt-0">
                        <div className="space-y-1 border-b border-slate-100 pb-2">
                          <h2 className="text-lg font-bold text-slate-800">Presentation Slide Decks & Speaker Scripts</h2>
                          <p className="text-xs text-slate-400">
                            Slide content previews, suggested diagram visuals, and full word-for-word teacher scripts.
                          </p>
                        </div>

                        <div className="space-y-5">
                          {(formAiSlideScript || []).map((slide: any, i: number) => (
                            <div key={i} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3.5 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-mono font-bold px-2 py-0.5 text-xs rounded shadow-sm">
                                    Slide {slide.slideNumber}
                                  </Badge>
                                  {isEditingAi ? (
                                    <Input
                                      value={slide.title}
                                      onChange={(e) => {
                                        const newSlides = [...formAiSlideScript];
                                        newSlides[i].title = e.target.value;
                                        updateAiPlanField("ai_slide_script", [], newSlides);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs w-60 h-7 font-bold"
                                    />
                                  ) : (
                                    <span className="text-sm font-bold text-slate-850">
                                      {slide.title}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                {/* Slide Preview Screen */}
                                <div className="md:col-span-5 flex flex-col gap-2">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Slide View (What students see):
                                  </span>
                                  
                                  <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 text-white rounded-xl border border-slate-700/80 p-4 aspect-[4/3] flex flex-col justify-between relative overflow-hidden select-none">
                                    <div className="absolute top-0 left-0 w-full h-1/2 bg-white/[0.02] transform -skew-y-6 origin-top-left pointer-events-none" />
                                    
                                    <div className="space-y-2.5">
                                      <h3 className="font-bold text-xs tracking-tight text-white border-b border-white/10 pb-1.5 flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                        {slide.title}
                                      </h3>
                                      
                                      {isEditingAi ? (
                                        <Textarea
                                          value={(slide.bulletPoints || []).join("\n")}
                                          onChange={(e) => {
                                            const newSlides = [...formAiSlideScript];
                                            newSlides[i].bulletPoints = e.target.value.split("\n").filter(Boolean);
                                            updateAiPlanField("ai_slide_script", [], newSlides);
                                          }}
                                          placeholder="Each line represents a bullet point"
                                          className="bg-white/5 border-white/10 text-white text-[9px] min-h-[75px] placeholder-white/35"
                                        />
                                      ) : (
                                        <ul className="space-y-1.5 text-[9.5px] text-slate-200/90 pl-2.5 list-disc leading-relaxed">
                                          {(slide.bulletPoints || []).map((bp: string, k: number) => (
                                            <li key={k}>{bp}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center justify-between border-t border-white/5 pt-1.5 text-[7px] text-slate-400 font-mono">
                                      <span>AltRix Classroom Deck</span>
                                      <span>Page {slide.slideNumber}</span>
                                    </div>
                                  </div>

                                  {/* Visual suggestion */}
                                  <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                                    <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider block">
                                      Suggested Diagram / Visual asset:
                                    </span>
                                    {isEditingAi ? (
                                      <Input
                                        value={slide.visualSuggestion}
                                        onChange={(e) => {
                                          const newSlides = [...formAiSlideScript];
                                          newSlides[i].visualSuggestion = e.target.value;
                                          updateAiPlanField("ai_slide_script", [], newSlides);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-[9px] h-6 mt-1"
                                      />
                                    ) : (
                                      <p className="text-[10px] text-slate-550 italic leading-relaxed">
                                        {slide.visualSuggestion}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Script speech bubble */}
                                <div className="md:col-span-7 flex flex-col">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Teacher Teleprompter Script:
                                  </span>
                                  <div className="flex-1 bg-blue-50/30 border border-blue-100/60 p-4 rounded-xl flex flex-col space-y-2 relative shadow-inner">
                                    <div className="flex items-center gap-1 text-blue-700 border-b border-blue-100/50 pb-1.5 text-[9px] font-bold uppercase tracking-wider">
                                      <Presentation className="h-3.5 w-3.5 text-blue-600" />
                                      <span>Verbatim Explanation Script</span>
                                    </div>
                                    {isEditingAi ? (
                                      <Textarea
                                        value={slide.speakerNotes}
                                        onChange={(e) => {
                                          const newSlides = [...formAiSlideScript];
                                          newSlides[i].speakerNotes = e.target.value;
                                          updateAiPlanField("ai_slide_script", [], newSlides);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-xs font-serif min-h-[130px] focus:border-blue-500"
                                      />
                                    ) : (
                                      <p className="text-slate-700 leading-relaxed font-serif italic text-xs p-2 bg-white/50 border border-slate-100/40 rounded-lg">
                                        "{slide.speakerNotes}"
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>

                      {/* TAB 3: Activities */}
                      <TabsContent value="activities" className="space-y-5 mt-0">
                        <div className="space-y-1 border-b border-slate-100 pb-2">
                          <h2 className="text-lg font-bold text-slate-800">Interactive Student Activities</h2>
                          <p className="text-xs text-slate-400">
                            Engaging class discussions, hands-on lab experiments, and structured group assignments.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(formAiPlanData.activities || []).map((act: any, i: number) => (
                            <div key={i} className="bg-white border border-slate-200 p-4.5 rounded-2xl flex flex-col justify-between space-y-3 shadow-sm hover:shadow-md transition-all">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  {isEditingAi ? (
                                    <Input
                                      value={act.name}
                                      onChange={(e) => {
                                        const newActs = [...formAiPlanData.activities];
                                        newActs[i].name = e.target.value;
                                        updateAiPlanField("ai_plan_data", ["activities"], newActs);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs font-bold w-40 h-7"
                                    />
                                  ) : (
                                    <h3 className="text-xs font-bold text-slate-850 flex items-center gap-1">
                                      <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                                      {act.name}
                                    </h3>
                                  )}
                                  {isEditingAi ? (
                                    <Input
                                      value={act.type}
                                      onChange={(e) => {
                                        const newActs = [...formAiPlanData.activities];
                                        newActs[i].type = e.target.value;
                                        updateAiPlanField("ai_plan_data", ["activities"], newActs);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-[9px] w-24 h-5"
                                    />
                                  ) : (
                                    <Badge variant="outline" className="bg-indigo-50/65 text-indigo-750 border-indigo-155 px-2 py-0.5 rounded text-[10px] font-semibold">
                                      {act.type}
                                    </Badge>
                                  )}
                                </div>
                                {isEditingAi ? (
                                  <Textarea
                                    value={act.description}
                                    onChange={(e) => {
                                      const newActs = [...formAiPlanData.activities];
                                      newActs[i].description = e.target.value;
                                      updateAiPlanField("ai_plan_data", ["activities"], newActs);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px]"
                                  />
                                ) : (
                                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                    {act.description}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
                                {isEditingAi ? (
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    <Input
                                      value={act.duration}
                                      onChange={(e) => {
                                        const newActs = [...formAiPlanData.activities];
                                        newActs[i].duration = e.target.value;
                                        updateAiPlanField("ai_plan_data", ["activities"], newActs);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-[9px] w-16 h-5"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-slate-700 flex items-center gap-1 font-mono font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded shadow-sm">
                                    <Clock className="h-3 w-3 text-slate-500" />
                                    {act.duration}
                                  </span>
                                )}
                                {isEditingAi ? (
                                  <Input
                                    value={act.materials}
                                    onChange={(e) => {
                                      const newActs = [...formAiPlanData.activities];
                                      newActs[i].materials = e.target.value;
                                      updateAiPlanField("ai_plan_data", ["activities"], newActs);
                                    }}
                                    placeholder="Required materials"
                                    className="bg-white border-slate-200 text-slate-900 text-[9px] w-28 h-5"
                                  />
                                ) : (
                                  <span className="text-slate-550 italic bg-blue-50/30 border border-blue-50/50 px-2 py-0.5 rounded font-medium">
                                    Supplies: {act.materials || "Standard Supplies"}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>

                      {/* TAB 4: Quiz */}
                      <TabsContent value="quiz" className="space-y-5 mt-0">
                        <div className="space-y-1 border-b border-slate-100 pb-2">
                          <h2 className="text-lg font-bold text-slate-800">Formative Assessment Quiz</h2>
                          <p className="text-xs text-slate-400">
                            Multiple choice questions generated to evaluate class understanding.
                          </p>
                        </div>

                        <div className="space-y-4">
                          {(formAiQuizData || []).map((q: any, i: number) => (
                            <div key={i} className="bg-white border border-slate-200 p-4.5 rounded-2xl space-y-3 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="text-xs font-bold text-slate-850">
                                  Question {q.questionNumber}
                                </span>
                                {isEditingAi ? (
                                  <Input
                                    value={q.bloomLevel}
                                    onChange={(e) => {
                                      const newQuiz = [...formAiQuizData];
                                      newQuiz[i].bloomLevel = e.target.value;
                                      updateAiPlanField("ai_quiz_data", [], newQuiz);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-[9px] w-24 h-5"
                                  />
                                ) : (
                                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200/60 font-semibold px-2 py-0.5 rounded text-[10px]">
                                    Bloom: {q.bloomLevel}
                                  </Badge>
                                )}
                              </div>

                              {isEditingAi ? (
                                <Input
                                  value={q.question}
                                  onChange={(e) => {
                                    const newQuiz = [...formAiQuizData];
                                    newQuiz[i].question = e.target.value;
                                    updateAiPlanField("ai_quiz_data", [], newQuiz);
                                  }}
                                  className="bg-white border-slate-200 text-slate-900 text-xs focus:ring-blue-200 font-medium"
                                />
                              ) : (
                                <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                                  {q.question}
                                </p>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                                {(q.options || []).map((opt: string, k: number) => {
                                  const optionLetter = String.fromCharCode(65 + k); 
                                  const isCorrect = optionLetter === q.correctAnswer;
                                  return (
                                    <div
                                      key={k}
                                      className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 transition-all ${
                                        isCorrect
                                          ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 font-semibold shadow-[0_1px_5px_rgba(16,185,129,0.08)]"
                                          : "bg-slate-50 border-slate-100 text-slate-600"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 w-full">
                                        <span className={`h-5.5 w-5.5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                          isCorrect
                                            ? "bg-emerald-100 border border-emerald-300 text-emerald-700"
                                            : "bg-white border border-slate-200 text-slate-400"
                                        }`}>
                                          {optionLetter}
                                        </span>
                                        {isEditingAi ? (
                                          <Input
                                            value={opt}
                                            onChange={(e) => {
                                              const newQuiz = [...formAiQuizData];
                                              newQuiz[i].options[k] = e.target.value;
                                              updateAiPlanField("ai_quiz_data", [], newQuiz);
                                            }}
                                            className="bg-white border-slate-200 text-slate-900 text-[10px] h-6"
                                          />
                                        ) : (
                                          <span className="leading-normal">{opt}</span>
                                        )}
                                      </div>
                                      {!isEditingAi && isCorrect && (
                                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {isEditingAi && (
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div className="space-y-1">
                                    <Label className="text-[9px] text-slate-550 uppercase font-bold">Correct Letter (A-D)</Label>
                                    <Input
                                      value={q.correctAnswer}
                                      maxLength={1}
                                      onChange={(e) => {
                                        const newQuiz = [...formAiQuizData];
                                        newQuiz[i].correctAnswer = e.target.value.toUpperCase();
                                        updateAiPlanField("ai_quiz_data", [], newQuiz);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs h-7 w-12"
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100/60 mt-2 text-[10px] flex gap-2">
                                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <span className="text-blue-800 font-bold uppercase tracking-wider block">
                                    Explanation:
                                  </span>
                                  {isEditingAi ? (
                                    <Textarea
                                      value={q.explanation}
                                      onChange={(e) => {
                                        const newQuiz = [...formAiQuizData];
                                        newQuiz[i].explanation = e.target.value;
                                        updateAiPlanField("ai_quiz_data", [], newQuiz);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-[10px] min-h-[45px] w-full"
                                    />
                                  ) : (
                                    <p className="text-slate-705 leading-relaxed font-medium">
                                      {q.explanation}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>

                      {/* TAB 5: Rubric */}
                      <TabsContent value="rubric" className="space-y-5 mt-0">
                        <div className="space-y-1 border-b border-slate-100 pb-2">
                          <h2 className="text-lg font-bold text-slate-800">Performance Grading Rubric</h2>
                          <p className="text-xs text-slate-400">
                            Structured evaluation criteria mapping student competency levels.
                          </p>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-650 font-bold">
                                <th className="p-3 w-1/4 bg-slate-50 text-slate-800 font-bold uppercase tracking-wider">Criteria</th>
                                <th className="p-3 w-1/4 bg-emerald-50/80 text-emerald-850 font-bold uppercase tracking-wider border-l border-emerald-100/50">Excellent</th>
                                <th className="p-3 w-1/4 bg-blue-50/70 text-blue-850 font-bold uppercase tracking-wider border-l border-blue-100/50">Good</th>
                                <th className="p-3 w-1/4 bg-amber-50/70 text-amber-850 font-bold uppercase tracking-wider border-l border-amber-100/50">Developing</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-slate-700">
                              {(formAiPlanData.rubric?.criteria || []).map((crit: any, i: number) => (
                                <tr key={i} className="hover:bg-slate-50/20">
                                  <td className="p-3 font-bold text-slate-800 border-r border-slate-100">
                                    {isEditingAi ? (
                                      <Input
                                        value={crit.name}
                                        onChange={(e) => {
                                          const newCriteria = [...formAiPlanData.rubric.criteria];
                                          newCriteria[i].name = e.target.value;
                                          updateAiPlanField("ai_plan_data", ["rubric", "criteria"], newCriteria);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-[10px] font-bold"
                                      />
                                    ) : (
                                      crit.name
                                    )}
                                  </td>
                                  <td className="p-3 border-r border-slate-100 text-slate-600 font-medium">
                                    {isEditingAi ? (
                                      <Textarea
                                        value={crit.excellent}
                                        onChange={(e) => {
                                          const newCriteria = [...formAiPlanData.rubric.criteria];
                                          newCriteria[i].excellent = e.target.value;
                                          updateAiPlanField("ai_plan_data", ["rubric", "criteria"], newCriteria);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-[10px] min-h-[50px]"
                                      />
                                    ) : (
                                      crit.excellent
                                    )}
                                  </td>
                                  <td className="p-3 border-r border-slate-100 text-slate-600 font-medium">
                                    {isEditingAi ? (
                                      <Textarea
                                        value={crit.good}
                                        onChange={(e) => {
                                          const newCriteria = [...formAiPlanData.rubric.criteria];
                                          newCriteria[i].good = e.target.value;
                                          updateAiPlanField("ai_plan_data", ["rubric", "criteria"], newCriteria);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-[10px] min-h-[50px]"
                                      />
                                    ) : (
                                      crit.good
                                    )}
                                  </td>
                                  <td className="p-3 text-slate-655 font-medium">
                                    {isEditingAi ? (
                                      <Textarea
                                        value={crit.developing}
                                        onChange={(e) => {
                                          const newCriteria = [...formAiPlanData.rubric.criteria];
                                          newCriteria[i].developing = e.target.value;
                                          updateAiPlanField("ai_plan_data", ["rubric", "criteria"], newCriteria);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-[10px] min-h-[50px]"
                                      />
                                    ) : (
                                      crit.developing
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>
                </div>
              ) : (
                // Manual Plan Details
                <div className="flex-1 flex flex-col overflow-hidden h-full">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-semibold text-xs">
                      Manual Plan Details
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                      <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100/80 pb-2">
                          <GraduationCap className="h-5 w-5 text-blue-600" />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                            Learning Objectives
                          </h3>
                        </div>
                        <Textarea
                          value={formObjectives}
                          onChange={(e) => setFormObjectives(e.target.value)}
                          placeholder="What will students learn in this session?"
                          className="bg-white border-slate-200 text-slate-900 min-h-[120px] focus:ring-blue-200 text-sm"
                        />
                      </div>

                      <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100/80 pb-2">
                          <ListTodo className="h-5 w-5 text-blue-600" />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                            Resources & Materials
                          </h3>
                        </div>
                        <Textarea
                          value={formResources}
                          onChange={(e) => setFormResources(e.target.value)}
                          placeholder="List books, worksheets, digital resources, slides, or equipment needed..."
                          className="bg-white border-slate-200 text-slate-900 min-h-[120px] focus:ring-blue-200 text-sm"
                        />
                      </div>

                      <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-2.5 shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100/80 pb-2">
                          <BookOpen className="h-5 w-5 text-blue-600" />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                            Notes & Observations
                          </h3>
                        </div>
                        <Textarea
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          placeholder="Any additional class notes, seating arrangements, or student considerations..."
                          className="bg-white border-slate-200 text-slate-900 min-h-[120px] focus:ring-blue-200 text-sm"
                        />
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CurriculumPlannerAI
        open={aiPlannerOpen}
        onClose={() => setAiPlannerOpen(false)}
        sections={sections}
        subjects={subjects}
        initialSectionId={selectedSection}
        onSaveSuccess={loadPlans}
        schoolId={schoolId}
      />
    </div>
  );
}
