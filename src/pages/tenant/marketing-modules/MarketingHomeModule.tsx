import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineLeads, useOfflineCrmStages, useOfflineCampaigns, useOfflineCrmActivities } from "@/hooks/useOfflineData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Target,
  PhoneCall,
  TrendingUp,
  Calendar,
  WifiOff,
  RefreshCw,
  ArrowRight,
  Plus,
  Layers,
  Send,
  Link,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function MarketingHomeModule() {
  const { schoolSlug } = useParams();
  const navigate = useNavigate();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => tenant.status === "ready" ? tenant.schoolId : null, [tenant.status, tenant.schoolId]);

  const basePath = `/${schoolSlug}/marketing`;

  // Offline data hooks
  const { data: leads, loading: leadsLoading, isOffline, isUsingCache: leadsFromCache, refresh: refreshLeads } = useOfflineLeads(schoolId);
  const { data: stages, isUsingCache: stagesFromCache } = useOfflineCrmStages(schoolId);
  const { data: campaigns, isUsingCache: campaignsFromCache } = useOfflineCampaigns(schoolId);
  const { data: activities, isUsingCache: activitiesFromCache, refresh: refreshActivities } = useOfflineCrmActivities(schoolId);

  // New Lead state
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [openAddDialog, setOpenAddDialog] = useState(false);

  // Safe arrays to prevent undefined array crashes
  const safeLeads = useMemo(() => Array.isArray(leads) ? leads : [], [leads]);
  const safeCampaigns = useMemo(() => Array.isArray(campaigns) ? campaigns : [], [campaigns]);
  const safeActivities = useMemo(() => Array.isArray(activities) ? activities : [], [activities]);

  const formatSafeDate = (dateStr: string | null | undefined, formatStr = "MMM d, yyyy") => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "—";
      return format(d, formatStr);
    } catch {
      return "—";
    }
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalLeads = safeLeads.length;
    const openLeads = safeLeads.filter(l => l.status === "open" || !l.status).length;
    const wonLeads = safeLeads.filter(l => l.status === "won").length;
    const lostLeads = safeLeads.filter(l => l.status === "lost").length;
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;
    
    const activeCampaigns = safeCampaigns.filter(c => c.status === "active").length;
    const openActivities = safeActivities.filter(a => !a.completedAt).length;
    
    const today = new Date().toISOString().split('T')[0];
    const needsFollowUp = safeLeads.filter(l => l.nextFollowUpAt && l.nextFollowUpAt <= today).length;
    
    // Funnel Steps
    const contactedLeads = safeLeads.filter(l => l.score > 15 || l.status === "won" || l.nextFollowUpAt).length;
    const qualifiedLeads = safeLeads.filter(l => l.score > 40 || l.status === "won").length;

    return {
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      conversionRate,
      activeCampaigns,
      openActivities,
      needsFollowUp,
      funnel: {
        inquiry: totalLeads,
        contacted: contactedLeads,
        qualified: qualifiedLeads,
        won: wonLeads
      }
    };
  }, [safeLeads, safeCampaigns, safeActivities]);

  // Recent leads
  const recentLeads = useMemo(() => {
    return [...safeLeads]
      .sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0))
      .slice(0, 5);
  }, [safeLeads]);

  // Upcoming follow-ups
  const upcomingFollowUps = useMemo(() => {
    return safeLeads
      .filter(l => l.nextFollowUpAt)
      .sort((a, b) => new Date(a.nextFollowUpAt!).getTime() - new Date(b.nextFollowUpAt!).getTime())
      .slice(0, 5);
  }, [safeLeads]);

  const handleRefresh = () => {
    if (!isOffline) {
      refreshLeads();
      refreshActivities();
    }
  };

  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!newLeadName.trim()) return toast.error("Lead name is required");

    setBusy(true);
    try {
      let resolvedPipelineId: string | null = null;
      let resolvedStageId: string | null = null;

      // 1) Find the default pipeline, or fallback to first pipeline
      const { data: defaultPipeline } = await supabase
        .from("crm_pipelines")
        .select("id")
        .eq("school_id", schoolId)
        .eq("is_default", true)
        .maybeSingle();

      resolvedPipelineId = defaultPipeline?.id || null;

      if (!resolvedPipelineId) {
        const { data: firstPipeline } = await supabase
          .from("crm_pipelines")
          .select("id")
          .eq("school_id", schoolId)
          .limit(1)
          .maybeSingle();
        resolvedPipelineId = firstPipeline?.id || null;
      }

      // 2) Find the first stage under the resolved pipeline
      if (resolvedPipelineId) {
        const { data: stageData } = await supabase
          .from("crm_stages")
          .select("id")
          .eq("school_id", schoolId)
          .eq("pipeline_id", resolvedPipelineId)
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        resolvedStageId = stageData?.id || null;
      }

      // 3) Final fallback: if stages are empty, try to get any stage
      if (!resolvedStageId) {
        const { data: anyStage } = await supabase
          .from("crm_stages")
          .select("id, pipeline_id")
          .eq("school_id", schoolId)
          .limit(1)
          .maybeSingle();
        if (anyStage) {
          resolvedStageId = anyStage.id;
          resolvedPipelineId = anyStage.pipeline_id;
        }
      }

      if (!resolvedPipelineId || !resolvedStageId) {
        throw new Error("Admissions pipeline stages not configured. Please configure at least one CRM pipeline and stage first.");
      }

      const { error } = await supabase.from("crm_leads").insert({
        school_id: schoolId,
        pipeline_id: resolvedPipelineId,
        stage_id: resolvedStageId,
        full_name: newLeadName.trim(),
        email: newLeadEmail.trim() || null,
        phone: newLeadPhone.trim() || null,
        notes: newLeadNotes.trim() || null,
        source: "Manual Entry",
        score: 20
      });

      if (error) throw new Error(error.message);

      toast.success("Lead created successfully!");
      setNewLeadName("");
      setNewLeadEmail("");
      setNewLeadPhone("");
      setNewLeadNotes("");
      setOpenAddDialog(false);
      refreshLeads();
    } catch (err: any) {
      toast.error(err.message || "Failed to create lead");
    } finally {
      setBusy(false);
    }
  };

  const loading = leadsLoading;
  const isUsingCache = leadsFromCache || stagesFromCache || campaignsFromCache || activitiesFromCache;

  if (loading && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={handleRefresh} />
      
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Marketing Dashboard</h1>
          <p className="text-muted-foreground text-sm">Real-time pipeline tracking and counselor activities</p>
        </div>
        <div className="flex items-center gap-2">
          
          {/* Add Lead Dialog */}
          <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
            <DialogTrigger asChild>
              <Button variant="hero" className="gap-1.5 text-xs h-9">
                <Plus className="h-4 w-4" /> Quick Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Create Admissions Lead</DialogTitle>
                <CardDescription>Manually enter lead contact details for pipeline tracking.</CardDescription>
              </DialogHeader>
              <form onSubmit={handleAddLeadSubmit} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Lead Full Name *</label>
                  <Input required value={newLeadName} onChange={e => setNewLeadName(e.target.value)} placeholder="e.g. Sarah Connor" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Email Address</label>
                    <Input type="email" value={newLeadEmail} onChange={e => setNewLeadEmail(e.target.value)} placeholder="name@domain.com" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Phone Number</label>
                    <Input type="tel" value={newLeadPhone} onChange={e => setNewLeadPhone(e.target.value)} placeholder="+1..." />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Initial Notes</label>
                  <Textarea value={newLeadNotes} onChange={e => setNewLeadNotes(e.target.value)} placeholder="Add any background info or context..." rows={3} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpenAddDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy} variant="hero">
                    {busy ? "Saving..." : "Save Lead"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {!isOffline && (
            <Button variant="outline" size="sm" className="h-9 px-3" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Premium KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        
        {/* Total Leads */}
        <Card className="cursor-pointer hover:shadow-md transition-all h-full" onClick={() => navigate(`${basePath}/leads`)}>
          <CardContent className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{metrics.openLeads} active</Badge>
            </div>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">{metrics.totalLeads}</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Total Admissions Leads</p>
          </CardContent>
        </Card>

        {/* Pending Follow ups */}
        <Card className="cursor-pointer hover:shadow-md transition-all h-full" onClick={() => navigate(`${basePath}/follow-ups`)}>
          <CardContent className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500">
                <PhoneCall className="h-5 w-5" />
              </div>
              <Badge variant={metrics.needsFollowUp > 0 ? "destructive" : "secondary"} className="text-[10px]">
                {metrics.needsFollowUp} pending
              </Badge>
            </div>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">{metrics.openActivities}</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Scheduled Activities</p>
          </CardContent>
        </Card>

        {/* Active Campaigns */}
        <Card className="cursor-pointer hover:shadow-md transition-all h-full" onClick={() => navigate(`${basePath}/campaigns`)}>
          <CardContent className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500">
                <Target className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[10px]">active</Badge>
            </div>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">{metrics.activeCampaigns}</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Marketing Campaigns</p>
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card className="hover:shadow-md transition-all h-full">
          <CardContent className="p-5 relative">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                <TrendingUp className="h-5 w-5" />
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">closed won</Badge>
            </div>
            <p className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground">{metrics.conversionRate}%</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">Inquiry-to-Enrollment</p>
          </CardContent>
        </Card>

      </div>

      {/* Visual Funnel and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Conversion Funnel */}
        <Card className="lg:col-span-8 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              Admissions Funnel Breakdown
            </CardTitle>
            <CardDescription className="text-xs">Visual pipeline breakdown of all registered parent inquiries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {/* Funnel bars */}
            <div className="space-y-3 font-sans">
              
              {/* Step 1: Inquiries */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">1. Total Inquiries</span>
                  <span>{metrics.funnel.inquiry} leads (100%)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Step 2: Contacted */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">2. Nurtured / Contacted</span>
                  <span>
                    {metrics.funnel.contacted} leads ({metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.contacted / metrics.funnel.inquiry) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-sky-500 rounded-full"
                    style={{ width: `${metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.contacted / metrics.funnel.inquiry) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Step 3: Qualified */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">3. Qualified / Interviewed</span>
                  <span>
                    {metrics.funnel.qualified} leads ({metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.qualified / metrics.funnel.inquiry) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.qualified / metrics.funnel.inquiry) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Step 4: Won */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">4. Final Enrolled (Won)</span>
                  <span>
                    {metrics.funnel.won} leads ({metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.won / metrics.funnel.inquiry) * 100) : 0}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${metrics.funnel.inquiry > 0 ? Math.round((metrics.funnel.won / metrics.funnel.inquiry) * 100) : 0}%` }}
                  />
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Quick Actions Panel */}
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription className="text-xs">Fast-track common tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 pt-2">
            <Button
              variant="outline"
              className="justify-between text-left text-xs h-10 px-3 w-full hover:border-primary/20"
              onClick={() => navigate(`${basePath}/leads`)}
            >
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Open Kanban Pipeline
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              className="justify-between text-left text-xs h-10 px-3 w-full hover:border-primary/20"
              onClick={() => navigate(`${basePath}/intake`)}
            >
              <span className="flex items-center gap-2">
                <Link className="h-4 w-4 text-primary" /> Public Intake Link
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              className="justify-between text-left text-xs h-10 px-3 w-full hover:border-primary/20"
              onClick={() => navigate(`${basePath}/templates`)}
            >
              <span className="flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-500" /> Outreach Templates
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="outline"
              className="justify-between text-left text-xs h-10 px-3 w-full hover:border-primary/20"
              onClick={() => window.open(`/${schoolSlug}/inquiry`, '_blank')}
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground" /> Preview Inquiry Form
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Two Column Layout (Recent Leads & Upcoming follow ups) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Leads */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Recent Registrants</CardTitle>
              <CardDescription className="text-xs">Latest submissions requiring review</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-8 text-primary hover:text-primary/80" onClick={() => navigate(`${basePath}/leads`)}>
              View All <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {recentLeads.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-xs font-sans">
                {isOffline ? (
                  <span className="flex items-center justify-center gap-2">
                    <WifiOff className="h-4 w-4" /> No cached leads
                  </span>
                ) : (
                  "No leads found"
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {recentLeads.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-3 hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{lead.fullName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{lead.email || lead.phone || "No contact info"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-muted text-muted-foreground">
                        Score: {lead.score}
                      </Badge>
                      <Badge variant={lead.status === "won" ? "default" : lead.status === "lost" ? "destructive" : "secondary"} className="text-[10px] uppercase font-semibold">
                        {lead.status || "open"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Follow-ups */}
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Upcoming Actions & Follow-ups</CardTitle>
              <CardDescription className="text-xs">Scheduled callbacks and meetings</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-8 text-primary hover:text-primary/80" onClick={() => navigate(`${basePath}/follow-ups`)}>
              View All <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-2">
            {upcomingFollowUps.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-xs font-sans">No follow-ups scheduled</p>
            ) : (
              <div className="space-y-2">
                {upcomingFollowUps.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-3 hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-semibold text-sm text-foreground">{lead.fullName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-sans">
                        <Calendar className="h-3 w-3 text-primary" />
                        {formatSafeDate(lead.nextFollowUpAt)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] py-0.5 px-2 bg-muted text-muted-foreground">
                      Score: {lead.score}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
