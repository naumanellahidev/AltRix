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
    <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="font-display text-xl flex items-center gap-2 text-white">
              <Inbox className="h-5 w-5 text-amber-500" /> Owner Requests
            </CardTitle>
            <p className="text-xs text-zinc-400">New campus / school requests sent by school owners.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 bg-zinc-900 border-amber-500/20 text-white focus:ring-amber-500/30"><SelectValue /></SelectTrigger>
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
              className="border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-amber-500/10 hover:text-amber-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-sm text-zinc-400">
            No requests {statusFilter !== "all" ? `with status "${statusFilter}"` : ""}.
          </div>
        ) : (
          rows.map((r) => {
            const school = r.school_id ? schoolMap.get(r.school_id) : null;
            const requester = requesters[r.requester_user_id];
            return (
              <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5">{r.request_type.replace("_", " ")}</Badge>
                      <Badge variant={r.status === "open" ? "default" : "outline"} className={r.status === "open" ? "bg-amber-500 text-zinc-950 hover:bg-amber-400 font-semibold" : "border-zinc-700 text-zinc-400 bg-zinc-800/20"}>{r.status}</Badge>
                      {school && <Badge variant="outline" className="border-zinc-700 text-zinc-300">{school.slug}</Badge>}
                      <span className="text-xs text-zinc-400">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 font-medium text-white">{r.subject}</p>
                    <p className="text-xs text-zinc-400">
                      From: {requester?.display_name || "—"} {requester?.email ? `(${requester.email})` : ""}
                    </p>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-200">{r.message}</p>
                <Textarea
                  placeholder="Admin notes (optional)"
                  defaultValue={r.admin_notes ?? ""}
                  rows={2}
                  className="bg-zinc-900 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30 autofill:shadow-[0_0_0px_1000px_#18181b_inset]"
                  onChange={(e) => setNotesById((m) => ({ ...m, [r.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "in_progress")} className="border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white">Mark in progress</Button>
                  <Button size="sm" onClick={() => updateStatus(r.id, "resolved")} className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-sm">Resolve</Button>
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
