/**
 * CounselorHome — role-specific dashboard for the counselor shell.
 * Surfaces live counseling KPIs, urgent cases, behavior signals, and
 * quick links into the modules counselors use every day.
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfWeek, endOfWeek } from "date-fns";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock,
  Heart, MessageSquare, NotebookPen, Sparkles, Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-200",
  normal: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-200",
  scheduled: "bg-blue-500/10 text-blue-600 border-blue-200",
  in_progress: "bg-purple-500/10 text-purple-600 border-purple-200",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
};

export function CounselorHome() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const base = `/${schoolSlug}/counselor`;

  const { data, isLoading } = useQuery({
    queryKey: ["counselor-home", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [queue, behavior, parentNotes, students] = await Promise.all([
        supabase
          .from("ai_counseling_queue")
          .select("id, status, priority, reason_type, scheduled_date, created_at, student_id, students:student_id(first_name, last_name)")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("behavior_notes")
          .select("id, note_type, title, created_at, student_id, students:student_id(first_name, last_name)")
          .eq("school_id", schoolId!)
          .in("note_type", ["concern", "incident"])
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("parent_behavior_notes")
          .select("id, mood, behavior, note_date, created_at, student_id, students:student_id(first_name,last_name)")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("students").select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!).eq("status", "active"),
      ]);
      return {
        cases: (queue.data ?? []) as any[],
        recentBehavior: (behavior.data ?? []) as any[],
        parentNotes: (parentNotes.data ?? []) as any[],
        totalStudents: students.count ?? 0,
      };
    },
  });

  // Realtime
  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`counselor-home-${schoolId}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "ai_counseling_queue", filter: `school_id=eq.${schoolId}` },
          () => qc.invalidateQueries({ queryKey: ["counselor-home", schoolId] }))
      .on("postgres_changes",
          { event: "*", schema: "public", table: "behavior_notes", filter: `school_id=eq.${schoolId}` },
          () => qc.invalidateQueries({ queryKey: ["counselor-home", schoolId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId, qc]);

  const kpis = useMemo(() => {
    const cases = data?.cases ?? [];
    const wkStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const wkEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    return {
      open: cases.filter((c) => c.status !== "completed" && c.status !== "cancelled").length,
      urgent: cases.filter((c) => c.priority === "urgent" && c.status !== "completed" && c.status !== "cancelled").length,
      thisWeek: cases.filter((c) => {
        if (!c.scheduled_date) return false;
        const d = new Date(c.scheduled_date);
        return d >= wkStart && d <= wkEnd;
      }).length,
      completed: cases.filter((c) => c.status === "completed").length,
    };
  }, [data]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return (data?.cases ?? [])
      .filter((c) => c.scheduled_date && new Date(c.scheduled_date) >= now && c.status !== "completed" && c.status !== "cancelled")
      .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
      .slice(0, 5);
  }, [data]);

  const urgent = useMemo(() => {
    return (data?.cases ?? [])
      .filter((c) => c.priority === "urgent" && c.status !== "completed" && c.status !== "cancelled")
      .slice(0, 5);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-accent/30 to-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">Counselor workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Triage cases, track sessions, and watch the early-warning signals that matter most.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`${base}/counseling`)}>
              <Heart className="mr-1.5 h-4 w-4" /> Open Counseling Center
            </Button>
            <Button variant="outline" onClick={() => navigate(`${base}/at-risk`)}>
              <AlertTriangle className="mr-1.5 h-4 w-4" /> At-risk students
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Heart} label="Open cases" value={kpis.open} tint="text-primary" loading={isLoading} />
        <Kpi icon={AlertTriangle} label="Urgent" value={kpis.urgent} tint="text-destructive" loading={isLoading} />
        <Kpi icon={CalendarDays} label="Sessions this week" value={kpis.thisWeek} tint="text-blue-600" loading={isLoading} />
        <Kpi icon={CheckCircle2} label="Completed" value={kpis.completed} tint="text-emerald-600" loading={isLoading} />
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Urgent cases
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/counseling`)}>
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : urgent.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                No urgent cases right now. Nice work.
              </p>
            ) : urgent.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`${base}/counseling`)}
                className="w-full rounded-lg border border-border/60 p-3 text-left transition hover:border-destructive/40 hover:bg-destructive/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">
                    {c.students?.first_name ?? "Student"} {c.students?.last_name ?? ""}
                  </p>
                  <Badge variant="outline" className={PRIORITY_CLS.urgent}>Urgent</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.reason_type ?? "general"} • opened {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" /> Upcoming sessions
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/counseling`)}>
                Schedule <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : upcoming.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled. Use the Counseling Center to plan a session.
              </p>
            ) : upcoming.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">
                    {c.students?.first_name ?? "Student"} {c.students?.last_name ?? ""}
                  </p>
                  <Badge variant="outline" className={STATUS_CLS[c.status ?? "scheduled"] ?? STATUS_CLS.scheduled}>
                    {(c.status ?? "scheduled").replace("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(c.scheduled_date), "EEE, MMM d • HH:mm")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-amber-600" /> Latest concerns &amp; incidents
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/behavior`)}>
                Open behavior <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (data?.recentBehavior ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                No concerns or incidents logged yet.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {data!.recentBehavior.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{b.title}</p>
                      <Badge variant="outline" className={
                        b.note_type === "incident"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-200"
                      }>
                        {b.note_type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.students?.first_name ?? "Student"} {b.students?.last_name ?? ""} •{" "}
                      {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" /> Recent parent notes
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/parent-notes`)}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (data?.parentNotes ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                No parent notes shared yet.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {data!.parentNotes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`${base}/parent-notes`)}
                    className="rounded-lg border border-border/60 p-3 text-left hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium truncate">
                        {p.students?.first_name ?? "Student"} {p.students?.last_name ?? ""}
                      </p>
                      {p.mood && (
                        <Badge variant="outline" className="capitalize">{p.mood}</Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {p.behavior || `Logged ${formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}`}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink icon={Sparkles} label="AI Counselor" desc="Triage & insights" onClick={() => navigate(`${base}/ai-counselor`)} />
          <QuickLink icon={Users} label="Parent Notes" desc="Read parent observations" onClick={() => navigate(`${base}/parent-notes`)} />
          <QuickLink icon={MessageSquare} label="Messages" desc="Reach staff &amp; parents" onClick={() => navigate(`${base}/messages`)} />
          <QuickLink icon={CalendarDays} label="Attendance" desc="Spot chronic absences" onClick={() => navigate(`${base}/attendance`)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tint, loading }: { icon: any; label: string; value: number; tint: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tint}`} />
        </div>
        {loading ? <Skeleton className="mt-2 h-7 w-12" /> : (
          <p className={`mt-2 font-display text-2xl font-semibold ${tint}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function QuickLink({ icon: Icon, label, desc, onClick }: { icon: any; label: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </span>
    </button>
  );
}
