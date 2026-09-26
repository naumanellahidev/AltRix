/**
 * The owner's board view: collections, admissions, the school's own rates,
 * teacher tenure and the tone of parents' messages — every figure from the
 * school's records (see routers/owner_insights.py).
 *
 * It used to fill any gap with invented figures — revenue of 1,250,000, 240
 * students, 94% attendance, 88% parent satisfaction, named "faculty" and a
 * "provincial average" — and print them as a board packet. Nothing here is a
 * stand-in: what cannot be known is shown as not available.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, Award, Brain, Frown, Lightbulb, Loader2, Meh, RefreshCw, ShieldCheck, Smile, Target, TrendingUp, Users,
} from "lucide-react";

import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { sum } from "@/lib/documents/decimal";
import { money, todayLabel } from "@/lib/documents/format";

interface TeacherRisk {
  name: string;
  experience: number;
  risk_score: number;
  category: string;
  factor: string;
}

interface OwnerInsightsSummary {
  revenue_forecast: {
    labels: string[];
    historical: Array<string | number>;
    forecast: Array<string | number | null>;
    method?: string | null;
    note?: string | null;
  };
  enrollment_forecast: { labels: string[]; data: number[]; series?: string; current_roll?: number };
  teacher_risk_scores: { risks: TeacherRisk[]; average_score: number | null; basis?: string; unknown_tenure?: number };
  parent_sentiments: { positive: number | null; negative: number | null; neutral: number | null; total_responses: number; basis?: string };
  benchmark_scores: { labels: string[]; school: Array<number | null>; provincial_average: Array<number | null> | null };
  created_at?: string;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);

export default function OwnerInsightsDashboard() {
  const [data, setData] = useState<OwnerInsightsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/owner-insights/summary");
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rev = data?.revenue_forecast;
  const collected6m = rev ? sum(rev.historical.map(String)) : null;
  const rates = data?.benchmark_scores;
  const recovery = rates?.school?.[0] ?? null;
  const attendance = rates?.school?.[1] ?? null;
  const resolvedRate = rates?.school?.[2] ?? null;
  const risks = data?.teacher_risk_scores.risks ?? [];
  const sentiment = data?.parent_sentiments;

  const revenueChartData = useMemo(
    () =>
      (rev?.labels ?? []).map((label, i) => ({
        month: label,
        Collected: rev?.historical[i] !== undefined ? Number(rev.historical[i]) : null,
        Projected: rev?.forecast[i] !== null && rev?.forecast[i] !== undefined ? Number(rev.forecast[i]) : null,
      })),
    [rev],
  );
  const admissionsChartData = useMemo(
    () => (data?.enrollment_forecast.labels ?? []).map((label, i) => ({ month: label, Admissions: data!.enrollment_forecast.data[i] ?? 0 })),
    [data],
  );
  const ratesChartData = useMemo(
    () =>
      (rates?.labels ?? [])
        .map((label, i) => ({ measure: label, "Our school": rates!.school[i] }))
        .filter((r) => r["Our school"] !== null),
    [rates],
  );

  // Directives from the figures themselves, each saying why it is shown.
  const directives = useMemo(() => {
    const out: Array<{ icon: typeof Target; tone: string; title: string; text: string }> = [];
    if (recovery !== null && recovery < 90) {
      out.push({ icon: Target, tone: "blue", title: "Fee recovery", text: `Only ${recovery}% of fees due this fiscal year have been collected. Chase overdue vouchers and send reminders before the due date.` });
    }
    if (attendance !== null && attendance < 95) {
      out.push({ icon: Users, tone: "purple", title: "Attendance", text: `Attendance over the last 30 days is ${attendance}%, below the usual 95% target. Follow up on repeated absences with families.` });
    }
    const newTeachers = risks.filter((r) => r.category === "high").length;
    if (newTeachers) {
      out.push({ icon: ShieldCheck, tone: "emerald", title: "New teachers", text: `${newTeachers} teacher${newTeachers === 1 ? " is" : "s are"} in their first year. Pair them with senior staff and check in each term.` });
    }
    if (sentiment && sentiment.negative !== null && sentiment.negative >= 30) {
      out.push({ icon: AlertTriangle, tone: "amber", title: "Parent concerns", text: `${sentiment.negative}% of parents' messages read as complaints. Review open messages and response times.` });
    }
    if (resolvedRate !== null && resolvedRate < 80) {
      out.push({ icon: Lightbulb, tone: "amber", title: "Unresolved messages", text: `${resolvedRate}% of parents' messages are marked resolved. Close the loop on the rest.` });
    }
    return out;
  }, [recovery, attendance, resolvedRate, risks, sentiment]);

  const packet = () => ({
    title: "Board Packet",
    subtitle: todayLabel(),
    rows: [
      { Measure: "Fees collected, last six months (PKR)", Value: collected6m ? money(collected6m) : "—" },
      { Measure: "Students on roll", Value: data?.enrollment_forecast.current_roll ?? "—" },
      { Measure: "Fee recovery, this fiscal year", Value: pct(recovery) },
      { Measure: "Attendance, last 30 days", Value: pct(attendance) },
      { Measure: "Parents' messages resolved", Value: pct(resolvedRate) },
      { Measure: "Parents' messages (positive / neutral / negative)", Value: sentiment?.total_responses ? `${pct(sentiment.positive)} / ${pct(sentiment.neutral)} / ${pct(sentiment.negative)} of ${sentiment.total_responses}` : "No messages yet" },
    ],
    sections: [
      {
        title: "Fees collected by month",
        rows: (rev?.labels ?? []).map((label, i) => ({
          Month: label,
          Collected: rev?.historical[i] ?? "",
          Projected: rev?.forecast[i] ?? "",
        })),
        columns: [
          { header: "Month", key: "Month" },
          { header: "Collected (PKR)", key: "Collected", type: "money" as const },
          { header: "Projected (PKR)", key: "Projected", type: "money" as const },
        ],
      },
      {
        title: "New admissions by month",
        rows: admissionsChartData.map((r) => ({ Month: r.month, Admissions: r.Admissions })),
      },
      {
        title: "Teachers by tenure",
        rows: risks.map((r) => ({ Teacher: r.name, "Years at school": r.experience, Flag: r.category, Reason: r.factor })),
        emptyMessage: "No teachers have a joining date recorded.",
      },
      { title: "Directives", rows: directives.map((d) => ({ Area: d.title, Action: d.text })), emptyMessage: "No figure calls for action." },
    ],
  });

  return (
    <div className={`mx-auto max-w-7xl space-y-6 p-4 md:p-6 ${isPresentationMode ? "bg-white p-8 text-slate-900" : ""}`}>
      <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-700 p-6 text-white shadow-lg md:flex-row md:items-center">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-blue-200" />
            <h1 className="text-3xl font-bold tracking-tight">Owner & Board Insights</h1>
          </div>
          <p className="text-sm font-medium text-blue-100">
            Collections, admissions, attendance, teacher tenure and parents' messages — from your school's own records.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={() => void load()} variant="outline" className="border-white/30 bg-white/10 font-semibold text-white hover:bg-white/20">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={() => setIsPresentationMode(!isPresentationMode)} variant="outline" className="border-white/30 bg-white/10 font-semibold text-white hover:bg-white/20">
            {isPresentationMode ? "Exit Board View" : "Board Presentation Mode"}
          </Button>
          <DataExportMenu {...packet()} variant="secondary" label="Board Packet" disabled={!data} fileNameParts={["Board Packet", todayLabel()]} />
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-destructive">The figures could not be loaded: {error}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4" /> Retry</Button>
          </CardContent>
        </Card>
      )}
      {!data && loading && (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              { icon: TrendingUp, tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400", label: "Fees collected (6 months)", value: collected6m ? `PKR ${money(collected6m)}` : "—" },
              { icon: Users, tone: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400", label: "Students on roll", value: String(data.enrollment_forecast.current_roll ?? "—") },
              { icon: Award, tone: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400", label: "Fee recovery (this FY)", value: pct(recovery) },
              { icon: Smile, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400", label: "Attendance (30 days)", value: pct(attendance) },
            ].map(({ icon: Icon, tone, label, value }) => (
              <Card key={label} className="p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-3 ${tone}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-0.5 text-2xl font-bold">{value}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="shadow-sm md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base font-bold">
                  <span className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600" /> Fees collected by month</span>
                  {rev?.method && <Badge variant="secondary" className="text-xs">Projection: {rev.method}</Badge>}
                </CardTitle>
                {rev?.note && <p className="text-xs text-muted-foreground">{rev.note}</p>}
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(v) => [`PKR ${money(String(v))}`, "Amount"]} />
                    <Legend verticalAlign="top" height={36} />
                    <Line type="monotone" dataKey="Collected" stroke="#2563eb" strokeWidth={3} activeDot={{ r: 7 }} />
                    <Line type="monotone" dataKey="Projected" stroke="#9333ea" strokeDasharray="5 5" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base font-bold">Parents' messages</CardTitle></CardHeader>
              <CardContent className="space-y-6 pt-2">
                {sentiment && sentiment.total_responses > 0 ? (
                  <>
                    <div className="flex items-center justify-around py-2">
                      {[
                        { icon: Smile, label: "Positive", value: sentiment.positive, cls: "text-emerald-500 bg-emerald-500/10" },
                        { icon: Meh, label: "Neutral", value: sentiment.neutral, cls: "text-amber-500 bg-amber-500/10" },
                        { icon: Frown, label: "Negative", value: sentiment.negative, cls: "text-rose-500 bg-rose-500/10" },
                      ].map(({ icon: Icon, label, value, cls }) => (
                        <div key={label} className="space-y-1 text-center">
                          <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${cls}`}><Icon className="h-6 w-6" /></div>
                          <div className="text-lg font-black">{pct(value)}</div>
                          <div className="text-[10px] font-bold uppercase text-slate-500">{label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      <Progress value={sentiment.positive ?? 0} className="h-2" />
                      <p className="pt-1 text-[10px] text-slate-500">
                        {sentiment.total_responses} message{sentiment.total_responses === 1 ? "" : "s"}. {sentiment.basis ?? ""}. Resolved: {pct(resolvedRate)}.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages from parents yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-base font-bold">New admissions by month</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={admissionsChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Admissions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-bold">Our school's rates</CardTitle>
                <p className="text-xs text-muted-foreground">No provincial benchmark is available, so none is shown.</p>
              </CardHeader>
              <CardContent className="h-64">
                {ratesChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ratesChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="measure" stroke="#888888" fontSize={11} />
                      <YAxis stroke="#888888" fontSize={11} domain={[0, 100]} />
                      <Tooltip formatter={(v) => [`${v}%`, "Our school"]} />
                      <Bar dataKey="Our school" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-16 text-center text-sm text-muted-foreground">Not enough records yet to work out these rates.</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm md:col-span-3">
              <CardHeader>
                <CardTitle className="text-base font-bold">Teachers by tenure</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {data.teacher_risk_scores.basis}
                  {data.teacher_risk_scores.unknown_tenure ? ` · ${data.teacher_risk_scores.unknown_tenure} without a joining date` : ""}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {risks.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Teacher</TableHead><TableHead>Years at school</TableHead><TableHead>Flag</TableHead><TableHead>Reason</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {risks.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.experience}</TableCell>
                          <TableCell>
                            <Badge variant={r.category === "high" ? "destructive" : r.category === "medium" ? "secondary" : "outline"}>{r.category}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.factor}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">No teachers have a joining date recorded.</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm md:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Lightbulb className="h-5 w-5 text-amber-500" /> What the figures call for
                </CardTitle>
              </CardHeader>
              <CardContent>
                {directives.length ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {directives.map(({ icon: Icon, title, text }) => (
                      <div key={title} className="rounded-xl border bg-muted/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4" /> {title}</div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing in the current figures calls for action.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
