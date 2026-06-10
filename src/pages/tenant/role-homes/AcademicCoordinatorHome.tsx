/**
 * AcademicCoordinatorHome — role-specific dashboard for the Academic
 * Coordinator shell. Real KPIs, real lists, every card clickable and
 * routed into the relevant module.
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfDay, endOfDay } from "date-fns";
import {
  ArrowRight, BookOpen, CalendarDays, ClipboardCheck, FileSpreadsheet,
  GraduationCap, LayoutGrid, NotebookPen, School, Sparkles, Users, AlertTriangle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function AcademicCoordinatorHome() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const base = `/${schoolSlug}/academic_coordinator`;
  const today = new Date();
  const dow = today.getDay();

  const { data, isLoading } = useQuery({
    queryKey: ["coordinator-home", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      const todayDate = format(today, "yyyy-MM-dd");

      const [
        students, classes, sections, teachers,
        attendanceSessions, attendanceEntries,
        exams, timetable, diary, behavior,
      ] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!).eq("status", "active"),
        supabase.from("academic_classes").select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!),
        supabase.from("class_sections").select("id, name, class_id")
          .eq("school_id", schoolId!),
        supabase.from("user_roles").select("id", { count: "exact", head: true })
          .eq("school_id", schoolId!).eq("role", "teacher"),
        supabase.from("attendance_sessions").select("id, class_section_id, session_date, period_label")
          .eq("school_id", schoolId!).eq("session_date", todayDate),
        supabase.from("attendance_entries").select("status, created_at")
          .eq("school_id", schoolId!).gte("created_at", dayStart).lte("created_at", dayEnd),
        supabase.from("exams").select("id, name, start_date, end_date, status, term_label")
          .eq("school_id", schoolId!).gte("end_date", todayDate)
          .order("start_date", { ascending: true }).limit(6),
        supabase.from("timetable_entries")
          .select("id, subject_name, room, start_time, end_time, day_of_week, class_section_id, teacher_user_id")
          .eq("school_id", schoolId!).eq("day_of_week", dow).eq("is_published", true)
          .order("start_time", { ascending: true }),
        supabase.from("diary_entries")
          .select("id, title, created_at, class_section_id")
          .eq("school_id", schoolId!).order("created_at", { ascending: false }).limit(5),
        supabase.from("behavior_notes")
          .select("id, title, note_type, created_at, student_id, students:student_id(first_name,last_name)")
          .eq("school_id", schoolId!).in("note_type", ["incident","concern"])
          .order("created_at", { ascending: false }).limit(5),
      ]);

      return {
        counts: {
          students: students.count ?? 0,
          classes: classes.count ?? 0,
          sections: (sections.data ?? []).length,
          teachers: teachers.count ?? 0,
        },
        sections: (sections.data ?? []) as any[],
        attendanceSessions: (attendanceSessions.data ?? []) as any[],
        attendanceEntries: (attendanceEntries.data ?? []) as any[],
        exams: (exams.data ?? []) as any[],
        timetable: (timetable.data ?? []) as any[],
        diary: (diary.data ?? []) as any[],
        behavior: (behavior.data ?? []) as any[],
      };
    },
  });

  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`coord-home-${schoolId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "attendance_entries", filter: `school_id=eq.${schoolId}` },
        () => qc.invalidateQueries({ queryKey: ["coordinator-home", schoolId] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "diary_entries", filter: `school_id=eq.${schoolId}` },
        () => qc.invalidateQueries({ queryKey: ["coordinator-home", schoolId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId, qc]);

  const attendance = useMemo(() => {
    const entries = data?.attendanceEntries ?? [];
    const total = entries.length;
    const present = entries.filter(e => e.status === "present" || e.status === "late").length;
    const absent = entries.filter(e => e.status === "absent").length;
    const pct = total ? Math.round((present / total) * 100) : 0;
    const sessionsHeld = (data?.attendanceSessions ?? []).length;
    const sessionsExpected = (data?.sections ?? []).length;
    return { total, present, absent, pct, sessionsHeld, sessionsExpected };
  }, [data]);

  const ongoingExams = useMemo(() => {
    const t = format(today, "yyyy-MM-dd");
    return (data?.exams ?? []).filter(e => e.start_date <= t && e.end_date >= t);
  }, [data]);

  const upcomingExams = useMemo(() => {
    const t = format(today, "yyyy-MM-dd");
    return (data?.exams ?? []).filter(e => e.start_date > t).slice(0, 4);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-accent/30 to-transparent p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">Academic coordination</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {format(today, "EEEE, MMM d")} · Today's classes, attendance, exams and academic signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`${base}/timetable`)}>
              <CalendarDays className="mr-1.5 h-4 w-4" /> Open timetable
            </Button>
            <Button variant="outline" onClick={() => navigate(`${base}/exams`)}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Exams
            </Button>
            <Button variant="outline" onClick={() => navigate(`${base}/attendance`)}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Attendance
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users} label="Active students" value={data?.counts.students ?? 0} tint="text-primary"
             loading={isLoading} onClick={() => navigate(`${base}/students`)} />
        <Kpi icon={School} label="Classes" value={data?.counts.classes ?? 0} tint="text-blue-600"
             loading={isLoading} onClick={() => navigate(`${base}/academic`)} />
        <Kpi icon={LayoutGrid} label="Sections" value={data?.counts.sections ?? 0} tint="text-purple-600"
             loading={isLoading} onClick={() => navigate(`${base}/academic`)} />
        <Kpi icon={GraduationCap} label="Teachers" value={data?.counts.teachers ?? 0} tint="text-emerald-600"
             loading={isLoading} onClick={() => navigate(`${base}/staff`)} />
      </div>

      {/* Attendance + Exams snapshot */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> Today's attendance
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/attendance`)}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Present rate</p>
                    <p className="font-display text-3xl font-semibold">{attendance.pct}%</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-right text-sm">
                    <Stat label="Marked" value={attendance.total} />
                    <Stat label="Present" value={attendance.present} tint="text-emerald-600" />
                    <Stat label="Absent" value={attendance.absent} tint="text-destructive" />
                  </div>
                </div>
                <Progress value={attendance.pct} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Sessions held today: <span className="font-medium text-foreground">{attendance.sessionsHeld}</span>
                  {" "}/ {attendance.sessionsExpected} sections
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-amber-600" /> Exams
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/exams`)}>
                All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Ongoing</p>
                <p className="font-display text-2xl font-semibold">{ongoingExams.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="font-display text-2xl font-semibold">{upcomingExams.length}</p>
              </div>
            </div>
            {upcomingExams.slice(0, 3).map(e => (
              <button key={e.id} onClick={() => navigate(`${base}/exams`)}
                className="block w-full rounded-lg border border-border/60 p-2 text-left hover:border-primary/40 hover:bg-primary/5">
                <p className="text-sm font-medium truncate">{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(e.start_date), "MMM d")} – {format(new Date(e.end_date), "MMM d")}
                </p>
              </button>
            ))}
            {!isLoading && upcomingExams.length === 0 && ongoingExams.length === 0 && (
              <p className="rounded-lg border border-dashed border-border/60 py-4 text-center text-xs text-muted-foreground">
                No active exams.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's timetable + Latest diary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" /> Today's schedule · {DAYS[dow]}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/timetable`)}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <Skeleton className="h-24 w-full" /> :
              (data?.timetable ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                  No published timetable entries for today.
                </p>
              ) : (data!.timetable.slice(0, 6).map(t => (
                <button key={t.id} onClick={() => navigate(`${base}/timetable`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-left hover:border-primary/40 hover:bg-primary/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.subject_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.room ? `Room ${t.room}` : "Unassigned room"}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {t.start_time?.slice(0,5)}–{t.end_time?.slice(0,5)}
                  </Badge>
                </button>
              )))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-emerald-600" /> Latest diary entries
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/diary`)}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <Skeleton className="h-24 w-full" /> :
              (data?.diary ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                  No diary entries yet.
                </p>
              ) : (data!.diary.map(d => (
                <button key={d.id} onClick={() => navigate(`${base}/diary`)}
                  className="block w-full rounded-lg border border-border/60 p-3 text-left hover:border-primary/40 hover:bg-primary/5">
                  <p className="text-sm font-medium truncate">{d.title || "Untitled entry"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                  </p>
                </button>
              )))
            }
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Behavior signals
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate(`${base}/parent-notes`)}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-20 w-full" /> :
              (data?.behavior ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
                  No concerns or incidents logged.
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {data!.behavior.map(b => (
                    <div key={b.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium truncate">{b.title}</p>
                        <Badge variant="outline" className={
                          b.note_type === "incident"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-200"
                        }>{b.note_type}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.students?.first_name ?? "Student"} {b.students?.last_name ?? ""} ·{" "}
                        {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )
            }
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink icon={BookOpen} label="Report cards" desc="Publish & review" onClick={() => navigate(`${base}/report-cards`)} />
          <QuickLink icon={Sparkles} label="AI insights" desc="Academic predictions" onClick={() => navigate(`${base}/ai-academic`)} />
          <QuickLink icon={Users} label="Staff" desc="Teachers & assignments" onClick={() => navigate(`${base}/staff`)} />
          <QuickLink icon={CalendarDays} label="Holidays" desc="Calendar planning" onClick={() => navigate(`${base}/holidays`)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tint, loading, onClick }:
  { icon: any; label: string; value: number; tint: string; loading?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="transition hover:border-primary/40 hover:shadow-md">
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
    </button>
  );
}

function Stat({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-display text-lg font-semibold ${tint ?? ""}`}>{value}</p>
    </div>
  );
}

function QuickLink({ icon: Icon, label, desc, onClick }:
  { icon: any; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/60 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5">
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
