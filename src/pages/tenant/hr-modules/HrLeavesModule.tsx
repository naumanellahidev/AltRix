import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";

export function HrLeavesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const qc = useQueryClient();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [typeOpen, setTypeOpen] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: "", max_days: "20", is_paid: true });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["hr_leave_requests_full", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_leave_requests").select("*").eq("school_id", schoolId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staffDir = [] } = useQuery({
    queryKey: ["school_staff_directory_leaves", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_staff_directory", { _school_id: schoolId! });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ["hr_leave_types_full", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_leave_types").select("*").eq("school_id", schoolId!).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const nameById = useMemo(() => { const m = new Map<string, string>(); (staffDir as any[]).forEach((u) => m.set(u.user_id, u.display_name || u.email)); return m; }, [staffDir]);
  const typeNameById = useMemo(() => { const m = new Map<string, string>(); (leaveTypes as any[]).forEach((t) => m.set(t.id, t.name)); return m; }, [leaveTypes]);

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("hr_leave_requests").update({ status, reviewed_by: (await supabase.auth.getUser()).data.user?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr_leave_requests_full"] }); toast.success("Updated"); },
  });

  const createType = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_leave_types").insert({
        school_id: schoolId, name: typeForm.name, max_days: Number(typeForm.max_days) || 0, is_paid: typeForm.is_paid,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Type added"); qc.invalidateQueries({ queryKey: ["hr_leave_types_full"] }); qc.invalidateQueries({ queryKey: ["hr_leave_types"] }); setTypeOpen(false); setTypeForm({ name: "", max_days: "20", is_paid: true }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_leave_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["hr_leave_types_full"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Balances aggregated from approved requests per user/type
  const balances = useMemo(() => {
    const used = new Map<string, number>();
    (requests as any[]).filter((r) => r.status === "approved").forEach((r) => {
      const key = `${r.user_id}|${r.leave_type_id}`;
      used.set(key, (used.get(key) || 0) + Number(r.days_count || 0));
    });
    const rows: { user_id: string; user_name: string; type_id: string; type_name: string; used: number; max: number }[] = [];
    (staffDir as any[]).forEach((u) => {
      (leaveTypes as any[]).forEach((t) => {
        const usedDays = used.get(`${u.user_id}|${t.id}`) || 0;
        if (usedDays > 0 || t.max_days) rows.push({ user_id: u.user_id, user_name: u.display_name || u.email, type_id: t.id, type_name: t.name, used: usedDays, max: t.max_days || 0 });
      });
    });
    return rows;
  }, [requests, staffDir, leaveTypes]);

  const pending = (requests as any[]).filter((r) => r.status === "pending");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Leave Management</h1>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests{pending.length > 0 && ` (${pending.length})`}</TabsTrigger>
          <TabsTrigger value="types">Types ({leaveTypes.length})</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-3 mt-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && requests.length === 0 && <p className="text-sm text-muted-foreground">No requests.</p>}
          {(requests as any[]).map((req) => (
            <Card key={req.id}><CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{nameById.get(req.user_id) || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">{typeNameById.get(req.leave_type_id) || "Leave"} · {req.start_date} → {req.end_date} ({req.days_count}d)</p>
                {req.reason && <p className="text-sm mt-1">{req.reason}</p>}
              </div>
              <div className="flex gap-2">
                {req.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => approveMutation.mutate({ id: req.id, status: "approved" })}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => approveMutation.mutate({ id: req.id, status: "rejected" })}>Reject</Button>
                  </>
                ) : <Badge variant="outline" className="capitalize">{req.status}</Badge>}
              </div>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="types" className="space-y-3 mt-4">
          <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Type</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Leave Type</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Annual / Sick / Casual" /></div>
                <div><Label>Max Days per Year</Label><Input type="number" value={typeForm.max_days} onChange={(e) => setTypeForm({ ...typeForm, max_days: e.target.value })} /></div>
                <div className="flex items-center gap-2"><Switch checked={typeForm.is_paid} onCheckedChange={(v) => setTypeForm({ ...typeForm, is_paid: v })} /><Label>Paid Leave</Label></div>
              </div>
              <DialogFooter><Button onClick={() => createType.mutate()} disabled={!typeForm.name || createType.isPending}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          {leaveTypes.length === 0 && <p className="text-sm text-muted-foreground">No types defined.</p>}
          {(leaveTypes as any[]).map((t) => (
            <Card key={t.id}><CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.max_days || 0} days/yr · {t.is_paid ? "Paid" : "Unpaid"}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => deleteType.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="balances" className="space-y-2 mt-4">
          {balances.length === 0 && <p className="text-sm text-muted-foreground">No balance data yet.</p>}
          {balances.map((b) => {
            const remaining = Math.max(0, b.max - b.used);
            const pct = b.max > 0 ? Math.min(100, (b.used / b.max) * 100) : 0;
            return (
              <Card key={`${b.user_id}-${b.type_id}`}><CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm"><span className="font-medium">{b.user_name}</span> · {b.type_name}</p>
                  <p className="text-sm text-muted-foreground">{b.used} / {b.max || "∞"} used</p>
                </div>
                {b.max > 0 && <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>}
                {b.max > 0 && <p className="text-xs text-muted-foreground mt-1">{remaining} days remaining</p>}
              </CardContent></Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
