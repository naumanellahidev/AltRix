import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanSquare, Plus, Star, Search, Filter } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useOfflineLeads, useOfflineCrmStages } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SortableLeadCard } from "@/pages/tenant/modules/components/SortableLeadCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeadActivityTimeline } from "@/pages/tenant/modules/components/LeadActivityTimeline";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Stage = { id: string; name: string; sort_order: number };
type Lead = { 
  id: string; 
  full_name: string; 
  score: number; 
  stage_id: string; 
  notes: string | null;
  email: string | null;
  phone: string | null;
  assigned_to: string | null;
  source: string | null;
  status: string;
};

export function CrmModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const perms = useSchoolPermissions(schoolId);

  // Offline data hooks
  const offlineLeads = useOfflineLeads(schoolId);
  const offlineStages = useOfflineCrmStages(schoolId);
  const isOffline = offlineLeads.isOffline;
  const isUsingCache = offlineLeads.isUsingCache || offlineStages.isUsingCache;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counselors, setCounselors] = useState<{ id: string; name: string }[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCounselor, setSelectedCounselor] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);

  // Create lead state
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadNotes, setNewLeadNotes] = useState("");

  // Edit Lead detail state
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const openLead = useMemo(() => leads.find((l) => l.id === openLeadId) ?? null, [leads, openLeadId]);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editScore, setEditScore] = useState(0);
  const [editSource, setEditSource] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editStatus, setEditStatus] = useState("open");
  const [editNotes, setEditNotes] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  // Pre-fill lead editor state when modal opens
  useEffect(() => {
    if (openLead) {
      setEditName(openLead.full_name);
      setEditEmail(openLead.email ?? "");
      setEditPhone(openLead.phone ?? "");
      setEditScore(openLead.score ?? 0);
      setEditSource(openLead.source ?? "");
      setEditAssignedTo(openLead.assigned_to ?? "unassigned");
      setEditStatus(openLead.status ?? "open");
      setEditNotes(openLead.notes ?? "");
    }
  }, [openLead]);

  const refresh = async () => {
    if (!schoolId) return;

    // Fetch users with 'counselor' role to filter directory
    const { data: counselorRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "counselor");

    const counselorUserIds = new Set((counselorRoles ?? []).map((r) => r.user_id));

    // Fetch counselor staff directory
    const { data: staffData } = await supabase
      .from("school_user_directory")
      .select("user_id, display_name, email")
      .eq("school_id", schoolId);
    
    const staffList = (staffData ?? [])
      .filter((s) => s.user_id && counselorUserIds.has(s.user_id))
      .map((s) => ({
        id: s.user_id || "",
        name: s.display_name || s.email || "Counselor",
      }))
      .filter((c) => c.id);
    setCounselors(staffList);

    // If offline, use cached data
    if (!navigator.onLine) {
      const cachedStages = offlineStages.data.map(s => ({
        id: s.id,
        name: s.name,
        sort_order: s.sortOrder,
      }));
      const cachedLeads = offlineLeads.data.map(l => ({
        id: l.id,
        full_name: l.fullName,
        score: l.score,
        stage_id: l.stageId,
        notes: l.notes ?? null,
        email: (l as any).email ?? null,
        phone: (l as any).phone ?? null,
        assigned_to: (l as any).assignedTo ?? null,
        source: (l as any).source ?? null,
        status: (l as any).status ?? "open",
      }));
      setStages(cachedStages);
      setLeads(cachedLeads as Lead[]);
      if (cachedStages.length > 0) {
        setPipelineId(offlineStages.data[0]?.pipelineId ?? null);
      }
      return;
    }

    // ensure defaults
    try {
      await supabase.rpc("ensure_default_crm_pipeline", { _school_id: schoolId });
    } catch (err) {
      console.warn("Failed to ensure default CRM pipeline:", err);
    }

    const { data: p } = await supabase
      .from("crm_pipelines")
      .select("id")
      .eq("school_id", schoolId)
      .eq("is_default", true)
      .maybeSingle();
    
    let pid = (p as any)?.id as string | undefined;
    
    if (!pid) {
      // Fallback: take any pipeline if default is missing
      const { data: firstP } = await supabase
        .from("crm_pipelines")
        .select("id")
        .eq("school_id", schoolId)
        .limit(1)
        .maybeSingle();
      pid = firstP?.id;
    }

    if (!pid) {
      // Client-side bootstrap fallback for authorized users
      try {
        const { data: newP } = await supabase
          .from("crm_pipelines")
          .insert({ school_id: schoolId, name: "Admissions", is_default: true })
          .select("id")
          .maybeSingle();
        
        if (newP?.id) {
          pid = newP.id;
          await supabase.from("crm_stages").insert([
            { school_id: schoolId, pipeline_id: pid, name: "New", sort_order: 10 },
            { school_id: schoolId, pipeline_id: pid, name: "Contacted", sort_order: 20 },
            { school_id: schoolId, pipeline_id: pid, name: "Tour Scheduled", sort_order: 30 },
            { school_id: schoolId, pipeline_id: pid, name: "Applied", sort_order: 40 },
            { school_id: schoolId, pipeline_id: pid, name: "Won", sort_order: 50 },
            { school_id: schoolId, pipeline_id: pid, name: "Lost", sort_order: 60 }
          ]);
        }
      } catch (err) {
        console.warn("Client-side fallback pipeline creation failed:", err);
      }
    }

    if (!pid) {
      setStages([]);
      setLeads([]);
      return;
    }
    setPipelineId(pid);

    const { data: s } = await supabase
      .from("crm_stages")
      .select("id,name,sort_order")
      .eq("school_id", schoolId)
      .eq("pipeline_id", pid)
      .order("sort_order", { ascending: true });
    setStages((s ?? []) as Stage[]);

    // Auto-heal any orphaned leads under this school (leads with null pipeline or stage)
    const firstStageId = s?.[0]?.id;
    if (firstStageId) {
      try {
        await supabase
          .from("crm_leads")
          .update({ pipeline_id: pid, stage_id: firstStageId })
          .eq("school_id", schoolId)
          .or("pipeline_id.is.null,stage_id.is.null");
      } catch (healErr) {
        console.warn("Failed to auto-heal orphaned leads:", healErr);
      }
    }

    const { data: l } = await supabase
      .from("crm_leads")
      .select("id,full_name,score,stage_id,notes,email,phone,assigned_to,source,status")
      .eq("school_id", schoolId)
      .eq("pipeline_id", pid)
      .order("updated_at", { ascending: false });
    setLeads((l ?? []) as Lead[]);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, offlineLeads.data, offlineStages.data]);

  const createLead = async (stageId: string) => {
    if (!schoolId || !pipelineId) return;
    if (!newLeadName.trim()) return toast.error("Lead name required");
    const { error } = await supabase.from("crm_leads").insert({
      school_id: schoolId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      full_name: newLeadName.trim(),
      notes: newLeadNotes.trim() || null,
      score: 0,
      status: "open",
    });
    if (error) return toast.error(error.message);
    setNewLeadName("");
    setNewLeadNotes("");
    toast.success("Lead created");
    await refresh();
  };

  const handleSaveLead = async () => {
    if (!openLead) return;
    setSavingLead(true);
    try {
      const { error } = await supabase
        .from("crm_leads")
        .update({
          full_name: editName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          score: Number(editScore),
          source: editSource.trim() || null,
          assigned_to: editAssignedTo === "unassigned" ? null : editAssignedTo,
          status: editStatus,
          notes: editNotes.trim() || null,
        })
        .eq("id", openLead.id);

      if (error) throw new Error(error.message);
      toast.success("Lead details updated successfully!");
      setOpenLeadId(null);
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update lead details");
    } finally {
      setSavingLead(false);
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Dropped on a stage column
    if (overId.startsWith("stage:")) {
      const stageId = overId.replace("stage:", "");
      const lead = leads.find((l) => l.id === activeId);
      if (!lead || lead.stage_id === stageId) return;

      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage_id: stageId } : l)));
      const { error } = await supabase.from("crm_leads").update({ stage_id: stageId }).eq("id", lead.id);
      if (error) {
        toast.error(error.message);
        await refresh();
      }
      return;
    }

    // Dropped on another lead card within same stage
    const fromIdx = leads.findIndex((l) => l.id === activeId);
    const toIdx = leads.findIndex((l) => l.id === overId);
    if (fromIdx !== -1 && toIdx !== -1) setLeads((prev) => arrayMove(prev, fromIdx, toIdx));
  };

  // Dynamic filter lists
  const uniqueSources = useMemo(() => {
    const set = new Set<string>();
    leads.forEach(l => { if (l.source) set.add(l.source); });
    return Array.from(set).sort();
  }, [leads]);

  const counselorMap = useMemo(() => {
    const m: Record<string, string> = {};
    counselors.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [counselors]);

  // Apply search/filters
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = l.full_name.toLowerCase().includes(q);
        const matchNotes = (l.notes ?? "").toLowerCase().includes(q);
        const matchEmail = (l.email ?? "").toLowerCase().includes(q);
        const matchPhone = (l.phone ?? "").toLowerCase().includes(q);
        if (!matchName && !matchNotes && !matchEmail && !matchPhone) return false;
      }
      // Counselor
      if (selectedCounselor !== "all") {
        if (selectedCounselor === "unassigned" && l.assigned_to !== null) return false;
        if (selectedCounselor !== "unassigned" && l.assigned_to !== selectedCounselor) return false;
      }
      // Source
      if (selectedSource !== "all" && l.source !== selectedSource) {
        return false;
      }
      // Status
      if (selectedStatus !== "all" && (l.status || "open") !== selectedStatus) {
        return false;
      }
      // Min Score
      if (l.score < minScore) {
        return false;
      }
      return true;
    });
  }, [leads, searchQuery, selectedCounselor, selectedSource, selectedStatus, minScore]);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    stages.forEach((s) => map.set(s.id, []));
    filteredLeads.forEach((l) => {
      map.set(l.stage_id, [...(map.get(l.stage_id) ?? []), l]);
    });
    return map;
  }, [filteredLeads, stages]);

  return (
    <div className="space-y-4">
      <OfflineDataBanner isOffline={isOffline} isUsingCache={isUsingCache} onRefresh={refresh} />
      {!perms.loading && !perms.canWorkCrm && (
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display text-xl">Admissions CRM</CardTitle>
            <p className="text-sm text-muted-foreground">Access restricted</p>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
              You don’t have CRM permissions in this school (counselor/marketing/staff manager).
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main CRM Creation form */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Admissions CRM</CardTitle>
          <p className="text-sm text-muted-foreground">Pipelines • Kanban • Lead scoring • Activity timeline</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input value={newLeadName} onChange={(e) => setNewLeadName(e.target.value)} placeholder="Lead name" />
            <Textarea value={newLeadNotes} onChange={(e) => setNewLeadNotes(e.target.value)} placeholder="Notes (optional)" rows={1} />
          </div>
        </CardContent>
      </Card>

      {/* Search & Filters Card */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Pipeline Search & Filters
            </CardTitle>
            <span className="text-xs font-semibold text-muted-foreground">{filteredLeads.length} of {leads.length} leads matching</span>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {/* Search Input */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Search Lead</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name, notes, email, phone..."
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>
            
            {/* Counselor Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Counselor / Assignee</label>
              <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Counselors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Counselors</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {counselors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Source Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Lead Source</label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {uniqueSources.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Enrollment Status Filter */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Enrollment Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open / Active</SelectItem>
                  <SelectItem value="won">Enrolled (Won)</SelectItem>
                  <SelectItem value="lost">Lost / Dropped</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Score Filter */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Min Score: {minScore}</label>
                {minScore > 0 && <button className="text-[10px] text-primary hover:underline" onClick={() => setMinScore(0)}>Reset</button>}
              </div>
              <div className="pt-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="w-full accent-primary h-1 bg-secondary rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DND Kanban Board */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stages.map((s) => {
            const stageLeads = byStage.get(s.id) ?? [];
            return (
              <div key={s.id} className="rounded-3xl bg-surface p-4 shadow-elevated border" id={`stage:${s.id}`}>
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <KanbanSquare className="h-4 w-4 text-muted-foreground" />
                    <p className="font-semibold text-sm">{s.name}</p>
                  </div>
                  <Button variant="soft" size="icon" className="h-7 w-7 rounded-lg" onClick={() => createLead(s.id)} aria-label="Add lead">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div>
                  <SortableContext items={stageLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 pb-2 min-h-[150px]" id={`stage:${s.id}`}>
                      {stageLeads.map((l) => (
                        <SortableLeadCard
                          key={l.id}
                          lead={l}
                          counselorName={l.assigned_to ? counselorMap[l.assigned_to] : undefined}
                          onOpen={() => setOpenLeadId(l.id)}
                          onBumpScore={async () => {
                            const next = Math.min(100, (l.score ?? 0) + 5);
                            setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, score: next } : x)));
                            const { error } = await supabase.from("crm_leads").update({ score: next }).eq("id", l.id);
                            if (error) {
                              toast.error(error.message);
                              await refresh();
                            }
                          }}
                        />
                      ))}
                      {stageLeads.length === 0 && (
                        <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-xs text-center text-muted-foreground">
                          Drag leads here
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                  <span>{stageLeads.length} leads</span>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Star className="h-3 w-3" /> score
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DndContext>

      {stages.length === 0 && (
        <div className="rounded-3xl border border-dashed border-muted-foreground/30 p-12 text-center max-w-lg mx-auto mt-6 space-y-3 bg-muted/10">
          <KanbanSquare className="h-10 w-10 text-muted-foreground mx-auto animate-pulse" />
          <h3 className="font-display text-sm font-semibold">No CRM Pipeline Stages Found</h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
            We couldn't load any pipelines or stages. If this is a new school, please make sure you've executed the database setup migrations or are logged in as an administrator to bootstrap the default CRM pipeline.
          </p>
        </div>
      )}

      {/* Split details & timeline Dialog */}
      <Dialog open={!!openLeadId} onOpenChange={(v) => !v && setOpenLeadId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="font-display flex items-center justify-between flex-wrap gap-2 pr-6">
              <span className="text-lg">{openLead?.full_name ?? "Lead details"}</span>
              {openLead && (
                <Badge variant="outline" className={
                  openLead.status === "won" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                  openLead.status === "lost" ? "bg-destructive/10 text-destructive border border-destructive/20" :
                  "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                }>
                  Status: {openLead.status || "open"}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-4">
            
            {/* Lead info edit panel (Left 5 cols) */}
            <div className="md:col-span-5 space-y-4 md:border-r md:pr-6">
              <div>
                <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Edit Lead Details</p>
                <div className="space-y-3">
                  
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Full Name *</label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Lead Name" className="text-xs h-8" />
                  </div>
                  
                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" placeholder="Email" className="text-xs h-8" />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Phone Number</label>
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone" className="text-xs h-8" />
                  </div>

                  {/* Source & Score */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Source</label>
                      <Input value={editSource} onChange={(e) => setEditSource(e.target.value)} placeholder="e.g. Website" className="text-xs h-8" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase">
                        <span>Score</span>
                        <span className="font-mono text-primary">{editScore}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={editScore}
                        onChange={(e) => setEditScore(Number(e.target.value))}
                        className="w-full accent-primary h-1 bg-secondary rounded-lg appearance-none cursor-pointer mt-3"
                      />
                    </div>
                  </div>

                  {/* Counselor & Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Counselor</label>
                      <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {counselors.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Status</label>
                      <Select value={editStatus} onValueChange={editStatus => setEditStatus(editStatus)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="won">Won / Enrolled</SelectItem>
                          <SelectItem value="lost">Lost / Dropped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Lead Notes</label>
                    <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="General context/notes..." rows={3} className="text-xs" />
                  </div>

                  {/* Save */}
                  <Button onClick={handleSaveLead} disabled={savingLead || !editName.trim()} variant="hero" className="w-full text-xs h-9 mt-2">
                    {savingLead ? "Saving Details..." : "Save Details"}
                  </Button>

                </div>
              </div>
            </div>
            
            {/* Activity Timeline (Right 7 cols) */}
            <div className="md:col-span-7 pr-2">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Outreach Timeline & Actions</p>
              {schoolId && openLeadId ? (
                <LeadActivityTimeline schoolId={schoolId} leadId={openLeadId} />
              ) : (
                <div className="text-sm text-muted-foreground">Loading timeline…</div>
              )}
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
