/**
 * CounselorBehaviorModule
 * ------------------------------------------------------------------
 * School-wide read of `behavior_notes` for counselors, principals,
 * vice-principals, school admins, and academic coordinators.
 *
 * Differs from TeacherBehaviorModule (which is scoped to the teacher's
 * own classes). Counselors need oversight across the entire school to
 * spot patterns, escalate concerns, and follow up on at-risk students.
 *
 * Capabilities
 *  • Live list of all behavior notes for the school with student name,
 *    section, type, sharing status, recency.
 *  • Filter by note type, search by student name / title / content.
 *  • Realtime channel subscription — list updates when teachers add
 *    new notes anywhere in the school.
 *  • Quick KPI strip: total, concerns, incidents, positives this month.
 *  • CSV export of the current filtered view.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfMonth } from "date-fns";
import {
  AlertTriangle, Download, NotebookPen, Search, Share2,
  Smile, ThumbsUp, TrendingUp,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { exportToCSV } from "@/lib/csv";

interface Props { schoolId: string | null }

type Row = {
  id: string;
  school_id: string;
  student_id: string;
  note_type: string;
  title: string;
  content: string;
  is_shared_with_parents: boolean;
  created_at: string;
  teacher_user_id: string | null;
  students?: { first_name: string | null; last_name: string | null } | null;
};

const TYPE_STYLES: Record<string, { label: string; cls: string; icon: any }> = {
  observation: { label: "Observation", cls: "bg-blue-500/10 text-blue-600 border-blue-200", icon: NotebookPen },
  positive:    { label: "Positive",    cls: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: ThumbsUp },
  concern:     { label: "Concern",     cls: "bg-amber-500/10 text-amber-600 border-amber-200", icon: AlertTriangle },
  incident:    { label: "Incident",    cls: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
};

export function CounselorBehaviorModule({ schoolId }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["counselor-behavior", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("behavior_notes")
        .select("id, school_id, student_id, note_type, title, content, is_shared_with_parents, created_at, teacher_user_id, students:student_id(first_name, last_name)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  // Realtime sync
  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`behavior-${schoolId}`)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "behavior_notes", filter: `school_id=eq.${schoolId}` },
          () => qc.invalidateQueries({ queryKey: ["counselor-behavior", schoolId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId, qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.note_type !== type) return false;
      if (!q) return true;
      const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q);
    });
  }, [rows, search, type]);

  const kpis = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const thisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart);
    return {
      total: rows.length,
      concerns: rows.filter((r) => r.note_type === "concern").length,
      incidents: rows.filter((r) => r.note_type === "incident").length,
      positiveMtd: thisMonth.filter((r) => r.note_type === "positive").length,
    };
  }, [rows]);

  const handleExport = () => {
    exportToCSV(filtered.map((r) => ({
      student: `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.trim(),
      type: r.note_type,
      title: r.title,
      content: r.content,
      shared_with_parents: r.is_shared_with_parents ? "yes" : "no",
      created_at: format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
    })), `behavior-notes-${format(new Date(), "yyyy-MM-dd")}.csv`);
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={NotebookPen} label="Total notes" value={kpis.total} tint="text-primary" />
        <Kpi icon={AlertTriangle} label="Open concerns" value={kpis.concerns} tint="text-amber-600" />
        <Kpi icon={AlertTriangle} label="Incidents" value={kpis.incidents} tint="text-destructive" />
        <Kpi icon={Smile} label="Positive (MTD)" value={kpis.positiveMtd} tint="text-emerald-600" />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">School-wide behavior notes</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, title, content…"
                className="pl-9"
              />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="observation">Observation</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="concern">Concern</SelectItem>
                <SelectItem value="incident">Incident</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-10 text-center">
              <NotebookPen className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">No behavior notes match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map((r) => {
                const style = TYPE_STYLES[r.note_type] ?? TYPE_STYLES.observation;
                const Icon = style.icon;
                return (
                  <div key={r.id} className="rounded-xl border border-border/60 bg-background/50 p-4 transition hover:border-primary/40 hover:shadow-soft">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={style.cls}>
                            <Icon className="mr-1 h-3 w-3" /> {style.label}
                          </Badge>
                          <p className="font-medium truncate">{r.title}</p>
                          {r.is_shared_with_parents && (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">
                              <Share2 className="mr-1 h-3 w-3" /> Shared
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {r.students?.first_name ?? "Unknown"} {r.students?.last_name ?? ""}
                        </p>
                        <p className="mt-2 text-sm whitespace-pre-wrap">{r.content}</p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tint}`} />
        </div>
        <p className={`mt-2 font-display text-2xl font-semibold ${tint}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
