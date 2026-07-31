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
    <SuperAdminShell title="11. Customer Support Desk & SLA Escalation" subtitle="Centralized inbox for school owner tickets, SLA countdown timers & automated escalation alerts">
      <div className="space-y-6 text-slate-900">
        
        {/* Support Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Open Tickets</p>
              <h3 className="text-2xl font-black text-blue-700 mt-1">{totalOpen}</h3>
            </div>
            <AlertCircle className="h-8 w-8 text-blue-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">In Progress</p>
              <h3 className="text-2xl font-black text-indigo-700 mt-1">{totalInProgress}</h3>
            </div>
            <Clock className="h-8 w-8 text-indigo-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolved Today</p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">{totalResolved}</h3>
            </div>
            <CheckCircle className="h-8 w-8 text-emerald-600/20" />
          </Card>
          <Card className="bg-white border border-slate-200 shadow-md p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg. Response Time</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">14 mins</h3>
            </div>
            <MessageSquare className="h-8 w-8 text-slate-400/20" />
          </Card>
        </div>

        {/* Layout container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Inbox panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full bg-slate-50 border-slate-300 text-slate-900 font-bold focus:ring-blue-500/30">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-800">
                  <SelectItem value="open" className="focus:bg-blue-50 font-medium">Open</SelectItem>
                  <SelectItem value="in_progress" className="focus:bg-blue-50 font-medium">In progress</SelectItem>
                  <SelectItem value="resolved" className="focus:bg-blue-50 font-medium">Resolved</SelectItem>
                  <SelectItem value="rejected" className="focus:bg-blue-50 font-medium">Rejected</SelectItem>
                  <SelectItem value="all" className="focus:bg-blue-50 font-medium">All tickets</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={load}
                disabled={loading}
                className="bg-white border-slate-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 font-bold shadow-sm"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
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
                          ? "border-blue-500 bg-blue-50/60 shadow-sm"
                          : "border-slate-200 bg-white hover:bg-blue-50/30 hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[10px] font-bold">
                          {r.request_type.replace("_", " ")}
                        </Badge>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="font-bold text-sm text-slate-900 truncate">{r.subject}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate font-medium">
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
              <Card className="bg-white border border-slate-200 shadow-md h-full flex flex-col justify-between">
                <div>
                  <CardHeader className="border-b border-slate-100">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 font-bold">
                          {selectedRequest.request_type.replace("_", " ")}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            selectedRequest.status === "open"
                              ? "bg-blue-600 text-white hover:bg-blue-500 font-semibold border-transparent"
                              : selectedRequest.status === "in_progress"
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : selectedRequest.status === "resolved"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }
                        >
                          {selectedRequest.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Submitted: {new Date(selectedRequest.created_at).toLocaleString()}
                      </span>
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-900 mt-1">{selectedRequest.subject}</CardTitle>
                    <p className="text-xs text-slate-500 mt-1.5 font-medium">
                      Requester ID: <span className="font-mono text-slate-700 font-bold">{selectedRequest.requester_user_id}</span>
                      {selectedRequest.school_id && (
                        <> · School ID: <span className="font-mono text-blue-700 font-bold">{selectedRequest.school_id}</span></>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="py-6 space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message</label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {selectedRequest.message}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin Resolution Notes</label>
                      <Textarea
                        placeholder="Type updates, integration specs or action resolutions here..."
                        defaultValue={selectedRequest.admin_notes ?? ""}
                        rows={4}
                        className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30"
                        onChange={(e) => setNotesById({ ...notesById, [selectedRequest.id]: e.target.value })}
                      />
                    </div>
                  </CardContent>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(selectedRequest.id, "in_progress")}
                    className="border-slate-300 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-bold"
                  >
                    Mark In Progress
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatus(selectedRequest.id, "rejected")}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-bold"
                  >
                    Reject Ticket
                  </Button>
                  <Button
                    onClick={() => updateStatus(selectedRequest.id, "resolved")}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold border-0 shadow-md"
                  >
                    Resolve & Close Ticket
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="h-full min-h-[300px] rounded-2xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                <Inbox className="h-10 w-10 text-blue-600/30 mb-3" />
                <p className="font-bold text-slate-700">No ticket selected</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">Pick a ticket from the left panel to inspect details and initiate resolution actions.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </SuperAdminShell>
  );
}
