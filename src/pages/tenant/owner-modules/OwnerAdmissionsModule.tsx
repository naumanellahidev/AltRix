import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Filter,
  Phone,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
  PieChart,
  Pie,
} from "recharts";
import { format, subMonths, startOfMonth, startOfYear } from "date-fns";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props {
  schoolId: string | null;
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function periodCutoff(p: string): Date {
  const now = new Date();
  if (p === "3m") return subMonths(now, 3);
  if (p === "6m") return subMonths(now, 6);
  if (p === "ytd") return startOfYear(now);
  return subMonths(now, 12);
}

export function OwnerAdmissionsModule({ schoolId }: Props) {
  const [activeTab, setActiveTab] = useState("funnel");
  const [periodFilter, setPeriodFilter] = useState("12m");
  const activeCampusId = useActiveCampus(schoolId);

  // Fetch CRM data
  const { data: crmData, isLoading } = useQuery({
    queryKey: ["owner_admissions", schoolId, activeCampusId, periodFilter],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;
      const since = periodCutoff(periodFilter).toISOString();

      const baseLeads = supabase.from("crm_leads").select("*").eq("school_id", schoolId).gte("created_at", since);
      const leadsQuery = activeCampusId ? baseLeads.eq("campus_id", activeCampusId) : baseLeads;

      const [leadsRes, stagesRes, activitiesRes, campaignsRes, callsRes, dirRes] = await Promise.all([
        leadsQuery,
        supabase.from("crm_stages").select("*").eq("school_id", schoolId).order("sort_order"),
        supabase.from("crm_activities").select("*").eq("school_id", schoolId).gte("created_at", since),
        supabase.from("crm_campaigns").select("*").eq("school_id", schoolId),
        supabase.from("crm_call_logs").select("*").eq("school_id", schoolId).gte("created_at", since),
        supabase.rpc("get_school_user_directory", { _school_id: schoolId }),
      ]);

      const leads = leadsRes.data || [];
      const stages = stagesRes.data || [];
      const activities = activitiesRes.data || [];
      const campaigns = campaignsRes.data || [];
      const calls = callsRes.data || [];
      const directory: Array<{ user_id: string; display_name: string | null; email: string | null }> = (dirRes.data as any) || [];
      const nameOf = (uid: string) => {
        if (uid === "Unassigned" || uid === "Unknown") return uid;
        const u = directory.find((d) => d.user_id === uid);
        return u?.display_name || u?.email || `${uid.slice(0, 8)}…`;
      };

      // Calculate metrics
      const totalLeads = leads.length;
      const openLeads = leads.filter((l) => l.status === "open" || !l.status).length;
      const wonLeads = leads.filter((l) => l.status === "won").length;
      const lostLeads = leads.filter((l) => l.status === "lost").length;
      const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

      // Source breakdown
      const sourceBreakdown: Record<string, number> = {};
      leads.forEach((l) => {
        const source = l.source || "Unknown";
        sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
      });

      // Funnel data by stage
      const funnelData = stages.map((stage) => ({
        name: stage.name,
        value: leads.filter((l) => l.stage_id === stage.id).length,
        fill: COLORS[stages.indexOf(stage) % COLORS.length],
      }));

      // Monthly trend
      const monthlyTrend: { month: string; leads: number; conversions: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const start = startOfMonth(subMonths(new Date(), i));
        const end = startOfMonth(subMonths(new Date(), i - 1));
        const monthLeads = leads.filter(
          (l) => new Date(l.created_at) >= start && new Date(l.created_at) < end
        );
        monthlyTrend.push({
          month: format(start, "MMM"),
          leads: monthLeads.length,
          conversions: monthLeads.filter((l) => l.status === "won").length,
        });
      }

      // Counselor performance
      const counselorPerf: Record<string, { name: string; assigned: number; won: number; calls: number }> = {};
      leads.forEach((l) => {
        const assignee = l.assigned_to || "Unassigned";
        if (!counselorPerf[assignee]) counselorPerf[assignee] = { name: nameOf(assignee), assigned: 0, won: 0, calls: 0 };
        counselorPerf[assignee].assigned++;
        if (l.status === "won") counselorPerf[assignee].won++;
      });
      calls.forEach((c) => {
        const caller = c.created_by || "Unknown";
        if (!counselorPerf[caller]) counselorPerf[caller] = { name: nameOf(caller), assigned: 0, won: 0, calls: 0 };
        counselorPerf[caller].calls++;
      });

      return {
        totalLeads,
        openLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        sourceBreakdown,
        funnelData,
        monthlyTrend,
        counselorPerf,
        totalCalls: calls.length,
        totalActivities: activities.length,
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
        campaignBudget: campaigns.reduce((sum, c) => sum + Number(c.budget || 0), 0),
      };
    },
  });

  const sourceChartData = useMemo(() => {
    if (!crmData) return [];
    return Object.entries(crmData.sourceBreakdown)
      .map(([name, value], idx) => ({
        name,
        value,
        fill: COLORS[idx % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [crmData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Admissions & Growth</h1>
          <p className="text-muted-foreground">CRM analytics, lead funnel, and conversion tracking</p>
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Last 3 months</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="12m">Last 12 months</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.totalLeads || 0}</p>
            <p className="text-xs text-muted-foreground">Total Leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Target className="h-5 w-5 text-amber-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.openLeads || 0}</p>
            <p className="text-xs text-muted-foreground">Open Leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.wonLeads || 0}</p>
            <p className="text-xs text-muted-foreground">Conversions</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <Badge variant={crmData?.conversionRate && crmData.conversionRate >= 20 ? "default" : "destructive"} className="text-[10px]">
                Target: 20%
              </Badge>
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.conversionRate || 0}%</p>
            <p className="text-xs text-muted-foreground">Conversion Rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Phone className="h-5 w-5 text-purple-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.totalCalls || 0}</p>
            <p className="text-xs text-muted-foreground">Calls Made</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Zap className="h-5 w-5 text-orange-600" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{crmData?.activeCampaigns || 0}</p>
            <p className="text-xs text-muted-foreground">Active Campaigns</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="sources">Lead Sources</TabsTrigger>
          <TabsTrigger value="trend">Monthly Trend</TabsTrigger>
          <TabsTrigger value="counselors">Counselor Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="funnel" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admission Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2">
                {crmData?.funnelData && crmData.funnelData.length > 0 ? (
                  crmData.funnelData.map((stage, idx) => (
                    <div
                      key={stage.name}
                      className="flex items-center gap-4 w-full max-w-md"
                      style={{ opacity: 1 - idx * 0.1 }}
                    >
                      <div
                        className="flex items-center justify-center rounded-lg py-3 text-white font-medium transition-all"
                        style={{
                          backgroundColor: stage.fill,
                          width: `${100 - idx * 10}%`,
                        }}
                      >
                        {stage.name}
                      </div>
                      <span className="text-lg font-bold">{stage.value}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground py-8">No pipeline stages configured</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Source Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceChartData} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {sourceChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Lead & Conversion Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={crmData?.monthlyTrend || []}>
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="leads"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      name="New Leads"
                    />
                    <Line
                      type="monotone"
                      dataKey="conversions"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      name="Conversions"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="counselors" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Counselor Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {crmData?.counselorPerf && Object.keys(crmData.counselorPerf).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(crmData.counselorPerf)
                      .sort((a, b) => b[1].won - a[1].won)
                      .map(([userId, perf]) => (
                        <div key={userId} className="rounded-xl bg-muted/50 p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate">{perf.name}</span>
                            <Badge variant="outline">
                              {perf.assigned > 0 ? Math.round((perf.won / perf.assigned) * 100) : 0}% conv.
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Assigned:</span>{" "}
                              <span className="font-medium">{perf.assigned}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Won:</span>{" "}
                              <span className="font-medium text-emerald-600">{perf.won}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Calls:</span>{" "}
                              <span className="font-medium">{perf.calls}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No counselor data available</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
