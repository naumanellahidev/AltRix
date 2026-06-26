import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Save, Sparkles, Trash2 } from "lucide-react";
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Lesson Plan" : "New Lesson Plan"}</DialogTitle>
            <DialogDescription>
              Plan your lesson with topic, objectives, and resources
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Period (optional)</Label>
                <Input
                  value={formPeriod}
                  onChange={(e) => setFormPeriod(e.target.value)}
                  placeholder="e.g., Period 1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject (optional)</Label>
              <Select value={formSubject} onValueChange={setFormSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Topic *</Label>
              <Input
                value={formTopic}
                onChange={(e) => setFormTopic(e.target.value)}
                placeholder="What will you teach?"
              />
            </div>

            <div className="space-y-2">
              <Label>Learning Objectives</Label>
              <Textarea
                value={formObjectives}
                onChange={(e) => setFormObjectives(e.target.value)}
                placeholder="What will students learn?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Resources & Materials</Label>
              <Textarea
                value={formResources}
                onChange={(e) => setFormResources(e.target.value)}
                placeholder="Books, worksheets, videos..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            <div className="flex justify-between">
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
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={savePlan} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> Save
                </Button>
              </div>
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
