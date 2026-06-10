import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Phone, Search, PhoneCall, Copy, Clock, FileText, CheckCircle, RefreshCw, Mail } from "lucide-react";

type Lead = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
};

type CallLog = {
  id: string;
  lead_id: string;
  called_at: string;
  duration_seconds: number;
  outcome: string;
  notes: string | null;
};

export function MarketingCallsModule() {
  const { schoolSlug } = useParams();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);

  // Form State
  const [leadId, setLeadId] = useState<string>("");
  const [duration, setDuration] = useState("0");
  const [outcome, setOutcome] = useState("connected");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Search & Filter State
  const [query, setQuery] = useState("");

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
    const [{ data: leadsData }, { data: logsData }] = await Promise.all([
      supabase.from("crm_leads").select("id,full_name,phone,email").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase
        .from("crm_call_logs")
        .select("id,lead_id,called_at,duration_seconds,outcome,notes")
        .eq("school_id", schoolId)
        .order("called_at", { ascending: false }),
    ]);
    setLeads((leadsData ?? []) as Lead[]);
    setLogs((logsData ?? []) as CallLog[]);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const leadMap = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  const selectedLead = useMemo(() => {
    return leadMap.get(leadId) || null;
  }, [leadId, leadMap]);

  const add = async () => {
    if (!schoolId || !leadId) return;
    setBusy(true);
    try {
      const durationSeconds = Math.max(0, Number(duration || 0));
      const { error } = await supabase.from("crm_call_logs").insert({
        school_id: schoolId,
        lead_id: leadId,
        duration_seconds: durationSeconds,
        outcome,
        notes: notes.trim() ? notes.trim() : null,
      });

      if (error) throw new Error(error.message);

      toast.success("Call log recorded successfully!");
      setNotes("");
      setDuration("0");
      setLeadId("");
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to record call log");
    } finally {
      setBusy(false);
    }
  };

  // Helper to copy text
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  // Quick preset buttons for duration
  const setDurationPreset = (seconds: number) => {
    setDuration(String(seconds));
  };

  // Filter logs list
  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => {
      const leadName = (leadMap.get(l.lead_id)?.full_name ?? "").toLowerCase();
      const outcomeText = l.outcome.toLowerCase();
      const notesText = (l.notes ?? "").toLowerCase();
      return leadName.includes(q) || outcomeText.includes(q) || notesText.includes(q);
    });
  }, [logs, query, leadMap]);

  const getOutcomeBadge = (outcomeStr: string) => {
    switch (outcomeStr.toLowerCase()) {
      case "connected":
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">Connected</Badge>;
      case "no_answer":
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[10px]">No Answer</Badge>;
      case "busy":
        return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[10px]">Busy</Badge>;
      case "wrong_number":
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border border-destructive/20 text-[10px]">Wrong Number</Badge>;
      default:
        return <Badge variant="secondary" className="text-[10px]">{outcomeStr}</Badge>;
    }
  };

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  return (
    <div className="space-y-6">
      
      {/* Logger Panel */}
      <Card className="shadow-sm">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <PhoneCall className="h-4 w-4 text-primary" /> Record Outbound Call Log
          </CardTitle>
          <CardDescription className="text-xs">Document counselor calls, answer rates, and parent feedback.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Lead selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Select Lead *</label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Duration (seconds)</label>
              <Input
                type="number"
                min="0"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Duration (sec)"
                className="h-9 text-xs"
              />
            </div>

            {/* Outcome Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Call Outcome</label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="no_answer">No answer</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="wrong_number">Wrong number</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Save Button */}
            <div className="flex items-end">
              <Button variant="hero" className="w-full text-xs h-9" disabled={busy || !leadId} onClick={add}>
                Record Call Log
              </Button>
            </div>

          </div>

          {/* Quick Preset buttons & Lead quick-contacts */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t text-xs">
            
            {/* Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground">Duration Presets:</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px] py-0 px-2" onClick={() => setDurationPreset(30)}>30s</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] py-0 px-2" onClick={() => setDurationPreset(60)}>1m</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] py-0 px-2" onClick={() => setDurationPreset(180)}>3m</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px] py-0 px-2" onClick={() => setDurationPreset(300)}>5m</Button>
            </div>

            {/* Selected Lead Details */}
            {selectedLead && (
              <div className="flex items-center gap-3 bg-muted/40 p-2 rounded-xl border font-sans text-[11px]">
                <span className="font-semibold text-foreground">Contact:</span>
                {selectedLead.phone && (
                  <span className="flex items-center gap-1 text-primary">
                    <Phone className="h-3 w-3" /> {selectedLead.phone}
                    <button onClick={() => handleCopy(selectedLead.phone!)} className="hover:text-foreground text-[10px] ml-0.5"><Copy className="h-2.5 w-2.5" /></button>
                  </span>
                )}
                {selectedLead.email && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Mail className="h-3 w-3" /> {selectedLead.email}
                    <button onClick={() => handleCopy(selectedLead.email!)} className="hover:text-foreground text-[10px] ml-0.5"><Copy className="h-2.5 w-2.5" /></button>
                  </span>
                )}
              </div>
            )}

          </div>

          {/* Notes text area */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-semibold">Call Notes / Discussion Summary</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Record feedback, follow-up callbacks needed, child interest level, class placement options, etc..."
              className="text-xs h-9"
            />
          </div>

        </CardContent>
      </Card>

      {/* List Search & Control */}
      <div className="flex justify-between items-center">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs by lead, notes, or outcome..."
            className="pl-9 h-9 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9 px-3" onClick={refresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Logs Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Lead Profile</TableHead>
                <TableHead>Logged Time</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-1/3">Notes & Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((l) => (
                <TableRow key={l.id}>
                  
                  {/* Lead Info */}
                  <TableCell className="font-semibold text-xs align-middle">
                    {leadMap.get(l.lead_id)?.full_name ?? l.lead_id}
                  </TableCell>

                  {/* Called At */}
                  <TableCell className="text-muted-foreground text-xs align-middle flex items-center gap-1 pt-4">
                    <Clock className="h-3 w-3" />
                    {new Date(l.called_at).toLocaleString()}
                  </TableCell>

                  {/* Outcome */}
                  <TableCell className="align-middle">
                    {getOutcomeBadge(l.outcome)}
                  </TableCell>

                  {/* Duration */}
                  <TableCell className="text-muted-foreground text-xs align-middle font-mono">
                    {formatDuration(l.duration_seconds)}
                  </TableCell>

                  {/* Notes */}
                  <TableCell className="text-muted-foreground text-xs align-middle leading-normal">
                    {l.notes ? (
                      <div className="flex gap-1 items-start">
                        <FileText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                        <span>{l.notes}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>

                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-center py-10 text-muted-foreground">
                    No matching call logs recorded yet.
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
