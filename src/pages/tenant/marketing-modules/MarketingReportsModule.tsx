import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Target, 
  TrendingUp, 
  BarChart3, 
  Filter, 
  Calendar, 
  Award, 
  CheckCircle2, 
  Activity, 
  PhoneCall,
  ArrowRight,
  TrendingDown,
  Megaphone,
  Briefcase
} from "lucide-react";

type Lead = { 
  id: string; 
  status: string; 
  assigned_to: string | null; 
  created_at: string; 
  source: string | null; 
  stage_id: string | null; 
};

type ActivityRow = { 
  id: string; 
  completed_at: string | null; 
  created_by: string | null; 
  created_at: string; 
};

type Campaign = {
  id: string;
  name: string;
  budget: number;
  channel: string;
  status: string;
};

type LeadAttribution = {
  lead_id: string;
  campaign_id: string;
};

type Stage = {
  id: string;
  name: string;
  sort_order: number;
};

type CounselorInfo = {
  name: string;
  email?: string;
};

export function MarketingReportsModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  
  // Data States
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [attributions, setAttributions] = useState<LeadAttribution[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [counselorsMap, setCounselorsMap] = useState<Record<string, CounselorInfo>>({});
  
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<"7d" | "30d" | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!schoolSlug) return;
      const { data: school } = await supabase.from("schools").select("id").eq("slug", schoolSlug).maybeSingle();
      if (cancelled) return;
      setSchoolId(school?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolSlug]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [leadsRes, actsRes, campsRes, attribsRes, pipelineRes] = await Promise.all([
          supabase.from("crm_leads").select("id,status,assigned_to,created_at,source,stage_id").eq("school_id", schoolId),
          supabase.from("crm_activities").select("id,completed_at,created_by,created_at").eq("school_id", schoolId),
          supabase.from("crm_campaigns").select("id,name,budget,channel,status").eq("school_id", schoolId),
          supabase.from("crm_lead_attributions").select("lead_id,campaign_id").eq("school_id", schoolId),
          supabase.from("crm_pipelines").select("id").eq("school_id", schoolId).eq("is_default", true).maybeSingle(),
        ]);

        if (cancelled) return;

        const leadsData = (leadsRes.data ?? []) as Lead[];
        const activitiesData = (actsRes.data ?? []) as ActivityRow[];
        const campaignsData = (campsRes.data ?? []) as Campaign[];
        const attributionsData = (attribsRes.data ?? []) as LeadAttribution[];

        setLeads(leadsData);
        setActivities(activitiesData);
        setCampaigns(campaignsData);
        setAttributions(attributionsData);

        // Fetch Pipeline Stages
        const pipelineId = pipelineRes.data?.id;
        if (pipelineId) {
          const { data: stagesData } = await supabase
            .from("crm_stages")
            .select("id,name,sort_order")
            .eq("school_id", schoolId)
            .eq("pipeline_id", pipelineId)
            .order("sort_order", { ascending: true });
          if (!cancelled && stagesData) {
            setStages(stagesData as Stage[]);
          }
        }

        // Gather all unique counselor user IDs to resolve names
        const counselorIds = new Set<string>();
        leadsData.forEach((l) => { if (l.assigned_to) counselorIds.add(l.assigned_to); });
        activitiesData.forEach((a) => { if (a.created_by) counselorIds.add(a.created_by); });

        const uniqueIds = Array.from(counselorIds);
        if (uniqueIds.length > 0) {
          const [dirRes, profRes] = await Promise.all([
            supabase.from("school_user_directory").select("user_id,display_name,email").eq("school_id", schoolId).in("user_id", uniqueIds),
            supabase.from("profiles").select("id,display_name").in("id", uniqueIds),
          ]);

          if (cancelled) return;

          const names: Record<string, CounselorInfo> = {};
          dirRes.data?.forEach((d) => {
            if (d.user_id) {
              names[d.user_id] = {
                name: d.display_name || d.email || "Counselor",
                email: d.email || undefined,
              };
            }
          });
          profRes.data?.forEach((p) => {
            if (p.id && !names[p.id]) {
              names[p.id] = { name: p.display_name || "Counselor" };
            }
          });

          setCounselorsMap(names);
        }
      } catch (err) {
        console.error("Failed to load reports data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  // Date Filter Calculations
  const cutoffDate = useMemo(() => {
    if (dateFilter === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (dateFilter === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    }
    return null;
  }, [dateFilter]);

  const filteredLeads = useMemo(() => {
    if (!cutoffDate) return leads;
    return leads.filter((l) => new Date(l.created_at) >= cutoffDate);
  }, [leads, cutoffDate]);

  const filteredActivities = useMemo(() => {
    if (!cutoffDate) return activities;
    return activities.filter((a) => new Date(a.created_at) >= cutoffDate);
  }, [activities, cutoffDate]);

  // Core metrics
  const metrics = useMemo(() => {
    const total = filteredLeads.length;
    const won = filteredLeads.filter((l) => l.status === "won").length;
    const lost = filteredLeads.filter((l) => l.status === "lost").length;
    const open = filteredLeads.filter((l) => l.status === "open" || !l.status).length;
    const conversion = total ? Math.round((won / total) * 100) : 0;
    
    const completedActs = filteredActivities.filter((a) => a.completed_at).length;
    const pendingActs = filteredActivities.filter((a) => !a.completed_at).length;

    return { total, won, lost, open, conversion, completedActs, pendingActs };
  }, [filteredLeads, filteredActivities]);

  // Lead Funnel Stage Counts
  const funnelStages = useMemo(() => {
    const counts: Record<string, number> = {};
    stages.forEach((s) => { counts[s.id] = 0; });
    
    filteredLeads.forEach((l) => {
      if (l.stage_id && l.stage_id in counts) {
        counts[l.stage_id] += 1;
      }
    });

    return stages.map((s) => ({
      id: s.id,
      name: s.name,
      count: counts[s.id] || 0,
    }));
  }, [stages, filteredLeads]);

  // Sources Performance
  const sourcesPerf = useMemo(() => {
    const map = new Map<string, { source: string; total: number; won: number; lost: number }>();
    for (const l of filteredLeads) {
      const key = (l.source ?? "unknown").trim() || "unknown";
      const cur = map.get(key) ?? { source: key, total: 0, won: 0, lost: 0 };
      cur.total += 1;
      if (l.status === "won") cur.won += 1;
      if (l.status === "lost") cur.lost += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [filteredLeads]);

  // Campaign CPL / Performance
  const campaignPerf = useMemo(() => {
    const leadCountByCamp: Record<string, number> = {};
    attributions.forEach((a) => {
      leadCountByCamp[a.campaign_id] = (leadCountByCamp[a.campaign_id] || 0) + 1;
    });

    // filter leads by date filter for attributions
    const leadIdsInFilter = new Set(filteredLeads.map((l) => l.id));
    const filteredAttributions = attributions.filter((a) => leadIdsInFilter.has(a.lead_id));
    
    const filteredLeadCountByCamp: Record<string, number> = {};
    filteredAttributions.forEach((a) => {
      filteredLeadCountByCamp[a.campaign_id] = (filteredLeadCountByCamp[a.campaign_id] || 0) + 1;
    });

    return campaigns.map((c) => {
      const leadsCount = filteredLeadCountByCamp[c.id] || 0;
      const cpl = leadsCount > 0 ? Math.round(c.budget / leadsCount) : 0;
      return {
        ...c,
        leadsCount,
        cpl,
      };
    }).sort((a, b) => b.leadsCount - a.leadsCount).slice(0, 5);
  }, [campaigns, attributions, filteredLeads]);

  // Counselor Leaderboard
  const counselorPerf = useMemo(() => {
    const byCounselor = new Map<string, { id: string; name: string; email?: string; leads: number; won: number; lost: number; activitiesCompleted: number }>();
    
    for (const l of filteredLeads) {
      if (!l.assigned_to) continue;
      const key = l.assigned_to;
      const curInfo = counselorsMap[key] ?? { name: key.slice(0, 8) };
      const cur = byCounselor.get(key) ?? { 
        id: key, 
        name: curInfo.name, 
        email: curInfo.email, 
        leads: 0, 
        won: 0, 
        lost: 0, 
        activitiesCompleted: 0 
      };
      cur.leads += 1;
      if (l.status === "won") cur.won += 1;
      if (l.status === "lost") cur.lost += 1;
      byCounselor.set(key, cur);
    }
    
    for (const a of filteredActivities) {
      if (!a.created_by || !a.completed_at) continue;
      const key = a.created_by;
      const curInfo = counselorsMap[key] ?? { name: key.slice(0, 8) };
      const cur = byCounselor.get(key) ?? { 
        id: key, 
        name: curInfo.name, 
        email: curInfo.email, 
        leads: 0, 
        won: 0, 
        lost: 0, 
        activitiesCompleted: 0 
      };
      cur.activitiesCompleted += 1;
      byCounselor.set(key, cur);
    }

    return [...byCounselor.values()]
      .map((c) => ({
        ...c,
        convRate: c.leads > 0 ? Math.round((c.won / c.leads) * 100) : 0,
      }))
      .sort((a, b) => b.won - a.won || b.convRate - a.convRate);
  }, [filteredLeads, filteredActivities, counselorsMap]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">Generating Performance Report...</p>
        </div>
      </div>
    );
  }

  // Calculate highest lead count for width percentages
  const maxSourceLeads = Math.max(1, ...sourcesPerf.map((s) => s.total));
  const maxFunnelLeads = Math.max(1, ...funnelStages.map((f) => f.count));

  return (
    <div className="space-y-6">
      
      {/* Date Filters Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-muted/30 p-4 rounded-3xl border">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Admissions Performance Report</h2>
          <p className="text-xs text-muted-foreground">Comprehensive tracking of pipeline funnel, channels, and counselor performance.</p>
        </div>
        
        <div className="flex items-center gap-1.5 bg-muted p-1 rounded-xl w-fit">
          <Button
            variant={dateFilter === "7d" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => setDateFilter("7d")}
          >
            Last 7 Days
          </Button>
          <Button
            variant={dateFilter === "30d" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => setDateFilter("30d")}
          >
            Last 30 Days
          </Button>
          <Button
            variant={dateFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-lg text-xs"
            onClick={() => setDateFilter("all")}
          >
            All Time
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Total Inquiries */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Total Inquiries</span>
              <p className="text-2xl font-bold font-display tracking-tight">{metrics.total}</p>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> {metrics.open} actively open
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Won Leads */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Enrolled (Won)</span>
              <p className="text-2xl font-bold font-display tracking-tight text-emerald-600">{metrics.won}</p>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {metrics.lost} closed/dropped
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <Award className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Conversion Rate</span>
              <p className="text-2xl font-bold font-display tracking-tight">{metrics.conversion}%</p>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-500" /> Average registration rate
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Outreach Completed */}
        <Card className="shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Outreach Actions</span>
              <p className="text-2xl font-bold font-display tracking-tight">{metrics.completedActs}</p>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Activity className="h-3 w-3 text-amber-500" /> {metrics.pendingActs} follow-ups pending
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <PhoneCall className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Main Analytical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Stage Funnel */}
        <Card className="lg:col-span-6 shadow-sm">
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> CRM Pipeline Stage Distribution
            </CardTitle>
            <CardDescription className="text-xs">Visual breakdown of where inquiries are currently held in the admissions pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            
            <div className="space-y-3">
              {funnelStages.map((stage) => {
                const percentage = maxFunnelLeads > 0 ? Math.round((stage.count / maxFunnelLeads) * 100) : 0;
                
                return (
                  <div key={stage.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>{stage.name}</span>
                      <span className="text-muted-foreground font-semibold">{stage.count} leads</span>
                    </div>
                    
                    <div className="relative flex items-center">
                      <div className="h-6 w-full bg-secondary rounded-lg overflow-hidden flex">
                        <div 
                          className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-lg transition-all duration-500 flex items-center px-2 text-[10px] text-primary-foreground font-semibold font-mono"
                          style={{ width: `${percentage}%`, minWidth: stage.count > 0 ? "8%" : "0%" }}
                        >
                          {percentage > 12 && `${percentage}%`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {funnelStages.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No pipeline stages detected. Please configure stages in Intake Config.
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Active Funnel Progression
              </span>
              <span>Total filtered: {metrics.total} leads</span>
            </div>

          </CardContent>
        </Card>

        {/* Right Column - Top Lead Sources & Campaign Yields */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Top Sources */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Target className="h-4 w-4 text-sky-500" /> Channel Performance (Top Sources)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {sourcesPerf.map((s) => {
                const percentage = Math.round((s.total / maxSourceLeads) * 100);
                const rate = s.total > 0 ? Math.round((s.won / s.total) * 100) : 0;
                
                return (
                  <div key={s.source} className="flex items-center justify-between text-xs gap-3">
                    <div className="w-1/4 truncate font-semibold uppercase text-muted-foreground">{s.source}</div>
                    
                    {/* distribution bar */}
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{s.total}</span>
                    </div>

                    <Badge variant="outline" className={`text-[10px] font-mono font-semibold w-14 text-center ${
                      rate > 35 ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : rate > 15 ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-secondary text-secondary-foreground border-transparent"
                    }`}>
                      {rate}% won
                    </Badge>
                  </div>
                );
              })}

              {sourcesPerf.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">No source channels captured.</div>
              )}
            </CardContent>
          </Card>

          {/* Campaign Yields */}
          <Card className="shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Megaphone className="h-4 w-4 text-emerald-500" /> Campaign Yield & ROI Tracker
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Campaign</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Budget</TableHead>
                    <TableHead className="text-xs font-semibold text-center">Leads</TableHead>
                    <TableHead className="text-xs font-semibold text-right">CPL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignPerf.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium truncate max-w-[120px]">{c.name}</TableCell>
                      <TableCell className="text-xs text-center font-mono text-muted-foreground">${c.budget}</TableCell>
                      <TableCell className="text-xs text-center font-semibold">{c.leadsCount}</TableCell>
                      <TableCell className="text-xs text-right font-semibold font-mono text-emerald-600">${c.cpl}</TableCell>
                    </TableRow>
                  ))}
                  {campaignPerf.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-center py-6 text-muted-foreground">No marketing campaigns attributed.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

        </div>

      </div>

      {/* Counselor Performance Leaderboard */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Briefcase className="h-4 w-4 text-amber-500" /> Counselor Performance Leaderboard
          </CardTitle>
          <CardDescription className="text-xs">Metrics assessing lead assignment volumes, successful conversion rates, and total outreach actions completed.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Counselor</TableHead>
                <TableHead className="text-center">Assigned Leads</TableHead>
                <TableHead className="text-center">Enrolled (Won)</TableHead>
                <TableHead className="text-center">Completed Follow-ups</TableHead>
                <TableHead className="w-1/4">Conversion Performance</TableHead>
                <TableHead className="text-right">Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counselorPerf.map((c, index) => {
                const rankIcon = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                return (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    
                    {/* Name */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground font-mono w-5">{rankIcon}</span>
                        <div>
                          <p className="font-semibold text-xs text-foreground">{c.name}</p>
                          {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                        </div>
                      </div>
                    </TableCell>

                    {/* Assigned */}
                    <TableCell className="text-center font-semibold text-xs align-middle">
                      {c.leads}
                    </TableCell>

                    {/* Won */}
                    <TableCell className="text-center font-semibold text-xs text-emerald-600 align-middle">
                      {c.won}
                    </TableCell>

                    {/* Activities */}
                    <TableCell className="text-center text-xs text-muted-foreground align-middle">
                      {c.activitiesCompleted}
                    </TableCell>

                    {/* Performance Progress */}
                    <TableCell className="align-middle">
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            c.convRate > 40 ? "bg-emerald-500" : c.convRate > 20 ? "bg-amber-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${c.convRate}%` }} 
                        />
                      </div>
                    </TableCell>

                    {/* Rate Badge */}
                    <TableCell className="text-right align-middle font-mono font-semibold">
                      <Badge variant="outline" className={`text-xs border ${
                        c.convRate > 40 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : c.convRate > 20 ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-sky-500/10 text-sky-500 border-sky-500/20"
                      }`}>
                        {c.convRate}%
                      </Badge>
                    </TableCell>

                  </TableRow>
                );
              })}

              {counselorPerf.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-center py-8 text-muted-foreground">
                    No counselors have been assigned leads or completed follow-up activities yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
