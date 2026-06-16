import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { DollarSign, Plus, Receipt, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { 
  useOfflineFeePlans, 
  useOfflineInvoices, 
  useOfflinePayments, 
  useOfflineExpenses,
  useOfflinePaymentMethods,
  useOfflineStudents 
} from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type FeePlanRow = { id: string; name: string; currency: string; is_active: boolean };
type PaymentMethodRow = { id: string; name: string; type: string; is_active: boolean; instructions: string | null };
type InvoiceRow = { id: string; invoice_no: string; student_id: string; total: number; status: string; issue_date: string };
type PaymentRow = { id: string; invoice_id: string; amount: number; paid_at: string; reference: string | null };
type ExpenseRow = { id: string; description: string; amount: number; category: string; expense_date: string };
type StudentPick = { id: string; first_name: string; last_name: string | null };

export function FinanceModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const perms = useSchoolPermissions(schoolId);

  // Offline data hooks
  const offlineFeePlans = useOfflineFeePlans(schoolId);
  const offlineInvoices = useOfflineInvoices(schoolId);
  const offlinePayments = useOfflinePayments(schoolId);
  const offlineExpenses = useOfflineExpenses(schoolId);
  const offlinePaymentMethods = useOfflinePaymentMethods(schoolId);
  const offlineStudents = useOfflineStudents(schoolId);
  
  const isOffline = offlineFeePlans.isOffline;
  const isUsingCache = offlineFeePlans.isUsingCache || offlineInvoices.isUsingCache;

  const [tab, setTab] = useState<"fee_plans" | "payment_methods" | "invoices" | "payments" | "expenses">("fee_plans");

  const [feePlans, setFeePlans] = useState<FeePlanRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [students, setStudents] = useState<StudentPick[]>([]);

  // create fee plan
  const [feePlanName, setFeePlanName] = useState("");
  const [feeCurrency, setFeeCurrency] = useState("PKR");

  // create payment method
  const [pmName, setPmName] = useState("");
  const [pmType, setPmType] = useState("custom");
  const [pmInstructions, setPmInstructions] = useState("");

  // create invoice
  const [invoiceStudentId, setInvoiceStudentId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceTotal, setInvoiceTotal] = useState("0");

  // log payment
  const [payInvoiceId, setPayInvoiceId] = useState<string>("");
  const [payAmount, setPayAmount] = useState("0");
  const [payMethodId, setPayMethodId] = useState<string>("");
  const [payRef, setPayRef] = useState("");

  // create expense
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("0");
  const [expCategory, setExpCategory] = useState("general");

  const refresh = async () => {
    if (!schoolId) return;

    // If offline, use cached data
    if (!navigator.onLine) {
      setFeePlans(offlineFeePlans.data.map(p => ({
        id: p.id, name: p.name, currency: p.currency, is_active: p.isActive
      })));
      setPaymentMethods(offlinePaymentMethods.data.map(m => ({
        id: m.id, name: m.name, type: m.type, is_active: m.isActive, instructions: null
      })));
      setInvoices(offlineInvoices.data.map(i => ({
        id: i.id, invoice_no: i.invoiceNo, student_id: i.studentId, total: i.total, status: i.status, issue_date: i.issueDate
      })));
      setPayments(offlinePayments.data.map(p => ({
        id: p.id, invoice_id: p.invoiceId, amount: p.amount, paid_at: p.paidAt, reference: p.reference
      })));
      setExpenses(offlineExpenses.data.map(e => ({
        id: e.id, description: e.description, amount: e.amount, category: e.category, expense_date: e.expenseDate
      })));
      setStudents(offlineStudents.data.map(s => ({
        id: s.id, first_name: s.firstName, last_name: s.lastName
      })));
      return;
    }

    const [fp, pm, inv, pay, exp, st] = await Promise.all([
      supabase.from("fee_plans").select("id,name,currency,is_active").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
      supabase.from("finance_payment_methods").select("id,name,type,is_active,instructions").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
      supabase.from("finance_invoices").select("id,invoice_no,student_id,total,status,issue_date").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
      supabase.from("finance_payments").select("id,invoice_id,amount,paid_at,reference").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(200),
      supabase.from("finance_expenses").select("id,description,amount,category,expense_date").eq("school_id", schoolId).order("expense_date", { ascending: false }).limit(200),
      supabase.from("students").select("id,first_name,last_name").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(200),
    ]);

    if (fp.error) toast.error(fp.error.message);
    if (pm.error) toast.error(pm.error.message);
    if (inv.error) toast.error(inv.error.message);
    if (pay.error) toast.error(pay.error.message);
    if (exp.error) toast.error(exp.error.message);

    setFeePlans((fp.data ?? []) as any);
    setPaymentMethods((pm.data ?? []) as any);
    setInvoices((inv.data ?? []) as any);
    setPayments((pay.data ?? []) as any);
    setExpenses((exp.data ?? []) as any);
    setStudents((st.data ?? []) as any);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, offlineFeePlans.data, offlineInvoices.data]);

  useEffect(() => {
    if (invoices.length > 0 && !payInvoiceId) setPayInvoiceId(invoices[0].id);
    if (paymentMethods.length > 0 && !payMethodId) setPayMethodId(paymentMethods[0].id);
  }, [invoices, paymentMethods, payInvoiceId, payMethodId]);

  const guard = () => {
    if (perms.loading) return false;
    if (perms.isPlatformSuperAdmin) return true;
    // RLS enforces true access; this is UX gating.
    if (perms.canManageFinance || perms.canManageStaff) return true;
    return false;
  };

  const createFeePlan = async () => {
    if (!schoolId) return;
    if (!feePlanName.trim()) return toast.error("Fee plan name required");
    const { error } = await supabase.from("fee_plans").insert({
      school_id: schoolId,
      name: feePlanName.trim(),
      currency: feeCurrency,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Fee plan created");
    setFeePlanName("");
    await refresh();
  };

  const deleteRow = async (table: string, id: string) => {
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    await refresh();
  };

  const createPaymentMethod = async () => {
    if (!schoolId) return;
    if (!pmName.trim()) return toast.error("Payment method name required");
    const { error } = await supabase.from("finance_payment_methods").insert({
      school_id: schoolId,
      name: pmName.trim(),
      type: pmType,
      instructions: pmInstructions.trim() || null,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Payment method created");
    setPmName("");
    setPmInstructions("");
    await refresh();
  };

  const createInvoice = async () => {
    if (!schoolId) return;
    if (!invoiceStudentId) return toast.error("Pick a student");
    if (!invoiceNo.trim()) return toast.error("Invoice # required");
    const total = Number(invoiceTotal);
    if (!Number.isFinite(total) || total <= 0) return toast.error("Total must be a positive number");
    const { error } = await supabase.from("finance_invoices").insert({
      school_id: schoolId,
      student_id: invoiceStudentId,
      invoice_no: invoiceNo.trim(),
      total,
      subtotal: total,
      discount_total: 0,
      late_fee_total: 0,
      status: "unpaid",
    });
    if (error) return toast.error(error.message);
    toast.success("Invoice created");
    setInvoiceNo("");
    setInvoiceTotal("0");
    await refresh();
  };

  const logPayment = async () => {
    if (!schoolId) return;
    if (!payInvoiceId) return toast.error("Pick an invoice");
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be a positive number");
    const invoice = invoices.find((i) => i.id === payInvoiceId);
    if (!invoice) return toast.error("Invoice not found");
    const { error } = await supabase.from("finance_payments").insert({
      school_id: schoolId,
      invoice_id: payInvoiceId,
      student_id: invoice.student_id,
      method_id: payMethodId || null,
      amount,
      reference: payRef.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Payment logged");
    setPayAmount("0");
    setPayRef("");
    await refresh();
  };

  const createExpense = async () => {
    if (!schoolId) return;
    if (!expDesc.trim()) return toast.error("Description required");
    const amount = Number(expAmount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be a positive number");
    const { error } = await supabase.from("finance_expenses").insert({
      school_id: schoolId,
      description: expDesc.trim(),
      amount,
      category: expCategory.trim() || "general",
    });
    if (error) return toast.error(error.message);
    toast.success("Expense created");
    setExpDesc("");
    setExpAmount("0");
    await refresh();
  };

  if (!guard()) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Finance</CardTitle>
          <p className="text-sm text-muted-foreground">Access restricted</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
            You don’t have finance permissions in this school.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <OfflineDataBanner 
        isOffline={isOffline} 
        isUsingCache={isUsingCache} 
        onRefresh={refresh}
      />
      
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Finance</CardTitle>
          <p className="text-sm text-muted-foreground">Fee plans • Invoices • Payments • Expenses</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" /> Manual-first accounting (RLS enforced)
          </div>
          <Button variant="soft" onClick={refresh} disabled={isOffline}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full">
          <TabsTrigger value="fee_plans" className="flex-1">Fee Plans</TabsTrigger>
          <TabsTrigger value="payment_methods" className="flex-1">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices" className="flex-1">Invoices</TabsTrigger>
          <TabsTrigger value="payments" className="flex-1">Payments</TabsTrigger>
          <TabsTrigger value="expenses" className="flex-1">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="fee_plans" className="mt-4 space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Create fee plan</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input value={feePlanName} onChange={(e) => setFeePlanName(e.target.value)} placeholder="e.g. 2026 Tuition" />
              <Input value={feeCurrency} onChange={(e) => setFeeCurrency(e.target.value)} placeholder="Currency (PKR)" />
              <Button variant="hero" onClick={createFeePlan}>
                <Plus className="mr-2 h-4 w-4" /> Create
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feePlans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.currency}</TableCell>
                    <TableCell>{p.is_active ? "Active" : "Disabled"}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete fee plan?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRow("fee_plans", p.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {feePlans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No fee plans yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payment_methods" className="mt-4 space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Add payment method</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="e.g. Cash" />
              <Input value={pmType} onChange={(e) => setPmType(e.target.value)} placeholder="type (custom/bank)" />
              <Input value={pmInstructions} onChange={(e) => setPmInstructions(e.target.value)} placeholder="instructions (optional)" />
              <Button variant="hero" onClick={createPaymentMethod}>
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentMethods.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{m.type}</TableCell>
                    <TableCell>{m.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete payment method?</AlertDialogTitle>
                            <AlertDialogDescription>This may affect payment logging.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRow("finance_payment_methods", m.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {paymentMethods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No payment methods yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Create invoice</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Select value={invoiceStudentId} onValueChange={setInvoiceStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Invoice #" />
              <Input value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} placeholder="Total" />
              <Button variant="hero" onClick={createInvoice}>
                <Receipt className="mr-2 h-4 w-4" /> Create
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_no}</TableCell>
                    <TableCell className="text-muted-foreground">{i.status}</TableCell>
                    <TableCell>Rs. {Number(i.total ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{i.issue_date}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRow("finance_invoices", i.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">No invoices yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Log payment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <Select value={payInvoiceId} onValueChange={setPayInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoice_no} • Rs. {Number(i.total ?? 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount" />
              <Select value={payMethodId} onValueChange={setPayMethodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference (optional)" />
              <Button variant="hero" onClick={logPayment}>
                <Plus className="mr-2 h-4 w-4" /> Log
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paid at</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground">{new Date(p.paid_at).toLocaleString()}</TableCell>
                    <TableCell className="font-medium">Rs. {Number(p.amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete payment?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRow("finance_payments", p.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">No payments yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4 space-y-4">
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-lg">Create expense</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description" />
              <Input value={expCategory} onChange={(e) => setExpCategory(e.target.value)} placeholder="Category" />
              <Input value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="Amount" />
              <Button variant="hero" onClick={createExpense}>
                <Plus className="mr-2 h-4 w-4" /> Create
              </Button>
            </CardContent>
          </Card>

          <div className="overflow-auto rounded-2xl border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{e.expense_date}</TableCell>
                    <TableCell className="font-medium">{e.description}</TableCell>
                    <TableCell className="text-muted-foreground">{e.category}</TableCell>
                    <TableCell>Rs. {Number(e.amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteRow("finance_expenses", e.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">No expenses yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
