import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Users, Briefcase, TrendingUp, Download, UserMinus, UserPlus,
  DollarSign, Sparkles, Printer, ChevronUp, ChevronDown, FileSpreadsheet,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid, Legend, Area, AreaChart,
} from "recharts";
import { format, subMonths } from "date-fns";
import { usePdfExport } from "@/hooks/usePdfExport";
import { BrandedDocument } from "@/components/pdf/BrandedDocument";
import { useSchoolDocument } from "@/hooks/useSchoolDocument";

type Period = 6 | 12;

export function HrAnalyticsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const school = useSchoolDocument(schoolId);
  const { printNode, exportNodeToPdf } = usePdfExport();
  const reportRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<Period>(6);
  const [data, setData] = useState<any>({
    headcount: 0, activeStaff: 0, newHires: 0, exits: 0,
    leavePending: 0, leaveApproved: 0, openPositions: 0,
    payrollYTD: 0, byRole: [], hireTrend: [], salaryTrend: [],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);

    const sinceISO = subMonths(new Date(), period).toISOString();

    const [roles, leaves, postings, payroll, onb, offb] = await Promise.all([
      (supabase as any).from("user_roles").select("user_id, role").eq("school_id", schoolId),
      (supabase as any).from("hr_leave_requests").select("id, status, leave_type_id, created_at").eq("school_id", schoolId).gte("created_at", sinceISO),
      (supabase as any).from("hr_job_postings").select("status, openings").eq("school_id", schoolId),
      (supabase as any).from("hr_payroll_runs").select("period_year, period_month, total_net, status").eq("school_id", schoolId).gte("period_year", new Date().getFullYear()),
      (supabase as any).from("hr_onboarding_assignments").select("created_at, kind").eq("school_id", schoolId).eq("kind", "onboarding").gte("created_at", sinceISO),
      (supabase as any).from("hr_onboarding_assignments").select("created_at, kind").eq("school_id", schoolId).eq("kind", "offboarding").gte("created_at", sinceISO),
    ]);

    const rolesData = roles.data || [];
    const headcount = new Set(rolesData.map((r: any) => r.user_id)).size;
    const byRoleMap = new Map<string, number>();
    for (const r of rolesData) byRoleMap.set(r.role, (byRoleMap.get(r.role) || 0) + 1);
    const byRole = Array.from(byRoleMap.entries())
      .map(([role, count]) => ({ role: role.replace(/_/g, " "), count }))
      .sort((a, b) => b.count - a.count);

    const leaveData = leaves.data || [];
    const leavePending = leaveData.filter((l: any) => l.status === "pending").length;
    const leaveApproved = leaveData.filter((l: any) => l.status === "approved").length;

    const postingData = postings.data || [];
    const openPositions = postingData.filter((p: any) => p.status === "open").reduce((s: number, p: any) => s + p.openings, 0);

    const payrollData = payroll.data || [];
    const payrollYTD = payrollData.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.total_net || 0), 0);

    const salaryTrend = Array.from({ length: period }).map((_, i) => {
      const d = subMonths(new Date(), period - 1 - i);
      const y = d.getFullYear(); const m = d.getMonth() + 1;
      const row = payrollData.find((p: any) => p.period_year === y && p.period_month === m);
      return { month: format(d, "MMM"), net: row ? Number(row.total_net) : 0 };
    });

    const hireTrendMap = new Map<string, { hires: number; exits: number }>();
    for (let i = period - 1; i >= 0; i--) {
      const k = format(subMonths(new Date(), i), "MMM");
      hireTrendMap.set(k, { hires: 0, exits: 0 });
    }
    for (const r of onb.data || []) {
      const k = format(new Date(r.created_at), "MMM");
      const v = hireTrendMap.get(k); if (v) v.hires += 1;
    }
    for (const r of offb.data || []) {
      const k = format(new Date(r.created_at), "MMM");
      const v = hireTrendMap.get(k); if (v) v.exits += 1;
    }
    const hireTrend = Array.from(hireTrendMap.entries()).map(([month, v]) => ({ month, ...v }));

    setData({
      headcount, activeStaff: headcount,
      newHires: (onb.data || []).length,
      exits: (offb.data || []).length,
      leavePending, leaveApproved, openPositions, payrollYTD,
      byRole, hireTrend, salaryTrend,
    });
    setLoading(false);
  }, [schoolId, period]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const rows = [
      ["Metric", "Value"],
      ["Headcount", data.headcount],
      [`New hires (${period}mo)`, data.newHires],
      [`Exits (${period}mo)`, data.exits],
      ["Open positions", data.openPositions],
      ["Pending leaves", data.leavePending],
      ["Approved leaves", data.leaveApproved],
      ["Payroll YTD (net)", data.payrollYTD],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hr-analytics-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!schoolId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const turnover = data.headcount ? Math.round((data.exits / data.headcount) * 100) : 0;
  const netHires = data.newHires - data.exits;

  const COLORS = [
    "hsl(var(--primary))", "hsl(220 80% 60%)", "hsl(160 70% 45%)",
    "hsl(35 90% 55%)", "hsl(280 70% 60%)", "hsl(0 75% 60%)",
  ];

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 md:p-7"
      >
        <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary/80 font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              Workforce Intelligence
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight mt-1.5">HR Analytics</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Live workforce metrics across the school · last {period} months
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border bg-card p-1">
              {([6, 12] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}mo
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reportRef.current && printNode(reportRef.current)}
            >
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
            <Button
              size="sm"
              onClick={() =>
                reportRef.current &&
                exportNodeToPdf(reportRef.current, { filename: `hr-analytics-${format(new Date(), "yyyy-MM-dd")}` })
              }
            >
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Headcount" value={data.headcount} icon={Users} tone="primary" />
        <KPI label={`New hires (${period}mo)`} value={data.newHires} icon={UserPlus} tone="success"
             delta={netHires} deltaLabel="net change" />
        <KPI label={`Exits (${period}mo)`} value={data.exits} icon={UserMinus} tone="warning" />
        <KPI label="Open positions" value={data.openPositions} icon={Briefcase} tone="info" />
        <KPI label="Pending leaves" value={data.leavePending} icon={TrendingUp} tone="info" />
        <KPI label="Approved leaves" value={data.leaveApproved} icon={TrendingUp} tone="success" />
        <KPI
          label="Payroll net YTD"
          value={Number(data.payrollYTD).toLocaleString()}
          icon={DollarSign} tone="success"
        />
        <KPI label="Turnover ratio" value={`${turnover}%`} icon={BarChart3}
             tone={turnover > 20 ? "warning" : "primary"} />
      </div>

      {/* Charts */}
      <Tabs defaultValue="headcount" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="headcount">Headcount</TabsTrigger>
          <TabsTrigger value="movement">Hires vs Exits</TabsTrigger>
          <TabsTrigger value="payroll">Payroll Trend</TabsTrigger>
        </TabsList>

        <TabsContent value="headcount">
          <Card className="card-premium">
            <CardContent className="p-5">
              <SectionTitle title="Headcount by Role" hint="Distribution across all active staff" />
              <div className="grid md:grid-cols-2 gap-6 mt-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byRole} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="role" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="url(#barFill)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.byRole} dataKey="count" nameKey="role"
                        cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={2}
                      >
                        {data.byRole.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movement">
          <Card className="card-premium">
            <CardContent className="p-5">
              <SectionTitle title="Hires vs Exits" hint={`Net change: ${netHires >= 0 ? "+" : ""}${netHires} this period`} />
              <div className="h-80 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hireTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="hires" fill="hsl(160 70% 45%)" name="Hires" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="exits" fill="hsl(0 75% 60%)" name="Exits" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card className="card-premium">
            <CardContent className="p-5">
              <SectionTitle title="Net Payroll Trend" hint="Total paid net by month" />
              <div className="h-80 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.salaryTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="payFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="net" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#payFill)" name="Net Payroll" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Refreshing…
        </p>
      )}

      {/* Off-screen printable report — kept rendered so print/PDF buttons can capture it */}
      <div className="fixed -left-[10000px] top-0 pointer-events-none" aria-hidden>
        <BrandedDocument
          ref={reportRef}
          school={school.school}
          documentTitle="HR Analytics Report"
          referenceNumber={`HRA-${format(new Date(), "yyyyMMdd")}`}
        >
          <h2 className="text-xl font-bold mb-1">Workforce Summary — last {period} months</h2>
          <p className="text-xs text-slate-500 mb-4">Generated on {format(new Date(), "d MMMM yyyy")}</p>

          <table className="w-full text-[12.5px] border border-slate-200">
            <tbody>
              {[
                ["Total headcount", data.headcount],
                [`New hires (${period}mo)`, data.newHires],
                [`Exits (${period}mo)`, data.exits],
                ["Net change", (netHires >= 0 ? "+" : "") + netHires],
                ["Open positions", data.openPositions],
                ["Pending leave requests", data.leavePending],
                ["Approved leave requests", data.leaveApproved],
                ["Turnover ratio", `${turnover}%`],
                ["Payroll net (YTD, paid)", Number(data.payrollYTD).toLocaleString()],
              ].map(([k, v]) => (
                <tr key={k as string} className="border-b border-slate-200 last:border-0">
                  <td className="py-2 px-3 bg-slate-50 font-medium text-slate-700 w-1/2">{k}</td>
                  <td className="py-2 px-3 font-semibold">{v as any}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.byRole?.length > 0 && (
            <>
              <h3 className="text-sm font-bold mt-6 mb-2 uppercase tracking-wide text-slate-700">
                Headcount by Role
              </h3>
              <table className="w-full text-[12.5px] border border-slate-200">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left py-2 px-3 font-semibold text-slate-700">Role</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-700">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byRole.map((r: any) => (
                    <tr key={r.role} className="border-b border-slate-200 last:border-0">
                      <td className="py-2 px-3 capitalize">{r.role}</td>
                      <td className="py-2 px-3 text-right font-mono">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </BrandedDocument>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function KPI({
  label, value, icon: Icon, tone, delta, deltaLabel,
}: {
  label: string; value: any; icon: any;
  tone?: "primary" | "success" | "warning" | "info";
  delta?: number; deltaLabel?: string;
}) {
  const toneMap: Record<string, string> = {
    primary: "from-primary/15 to-primary/5 text-primary",
    success: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
    info: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400",
  };
  const cls = toneMap[tone || "primary"];
  const showDelta = typeof delta === "number";
  return (
    <Card className="card-premium card-premium-hover group overflow-hidden">
      <CardContent className="p-4 relative">
        <div className={`absolute inset-0 bg-gradient-to-br ${cls.split(" text-")[0]} opacity-50 pointer-events-none`} />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate">{label}</p>
            <p className="text-2xl font-bold mt-1.5 tracking-tight">{value}</p>
            {showDelta && (
              <div className="flex items-center gap-1 mt-1.5 text-[11px] font-medium">
                {delta! >= 0 ? (
                  <ChevronUp className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-rose-500" />
                )}
                <span className={delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {delta! >= 0 ? "+" : ""}{delta}
                </span>
                {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
              </div>
            )}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${cls} ring-1 ring-current/10`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
