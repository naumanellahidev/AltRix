import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, Search, Clock, CheckCircle2, XCircle, Paperclip, Star, 
  MessageSquare, User, Info
} from "lucide-react";
import { format } from "date-fns";
import type { ChildInfo } from "@/hooks/useMyChildren";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";

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
  sender_user_id: string;
  resolution_note: string | null;
}

interface Props {
  child: ChildInfo | null;
  schoolId: string | null;
}

const PRIORITIES = [
  { value: "low", label: "Low Priority", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  { value: "medium", label: "Medium Priority", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "high", label: "Urgent Warning", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-350 border border-red-200/50 animate-pulse" }
];

const STATUS_TONE: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: Clock },
  in_review: { label: "In review", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",       icon: Clock },
  resolved:  { label: "Resolved",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: XCircle },
};

export default function ParentComplaintsModule({ child, schoolId }: Props) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});

  // Interaction States
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [ratingHover, setRatingHover] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState<string>("");
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");

  const load = async () => {
    if (!schoolId || !child) return;
    const { data, error } = await (supabase as any)
      .from("complaints")
      .select(
        "id, subject, content, category, status, priority, rating, rating_comment, attachments, created_at, student_id, sender_user_id, resolution_note"
      )
      .eq("school_id", schoolId)
      .eq("flow", "teacher_to_parent")
      .eq("student_id", child.student_id)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error(error);
      return;
    }
    const list = (data ?? []) as Complaint[];
    setItems(list);

    const ids = Array.from(new Set(list.map((c) => c.sender_user_id)));
    if (ids.length) {
      const { data: dir } = await supabase.rpc("get_school_user_directory", {
        _school_id: schoolId,
      });
      const map: Record<string, string> = {};
      (dir ?? []).forEach((d: any) => {
        if (ids.includes(d.user_id))
          map[d.user_id] = d.display_name || d.email || "Teacher";
      });
      setSenderNames(map);
    }
  };

  useEffect(() => {
    load();

    if (!schoolId || !child?.student_id) return;

    const complaintsChannel = supabase
      .channel(`parent_complaints_changes:${schoolId}:${child.student_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `student_id=eq.${child.student_id}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(complaintsChannel);
    };
  }, [schoolId, child?.student_id]);

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
          (senderNames[c.sender_user_id] || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, statusFilter, senderNames]);

  const respond = async (c: Complaint) => {
    const note = responses[c.id]?.trim();
    if (!note) return toast.error("Write a response first");
    
    const { error } = await (supabase as any)
      .from("complaints")
      .update({ resolution_note: note, status: "in_review" })
      .eq("id", c.id);
      
    if (error) return toast.error(error.message);

    // Send notifications to the teacher (sender_user_id) and principal
    try {
      const notifRows: any[] = [];
      
      if (c.sender_user_id) {
        notifRows.push({
          school_id: schoolId,
          user_id: c.sender_user_id,
          type: "complaint",
          title: "Parent Responded to Complaint",
          body: `A parent has responded to your complaint regarding student. Note: "${note.substring(0, 50)}${note.length > 50 ? '...' : ''}"`,
          entity_type: "complaints",
          entity_id: c.id
        });
      }
      
      const { data: staffRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .in("role", ["principal", "school_admin", "school_owner"]);
         
      const staffUserIds = Array.from(new Set((staffRoles ?? []).map(r => r.user_id).filter(Boolean)));
      
      staffUserIds.forEach(suid => {
        notifRows.push({
          school_id: schoolId,
          user_id: suid,
          type: "complaint",
          title: "Parent Responded to Complaint",
          body: `A parent responded to a teacher complaint. Note: "${note.substring(0, 50)}${note.length > 50 ? '...' : ''}"`,
          entity_type: "complaints",
          entity_id: c.id
        });
      });

      if (notifRows.length > 0) {
        await supabase.from("app_notifications").insert(notifRows);
      }
    } catch (notifErr) {
      console.warn("Failed to notify teacher/principal:", notifErr);
    }

    toast.success("Response recorded successfully");
    setResponses((p) => ({ ...p, [c.id]: "" }));
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
    
    toast.success("Thank you for your rating review!");
    setRating(0);
    setRatingComment("");
    load();
  };

  if (!child) return <p className="text-sm text-muted-foreground">Select a child first.</p>;

  // Check if there are any urgent flags unresolved
  const urgentCount = items.filter(c => c.priority === "high" && c.status !== "resolved" && c.status !== "dismissed").length;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Complaints from Teachers
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            View formal observations filed by teachers regarding {child.first_name}. You can review notes and discuss resolution steps.
          </p>
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {urgentCount > 0 && (
        <Card className="border bg-red-500/10 border-red-200 shadow-sm animate-pulse">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-red-950 text-sm">Urgent Attention Required</h4>
              <p className="text-red-900 text-xs">
                There are {urgentCount} critical flags posted by teachers concerning {child.first_name}. Please review details and coordinate with the classroom staff.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter panel */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject, category, description, or teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 border-slate-200/80 rounded-xl"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="bg-muted/50 p-1 rounded-xl">
          <TabsList className="bg-transparent border-0">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold">All Flags</TabsTrigger>
            <TabsTrigger value="open" className="rounded-lg text-xs font-semibold">Active</TabsTrigger>
            <TabsTrigger value="resolved" className="rounded-lg text-xs font-semibold">Closed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Container */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <Card className="border border-slate-100 shadow-sm">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No complaints found matching this criteria.
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((c) => {
            const tone = STATUS_TONE[c.status] || STATUS_TONE.open;
            const StatusIcon = tone.icon;
            const priorityObj = PRIORITIES.find(p => p.value === c.priority);
            const isOpen = expanded === c.id;

            return (
              <Card key={c.id} className="border border-slate-100 bg-white dark:bg-slate-900/40 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
                <div className={`h-1 w-full ${
                  c.status === "open" ? "bg-amber-500" :
                  c.status === "in_review" ? "bg-sky-500" :
                  c.status === "resolved" ? "bg-emerald-500" : "bg-slate-300"
                }`} />

                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">{c.subject}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-semibold text-slate-800 bg-slate-50 border rounded-lg py-0.5 px-2">
                          <User className="h-3 w-3 text-slate-400" />
                          Teacher: {senderNames[c.sender_user_id] || "Teacher"}
                        </span>
                        {c.category && (
                          <Badge variant="secondary" className="text-[10px] py-0.5 font-bold uppercase">
                            {c.category}
                          </Badge>
                        )}
                        <Badge className={`gap-1 text-[10px] font-bold uppercase ${priorityObj?.color || ""}`} variant="outline">
                          {priorityObj?.label || c.priority}
                        </Badge>
                        <Badge className={`gap-1 text-[10px] font-bold uppercase ${tone.cls}`} variant="outline">
                          <StatusIcon className="h-3 w-3" /> {tone.label}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">
                      {format(new Date(c.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{c.content}</p>

                  {/* Attachment links */}
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

                  {/* Resolution note */}
                  {c.resolution_note && (
                    <div className="rounded-xl border bg-emerald-50/20 border-emerald-200/50 p-4 space-y-1">
                      <p className="font-bold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Resolution / response note
                      </p>
                      <p className="text-sm text-emerald-900/90 dark:text-emerald-300">{c.resolution_note}</p>
                    </div>
                  )}

                  {/* Parent Star Rating Feedback */}
                  {c.status === "resolved" && c.rating === null && (
                    <Card className="border border-amber-200 bg-amber-500/5 p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2">
                        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                        <h4 className="font-bold text-slate-900 text-sm">Rate Resolution Satisfaction</h4>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Please rate your satisfaction with how the school staff handled and resolved this complaint:
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
                        {submittingFeedback === c.id ? "Submitting..." : "Submit Review Rating"}
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
                      <div className="border-l border-slate-200 pl-3 text-slate-600">
                        <span className="font-semibold text-slate-800">Your satisfaction rating</span>
                        {c.rating_comment && <span className="italic block mt-0.5">"{c.rating_comment}"</span>}
                      </div>
                    </div>
                  )}

                  {c.status !== "resolved" && (
                    <div className="space-y-2.5 pt-2 border-t">
                      <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-primary" /> Respond / coordinate resolution
                      </Label>
                      <Textarea
                        rows={2}
                        placeholder="Write a response or acknowledgment note to the teacher and principal…"
                        value={responses[c.id] ?? ""}
                        onChange={(e) =>
                          setResponses((p) => ({ ...p, [c.id]: e.target.value }))
                        }
                        className="text-xs rounded-xl"
                      />
                      <Button size="sm" onClick={() => respond(c)} className="font-semibold rounded-lg text-xs">
                        Send response
                      </Button>
                    </div>
                  )}

                  {/* Collapsible chat thread */}
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(isOpen ? null : c.id)}
                        className="text-xs font-semibold rounded-lg"
                      >
                        {isOpen ? "Hide discussion thread" : "Open discussion thread"}
                      </Button>
                    </div>

                    {isOpen && schoolId && (
                      <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <ComplaintThread
                          complaintId={c.id}
                          schoolId={schoolId}
                          authorRole="receiver"
                          nameLookup={senderNames}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
