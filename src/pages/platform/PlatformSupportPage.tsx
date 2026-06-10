import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RefreshCw, Inbox, MessageSquare, AlertCircle, CheckCircle, Clock } from "lucide-react";

type Req = {
  id: string;
  requester_user_id: string;
  school_id: string | null;
  request_type: string;
  subject: string;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

export default function PlatformSupportPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [requesters, setRequesters] = useState<Record<string, { email?: string; display_name?: string }>>({});
  const [selectedRequest, setSelectedRequest] = useState<Req | null>(null);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from("platform_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as Req[];
    setRows(list);

    if (list.length > 0 && !selectedRequest) {
      setSelectedRequest(list[0]);
    }

    const ids = Array.from(new Set(list.map((r) => r.requester_user_id))).filter(Boolean);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,email,display_name")
        .in("user_id", ids);
      const map: Record<string, { email?: string; display_name?: string }> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = { email: p.email, display_name: p.display_name };
      });
      setRequesters(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const notes = notesById[id] || (selectedRequest?.id === id ? selectedRequest.admin_notes : "");
    const patch: any = { status };
    if (typeof notes === "string") patch.admin_notes = notes;
    const { error } = await (supabase as any).from("platform_requests").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Request marked ${status}`);
    if (selectedRequest?.id === id) {
      setSelectedRequest(prev => prev ? { ...prev, status, admin_notes: notes || prev.admin_notes } : null);
    }
    await load();
  };

  // Metrics calculation
  const totalOpen = rows.filter(r => r.status === "open").length;
  const totalInProgress = rows.filter(r => r.status === "in_progress").length;
  const totalResolved = rows.filter(r => r.status === "resolved").length;

  return (
    <SuperAdminShell title="Support Center" subtitle="Manage incoming tenant assistance queries, server upgrades, and custom integrations">
      <div className="space-y-6 text-zinc-100">
        
        {/* Support Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Total Open Tickets</p>
              <h3 className="text-2xl font-bold text-amber-500 mt-1">{totalOpen}</h3>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-500/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">In Progress</p>
              <h3 className="text-2xl font-bold text-amber-400 mt-1">{totalInProgress}</h3>
            </div>
            <Clock className="h-8 w-8 text-amber-400/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Resolved Today</p>
              <h3 className="text-2xl font-bold text-emerald-400 mt-1">{totalResolved}</h3>
            </div>
            <CheckCircle className="h-8 w-8 text-emerald-400/20" />
          </Card>
          <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-400">Avg. Response Time</p>
              <h3 className="text-2xl font-bold text-white mt-1">14 mins</h3>
            </div>
            <MessageSquare className="h-8 w-8 text-white/20" />
          </Card>
        </div>

        {/* Layout container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Inbox panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All tickets</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={load}
                disabled={loading}
                className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-amber-500/10 hover:text-amber-300 border"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-sm text-zinc-400">
                  No tickets found.
                </div>
              ) : (
                rows.map((r) => {
                  const active = selectedRequest?.id === r.id;
                  const req = requesters[r.requester_user_id];
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRequest(r)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        active
                          ? "border-amber-500 bg-amber-500/5 shadow-[0_4px_12px_rgba(245,158,11,0.05)]"
                          : "border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5 text-[10px]">
                          {r.request_type.replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] text-zinc-400">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-white truncate">{r.subject}</p>
                      <p className="text-xs text-zinc-400 mt-1 truncate">
                        {req?.display_name || "School Staff"} ({req?.email || "—"})
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Ticket Details Panel */}
          <div className="lg:col-span-2">
            {selectedRequest ? (
              <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] h-full flex flex-col justify-between">
                <div>
                  <CardHeader className="border-b border-zinc-900">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5">
                          {selectedRequest.request_type.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            selectedRequest.status === "open"
                              ? "bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold border-transparent"
                              : selectedRequest.status === "in_progress"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : selectedRequest.status === "resolved"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }
                        >
                          {selectedRequest.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-zinc-400">
                        Submitted: {new Date(selectedRequest.created_at).toLocaleString()}
                      </span>
                    </div>
                    <CardTitle className="text-xl font-bold text-white mt-1">{selectedRequest.subject}</CardTitle>
                    <p className="text-xs text-zinc-400 mt-1.5">
                      Requester ID: <span className="font-mono text-zinc-300">{selectedRequest.requester_user_id}</span>
                      {selectedRequest.school_id && (
                        <> · School ID: <span className="font-mono text-zinc-300">{selectedRequest.school_id}</span></>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="py-6 space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Message</label>
                      <div className="rounded-xl border border-zinc-900 bg-zinc-900/30 p-4 text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                        {selectedRequest.message}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Admin Resolution Notes</label>
                      <Textarea
                        placeholder="Type updates, integration specs or action resolutions here..."
                        defaultValue={selectedRequest.admin_notes ?? ""}
                        rows={4}
                        className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                        onChange={(e) => setNotesById({ ...notesById, [selectedRequest.id]: e.target.value })}
                      />
                    </div>
                  </CardContent>
                </div>

                <div className="p-6 border-t border-zinc-900 bg-zinc-900/10 flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(selectedRequest.id, "in_progress")}
                    className="border-zinc-850 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    Mark In Progress
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(selectedRequest.id, "rejected")}
                    className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    Reject Ticket
                  </Button>
                  <Button
                    onClick={() => updateStatus(selectedRequest.id, "resolved")}
                    className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-md shadow-amber-500/10"
                  >
                    Resolve & Close Ticket
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="h-full min-h-[300px] rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 flex flex-col items-center justify-center text-zinc-400 p-8 text-center">
                <Inbox className="h-10 w-10 text-amber-500/40 mb-3" />
                <p className="font-semibold text-zinc-200">No ticket selected</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">Pick a ticket from the left panel to inspect details and initiate resolution actions.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </SuperAdminShell>
  );
}
