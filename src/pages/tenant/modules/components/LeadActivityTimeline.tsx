import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, Filter, Plus } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Activity = {
  id: string;
  activity_type: string;
  summary: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export function LeadActivityTimeline({ schoolId, leadId }: { schoolId: string; leadId: string }) {
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [tab, setTab] = useState<"open" | "completed" | "all">("open");
  const [q, setQ] = useState("");

  const [type, setType] = useState("call");
  const [summary, setSummary] = useState("");
  const [dueAt, setDueAt] = useState<string>("");

  const refresh = async () => {
    setBusy(true);
    try {
      const { data, error } = await api
        .from("crm_activities")
        .select("id,activity_type,summary,due_at,completed_at,created_at")
        .eq("school_id", schoolId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(error.message);
        return;
      }
      setActivities((data ?? []) as Activity[]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, leadId]);

  const create = async () => {
    if (!summary.trim()) return toast.error("Summary is required");
    setBusy(true);
    try {
      const { data: auth } = await api.auth.getUser();
      const userId = auth.user?.id ?? null;

      const { error } = await api.from("crm_activities").insert({
        school_id: schoolId,
        lead_id: leadId,
        activity_type: type,
        summary: summary.trim(),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        created_by: userId,
      });
      if (error) return toast.error(error.message);

      setSummary("");
      setDueAt("");
      toast.success("Activity added");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const markComplete = async (activityId: string) => {
    setBusy(true);
    try {
      const { error } = await api
        .from("crm_activities")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", activityId)
        .eq("school_id", schoolId);
      if (error) return toast.error(error.message);
      toast.success("Marked complete");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activities
      .filter((a) => {
        if (tab === "open") return !a.completed_at;
        if (tab === "completed") return !!a.completed_at;
        return true;
      })
      .filter((a) => {
        if (!needle) return true;
        return `${a.summary} ${a.activity_type}`.toLowerCase().includes(needle);
      });
  }, [activities, q, tab]);

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">Add activity</p>
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="tour">Tour</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="note">Note</SelectItem>
            </SelectContent>
          </Select>

          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
          <Input value={dueAt} onChange={(e) => setDueAt(e.target.value)} type="datetime-local" />
        </div>

        <Button variant="hero" className="mt-3 w-full" disabled={busy} onClick={create}>
          Add activity
        </Button>
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium">Timeline</p>
          </div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activities" className="md:max-w-xs" />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="mt-3">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="space-y-2">
              {filtered.map((a) => {
                const overdue = !!a.due_at && !a.completed_at && new Date(a.due_at).getTime() < Date.now();
                return (
                  <div key={a.id} className="rounded-2xl bg-surface p-3 shadow-elevated">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{a.summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium">{a.activity_type}</span> • due {fmt(a.due_at)}
                          {overdue ? " • overdue" : ""}
                        </p>
                      </div>

                      {a.completed_at ? (
                        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" /> done
                        </div>
                      ) : (
                        <Button variant="soft" size="sm" disabled={busy} onClick={() => markComplete(a.id)}>
                          <Clock className="mr-2 h-4 w-4" /> Complete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="rounded-2xl border border-dashed bg-surface p-4 text-sm text-muted-foreground">No activities.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
