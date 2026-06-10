import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Megaphone, Wallet, Award, Coins, TrendingUp, Plus, UserCheck } from "lucide-react";

type Campaign = { id: string; name: string; channel: string; status: string; budget: number };
type Lead = { id: string; full_name: string };
type Attribution = { lead_id: string; campaign_id: string };

export function MarketingCampaignsModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [attribs, setAttribs] = useState<Attribution[]>([]);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState("other");
  const [budget, setBudget] = useState("0");
  const [status, setStatus] = useState("active");

  const [leadId, setLeadId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);

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

  const refresh = async () => {
    if (!schoolId) return;
    const [{ data: c }, { data: l }, { data: a }] = await Promise.all([
      supabase.from("crm_campaigns").select("id,name,channel,status,budget").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("crm_leads").select("id,full_name").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("crm_lead_attributions").select("lead_id,campaign_id").eq("school_id", schoolId),
    ]);
    setCampaigns((c ?? []) as Campaign[]);
    setLeads((l ?? []) as Lead[]);
    setAttribs((a ?? []) as Attribution[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const createCampaign = async () => {
    if (!schoolId) return;
    if (!name.trim()) return toast.error("Campaign name required");
    
    setBusy(true);
    try {
      await supabase.from("crm_campaigns").insert({
        school_id: schoolId,
        name: name.trim(),
        channel,
        budget: Number(budget || 0),
        status,
      });
      setName("");
      setBudget("0");
      toast.success("Campaign created!");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const attribute = async () => {
    if (!schoolId || !leadId || !campaignId) return;
    setBusy(true);
    try {
      await supabase.from("crm_lead_attributions").upsert({
        school_id: schoolId,
        lead_id: leadId,
        campaign_id: campaignId,
      }, { onConflict: "lead_id,campaign_id" });
      setLeadId("");
      toast.success("Lead successfully attributed to campaign!");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const attributedLeadIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of attribs) {
      m.set(a.campaign_id, [...(m.get(a.campaign_id) ?? []), a.lead_id]);
    }
    return m;
  }, [attribs]);

  // Campaign Analytics Calculations
  const stats = useMemo(() => {
    const totalBudget = campaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
    const totalAttributed = attribs.length;
    const avgCpl = totalAttributed > 0 ? Math.round(totalBudget / totalAttributed) : 0;
    
    // Channel distribution
    const distMap: Record<string, number> = { facebook: 0, google: 0, whatsapp: 0, referral: 0, other: 0 };
    campaigns.forEach(c => {
      const channelKey = c.channel ? c.channel.toLowerCase() : "other";
      if (channelKey in distMap) {
        distMap[channelKey] = (distMap[channelKey] || 0) + 1;
      } else {
        distMap["other"] = (distMap["other"] || 0) + 1;
      }
    });

    return {
      totalBudget,
      totalAttributed,
      avgCpl,
      channels: distMap
    };
  }, [campaigns, attribs]);

  return (
    <div className="space-y-6">
      
      {/* Visual Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Total Budget Spent */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Total Marketing Budget</p>
              <p className="text-xl font-bold font-display">${stats.totalBudget.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Attributed leads */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Attributed Inquiries</p>
              <p className="text-xl font-bold font-display">{stats.totalAttributed} leads</p>
            </div>
          </CardContent>
        </Card>

        {/* Avg CPL */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Avg Cost Per Lead (CPL)</p>
              <p className="text-xl font-bold font-display">${stats.avgCpl}</p>
            </div>
          </CardContent>
        </Card>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Create Campaign form */}
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader className="p-4 pb-2 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Megaphone className="h-4 w-4 text-primary" /> Create Campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Campaign Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Camp Ads" className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Channel</label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue placeholder="Channel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="facebook">Facebook Ads</SelectItem>
                  <SelectItem value="google">Google Search</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp Outreach</SelectItem>
                  <SelectItem value="referral">Word of Mouth / Referral</SelectItem>
                  <SelectItem value="other">Other / Billboards</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Budget ($)</label>
              <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget" className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="hero" className="w-full text-xs gap-1.5 h-9" disabled={busy} onClick={createCampaign}>
              <Plus className="h-4 w-4" /> Create Campaign
            </Button>
          </CardContent>
        </Card>

        {/* Lead Attribution Card */}
        <Card className="lg:col-span-8 shadow-sm">
          <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-sky-500" /> Lead Attribution Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-semibold">Select Campaign</label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select campaign" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-semibold">Select Registrant Lead</label>
                <Select value={leadId} onValueChange={setLeadId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select lead" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="soft" className="w-full text-xs h-9" disabled={busy || !leadId || !campaignId} onClick={attribute}>
                  Attribute Lead
                </Button>
              </div>
            </div>

            {/* Campaigns table */}
            <div className="pt-2 border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Campaign Name</TableHead>
                    <TableHead className="text-xs font-semibold">Channel</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Budget</TableHead>
                    <TableHead className="text-xs font-semibold">Leads Attributed</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Cost Per Lead (CPL)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const leadsCount = (attributedLeadIds.get(c.id) ?? []).length;
                    const cpl = leadsCount > 0 ? Math.round(c.budget / leadsCount) : 0;
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-xs">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs uppercase font-semibold">{c.channel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[9px] py-0.5 px-2 uppercase font-semibold border ${
                            c.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : c.status === "paused" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-secondary text-secondary-foreground border-transparent"
                          }`}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-mono">${c.budget}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{leadsCount} leads</TableCell>
                        <TableCell className="text-xs font-mono text-right font-semibold">${cpl}</TableCell>
                      </TableRow>
                    );
                  })}
                  {campaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-center py-6 text-muted-foreground">No campaigns registered yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}
