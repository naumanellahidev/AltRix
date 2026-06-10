import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  Download,
  FileText,
  Heart,
  Star,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { format, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props {
  schoolId: string | null;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function OwnerHrModule({ schoolId }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const activeCampusId = useActiveCampus(schoolId);

  const { data: directory } = useQuery({
    queryKey: ["owner_hr_directory", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return [] as any[];
      const { data } = await (supabase as any).rpc("get_school_user_directory", { _school_id: schoolId });
      return (data || []) as any[];
    },
  });
  const nameOf = (uid?: string | null) => {
    if (!uid) return "—";
    const u = (directory || []).find((d: any) => d.user_id === uid);
    return u?.display_name || u?.email || `${uid.slice(0, 8)}…`;
  };

  const { data: hrData, isLoading } = useQuery({
    queryKey: ["owner_hr", schoolId, activeCampusId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;

      // Optionally restrict to staff assigned to active campus
      let staffUserIds: string[] | null = null;
      if (activeCampusId) {
        const { data: sca } = await supabase
          .from("staff_campus_assignments")
          .select("user_id")
          .eq("campus_id", activeCampusId);
        staffUserIds = (sca || []).map((r: any) => r.user_id);
      }
      const applyUserFilter = (q: any) =>
        staffUserIds
          ? staffUserIds.length
            ? q.in("user_id", staffUserIds)
            : q.eq("user_id", "00000000-0000-0000-0000-000000000000")
          : q;

      const [staffRes, rolesRes, salariesRes, leavesRes, payRunsRes, contractsRes, reviewsRes] =
        await Promise.all([
          applyUserFilter(supabase.from("school_memberships").select("*").eq("school_id", schoolId)),
          applyUserFilter(supabase.from("user_roles").select("*").eq("school_id", schoolId)),
          applyUserFilter(supabase.from("hr_salary_records").select("*").eq("school_id", schoolId)),
          applyUserFilter(
            supabase
              .from("hr_leave_requests")
              .select("*")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
          ),
          supabase
            .from("hr_pay_runs")
            .select("*")
            .eq("school_id", schoolId)
            .order("year", { ascending: false })
            .order("month", { ascending: false }),
          applyUserFilter(supabase.from("hr_contracts").select("*").eq("school_id", schoolId)),
          applyUserFilter(
            supabase
              .from("hr_reviews")
              .select("*")
              .eq("school_id", schoolId)
              .order("review_date", { ascending: false })
          ),
        ]);

      const staff = staffRes.data || [];
      const roles = rolesRes.data || [];
      const salaries = salariesRes.data || [];
      const leaves = leavesRes.data || [];
      const payRuns = payRunsRes.data || [];
      const contracts = contractsRes.data || [];
      const reviews = reviewsRes.data || [];

      const activeStaff = staff.filter((s: any) => s.status === "active").length;
      const totalStaff = staff.length;

      const roleDistribution: Record<string, number> = {};
      roles.forEach((r: any) => {
        const role = r.role || "unknown";
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      });

      const activeSalaries = salaries.filter((s: any) => s.is_active);
      const totalSalaryBill = activeSalaries.reduce(
        (sum: number, s: any) =>
          sum + Number(s.base_salary || 0) + Number(s.allowances || 0) - Number(s.deductions || 0),
        0
      );
      const avgSalary = activeSalaries.length > 0 ? totalSalaryBill / activeSalaries.length : 0;

      const pendingLeaves = leaves.filter((l: any) => l.status === "pending").length;
      const approvedLeaves = leaves.filter((l: any) => l.status === "approved").length;
      const rejectedLeaves = leaves.filter((l: any) => l.status === "rejected").length;

      // Pay-run trend (last 6 months)
      const trend = Array.from({ length: 6 }).map((_, idx) => {
        const d = subMonths(new Date(), 5 - idx);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const rows = payRuns.filter((p: any) => p.month === m && p.year === y);
        const gross = rows.reduce((s: number, r: any) => s + Number(r.gross_amount || 0), 0);
        const net = rows.reduce((s: number, r: any) => s + Number(r.net_amount || 0), 0);
        return { month: format(d, "MMM"), gross, net };
      });

      // Contracts expiring within 60 days
      const now = Date.now();
      const expiring = contracts.filter((c: any) => {
        if (!c.end_date) return false;
        const t = new Date(c.end_date).getTime();
        return t > now && t - now < 60 * 24 * 60 * 60 * 1000;
      });

      // Average review rating
      const avgRating =
        reviews.length > 0
          ? reviews.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / reviews.length
          : 0;

      const engagementScore = totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0;
      // Retention = staff still active vs total ever-joined (proxy)
      const retentionRate = totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0;
      const burnoutRisk = pendingLeaves > 5 ? "High" : pendingLeaves > 2 ? "Medium" : "Low";

      return {
        totalStaff,
        activeStaff,
        roleDistribution,
        totalSalaryBill,
        avgSalary,
        pendingLeaves,
        approvedLeaves,
        rejectedLeaves,
        payrollProcessed: payRuns.filter((p: any) => p.status === "completed").length,
        engagementScore,
        retentionRate,
        burnoutRisk,
        teachers: roleDistribution["teacher"] || 0,
        leaves,
        contracts,
        reviews,
        expiring,
        avgRating,
        trend,
      };
    },
  });

  const roleChartData = useMemo(() => {
    if (!hrData) return [];
    return Object.entries(hrData.roleDistribution)
      .map(([name, value], idx) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        fill: COLORS[idx % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [hrData]);

  const formatCurrency = (amount: number) => {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return Math.round(amount).toLocaleString();
  };

  const exportLeavesCSV = () => {
    const rows = hrData?.leaves || [];
    const head = ["Employee", "Type", "Start", "End", "Days", "Status", "Reason"];
    const lines = rows.map((l: any) =>
      [nameOf(l.user_id), l.leave_type_id || "", l.start_date || "", l.end_date || "", l.days_count || 0, l.status || "", (l.reason || "").replace(/,/g, " ")].join(",")
    );
    const blob = new Blob([head.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hr-leaves-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">HR & Culture</h1>
          <p className="text-muted-foreground">
            Staff, payroll, leaves, contracts and performance reviews
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportLeavesCSV}>
          <Download className="mr-2 h-4 w-4" /> Export leaves
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card><CardContent className="p-4"><Users className="h-5 w-5 text-primary" /><p className="mt-2 font-display text-2xl font-bold">{hrData?.totalStaff || 0}</p><p className="text-xs text-muted-foreground">Total Staff</p></CardContent></Card>
        <Card><CardContent className="p-4"><UserCheck className="h-5 w-5 text-emerald-600" /><p className="mt-2 font-display text-2xl font-bold">{hrData?.activeStaff || 0}</p><p className="text-xs text-muted-foreground">Active Staff</p></CardContent></Card>
        <Card><CardContent className="p-4"><Briefcase className="h-5 w-5 text-blue-600" /><p className="mt-2 font-display text-2xl font-bold">{hrData?.teachers || 0}</p><p className="text-xs text-muted-foreground">Teachers</p></CardContent></Card>
        <Card><CardContent className="p-4"><Wallet className="h-5 w-5 text-purple-600" /><p className="mt-2 font-display text-2xl font-bold">{formatCurrency(hrData?.totalSalaryBill || 0)}</p><p className="text-xs text-muted-foreground">Monthly Payroll</p></CardContent></Card>
        <Card><CardContent className="p-4"><Heart className="h-5 w-5 text-pink-600" /><Badge variant={(hrData?.engagementScore || 0) >= 80 ? "default" : "destructive"} className="text-[10px]">Score</Badge><p className="mt-2 font-display text-2xl font-bold">{hrData?.engagementScore || 0}%</p><p className="text-xs text-muted-foreground">Engagement</p></CardContent></Card>
        <Card className={hrData?.burnoutRisk === "High" ? "border-red-500/50" : ""}><CardContent className="p-4"><AlertTriangle className={`h-5 w-5 ${hrData?.burnoutRisk === "High" ? "text-red-600" : hrData?.burnoutRisk === "Medium" ? "text-amber-600" : "text-emerald-600"}`} /><p className="mt-2 font-display text-2xl font-bold">{hrData?.burnoutRisk || "Low"}</p><p className="text-xs text-muted-foreground">Burnout Risk</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="salary">Payroll</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Staff by Role</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={roleChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {roleChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Key Metrics</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm"><span>Retention Rate</span><span className="font-medium">{hrData?.retentionRate || 0}%</span></div>
                  <Progress value={hrData?.retentionRate || 0} className="mt-2 h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm"><span>Engagement</span><span className="font-medium">{hrData?.engagementScore || 0}%</span></div>
                  <Progress value={hrData?.engagementScore || 0} className="mt-2 h-2" />
                </div>
                <div className="flex justify-between text-sm"><span>Pending Leave Requests</span><span className="font-medium">{hrData?.pendingLeaves || 0}</span></div>
                <div className="flex justify-between text-sm"><span>Contracts Expiring (60d)</span><span className="font-medium">{hrData?.expiring.length || 0}</span></div>
                <div className="flex justify-between text-sm"><span>Avg Performance Rating</span><span className="font-medium flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{(hrData?.avgRating || 0).toFixed(1)}</span></div>
                <div className="flex justify-between text-sm"><span>Average Salary</span><span className="font-medium">{formatCurrency(hrData?.avgSalary || 0)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Role Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={roleChartData} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={140} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {roleChartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-primary/10 p-6 text-center"><p className="text-3xl font-bold text-primary">{formatCurrency(hrData?.totalSalaryBill || 0)}</p><p className="mt-1 text-sm text-muted-foreground">Total Monthly Payroll</p></div>
            <div className="rounded-xl bg-blue-500/10 p-6 text-center"><p className="text-3xl font-bold text-blue-600">{formatCurrency(hrData?.avgSalary || 0)}</p><p className="mt-1 text-sm text-muted-foreground">Average Salary</p></div>
            <div className="rounded-xl bg-emerald-500/10 p-6 text-center"><p className="text-3xl font-bold text-emerald-600">{hrData?.payrollProcessed || 0}</p><p className="mt-1 text-sm text-muted-foreground">Payrolls Processed</p></div>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Payroll trend (6 months)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hrData?.trend || []}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="gross" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="net" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave requests ({hrData?.leaves.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {(hrData?.leaves.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No leave requests yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hrData?.leaves.slice(0, 30).map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{nameOf(l.user_id)}</TableCell>
                        <TableCell>{l.start_date}</TableCell>
                        <TableCell>{l.end_date}</TableCell>
                        <TableCell>{l.days_count}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>
                            {l.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Contracts ({hrData?.contracts.length || 0}) — {hrData?.expiring.length || 0} expiring soon</CardTitle>
            </CardHeader>
            <CardContent>
              {(hrData?.contracts.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No contracts on file.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hrData?.contracts.slice(0, 30).map((c: any) => {
                      const exp = c.end_date && new Date(c.end_date).getTime() - Date.now() < 60 * 86400000;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{nameOf(c.user_id)}</TableCell>
                          <TableCell>{c.position || "—"}</TableCell>
                          <TableCell>{c.contract_type || "—"}</TableCell>
                          <TableCell>{c.start_date || "—"}</TableCell>
                          <TableCell className={exp ? "text-amber-600 font-medium" : ""}>{c.end_date || "—"}</TableCell>
                          <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status || "—"}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance reviews — avg {(hrData?.avgRating || 0).toFixed(1)}/5</CardTitle>
            </CardHeader>
            <CardContent>
              {(hrData?.reviews.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No performance reviews yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hrData?.reviews.slice(0, 30).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{nameOf(r.user_id)}</TableCell>
                        <TableCell>{nameOf(r.reviewer_id)}</TableCell>
                        <TableCell>{r.review_date || "—"}</TableCell>
                        <TableCell className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{Number(r.rating || 0).toFixed(1)}</TableCell>
                        <TableCell><Badge variant="secondary">{r.status || "—"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
