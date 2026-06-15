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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, Send, AlertTriangle, Pencil, Search, Clock, CheckCircle2, 
  XCircle, Paperclip, FileUp, Star, UserCheck
} from "lucide-react";
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
  priority: string;
  rating: number | null;
  rating_comment: string | null;
  attachments: any[] | null;
  created_at: string;
  student_id: string | null;
  resolution_note: string | null;
}

const CATEGORIES = ["Behavior", "Homework", "Attendance", "Discipline", "Academic", "Other"];
const PRIORITIES = [
  { value: "low", label: "Low Priority", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  { value: "medium", label: "Medium Priority", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "high", label: "High Priority", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200/50" }
];

const STATUS_TONE: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: Clock },
  in_review: { label: "In review", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",       icon: Clock },
  resolved:  { label: "Resolved",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: XCircle },
};

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
  const [priority, setPriority] = useState("medium");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [studentSearchInput, setStudentSearchInput] = useState("");

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

  // Filter student list in search dropdown
  const filteredStudents = useMemo(() => {
    if (!studentSearchInput.trim()) return myStudents;
    const q = studentSearchInput.toLowerCase();
    return myStudents.filter(s => s.name.toLowerCase().includes(q) || s.label.toLowerCase().includes(q));
  }, [myStudents, studentSearchInput]);

  const studentNameMap = useMemo(
    () => new Map(myStudents.map((s) => [s.id, `${s.name} • ${s.label}`])),
    [myStudents]
  );

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFilter === "open") {
      list = list.filter((c) => c.status === "open" || c.status === "in_review");
    } else if (statusFilter === "resolved") {
      list = list.filter((c) => c.status === "resolved" || c.status === "dismissed");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          (c.category || "").toLowerCase().includes(q) ||
          (studentNameMap.get(c.student_id ?? "") || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, statusFilter, studentNameMap]);

  const load = async () => {
    if (!schoolId || !user) return;
    const { data } = await (supabase as any)
      .from("complaints")
      .select("id, subject, content, category, status, priority, rating, rating_comment, attachments, created_at, student_id, resolution_note")
      .eq("school_id", schoolId)
      .eq("flow", "teacher_to_parent")
      .eq("sender_user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Complaint[]);
  };

  useEffect(() => {
    load();

    if (!schoolId || !user?.id) return;

    const complaintsChannel = supabase
      .channel(`teacher_complaints_changes:${schoolId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `sender_user_id=eq.${user.id}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(complaintsChannel);
    };
  }, [schoolId, user?.id]);

  const addMockAttachment = () => {
    const fileOptions = [
      { name: "Attendance_Sheet_Redacted.png", size: "720 KB", type: "image/png" },
      { name: "Homework_Copy_Blank.pdf", size: "1.4 MB", type: "application/pdf" },
      { name: "Incident_Report_Log.docx", size: "120 KB", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      { name: "Class_Disturbance_Photo.jpg", size: "1.8 MB", type: "image/jpeg" }
    ];
    const randomFile = fileOptions[attachments.length % fileOptions.length];
    const newAttach = {
      ...randomFile,
      id: Math.random().toString(36).substring(7),
      uploadedAt: new Date().toISOString()
    };
    setAttachments([...attachments, newAttach]);
    toast.success(`Attached ${randomFile.name}`);
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const submit = async () => {
    if (!schoolId || !user || !studentId || !subject.trim() || !content.trim()) {
      return toast.error("Pick a student and add subject + details");
    }
    setSending(true);
    const { data, error } = await (supabase as any)
      .from("complaints")
      .insert({
        school_id: schoolId,
        flow: "teacher_to_parent",
        sender_user_id: user.id,
        student_id: studentId,
        subject: subject.trim(),
        content: content.trim(),
        category,
        priority,
        anonymous: false,
        attachments: attachments
      })
      .select("id")
      .single();
    setSending(false);
    if (error) return toast.error(error.message);

    // Notify guardians & principal
    try {
      const { data: guardians } = await supabase
        .from("student_guardians")
        .select("user_id")
        .eq("student_id", studentId);

      const parentUserIds = Array.from(new Set((guardians ?? []).map(g => g.user_id).filter(Boolean)));
      
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .in("role", ["principal", "school_admin", "school_owner"]);
      
      const staffUserIds = Array.from(new Set((staffRoles ?? []).map(r => r.user_id).filter(Boolean)));
      
      const notifRows: any[] = [];
      
      // Notify parents
      parentUserIds.forEach(puid => {
        notifRows.push({
          school_id: schoolId,
          user_id: puid,
          type: "complaint",
          title: `Urgent Student Flag: ${category}`,
          body: `A teacher has submitted a complaint regarding your child. Subject: ${subject.trim()}`,
          entity_type: "complaints",
          entity_id: data?.id || null
        });
      });
      
      // Notify principal/admins
      staffUserIds.forEach(suid => {
        notifRows.push({
          school_id: schoolId,
          user_id: suid,
          type: "complaint",
          title: "New Teacher-to-Parent Complaint",
          body: `A teacher has submitted a student complaint. Subject: ${subject.trim()}`,
          entity_type: "complaints",
          entity_id: data?.id || null
        });
      });

      if (notifRows.length > 0) {
        await supabase.from("app_notifications").insert(notifRows);
      }
    } catch (notifErr) {
      console.warn("Failed to notify parent/principal about teacher complaint:", notifErr);
    }

    toast.success("Complaint sent to parent and principal");
    setStudentId("");
    setSubject("");
    setContent("");
    setCategory("Behavior");
    setPriority("medium");
    setAttachments([]);
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Complaints to Parents
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log formal behavioral, homework, or discipline reports. Routed to guardians and the principal desk.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 font-semibold shadow-md rounded-xl">
          <Plus className="h-4.5 w-4.5" /> Log Incident
        </Button>
      </div>

      {/* Filter panel */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, category, or student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-slate-200/80 rounded-xl"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="bg-muted/50 p-1 rounded-xl">
          <TabsList className="bg-transparent border-0">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">All Logged</TabsTrigger>
            <TabsTrigger value="open" className="rounded-lg text-xs font-semibold">Active</TabsTrigger>
            <TabsTrigger value="resolved" className="rounded-lg text-xs font-semibold">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Card */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Your Logged Complaints ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <UserCheck className="h-10 w-10 mx-auto opacity-35" />
              <p className="text-sm font-medium">No complaints logged yet.</p>
            </div>
          ) : (
            filteredItems.map((c) => {
              const editable = c.status === "open";
              const isOpen = expanded === c.id;
              const tone = STATUS_TONE[c.status] || STATUS_TONE.open;
              const StatusIcon = tone.icon;
              const priorityObj = PRIORITIES.find(p => p.value === c.priority);

              return (
                <div key={c.id} className="rounded-2xl border border-slate-100 bg-white dark:bg-slate-900/40 p-5 shadow-sm space-y-4 hover:shadow-md transition-all duration-300">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">{c.subject}</h3>
                      <Badge variant="secondary" className="text-[10px] py-0.5 px-2 font-bold uppercase">
                        {c.category}
                      </Badge>
                      <Badge className={`gap-1 text-[10px] font-bold uppercase ${priorityObj?.color || ""}`} variant="outline">
                        {priorityObj?.label || c.priority}
                      </Badge>
                      <Badge className={`gap-1 text-[10px] font-bold uppercase ${tone.cls}`} variant="outline">
                        <StatusIcon className="h-3 w-3" /> {tone.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">
                      {format(new Date(c.created_at), "MMM d, yyyy")}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground bg-slate-50 border rounded-lg px-3 py-1.5 font-medium inline-block">
                    Target Student: <span className="font-bold text-slate-800">{studentNameMap.get(c.student_id ?? "") || "Student"}</span>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.content}</p>

                  {/* Attachment lists */}
                  {c.attachments && c.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {c.attachments.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-slate-50 border rounded-lg py-1 px-2.5 text-xs font-semibold text-slate-700">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span>{file.name}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">({file.size})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Principal Note */}
                  {c.resolution_note && (
                    <div className="rounded-xl border bg-emerald-50/20 border-emerald-200/50 p-4 space-y-1">
                      <p className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Principal Desk Resolution Note
                      </p>
                      <p className="text-sm text-emerald-900/90 dark:text-emerald-300">{c.resolution_note}</p>
                    </div>
                  )}

                  {/* Ratings Display */}
                  {c.rating !== null && (
                    <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-200/50 rounded-xl p-3 text-xs">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4.5 w-4.5 ${
                              star <= (c.rating ?? 0) ? "text-amber-500 fill-amber-500" : "text-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                      <div className="border-l border-amber-200/65 pl-3 text-slate-600">
                        <span className="font-bold text-slate-800">Parent Satisfaction Review Rating</span>
                        {c.rating_comment && <span className="italic block mt-0.5 font-medium text-slate-700">"{c.rating_comment}"</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1 border-t">
                    {editable && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)} className="gap-1.5 rounded-lg text-xs font-semibold">
                        <Pencil className="h-3.5 w-3.5" /> Edit details
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="rounded-lg text-xs font-semibold"
                    >
                      {isOpen ? "Hide replies" : "Discuss / Post replies"}
                    </Button>
                  </div>

                  {isOpen && schoolId && (
                    <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <ComplaintThread
                        complaintId={c.id}
                        schoolId={schoolId}
                        authorRole="sender"
                        nameLookup={Object.fromEntries(myStudents.map(s => [s.id, s.name]))}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
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
        <DialogContent className="max-w-lg bg-card/95 backdrop-blur-md rounded-2xl border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold font-display text-slate-900">
              <AlertTriangle className="h-6 w-6 text-amber-500 animate-pulse" /> File Parent Flag/Complaint
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Student Search and select */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Search & Select Student *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type student name to filter list below..."
                  value={studentSearchInput}
                  onChange={(e) => setStudentSearchInput(e.target.value)}
                  className="pl-9 h-9 border-slate-200/80 rounded-xl text-xs"
                />
              </div>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger className="rounded-xl border-slate-200/80">
                  <SelectValue placeholder="Choose target student" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {filteredStudents.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">No students found</div>
                  ) : (
                    filteredStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} • {s.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Category selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="rounded-xl border-slate-200/80">
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

            {/* Urgency/Priority level */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Urgency Level *</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="rounded-xl border-slate-200/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low Priority (General Update)</SelectItem>
                  <SelectItem value="medium">Medium Priority (Requires Parent Acknowledgment)</SelectItem>
                  <SelectItem value="high">High Priority (Urgent Contact Needed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Subject Summary *</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue (e.g. Incomplete homework, misbehavior)"
                className="rounded-xl border-slate-200/80"
              />
            </div>

            {/* Content Details */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Details & Observations *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Please describe details of observations, date, and suggested action parent should take."
                className="rounded-xl border-slate-200/80"
              />
            </div>

            {/* Attachments Section */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-800">Attach Supporting Evidence (Optional)</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMockAttachment}
                  className="gap-1.5 text-xs font-semibold rounded-lg"
                >
                  <FileUp className="h-4 w-4" /> Add mock file
                </Button>
                <span className="text-[10px] text-muted-foreground self-center italic">
                  Attach classroom logs or student worksheets
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-1.5 pt-1 border border-slate-100 rounded-xl p-2.5 bg-slate-50/50">
                  {attachments.map((file) => (
                    <div key={file.id} className="flex items-center justify-between text-xs bg-white border rounded-lg p-2 shadow-sm">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                        <span>{file.name}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">({file.size})</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-6 w-6 p-0 hover:bg-red-50 hover:text-red-500 rounded-md"
                        onClick={() => removeAttachment(file.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl text-xs font-semibold">
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending} className="rounded-xl text-xs font-semibold shadow-md">
              {sending ? "Sending..." : "Submit Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeacherComplaintsModule;
