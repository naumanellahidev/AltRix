/**
 * Moving the school up a year.
 *
 * At the end of an annual session every child either moves up, stays where
 * they are, or leaves at the top of the school. None of that existed: a school
 * had to re-enrol every student by hand, with nothing recording who decided
 * what.
 *
 * The screen is deliberately a review, not a button. It shows every child with
 * the result the decision rests on and what is proposed for them; the
 * principal changes whatever they disagree with; then one run records it all
 * and can be undone as a whole.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  GraduationCap,
  History,
  Loader2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { date as formatDate, ABSENT } from "@/lib/documents/format";
import { reportLoadFailure } from "@/lib/load-failure";

interface Session {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  enrolled: number;
}

type Outcome = "promoted" | "retained" | "graduated";

interface PreviewStudent {
  student_id: string;
  name: string;
  student_code: string | null;
  from_section_id: string;
  from_section_name: string;
  from_class_name: string;
  annual_percentage: number | null;
  proposed_outcome: Outcome;
  reason: string;
  to_section_id: string | null;
  to_section_name: string | null;
  needs_section: boolean;
  already_decided: string | null;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  promoted: "Move up",
  retained: "Stay",
  graduated: "Leaving",
};

const OUTCOME_TONE: Record<Outcome, string> = {
  promoted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  retained: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  graduated: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

export default function PromotionsModule() {
  const qc = useQueryClient();
  const [fromSession, setFromSession] = useState<string>("");
  const [toSession, setToSession] = useState<string>("");
  const [passMark, setPassMark] = useState(40);
  const [overrides, setOverrides] = useState<Record<string, Outcome>>({});
  const [newSessionName, setNewSessionName] = useState("");

  const sessions = useQuery<Session[]>({
    queryKey: ["promotions", "sessions"],
    queryFn: async () => (await apiClient.get("/promotions/sessions")).data,
  });

  // Default to closing the current year into whatever comes after it.
  const resolved = useMemo(() => {
    const list = sessions.data ?? [];
    const current = list.find((s) => s.is_current) ?? list[0];
    const from = fromSession || current?.id || "";
    const others = list.filter((s) => s.id !== from);
    const to = toSession || others[0]?.id || "";
    return { from, to, list };
  }, [sessions.data, fromSession, toSession]);

  const preview = useQuery<{ pass_mark: number; count: number; students: PreviewStudent[] }>({
    queryKey: ["promotions", "preview", resolved.from, resolved.to, passMark],
    queryFn: async () =>
      (
        await apiClient.get("/promotions/preview", {
          params: { from_session_id: resolved.from, to_session_id: resolved.to, pass_mark: passMark },
        })
      ).data,
    enabled: !!resolved.from && !!resolved.to && resolved.from !== resolved.to,
  });

  const history = useQuery<Array<{
    batch_id: string;
    decided_at: string | null;
    total: number;
    promoted: number;
    retained: number;
    graduated: number;
    from_session: string | null;
    to_session: string | null;
  }>>({
    queryKey: ["promotions", "history"],
    queryFn: async () => (await apiClient.get("/promotions/history")).data,
  });

  const createSession = useMutation({
    mutationFn: async (name: string) =>
      (await apiClient.post("/promotions/sessions", { name, make_current: false })).data,
    onSuccess: () => {
      toast.success("The new academic year is ready. Add its classes, then promote into it.");
      setNewSessionName("");
      qc.invalidateQueries({ queryKey: ["promotions", "sessions"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "The session was not created"),
  });

  const students = preview.data?.students ?? [];

  const outcomeOf = (s: PreviewStudent): Outcome => overrides[s.student_id] ?? s.proposed_outcome;

  const counts = useMemo(() => {
    let promoted = 0, retained = 0, graduated = 0, blocked = 0, done = 0;
    for (const s of students) {
      if (s.already_decided) { done += 1; continue; }
      const outcome = outcomeOf(s);
      if (outcome === "promoted") {
        promoted += 1;
        if (!s.to_section_id) blocked += 1;
      } else if (outcome === "retained") retained += 1;
      else graduated += 1;
    }
    return { promoted, retained, graduated, blocked, done };
  }, [students, overrides]);

  const run = useMutation({
    mutationFn: async () => {
      const decisions = students
        .filter((s) => !s.already_decided)
        .map((s) => ({
          student_id: s.student_id,
          outcome: outcomeOf(s),
          to_section_id: outcomeOf(s) === "promoted" ? s.to_section_id : null,
          result_percentage: s.annual_percentage,
        }));
      return (
        await apiClient.post("/promotions/run", {
          from_session_id: resolved.from,
          to_session_id: resolved.to,
          decisions,
          carry_teachers: true,
        })
      ).data;
    },
    onSuccess: (result: any) => {
      const parts = [
        `${result.promoted} moved up`,
        `${result.retained} stayed`,
        `${result.graduated} left`,
      ];
      if (result.teacher_assignments_carried) {
        parts.push(`${result.teacher_assignments_carried} teacher assignments carried over`);
      }
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      toast.success(parts.join(" · "), { duration: 10000 });
      for (const problem of result.problems ?? []) toast.warning(problem, { duration: 12000 });
      setOverrides({});
      qc.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "The promotion did not run"),
  });

  const undo = useMutation({
    mutationFn: async (batchId: string) => (await apiClient.post(`/promotions/undo/${batchId}`)).data,
    onSuccess: (result: any) => {
      toast.success(`Reversed ${result.reversed} decisions; ${result.enrolments_reopened} enrolments reopened.`);
      qc.invalidateQueries({ queryKey: ["promotions"] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail ?? e?.message ?? "The run was not reversed"),
  });

  if (sessions.isError) {
    reportLoadFailure("the academic years", sessions.error);
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-3 text-white shadow-md shadow-emerald-500/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-black tracking-tight sm:text-2xl">Promotions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Close one academic year and open the next: who moves up, who stays, who leaves — reviewed
              first, recorded with the result it rests on, and reversible.
            </p>
          </div>
        </div>
      </div>

      {/* Which year into which */}
      <Card className="rounded-2xl">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Year being closed
            </Label>
            <Select value={resolved.from} onValueChange={setFromSession}>
              <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Pick a year" /></SelectTrigger>
              <SelectContent>
                {resolved.list.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.is_current ? " · current" : ""} · {s.enrolled} enrolled
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Year being opened
            </Label>
            <Select value={resolved.to} onValueChange={setToSession}>
              <SelectTrigger className="h-9 rounded-xl"><SelectValue placeholder="Pick a year" /></SelectTrigger>
              <SelectContent>
                {resolved.list.filter((s) => s.id !== resolved.from).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pass mark
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={passMark}
                onChange={(e) => setPassMark(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="h-9 rounded-xl"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New academic year
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="2027-2028"
                className="h-9 rounded-xl"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                disabled={newSessionName.trim().length < 4 || createSession.isPending}
                onClick={() => createSession.mutate(newSessionName.trim())}
              >
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What is about to happen */}
      {preview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Moving up", value: counts.promoted, tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Staying", value: counts.retained, tone: "text-amber-600 dark:text-amber-400" },
            { label: "Leaving", value: counts.graduated, tone: "text-sky-600 dark:text-sky-400" },
            { label: "Already decided", value: counts.done, tone: "text-muted-foreground" },
          ].map((tile) => (
            <Card key={tile.label} className="rounded-2xl">
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </p>
                <p className={`font-display text-2xl font-bold ${tile.tone}`}>{tile.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {counts.blocked > 0 ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-foreground">
              {counts.blocked} student{counts.blocked === 1 ? " has" : "s have"} nowhere to move into
            </p>
            <p className="text-muted-foreground">
              The year being opened has no section of the next class for them. Create those classes and
              sections in the new year first — they will be skipped otherwise, and told to you by name.
            </p>
          </div>
        </div>
      ) : null}

      {/* The review */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-base font-bold">
            Every student in the year being closed
          </CardTitle>
          <div className="flex items-center gap-2">
            <DataExportMenu
              title="Promotion Review"
              subtitle={`${resolved.list.find((s) => s.id === resolved.from)?.name ?? ""} → ${resolved.list.find((s) => s.id === resolved.to)?.name ?? ""}`}
              orientation="landscape"
              rows={students.map((s) => ({
                Student: s.name,
                Code: s.student_code ?? ABSENT,
                Class: `${s.from_class_name} ${s.from_section_name}`,
                "Annual %": s.annual_percentage ?? ABSENT,
                Decision: OUTCOME_LABEL[outcomeOf(s)],
                "Moves into": s.to_section_name ?? ABSENT,
                Why: s.reason,
              }))}
              disabled={students.length === 0}
              size="sm"
            />
            <Button
              onClick={() => run.mutate()}
              disabled={run.isPending || students.length === 0 || counts.done === students.length}
            >
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
              Promote {students.length - counts.done} student{students.length - counts.done === 1 ? "" : "s"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {preview.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
            </div>
          ) : preview.isError ? (
            <div className="grid place-items-center gap-2 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-rose-500" />
              <p className="font-semibold">The review could not be loaded</p>
              <p className="text-sm text-muted-foreground">
                {(preview.error as any)?.response?.data?.detail ?? (preview.error as Error)?.message}
              </p>
            </div>
          ) : students.length === 0 ? (
            <div className="grid place-items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="font-semibold">Nobody is enrolled in that year</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Pick the year your students are actually enrolled in, or add the new year's classes
                before promoting into it.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">Student</TableHead>
                    <TableHead>Now in</TableHead>
                    <TableHead className="text-right">Annual result</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Moves into</TableHead>
                    <TableHead className="pr-6">Why</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s) => {
                    const outcome = outcomeOf(s);
                    return (
                      <TableRow key={s.student_id} className={s.already_decided ? "opacity-60" : ""}>
                        <TableCell className="pl-6">
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.student_code ?? ABSENT}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.from_class_name} {s.from_section_name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.annual_percentage == null ? (
                            <span className="text-xs text-amber-600 dark:text-amber-400">not recorded</span>
                          ) : (
                            `${s.annual_percentage}%`
                          )}
                        </TableCell>
                        <TableCell>
                          {s.already_decided ? (
                            <Badge variant="secondary" className="rounded-md font-normal">
                              {OUTCOME_LABEL[s.already_decided as Outcome] ?? s.already_decided}
                            </Badge>
                          ) : (
                            <Select
                              value={outcome}
                              onValueChange={(v) =>
                                setOverrides((prev) => ({ ...prev, [s.student_id]: v as Outcome }))
                              }
                            >
                              <SelectTrigger className={`h-8 w-[120px] rounded-lg ${OUTCOME_TONE[outcome]}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="promoted">Move up</SelectItem>
                                <SelectItem value="retained">Stay</SelectItem>
                                <SelectItem value="graduated">Leaving</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {outcome !== "promoted" ? (
                            <span className="text-muted-foreground">{outcome === "retained" ? "Same class, new year" : "—"}</span>
                          ) : s.to_section_name ? (
                            s.to_section_name
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">no class in the new year</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px] pr-6 text-xs text-muted-foreground">
                          {s.reason}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What has been done before */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-display text-base font-bold">
            <History className="h-4 w-4 text-muted-foreground" /> Earlier runs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(history.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No year has been closed yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-6">When</TableHead>
                    <TableHead>From → to</TableHead>
                    <TableHead className="text-right">Moved up</TableHead>
                    <TableHead className="text-right">Stayed</TableHead>
                    <TableHead className="text-right">Left</TableHead>
                    <TableHead className="pr-6 text-right">Undo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data ?? []).map((batch) => (
                    <TableRow key={batch.batch_id}>
                      <TableCell className="pl-6 text-sm">
                        {batch.decided_at ? formatDate(batch.decided_at) : ABSENT}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {batch.from_session ?? ABSENT} → {batch.to_session ?? ABSENT}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{batch.promoted}</TableCell>
                      <TableCell className="text-right tabular-nums">{batch.retained}</TableCell>
                      <TableCell className="text-right tabular-nums">{batch.graduated}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={undo.isPending}
                          onClick={() => {
                            if (window.confirm(`Reverse this run? ${batch.total} decisions will be undone and the old enrolments reopened.`)) {
                              undo.mutate(batch.batch_id);
                            }
                          }}
                        >
                          <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Reverse
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
