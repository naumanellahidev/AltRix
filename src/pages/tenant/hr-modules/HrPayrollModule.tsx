import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Lock, CheckCircle2, Wallet, DollarSign, TrendingDown } from "lucide-react";
import { format } from "date-fns";

type Run = {
  id: string; period_year: number; period_month: number; label: string | null;
  status: string; total_gross: number; total_deductions: number; total_net: number;
  generated_at: string | null; paid_at: string | null;
};
type Slip = {
  id: string; run_id: string; employee_user_id: string; basic: number;
  earnings: number; deductions: number; tax: number; bonus: number;
  gross: number; net: number; status: string; breakdown: any;
};
type Comp = { id: string; name: string; kind: string; calc_type: string; default_value: number };
type EmpStruct = { id: string; employee_user_id: string; component_id: string; amount: number };
type Staff = { user_id: string; display_name: string | null; email: string };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function HrPayrollModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const [runs, setRuns] = useState<Run[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [structs, setStructs] = useState<EmpStruct[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    const [r, c, st, s] = await Promise.all([
      (supabase as any).from("hr_payroll_runs").select("*").eq("school_id", schoolId).order("period_year", { ascending: false }).order("period_month", { ascending: false }),
      (supabase as any).from("hr_salary_components").select("*").eq("school_id", schoolId).eq("is_active", true).order("sort_order"),
      (supabase as any).from("hr_employee_salary_structure").select("*").eq("school_id", schoolId),
      (supabase as any).rpc("get_school_staff_directory", { _school_id: schoolId }),
    ]);
    if (r.data) setRuns(r.data);
    if (c.data) setComps(c.data);
    if (st.data) setStructs(st.data);
    if (s.data) setStaff(s.data);
  }, [schoolId]);

  const loadSlips = useCallback(async (runId: string) => {
    const { data } = await (supabase as any).from("hr_payslips").select("*").eq("run_id", runId);
    setSlips(data || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (activeRun) loadSlips(activeRun); }, [activeRun, loadSlips]);

  if (!schoolId) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const ytd = runs.filter(r => r.status === "paid" && r.period_year === new Date().getFullYear())
    .reduce((s, r) => s + Number(r.total_net), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Payroll Runs</h2>
        <p className="text-sm text-muted-foreground">Generate, approve and pay monthly payroll.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total runs" value={String(runs.length)} icon={Wallet} />
        <KPI label="Paid YTD" value={ytd.toLocaleString()} icon={DollarSign} tone="success" />
        <KPI label="Draft" value={String(runs.filter(r => r.status === "draft").length)} icon={TrendingDown} />
        <KPI label="Components" value={String(comps.length)} icon={Wallet} />
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="components">Salary Components</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-4 space-y-4">
          <RunsTab runs={runs} schoolId={schoolId} staff={staff} structs={structs} comps={comps} onChange={refresh} onSelect={setActiveRun} activeRun={activeRun} slips={slips} reloadSlips={() => activeRun && loadSlips(activeRun)} />
        </TabsContent>

        <TabsContent value="components" className="mt-4">
          <ComponentsTab comps={comps} schoolId={schoolId} onChange={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, icon: Icon, tone }: any) {
  return (
    <Card><CardContent className="p-4 flex justify-between items-center">
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold mt-1">{value}</p></div>
      <Icon className={`h-5 w-5 ${tone === "success" ? "text-emerald-600" : "text-primary"}`} />
    </CardContent></Card>
  );
}

function RunsTab({ runs, schoolId, staff, structs, comps, onChange, onSelect, activeRun, slips, reloadSlips }: any) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [form, setForm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1, label: "" });

  const createRun = async () => {
    const { data: run, error } = await (supabase as any).from("hr_payroll_runs").insert({
      school_id: schoolId, period_year: form.year, period_month: form.month,
      label: form.label || `${MONTHS[form.month - 1]} ${form.year}`, status: "draft",
    }).select().single();
    if (error || !run) { toast.error(error?.message || "Failed"); return; }

    // Generate payslips for every employee that has a salary structure
    const empIds = Array.from(new Set(structs.map((s: EmpStruct) => s.employee_user_id)));
    let totalGross = 0, totalDed = 0, totalNet = 0;
    const payslipRows = empIds.map((empId: any) => {
      const myStructs = structs.filter((s: EmpStruct) => s.employee_user_id === empId);
      let basic = 0, earnings = 0, deductions = 0;
      const breakdown: Record<string, number> = {};
      for (const s of myStructs) {
        const c = comps.find((x: Comp) => x.id === s.component_id);
        if (!c) continue;
        const amt = Number(s.amount);
        breakdown[c.name] = amt;
        if (c.kind === "earning") {
          earnings += amt;
          if (c.name.toLowerCase() === "basic") basic = amt;
        } else {
          deductions += amt;
        }
      }
      const gross = earnings;
      const net = gross - deductions;
      totalGross += gross; totalDed += deductions; totalNet += net;
      return {
        school_id: schoolId, run_id: run.id, employee_user_id: empId,
        basic, earnings, deductions, tax: 0, bonus: 0, gross, net, breakdown,
      };
    });
    if (payslipRows.length) await (supabase as any).from("hr_payslips").insert(payslipRows);
    await (supabase as any).from("hr_payroll_runs").update({
      generated_at: new Date().toISOString(),
      total_gross: totalGross, total_deductions: totalDed, total_net: totalNet,
    }).eq("id", run.id);

    toast.success(`Run created with ${payslipRows.length} payslips`);
    setOpen(false); onChange();
  };

  const setStatus = async (id: string, status: string) => {
    const upd: any = { status };
    if (status === "locked") upd.approved_at = new Date().toISOString();
    if (status === "paid") upd.paid_at = new Date().toISOString();
    const { error } = await (supabase as any).from("hr_payroll_runs").update(upd).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(`Run ${status}`); onChange(); }
  };

  return (
    <>
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Run</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Year</Label><Input type="number" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></div>
                <div><Label>Month</Label>
                  <Select value={String(form.month)} onValueChange={v => setForm({ ...form, month: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Label (optional)</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Payslips will auto-generate from every employee's salary structure.</p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={createRun}>Generate</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {runs.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No payroll runs yet.</CardContent></Card> :
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Period</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.map((r: Run) => (
                <TableRow key={r.id} className={activeRun === r.id ? "bg-muted/50" : ""}>
                  <TableCell className="font-medium">{r.label || `${MONTHS[r.period_month - 1]} ${r.period_year}`}</TableCell>
                  <TableCell><Badge variant={r.status === "paid" ? "default" : r.status === "locked" ? "secondary" : "outline"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">{Number(r.total_gross).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{Number(r.total_deductions).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-semibold">{Number(r.total_net).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onSelect(activeRun === r.id ? null : r.id)}>View</Button>
                      {r.status === "draft" && <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "locked")}><Lock className="h-3 w-3" /></Button>}
                      {r.status === "locked" && <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "paid")}><CheckCircle2 className="h-3 w-3" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      }

      {activeRun && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Payslips ({slips.length})</h3>
            {slips.length === 0 ? <p className="text-sm text-muted-foreground">No payslips. Make sure employees have salary structures.</p> :
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {slips.map((p: Slip) => (
                    <TableRow key={p.id}>
                      <TableCell>{staff.find((s: Staff) => s.user_id === p.employee_user_id)?.display_name || "—"}</TableCell>
                      <TableCell className="text-right">{Number(p.basic).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(p.gross).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(p.deductions).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(p.net).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ComponentsTab({ comps, schoolId, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "earning", calc_type: "fixed", default_value: 0 });

  const add = async () => {
    if (!form.name.trim()) return;
    const { error } = await (supabase as any).from("hr_salary_components").insert({
      school_id: schoolId, name: form.name, kind: form.kind, calc_type: form.calc_type,
      default_value: Number(form.default_value),
    });
    if (error) toast.error(error.message); else { toast.success("Added"); setOpen(false); setForm({ name: "", kind: "earning", calc_type: "fixed", default_value: 0 }); onChange(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Component</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Salary Component</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Basic, HRA, Tax" /></div>
              <div><Label>Kind</Label>
                <Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earning">Earning</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Default Value</Label><Input type="number" value={form.default_value} onChange={e => setForm({ ...form, default_value: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {comps.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No components defined.</CardContent></Card> :
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead className="text-right">Default</TableHead></TableRow></TableHeader>
            <TableBody>
              {comps.map((c: Comp) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><Badge variant={c.kind === "earning" ? "default" : "destructive"}>{c.kind}</Badge></TableCell>
                  <TableCell className="text-right">{Number(c.default_value).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      }
    </div>
  );
}
