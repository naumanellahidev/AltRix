/**
 * CounselingModule
 * ------------------------------------------------------------------
 * Professional, full-featured counseling workspace used by counselors,
 * principals, school admins, and academic coordinators.
 *
 * Capabilities
 *  • KPI overview: total cases, urgent, scheduled this week,
 *    resolution rate, average days-to-resolve.
 *  • Inline filters: search by student, priority, reason type, status.
 *  • Create new counseling request (pick student, priority, reason).
 *  • Schedule with date+time picker, complete with notes + outcome.
 *  • Realtime sync via supabase.channel — list refreshes automatically
 *    when any other user updates the queue.
 *  • CSV export of currently filtered list.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, formatDistanceToNow, differenceInDays, startOfWeek, endOfWeek } from "date-fns";
import { motion } from "framer-motion";
import {
  AlertTriangle, Calendar, CheckCircle2, Clock, Download, FileText,
  Heart, Plus, Search, TrendingUp, Users, X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { exportToCSV } from "@/lib/csv";

interface Props {
  schoolId: string | null;
}

type CounselingRow = {
  id: string;
  student_id: string;
  school_id: string;
  status: string | null;
  priority: string | null;
  reason_type: string | null;
  reason_details: string | null;
  scheduled_date: string | null;
  session_notes: string | null;
  outcome: string | null;
  detected_indicators: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  students?: { first_name: string | null; last_name: string | null } | null;
};

const PRIORITY = {
  urgent: { label: "Urgent", className: "bg-destructive/10 text-destructive border-destructive/20" },
  high:   { label: "High",   className: "bg-orange-500/10 text-orange-600 border-orange-200" },
  normal: { label: "Normal", className: "bg-primary/10 text-primary border-primary/20" },
  low:    { label: "Low",    className: "bg-muted text-muted-foreground border-border" },
} as const;

const STATUS = {
  pending:     { label: "Pending",     className: "bg-amber-500/10 text-amber-600 border-amber-200" },
  scheduled:   { label: "Scheduled",   className: "bg-blue-500/10 text-blue-600 border-blue-200" },
  in_progress: { label: "In Progress", className: "bg-purple-500/10 text-purple-600 border-purple-200" },
  completed:   { label: "Completed",   className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  cancelled:   { label: "Cancelled",   className: "bg-muted text-muted-foreground border-border" },
} as const;

const REASON_TYPES = [
  { value: "academic_stress",  label: "Academic stress" },
  { value: "behavioral",        label: "Behavioral concern" },
  { value: "social_emotional",  label: "Social / emotional" },
  { value: "family_issue",      label: "Family issue" },
  { value: "bullying",          label: "Bullying" },
  { value: "attendance",        label: "Attendance concern" },
  { value: "career_guidance",   label: "Career guidance" },
  { value: "other",             label: "Other" },
];

const OUTCOMES = [
  { value: "improved",       label: "Improved — no follow-up needed" },
  { value: "stable",         label: "Stable — continue monitoring" },
  { value: "follow_up",      label: "Needs follow-up session" },
  { value: "escalated",      label: "Escalated to specialist" },
  { value: "parent_meeting", label: "Parent meeting scheduled" },
];

export function CounselingModule({ schoolId }: Props) {
  const qc = useQueryClient();

  // ---- filters --------------------------------------------------------------
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [tab, setTab] = useState<"pending" | "scheduled" | "completed" | "all">("pending");

  // ---- dialogs --------------------------------------------------------------
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<CounselingRow | null>(null);
  const [completeFor, setCompleteFor] = useState<CounselingRow | null>(null);

  // ---- data -----------------------------------------------------------------
  const { data: queue, isLoading } = useQuery({
    queryKey: ["counseling_queue", schoolId],
    queryFn: async (): Promise<CounselingRow[]> => {
      const { data, error } = await supabase
        .from("ai_counseling_queue")
        .select("*, students:student_id(first_name,last_name)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as CounselingRow[];
    },
    enabled: !!schoolId,
  });

  // realtime sync
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`counseling-queue-${schoolId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_counseling_queue", filter: `school_id=eq.${schoolId}` },
        () => qc.invalidateQueries({ queryKey: ["counseling_queue", schoolId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [schoolId, qc]);

  const { data: students = [] } = useQuery({
    queryKey: ["counseling_students_picker", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!)
        .order("first_name")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schoolId && createOpen,
  });

  // ---- derived --------------------------------------------------------------
  const filtered = useMemo(() => {
    const list = queue ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (priorityFilter !== "all" && (r.priority ?? "normal") !== priorityFilter) return false;
      if (reasonFilter !== "all" && (r.reason_type ?? "other") !== reasonFilter) return false;
      if (tab === "pending" && r.status !== "pending") return false;
      if (tab === "scheduled" && r.status !== "scheduled" && r.status !== "in_progress") return false;
      if (tab === "completed" && r.status !== "completed") return false;
      if (q) {
        const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.toLowerCase();
        const details = (r.reason_details ?? "").toLowerCase();
        if (!name.includes(q) && !details.includes(q)) return false;
      }
      return true;
    });
  }, [queue, search, priorityFilter, reasonFilter, tab]);

  const stats = useMemo(() => {
    const list = queue ?? [];
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());

    const urgent = list.filter((r) => r.priority === "urgent" && r.status !== "completed").length;
    const scheduledThisWeek = list.filter((r) => {
      if (!r.scheduled_date) return false;
      const d = parseISO(r.scheduled_date);
      return d >= weekStart && d <= weekEnd;
    }).length;
    const completed = list.filter((r) => r.status === "completed");
    const resolutionRate = list.length ? Math.round((completed.length / list.length) * 100) : 0;
    const days = completed
      .map((r) => (r.created_at && r.updated_at ? differenceInDays(parseISO(r.updated_at), parseISO(r.created_at)) : null))
      .filter((d): d is number => d !== null && d >= 0);
    const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;

    // reason breakdown
    const breakdown: Record<string, number> = {};
    for (const r of list) {
      const k = r.reason_type ?? "other";
      breakdown[k] = (breakdown[k] ?? 0) + 1;
    }

    return {
      total: list.length,
      urgent,
      scheduledThisWeek,
      resolutionRate,
      avgDays,
      breakdown,
    };
  }, [queue]);

  // ---- mutations ------------------------------------------------------------
  const updateMut = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<CounselingRow> }) => {
      const { error } = await supabase
        .from("ai_counseling_queue")
        .update(payload.patch as never)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Counseling case updated");
      qc.invalidateQueries({ queryKey: ["counseling_queue", schoolId] });
      setScheduleFor(null);
      setCompleteFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const createMut = useMutation({
    mutationFn: async (payload: {
      student_id: string;
      priority: string;
      reason_type: string;
      reason_details: string;
    }) => {
      if (!schoolId) throw new Error("Missing school");
      const { error } = await supabase.from("ai_counseling_queue").insert({
        school_id: schoolId,
        student_id: payload.student_id,
        priority: payload.priority,
        reason_type: payload.reason_type,
        reason_details: payload.reason_details || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Counseling request created");
      qc.invalidateQueries({ queryKey: ["counseling_queue", schoolId] });
      setCreateOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Create failed"),
  });

  // ---- helpers --------------------------------------------------------------
  const exportCSV = () => {
    const rows = filtered.map((r) => ({
      student: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
      priority: r.priority ?? "",
      status: r.status ?? "",
      reason_type: r.reason_type ?? "",
      reason_details: r.reason_details ?? "",
      scheduled_date: r.scheduled_date ?? "",
      outcome: r.outcome ?? "",
      session_notes: r.session_notes ?? "",
      created_at: r.created_at ?? "",
    }));
    exportToCSV(rows, `counseling-${new Date().toISOString().slice(0, 10)}`);
  };

  // ---- render ---------------------------------------------------------------
  if (!schoolId) {
    return <div className="p-6 text-sm text-muted-foreground">Loading workspace…</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 p-2.5 shadow-soft">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Counseling Center</h2>
            <p className="text-sm text-muted-foreground">
              Track student wellbeing cases, sessions, and outcomes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New case
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Total cases" value={stats.total} tone="muted" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Urgent open" value={stats.urgent} tone="danger" />
        <KpiCard icon={<Calendar className="h-4 w-4" />} label="Scheduled (week)" value={stats.scheduledThisWeek} tone="info" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Resolution rate" value={`${stats.resolutionRate}%`} tone="success" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Avg. days to resolve" value={stats.avgDays} tone="muted" />
      </div>

      {/* Reason breakdown */}
      {Object.keys(stats.breakdown).length > 0 && (
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reason breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.breakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => {
                  const label = REASON_TYPES.find((r) => r.value === key)?.label ?? key.replace("_", " ");
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 text-xs capitalize text-muted-foreground">{label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + tabs */}
      <Card className="shadow-elevated">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search student or details…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-56 pl-7 text-sm"
                />
              </div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {REASON_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Heart className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 font-medium text-muted-foreground">No matching cases</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting your filters or create a new counseling case.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[520px]">
              <div className="space-y-3 pr-3">
                {filtered.map((row, idx) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                  >
                    <CaseCard
                      row={row}
                      onSchedule={() => setScheduleFor(row)}
                      onComplete={() => setCompleteFor(row)}
                      onMarkInProgress={() => updateMut.mutate({ id: row.id, patch: { status: "in_progress" } })}
                      onCancel={() => updateMut.mutate({ id: row.id, patch: { status: "cancelled" } })}
                    />
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <CreateCaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        students={students}
        submitting={createMut.isPending}
        onSubmit={(payload) => createMut.mutate(payload)}
      />

      {/* Schedule dialog */}
      <ScheduleDialog
        row={scheduleFor}
        onOpenChange={(open) => !open && setScheduleFor(null)}
        submitting={updateMut.isPending}
        onSubmit={(when) =>
          scheduleFor && updateMut.mutate({
            id: scheduleFor.id,
            patch: { status: "scheduled", scheduled_date: when },
          })
        }
      />

      {/* Complete dialog */}
      <CompleteDialog
        row={completeFor}
        onOpenChange={(open) => !open && setCompleteFor(null)}
        submitting={updateMut.isPending}
        onSubmit={(notes, outcome) =>
          completeFor && updateMut.mutate({
            id: completeFor.id,
            patch: { status: "completed", session_notes: notes, outcome },
          })
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "muted" | "danger" | "info" | "success";
}) {
  const toneCls = {
    muted:   "border-border bg-card",
    danger:  "border-destructive/20 bg-destructive/5",
    info:    "border-blue-200 bg-blue-500/5",
    success: "border-emerald-200 bg-emerald-500/5",
  }[tone];
  const valueCls = {
    muted: "text-foreground",
    danger: "text-destructive",
    info: "text-blue-600",
    success: "text-emerald-600",
  }[tone];
  return (
    <Card className={`shadow-soft ${toneCls}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <p className={`mt-1 font-display text-2xl font-semibold ${valueCls}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function CaseCard({
  row, onSchedule, onComplete, onMarkInProgress, onCancel,
}: {
  row: CounselingRow;
  onSchedule: () => void;
  onComplete: () => void;
  onMarkInProgress: () => void;
  onCancel: () => void;
}) {
  const priorityKey = (row.priority && row.priority in PRIORITY ? row.priority : "normal") as keyof typeof PRIORITY;
  const statusKey = (row.status && row.status in STATUS ? row.status : "pending") as keyof typeof STATUS;
  const priority = PRIORITY[priorityKey];
  const status = STATUS[statusKey];
  const initials = `${row.students?.first_name?.[0] ?? "S"}${row.students?.last_name?.[0] ?? ""}`.toUpperCase();
  const isCompleted = row.status === "completed";
  const isCancelled = row.status === "cancelled";

  return (
    <Card className="shadow-soft transition-shadow hover:shadow-elevated">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {row.students?.first_name} {row.students?.last_name}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {(row.reason_type ?? "other").replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={priority.className}>{priority.label}</Badge>
                <Badge variant="outline" className={status.className}>{status.label}</Badge>
              </div>
            </div>

            {row.reason_details && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{row.reason_details}</p>
            )}

            {row.detected_indicators && row.detected_indicators.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {row.detected_indicators.slice(0, 6).map((i, idx) => (
                  <Badge key={idx} variant="secondary" className="text-[10px]">{i}</Badge>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {row.scheduled_date && (
                <span className="flex items-center gap-1 text-blue-600">
                  <Calendar className="h-3 w-3" />
                  {format(parseISO(row.scheduled_date), "MMM d, yyyy 'at' h:mm a")}
                </span>
              )}
              {row.created_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Opened {formatDistanceToNow(parseISO(row.created_at), { addSuffix: true })}
                </span>
              )}
              {isCompleted && row.outcome && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <TrendingUp className="h-3 w-3" />
                  {OUTCOMES.find((o) => o.value === row.outcome)?.label ?? row.outcome}
                </span>
              )}
            </div>

            {isCompleted && row.session_notes && (
              <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {row.session_notes}
              </p>
            )}

            {!isCompleted && !isCancelled && (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.status !== "scheduled" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSchedule}>
                    <Calendar className="mr-1 h-3 w-3" /> Schedule
                  </Button>
                )}
                {row.status === "scheduled" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onMarkInProgress}>
                    <Clock className="mr-1 h-3 w-3" /> Mark in progress
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs" onClick={onComplete}>
                  <FileText className="mr-1 h-3 w-3" /> Complete session
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onCancel}>
                  <X className="mr-1 h-3 w-3" /> Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCaseDialog({
  open, onOpenChange, students, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  submitting: boolean;
  onSubmit: (p: { student_id: string; priority: string; reason_type: string; reason_details: string }) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [reason, setReason] = useState("academic_stress");
  const [details, setDetails] = useState("");

  useEffect(() => {
    if (!open) { setStudentId(""); setPriority("normal"); setReason("academic_stress"); setDetails(""); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New counseling case</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASON_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea
              rows={4}
              placeholder="Describe the situation, observations, or concerns…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-primary-action
            disabled={!studentId || submitting}
            onClick={() => onSubmit({ student_id: studentId, priority, reason_type: reason, reason_details: details })}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  row, onOpenChange, submitting, onSubmit,
}: {
  row: CounselingRow | null;
  onOpenChange: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (whenIso: string) => void;
}) {
  const [when, setWhen] = useState("");

  useEffect(() => {
    if (row) {
      const init = row.scheduled_date
        ? format(parseISO(row.scheduled_date), "yyyy-MM-dd'T'HH:mm")
        : format(new Date(Date.now() + 24 * 3600 * 1000), "yyyy-MM-dd'T'HH:mm");
      setWhen(init);
    }
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Schedule counseling session</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{row?.students?.first_name} {row?.students?.last_name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {(row?.reason_type ?? "other").replace(/_/g, " ")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Date & time</Label>
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-primary-action
            disabled={!when || submitting}
            onClick={() => onSubmit(new Date(when).toISOString())}
          >
            <Calendar className="mr-1.5 h-4 w-4" /> Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  row, onOpenChange, submitting, onSubmit,
}: {
  row: CounselingRow | null;
  onOpenChange: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (notes: string, outcome: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [outcome, setOutcome] = useState("stable");

  useEffect(() => {
    if (row) { setNotes(row.session_notes ?? ""); setOutcome(row.outcome ?? "stable"); }
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Complete counseling session</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{row?.students?.first_name} {row?.students?.last_name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {(row?.reason_type ?? "other").replace(/_/g, " ")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Session notes</Label>
            <Textarea
              rows={5}
              placeholder="Document what was discussed, observations, and next steps…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-primary-action
            disabled={submitting}
            onClick={() => onSubmit(notes, outcome)}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" /> Save session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CounselingModule;
