import React, { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  BookOpen,
  Presentation,
  ListTodo,
  HelpCircle,
  Table,
  Save,
  Edit3,
  Loader2,
  Clock,
  Check,
  Plus,
  Trash2,
  FileDown,
  UserPlus,
  User,
  Users,
  AlertCircle,
  Info,
  GraduationCap,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface CurriculumPlannerAIProps {
  open: boolean;
  onClose: () => void;
  sections: Section[];
  subjects: Subject[];
  initialSectionId?: string;
  onSaveSuccess: () => void;
  schoolId: string | null;
}

const BLOOM_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
];

const CURRICULUMS = [
  "Cambridge Secondary",
  "CBSE",
  "IB MYP",
  "National Curriculum (Pakistan)",
  "Federal Board (FBISE)",
  "Punjab Board (BISE)",
  "Aga Khan Board (AKU-EB)",
  "Custom Framework",
];

const GRADES = [
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "O-Levels (Year 10)", "O-Levels (Year 11)", "A-Levels (Year 12)", "A-Levels (Year 13)",
];

const LOADING_PHASES = [
  { progress: 15, label: "Analyzing curriculum standards & framework..." },
  { progress: 35, label: "Formulating alignment-focused learning objectives..." },
  { progress: 55, label: "Structuring minute-by-minute classroom schedule..." },
  { progress: 75, label: "Designing interactive student activities & slide prompts..." },
  { progress: 95, label: "Drafting formative quiz & evaluation rubric..." },
];

