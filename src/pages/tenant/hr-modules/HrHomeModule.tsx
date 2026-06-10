import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Users, Calendar, ClipboardList, Coins, FileText, Star, UserPlus, Headphones, Briefcase,
  Wallet, BarChart3, ClipboardCheck, AlertTriangle, TrendingUp, Megaphone,
} from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Metrics = {
  headcount: number;
  pendingLeaves: number;
  activeContracts: number;
  expiringContracts: number;
  openPositions: number;
  pendingApplicants: number;
  draftPayrollRuns: number;
  upcomingInterviews: number;
  pendingReviews: number;
  activeOnboarding: number;
  pendingRegularizations: number;
};

export function HrHomeModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const basePath = `/${schoolSlug}/hr`;

  const [m, setM] = useState<Metrics>({
    headcount: 0, pendingLeaves: 0, activeContracts: 0, expiringContracts: 0,
    openPositions: 0, pendingApplicants: 0, draftPayrollRuns: 0, upcomingInterviews: 0,
    pendingReviews: 0, activeOnboarding: 0, pendingRegularizations: 0,
  });
  const [recentHires, setRecentHires] = useState<any[]>([]);
  const [expiringList, setExpiringList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const now = new Date();
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);

    const [roles, leaves, contracts, postings, applicants, payroll, interviews, onboarding, regs] = await Promise.all([
      (supabase as any).from("user_roles").select("user_id", { count: "exact", head: true }).eq("school_id", schoolId),
      (supabase as any).from("hr_leave_requests").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "pending"),
      (supabase as any).from("hr_contracts").select("id, user_id, end_date, status").eq("school_id", schoolId),
      (supabase as any).from("hr_job_postings").select("id, openings", { count: "exact" }).eq("school_id", schoolId).eq("status", "open"),
      (supabase as any).from("hr_applicants").select("id", { count: "exact", head: true }).eq("school_id", schoolId).in("stage", ["applied", "screening"]),
      (supabase as any).from("hr_payroll_runs").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "draft"),
      (supabase as any).from("hr_interviews").select("id", { count: "exact", head: true }).eq("school_id", schoolId).gte("scheduled_at", now.toISOString()).lte("scheduled_at", in30.toISOString()).eq("status", "scheduled"),
      (supabase as any).from("hr_onboarding_assignments").select("id, employee_user_id, start_date, kind, status").eq("school_id", schoolId).eq("kind", "onboarding").order("start_date", { ascending: false }).limit(5),
      (supabase as any).from("hr_attendance_regularizations").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "pending"),
    ]);

    const contractsData = contracts.data || [];
    const expiring = contractsData.filter((c: any) => c.status === "active" && c.end_date && new Date(c.end_date) <= in30 && new Date(c.end_date) >= now);

    setM({
      headcount: roles.count || 0,
      pendingLeaves: leaves.count || 0,
      activeContracts: contractsData.filter((c: any) => c.status === "active").length,
      expiringContracts: expiring.length,
      openPositions: (postings.data || []).reduce((s: number, p: any) => s + p.openings, 0),
      pendingApplicants: applicants.count || 0,
      draftPayrollRuns: payroll.count || 0,
      upcomingInterviews: interviews.count || 0,
      pendingReviews: 0,
      activeOnboarding: (onboarding.data || []).filter((o: any) => o.status === "in_progress").length,
      pendingRegularizations: regs.count || 0,
    });
    setRecentHires(onboarding.data || []);
    setExpiringList(expiring.slice(0, 5));
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  if (!schoolId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const kpis = [
    { label: "Headcount", value: m.headcount, icon: Users, to: `${basePath}/users`, tone: "info" },
    { label: "Pending leaves", value: m.pendingLeaves, icon: Calendar, to: `${basePath}/leaves`, tone: m.pendingLeaves > 0 ? "warning" : "neutral" },
    { label: "Open positions", value: m.openPositions, icon: Briefcase, to: `${basePath}/recruitment`, tone: "info" },
    { label: "New applicants", value: m.pendingApplicants, icon: UserPlus, to: `${basePath}/recruitment`, tone: m.pendingApplicants > 0 ? "warning" : "neutral" },
    { label: "Active contracts", value: m.activeContracts, icon: FileText, to: `${basePath}/contracts`, tone: "success" },
    { label: "Expiring ≤30d", value: m.expiringContracts, icon: AlertTriangle, to: `${basePath}/contracts`, tone: m.expiringContracts > 0 ? "destructive" : "neutral" },
    { label: "Draft payroll", value: m.draftPayrollRuns, icon: Wallet, to: `${basePath}/payroll`, tone: m.draftPayrollRuns > 0 ? "warning" : "neutral" },
    { label: "Onboarding", value: m.activeOnboarding, icon: ClipboardCheck, to: `${basePath}/onboarding`, tone: "info" },
    { label: "Interviews ≤30d", value: m.upcomingInterviews, icon: Calendar, to: `${basePath}/recruitment`, tone: "info" },
    { label: "Regularizations", value: m.pendingRegularizations, icon: ClipboardList, to: `${basePath}/attendance`, tone: m.pendingRegularizations > 0 ? "warning" : "neutral" },
  ];

  const quickActions = [
    { label: "Add Staff", icon: UserPlus, to: `${basePath}/users` },
    { label: "Post Job", icon: Briefcase, to: `${basePath}/recruitment` },
    { label: "Run Payroll", icon: Wallet, to: `${basePath}/payroll` },
    { label: "Mark Attendance", icon: ClipboardList, to: `${basePath}/attendance` },
    { label: "New Contract", icon: FileText, to: `${basePath}/contracts` },
    { label: "Holiday Calendar", icon: Calendar, to: `${basePath}/holidays` },
    { label: "Send Notice", icon: Megaphone, to: `${basePath}/notices` },
    { label: "Analytics", icon: BarChart3, to: `${basePath}/analytics` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">HR Dashboard</h2>
        <p className="text-sm text-muted-foreground">People operations at a glance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <Link key={k.label} to={k.to}>
            <Card className="hover:shadow-md transition cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-semibold mt-1">{k.value}</p>
                  </div>
                  <KpiIcon icon={k.icon} tone={k.tone} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm uppercase tracking-wide">Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {quickActions.map(a => (
              <Link key={a.label} to={a.to}>
                <Button variant="outline" className="w-full h-auto py-3 flex-col gap-2">
                  <a.icon className="h-5 w-5" />
                  <span className="text-xs">{a.label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Contracts Expiring Soon</CardTitle></CardHeader>
          <CardContent>
            {expiringList.length === 0 ? <p className="text-sm text-muted-foreground">None in the next 30 days.</p> :
              <ul className="space-y-2">
                {expiringList.map((c: any) => (
                  <li key={c.id} className="flex justify-between items-center text-sm">
                    <span className="font-mono text-xs">{c.user_id.slice(0, 8)}…</span>
                    <Badge variant="destructive">{new Date(c.end_date).toLocaleDateString()}</Badge>
                  </li>
                ))}
              </ul>
            }
            <Link to={`${basePath}/contracts`}><Button variant="link" size="sm" className="px-0 mt-2">View all →</Button></Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Onboarding</CardTitle></CardHeader>
          <CardContent>
            {recentHires.length === 0 ? <p className="text-sm text-muted-foreground">No recent activity.</p> :
              <ul className="space-y-2">
                {recentHires.map((o: any) => (
                  <li key={o.id} className="flex justify-between items-center text-sm">
                    <span className="font-mono text-xs">{o.employee_user_id.slice(0, 8)}…</span>
                    <Badge variant={o.status === "completed" ? "default" : "secondary"}>{o.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            }
            <Link to={`${basePath}/onboarding`}><Button variant="link" size="sm" className="px-0 mt-2">View all →</Button></Link>
          </CardContent>
        </Card>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Refreshing…</p>}
    </div>
  );
}

function KpiIcon({ icon: Icon, tone }: any) {
  const color = tone === "success" ? "text-emerald-600 bg-emerald-500/10" :
                tone === "warning" ? "text-amber-600 bg-amber-500/10" :
                tone === "destructive" ? "text-destructive bg-destructive/10" :
                tone === "info" ? "text-primary bg-primary/10" :
                "text-muted-foreground bg-muted";
  return <div className={`p-2 rounded-lg ${color}`}><Icon className="h-4 w-4" /></div>;
}
