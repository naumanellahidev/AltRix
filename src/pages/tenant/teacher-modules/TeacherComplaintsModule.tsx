import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import {
  useOfflineStudents,
  useOfflineSections,
  useOfflineTeacherAssignments,
  useOfflineEnrollments,
  useOfflineClasses,
} from "@/hooks/useOfflineData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Send, AlertTriangle, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";
import { EditComplaintDialog } from "@/components/complaints/EditComplaintDialog";

interface Complaint {
  id: string;
  subject: string;
  content: string;
  category: string | null;
  status: string;
  created_at: string;
  student_id: string | null;
  resolution_note: string | null;
}

const CATEGORIES = ["Behavior", "Homework", "Attendance", "Discipline", "Academic", "Other"];

export function TeacherComplaintsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const studentsData = useOfflineStudents(schoolId);
  const sectionsData = useOfflineSections(schoolId);
  const classesData = useOfflineClasses(schoolId);
  const enrollmentsData = useOfflineEnrollments(schoolId);
  const teacherAssignmentsData = useOfflineTeacherAssignments(schoolId);

  const [items, setItems] = useState<Complaint[]>([]);
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Behavior");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Build students in teacher's sections
  const myStudents = useMemo(() => {
    const teacherSectionIds = new Set(
      teacherAssignmentsData.data.map((a) => a.classSectionId)
    );
    const enrollmentMap = new Map(
      enrollmentsData.data.map((e) => [e.studentId, e.classSectionId])
    );
    const classMap = new Map(classesData.data.map((c) => [c.id, c.name]));
    const sectionMap = new Map(sectionsData.data.map((s) => [s.id, s]));
    return studentsData.data
      .filter((s) => {
        const secId = enrollmentMap.get(s.id);
        return secId && teacherSectionIds.has(secId);
      })
      .map((s) => {
        const secId = enrollmentMap.get(s.id);
        const sec = secId ? sectionMap.get(secId) : null;
        const cls = sec ? classMap.get(sec.classId) : "";
        return {
          id: s.id,
          name: `${s.firstName} ${s.lastName ?? ""}`.trim(),
          label: [cls, sec?.name].filter(Boolean).join(" / "),
        };
      });
  }, [
    studentsData.data,
    enrollmentsData.data,
    teacherAssignmentsData.data,
    sectionsData.data,
    classesData.data,
  ]);

  const studentNameMap = useMemo(
    () => new Map(myStudents.map((s) => [s.id, `${s.name} • ${s.label}`])),
    [myStudents]
  );

  const load = async () => {
    if (!schoolId || !user) return;
    const { data } = await (supabase as any)
      .from("complaints")
      .select(
        "id, subject, content, category, status, created_at, student_id, resolution_note"
      )
      .eq("school_id", schoolId)
      .eq("flow", "teacher_to_parent")
      .eq("sender_user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Complaint[]);
  };

  useEffect(() => {
    load();
  }, [schoolId, user?.id]);

  const submit = async () => {
    if (!schoolId || !user || !studentId || !subject.trim() || !content.trim()) {
      return toast.error("Pick a student and add subject + details");
    }
    setSending(true);
    const { error } = await (supabase as any).from("complaints").insert({
      school_id: schoolId,
      flow: "teacher_to_parent",
      sender_user_id: user.id,
      student_id: studentId,
      subject: subject.trim(),
      content: content.trim(),
      category,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Complaint sent to parent and principal");
    setStudentId("");
    setSubject("");
    setContent("");
    setCategory("Behavior");
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Complaints to Parents
          </h2>
          <p className="text-sm text-muted-foreground">
            Formal complaints with full details. Goes to the student's guardians and the
            principal.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your complaints ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No complaints filed yet.</p>
          )}
          {items.map((c) => {
            const editable = c.status !== "resolved" && c.status !== "dismissed";
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.subject}</p>
                  {c.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {c.category}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {c.status.replace("_", " ")}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(c.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  About: {studentNameMap.get(c.student_id ?? "") || "Student"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.content}</p>
                {c.resolution_note && (
                  <p className="mt-2 rounded bg-muted/50 p-2 text-sm">
                    <strong>Principal's response:</strong> {c.resolution_note}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {editable && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    {isOpen ? "Hide" : "Show"} feedback
                  </Button>
                </div>
                {isOpen && schoolId && (
                  <div className="mt-3">
                    <ComplaintThread
                      complaintId={c.id}
                      schoolId={schoolId}
                      authorRole="sender"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <EditComplaintDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        complaint={editing}
        categories={CATEGORIES}
        onSaved={load}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File complaint to parent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Student *</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a student" />
                </SelectTrigger>
                <SelectContent>
                  {myStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} • {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Describe the incident, dates, and what action you'd like."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending} className="gap-2">
              <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeacherComplaintsModule;