export function CurriculumPlannerAI({
  open,
  onClose,
  sections,
  subjects,
  initialSectionId,
  onSaveSuccess,
  schoolId,
}: CurriculumPlannerAIProps) {
  const { user } = useSession();
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [aiData, setAiData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("plan");
  const [isEditing, setIsEditing] = useState(false);
  const [assigningQuiz, setAssigningQuiz] = useState(false);

  // Form states
  const [topic, setTopic] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState(initialSectionId || "");
  const [gradeLevel, setGradeLevel] = useState("Grade 7");
  const [curriculumType, setCurriculumType] = useState("Cambridge Secondary");
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [selectedBlooms, setSelectedBlooms] = useState<string[]>(["Understand", "Apply"]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [planDate, setPlanDate] = useState(new Date().toISOString().split("T")[0]);
  const [periodLabel, setPeriodLabel] = useState("Period 1");
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);

  const toggleBlooms = (level: string) => {
    setSelectedBlooms((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const updateAiField = (path: string[], value: any) => {
    setAiData((prev: any) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      let current = copy;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return copy;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }
    if (!sectionId) {
      toast.error("Please select a class section");
      return;
    }

    setLoading(true);
    setAiData(null);
    setIsEditing(false);
    setLoadingPhase(0);

    const phaseInterval = setInterval(() => {
      setLoadingPhase((p) => {
        if (p < LOADING_PHASES.length - 1) {
          return p + 1;
        }
        return p;
      });
    }, 4500);

    try {
      const selectedSubjectObj = subjects.find((s) => s.id === subjectId);
      const subjectName = selectedSubjectObj ? selectedSubjectObj.name : "General Subject";

      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const response = await fetch(
        `${apiClient.defaults.baseURL || "/api"}/ai/curriculum-planner`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-School-Id": schoolId || "",
          },
          body: JSON.stringify({
            topic,
            subjectName,
            gradeLevel,
            curriculumType,
            durationMinutes,
            bloomLevels: selectedBlooms,
            additionalContext,
            quizQuestionCount,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate curriculum plan");
      }

      const data = await response.json();
      setAiData(data);
      setActiveTab("plan");
      toast.success("AI Curriculum Plan generated successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "An error occurred during AI generation");
    } finally {
      clearInterval(phaseInterval);
      setLoading(false);
    }
  };

  const handleSaveToPlanner = async () => {
    if (!aiData || !user?.id || !schoolId) return;

    try {
      const payload = {
        school_id: schoolId,
        teacher_user_id: user.id,
        class_section_id: sectionId,
        subject_id: subjectId || null,
        plan_date: planDate,
        period_label: periodLabel,
        topic: aiData.lessonPlan?.title || topic,
        objectives: aiData.lessonPlan?.learningObjectives?.join("\n") || "",
        resources: aiData.lessonPlan?.materialsNeeded?.join("\n") || "",
        notes: aiData.lessonPlan?.homeworkSuggestion || "",
        status: "draft",
        curriculum_type: curriculumType,
        grade_level: gradeLevel,
        lesson_duration_minutes: durationMinutes,
        bloom_levels: selectedBlooms,
        ai_plan_data: {
          ...aiData.lessonPlan,
          activities: aiData.activities,
          rubric: aiData.rubric,
        },
        ai_slide_script: aiData.slideScript,
        ai_quiz_data: aiData.quiz,
        ai_model_used: "Gemini / Fast AI Model Routing",
        generation_status: "complete",
      };

      const { error } = await supabase.from("lesson_plans").insert(payload);
      if (error) throw error;

      toast.success("AI Lesson Plan saved to your calendar planner!");
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to save lesson plan to calendar");
    }
  };

  const handleAssignQuiz = async () => {
    if (!aiData?.quiz || !sectionId) return;

    setAssigningQuiz(true);
    try {
      const quizMarkdown = aiData.quiz
        .map((q: any) => {
          const optionsList = (q.options || [])
            .map((opt: string, k: number) => `   ${String.fromCharCode(65 + k)}. ${opt}`)
            .join("\n");
          return `**Q${q.questionNumber}: ${q.question}**\n${optionsList}\n\n*Correct Answer: ${q.correctAnswer}*\n*Explanation: ${q.explanation}*\n`;
        })
        .join("\n---\n\n");

      const payload = {
        class_section_id: sectionId,
        title: `Quiz: ${aiData.lessonPlan?.title || topic}`,
        description: `Please complete the following quiz questions generated for our topic:\n\n${quizMarkdown}`,
        due_date: planDate,
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
    if (!aiData) return;

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
      doc.text(`Topic: ${aiData.lessonPlan?.title || topic}`, 20, y);
      y += 7;
      doc.text(`Curriculum: ${curriculumType} | Grade: ${gradeLevel}`, 20, y);
      y += 7;
      doc.text(`Duration: ${durationMinutes} minutes | Bloom's levels: ${selectedBlooms.join(", ")}`, 20, y);
      y += 15;

      // Objectives
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59); 
      doc.text("Learning Objectives", 20, y);
      y += 8;
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); 
      (aiData.lessonPlan?.learningObjectives || []).forEach((obj: string) => {
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
      (aiData.lessonPlan?.schedule || []).forEach((sch: any) => {
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
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont("Helvetica", "bold");
      doc.text("Classroom Slides Presentation Script", 20, y);
      y += 10;

      doc.setFontSize(10);
      (aiData.slideScript || []).forEach((slide: any) => {
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

      doc.save(`Lesson_Plan_${topic.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PDF document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[96vw] w-[95%] lg:w-[90vw] max-h-[92vh] h-[90vh] bg-slate-50 border-slate-200 text-slate-900 overflow-hidden p-0 rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(15,23,42,0.15)]">
        {/* Header - Light white & blue theme */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-200 bg-white flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 bg-clip-text text-transparent">
            <Sparkles className="h-6 w-6 text-blue-600 animate-pulse" />
            AI Lesson Plan & Slide-Script Generator
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT: Config Panel (Soft light blue-gray) */}
          <div className="lg:col-span-4 border-r border-slate-200 p-6 overflow-y-auto space-y-5 bg-slate-100/40">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic" className="text-slate-700 font-semibold">
                  Lesson Topic / Chapter <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="e.g., Photosynthesis & Plant Cells"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-blue-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="section" className="text-slate-700 font-semibold">
                    Class Section <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={sectionId} onValueChange={setSectionId}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {sections.map((sec) => (
                        <SelectItem key={sec.id} value={sec.id}>
                          {sec.class_name} - {sec.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-slate-700 font-semibold">
                    Subject
                  </Label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {subjects.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Grade Level</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Duration (mins)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 45)}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Curriculum Framework</Label>
                  <Select value={curriculumType} onValueChange={setCurriculumType}>
                    <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {CURRICULUMS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-700 font-semibold">Quiz MCQs Count</Label>
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">Count</span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={25}
                    value={quizQuestionCount}
                    onChange={(e) => setQuizQuestionCount(parseInt(e.target.value) || 5)}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col">
                  <Label className="text-slate-700 font-semibold">
                    Bloom's Taxonomy Focus
                  </Label>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Select cognitive levels to focus interactive activities and quiz questions on.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {BLOOM_LEVELS.map((level) => {
                    const active = selectedBlooms.includes(level);
                    return (
                      <button
                        type="button"
                        key={level}
                        onClick={() => toggleBlooms(level)}
                        className={`text-xs px-2.5 py-1.5 rounded-full border transition-all duration-200 ${
                          active
                            ? "bg-blue-600 border-blue-500 text-white shadow-[0_2px_8px_rgba(59,130,246,0.25)]"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col">
                  <Label htmlFor="context" className="text-slate-700 font-semibold">
                    Additional Pedagogy Context (Optional)
                  </Label>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Provide instructions for the AI: e.g., 'focus on hands-on labs' or 'simplify mathematical steps'.
                  </span>
                </div>
                <Textarea
                  id="context"
                  placeholder="e.g., Focus more on lab experiments, or include review of cell division since students struggled with it last time."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  className="bg-white border-slate-200 text-slate-900 placeholder-slate-400 min-h-[80px]"
                />
              </div>

              <div className="border-t border-slate-200/80 pt-4 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Plan Date</Label>
                  <Input
                    type="date"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Period / Slot</Label>
                  <Input
                    type="text"
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(59,130,246,0.2)] transition-all duration-300 mt-2 border-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating Curriculum...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Generate with AI
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* RIGHT: Output Panel */}
          <div className="lg:col-span-8 overflow-hidden flex flex-col h-full bg-white">
            {loading ? (
              // Loading State Screen
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-blue-500/10 border-t-blue-600 animate-spin" />
                  <Sparkles className="h-6 w-6 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div className="space-y-2 text-center max-w-md">
                  <h3 className="text-xl font-bold text-slate-800">
                    AltRix Pedagogy Engine Active
                  </h3>
                  <p className="text-sm text-slate-500 animate-pulse transition-all">
                    {LOADING_PHASES[loadingPhase].label}
                  </p>
                </div>
                <div className="w-64">
                  <Progress
                    value={LOADING_PHASES[loadingPhase].progress}
                    className="h-2 bg-slate-100 [&>div]:bg-blue-600"
                  />
                </div>
              </div>
            ) : aiData ? (
              // Loaded Content Panel
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header Action Bar */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200/60 font-semibold">
                      Generative Framework Ready
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setIsEditing(!isEditing)}
                      variant="outline"
                      className={`border-slate-200 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1.5 transition-all ${
                        isEditing ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white"
                      }`}
                    >
                      <Edit3 className="h-4 w-4" />
                      {isEditing ? "View Mode" : "Edit Plan"}
                    </Button>
                    <Button
                      onClick={handleExportPDF}
                      variant="outline"
                      className="bg-white border-slate-200 hover:bg-slate-100 text-slate-700 text-xs flex items-center gap-1.5"
                    >
                      <FileDown className="h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button
                      onClick={handleSaveToPlanner}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5 font-semibold border-none"
                    >
                      <Save className="h-4 w-4" />
                      Save to Planner
                    </Button>
                  </div>
                </div>

                {/* Tabs Selector */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="bg-slate-50 border-b border-slate-200 justify-start h-12 p-0 rounded-none w-full flex overflow-x-auto scrollbar-none">
                    <TabsTrigger
                      value="plan"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-5 gap-2 text-sm font-semibold"
                    >
                      <BookOpen className="h-4 w-4" />
                      Lesson Plan
                    </TabsTrigger>
                    <TabsTrigger
                      value="slides"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-5 gap-2 text-sm font-semibold"
                    >
                      <Presentation className="h-4 w-4" />
                      Slide Scripts
                    </TabsTrigger>
                    <TabsTrigger
                      value="activities"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-5 gap-2 text-sm font-semibold"
                    >
                      <ListTodo className="h-4 w-4" />
                      Activities
                    </TabsTrigger>
                    <TabsTrigger
                      value="quiz"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-5 gap-2 text-sm font-semibold"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Quiz questions
                    </TabsTrigger>
                    <TabsTrigger
                      value="rubric"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white text-slate-500 data-[state=active]:text-blue-700 h-full px-5 gap-2 text-sm font-semibold"
                    >
                      <Table className="h-4 w-4" />
                      Rubric
                    </TabsTrigger>
                  </TabsList>

                  <ScrollArea className="flex-1 p-6 bg-slate-50/30">                    {/* TAB 1: Lesson Plan */}
                    <TabsContent value="plan" className="space-y-6 mt-0">
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-6 shadow-sm">
                        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                          <div className="w-full">
                            {isEditing ? (
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-500 font-bold">Lesson Title</Label>
                                <Input
                                  value={aiData.lessonPlan?.title || ""}
                                  onChange={(e) => updateAiField(["lessonPlan", "title"], e.target.value)}
                                  className="bg-white border-slate-200 text-slate-900 w-full font-bold text-lg focus:border-blue-500 focus:ring-blue-200"
                                />
                              </div>
                            ) : (
                              <>
                                <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">
                                  {aiData.lessonPlan?.title}
                                </h2>
                                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
                                  <Sparkles className="h-3 w-3 text-blue-500" />
                                  Pedagogical roadmap structured for curriculum objectives
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Learning Objectives Column */}
                          <div className="lg:col-span-2 bg-slate-50/50 border border-slate-100 p-5 rounded-xl space-y-3">
                            <div className="flex items-center gap-2 border-b border-slate-200/60 pb-2">
                              <GraduationCap className="h-5 w-5 text-blue-600" />
                              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                                Learning Objectives
                              </h4>
                            </div>
                            {isEditing ? (
                              <div className="space-y-2">
                                {(aiData.lessonPlan?.learningObjectives || []).map((obj: string, i: number) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <Input
                                      value={obj}
                                      onChange={(e) => {
                                        const newObjectives = [...aiData.lessonPlan.learningObjectives];
                                        newObjectives[i] = e.target.value;
                                        updateAiField(["lessonPlan", "learningObjectives"], newObjectives);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-sm"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="text-rose-500 hover:text-rose-600 shrink-0"
                                      onClick={() => {
                                        const newObjectives = aiData.lessonPlan.learningObjectives.filter((_: any, idx: number) => idx !== i);
                                        updateAiField(["lessonPlan", "learningObjectives"], newObjectives);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="text-xs border-slate-200 text-slate-600 mt-1 hover:bg-slate-100 bg-white"
                                  onClick={() => {
                                    const newObjectives = [...(aiData.lessonPlan?.learningObjectives || []), "New learning goal"];
                                    updateAiField(["lessonPlan", "learningObjectives"], newObjectives);
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Objective
                                </Button>
                              </div>
                            ) : (
                              <ul className="space-y-2">
                                {(aiData.lessonPlan?.learningObjectives || []).map((obj: string, i: number) => (
                                  <li key={i} className="text-sm text-slate-600 flex items-start gap-2.5">
                                    <span className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                      <Check className="h-3 w-3 text-emerald-600" />
                                    </span>
                                    <span className="leading-relaxed">{obj}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          {/* Prerequisites and Materials Column */}
                          <div className="space-y-4">
                            {/* Prerequisites */}
                            <div className="bg-slate-50/50 border border-slate-100 p-4.5 rounded-xl space-y-2.5">
                              <div className="flex items-center gap-2 border-b border-slate-200/60 pb-1.5">
                                <BookOpen className="h-4.5 w-4.5 text-indigo-600" />
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                  Prior Knowledge
                                </h4>
                              </div>
                              {isEditing ? (
                                <Textarea
                                  value={(aiData.lessonPlan?.priorKnowledge || []).join(", ")}
                                  onChange={(e) => updateAiField(["lessonPlan", "priorKnowledge"], e.target.value.split(",").map(s => s.trim()))}
                                  placeholder="Separated by commas"
                                  className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px]"
                                />
                              ) : (
                                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                  {(aiData.lessonPlan?.priorKnowledge || []).join(", ") || "None specified"}
                                </p>
                              )}
                            </div>

                            {/* Materials */}
                            <div className="bg-slate-50/50 border border-slate-100 p-4.5 rounded-xl space-y-2.5">
                              <div className="flex items-center gap-2 border-b border-slate-200/60 pb-1.5">
                                <ListTodo className="h-4.5 w-4.5 text-blue-600" />
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                  Materials Needed
                                </h4>
                              </div>
                              {isEditing ? (
                                <Textarea
                                  value={(aiData.lessonPlan?.materialsNeeded || []).join(", ")}
                                  onChange={(e) => updateAiField(["lessonPlan", "materialsNeeded"], e.target.value.split(",").map(s => s.trim()))}
                                  placeholder="Separated by commas"
                                  className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px]"
                                />
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {(aiData.lessonPlan?.materialsNeeded || []).map((mat: string, i: number) => (
                                    <Badge key={i} variant="outline" className="bg-blue-50/50 border-blue-100/60 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">
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
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Clock className="h-5 w-5 text-blue-600 animate-pulse" />
                          <h3 className="text-lg font-bold text-slate-800">
                            Minute-by-Minute Classroom Roadmap
                          </h3>
                        </div>
                        <div className="relative border-l-2 border-blue-200 pl-6 ml-3 space-y-6">
                          {(aiData.lessonPlan?.schedule || []).map((item: any, i: number) => (
                            <div key={i} className="relative">
                              {/* Dot marker */}
                              <div className="absolute -left-[32px] top-1.5 h-4.5 w-4.5 rounded-full border-2 border-blue-500 bg-white flex items-center justify-center shadow-[0_0_8px_rgba(59,130,246,0.15)] z-10">
                                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                              </div>
                              <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3.5 shadow-sm hover:shadow-md transition-shadow">
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[10px] text-slate-500 uppercase font-bold">Time Range</Label>
                                        <Input
                                          value={item.timeRange}
                                          onChange={(e) => {
                                            const newSchedule = [...aiData.lessonPlan.schedule];
                                            newSchedule[i].timeRange = e.target.value;
                                            updateAiField(["lessonPlan", "schedule"], newSchedule);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs focus:border-blue-500 focus:ring-blue-200"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[10px] text-slate-500 uppercase font-bold">Phase</Label>
                                        <Input
                                          value={item.phase}
                                          onChange={(e) => {
                                            const newSchedule = [...aiData.lessonPlan.schedule];
                                            newSchedule[i].phase = e.target.value;
                                            updateAiField(["lessonPlan", "schedule"], newSchedule);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs focus:border-blue-500 focus:ring-blue-200"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-slate-500 uppercase font-bold">Activity</Label>
                                      <Input
                                        value={item.activity}
                                        onChange={(e) => {
                                          const newSchedule = [...aiData.lessonPlan.schedule];
                                          newSchedule[i].activity = e.target.value;
                                          updateAiField(["lessonPlan", "schedule"], newSchedule);
                                        }}
                                        className="bg-white border-slate-200 text-slate-900 text-xs focus:border-blue-500 focus:ring-blue-200"
                                      />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[10px] text-slate-500 uppercase font-bold">Teacher Action</Label>
                                        <Textarea
                                          value={item.teacherAction}
                                          onChange={(e) => {
                                            const newSchedule = [...aiData.lessonPlan.schedule];
                                            newSchedule[i].teacherAction = e.target.value;
                                            updateAiField(["lessonPlan", "schedule"], newSchedule);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px] focus:border-blue-500 focus:ring-blue-200"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[10px] text-slate-500 uppercase font-bold">Student Action</Label>
                                        <Textarea
                                          value={item.studentAction}
                                          onChange={(e) => {
                                            const newSchedule = [...aiData.lessonPlan.schedule];
                                            newSchedule[i].studentAction = e.target.value;
                                            updateAiField(["lessonPlan", "schedule"], newSchedule);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px] focus:border-blue-500 focus:ring-blue-200"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                      <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100/60 px-2 py-0.5 rounded font-mono shadow-sm">
                                        {item.timeRange}
                                      </span>
                                      <span className="text-sm font-bold text-slate-800">
                                        {item.phase}
                                      </span>
                                    </div>
                                    <div className="text-sm text-slate-700 font-semibold bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/60">
                                      {item.activity}
                                    </div>
                                    
                                    {/* Action split with boxes */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
                                      {/* Teacher Action Container */}
                                      <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-xl space-y-2">
                                        <div className="flex items-center gap-1.5 text-blue-800 font-bold uppercase tracking-wider">
                                          <User className="h-4 w-4 text-blue-600 shrink-0" />
                                          <span>Teacher Action:</span>
                                        </div>
                                        <p className="text-slate-700 leading-relaxed font-medium">
                                          {item.teacherAction}
                                        </p>
                                      </div>

                                      {/* Student Action Container */}
                                      <div className="bg-indigo-50/60 border border-indigo-100 p-3.5 rounded-xl space-y-2">
                                        <div className="flex items-center gap-1.5 text-indigo-850 font-bold uppercase tracking-wider">
                                          <Users className="h-4 w-4 text-indigo-600 shrink-0" />
                                          <span>Student Action:</span>
                                        </div>
                                        <p className="text-slate-700 leading-relaxed font-medium">
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
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-5 shadow-sm">
                        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                          <GraduationCap className="h-5.5 w-5.5 text-blue-600" />
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                            Homework & Pedagogy Differentiation
                          </h3>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-500 font-bold">Homework Suggestion</Label>
                          {isEditing ? (
                            <Textarea
                              value={aiData.lessonPlan?.homeworkSuggestion || ""}
                              onChange={(e) => updateAiField(["lessonPlan", "homeworkSuggestion"], e.target.value)}
                              className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px]"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 font-medium bg-slate-50 border border-slate-150/60 p-3 rounded-lg leading-relaxed">
                              {aiData.lessonPlan?.homeworkSuggestion}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                          <div className="bg-emerald-50/50 border border-emerald-100 p-4.5 rounded-xl space-y-1">
                            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Advanced Achievers</span>
                            {isEditing ? (
                              <Textarea
                                value={aiData.lessonPlan?.differentiationStrategies?.advanced || ""}
                                onChange={(e) => updateAiField(["lessonPlan", "differentiationStrategies", "advanced"], e.target.value)}
                                className="bg-white border-slate-200 text-slate-900 text-xs mt-2 min-h-[85px]"
                              />
                            ) : (
                              <p className="text-xs text-slate-650 mt-1 leading-relaxed">
                                {aiData.lessonPlan?.differentiationStrategies?.advanced}
                              </p>
                            )}
                          </div>
                          <div className="bg-amber-50/50 border border-amber-100 p-4.5 rounded-xl space-y-1">
                            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Support / Struggling</span>
                            {isEditing ? (
                              <Textarea
                                value={aiData.lessonPlan?.differentiationStrategies?.struggling || ""}
                                onChange={(e) => updateAiField(["lessonPlan", "differentiationStrategies", "struggling"], e.target.value)}
                                className="bg-white border-slate-200 text-slate-900 text-xs mt-2 min-h-[85px]"
                              />
                            ) : (
                              <p className="text-xs text-slate-650 mt-1 leading-relaxed">
                                {aiData.lessonPlan?.differentiationStrategies?.struggling}
                              </p>
                            )}
                          </div>
                          <div className="bg-blue-50/50 border border-blue-100 p-4.5 rounded-xl space-y-1">
                            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">ELL Scaffolding</span>
                            {isEditing ? (
                              <Textarea
                                value={aiData.lessonPlan?.differentiationStrategies?.ell || ""}
                                onChange={(e) => updateAiField(["lessonPlan", "differentiationStrategies", "ell"], e.target.value)}
                                className="bg-white border-slate-200 text-slate-900 text-xs mt-2 min-h-[85px]"
                              />
                            ) : (
                              <p className="text-xs text-slate-650 mt-1 leading-relaxed">
                                {aiData.lessonPlan?.differentiationStrategies?.ell}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="slides" className="space-y-6 mt-0">
                      <div className="space-y-1 border-b border-slate-100 pb-3">
                        <h2 className="text-xl font-bold text-slate-800">Presentation Slide Decks & Speaker Scripts</h2>
                        <p className="text-xs text-slate-400">
                          Slide content previews, suggested diagram visuals, and full word-for-word teacher scripts.
                        </p>
                      </div>

                      <div className="space-y-6">
                        {(aiData.slideScript || []).map((slide: any, i: number) => (
                          <div key={i} className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 hover:bg-blue-600 text-white font-mono font-bold px-2.5 py-1 text-xs rounded-lg shadow-[0_2px_6px_rgba(59,130,246,0.25)]">
                                  Slide {slide.slideNumber}
                                </Badge>
                                {isEditing ? (
                                  <Input
                                    value={slide.title}
                                    onChange={(e) => {
                                      const newSlides = [...aiData.slideScript];
                                      newSlides[i].title = e.target.value;
                                      updateAiField(["slideScript"], newSlides);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-sm w-72 focus:border-blue-500 focus:ring-blue-200 h-8 font-bold"
                                  />
                                ) : (
                                  <span className="text-base font-bold text-slate-850">
                                    {slide.title}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
                              {/* Left: Virtual Slide Mockup Screen */}
                              <div className="lg:col-span-5 flex flex-col gap-3">
                                <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                                  Slide View (What students see):
                                </span>
                                
                                <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 text-white rounded-xl shadow-md border border-slate-700/80 p-4.5 aspect-[4/3] flex flex-col justify-between select-none relative overflow-hidden">
                                  {/* Glossy top-left overlay */}
                                  <div className="absolute top-0 left-0 w-full h-1/2 bg-white/[0.02] transform -skew-y-6 origin-top-left pointer-events-none" />
                                  
                                  <div className="space-y-3.5">
                                    <h3 className="font-bold text-sm tracking-tight text-white border-b border-white/10 pb-2 flex items-center gap-1.5">
                                      <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                                      {slide.title}
                                    </h3>
                                    
                                    {isEditing ? (
                                      <Textarea
                                        value={(slide.bulletPoints || []).join("\n")}
                                        onChange={(e) => {
                                          const newSlides = [...aiData.slideScript];
                                          newSlides[i].bulletPoints = e.target.value.split("\n").filter(Boolean);
                                          updateAiField(["slideScript"], newSlides);
                                        }}
                                        placeholder="Each line represents a bullet point"
                                        className="bg-white/5 border-white/10 text-white text-[10px] min-h-[90px] placeholder-white/35"
                                      />
                                    ) : (
                                      <ul className="space-y-2 text-[10.5px] text-slate-200/90 pl-3 list-disc leading-relaxed">
                                        {(slide.bulletPoints || []).map((bp: string, k: number) => (
                                          <li key={k}>{bp}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[8px] text-slate-400 font-mono">
                                    <span>AltRix Classroom Deck</span>
                                    <span>Page {slide.slideNumber}</span>
                                  </div>
                                </div>

                                {/* Visual Diagram Box */}
                                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block mb-1">
                                    Suggested Diagram / Visual asset:
                                  </span>
                                  {isEditing ? (
                                    <Input
                                      value={slide.visualSuggestion}
                                      onChange={(e) => {
                                        const newSlides = [...aiData.slideScript];
                                        newSlides[i].visualSuggestion = e.target.value;
                                        updateAiField(["slideScript"], newSlides);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs h-7"
                                    />
                                  ) : (
                                    <p className="text-xs text-slate-550 italic leading-relaxed">
                                      {slide.visualSuggestion}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Right: Speaker notes teleprompter speech bubble */}
                              <div className="lg:col-span-7 flex flex-col">
                                <span className="text-[10px] font-bold text-slate-455 uppercase tracking-wider block mb-1">
                                  Teacher Teleprompter Script (What to say):
                                </span>
                                <div className="flex-1 bg-blue-50/30 border border-blue-100/60 p-4.5 rounded-xl flex flex-col space-y-3 relative shadow-inner">
                                  <div className="flex items-center gap-1.5 text-blue-700 border-b border-blue-100/50 pb-2">
                                    <Presentation className="h-4.5 w-4.5 text-blue-600" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider">Verbatim Explanation Script</span>
                                  </div>
                                  {isEditing ? (
                                    <Textarea
                                      value={slide.speakerNotes}
                                      onChange={(e) => {
                                        const newSlides = [...aiData.slideScript];
                                        newSlides[i].speakerNotes = e.target.value;
                                        updateAiField(["slideScript"], newSlides);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs font-serif min-h-[160px] focus:border-blue-500"
                                    />
                                  ) : (
                                    <p className="text-slate-700 leading-relaxed font-serif italic text-[12.5px] p-2 bg-white/50 border border-slate-100/40 rounded-lg">
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
                    <TabsContent value="activities" className="space-y-6 mt-0">
                      <div className="space-y-1 border-b border-slate-100 pb-3">
                        <h2 className="text-xl font-bold text-slate-800">Interactive Student Activities</h2>
                        <p className="text-xs text-slate-400">
                          Engaging class discussions, hands-on lab experiments, and structured group assignments.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {(aiData.activities || []).map((act: any, i: number) => (
                          <div key={i} className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-all">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                {isEditing ? (
                                  <Input
                                    value={act.name}
                                    onChange={(e) => {
                                      const newActs = [...aiData.activities];
                                      newActs[i].name = e.target.value;
                                      updateAiField(["activities"], newActs);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-xs font-bold w-48 h-8"
                                  />
                                ) : (
                                  <h3 className="text-sm font-bold text-slate-850 flex items-center gap-1.5">
                                    <Sparkles className="h-4 w-4 text-blue-500" />
                                    {act.name}
                                  </h3>
                                )}
                                {isEditing ? (
                                  <Input
                                    value={act.type}
                                    onChange={(e) => {
                                      const newActs = [...aiData.activities];
                                      newActs[i].type = e.target.value;
                                      updateAiField(["activities"], newActs);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-[10px] w-28 h-6"
                                  />
                                ) : (
                                  <Badge variant="outline" className="bg-indigo-50/65 text-indigo-750 border-indigo-150 px-2 py-0.5 rounded text-[11px] font-semibold">
                                    {act.type}
                                  </Badge>
                                )}
                              </div>
                              {isEditing ? (
                                <Textarea
                                  value={act.description}
                                  onChange={(e) => {
                                    const newActs = [...aiData.activities];
                                    newActs[i].description = e.target.value;
                                    updateAiField(["activities"], newActs);
                                  }}
                                  className="bg-white border-slate-200 text-slate-900 text-xs min-h-[80px]"
                                />
                              ) : (
                                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                  {act.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px]">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                                  <Input
                                    value={act.duration}
                                    onChange={(e) => {
                                      const newActs = [...aiData.activities];
                                      newActs[i].duration = e.target.value;
                                      updateAiField(["activities"], newActs);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-[10px] w-20 h-6"
                                  />
                                </div>
                              ) : (
                                <span className="text-slate-700 flex items-center gap-1 font-mono font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded shadow-sm">
                                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                                  {act.duration}
                                </span>
                              )}
                              {isEditing ? (
                                <Input
                                  value={act.materials}
                                  onChange={(e) => {
                                    const newActs = [...aiData.activities];
                                    newActs[i].materials = e.target.value;
                                    updateAiField(["activities"], newActs);
                                  }}
                                  placeholder="Required materials"
                                  className="bg-white border-slate-200 text-slate-900 text-[10px] w-36 h-6"
                                />
                              ) : (
                                <span className="text-slate-500 italic bg-blue-50/30 border border-blue-50/50 px-2 py-0.5 rounded font-medium">
                                  Supplies: {act.materials || "Standard Supplies"}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* TAB 4: Quiz (Fully assigned as a classroom assignment) */}
                    <TabsContent value="quiz" className="space-y-6 mt-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-1">
                          <h2 className="text-xl font-bold text-slate-800">Formative Assessment Quiz</h2>
                          <p className="text-xs text-slate-400">
                            Aligned multiple-choice questions to instantly gauge student comprehension.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={handleAssignQuiz}
                          disabled={assigningQuiz}
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs flex items-center gap-1.5 font-bold shadow-[0_2px_8px_rgba(59,130,246,0.2)] border-none"
                        >
                          {assigningQuiz ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Assigning Quiz...
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4" />
                              Assign Quiz to Class
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="space-y-5">
                        {(aiData.quiz || []).map((q: any, i: number) => (
                          <div key={i} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <span className="text-sm font-bold text-slate-800">
                                Question {q.questionNumber}
                              </span>
                              {isEditing ? (
                                <Input
                                  value={q.bloomLevel}
                                  onChange={(e) => {
                                    const newQuiz = [...aiData.quiz];
                                    newQuiz[i].bloomLevel = e.target.value;
                                    updateAiField(["quiz"], newQuiz);
                                  }}
                                  className="bg-white border-slate-200 text-slate-900 text-[10px] w-28 h-6"
                                />
                              ) : (
                                <Badge className="bg-blue-50 text-blue-700 border border-blue-200/60 font-semibold px-2 py-0.5 rounded text-[11px]">
                                  Bloom: {q.bloomLevel}
                                </Badge>
                              )}
                            </div>
                            
                            {isEditing ? (
                              <Input
                                value={q.question}
                                onChange={(e) => {
                                  const newQuiz = [...aiData.quiz];
                                  newQuiz[i].question = e.target.value;
                                  updateAiField(["quiz"], newQuiz);
                                }}
                                className="bg-white border-slate-200 text-slate-900 text-sm focus:border-blue-500 focus:ring-blue-200 font-medium"
                              />
                            ) : (
                              <p className="text-sm text-slate-800 font-semibold leading-relaxed">
                                {q.question}
                              </p>
                            )}
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                              {(q.options || []).map((opt: string, k: number) => {
                                const optionLetter = String.fromCharCode(65 + k); 
                                const isCorrect = optionLetter === q.correctAnswer;
                                return (
                                  <div
                                    key={k}
                                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2.5 transition-all ${
                                      isCorrect
                                        ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 shadow-[0_2px_8px_rgba(16,185,129,0.08)] font-semibold"
                                        : "bg-slate-50 border-slate-100 text-slate-600"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 w-full">
                                      <span className={`h-6.5 w-6.5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                                        isCorrect
                                          ? "bg-emerald-100 border border-emerald-300 text-emerald-700"
                                          : "bg-white border border-slate-200 text-slate-400"
                                      }`}>
                                        {optionLetter}
                                      </span>
                                      {isEditing ? (
                                        <Input
                                          value={opt}
                                          onChange={(e) => {
                                            const newQuiz = [...aiData.quiz];
                                            newQuiz[i].options[k] = e.target.value;
                                            updateAiField(["quiz"], newQuiz);
                                          }}
                                          className="bg-white border-slate-200 text-slate-900 text-xs h-7"
                                        />
                                      ) : (
                                        <span className="leading-normal">{opt}</span>
                                      )}
                                    </div>
                                    {!isEditing && isCorrect && (
                                      <Check className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {isEditing && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-slate-500 font-bold uppercase">Correct Answer Letter (A-D)</Label>
                                  <Input
                                    value={q.correctAnswer}
                                    maxLength={1}
                                    onChange={(e) => {
                                      const newQuiz = [...aiData.quiz];
                                      newQuiz[i].correctAnswer = e.target.value.toUpperCase();
                                      updateAiField(["quiz"], newQuiz);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-xs h-8 w-16"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Explanation Container */}
                            <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100/60 mt-3 text-xs flex gap-2.5">
                              <Info className="h-4.5 w-4.5 text-blue-600 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <span className="text-blue-800 font-bold uppercase tracking-wider block">
                                  Explanation & Solution:
                                </span>
                                {isEditing ? (
                                  <Textarea
                                    value={q.explanation}
                                    onChange={(e) => {
                                      const newQuiz = [...aiData.quiz];
                                      newQuiz[i].explanation = e.target.value;
                                      updateAiField(["quiz"], newQuiz);
                                    }}
                                    className="bg-white border-slate-200 text-slate-900 text-xs min-h-[50px] w-full"
                                  />
                                ) : (
                                  <p className="text-slate-700 leading-relaxed font-medium">
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
                    <TabsContent value="rubric" className="space-y-6 mt-0">
                      <div className="space-y-1 border-b border-slate-100 pb-3">
                        <h2 className="text-xl font-bold text-slate-800">Performance Grading Rubric</h2>
                        <p className="text-xs text-slate-400">
                          Structured evaluation criteria mapping student competency levels across lesson goals.
                        </p>
                      </div>

                      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-650 font-bold">
                              <th className="p-3.5 w-1/4 bg-slate-55/60 text-slate-800 font-bold uppercase tracking-wider">Criteria</th>
                              <th className="p-3.5 w-1/4 bg-emerald-50/80 text-emerald-850 font-bold uppercase tracking-wider border-l border-emerald-100/50">Excellent</th>
                              <th className="p-3.5 w-1/4 bg-blue-50/70 text-blue-850 font-bold uppercase tracking-wider border-l border-blue-100/50">Good</th>
                              <th className="p-3.5 w-1/4 bg-amber-50/70 text-amber-850 font-bold uppercase tracking-wider border-l border-amber-100/50">Developing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-700">
                            {(aiData.rubric?.criteria || []).map((crit: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-50/20">
                                <td className="p-3.5 font-bold text-slate-800 border-r border-slate-100 leading-normal">
                                  {isEditing ? (
                                    <Input
                                      value={crit.name}
                                      onChange={(e) => {
                                        const newCriteria = [...aiData.rubric.criteria];
                                        newCriteria[i].name = e.target.value;
                                        updateAiField(["rubric", "criteria"], newCriteria);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs font-bold"
                                    />
                                  ) : (
                                    crit.name
                                  )}
                                </td>
                                <td className="p-3.5 border-r border-slate-100 leading-relaxed text-slate-600 font-medium">
                                  {isEditing ? (
                                    <Textarea
                                      value={crit.excellent}
                                      onChange={(e) => {
                                        const newCriteria = [...aiData.rubric.criteria];
                                        newCriteria[i].excellent = e.target.value;
                                        updateAiField(["rubric", "criteria"], newCriteria);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px]"
                                    />
                                  ) : (
                                    crit.excellent
                                  )}
                                </td>
                                <td className="p-3.5 border-r border-slate-100 leading-relaxed text-slate-600 font-medium">
                                  {isEditing ? (
                                    <Textarea
                                      value={crit.good}
                                      onChange={(e) => {
                                        const newCriteria = [...aiData.rubric.criteria];
                                        newCriteria[i].good = e.target.value;
                                        updateAiField(["rubric", "criteria"], newCriteria);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px]"
                                    />
                                  ) : (
                                    crit.good
                                  )}
                                </td>
                                <td className="p-3.5 leading-relaxed text-slate-650 font-medium">
                                  {isEditing ? (
                                    <Textarea
                                      value={crit.developing}
                                      onChange={(e) => {
                                        const newCriteria = [...aiData.rubric.criteria];
                                        newCriteria[i].developing = e.target.value;
                                        updateAiField(["rubric", "criteria"], newCriteria);
                                      }}
                                      className="bg-white border-slate-200 text-slate-900 text-xs min-h-[60px]"
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
              // Empty State Screen (White/Blue aesthetic)
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-center">
                <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 shadow-[0_0_25px_rgba(59,130,246,0.1)] animate-pulse">
                  <Sparkles className="h-8 w-8 text-blue-500" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-lg font-bold text-slate-800">
                    Design a Classroom Session
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Set your chapter, target curriculum, duration, and pedagogical focus on the left. Click **Generate with AI** to create lesson roadmaps instantly.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
