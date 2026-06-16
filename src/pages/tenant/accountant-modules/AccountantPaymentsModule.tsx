import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Trash2, Receipt, Search, X } from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
  method: string;
};

type Invoice = {
  id: string;
  invoice_number: string;
  student_id: string;
  total_amount: number;
  paid_amount: number;
  status: string;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank Transfer" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "card", label: "Card Payment" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" }
];

export function AccountantPaymentsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const [formInvoiceId, setFormInvoiceId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("cash");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Invalidate all finance queries on realtime changes
  const invalidateFinanceQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["fee_payments", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["fee_invoices", schoolId] });
  }, [queryClient, schoolId]);

  // Real-time subscriptions for immediate syncing
  useRealtimeTable({
    channel: `payments-${schoolId}`,
    table: "fee_payments",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  useRealtimeTable({
    channel: `invoices-${schoolId}`,
    table: "fee_invoices",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidateFinanceQueries,
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["fee_payments", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, invoice_id, student_id, amount, paid_at, notes, method, transaction_ref")
        .eq("school_id", schoolId!)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        invoice_id: p.invoice_id,
        student_id: p.student_id,
        amount: Number(p.amount),
        paid_at: p.paid_at,
        notes: p.notes,
        method: p.method,
        reference: p.transaction_ref
      })) as Payment[];
    },
    enabled: !!schoolId,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["fee_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("id, invoice_number, student_id, total_amount, paid_amount, status")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(i => ({
        id: i.id,
        invoice_number: i.invoice_number,
        student_id: i.student_id,
        total_amount: Number(i.total_amount),
        paid_amount: Number(i.paid_amount || 0),
        status: i.status
      })) as Invoice[];
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
    setFormMethod("cash");
    setFormReference("");
    setFormNotes("");
  };

  const handleRecordPayment = async () => {
    if (!schoolId) return;
    if (!formInvoiceId || formInvoiceId === "__none") {
      toast.error("Please select an invoice");
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

    // Insert Payment into fee_payments
    const { error: paymentError } = await supabase.from("fee_payments").insert({
      school_id: schoolId,
      invoice_id: formInvoiceId,
      student_id: invoice.student_id,
      amount,
      method: formMethod as any,
      status: "success",
      transaction_ref: formReference.trim() || null,
      notes: formNotes.trim() || null,
      paid_at: new Date().toISOString()
    });

    if (paymentError) {
      toast.error(paymentError.message);
      return;
    }

    // Automatically recalculate and update invoice status
    const remaining = invoice.total_amount - (invoice.paid_amount + amount);
    let nextStatus = "partial";
    if (remaining <= 0) {
      nextStatus = "paid";
    } else if (invoice.paid_amount + amount === 0) {
      nextStatus = "pending";
    }

    const { error: invoiceError } = await supabase
      .from("fee_invoices")
      .update({
        paid_amount: invoice.paid_amount + amount,
        status: nextStatus as any
      })
      .eq("id", formInvoiceId);

    if (invoiceError) {
      toast.error("Payment logged, but failed to update invoice status: " + invoiceError.message);
    } else {
      toast.success("Payment recorded successfully");
    }

    setDialogOpen(false);
    resetForm();
    invalidateFinanceQueries();
  };

  const handleDeletePayment = async (payment: Payment) => {
    // Delete payment record
    const { error: deleteError } = await supabase.from("fee_payments").delete().eq("id", payment.id);
    if (deleteError) {
      toast.error(deleteError.message);
      return;
    }

    // Adjust invoice paid amount
    const invoice = invoices.find((i) => i.id === payment.invoice_id);
    if (invoice) {
      const nextPaid = Math.max(0, invoice.paid_amount - payment.amount);
      const remaining = invoice.total_amount - nextPaid;
      let nextStatus = "partial";
      if (nextPaid === 0) {
        nextStatus = "pending";
      } else if (remaining <= 0) {
        nextStatus = "paid";
      }

      await supabase
        .from("fee_invoices")
        .update({
          paid_amount: nextPaid,
          status: nextStatus as any
        })
        .eq("id", invoice.id);
    }

    toast.success("Payment deleted successfully");
    invalidateFinanceQueries();
  };

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return "Unknown Student";
    return `${student.first_name} ${student.last_name || ""}`.trim();
  };

  const getInvoiceDisplay = (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    return invoice?.invoice_number || "Unknown";
  };

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");

  // Filtered Payments
  const filteredPayments = payments.filter((p) => {
    const studentName = getStudentName(p.student_id).toLowerCase();
    const invNo = getInvoiceDisplay(p.invoice_id).toLowerCase();
    const ref = (p.reference || "").toLowerCase();
    const matchesSearch = studentName.includes(searchQuery.toLowerCase()) || 
                          invNo.includes(searchQuery.toLowerCase()) || 
                          ref.includes(searchQuery.toLowerCase());
    const matchesMethod = methodFilter === "all" || p.method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const stats = {
    totalPayments: payments.length,
    totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
    todayAmount: payments
      .filter((p) => new Date(p.paid_at).toDateString() === new Date().toDateString())
      .reduce((sum, p) => sum + p.amount, 0),
  };

  if (isLoading || invoicesLoading) {
    return (
      <div className="flex h-[30vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Total Payouts</p>
              <h3 className="text-2xl font-bold text-slate-800">{stats.totalPayments} Deposits</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Total Revenue Collected</p>
              <h3 className="text-2xl font-bold text-slate-800">Rs. {stats.totalAmount.toLocaleString()}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Today's Collections</p>
              <h3 className="text-2xl font-bold text-blue-600">Rs. {stats.todayAmount.toLocaleString()}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <Plus className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border border-blue-50">
        <CardHeader className="flex flex-col space-y-4 pb-4 border-b border-blue-50 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="text-slate-800 font-display text-lg font-bold">Payments Registry</CardTitle>
            <CardDescription className="text-xs">Real-time ledger of student fee payments and bank clearances.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const exportRows = filteredPayments.map((p) => ({
                Date: new Date(p.paid_at).toLocaleDateString(),
                Invoice: getInvoiceDisplay(p.invoice_id),
                Student: getStudentName(p.student_id),
                Amount: p.amount,
                Method: PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method,
                Reference: p.reference || "—",
                Notes: p.notes || "—"
              }));
              return (
                <ReportExportMenu
                  baseName="payments_ledger"
                  rows={exportRows}
                  print={{
                    title: "Student Payments Report",
                    subtitle: `Generated on ${new Date().toLocaleDateString()}`,
                    summary: [
                      { label: "Total Transactions", value: filteredPayments.length },
                      { label: "Total Amount (Rs.)", value: filteredPayments.reduce((s, x) => s + x.Amount, 0).toLocaleString() }
                    ]
                  }}
                />
              );
            })()}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm h-9">
                  <Plus className="mr-1.5 h-4 w-4" /> Record Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] rounded-2xl border-blue-100">
                <DialogHeader>
                  <DialogTitle className="text-slate-800 font-display font-bold">Record Payment</DialogTitle>
                  <DialogDescription>Submit student fee collection to real-time accounts ledger.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="payInvoice">Select Invoice</Label>
                    <Select value={formInvoiceId} onValueChange={setFormInvoiceId}>
                      <SelectTrigger className="rounded-xl border-blue-100">
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {unpaidInvoices.length === 0 ? (
                          <SelectItem value="__none" disabled>No pending invoices</SelectItem>
                        ) : (
                          unpaidInvoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.invoice_number} — {getStudentName(inv.student_id)} (Rs. {(inv.total_amount - inv.paid_amount).toLocaleString()})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="payAmount">Amount Paid</Label>
                      <Input
                        id="payAmount"
                        type="number"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="Rs. 0"
                        className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="payMethod">Payment Method</Label>
                      <Select value={formMethod} onValueChange={setFormMethod}>
                        <SelectTrigger className="rounded-xl border-blue-100">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="payReference">Transaction Reference</Label>
                    <Input
                      id="payReference"
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                      placeholder="e.g. Bank slip, JazzCash ID..."
                      className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="payNotes">Internal Notes</Label>
                    <Textarea
                      id="payNotes"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Add payment notes here..."
                      className="rounded-xl border-blue-100 min-h-[60px]"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-blue-100">
                    Cancel
                  </Button>
                  <Button onClick={handleRecordPayment} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
                    Submit Payment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student, invoice no, reference..."
                className="pl-9 pr-8 h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 rounded-xl text-xs border-blue-100">
                <SelectValue placeholder="Filter by Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-blue-50 overflow-hidden">
            <Table>
              <TableHeader className="bg-blue-50/20">
                <TableRow className="border-blue-50">
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Paid Date</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Invoice No</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Student</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Method</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Reference</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2 text-right">Amount</TableHead>
                  <TableHead className="w-12 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                      No payments found matching criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((p) => (
                    <TableRow key={p.id} className="border-blue-50 hover:bg-blue-50/5">
                      <TableCell className="py-2.5 text-xs text-slate-600">
                        {new Date(p.paid_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-800 font-bold">
                        {getInvoiceDisplay(p.invoice_id)}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-slate-700 font-medium">
                        {getStudentName(p.student_id)}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs capitalize text-slate-600">
                        {PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs font-mono text-slate-500">
                        {p.reference || "—"}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-right text-slate-800 font-bold">
                        Rs. {p.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-destructive hover:bg-destructive/5">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl border-blue-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Void Payment Record?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Voiding this transaction will permanently delete the deposit log from ledger and automatically deduct the amount from the associated invoice's payments.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl border-blue-100 text-slate-600">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletePayment(p)} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/95">
                                Void Deposit
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
