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
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  BookOpen,
  Presentation,
  FileText,
  ListTodo,
  HelpCircle,
  Table,
  Download,
  Save,
  Edit3,
  Loader2,
  Calendar,
  Clock,
  ArrowRight,
  Check,
  CheckCircle2,
  Plus,
  X,
  FileDown,
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

  const toggleBlooms = (level: string) => {
    setSelectedBlooms((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
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

    // Simulated progress timer for loading phase messages
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

      // API call to FastAPI backend
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
      const selectedSubjectObj = subjects.find((s) => s.id === subjectId);
      
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
        ai_plan_data: aiData.lessonPlan,
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

  const handleExportPDF = () => {
    if (!aiData) return;

    try {
      const doc = new jsPDF();
      let y = 20;

      // Title & Header Info
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text("AltRix AI Lesson Plan", 20, y);
      y += 10;

      doc.setFontSize(14);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`Topic: ${aiData.lessonPlan?.title || topic}`, 20, y);
      y += 7;
      doc.text(`Curriculum: ${curriculumType} | Grade: ${gradeLevel}`, 20, y);
      y += 7;
      doc.text(`Duration: ${durationMinutes} minutes | Bloom's levels: ${selectedBlooms.join(", ")}`, 20, y);
      y += 15;

      // Objectives
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("Learning Objectives", 20, y);
      y += 8;
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); // slate-700
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

      // Save PDF
      doc.save(`Lesson_Plan_${topic.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate PDF document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[96vw] w-[95%] lg:w-[90vw] max-h-[92vh] h-[90vh] bg-slate-900/95 backdrop-blur-xl border-slate-800 text-white overflow-hidden p-0 rounded-2xl flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <DialogHeader className="p-6 pb-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-2xl font-bold bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            <Sparkles className="h-6 w-6 text-blue-400 animate-pulse" />
            AI Lesson Plan & Slide-Script Generator
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT: Config Panel */}
          <div className="lg:col-span-4 border-r border-slate-800 p-6 overflow-y-auto space-y-5 bg-slate-950/40">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic" className="text-slate-300 font-medium">
                  Lesson Topic / Chapter <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="e.g., Photosynthesis & Plant Cells"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-white placeholder-slate-500 focus:border-blue-500/50 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="section" className="text-slate-300 font-medium">
                    Class Section <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={sectionId} onValueChange={setSectionId}>
                    <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {sections.map((sec) => (
                        <SelectItem key={sec.id} value={sec.id}>
                          {sec.class_name} - {sec.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-slate-300 font-medium">
                    Subject
                  </Label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
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
                  <Label className="text-slate-300 font-medium">Grade Level</Label>
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300 font-medium">Duration (mins)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 45)}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300 font-medium">Curriculum Framework</Label>
                <Select value={curriculumType} onValueChange={setCurriculumType}>
                  <SelectTrigger className="bg-slate-900 border-slate-800 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                    {CURRICULUMS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300 font-medium block">
                  Bloom's Taxonomy Focus
                </Label>
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
                            ? "bg-blue-600/30 border-blue-500 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="context" className="text-slate-300 font-medium">
                  Additional Pedagogy Context (Optional)
                </Label>
                <Textarea
                  id="context"
                  placeholder="e.g., Focus more on lab experiments, or include review of cell division since students struggled with it last time."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  className="bg-slate-900 border-slate-800 text-white placeholder-slate-600 min-h-[80px]"
                />
              </div>

              <div className="border-t border-slate-800/80 pt-4 grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-300 font-medium">Plan Date</Label>
                  <Input
                    type="date"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300 font-medium">Period / Slot</Label>
                  <Input
                    type="text"
                    value={periodLabel}
                    onChange={(e) => setPeriodLabel(e.target.value)}
                    className="bg-slate-900 border-slate-800 text-white"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(59,130,246,0.3)] transition-all duration-300 mt-2"
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
          <div className="lg:col-span-8 overflow-hidden flex flex-col h-full bg-slate-950/20">
            {loading ? (
              // Loading State Screen
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                  <Sparkles className="h-6 w-6 text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div className="space-y-2 text-center max-w-md">
                  <h3 className="text-xl font-bold text-slate-100">
                    AltRix Pedagogy Engine Active
                  </h3>
                  <p className="text-sm text-slate-400 animate-pulse transition-all">
                    {LOADING_PHASES[loadingPhase].label}
                  </p>
                </div>
                <div className="w-64">
                  <Progress
                    value={LOADING_PHASES[loadingPhase].progress}
                    className="h-2 bg-slate-800"
                  />
                </div>
              </div>
            ) : aiData ? (
              // Loaded Content Panel
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header Action Bar */}
                <div className="p-4 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Generative Framework Ready
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleExportPDF}
                      variant="outline"
                      className="bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1.5"
                    >
                      <FileDown className="h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button
                      onClick={handleSaveToPlanner}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5 font-semibold"
                    >
                      <Save className="h-4 w-4" />
                      Save to Planner
                    </Button>
                  </div>
                </div>

                {/* Tabs Selector */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="bg-slate-900 border-b border-slate-800 justify-start h-12 p-0 rounded-none w-full flex overflow-x-auto scrollbar-none">
                    <TabsTrigger
                      value="plan"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900/60 text-slate-400 data-[state=active]:text-white h-full px-5 gap-2 text-sm font-medium"
                    >
                      <BookOpen className="h-4 w-4" />
                      Lesson Plan
                    </TabsTrigger>
                    <TabsTrigger
                      value="slides"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900/60 text-slate-400 data-[state=active]:text-white h-full px-5 gap-2 text-sm font-medium"
                    >
                      <Presentation className="h-4 w-4" />
                      Slide Scripts
                    </TabsTrigger>
                    <TabsTrigger
                      value="activities"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900/60 text-slate-400 data-[state=active]:text-white h-full px-5 gap-2 text-sm font-medium"
                    >
                      <ListTodo className="h-4 w-4" />
                      Activities
                    </TabsTrigger>
                    <TabsTrigger
                      value="quiz"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900/60 text-slate-400 data-[state=active]:text-white h-full px-5 gap-2 text-sm font-medium"
                    >
                      <HelpCircle className="h-4 w-4" />
                      Quiz questions
                    </TabsTrigger>
                    <TabsTrigger
                      value="rubric"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-slate-900/60 text-slate-400 data-[state=active]:text-white h-full px-5 gap-2 text-sm font-medium"
                    >
                      <Table className="h-4 w-4" />
                      Rubric
                    </TabsTrigger>
                  </TabsList>

                  <ScrollArea className="flex-1 p-6">
                    {/* TAB 1: Lesson Plan */}
                    <TabsContent value="plan" className="space-y-6 mt-0">
                      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h2 className="text-xl font-bold text-slate-100">
                              {aiData.lessonPlan?.title}
                            </h2>
                            <p className="text-xs text-slate-400 mt-1">
                              Pedagogical roadmap structured for curriculum objectives
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/80 pt-4">
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                              Learning Objectives
                            </h4>
                            <ul className="space-y-1.5">
                              {(aiData.lessonPlan?.learningObjectives || []).map((obj: string, i: number) => (
                                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                  <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                                Prior Knowledge prerequisites
                              </h4>
                              <p className="text-sm text-slate-300 mt-1">
                                {(aiData.lessonPlan?.priorKnowledge || []).join(", ") || "None specified"}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                                Materials & Equipment Needed
                              </h4>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {(aiData.lessonPlan?.materialsNeeded || []).map((mat: string, i: number) => (
                                  <Badge key={i} variant="outline" className="bg-slate-900/60 border-slate-800 text-slate-300">
                                    {mat}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Schedule Timeline */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-200">
                          Minute-by-Minute Classroom Roadmap
                        </h3>
                        <div className="relative border-l border-slate-800 pl-6 ml-3 space-y-6">
                          {(aiData.lessonPlan?.schedule || []).map((item: any, i: number) => (
                            <div key={i} className="relative">
                              {/* Dot marker */}
                              <div className="absolute -left-[31px] top-1.5 h-4.5 w-4.5 rounded-full border border-blue-500 bg-slate-900 flex items-center justify-center shadow-[0_0_8px_rgba(59,130,246,0.5)]">
                                <div className="h-2 w-2 rounded-full bg-blue-400" />
                              </div>
                              <div className="bg-slate-900/30 border border-slate-800/80 p-4.5 rounded-xl space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold bg-blue-600/20 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                                    {item.timeRange}
                                  </span>
                                  <span className="text-sm font-semibold text-slate-200">
                                    {item.phase}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-300 font-medium">
                                  {item.activity}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/50 mt-2 text-xs">
                                  <div>
                                    <span className="text-slate-500 font-bold uppercase tracking-wider block mb-0.5">
                                      Teacher Action:
                                    </span>
                                    <p className="text-slate-400 leading-relaxed">
                                      {item.teacherAction}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 font-bold uppercase tracking-wider block mb-0.5">
                                      Student Action:
                                    </span>
                                    <p className="text-slate-400 leading-relaxed">
                                      {item.studentAction}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Differentiation Panel */}
                      <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl space-y-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400">
                          Pedagogical differentiation strategies
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                            <span className="text-xs font-semibold text-emerald-400">Advanced / High Achievers</span>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              {aiData.lessonPlan?.differentiationStrategies?.advanced}
                            </p>
                          </div>
                          <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                            <span className="text-xs font-semibold text-amber-400">Support / Struggling Students</span>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              {aiData.lessonPlan?.differentiationStrategies?.struggling}
                            </p>
                          </div>
                          <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl">
                            <span className="text-xs font-semibold text-blue-400">Language (ELL) Scaffolding</span>
                            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                              {aiData.lessonPlan?.differentiationStrategies?.ell}
                            </p>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* TAB 2: Slides presentation script */}
                    <TabsContent value="slides" className="space-y-4 mt-0">
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-100">Presentation Script Decks</h2>
                        <p className="text-xs text-slate-400">
                          Slide-by-slide visuals, teacher speaking script, and key details
                        </p>
                      </div>

                      <div className="space-y-4">
                        {(aiData.slideScript || []).map((slide: any, i: number) => (
                          <div key={i} className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-xl space-y-3.5">
                            <div className="flex items-center justify-between">
                              <Badge className="bg-blue-600/20 text-blue-400 border border-blue-500/25">
                                Slide {slide.slideNumber}
                              </Badge>
                              <span className="text-sm font-semibold text-slate-300">
                                {slide.title}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-800/40">
                              {/* Left points & suggestions */}
                              <div className="md:col-span-5 space-y-3">
                                <div className="space-y-1.5">
                                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Bullet points (Visual text):
                                  </span>
                                  <ul className="space-y-1 list-disc list-inside text-xs text-slate-300">
                                    {(slide.bulletPoints || []).map((bp: string, k: number) => (
                                      <li key={k}>{bp}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="bg-slate-950/30 p-3 rounded-lg border border-slate-800/50">
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                                    Suggested Diagram / Visual asset:
                                  </span>
                                  <p className="text-xs text-slate-400 italic">
                                    {slide.visualSuggestion}
                                  </p>
                                </div>
                              </div>

                              {/* Right speaking notes */}
                              <div className="md:col-span-7 bg-indigo-950/15 border border-indigo-900/20 p-4 rounded-lg">
                                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1.5">
                                  Teacher Script (What to say):
                                </span>
                                <p className="text-xs text-slate-300 leading-relaxed font-serif">
                                  "{slide.speakerNotes}"
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* TAB 3: Activities */}
                    <TabsContent value="activities" className="space-y-4 mt-0">
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-100">Interactive Student Activities</h2>
                        <p className="text-xs text-slate-400">
                          Group work, experiments, and individual tasks
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(aiData.activities || []).map((act: any, i: number) => (
                          <div key={i} className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-xl flex flex-col justify-between space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-200">
                                  {act.name}
                                </h3>
                                <Badge variant="outline" className="bg-indigo-950/20 text-indigo-300 border-indigo-500/20">
                                  {act.type}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                {act.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 text-xs">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {act.duration}
                              </span>
                              <span className="text-slate-400 italic">
                                Materials: {act.materials || "Standard classroom supplies"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* TAB 4: Quiz */}
                    <TabsContent value="quiz" className="space-y-5 mt-0">
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-100">Formative Assessment Quiz</h2>
                        <p className="text-xs text-slate-400">
                          5 aligned questions to assess comprehension
                        </p>
                      </div>

                      <div className="space-y-4">
                        {(aiData.quiz || []).map((q: any, i: number) => (
                          <div key={i} className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-slate-200">
                                Question {q.questionNumber}
                              </span>
                              <Badge className="bg-blue-600/10 text-blue-400 border border-blue-500/20">
                                Bloom: {q.bloomLevel}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-300">
                              {q.question}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                              {(q.options || []).map((opt: string, k: number) => {
                                const optionLetter = String.fromCharCode(65 + k); // A, B, C, D
                                const isCorrect = optionLetter === q.correctAnswer;
                                return (
                                  <div
                                    key={k}
                                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2.5 transition-all ${
                                      isCorrect
                                        ? "bg-emerald-600/15 border-emerald-500/40 text-emerald-300"
                                        : "bg-slate-950/20 border-slate-800/60 text-slate-400"
                                    }`}
                                  >
                                    <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                      isCorrect
                                        ? "bg-emerald-500/20 border border-emerald-400/30 text-emerald-300"
                                        : "bg-slate-900 border border-slate-800 text-slate-500"
                                    }`}>
                                      {optionLetter}
                                    </span>
                                    <span>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 mt-2 text-xs">
                              <span className="text-slate-500 font-bold uppercase tracking-wider block mb-0.5">
                                Explanation:
                              </span>
                              <p className="text-slate-400 leading-relaxed">
                                {q.explanation}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* TAB 5: Rubric */}
                    <TabsContent value="rubric" className="space-y-4 mt-0">
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-100">Performance Grading Rubric</h2>
                        <p className="text-xs text-slate-400">
                          Structured evaluation criteria mapping student competency levels
                        </p>
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/20">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                              <th className="p-3 w-1/4">Criteria</th>
                              <th className="p-3 w-1/4 text-emerald-400">Excellent</th>
                              <th className="p-3 w-1/4 text-blue-400">Good</th>
                              <th className="p-3 w-1/4 text-amber-400">Developing</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-300">
                            {(aiData.rubric?.criteria || []).map((crit: any, i: number) => (
                              <tr key={i} className="hover:bg-slate-900/10">
                                <td className="p-3 font-semibold text-slate-200 border-r border-slate-800/50">
                                  {crit.name}
                                </td>
                                <td className="p-3 border-r border-slate-800/50 leading-relaxed">
                                  {crit.excellent}
                                </td>
                                <td className="p-3 border-r border-slate-800/50 leading-relaxed">
                                  {crit.good}
                                </td>
                                <td className="p-3 leading-relaxed">
                                  {crit.developing}
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
              // Empty State Screen
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4 text-center">
                <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)] animate-pulse">
                  <Sparkles className="h-8 w-8 text-blue-400" />
                </div>
                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-lg font-bold text-slate-100">
                    Design a Classroom Session
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
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
