import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, Check, Clock, Mail, Phone, Plus, Search, HelpCircle, RefreshCw, MessageSquare } from "lucide-react";

type Activity = {
  id: string;
  lead_id: string;
  activity_type: string;
  summary: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  crm_leads: {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export function MarketingFollowUpsModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [rows, setRows] = useState<Activity[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  
  // Filter and search state
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("pending");
  const [busy, setBusy] = useState(false);

  // New Follow-up state
  const [openScheduleDialog, setOpenScheduleDialog] = useState(false);
  const [newLeadId, setNewLeadId] = useState("");
  const [newType, setNewType] = useState("call");
  const [newSummary, setNewSummary] = useState("");
  const [newDueAt, setNewDueAt] = useState("");

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
    
    // Fetch activities joined with lead details
    const { data: actsData } = await supabase
      .from("crm_activities")
      .select(`
        id,
        lead_id,
        activity_type,
        summary,
        due_at,
        completed_at,
        created_at,
        crm_leads (
          full_name,
          email,
          phone
        )
      `)
      .eq("school_id", schoolId)
      .order("due_at", { ascending: true });

    // Fetch leads for scheduling dropdown
    const { data: leadsData } = await supabase
      .from("crm_leads")
      .select("id, full_name, email, phone")
      .eq("school_id", schoolId)
      .order("full_name", { ascending: true });

    const normalizedActs = (actsData ?? []).map((r: any) => {
      const lead = Array.isArray(r.crm_leads) ? r.crm_leads[0] : r.crm_leads;
      return {
        ...r,
        crm_leads: lead || null
      };
    });

    setRows(normalizedActs as any[]);
    setLeads((leadsData ?? []) as Lead[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const filtered = useMemo(() => {
    let list = rows;
    
    // Status Filter
    if (statusFilter === "pending") {
      list = list.filter((r) => !r.completed_at);
    } else if (statusFilter === "completed") {
      list = list.filter((r) => !!r.completed_at);
    }

    // Search Query
    const q = query.trim().toLowerCase();
    if (!q) return list;
    
    return list.filter(
      (r) =>
        r.summary.toLowerCase().includes(q) ||
        r.activity_type.toLowerCase().includes(q) ||
        (r.crm_leads?.full_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, query, statusFilter]);

  const markComplete = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("crm_activities")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", id);
      
      if (error) throw new Error(error.message);
      
      toast.success("Follow-up marked as completed!");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete follow-up");
    } finally {
      setBusy(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!newLeadId) return toast.error("Please select a lead");
    if (!newSummary.trim()) return toast.error("Please enter a summary of the activity");

    setBusy(true);
    try {
      const { error } = await supabase.from("crm_activities").insert({
        school_id: schoolId,
        lead_id: newLeadId,
        activity_type: newType,
        summary: newSummary.trim(),
        due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
      });

      if (error) throw new Error(error.message);

      toast.success("Follow-up activity scheduled!");
      setNewLeadId("");
      setNewSummary("");
      setNewDueAt("");
      setOpenScheduleDialog(false);
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule activity");
    } finally {
      setBusy(false);
    }
  };

  const isOverdue = (dueStr: string | null | undefined, completed: any) => {
    if (!dueStr || completed) return false;
    return new Date(dueStr) < new Date();
  };

  const getActivityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "call":
        return <Phone className="h-3.5 w-3.5 text-sky-500" />;
      case "email":
        return <Mail className="h-3.5 w-3.5 text-indigo-500" />;
      case "meeting":
        return <Calendar className="h-3.5 w-3.5 text-emerald-500" />;
      case "message":
      case "sms":
        return <MessageSquare className="h-3.5 w-3.5 text-orange-500" />;
      default:
        return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Control Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        
        {/* Status Filters */}
        <div className="flex bg-muted p-1 rounded-xl w-fit">
          <Button
            variant={statusFilter === "pending" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => setStatusFilter("pending")}
          >
            Pending Follow-ups
          </Button>
          <Button
            variant={statusFilter === "completed" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </Button>
          <Button
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => setStatusFilter("all")}
          >
            All
          </Button>
        </div>

        <div className="flex items-center gap-2">
          
          {/* Search bar */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search summary or lead name..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Schedule dialog */}
          <Dialog open={openScheduleDialog} onOpenChange={setOpenScheduleDialog}>
            <DialogTrigger asChild>
              <Button variant="hero" className="gap-1.5 text-xs h-9">
                <Plus className="h-4 w-4" /> Schedule Action
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display text-lg">Schedule Follow-up Action</DialogTitle>
                <DialogDescription>Create a task for callback, email outreach, or an in-person campus visit.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleScheduleSubmit} className="space-y-4 pt-2">
                
                {/* Select Lead */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Associated Lead *</label>
                  <Select value={newLeadId} onValueChange={setNewLeadId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Search / Select Lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.full_name} {l.phone ? `(${l.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Activity Type & Due Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Action Type</label>
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Phone Call</SelectItem>
                        <SelectItem value="email">Email Outreach</SelectItem>
                        <SelectItem value="meeting">Campus Meeting / Tour</SelectItem>
                        <SelectItem value="sms">SMS / WhatsApp</SelectItem>
                        <SelectItem value="task">General Task</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">Due Date & Time</label>
                    <Input
                      type="datetime-local"
                      value={newDueAt}
                      onChange={(e) => setNewDueAt(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Action summary */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Summary / Description *</label>
                  <Textarea
                    required
                    value={newSummary}
                    onChange={(e) => setNewSummary(e.target.value)}
                    placeholder="e.g. Call to discuss registration pricing options and arrange campus tour"
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpenScheduleDialog(false)}>Cancel</Button>
                  <Button type="submit" disabled={busy} variant="hero" size="sm">
                    {busy ? "Scheduling..." : "Schedule Action"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" className="h-9 px-3" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main List */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Activity Summary</TableHead>
                <TableHead>Lead Info</TableHead>
                <TableHead>Action Type</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const overdue = isOverdue(r.due_at, r.completed_at);
                return (
                  <TableRow key={r.id} className={overdue ? "bg-destructive/5 hover:bg-destructive/10" : ""}>
                    
                    {/* Summary */}
                    <TableCell className="align-middle">
                      <p className="font-semibold text-xs text-foreground leading-normal">{r.summary}</p>
                    </TableCell>

                    {/* Lead info */}
                    <TableCell className="align-middle">
                      {r.crm_leads ? (
                        <div>
                          <p className="font-semibold text-xs text-foreground">{r.crm_leads.full_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{r.crm_leads.phone || r.crm_leads.email || "No contact info"}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Orphaned Lead</span>
                      )}
                    </TableCell>

                    {/* Action Type */}
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-1.5 capitalize text-xs">
                        {getActivityIcon(r.activity_type)}
                        <span>{r.activity_type}</span>
                      </div>
                    </TableCell>

                    {/* Due date */}
                    <TableCell className="align-middle">
                      <div className={`flex items-center gap-1 text-xs ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        <Clock className="h-3 w-3" />
                        <span>{r.due_at ? new Date(r.due_at).toLocaleString() : "No deadline"}</span>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="align-middle">
                      {r.completed_at ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[10px] border border-emerald-500/20">Completed</Badge>
                      ) : overdue ? (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive text-[10px] border border-destructive/20">Overdue</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 text-[10px] border border-amber-500/20">Pending</Badge>
                      )}
                    </TableCell>

                    {/* Action button */}
                    <TableCell className="text-right align-middle">
                      {!r.completed_at ? (
                        <Button
                          variant="soft"
                          size="sm"
                          className="h-8 text-xs gap-1"
                          disabled={busy}
                          onClick={() => markComplete(r.id)}
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-600" /> Complete
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Done {new Date(r.completed_at).toLocaleDateString()}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-center py-10 text-muted-foreground">
                    No follow-up actions found matching this status or query.
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
