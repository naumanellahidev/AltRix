import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, AlertTriangle, FileText, Printer, Pencil, Eye, Trash2, Search,
} from "lucide-react";
import { ContractLetterhead } from "@/components/hr/ContractLetterhead";
import { usePdfExport } from "@/hooks/usePdfExport";
import { ExportPdfButton } from "@/components/pdf/ExportPdfButton";

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.ceil((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const blankForm = {
  user_id: "",
  contract_type: "full_time",
  position: "",
  department: "",
  start_date: today(),
  end_date: "",
  status: "active",
  reference_number: "",
  salary_amount: "",
  salary_currency: "PKR",
  working_hours: "Mon–Fri, 8:00 AM – 4:00 PM",
  probation_period_months: "3",
  notice_period_days: "30",
  reporting_to: "",
  benefits: "",
  terms: "",
  body: "",
  signatory_name: "",
  signatory_title: "Principal",
};

export function HrContractsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<any>(blankForm);

  const [viewing, setViewing] = useState<any | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>(blankForm);
  const [search, setSearch] = useState("");

  const { data: school } = useQuery({
    queryKey: ["school_meta", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase.from("schools")
        .select("id,name,logo_url,address,email,phone,website,motto,slug")
        .eq("id", schoolId!).maybeSingle();
      return data;
    },
  });

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["hr_contracts_full", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_contracts").select("*")
        .eq("school_id", schoolId!)
        .order("end_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["hr_staff_dir_contracts", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_staff_directory", { _school_id: schoolId! });
      if (error) throw error;
      return data || [];
    },
  });

  const staffById = useMemo(() => {
    const m = new Map<string, any>();
    (staff as any[]).forEach((s) => m.set(s.user_id, s));
    return m;
  }, [staff]);
  const nameOf = (uid: string) => staffById.get(uid)?.display_name || staffById.get(uid)?.email || uid.slice(0, 8);

  const toPayload = (f: any) => ({
    school_id: schoolId,
    user_id: f.user_id,
    contract_type: f.contract_type,
    position: f.position || null,
    department: f.department || null,
    start_date: f.start_date,
    end_date: f.end_date || null,
    status: f.status,
    reference_number: f.reference_number || null,
    salary_amount: f.salary_amount ? Number(f.salary_amount) : null,
    salary_currency: f.salary_currency || "PKR",
    working_hours: f.working_hours || null,
    probation_period_months: f.probation_period_months ? Number(f.probation_period_months) : null,
    notice_period_days: f.notice_period_days ? Number(f.notice_period_days) : null,
    reporting_to: f.reporting_to || null,
    benefits: f.benefits || null,
    terms: f.terms || null,
    body: f.body || null,
    signatory_name: f.signatory_name || null,
    signatory_title: f.signatory_title || null,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_contracts").insert(toPayload(form));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contract added");
      qc.invalidateQueries({ queryKey: ["hr_contracts_full"] });
      setCreateOpen(false);
      setForm(blankForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("hr_contracts").update(toPayload(editForm)).eq("id", viewing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contract updated");
      qc.invalidateQueries({ queryKey: ["hr_contracts_full"] });
      setEditMode(false);
      setViewing({ ...viewing, ...toPayload(editForm) });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contract deleted");
      qc.invalidateQueries({ queryKey: ["hr_contracts_full"] });
      setViewing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openContract = (c: any) => {
    setViewing(c);
    setEditMode(false);
    setEditForm({
      ...blankForm,
      ...c,
      end_date: c.end_date || "",
      salary_amount: c.salary_amount ?? "",
      probation_period_months: c.probation_period_months ?? "",
      notice_period_days: c.notice_period_days ?? "",
    });
  };

  const letterheadRef = useRef<HTMLDivElement>(null);
  const { printNode } = usePdfExport();
  const handlePrint = () => printNode(letterheadRef.current);

  const t = today();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c: any) => {
      const n = nameOf(c.user_id).toLowerCase();
      return n.includes(q) || (c.position || "").toLowerCase().includes(q) ||
        (c.department || "").toLowerCase().includes(q) ||
        (c.reference_number || "").toLowerCase().includes(q);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, search, JSON.stringify(Array.from(staffById.entries()))]);

  const expiringSoon = filtered.filter((c: any) => c.end_date && c.status === "active" && daysBetween(c.end_date, t) >= 0 && daysBetween(c.end_date, t) <= 60);
  const expired = filtered.filter((c: any) => c.end_date && daysBetween(c.end_date, t) < 0 && c.status === "active");

  const renderFormFields = (f: any, setF: (v: any) => void) => (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
      <div>
        <Label>Employee</Label>
        <Select value={f.user_id} onValueChange={(v) => setF({ ...f, user_id: v })}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            {(staff as any[]).map((s) => (
              <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Reference No.</Label><Input value={f.reference_number} onChange={(e) => setF({ ...f, reference_number: e.target.value })} placeholder="Auto if blank" /></div>
        <div>
          <Label>Type</Label>
          <Select value={f.contract_type} onValueChange={(v) => setF({ ...f, contract_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full_time">Full-time</SelectItem>
              <SelectItem value="part_time">Part-time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="intern">Intern</SelectItem>
              <SelectItem value="probation">Probation</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Position</Label><Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></div>
        <div><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Start</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
        <div><Label>End</Label><Input type="date" value={f.end_date || ""} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Salary</Label><Input type="number" value={f.salary_amount} onChange={(e) => setF({ ...f, salary_amount: e.target.value })} /></div>
        <div><Label>Currency</Label><Input value={f.salary_currency} onChange={(e) => setF({ ...f, salary_currency: e.target.value })} /></div>
        <div>
          <Label>Status</Label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Probation (months)</Label><Input type="number" value={f.probation_period_months} onChange={(e) => setF({ ...f, probation_period_months: e.target.value })} /></div>
        <div><Label>Notice (days)</Label><Input type="number" value={f.notice_period_days} onChange={(e) => setF({ ...f, notice_period_days: e.target.value })} /></div>
        <div><Label>Reporting To</Label><Input value={f.reporting_to} onChange={(e) => setF({ ...f, reporting_to: e.target.value })} /></div>
      </div>
      <div><Label>Working Hours</Label><Input value={f.working_hours} onChange={(e) => setF({ ...f, working_hours: e.target.value })} /></div>
      <div><Label>Benefits</Label><Textarea rows={2} value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder="Medical, transport, allowances…" /></div>
      <div><Label>Terms &amp; Conditions</Label><Textarea rows={3} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></div>
      <div><Label>Additional Body / Notes</Label><Textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Signatory Name</Label><Input value={f.signatory_name} onChange={(e) => setF({ ...f, signatory_name: e.target.value })} /></div>
        <div><Label>Signatory Title</Label><Input value={f.signatory_title} onChange={(e) => setF({ ...f, signatory_title: e.target.value })} /></div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Contracts</h1>
          <p className="text-sm text-muted-foreground">Click any contract to open the branded letterhead view, edit, or print.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (o) setForm(blankForm); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />New Contract</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
            {renderFormFields(form, setForm)}
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.user_id || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, position, dept, ref…" className="pl-8" />
      </div>

      {(expiringSoon.length > 0 || expired.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><p className="font-medium">Contract Alerts</p></div>
            <div className="text-sm space-y-1">
              {expired.length > 0 && <p><span className="font-medium text-destructive">{expired.length}</span> expired contract(s) still marked active.</p>}
              {expiringSoon.length > 0 && <p><span className="font-medium text-amber-600">{expiringSoon.length}</span> contract(s) expiring within 60 days.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          <TabsTrigger value="expiring">Expiring ({expiringSoon.length})</TabsTrigger>
          <TabsTrigger value="expired">Expired ({expired.length})</TabsTrigger>
        </TabsList>
        {[
          { v: "all", list: filtered },
          { v: "expiring", list: expiringSoon },
          { v: "expired", list: expired },
        ].map((tab) => (
          <TabsContent key={tab.v} value={tab.v} className="space-y-2 mt-4">
            {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {!isLoading && tab.list.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
            {tab.list.map((c: any) => {
              const dleft = c.end_date ? daysBetween(c.end_date, t) : null;
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition"
                  onClick={() => openContract(c)}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-primary" />
                        {nameOf(c.user_id)}
                        {c.reference_number && <span className="text-xs text-muted-foreground font-mono">· {c.reference_number}</span>}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{c.position || c.contract_type}{c.department ? ` · ${c.department}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{c.start_date} → {c.end_date || "Ongoing"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {dleft !== null && dleft >= 0 && dleft <= 60 && <Badge variant="outline" className="border-amber-500 text-amber-600">{dleft}d left</Badge>}
                      {dleft !== null && dleft < 0 && <Badge variant="destructive">Expired</Badge>}
                      <Badge variant="outline" className="capitalize">{c.status}</Badge>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>

      {/* Viewer / Editor dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setEditMode(false); } }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
          <div className="flex items-center justify-between gap-2 p-4 border-b no-print sticky top-0 bg-background z-10">
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-base">
                {viewing && (
                  <span>Contract — <span className="font-mono text-xs text-muted-foreground">{viewing.reference_number || String(viewing.id).slice(0, 8).toUpperCase()}</span></span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2">
              {!editMode ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                    <Pencil className="h-4 w-4 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1" />Print
                  </Button>
                  <ExportPdfButton
                    targetRef={letterheadRef}
                    filename={`contract-${viewing?.reference_number || viewing?.id?.slice(0, 8) || "document"}.pdf`}
                    label="Download"
                    size="sm"
                  />
                  <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm("Delete this contract?")) remove.mutate(viewing.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>Save Changes</Button>
                </>
              )}
            </div>
          </div>

          <div className="p-4 bg-muted/30">
            {viewing && !editMode && (
              <ContractLetterhead
                ref={letterheadRef}
                school={school}
                contract={viewing}
                employeeName={nameOf(viewing.user_id)}
                employeeEmail={staffById.get(viewing.user_id)?.email}
              />
            )}
            {viewing && editMode && (
              <div className="bg-background rounded-md p-4">
                {renderFormFields(editForm, setEditForm)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
