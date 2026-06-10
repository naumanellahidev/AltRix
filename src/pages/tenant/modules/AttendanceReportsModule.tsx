import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Filter } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Section = { id: string; name: string; class_id: string };
type ClassRow = { id: string; name: string };

type SessionRow = {
  id: string;
  session_date: string;
  period_label: string;
  class_section_id: string;
};

type SummaryRow = {
  session_id: string;
  date: string;
  period: string;
  className: string;
  sectionName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
};

function downloadCsv(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (/[\",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(",");
  const body = rows.map((r) => keys.map((k) => escape((r as any)[k])).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AttendanceReportsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const perms = useSchoolPermissions(schoolId);

  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sectionId, setSectionId] = useState<string>("all");
  const [sections, setSections] = useState<Section[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (perms.loading) return;
    const load = async () => {
      if (!schoolId || !user?.id) return;

      const { data: cls } = await supabase.from("academic_classes").select("id,name").eq("school_id", schoolId);
      setClasses((cls ?? []) as ClassRow[]);

      // Admins: can see all sections. Teachers: only assigned sections.
      if (perms.canManageStudents) {
        const { data: sec } = await supabase
          .from("class_sections")
          .select("id,name,class_id")
          .eq("school_id", schoolId)
          .order("name");
        setSections((sec ?? []) as Section[]);
      } else {
        const { data: ta } = await supabase
          .from("teacher_subject_assignments")
          .select("class_section_id")
          .eq("school_id", schoolId)
          .eq("teacher_user_id", user.id);
        const ids = [...new Set((ta ?? []).map((x: any) => x.class_section_id as string))];
        if (ids.length === 0) {
          setSections([]);
          return;
        }
        const { data: sec } = await supabase.from("class_sections").select("id,name,class_id").eq("school_id", schoolId).in("id", ids);
        setSections((sec ?? []) as Section[]);
      }
    };
    void load();
  }, [schoolId, user?.id, perms.loading, perms.canManageStudents]);

  const run = async () => {
    if (!schoolId) return;
    setBusy(true);
    try {
      let q = supabase
        .from("attendance_sessions")
        .select("id,session_date,period_label,class_section_id")
        .eq("school_id", schoolId)
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: false })
        .limit(250);

      if (sectionId !== "all") q = q.eq("class_section_id", sectionId);

      const { data: sess, error: sErr } = await q;
      if (sErr) return toast.error(sErr.message);
      const sessions = (sess ?? []) as SessionRow[];
      if (sessions.length === 0) {
        setSummaries([]);
        return;
      }

      const sessionIds = sessions.map((s) => s.id);
      const { data: entries, error: eErr } = await supabase
        .from("attendance_entries")
        .select("session_id,status")
        .eq("school_id", schoolId)
        .in("session_id", sessionIds);
      if (eErr) return toast.error(eErr.message);

      const statusCounts = new Map<string, { present: number; absent: number; late: number; excused: number }>();
      (entries ?? []).forEach((r: any) => {
        const sid = r.session_id as string;
        const st = (r.status as string) || "present";
        const acc = statusCounts.get(sid) ?? { present: 0, absent: 0, late: 0, excused: 0 };
        if (st === "absent") acc.absent += 1;
        else if (st === "late") acc.late += 1;
        else if (st === "excused") acc.excused += 1;
        else acc.present += 1;
        statusCounts.set(sid, acc);
      });

      const classById = new Map(classes.map((c) => [c.id, c.name]));
      const sectionById = new Map(sections.map((s) => [s.id, s]));

      const rows: SummaryRow[] = sessions.map((s) => {
        const counts = statusCounts.get(s.id) ?? { present: 0, absent: 0, late: 0, excused: 0 };
        const sec = sectionById.get(s.class_section_id);
        const clsName = sec ? classById.get(sec.class_id) ?? "Class" : "Class";
        const secName = sec ? sec.name : "Section";
        const total = counts.present + counts.absent + counts.late + counts.excused;
        return {
          session_id: s.id,
          date: s.session_date,
          period: s.period_label || "",
          className: clsName,
          sectionName: secName,
          present: counts.present,
          absent: counts.absent,
          late: counts.late,
          excused: counts.excused,
          total,
        };
      });

      setSummaries(rows);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (summaries.length === 0) return toast.error("No rows to export");
    downloadCsv(`attendance_${tenant.slug}_${from}_to_${to}.csv`,
      summaries.map((r) => ({
        date: r.date,
        period: r.period,
        class: r.className,
        section: r.sectionName,
        present: r.present,
        absent: r.absent,
        late: r.late,
        excused: r.excused,
        total: r.total,
      })),
    );
  };

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, r) => {
        acc.present += r.present;
        acc.absent += r.absent;
        acc.late += r.late;
        acc.excused += r.excused;
        acc.total += r.total;
        return acc;
      },
      { present: 0, absent: 0, late: 0, excused: 0, total: 0 },
    );
  }, [summaries]);

  return (
    <div className="space-y-4">
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Attendance Reports</CardTitle>
          <p className="text-sm text-muted-foreground">Summaries by session with CSV export.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {classes.find((c) => c.id === s.class_id)?.name ?? "Class"} • {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="hero" onClick={run} disabled={busy}>
              <Filter className="mr-2 h-4 w-4" /> Run
            </Button>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              Totals: <span className="text-foreground">{totals.total}</span> • P {totals.present} • A {totals.absent} • L {totals.late} • E {totals.excused}
            </div>
            <Button variant="soft" onClick={exportCsv} disabled={summaries.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">A</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">E</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((r) => (
                  <TableRow key={r.session_id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="font-medium">{r.className}</TableCell>
                    <TableCell>{r.sectionName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.period || "—"}</TableCell>
                    <TableCell className="text-right">{r.present}</TableCell>
                    <TableCell className="text-right">{r.absent}</TableCell>
                    <TableCell className="text-right">{r.late}</TableCell>
                    <TableCell className="text-right">{r.excused}</TableCell>
                    <TableCell className="text-right font-medium">{r.total}</TableCell>
                  </TableRow>
                ))}
                {summaries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
                      Run a report to see results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
