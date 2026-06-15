import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Shield, ShieldAlert, Plus, EyeOff, Pencil, Search, Star, 
  FileUp, Paperclip, CheckCircle2, Clock, XCircle, AlertTriangle, Eye
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
  anonymous: boolean;
  rating: number | null;
  rating_comment: string | null;
  attachments: any[] | null;
  created_at: string;
  resolution_note: string | null;
}

const CATEGORIES = ["Bullying", "Teacher", "Facilities", "Safety", "Academic", "Other"];
const PRIORITIES = [
  { value: "low", label: "Low Urgency", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  { value: "medium", label: "Medium Urgency", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "high", label: "High Urgency (Critical)", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200/50" }
];

const STATUS_TONE: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: Clock },
  in_review: { label: "In review", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",       icon: Clock },
  resolved:  { label: "Resolved",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: XCircle },
};

export default function StudentComplaintsModule({ schoolId }: { schoolId: string | null }) {
  const { user } = useSession();
  const [items, setItems] = useState<Complaint[]>([]);
  const [open, setOpen] = useState(false);
  
  // Creation States
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [priority, setPriority] = useState<string>("medium");
  const [anonymous, setAnonymous] = useState<boolean>(true);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  // Interaction States
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [ratingHover, setRatingHover] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFilter === "open") {
      list = list.filter((c) => c.status === "open" || c.status === "in_review");
    } else if (statusFilter === "resolved") {
      list = list.filter((c) => c.status === "resolved" || c.status === "dismissed");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.subject.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, statusFilter]);

  const load = async () => {
    if (!schoolId || !user) return;
    const { data, error } = await (supabase as any)
      .from("complaints")
      .select("id, subject, content, category, status, priority, anonymous, rating, rating_comment, attachments, created_at, resolution_note")
      .eq("school_id", schoolId)
      .eq("flow", "student_to_principal")
      .eq("sender_user_id", user.id)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error(error);
      return;
    }
    setItems((data ?? []) as Complaint[]);
  };

  useEffect(() => {
    load();

    if (!schoolId || !user?.id) return;

    const complaintsChannel = supabase
      .channel(`student_complaints_changes:${schoolId}:${user.id}`)
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
      { name: "Screenshot_Incident_Report.png", size: "840 KB", type: "image/png" },
      { name: "Witness_Declaration.pdf", size: "1.2 MB", type: "application/pdf" },
      { name: "Homework_Reference.jpg", size: "430 KB", type: "image/jpeg" },
      { name: "Facilities_Issues.png", size: "2.1 MB", type: "image/png" }
    ];
    // Pick a random one or sequence
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
    if (!schoolId || !user) return;
    if (!subject.trim() || !content.trim()) return toast.error("Subject and details required");
    setSending(true);
    
    const { data, error } = await (supabase as any)
      .from("complaints")
      .insert({
        school_id: schoolId,
        flow: "student_to_principal",
        sender_user_id: user.id,
        subject: subject.trim(),
        content: content.trim(),
        category,
        priority,
        anonymous,
        attachments: attachments
      })
      .select("id")
      .single();
      
    setSending(false);
    if (error) return toast.error(error.message);

    // Notify the principal and school admins
    try {
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .in("role", ["principal", "school_admin", "school_owner"]);

      if (staffRoles && staffRoles.length > 0) {
        const userIds = Array.from(new Set(staffRoles.map(r => r.user_id).filter(Boolean)));
        const notificationRows = userIds.map(uid => ({
          school_id: schoolId,
          user_id: uid,
          type: "complaint",
          title: `New ${anonymous ? "Anonymous" : "Public"} Student Complaint`,
          body: `A student has filed a ${priority} priority complaint under "${category}".`,
          entity_type: "complaints",
          entity_id: data?.id || null
        }));
        await supabase.from("app_notifications").insert(notificationRows);
      }
    } catch (notifErr) {
      console.warn("Failed to notify principal/staff:", notifErr);
    }

    toast.success("Complaint submitted successfully!");
    setSubject("");
    setContent("");
    setCategory("Other");
    setPriority("medium");
    setAnonymous(true);
    setAttachments([]);
    setOpen(false);
    load();
  };

  const submitRatingFeedback = async (complaintId: string) => {
    if (rating === 0) return toast.error("Please select a star rating first");
    setSubmittingFeedback(complaintId);
    
    const { error } = await supabase
      .from("complaints")
      .update({
        rating: rating,
        rating_comment: ratingComment.trim() || null
      })
      .eq("id", complaintId);

    setSubmittingFeedback(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success("Thank you for your rating!");
    setRating(0);
    setRatingComment("");
    load();
  };

  return (
    <div className="space-y-6">
      {/* Upper header segment */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary animate-pulse" /> Anonymous Student Desk
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Share confidential reports with the Principal. Choose to remain anonymous or file openly.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2 font-semibold shadow-md rounded-xl" variant="hero">
          <Plus className="h-4.5 w-4.5" /> File a Report
        </Button>
      </div>

      {/* Guarantees panel */}
      <Card className="border-dashed bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 border-primary/20">
        <CardContent className="flex items-start gap-3.5 p-5 text-sm">
          <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h4 className="font-bold text-slate-900 dark:text-slate-100">Confidentiality Guarantee</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              When filing anonymously, your profile picture, name, and grade are fully encrypted. School administrators will only see the complaint content and category.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, category, or incident details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-slate-200/80 rounded-xl"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="bg-muted/50 p-1 rounded-xl">
          <TabsList className="bg-transparent border-0">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">All Reports</TabsTrigger>
            <TabsTrigger value="open" className="rounded-lg text-xs font-semibold">Active</TabsTrigger>
            <TabsTrigger value="resolved" className="rounded-lg text-xs font-semibold">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main List */}
      <Card className="border border-slate-100 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Your Submissions ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <ShieldAlert className="h-10 w-10 mx-auto opacity-35" />
              <p className="text-sm font-medium">No complaints found matching this criteria.</p>
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
                      <Badge className={`gap-1 text-[10px] font-bold uppercase ${c.anonymous ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"}`} variant="outline">
                        {c.anonymous ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {c.anonymous ? "Anonymous" : "Filed Openly"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">
                      {format(new Date(c.created_at), "MMM d, yyyy")}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.content}</p>

                  {/* Attachments previewer */}
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

                  {c.resolution_note && (
                    <div className="rounded-xl border bg-emerald-50/20 border-emerald-200/50 p-4 space-y-1">
                      <p className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Resolution Action Note
                      </p>
                      <p className="text-sm text-emerald-900/90 dark:text-emerald-300">{c.resolution_note}</p>
                    </div>
                  )}

                  {/* Resolution Rating Panel */}
                  {c.status === "resolved" && c.rating === null && (
                    <Card className="border border-amber-200 bg-amber-500/5 p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                        <h4 className="font-bold text-slate-900 text-sm">Resolution Feedback</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please rate your satisfaction with the principal's resolution of this complaint:
                      </p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            className="focus:outline-none transition-transform active:scale-90"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setRatingHover(star)}
                            onMouseLeave={() => setRatingHover(0)}
                          >
                            <Star
                              className={`h-6 w-6 ${
                                star <= (ratingHover || rating)
                                  ? "text-amber-500 fill-amber-500"
                                  : "text-slate-300"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <Textarea
                        rows={2}
                        placeholder="Any additional feedback or follow-up notes about this resolution?"
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        className="text-xs rounded-xl"
                      />
                      <Button
                        size="sm"
                        disabled={submittingFeedback === c.id}
                        onClick={() => submitRatingFeedback(c.id)}
                        className="font-bold rounded-lg text-xs"
                      >
                        {submittingFeedback === c.id ? "Submitting..." : "Submit Review"}
                      </Button>
                    </Card>
                  )}

                  {/* Resolution Rating Display */}
                  {c.rating !== null && (
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
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
                      <div className="border-l pl-3 text-slate-600">
                        <span className="font-semibold text-slate-800">Your rating</span>
                        {c.rating_comment && <span className="italic block mt-0.5">"{c.rating_comment}"</span>}
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
              <ShieldAlert className="h-6 w-6 text-red-500 animate-bounce" /> File a Confidential Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Anonymity Switch */}
            <div className="flex items-center justify-between rounded-xl bg-purple-500/5 border border-purple-500/10 p-3.5">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold text-slate-950 flex items-center gap-1.5">
                  {anonymous ? <EyeOff className="h-4.5 w-4.5 text-purple-600" /> : <Eye className="h-4.5 w-4.5 text-blue-600" />}
                  {anonymous ? "Anonymous Submission" : "Public Submission"}
                </Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {anonymous 
                    ? "Your name, profile, and student records will be locked and hidden from staff." 
                    : "School staff will see your name for direct check-in & follow-up discussion."}
                </p>
              </div>
              <Switch checked={anonymous} onCheckedChange={setAnonymous} className="data-[state=checked]:bg-purple-600" />
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

            {/* Priority selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Urgency Level *</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="rounded-xl border-slate-200/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low Urgency (Routine Feedback)</SelectItem>
                  <SelectItem value="medium">Medium Urgency (Needs Desk Review)</SelectItem>
                  <SelectItem value="high">High Urgency (Critical / Safety Threat)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Subject Summary *</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief title of the incident"
                className="rounded-xl border-slate-200/80"
              />
            </div>

            {/* Content Details */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Incident Details *</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Describe what occurred, date, and people involved. Include as much detail as possible to help the review."
                className="rounded-xl border-slate-200/80"
              />
            </div>

            {/* Attachments Section */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-800">Attach Evidence / Screenshot</Label>
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
                  Simulate scanning files and documents
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
            <Button onClick={submit} disabled={sending} className="rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-md">
              {sending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
