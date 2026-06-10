import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2, Receipt, Settings as SettingsIcon, Wallet, FileText, Users as UsersIcon, CreditCard, Send, BarChart3, Search, X } from "lucide-react";
import { FeesAnalyticsTab } from "@/components/fees/FeesAnalyticsTab";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";

type ClassRow = { id: string; name: string };
type SectionRow = { id: string; name: string; class_id: string };
type StudentRow = { id: string; first_name: string; last_name: string | null; class_section_id?: string | null; parent_phone?: string | null; parent_email?: string | null };
type FeePlanRow = { id: string; name: string; class_id: string | null; billing_frequency: string; currency: string | null; is_active: boolean | null; school_year: string | null };
type FeePlanItem = { id: string; fee_plan_id: string; label: string; category: string; amount: number; sort_order: number };
type StudentAssignment = { id: string; student_id: string; fee_plan_id: string; discount_pct: number; scholarship_amount: number };
type FeeInvoice = { id: string; invoice_number: string; student_id: string; fee_plan_id: string | null; period_label: string | null; due_date: string; total_amount: number; paid_amount: number; status: string; created_at: string };
type FeePayment = { id: string; invoice_id: string; student_id: string; amount: number; method: string; transaction_ref: string | null; paid_at: string; status: string };
type FeeSettings = { id?: string; sibling_discount_2nd_pct: number; sibling_discount_3rd_plus_pct: number; late_fee_enabled: boolean; late_fee_amount: number; late_fee_grace_days: number; invoice_prefix: string; currency: string; bank_name?: string | null; bank_account_title?: string | null; bank_account_number?: string | null; bank_iban?: string | null; bank_branch?: string | null; bank_swift?: string | null; voucher_footer_note?: string | null };

const CATEGORIES = ["tuition", "admission", "transport", "exam", "uniform", "books", "lab", "sports", "library", "other"];

