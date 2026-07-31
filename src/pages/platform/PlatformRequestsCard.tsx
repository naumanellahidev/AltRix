import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RefreshCw, Inbox } from "lucide-react";

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

type SchoolLite = { id: string; slug: string; name: string };

export default function PlatformRequestsCard({ schools }: { schools: SchoolLite[] }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [requesters, setRequesters] = useState<Record<string, { email?: string; display_name?: string }>>({});

  const schoolMap = new Map(schools.map((s) => [s.id, s]));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const notes = notesById[id];
    const patch: any = { status };
    if (typeof notes === "string") patch.admin_notes = notes;
    const { error } = await (supabase as any).from("platform_requests").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Request marked ${status}`);
    await load();
  };

  return (
    <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-display text-xl flex items-center gap-2 text-slate-900">
              <Inbox className="h-5 w-5 text-blue-700" /> Owner Requests
            </CardTitle>
            <p className="text-xs text-slate-500">New campus / school requests sent by school owners.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 bg-slate-50 border-slate-300 text-slate-900 focus:ring-blue-500/30"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-blue-50/30 p-6 text-center text-sm text-slate-500">
            No requests {statusFilter !== "all" ? `with status "${statusFilter}"` : ""}.
          </div>
        ) : (
          rows.map((r) => {
            const school = r.school_id ? schoolMap.get(r.school_id) : null;
            const requester = requesters[r.requester_user_id];
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-slate-50/20 p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">{r.request_type.replace("_", " ")}</Badge>
                      <Badge variant={r.status === "open" ? "default" : "outline"} className={r.status === "open" ? "bg-blue-600 text-zinc-950 hover:bg-blue-500 font-semibold" : "border-slate-300 text-slate-500 bg-slate-100/20"}>{r.status}</Badge>
                      {school && <Badge variant="outline" className="border-slate-300 text-slate-700">{school.slug}</Badge>}
                      <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{r.subject}</p>
                    <p className="text-xs text-slate-500">
                      From: {requester?.display_name || "—"} {requester?.email ? `(${requester.email})` : ""}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{r.message}</p>
                <Textarea
                  placeholder="Admin notes (optional)"
                  defaultValue={r.admin_notes ?? ""}
                  rows={2}
                  className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus-visible:ring-blue-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                  onChange={(e) => setNotesById((m) => ({ ...m, [r.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "in_progress")} className="border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900">Mark in progress</Button>
                  <Button size="sm" onClick={() => updateStatus(r.id, "resolved")} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0 shadow-sm">Resolve</Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "rejected")} className="border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300">Reject</Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
