import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineHomework, useOfflineSections, useOfflineTeacherAssignments, useOfflineClasses } from "@/hooks/useOfflineData";
import { OfflineModuleWrapper } from "@/components/offline/OfflineModuleWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Homework {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  class_section_id: string;
  section_name: string;
}

export function TeacherHomeworkModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => tenant.status === "ready" ? tenant.schoolId : null, [tenant.status, tenant.schoolId]);

  // Offline hooks
  const homeworkData = useOfflineHomework(schoolId);
  const sectionsData = useOfflineSections(schoolId);
  const classesData = useOfflineClasses(schoolId);
  const teacherAssignmentsData = useOfflineTeacherAssignments(schoolId);

  const isOffline = homeworkData.isOffline;
  const isUsingCache = homeworkData.isUsingCache || sectionsData.isUsingCache;
  const loading = homeworkData.loading || sectionsData.loading;

  // Build section labels
  const sections = useMemo(() => {
    const classMap = new Map(classesData.data.map(c => [c.id, c.name]));
    const teacherSectionIds = new Set(teacherAssignmentsData.data.map(a => a.classSectionId));
    return sectionsData.data
      .filter(s => teacherSectionIds.has(s.id))
      .map(s => ({
        id: s.id,
        name: s.name,
        class_name: classMap.get(s.classId) || 'Class',
      }));
  }, [sectionsData.data, classesData.data, teacherAssignmentsData.data]);

  // Enrich homework with section labels
  const homework = useMemo(() => {
    const sectionMap = new Map(sections.map(s => [s.id, `${s.class_name} - ${s.name}`]));
    const sectionIds = new Set(sections.map(s => s.id));
    return homeworkData.data
      .filter(h => sectionIds.has(h.classSectionId))
      .map(h => ({
        id: h.id,
        title: h.title,
        description: h.description,
        due_date: h.dueDate,
        status: h.status,
        class_section_id: h.classSectionId,
        section_name: sectionMap.get(h.classSectionId) || '',
      }));
  }, [homeworkData.data, sections]);

  // Add homework dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newHomework, setNewHomework] = useState({
    title: "",
    description: "",
    due_date: "",
    class_section_id: "",
  });

  const [filterSection, setFilterSection] = useState<string>("all");

  const handleAddHomework = async () => {
    if (!newHomework.title.trim() || !newHomework.due_date || !newHomework.class_section_id) {
      toast({ title: "Title, section and due date are required", variant: "destructive" });
      return;
    }

    const { data: user } = await api.auth.getUser();

    const { error } = await api.from("homework").insert({
      school_id: schoolId,
      class_section_id: newHomework.class_section_id,
      teacher_user_id: user.user?.id,
      title: newHomework.title.trim(),
      description: newHomework.description.trim() || null,
      due_date: newHomework.due_date,
    });

    if (error) {
      toast({ title: "Failed to add homework", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Homework added successfully" });
    setAddOpen(false);
    setNewHomework({ title: "", description: "", due_date: "", class_section_id: "" });
    homeworkData.refresh();
  };

  const markCompleted = async (id: string) => {
    const { error } = await api.from("homework").update({ status: "completed" }).eq("id", id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marked as completed" });
    homeworkData.refresh();
  };

  const deleteHomework = async (id: string) => {
    const { error } = await api.from("homework").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Homework deleted" });
    homeworkData.refresh();
  };

  const filteredHomework = filterSection === "all" 
    ? homework 
    : homework.filter((h) => h.class_section_id === filterSection);

  return (
    <OfflineModuleWrapper
      isOffline={isOffline}
      isUsingCache={isUsingCache}
      loading={loading}
      hasData={sections.length > 0}
      entityName="homework"
    >
      {sections.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No classes assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
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
                <Button disabled={isOffline}>
                  <Plus className="mr-2 h-4 w-4" /> Add Homework
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Homework</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Section *</Label>
                    <Select
                      value={newHomework.class_section_id}
                      onValueChange={(v) => setNewHomework((p) => ({ ...p, class_section_id: v }))}
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
                      value={newHomework.title}
                      onChange={(e) => setNewHomework((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={newHomework.description}
                      onChange={(e) => setNewHomework((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Due Date *</Label>
                    <Input
                      type="date"
                      value={newHomework.due_date}
                      onChange={(e) => setNewHomework((p) => ({ ...p, due_date: e.target.value }))}
                    />
                  </div>
                  <Button onClick={handleAddHomework} className="w-full">
                    Add Homework
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Homework List */}
          <Card>
            <CardHeader>
              <CardTitle>Homework ({filteredHomework.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredHomework.length === 0 ? (
                <p className="text-sm text-muted-foreground">No homework found.</p>
              ) : (
                <div className="space-y-3">
                  {filteredHomework.map((h) => (
                    <div
                      key={h.id}
                      className={`rounded-lg border p-4 ${h.status === "completed" ? "bg-muted/50" : ""}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{h.title}</p>
                          <p className="text-sm text-muted-foreground">{h.section_name}</p>
                          {h.description && <p className="mt-2 text-sm">{h.description}</p>}
                          <p className="mt-2 text-xs text-muted-foreground">Due: {h.due_date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              h.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {h.status}
                          </span>
                          {h.status === "active" && !isOffline && (
                            <Button size="sm" variant="outline" onClick={() => markCompleted(h.id)}>
                              Mark Done
                            </Button>
                          )}
                          {!isOffline && (
                            <Button size="sm" variant="ghost" onClick={() => deleteHomework(h.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </OfflineModuleWrapper>
  );
}