export default function FeesAdvancedModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  const perms = useSchoolPermissions(schoolId);
  const canManage = !perms.loading && perms.canManageFinance;

  const [tab, setTab] = useState("plans");

  // shared lookups
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  // settings
  const [settings, setSettings] = useState<FeeSettings>({
    sibling_discount_2nd_pct: 10, sibling_discount_3rd_plus_pct: 15,
    late_fee_enabled: false, late_fee_amount: 0, late_fee_grace_days: 7,
    invoice_prefix: "INV", currency: "PKR",
  });

  // plans
  const [plans, setPlans] = useState<FeePlanRow[]>([]);
  const [items, setItems] = useState<FeePlanItem[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({ name: "", class_id: "", school_year: new Date().getFullYear().toString(), billing_frequency: "monthly" });
  const [newItem, setNewItem] = useState({ label: "", category: "tuition", amount: "" });

  // assignments
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [assignFilterClass, setAssignFilterClass] = useState<string>("__all");
  const [assignSearch, setAssignSearch] = useState("");

  // invoices
  const [invoices, setInvoices] = useState<FeeInvoice[]>([]);
  const [invFilterStatus, setInvFilterStatus] = useState<string>("__all");
  const [invFilterClass, setInvFilterClass] = useState<string>("__all");
  const [invSearch, setInvSearch] = useState("");
  const [invFromDate, setInvFromDate] = useState("");
  const [invToDate, setInvToDate] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genForm, setGenForm] = useState({ class_id: "", fee_plan_id: "", period_label: format(new Date(), "MMMM yyyy"), due_date: format(new Date(Date.now() + 15 * 86400000), "yyyy-MM-dd") });

  // payments
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [paySearch, setPaySearch] = useState("");
  const [payMethod, setPayMethod] = useState("__all");
  const [payFromDate, setPayFromDate] = useState("");
  const [payToDate, setPayToDate] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ invoice_id: "", amount: "", method: "cash", transaction_ref: "", notes: "" });

  // ---------- LOAD ----------
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      const [cRes, sRes, stRes, settRes, pRes, iRes, aRes, invRes, payRes] = await Promise.all([
        supabase.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId).order("name"),
        supabase.from("students").select("id, first_name, last_name, parent_phone, parent_email").eq("school_id", schoolId).order("first_name").limit(2000),
        supabase.from("fee_settings").select("*").eq("school_id", schoolId).maybeSingle(),
        supabase.from("fee_plans").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }),
        supabase.from("fee_plan_items").select("*").eq("school_id", schoolId),
        supabase.from("student_fee_assignments").select("id, student_id, fee_plan_id, discount_pct, scholarship_amount").eq("school_id", schoolId),
        supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500),
        supabase.from("fee_payments").select("*").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(500),
      ]);
      setClasses((cRes.data as ClassRow[]) || []);
      setSections((sRes.data as SectionRow[]) || []);
      setStudents((stRes.data as StudentRow[]) || []);
      if (settRes.data) setSettings(settRes.data as any);
      setPlans((pRes.data as FeePlanRow[]) || []);
      setItems((iRes.data as FeePlanItem[]) || []);
      setAssignments((aRes.data as StudentAssignment[]) || []);
      setInvoices((invRes.data as FeeInvoice[]) || []);
      setPayments((payRes.data as FeePayment[]) || []);
    })();
  }, [schoolId]);

  // realtime
  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase
      .channel(`fees-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_invoices", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500);
        setInvoices((data as FeeInvoice[]) || []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_payments", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("fee_payments").select("*").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(500);
        setPayments((data as FeePayment[]) || []);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId]);

  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const plansById = useMemo(() => Object.fromEntries(plans.map(p => [p.id, p])), [plans]);
  const planItems = useMemo(() => items.filter(i => i.fee_plan_id === selectedPlanId).sort((a, b) => a.sort_order - b.sort_order), [items, selectedPlanId]);
  const planSubtotal = useMemo(() => planItems.reduce((s, i) => s + Number(i.amount), 0), [planItems]);

  // ---------- SETTINGS ----------
  const saveSettings = async () => {
    if (!schoolId) return;
    const payload = { ...settings, school_id: schoolId };
    const { error } = await supabase.from("fee_settings").upsert(payload as any, { onConflict: "school_id" });
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  // ---------- PLANS ----------
  const createPlan = async () => {
    if (!schoolId || !newPlan.name) return toast.error("Name required");
    const { data, error } = await supabase.from("fee_plans").insert({
      school_id: schoolId, name: newPlan.name, class_id: newPlan.class_id || null,
      school_year: newPlan.school_year || null, billing_frequency: newPlan.billing_frequency as any,
      currency: settings.currency, is_active: true,
    }).select("*").single();
    if (error) return toast.error(error.message);
    setPlans([data as FeePlanRow, ...plans]);
    setNewPlan({ name: "", class_id: "", school_year: new Date().getFullYear().toString(), billing_frequency: "monthly" });
    setSelectedPlanId(data.id);
    toast.success("Plan created");
  };

  const togglePlanActive = async (p: FeePlanRow) => {
    const { error } = await supabase.from("fee_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setPlans(plans.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Delete this plan and all its items?")) return;
    const { error } = await supabase.from("fee_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setPlans(plans.filter(p => p.id !== id));
    if (selectedPlanId === id) setSelectedPlanId(null);
  };

  const addItem = async () => {
    if (!schoolId || !selectedPlanId || !newItem.label || !newItem.amount) return toast.error("Label and amount required");
    const { data, error } = await supabase.from("fee_plan_items").insert({
      school_id: schoolId, fee_plan_id: selectedPlanId, label: newItem.label,
      category: newItem.category as any, amount: Number(newItem.amount), sort_order: planItems.length,
    }).select("*").single();
    if (error) return toast.error(error.message);
    setItems([...items, data as FeePlanItem]);
    setNewItem({ label: "", category: "tuition", amount: "" });
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("fee_plan_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems(items.filter(i => i.id !== id));
  };

  // ---------- ASSIGNMENTS ----------
  const studentsForFilter = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    let list = students;
    if (assignFilterClass !== "__all") {
      const sectionIds = sections.filter(s => s.class_id === assignFilterClass).map(s => s.id);
      list = list.filter(s => sectionIds.includes((s as any).class_section_id));
    }
    if (q) list = list.filter(s => `${s.first_name} ${s.last_name || ""}`.toLowerCase().includes(q) || (s.parent_email || "").toLowerCase().includes(q) || (s.parent_phone || "").toLowerCase().includes(q));
    return list;
  }, [students, sections, assignFilterClass, assignSearch]);

  const setStudentAssignment = async (studentId: string, planId: string | null, opts?: { discount_pct?: number; scholarship_amount?: number }) => {
    if (!schoolId) return;
    const existing = assignments.find(a => a.student_id === studentId);
    if (!planId) {
      if (existing) {
        await supabase.from("student_fee_assignments").delete().eq("id", existing.id);
        setAssignments(assignments.filter(a => a.id !== existing.id));
      }
      return;
    }
    const payload = {
      school_id: schoolId, student_id: studentId, fee_plan_id: planId,
      discount_pct: opts?.discount_pct ?? existing?.discount_pct ?? 0,
      scholarship_amount: opts?.scholarship_amount ?? existing?.scholarship_amount ?? 0,
    };
    if (existing) {
      const { data, error } = await supabase.from("student_fee_assignments").update(payload).eq("id", existing.id).select("*").single();
      if (error) return toast.error(error.message);
      setAssignments(assignments.map(a => a.id === existing.id ? (data as any) : a));
    } else {
      const { data, error } = await supabase.from("student_fee_assignments").insert(payload).select("*").single();
      if (error) return toast.error(error.message);
      setAssignments([...assignments, data as any]);
    }
  };

  // ---------- INVOICES ----------
  const generateBatchInvoices = async () => {
    if (!schoolId || !genForm.class_id || !genForm.fee_plan_id) return toast.error("Select class & plan");
    const sectionIds = sections.filter(s => s.class_id === genForm.class_id).map(s => s.id);
    const { data: enrolls } = await supabase.from("student_enrollments").select("student_id").eq("school_id", schoolId).is("end_date", null).in("class_section_id", sectionIds);
    const studentIds = Array.from(new Set((enrolls || []).map((e: any) => e.student_id)));
    if (studentIds.length === 0) return toast.error("No enrolled students for this class");

    let success = 0, failed = 0;
    for (const sid of studentIds) {
      const { error } = await supabase.rpc("generate_invoice_for_student", {
        _school_id: schoolId, _student_id: sid, _fee_plan_id: genForm.fee_plan_id,
        _period_label: genForm.period_label, _due_date: genForm.due_date,
      });
      if (error) failed++; else success++;
    }
    toast.success(`Generated ${success} invoice(s)${failed ? ` (${failed} failed)` : ""}`);
    setGenerateOpen(false);
    const { data } = await supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500);
    setInvoices((data as FeeInvoice[]) || []);
  };

  const sectionToClass = useMemo(() => Object.fromEntries(sections.map(s => [s.id, s.class_id])), [sections]);
  const filteredInvoices = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return invoices.filter(i => {
      if (invFilterStatus !== "__all" && i.status !== invFilterStatus) return false;
      if (invFilterClass !== "__all") {
        const st = studentsById[i.student_id];
        const cid = st ? sectionToClass[(st as any).class_section_id] : null;
        if (cid !== invFilterClass) return false;
      }
      if (invFromDate && i.due_date < invFromDate) return false;
      if (invToDate && i.due_date > invToDate) return false;
      if (q) {
        const st = studentsById[i.student_id];
        const name = st ? `${st.first_name} ${st.last_name || ""}`.toLowerCase() : "";
        const hay = `${i.invoice_number} ${name} ${i.period_label || ""} ${i.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, invFilterStatus, invFilterClass, invSearch, invFromDate, invToDate, studentsById, sectionToClass]);

  const filteredPayments = useMemo(() => {
    const q = paySearch.trim().toLowerCase();
    return payments.filter(p => {
      if (payMethod !== "__all" && p.method !== payMethod) return false;
      const day = (p.paid_at || "").slice(0, 10);
      if (payFromDate && day < payFromDate) return false;
      if (payToDate && day > payToDate) return false;
      if (q) {
        const st = studentsById[p.student_id];
        const name = st ? `${st.first_name} ${st.last_name || ""}`.toLowerCase() : "";
        const inv = invoices.find(i => i.id === p.invoice_id);
        const hay = `${name} ${inv?.invoice_number || ""} ${p.transaction_ref || ""} ${p.method} ${p.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payments, paySearch, payMethod, payFromDate, payToDate, studentsById, invoices]);

  // ---------- PAYMENTS ----------
  const recordPayment = async () => {
    if (!schoolId || !payForm.invoice_id || !payForm.amount) return toast.error("Invoice and amount required");
    const inv = invoices.find(i => i.id === payForm.invoice_id);
    if (!inv) return toast.error("Invoice not found");
    const { error } = await supabase.from("fee_payments").insert({
      school_id: schoolId, invoice_id: inv.id, student_id: inv.student_id,
      amount: Number(payForm.amount), method: payForm.method as any, status: "success",
      transaction_ref: payForm.transaction_ref || null, notes: payForm.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    setPayOpen(false);
    setPayForm({ invoice_id: "", amount: "", method: "cash", transaction_ref: "", notes: "" });
  };

  const statusVariant = (s: string): any => s === "paid" ? "default" : s === "overdue" ? "destructive" : s === "partial" ? "secondary" : "outline";
  const studentName = (sid: string) => { const s = studentsById[sid]; return s ? `${s.first_name} ${s.last_name || ""}`.trim() : sid.slice(0, 8); };

  if (!schoolId) return <div className="p-6 text-muted-foreground">Loading school…</div>;
  if (!canManage) return <div className="p-6 text-muted-foreground">You do not have access to fee management.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Fees</h1>
        <p className="text-muted-foreground">Manage fee plans, student assignments, invoices, and payments.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-4xl">
          <TabsTrigger value="plans"><Wallet className="h-4 w-4 mr-1" />Plans</TabsTrigger>
          <TabsTrigger value="assignments"><UsersIcon className="h-4 w-4 mr-1" />Assignments</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="h-4 w-4 mr-1" />Invoices</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-1" />Payments</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" />Settings</TabsTrigger>
        </TabsList>

        {/* PLANS */}
        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Create Fee Plan</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input placeholder="Plan name (e.g. Class 5 Monthly)" value={newPlan.name} onChange={e => setNewPlan({ ...newPlan, name: e.target.value })} />
              <Select value={newPlan.class_id || "__none"} onValueChange={v => setNewPlan({ ...newPlan, class_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Class (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No class —</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="School year" value={newPlan.school_year} onChange={e => setNewPlan({ ...newPlan, school_year: e.target.value })} />
              <Select value={newPlan.billing_frequency} onValueChange={v => setNewPlan({ ...newPlan, billing_frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="one_time">One-time</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={createPlan}><Plus className="h-4 w-4 mr-1" />Create</Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle>Plans ({plans.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-[500px] overflow-auto">
                {plans.length === 0 && <p className="text-sm text-muted-foreground">No plans yet</p>}
                {plans.map(p => (
                  <div key={p.id} className={`p-3 rounded-lg border cursor-pointer ${selectedPlanId === p.id ? "bg-primary/10 border-primary" : "hover:bg-muted/50"}`} onClick={() => setSelectedPlanId(p.id)}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.class_id ? classes.find(c => c.id === p.class_id)?.name : "All classes"} · {p.billing_frequency}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.is_active ? "default" : "outline"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); togglePlanActive(p); }}>
                        {p.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deletePlan(p.id); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Plan Items {selectedPlanId && plansById[selectedPlanId] ? `— ${plansById[selectedPlanId].name}` : ""}</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedPlanId ? (
                  <p className="text-sm text-muted-foreground">Select a plan to manage its items.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
                      <Input placeholder="Label (e.g. Tuition)" value={newItem.label} onChange={e => setNewItem({ ...newItem, label: e.target.value })} />
                      <Select value={newItem.category} onValueChange={v => setNewItem({ ...newItem, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" placeholder="Amount" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} />
                      <Button onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add</Button>
                    </div>
                    <Table>
                      <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {planItems.map(it => (
                          <TableRow key={it.id}>
                            <TableCell>{it.label}</TableCell>
                            <TableCell><Badge variant="outline">{it.category}</Badge></TableCell>
                            <TableCell className="text-right">{settings.currency} {Number(it.amount).toLocaleString()}</TableCell>
                            <TableCell><Button size="sm" variant="ghost" onClick={() => removeItem(it.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                          </TableRow>
                        ))}
                        {planItems.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={2} className="font-semibold">Subtotal</TableCell>
                            <TableCell className="text-right font-semibold">{settings.currency} {planSubtotal.toLocaleString()}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Per-Student Plan Assignments & Overrides</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Search students by name, parent email/phone…" className="pl-8 pr-8" />
                  {assignSearch && (
                    <button type="button" onClick={() => setAssignSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={assignFilterClass} onValueChange={setAssignFilterClass}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filter by class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All classes</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Plan</TableHead><TableHead>Discount %</TableHead><TableHead>Scholarship</TableHead></TableRow></TableHeader>
                <TableBody>
                  {studentsForFilter.slice(0, 200).map(st => {
                    const a = assignments.find(x => x.student_id === st.id);
                    return (
                      <TableRow key={st.id}>
                        <TableCell>{st.first_name} {st.last_name || ""}</TableCell>
                        <TableCell>
                          <Select value={a?.fee_plan_id || "__none"} onValueChange={v => setStudentAssignment(st.id, v === "__none" ? null : v)}>
                            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Assign plan" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— No plan —</SelectItem>
                              {plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="w-24" disabled={!a} value={a?.discount_pct ?? 0}
                            onChange={e => setStudentAssignment(st.id, a!.fee_plan_id, { discount_pct: Number(e.target.value) })} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" className="w-32" disabled={!a} value={a?.scholarship_amount ?? 0}
                            onChange={e => setStudentAssignment(st.id, a!.fee_plan_id, { scholarship_amount: Number(e.target.value) })} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {studentsForFilter.length > 200 && <p className="text-xs text-muted-foreground">Showing first 200 — narrow by class for full list.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVOICES */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Invoices ({filteredInvoices.length})</CardTitle>
              <div className="flex gap-2">
                <Select value={invFilterStatus} onValueChange={setInvFilterStatus}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
                  <DialogTrigger asChild><Button><Send className="h-4 w-4 mr-1" />Generate Invoices</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Generate invoices for a class</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Class</Label>
                        <Select value={genForm.class_id} onValueChange={v => setGenForm({ ...genForm, class_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                          <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Fee Plan</Label>
                        <Select value={genForm.fee_plan_id} onValueChange={v => setGenForm({ ...genForm, fee_plan_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                          <SelectContent>
                            {plans.filter(p => p.is_active && (!genForm.class_id || !p.class_id || p.class_id === genForm.class_id))
                              .map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Period label</Label><Input value={genForm.period_label} onChange={e => setGenForm({ ...genForm, period_label: e.target.value })} /></div>
                      <div><Label>Due date</Label><Input type="date" value={genForm.due_date} onChange={e => setGenForm({ ...genForm, due_date: e.target.value })} /></div>
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button><Button onClick={generateBatchInvoices}>Generate</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Search invoice #, student, period…" className="pl-8 pr-8" />
                  {invSearch && (
                    <button type="button" onClick={() => setInvSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={invFilterClass} onValueChange={setInvFilterClass}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All classes</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">Due from</Label>
                  <Input type="date" className="w-[150px]" value={invFromDate} onChange={e => setInvFromDate(e.target.value)} />
                  <Label className="text-xs text-muted-foreground">to</Label>
                  <Input type="date" className="w-[150px]" value={invToDate} onChange={e => setInvToDate(e.target.value)} />
                </div>
                {(invSearch || invFilterClass !== "__all" || invFromDate || invToDate || invFilterStatus !== "__all") && (
                  <Button size="sm" variant="ghost" onClick={() => { setInvSearch(""); setInvFilterClass("__all"); setInvFromDate(""); setInvToDate(""); setInvFilterStatus("__all"); }}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Invoice #</TableHead><TableHead>Student</TableHead><TableHead>Period</TableHead>
                  <TableHead>Due</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredInvoices.slice(0, 200).map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>{studentName(inv.student_id)}</TableCell>
                      <TableCell>{inv.period_label || "—"}</TableCell>
                      <TableCell>{format(new Date(inv.due_date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">{settings.currency} {Number(inv.total_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{settings.currency} {Number(inv.paid_amount).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={statusVariant(inv.status)}>{inv.status}</Badge></TableCell>
                      <TableCell>
                        {inv.status !== "paid" && (
                          <Button size="sm" variant="outline" onClick={() => { setPayForm({ invoice_id: inv.id, amount: String(inv.total_amount - inv.paid_amount), method: "cash", transaction_ref: "", notes: "" }); setPayOpen(true); }}>
                            <Receipt className="h-3 w-3 mr-1" />Record Payment
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Payments ({filteredPayments.length})</CardTitle>
              <Button onClick={() => setPayOpen(true)}><Plus className="h-4 w-4 mr-1" />Record Payment</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={paySearch} onChange={e => setPaySearch(e.target.value)} placeholder="Search student, invoice #, reference…" className="pl-8 pr-8" />
                  {paySearch && (
                    <button type="button" onClick={() => setPaySearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All methods</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="jazzcash">JazzCash</SelectItem>
                    <SelectItem value="easypaisa">Easypaisa</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input type="date" className="w-[150px]" value={payFromDate} onChange={e => setPayFromDate(e.target.value)} />
                  <Label className="text-xs text-muted-foreground">to</Label>
                  <Input type="date" className="w-[150px]" value={payToDate} onChange={e => setPayToDate(e.target.value)} />
                </div>
                {(paySearch || payMethod !== "__all" || payFromDate || payToDate) && (
                  <Button size="sm" variant="ghost" onClick={() => { setPaySearch(""); setPayMethod("__all"); setPayFromDate(""); setPayToDate(""); }}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredPayments.slice(0, 200).map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{format(new Date(p.paid_at), "MMM d, yyyy")}</TableCell>
                      <TableCell>{studentName(p.student_id)}</TableCell>
                      <TableCell>{invoices.find(i => i.id === p.invoice_id)?.invoice_number || p.invoice_id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right">{settings.currency} {Number(p.amount).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                      <TableCell className="text-xs">{p.transaction_ref || "—"}</TableCell>
                      <TableCell><Badge variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ANALYTICS */}
        <TabsContent value="analytics" className="space-y-4">
          <FeesAnalyticsTab
            schoolId={schoolId}
            currency={settings.currency}
            invoices={invoices as any}
            payments={payments as any}
            students={students as any}
            onRefresh={async () => {
              const [invRes, payRes] = await Promise.all([
                supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500),
                supabase.from("fee_payments").select("*").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(500),
              ]);
              setInvoices((invRes.data as FeeInvoice[]) || []);
              setPayments((payRes.data as FeePayment[]) || []);
            }}
          />
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Fee Settings</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Currency</Label><Input value={settings.currency} onChange={e => setSettings({ ...settings, currency: e.target.value })} /></div>
              <div><Label>Invoice prefix</Label><Input value={settings.invoice_prefix} onChange={e => setSettings({ ...settings, invoice_prefix: e.target.value })} /></div>
              <div><Label>Sibling discount (2nd child) %</Label><Input type="number" value={settings.sibling_discount_2nd_pct} onChange={e => setSettings({ ...settings, sibling_discount_2nd_pct: Number(e.target.value) })} /></div>
              <div><Label>Sibling discount (3rd+ child) %</Label><Input type="number" value={settings.sibling_discount_3rd_plus_pct} onChange={e => setSettings({ ...settings, sibling_discount_3rd_plus_pct: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-3"><Switch checked={settings.late_fee_enabled} onCheckedChange={v => setSettings({ ...settings, late_fee_enabled: v })} /><Label>Enable late fees</Label></div>
              <div><Label>Late fee amount</Label><Input type="number" value={settings.late_fee_amount} onChange={e => setSettings({ ...settings, late_fee_amount: Number(e.target.value) })} /></div>
              <div><Label>Grace days</Label><Input type="number" value={settings.late_fee_grace_days} onChange={e => setSettings({ ...settings, late_fee_grace_days: Number(e.target.value) })} /></div>
              <div className="md:col-span-2 pt-2 border-t mt-2">
                <h4 className="font-semibold text-sm mb-2">Bank Details (printed on every fee voucher)</h4>
              </div>
              <div><Label>Bank name</Label><Input value={settings.bank_name ?? ""} onChange={e => setSettings({ ...settings, bank_name: e.target.value })} /></div>
              <div><Label>Branch</Label><Input value={settings.bank_branch ?? ""} onChange={e => setSettings({ ...settings, bank_branch: e.target.value })} /></div>
              <div><Label>Account title</Label><Input value={settings.bank_account_title ?? ""} onChange={e => setSettings({ ...settings, bank_account_title: e.target.value })} /></div>
              <div><Label>Account number</Label><Input value={settings.bank_account_number ?? ""} onChange={e => setSettings({ ...settings, bank_account_number: e.target.value })} /></div>
              <div><Label>IBAN</Label><Input value={settings.bank_iban ?? ""} onChange={e => setSettings({ ...settings, bank_iban: e.target.value })} /></div>
              <div><Label>SWIFT</Label><Input value={settings.bank_swift ?? ""} onChange={e => setSettings({ ...settings, bank_swift: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Voucher footer note</Label><Input value={settings.voucher_footer_note ?? ""} onChange={e => setSettings({ ...settings, voucher_footer_note: e.target.value })} placeholder="e.g. Pay before due date. Late fee applies after grace period." /></div>
              <div className="md:col-span-2"><Button onClick={saveSettings}>Save settings</Button></div>
            </CardContent>
          </Card>

          <JazzCashSettingsCard schoolId={schoolId} />
          <EasypaisaSettingsCard schoolId={schoolId} />
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Invoice</Label>
              <Select value={payForm.invoice_id} onValueChange={v => setPayForm({ ...payForm, invoice_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent>
                  {invoices.filter(i => i.status !== "paid").slice(0, 100).map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.invoice_number} — {studentName(i.student_id)} (due {Number(i.total_amount - i.paid_amount).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div><Label>Method</Label>
              <Select value={payForm.method} onValueChange={v => setPayForm({ ...payForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="jazzcash">JazzCash</SelectItem>
                  <SelectItem value="easypaisa">Easypaisa</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={payForm.transaction_ref} onChange={e => setPayForm({ ...payForm, transaction_ref: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button><Button onClick={recordPayment}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- JazzCash settings ----------------
function JazzCashSettingsCard({ schoolId }: { schoolId: string }) {
  const [s, setS] = useState({ is_enabled: false, environment: "sandbox" as "sandbox" | "production", merchant_id: "", merchant_password: "", integrity_salt: "", return_url: "" });
  useEffect(() => {
    if (!schoolId) return;
    supabase.from("jazzcash_settings").select("*").eq("school_id", schoolId).maybeSingle().then(({ data }) => { if (data) setS(data as any); });
  }, [schoolId]);
  const save = async () => {
    const { error } = await supabase.from("jazzcash_settings").upsert({ ...s, school_id: schoolId } as any, { onConflict: "school_id" });
    if (error) return toast.error(error.message);
    toast.success("JazzCash settings saved");
  };
  return (
    <Card>
      <CardHeader><CardTitle>JazzCash (Hosted Checkout)</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-3"><Switch checked={s.is_enabled} onCheckedChange={v => setS({ ...s, is_enabled: v })} /><Label>Enable JazzCash payments</Label></div>
        <div><Label>Environment</Label>
          <Select value={s.environment} onValueChange={v => setS({ ...s, environment: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="production">Production</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Merchant ID</Label><Input value={s.merchant_id || ""} onChange={e => setS({ ...s, merchant_id: e.target.value })} /></div>
        <div><Label>Merchant Password</Label><Input type="password" value={s.merchant_password || ""} onChange={e => setS({ ...s, merchant_password: e.target.value })} /></div>
        <div><Label>Integrity Salt</Label><Input type="password" value={s.integrity_salt || ""} onChange={e => setS({ ...s, integrity_salt: e.target.value })} /></div>
        <div><Label>Return URL (optional)</Label><Input value={s.return_url || ""} onChange={e => setS({ ...s, return_url: e.target.value })} placeholder="https://your-app/return" /></div>
        <div className="md:col-span-2"><Button onClick={save}>Save JazzCash settings</Button></div>
      </CardContent>
    </Card>
  );
}

// ---------------- Easypaisa settings ----------------
function EasypaisaSettingsCard({ schoolId }: { schoolId: string }) {
  const [s, setS] = useState({ is_enabled: false, environment: "sandbox" as "sandbox" | "live", store_id: "", hash_key: "", account_number: "", return_url: "" });
  useEffect(() => {
    if (!schoolId) return;
    supabase.from("easypaisa_settings").select("*").eq("school_id", schoolId).maybeSingle().then(({ data }) => { if (data) setS(data as any); });
  }, [schoolId]);
  const save = async () => {
    const { error } = await supabase.from("easypaisa_settings").upsert({ ...s, school_id: schoolId } as any, { onConflict: "school_id" });
    if (error) return toast.error(error.message);
    toast.success("Easypaisa settings saved");
  };
  return (
    <Card>
      <CardHeader><CardTitle>Easypaisa (Hosted Checkout)</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center gap-3"><Switch checked={s.is_enabled} onCheckedChange={v => setS({ ...s, is_enabled: v })} /><Label>Enable Easypaisa payments</Label></div>
        <div><Label>Environment</Label>
          <Select value={s.environment} onValueChange={v => setS({ ...s, environment: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Store ID</Label><Input value={s.store_id || ""} onChange={e => setS({ ...s, store_id: e.target.value })} placeholder="e.g. 12345" /></div>
        <div><Label>Hash Key</Label><Input type="password" value={s.hash_key || ""} onChange={e => setS({ ...s, hash_key: e.target.value })} /></div>
        <div><Label>Merchant Mobile Account #</Label><Input value={s.account_number || ""} onChange={e => setS({ ...s, account_number: e.target.value })} placeholder="03xxxxxxxxx" /></div>
        <div><Label>Return URL (optional)</Label><Input value={s.return_url || ""} onChange={e => setS({ ...s, return_url: e.target.value })} placeholder="https://your-app/return" /></div>
        <div className="md:col-span-2"><Button onClick={save}>Save Easypaisa settings</Button></div>
      </CardContent>
    </Card>
  );
}
