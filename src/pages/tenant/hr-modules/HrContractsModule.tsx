import { localDay } from "@/lib/local-date";
import { useMemo, useRef, useState } from "react";
import { DataExportMenu } from "@/components/documents/DataExportMenu";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  Plus, AlertTriangle, FileText, Printer, Pencil, Eye, Trash2, Search, Download, MessageCircle, Loader2,
} from "lucide-react";
import { ModuleHeader, QueryState, StatTiles } from "@/components/tenant/module-kit";
import { ContractLetterhead } from "@/components/hr/ContractLetterhead";
import {
  type AppointmentLetterInput,
  downloadAppointmentLetter,
  printAppointmentLetter,
  shareAppointmentLetter,
} from "@/lib/documents/appointment-letter";
import { describeShare } from "@/lib/documents/deliver";

const today = () => localDay();
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
      const { data } = await api.from("schools")
        .select("id,name,logo_url,address,email,phone,website,motto,slug")
        .eq("id", schoolId!).maybeSingle();
      return data;
    },
  });

  const contractsQuery = useQuery({
    queryKey: ["hr_contracts_full", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await api.from("hr_contracts").select("*")
        .eq("school_id", schoolId!)
        .order("end_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const contracts = contractsQuery.data ?? [];
  const isLoading = contractsQuery.isLoading;

  const { data: staff = [] } = useQuery({
    queryKey: ["hr_staff_dir_contracts", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await api.rpc("get_school_staff_directory", { _school_id: schoolId! });
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
      const { error } = await api.from("hr_contracts").insert(toPayload(form));
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
      const { error } = await api.from("hr_contracts").update(toPayload(editForm)).eq("id", viewing.id);
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
      const { error } = await api.from("hr_contracts").delete().eq("id", id);
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
  const [producing, setProducing] = useState<null | "print" | "download" | "share">(null);

  const letterInput = (c: any): AppointmentLetterInput => ({
    contractId: String(c.id),
    reference: c.reference_number,
    employeeName: nameOf(c.user_id),
    employeeEmail: staffById.get(c.user_id)?.email ?? null,
    contractType: c.contract_type,
    position: c.position,
    department: c.department,
    startDate: c.start_date,
    endDate: c.end_date,
    reportingTo: c.reporting_to,
    workingHours: c.working_hours,
    probationMonths: c.probation_period_months,
    noticeDays: c.notice_period_days,
    salaryAmount: c.salary_amount,
    salaryCurrency: c.salary_currency,
    benefits: c.benefits,
    terms: c.terms,
    body: c.body,
    signatoryName: c.signatory_name,
    signatoryTitle: c.signatory_title,
    status: c.status,
    issuedOn: c.created_at,
  });

  /** Print, download or share the appointment letter as a real PDF. */
  const produceLetter = async (kind: "print" | "download" | "share", c: any) => {
    if (!c) return;
    setProducing(kind);
    const id = toast.loading("Preparing the appointment letter…");
    try {
      const input = letterInput(c);
      if (kind === "share") {
        const outcome = await shareAppointmentLetter(input);
        const { tone, message } = describeShare(outcome);
        const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
        if (tone === "error") toast.error(message + note, { id });
        else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
        else toast.success(message + note, { id });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printAppointmentLetter(input) : await downloadAppointmentLetter(input);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e: any) {
      toast.error(`The letter could not be produced: ${e?.message ?? String(e)}`, { id });
    } finally {
      setProducing(null);
    }
  };

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
      <ModuleHeader
        icon={FileText}
        tone="slate"
        title="Contracts"
        description="Who the school has employed and on what terms, with the dates each agreement runs to. Open any one to read, edit or print it on the school's letterhead."
        actions={<>
        <DataExportMenu
          title="Contracts"
          rows={(contracts as any[]).map((c) => ({
            Staff: nameOf(c.user_id),
            Reference: c.reference_number ?? "",
            Position: c.position ?? "",
            Department: c.department ?? "",
            Type: c.contract_type ?? "",
            Starts: c.start_date ?? "",
            Ends: c.end_date ?? "",
            Status: c.status ?? "",
          }))}
          disabled={!(contracts as any[]).length}
          size="sm"
        />
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (o) setForm(blankForm); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl text-xs h-9"><Plus className="h-3.5 w-3.5 mr-1" />New Contract</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-2xl">
            <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
            {renderFormFields(form, setForm)}
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.user_id || create.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
        }
      />

      <StatTiles
        stats={[
          { label: "Contracts on record", value: contracts.length, hint: "Every agreement the school has stored" },
          {
            label: "Expiring within 60 days",
            value: expiringSoon.length,
            tone: expiringSoon.length ? "warning" : "default",
            hint: expiringSoon.length ? "Renew or let lapse before the end date" : "Nothing falls due in the next two months",
          },
          {
            label: "Expired, still marked active",
            value: expired.length,
            tone: expired.length ? "danger" : "default",
            hint: expired.length ? "The end date has passed but the status was never changed" : "None",
          },
        ]}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, position, dept, ref…" className="pl-8 rounded-xl h-9 text-xs" />
      </div>

      {(expiringSoon.length > 0 || expired.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5 rounded-2xl shadow-sm">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center gap-2 mb-1.5"><AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" /><p className="font-semibold text-xs sm:text-sm">Contract Alerts</p></div>
            <div className="text-xs sm:text-sm space-y-1">
              {expired.length > 0 && <p><span className="font-medium text-destructive">{expired.length}</span> expired contract(s) still marked active.</p>}
              {expiringSoon.length > 0 && <p><span className="font-medium text-amber-600">{expiringSoon.length}</span> contract(s) expiring within 60 days.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all" className="space-y-4">
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <TabsList className="inline-flex w-max min-w-full sm:w-auto p-1 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg text-xs font-semibold whitespace-nowrap">All ({filtered.length})</TabsTrigger>
            <TabsTrigger value="expiring" className="rounded-lg text-xs font-semibold whitespace-nowrap">Expiring ({expiringSoon.length})</TabsTrigger>
            <TabsTrigger value="expired" className="rounded-lg text-xs font-semibold whitespace-nowrap">Expired ({expired.length})</TabsTrigger>
          </TabsList>
        </div>
        {[
          { v: "all", list: filtered },
          { v: "expiring", list: expiringSoon },
          { v: "expired", list: expired },
        ].map((tab) => (
          <TabsContent key={tab.v} value={tab.v} className="space-y-2 mt-4">
            <QueryState
              loading={isLoading}
              error={contractsQuery.error}
              onRetry={() => contractsQuery.refetch()}
              errorTitle="The contracts could not be loaded"
              isEmpty={!tab.list.length}
              empty={{
                icon: FileText,
                title:
                  tab.v === "expiring"
                    ? "No contract falls due in the next 60 days"
                    : tab.v === "expired"
                      ? "No contract has run past its end date"
                      : search
                        ? "Nothing matches that search"
                        : "No contracts recorded yet",
                description:
                  tab.v === "all"
                    ? search
                      ? "Search by the member of staff's name, their position, their department or the reference number."
                      : 'Add the first one with "New Contract" — it prints on the school\'s own letterhead.'
                    : "Contracts appear here as their end dates approach, so a renewal is never missed.",
              }}
            >
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
            </QueryState>
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
                  <Button size="sm" variant="outline" disabled={!!producing} onClick={() => produceLetter("share", viewing)}>
                    {producing === "share" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />}WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!producing} onClick={() => produceLetter("download", viewing)}>
                    {producing === "download" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}Download PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!producing} onClick={() => produceLetter("print", viewing)}>
                    {producing === "print" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}Print
                  </Button>
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
