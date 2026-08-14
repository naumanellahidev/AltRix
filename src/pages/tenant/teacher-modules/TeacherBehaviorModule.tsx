import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineBehaviorNotes, useOfflineStudents, useOfflineSections, useOfflineTeacherAssignments, useOfflineClasses, useOfflineEnrollments } from "@/hooks/useOfflineData";
import { OfflineModuleWrapper } from "@/components/offline/OfflineModuleWrapper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface Section {
  id: string;
  name: string;
  class_name: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string | null;
  section_id: string;
}

interface BehaviorNote {
  id: string;
  student_id: string;
  student_name: string;
  note_type: string;
  title: string;
  content: string;
  is_shared_with_parents: boolean;
  created_at: string;
}

export function TeacherBehaviorModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => tenant.status === "ready" ? tenant.schoolId : null, [tenant.status, tenant.schoolId]);

  // Offline hooks
  const behaviorData = useOfflineBehaviorNotes(schoolId);
  const studentsData = useOfflineStudents(schoolId);
  const sectionsData = useOfflineSections(schoolId);
  const classesData = useOfflineClasses(schoolId);
  const enrollmentsData = useOfflineEnrollments(schoolId);
  const teacherAssignmentsData = useOfflineTeacherAssignments(schoolId);

  const isOffline = behaviorData.isOffline;
  const isUsingCache = behaviorData.isUsingCache || studentsData.isUsingCache;
  const loading = behaviorData.loading || studentsData.loading;

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

  // Build students in teacher's sections
  const students = useMemo(() => {
    const sectionIds = new Set(sections.map(s => s.id));
    const enrollmentMap = new Map(enrollmentsData.data.map(e => [e.studentId, e.classSectionId]));
    return studentsData.data
      .filter(s => {
        const sectionId = enrollmentMap.get(s.id);
        return sectionId && sectionIds.has(sectionId);
      })
      .map(s => ({
        id: s.id,
        first_name: s.firstName,
        last_name: s.lastName,
        section_id: enrollmentMap.get(s.id) || '',
      }));
  }, [studentsData.data, enrollmentsData.data, sections]);

  // Enrich behavior notes
  const notes = useMemo(() => {
    const studentMap = new Map(students.map(s => [s.id, `${s.first_name} ${s.last_name || ''}`]));
    const studentIds = new Set(students.map(s => s.id));
    return behaviorData.data
      .filter(n => studentIds.has(n.studentId))
      .map(n => ({
        id: n.id,
        student_id: n.studentId,
        student_name: studentMap.get(n.studentId) || 'Unknown',
        note_type: n.noteType,
        title: n.title,
        content: n.content,
        is_shared_with_parents: n.isSharedWithParents,
        created_at: n.createdAt,
      }));
  }, [behaviorData.data, students]);

  // Add note dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newNote, setNewNote] = useState({
    student_id: "",
    note_type: "observation",
    title: "",
    content: "",
    is_shared_with_parents: false,
  });

  const [filterType, setFilterType] = useState<string>("all");

  const handleAddNote = async () => {
    if (!newNote.student_id || !newNote.title.trim() || !newNote.content.trim()) {
      toast({ title: "Student, title and content are required", variant: "destructive" });
      return;
    }

    const { data: user } = await api.auth.getUser();

    const { error } = await api.from("behavior_notes").insert({
      school_id: schoolId,
      student_id: newNote.student_id,
      teacher_user_id: user.user?.id,
      note_type: newNote.note_type,
      title: newNote.title.trim(),
      content: newNote.content.trim(),
      is_shared_with_parents: newNote.is_shared_with_parents,
    });

    if (error) {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Behavior note added successfully" });
    setAddOpen(false);
    setNewNote({
      student_id: "",
      note_type: "observation",
      title: "",
      content: "",
      is_shared_with_parents: false,
    });
    behaviorData.refresh();
  };

  const deleteNote = async (id: string) => {
    const { error } = await api.from("behavior_notes").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Note deleted" });
    behaviorData.refresh();
  };

  const toggleShare = async (note: BehaviorNote) => {
    const { error } = await api
      .from("behavior_notes")
      .update({ is_shared_with_parents: !note.is_shared_with_parents })
      .eq("id", note.id);

    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: note.is_shared_with_parents ? "Unshared from parents" : "Shared with parents" });
    behaviorData.refresh();
  };

  const noteTypeColors: Record<string, string> = {
    observation: "bg-blue-100 text-blue-700",
    positive: "bg-green-100 text-green-700",
    concern: "bg-yellow-100 text-yellow-700",
    incident: "bg-red-100 text-red-700",
  };

  const filteredNotes = filterType === "all" 
    ? notes 
    : notes.filter((n) => n.note_type === filterType);

  return (
    <OfflineModuleWrapper
      isOffline={isOffline}
      isUsingCache={isUsingCache}
      loading={loading}
      hasData={sections.length > 0}
      entityName="behavior notes"
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
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="observation">Observation</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="concern">Concern</SelectItem>
                <SelectItem value="incident">Incident</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button disabled={isOffline}>
                  <Plus className="mr-2 h-4 w-4" /> Add Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Behavior Note</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Student *</Label>
                    <Select
                      value={newNote.student_id}
                      onValueChange={(v) => setNewNote((p) => ({ ...p, student_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.first_name} {s.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={newNote.note_type}
                      onValueChange={(v) => setNewNote((p) => ({ ...p, note_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="observation">Observation</SelectItem>
                        <SelectItem value="positive">Positive</SelectItem>
                        <SelectItem value="concern">Concern</SelectItem>
                        <SelectItem value="incident">Incident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Title *</Label>
                    <Input
                      value={newNote.title}
                      onChange={(e) => setNewNote((p) => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Content *</Label>
                    <Textarea
                      value={newNote.content}
                      onChange={(e) => setNewNote((p) => ({ ...p, content: e.target.value }))}
                      rows={4}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="share"
                      checked={newNote.is_shared_with_parents}
                      onCheckedChange={(v) => setNewNote((p) => ({ ...p, is_shared_with_parents: !!v }))}
                    />
                    <Label htmlFor="share" className="cursor-pointer">
                      Share with parents
                    </Label>
                  </div>
                  <Button onClick={handleAddNote} className="w-full">
                    Add Note
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Notes List */}
          <Card>
            <CardHeader>
              <CardTitle>Behavior Notes ({filteredNotes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes found.</p>
              ) : (
                <div className="space-y-3">
                  {filteredNotes.map((n) => (
                    <div key={n.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{n.title}</p>
                            <span className={`rounded px-2 py-0.5 text-xs capitalize ${noteTypeColors[n.note_type]}`}>
                              {n.note_type}
                            </span>
                            {n.is_shared_with_parents && (
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                                Shared
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{n.student_name}</p>
                          <p className="mt-2 text-sm">{n.content}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {!isOffline && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleShare(n)}
                              title={n.is_shared_with_parents ? "Unshare" : "Share with parents"}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteNote(n.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
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
