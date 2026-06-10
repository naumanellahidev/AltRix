import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Trash2, Receipt } from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type Payment = {
  id: string;
  invoice_id: string;
  student_id: string;
  amount: number;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  method_id: string | null;
};

type Invoice = {
  id: string;
  invoice_no: string;
  student_id: string;
  total: number;
  status: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
};

export function AccountantPaymentsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);

  const [formInvoiceId, setFormInvoiceId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formMethodId, setFormMethodId] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [methodName, setMethodName] = useState("");
  const [methodType, setMethodType] = useState("cash");
  const [methodInstructions, setMethodInstructions] = useState("");

  // Invalidate all finance queries on realtime changes
  const invalidateFinanceQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["finance_payments"] });
    queryClient.invalidateQueries({ queryKey: ["finance_invoices"] });
    queryClient.invalidateQueries({ queryKey: ["finance_payments_home"] });
    queryClient.invalidateQueries({ queryKey: ["finance_invoices_home"] });
    queryClient.invalidateQueries({ queryKey: ["finance_expenses_home"] });
  }, [queryClient]);

  // Real-time subscriptions
  useRealtimeTable({
    channel: `payments-${schoolId}`,
    table: "finance_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  useRealtimeTable({
    channel: `invoices-${schoolId}`,
    table: "finance_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["finance_payments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_payments")
        .select("*")
        .eq("school_id", schoolId!)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
    enabled: !!schoolId,
  });

  // Fetch ALL invoices, not just unpaid - we filter later in the UI
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["finance_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_invoices")
        .select("id, invoice_no, student_id, total, status")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Invoice[];
    },
    enabled: !!schoolId,
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["finance_payment_methods", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_payment_methods")
        .select("*")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return data as PaymentMethod[];
    },
    enabled: !!schoolId,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!);
      if (error) throw error;
      return data as Student[];
    },
    enabled: !!schoolId,
  });

  const resetForm = () => {
    setFormInvoiceId("");
    setFormAmount("");
    setFormMethodId("");
    setFormReference("");
    setFormNotes("");
  };

  const handleRecordPayment = async () => {
    if (!schoolId) return;
    if (!formInvoiceId) {
      toast.error("Select an invoice");
      return;
    }

    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }

    const invoice = invoices.find((i) => i.id === formInvoiceId);
    if (!invoice) {
      toast.error("Invoice not found");
      return;
    }

    const { error } = await supabase.from("finance_payments").insert({
      school_id: schoolId,
      invoice_id: formInvoiceId,
      student_id: invoice.student_id,
      amount,
      method_id: formMethodId || null,
      reference: formReference.trim() || null,
      notes: formNotes.trim() || null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    // Update invoice status if fully paid
    const totalPaid = payments
      .filter((p) => p.invoice_id === formInvoiceId)
      .reduce((sum, p) => sum + p.amount, 0) + amount;

    if (totalPaid >= invoice.total) {
      await supabase.from("finance_invoices").update({ status: "paid" }).eq("id", formInvoiceId);
    } else if (totalPaid > 0) {
      await supabase.from("finance_invoices").update({ status: "partial" }).eq("id", formInvoiceId);
    }

    toast.success("Payment recorded");
    setDialogOpen(false);
    resetForm();
    invalidateFinanceQueries();
  };

  const handleAddPaymentMethod = async () => {
    if (!schoolId) return;
    if (!methodName.trim()) {
      toast.error("Method name required");
      return;
    }

    const { error } = await supabase.from("finance_payment_methods").insert({
      school_id: schoolId,
      name: methodName.trim(),
      type: methodType,
      instructions: methodInstructions.trim() || null,
      is_active: true,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Payment method added");
    setMethodDialogOpen(false);
    setMethodName("");
    setMethodType("cash");
    setMethodInstructions("");
    queryClient.invalidateQueries({ queryKey: ["finance_payment_methods", schoolId] });
  };

  const handleDeletePayment = async (id: string) => {
    const { error } = await supabase.from("finance_payments").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payment deleted");
    invalidateFinanceQueries();
  };

  const handleDeleteMethod = async (id: string) => {
    const { error } = await supabase.from("finance_payment_methods").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payment method deleted");
    queryClient.invalidateQueries({ queryKey: ["finance_payment_methods", schoolId] });
  };

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return "Unknown";
    return `${student.first_name} ${student.last_name || ""}`.trim();
  };

  const getInvoiceDisplay = (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    return invoice?.invoice_no || "Unknown";
  };

  const getMethodName = (methodId: string | null) => {
    if (!methodId) return "—";
    const method = paymentMethods.find((m) => m.id === methodId);
    return method?.name || "Unknown";
  };

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");

  const stats = {
    totalPayments: payments.length,
    totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    todayAmount: payments
      .filter((p) => new Date(p.paid_at).toDateString() === new Date().toDateString())
      .reduce((sum, p) => sum + p.amount, 0),
  };

  if (isLoading || invoicesLoading) {
    return <p className="text-sm text-muted-foreground">Loading payments...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Payments</p>
            <p className="text-2xl font-semibold">{stats.totalPayments}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Collected</p>
            <p className="text-2xl font-semibold text-primary">{stats.totalAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Today's Collection</p>
            <p className="text-2xl font-semibold">{stats.todayAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Payments List */}
        <Card className="shadow-elevated lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl">Payments</CardTitle>
              <p className="text-sm text-muted-foreground">Record and track fee payments</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const exportRows = payments.map((p) => ({
                  date: p.paid_at,
                  invoice: getInvoiceDisplay(p.invoice_id),
                  student: getStudentName(p.student_id),
                  amount: p.amount,
                  method: getMethodName(p.method_id),
                  reference: p.reference || "",
                  notes: p.notes || "",
                }));
                const total = payments.reduce((s, p) => s + (p.amount || 0), 0);
                return (
                  <ReportExportMenu
                    baseName="payments"
                    rows={exportRows}
                    print={{
                      title: "Payments Report",
                      subtitle: `Generated ${new Date().toLocaleDateString()}`,
                      summary: [
                        { label: "Payments", value: payments.length },
                        { label: "Total collected", value: total.toLocaleString() },
                      ],
                    }}
                  />
                );
              })()}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" onClick={resetForm}>
                  <Plus className="mr-2 h-4 w-4" /> Record Payment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Payment</DialogTitle>
                  <DialogDescription>Record a payment against an invoice</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Invoice</Label>
                    <Select value={formInvoiceId} onValueChange={setFormInvoiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {unpaidInvoices.length === 0 ? (
                          <SelectItem value="__none" disabled>
                            No unpaid invoices
                          </SelectItem>
                        ) : (
                          unpaidInvoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.invoice_no} - {getStudentName(inv.student_id)} ({inv.total.toLocaleString()})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {invoices.length === 0 && (
                      <p className="text-xs text-muted-foreground">No invoices found. Create an invoice first.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={formMethodId || "none"} onValueChange={(v) => setFormMethodId(v === "none" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No method</SelectItem>
                          {paymentMethods.filter((m) => m.is_active).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Reference (optional)</Label>
                    <Input
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                      placeholder="Transaction ID, receipt #, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleRecordPayment}>Record Payment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[420px] overflow-auto rounded-xl border bg-surface">
              <div className="min-w-[900px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{new Date(payment.paid_at).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{getInvoiceDisplay(payment.invoice_id)}</TableCell>
                      <TableCell>{getStudentName(payment.student_id)}</TableCell>
                      <TableCell>{payment.amount.toLocaleString()}</TableCell>
                      <TableCell>{getMethodName(payment.method_id)}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete payment?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePayment(payment.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                        No payments recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="shadow-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Payment Methods</CardTitle>
            <Dialog open={methodDialogOpen} onOpenChange={setMethodDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Payment Method</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={methodName}
                      onChange={(e) => setMethodName(e.target.value)}
                      placeholder="e.g. Cash, Bank Transfer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={methodType} onValueChange={setMethodType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Instructions (optional)</Label>
                    <Textarea
                      value={methodInstructions}
                      onChange={(e) => setMethodInstructions(e.target.value)}
                      placeholder="Bank details, payment instructions..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMethodDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddPaymentMethod}>Add Method</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{method.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{method.type}</p>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete payment method?</AlertDialogTitle>
                          <AlertDialogDescription>This may affect existing payments.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteMethod(method.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {paymentMethods.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No payment methods configured
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
