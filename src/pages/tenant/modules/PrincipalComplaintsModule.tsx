import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield, AlertTriangle, EyeOff, Search, CheckCircle2, Clock, XCircle, Sparkles,
  Paperclip, Star, ArrowRight, Activity, Calendar, ShieldAlert, Eye, MessageSquare,
  UserCheck
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ComplaintThread } from "@/components/complaints/ComplaintThread";

interface PrincipalComplaint {
  id: string;
  flow: string;
  sender_user_id: string | null;
  student_id: string | null;
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

const STATUS_TONE: Record<string, { label: string; cls: string; icon: any }> = {
  open:      { label: "Open",      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", icon: Clock },
  in_review: { label: "In review", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",       icon: Clock },
  resolved:  { label: "Resolved",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: XCircle },
};

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
  { value: "medium", label: "Medium", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "high", label: "High (Urgent)", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-350 border border-red-200/50" }
];

export default function PrincipalComplaintsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [items, setItems] = useState<PrincipalComplaint[]>([]);
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Detail Drawer / Dialog State
  const [selectedComplaint, setSelectedComplaint] = useState<PrincipalComplaint | null>(null);

  const load = async () => {
    if (!schoolId) return;
    const { data, error } = await (supabase as any)
      .from("complaints_principal_view")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
      
    if (error) { 
      toast.error(error.message); 
      return; 
    }
    const list = (data ?? []) as PrincipalComplaint[];
    setItems(list);

    const sids = Array.from(new Set(list.map((c) => c.student_id).filter(Boolean) as string[]));
    if (sids.length) {
      const { data: stu } = await supabase.from("students").select("id, first_name, last_name").in("id", sids);
      const m: Record<string, string> = {};
      (stu ?? []).forEach((s: any) => { m[s.id] = `${s.first_name} ${s.last_name ?? ""}`.trim(); });
      setStudentNames(m);
    }

    const senderIds = Array.from(new Set(list.map((c) => c.sender_user_id).filter(Boolean) as string[]));
    if (senderIds.length) {
      const { data: dir } = await supabase.rpc("get_school_user_directory", { _school_id: schoolId });
      const m: Record<string, string> = {};
      (dir ?? []).forEach((d: any) => {
        if (senderIds.includes(d.user_id)) m[d.user_id] = d.display_name || d.email || "Member";
      });
      setSenderNames(m);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  // Sync state with selected item if updated in list
  useEffect(() => {
    if (selectedComplaint) {
      const fresh = items.find(i => i.id === selectedComplaint.id);
      if (fresh) setSelectedComplaint(fresh);
    }
  }, [items]);

  // Real-time synchronization for complaints & feedbacks
  useEffect(() => {
    if (!schoolId) return;

    const complaintsChannel = supabase
      .channel(`principal_complaints_changes:${schoolId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `school_id=eq.${schoolId}` },
        () => {
          void load();
        }
      )
      .subscribe();

    const feedbacksChannel = supabase
      .channel(`principal_feedbacks_changes:${schoolId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_feedbacks", filter: `school_id=eq.${schoolId}` },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(complaintsChannel);
      void supabase.removeChannel(feedbacksChannel);
    };
  }, [schoolId]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from("complaints")
      .update({
        status,
        resolution_note: drafts[id] ?? undefined,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
      
    if (error) return toast.error(error.message);

    // Notify the sender about status change
    const complaintObj = items.find(c => c.id === id);
    if (complaintObj?.sender_user_id) {
      try {
        await supabase.from("app_notifications").insert({
          school_id: schoolId,
          user_id: complaintObj.sender_user_id,
          type: "complaint",
          title: `Report status: ${status.replace("_", " ").toUpperCase()}`,
          body: `Your complaint status was updated to "${status.replace("_", " ")}".${drafts[id] ? ` Note: ${drafts[id]}` : ""}`,
          entity_type: "complaints",
          entity_id: id
        });
      } catch (notifErr) {
        console.warn("Failed to notify sender:", notifErr);
      }
    }

    toast.success(`Marked as ${status.replace("_", " ")}`);
    // Clear draft note
    setDrafts(p => {
      const copy = { ...p };
      delete copy[id];
      return copy;
    });
    load();
  };

  const applyFilters = (list: PrincipalComplaint[]) => {
    let l = list;
    if (statusFilter === "open") l = l.filter((c) => c.status === "open" || c.status === "in_review");
    if (statusFilter === "resolved") l = l.filter((c) => c.status === "resolved" || c.status === "dismissed");
    if (priorityFilter !== "all") l = l.filter((c) => c.priority === priorityFilter);
    if (categoryFilter !== "all") l = l.filter((c) => c.category === categoryFilter);
    
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter((c) =>
        c.subject.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q),
      );
    }
    return l;
  };

  const anonItems = useMemo(() => applyFilters(items.filter((c) => c.flow === "student_to_principal")),
    [items, search, statusFilter, priorityFilter, categoryFilter]);
  const teacherItems = useMemo(() => applyFilters(items.filter((c) => c.flow === "teacher_to_parent")),
    [items, search, statusFilter, priorityFilter, categoryFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const open = items.filter((c) => c.status === "open" || c.status === "in_review").length;
    const resolved = items.filter((c) => c.status === "resolved").length;
    const critical = items.filter((c) => c.priority === "high" && (c.status === "open" || c.status === "in_review")).length;
    
    // Calculate resolution satisfaction rate
    const ratedComplaints = items.filter(c => c.rating !== null && c.rating > 0);
    const avgRating = ratedComplaints.length > 0 
      ? (ratedComplaints.reduce((acc, curr) => acc + (curr.rating ?? 0), 0) / ratedComplaints.length).toFixed(1)
      : "—";

    return { total, open, resolved, critical, avgRating };
  }, [items]);

  const uniqueCategories = useMemo(() => {
    const cats = items.map(i => i.category).filter(Boolean) as string[];
    return Array.from(new Set(cats));
  }, [items]);

  const renderCard = (c: PrincipalComplaint, anonymous: boolean) => {
    const tone = STATUS_TONE[c.status] || STATUS_TONE.open;
    const Icon = tone.icon;
    const priorityObj = PRIORITIES.find(p => p.value === c.priority);
    const isUrgent = c.priority === "high" && c.status !== "resolved";

    return (
      <Card 
        key={c.id} 
        onClick={() => setSelectedComplaint(c)}
        className={`card-premium overflow-hidden cursor-pointer hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm relative ${
          isUrgent ? "border-red-200/80 bg-red-500/[0.01]" : ""
        }`}
      >
        {isUrgent && (
          <div className="absolute top-2 right-2 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </div>
        )}
        <div className={`h-1 w-full ${
          c.status === "open" ? "bg-amber-500" :
          c.status === "in_review" ? "bg-sky-500" :
          c.status === "resolved" ? "bg-emerald-500" : "bg-slate-300"
        }`} />
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">{c.subject}</h3>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                {anonymous ? (
                  <Badge variant="secondary" className="gap-1 text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold uppercase">
                    <EyeOff className="h-3 w-3" /> Anonymous student
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] font-bold uppercase">
                    From {senderNames[c.sender_user_id ?? ""] || "Teacher"}
                  </Badge>
                )}
                {c.student_id && (
                  <Badge variant="outline" className="text-[10px] font-semibold">About: {studentNames[c.student_id] || "Student"}</Badge>
                )}
                {c.category && <Badge variant="outline" className="text-[10px] font-semibold">{c.category}</Badge>}
                <Badge className={`gap-1 text-[10px] font-bold uppercase ${priorityObj?.color || ""}`} variant="outline">
                  {priorityObj?.label || c.priority}
                </Badge>
                <Badge className={`gap-1 text-[10px] font-bold uppercase ${tone.cls}`} variant="outline">
                  <Icon className="h-3 w-3" /> {tone.label}
                </Badge>
                {c.rating !== null && (
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-0.5 text-[10px] font-bold" variant="outline">
                    ★ {c.rating}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <p className="whitespace-pre-wrap text-xs text-muted-foreground/90 leading-relaxed line-clamp-3">{c.content}</p>

          <div className="flex justify-between items-center text-[10px] text-muted-foreground font-medium border-t pt-2.5">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(c.created_at), "MMM d, yyyy")}
            </span>
            <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const EmptyState = ({ label }: { label: string }) => (
    <Card className="card-premium border-dashed">
      <CardContent className="py-16 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Shield className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">{label}</p>
        <p className="text-xs text-muted-foreground mt-1">No reports matching selected filters.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-background p-6 md:p-8 shadow-sm">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary dark:text-primary-foreground font-bold">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" /> Principal Desk
            </div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight mt-2 text-slate-900 dark:text-slate-100">Complaints Governance Hub</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-lg leading-relaxed">
              Oversee anonymous student reports and teacher behavior updates. Syncing real-time records securely across all desks.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            <StatChip label="Total Filed" value={stats.total} />
            <StatChip label="Open Cases" value={stats.open} tone="warning" />
            <StatChip label="Resolved" value={stats.resolved} tone="success" />
            <StatChip label="Urgent Critical" value={stats.critical} tone="error" />
            <StatChip label="Resolution rating" value={stats.avgRating === "—" ? "—" : `${stats.avgRating}/5`} tone="stars" />
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="border border-slate-100 shadow-sm bg-white">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subject, content, categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 border-slate-200/80 rounded-xl"
            />
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="border-slate-200/80 rounded-xl h-10 text-xs w-full min-w-[120px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High Only</SelectItem>
                <SelectItem value="medium">Medium Only</SelectItem>
                <SelectItem value="low">Low Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="border-slate-200/80 rounded-xl h-10 text-xs w-full min-w-[120px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Tabs */}
            <div className="col-span-2 sm:col-span-1">
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="bg-muted/60 p-0.5 rounded-xl h-10 flex items-center justify-center">
                <TabsList className="bg-transparent border-0 h-full w-full">
                  <TabsTrigger value="all" className="rounded-lg text-xs font-semibold h-full flex-1">All</TabsTrigger>
                  <TabsTrigger value="open" className="rounded-lg text-xs font-semibold h-full flex-1">Open</TabsTrigger>
                  <TabsTrigger value="resolved" className="rounded-lg text-xs font-semibold h-full flex-1">Closed</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="anon" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="anon" className="gap-2 rounded-lg text-xs font-bold">
            <Shield className="h-4 w-4" /> Anonymous reports from Students ({anonItems.length})
          </TabsTrigger>
          <TabsTrigger value="teacher" className="gap-2 rounded-lg text-xs font-bold">
            <AlertTriangle className="h-4 w-4" /> Reports from Teachers ({teacherItems.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="anon" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {anonItems.length === 0 ? (
            <div className="col-span-full"><EmptyState label="No anonymous complaints" /></div>
          ) : (
            anonItems.map((c) => renderCard(c, true))
          )}
        </TabsContent>
        <TabsContent value="teacher" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teacherItems.length === 0 ? (
            <div className="col-span-full"><EmptyState label="No teacher complaints" /></div>
          ) : (
            teacherItems.map((c) => renderCard(c, false))
          )}
        </TabsContent>
      </Tabs>

      {/* Side Detail Dialog Drawer */}
      <Dialog open={!!selectedComplaint} onOpenChange={(open) => !open && setSelectedComplaint(null)}>
        <DialogContent className="max-w-4xl bg-card/95 backdrop-blur-md rounded-2xl border shadow-2xl p-6 h-[85vh] overflow-hidden flex flex-col">
          {selectedComplaint && (
            <>
              <DialogHeader className="border-b pb-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
                  <div className="space-y-1">
                    <DialogTitle className="text-xl font-bold font-display tracking-tight flex items-center gap-2 text-slate-950">
                      {selectedComplaint.priority === "high" ? <ShieldAlert className="h-5.5 w-5.5 text-red-500" /> : <Shield className="h-5.5 w-5.5 text-primary" />}
                      {selectedComplaint.subject}
                    </DialogTitle>
                    <DialogDescription className="text-xs font-medium text-slate-500">
                      Opened {format(new Date(selectedComplaint.created_at), "PPPP")} • {formatDistanceToNow(new Date(selectedComplaint.created_at), { addSuffix: true })}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Scrollable details body */}
              <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 py-4 pr-1">
                {/* Left panel: Info & Actions */}
                <div className="lg:col-span-6 space-y-5">
                  {/* Status Timeline Progress Bar */}
                  <div className="rounded-xl border p-4 bg-slate-50/50 space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Processing Timeline</h4>
                    <div className="flex items-center justify-between relative pt-2">
                      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
                      <div className={`absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 z-0 transition-all duration-500 ${
                        selectedComplaint.status === "open" ? "w-[10%]" :
                        selectedComplaint.status === "in_review" ? "w-[50%]" : "w-[100%]"
                      }`} />
                      
                      <div className="flex flex-col items-center z-10 relative">
                        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-md">1</div>
                        <span className="text-[10px] font-bold text-slate-900 mt-1">Submitted</span>
                      </div>

                      <div className="flex flex-col items-center z-10 relative">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all duration-300 ${
                          selectedComplaint.status !== "open" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>2</div>
                        <span className={`text-[10px] font-bold mt-1 ${selectedComplaint.status !== "open" ? "text-slate-900" : "text-slate-400"}`}>In Review</span>
                      </div>

                      <div className="flex flex-col items-center z-10 relative">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md transition-all duration-300 ${
                          selectedComplaint.status === "resolved" || selectedComplaint.status === "dismissed" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}>3</div>
                        <span className={`text-[10px] font-bold mt-1 ${selectedComplaint.status === "resolved" || selectedComplaint.status === "dismissed" ? "text-slate-900" : "text-slate-400"}`}>
                          {selectedComplaint.status === "dismissed" ? "Dismissed" : "Resolved"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata fields */}
                  <div className="rounded-xl border p-4 bg-white space-y-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Report Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Author Identity</span>
                        {selectedComplaint.flow === "student_to_principal" && selectedComplaint.anonymous ? (
                          <Badge variant="secondary" className="gap-1 bg-purple-50 text-purple-700 font-bold uppercase text-[9px]">
                            <EyeOff className="h-3 w-3" /> Anonymous student
                          </Badge>
                        ) : (
                          <span className="font-bold text-slate-800 flex items-center gap-1">
                            <UserCheck className="h-4.5 w-4.5 text-primary" />
                            {senderNames[selectedComplaint.sender_user_id ?? ""] || "Teacher"}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Urgency Level</span>
                        <Badge className={`font-bold uppercase text-[9px] ${
                          PRIORITIES.find(p => p.value === selectedComplaint.priority)?.color || ""
                        }`}>
                          {selectedComplaint.priority}
                        </Badge>
                      </div>
                      {selectedComplaint.student_id && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground block mb-0.5">Subject Student Profile</span>
                          <span className="font-bold text-slate-800">{studentNames[selectedComplaint.student_id] || "Student"}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Category Class</span>
                        <Badge variant="outline" className="font-bold uppercase text-[9px]">{selectedComplaint.category}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">Current Status</span>
                        <Badge className={`font-bold uppercase text-[9px] ${
                          (STATUS_TONE[selectedComplaint.status] || STATUS_TONE.open).cls
                        }`}>
                          {selectedComplaint.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Content detail */}
                  <div className="rounded-xl border p-4 bg-white space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observation Description</h4>
                    <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{selectedComplaint.content}</p>
                  </div>

                  {/* Attachments previewer */}
                  {selectedComplaint.attachments && selectedComplaint.attachments.length > 0 && (
                    <div className="rounded-xl border p-4 bg-white space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attached Worksheets/Evidence</h4>
                      <div className="space-y-1.5">
                        {selectedComplaint.attachments.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-slate-50 border rounded-lg p-2 text-xs font-semibold text-slate-700">
                            <Paperclip className="h-4 w-4 text-slate-400" />
                            <span>{file.name}</span>
                            <span className="text-[10px] text-muted-foreground font-medium ml-auto">({file.size})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rating display */}
                  {selectedComplaint.rating !== null && (
                    <div className="rounded-xl border bg-amber-500/[0.03] border-amber-200 p-4 space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">User Resolution Star Rating</h4>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`h-5 w-5 ${
                                star <= (selectedComplaint.rating ?? 0) ? "text-amber-500 fill-amber-500" : "text-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                        <div className="border-l border-amber-200 pl-3 text-xs text-slate-600">
                          <span className="font-bold text-slate-900">Score Rating: {selectedComplaint.rating}/5</span>
                          {selectedComplaint.rating_comment && <span className="italic block mt-0.5 font-medium">"{selectedComplaint.rating_comment}"</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Resolution / Action panel */}
                  {selectedComplaint.status !== "resolved" && selectedComplaint.status !== "dismissed" && (
                    <div className="rounded-xl border p-4 bg-slate-50 border-dashed space-y-3">
                      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Resolution Management Form</h4>
                      <Textarea
                        rows={3}
                        placeholder="Type detailed resolution plan or response to send back to the submitter..."
                        value={drafts[selectedComplaint.id] ?? ""}
                        onChange={(e) => setDrafts((p) => ({ ...p, [selectedComplaint.id]: e.target.value }))}
                        className="text-xs bg-white border-slate-200/80 rounded-xl"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => updateStatus(selectedComplaint.id, "in_review")}
                          className="rounded-lg text-xs font-bold shadow-sm"
                        >
                          <Clock className="h-3.5 w-3.5 mr-1.5 text-sky-600" /> Start Review
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => updateStatus(selectedComplaint.id, "resolved")}
                          className="rounded-lg text-xs font-bold shadow-sm"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Resolve & Close
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => updateStatus(selectedComplaint.id, "dismissed")}
                          className="rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1.5" /> Dismiss Case
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right panel: Live Discussion Thread */}
                <div className="lg:col-span-6 flex flex-col h-full overflow-hidden">
                  <div className="flex-1 overflow-y-auto">
                    <ComplaintThread
                      complaintId={selectedComplaint.id}
                      schoolId={schoolId}
                      authorRole="principal"
                      anonymousAuthors={selectedComplaint.flow === "student_to_principal" && selectedComplaint.anonymous}
                      usePrincipalView={selectedComplaint.flow === "student_to_principal"}
                      nameLookup={{ ...senderNames, ...studentNames }}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t pt-3 shrink-0 flex items-center justify-end">
                <Button variant="outline" className="rounded-xl text-xs font-semibold shadow-sm" onClick={() => setSelectedComplaint(null)}>
                  Close Panel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string | number; tone?: "warning" | "success" | "error" | "stars" }) {
  const cls =
    tone === "warning" ? "from-amber-500/10 to-amber-500/[0.03] text-amber-700 dark:text-amber-400 border-amber-200/50" :
    tone === "success" ? "from-emerald-500/10 to-emerald-500/[0.03] text-emerald-700 dark:text-emerald-400 border-emerald-200/50" :
    tone === "error" ? "from-red-500/10 to-red-500/[0.03] text-red-700 dark:text-red-400 border-red-200/50" :
    tone === "stars" ? "from-purple-500/10 to-purple-500/[0.03] text-purple-700 dark:text-purple-400 border-purple-200/50" :
                          "from-slate-100 to-slate-50/50 text-foreground border-slate-200/80";
  return (
    <div className={`min-w-[90px] rounded-2xl border bg-gradient-to-br ${cls} px-3.5 py-3 shadow-sm text-center flex flex-col justify-center`}>
      <p className="text-xl sm:text-2xl font-black leading-none tracking-tight">{value}</p>
      <p className="text-[9px] uppercase tracking-wider font-extrabold mt-1.5 opacity-80">{label}</p>
    </div>
  );
}
