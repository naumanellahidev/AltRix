import { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Trash2, Receipt, Search, X, Printer, FileText, RefreshCw } from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";
import { BrandedDocument } from "@/components/pdf/BrandedDocument";
import { useSchoolDocument } from "@/hooks/useSchoolDocument";

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
  fee_invoices?: {
    notes: string | null;
    invoice_number: string;
  };
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
  const { school: schoolBranding } = useSchoolDocument(schoolId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

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
        .select(`
          id,
          invoice_id,
          student_id,
          amount,
          paid_at,
          notes,
          method,
          transaction_ref,
          fee_invoices (
            notes,
            invoice_number
          )
        `)
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
        reference: p.transaction_ref,
        fee_invoices: p.fee_invoices as any
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

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff_list", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_staff_directory")
        .select("id, full_name, email, phone")
        .eq("school_id", schoolId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.id,
        full_name: d.full_name,
        email: d.email,
        phone: d.phone
      }));
    },
    enabled: !!schoolId,
  });

  const { data: schoolUsers = [] } = useQuery({
    queryKey: ["school_user_directory", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_user_directory")
        .select("user_id, display_name, email")
        .eq("school_id", schoolId!);
      if (error) throw error;
      return (data || []).map(d => ({
        user_id: d.user_id,
        display_name: d.display_name,
        email: d.email
      }));
    },
    enabled: !!schoolId,
  });

  const getRecipientDetails = (payment: Payment) => {
    if (payment.student_id === "00000000-0000-0000-0000-000000000000") {
      const invoiceNotes = payment.fee_invoices?.notes || payment.notes || "";
      const match = invoiceNotes.match(/^\[Individual:\s*([^|]+)\s*\|\s*Contact:\s*([^\]]+)\]/);
      if (match) {
        return {
          name: match[1].trim(),
          contact: match[2].trim(),
          type: "Custom Individual"
        };
      }
      return {
        name: "Custom Individual",
        contact: "N/A",
        type: "Custom Individual"
      };
    }

    // Try Staff
    const staff = staffList.find(s => s.id === payment.student_id);
    if (staff) {
      return {
        name: staff.full_name,
        contact: staff.email || staff.phone || "No contact",
        type: "Staff Member"
      };
    }

    // Try User Profile
    const u = schoolUsers.find(user => user.user_id === payment.student_id);
    if (u) {
      return {
        name: u.display_name || "Registered User",
        contact: u.email || "No email",
        type: "User / Parent"
      };
    }

    // Try Legacy Student
    const student = students.find((s) => s.id === payment.student_id);
    if (student) {
      return {
        name: `${student.first_name} ${student.last_name ?? ""}`.trim(),
        contact: "Student",
        type: "Legacy Student"
      };
    }

    return {
      name: "Unknown Recipient",
      contact: "N/A",
      type: "Unknown"
    };
  };

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

    if (invoice.status === "paid" || invoice.paid_amount >= invoice.total_amount) {
      toast.error("This invoice is already fully paid.");
      return;
    }

    const remainingBalance = invoice.total_amount - invoice.paid_amount;
    if (amount > remainingBalance) {
      toast.error(`Payment amount exceeds the remaining balance of Rs. ${remainingBalance.toLocaleString()}`);
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
    if (student) return `${student.first_name} ${student.last_name || ""}`.trim();
    const staff = staffList.find(s => s.id === studentId);
    if (staff) return staff.full_name;
    const u = schoolUsers.find(user => user.user_id === studentId);
    if (u) return u.display_name || "Registered User";
    return "Unknown Recipient";
  };

  const getInvoiceDisplay = (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    return invoice?.invoice_number || "Unknown";
  };

  const unpaidInvoices = invoices.filter((i) => i.status !== "paid");

  // Filtered Payments
  const filteredPayments = payments.filter((p) => {
    const rec = getRecipientDetails(p);
    const nameMatches = rec.name.toLowerCase().includes(searchQuery.toLowerCase());
    const invNo = getInvoiceDisplay(p.invoice_id).toLowerCase();
    const ref = (p.reference || "").toLowerCase();
    
    const matchesSearch = nameMatches || invNo.includes(searchQuery.toLowerCase()) || ref.includes(searchQuery.toLowerCase());
    const matchesMethod = methodFilter === "all" || p.method === methodFilter;
    
    let matchesDate = true;
    if (dateFrom) {
      matchesDate = matchesDate && new Date(p.paid_at) >= new Date(dateFrom);
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(p.paid_at) <= endOfDay;
    }

    let matchesAmount = true;
    if (minAmount) {
      matchesAmount = matchesAmount && p.amount >= Number(minAmount);
    }
    if (maxAmount) {
      matchesAmount = matchesAmount && p.amount <= Number(maxAmount);
    }

    return matchesSearch && matchesMethod && matchesDate && matchesAmount;
  });

  const stats = useMemo(() => {
    const digitalMethods = ["bank", "card", "jazzcash", "easypaisa"];
    const digital = payments
      .filter((p) => digitalMethods.includes(p.method))
      .reduce((sum, p) => sum + p.amount, 0);
    const cash = payments
      .filter((p) => !digitalMethods.includes(p.method))
      .reduce((sum, p) => sum + p.amount, 0);

    const breakdown = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + p.amount;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      todayAmount: payments
        .filter((p) => new Date(p.paid_at).toDateString() === new Date().toDateString())
        .reduce((sum, p) => sum + p.amount, 0),
      digitalTotal: digital,
      cashTotal: cash,
      breakdown
    };
  }, [payments]);

  if (isLoading || invoicesLoading) {
    return (
      <div className="flex h-[30vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-receipt-area, #printable-receipt-area * {
            visibility: visible !important;
          }
          #printable-receipt-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
            color: black !important;
            padding: 2rem !important;
          }
        }
      `}} />

      {/* Printable Receipt Container */}
      {selectedPayment && (
        <div id="printable-receipt-area" className="hidden print:block bg-white text-black">
          <BrandedDocument
            school={schoolBranding}
            documentTitle="Payment Receipt"
            referenceNumber={selectedPayment.reference || selectedPayment.id.slice(0, 8).toUpperCase()}
            issuedOn={selectedPayment.paid_at ? new Date(selectedPayment.paid_at) : null}
            signatoryName="Accounts Office"
            signatoryTitle="Received By"
          >
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-gray-600">Received From:</p>
                  <p className="font-bold text-base">{getRecipientDetails(selectedPayment).name}</p>
                  <p className="text-gray-500">Type: {getRecipientDetails(selectedPayment).type}</p>
                  <p className="text-gray-500">Contact: {getRecipientDetails(selectedPayment).contact}</p>
                </div>
                <div className="text-right text-gray-700">
                  <p><span className="font-semibold text-gray-600">Payment Date:</span> {new Date(selectedPayment.paid_at).toLocaleDateString()}</p>
                  <p className="mt-1"><span className="font-semibold text-gray-600">Payment Method:</span> <span className="uppercase font-bold">{PAYMENT_METHODS.find(m => m.value === selectedPayment.method)?.label || selectedPayment.method}</span></p>
                  {selectedPayment.reference && <p className="mt-1"><span className="font-semibold text-gray-600">Ref No:</span> {selectedPayment.reference}</p>}
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 mt-6">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium text-gray-600">Invoice Number</span>
                  <span className="font-bold text-gray-800">{getInvoiceDisplay(selectedPayment.invoice_id)}</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-lg font-bold text-gray-800">Amount Received</span>
                  <span className="text-xl font-extrabold text-blue-600">Rs. {Number(selectedPayment.amount).toLocaleString()}</span>
                </div>
              </div>

              {selectedPayment.notes && (
                <div className="pt-4 border-t">
                  <p className="font-semibold text-gray-600">Payment Notes:</p>
                  <p className="text-gray-500 mt-1">{selectedPayment.notes}</p>
                </div>
              )}
            </div>
          </BrandedDocument>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Total Deposits</p>
              <h3 className="text-xl font-bold text-slate-800">{stats.totalPayments} Deposits</h3>
              <p className="text-[10px] text-muted-foreground">Today: Rs. {stats.todayAmount.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Total Collected</p>
              <h3 className="text-xl font-bold text-slate-800">Rs. {stats.totalAmount.toLocaleString()}</h3>
              <p className="text-[10px] text-muted-foreground">Overall revenue register</p>
            </div>
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Digital Payments</p>
              <h3 className="text-xl font-bold text-emerald-600">Rs. {stats.digitalTotal.toLocaleString()}</h3>
              <p className="text-[10px] text-muted-foreground">Bank, Cards & Mobile wallets</p>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-full min-h-[90px]">
            <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Methods Breakdown</p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-medium text-slate-600 mt-1">
              <div>Cash: Rs. {(stats.breakdown.cash || 0).toLocaleString()}</div>
              <div>Bank: Rs. {(stats.breakdown.bank || 0).toLocaleString()}</div>
              <div>Easypaisa: Rs. {(stats.breakdown.easypaisa || 0).toLocaleString()}</div>
              <div>JazzCash: Rs. {(stats.breakdown.jazzcash || 0).toLocaleString()}</div>
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
              const exportRows = filteredPayments.map((p) => {
                const rec = getRecipientDetails(p);
                return {
                  Date: new Date(p.paid_at).toLocaleDateString(),
                  Invoice: getInvoiceDisplay(p.invoice_id),
                  Recipient: rec.name,
                  Type: rec.type,
                  Contact: rec.contact,
                  Amount: p.amount,
                  Method: PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method,
                  Reference: p.reference || "—",
                  Notes: p.notes || "—"
                };
              });
              return (
                <ReportExportMenu
                  baseName="payments_ledger"
                  rows={exportRows}
                  print={{
                    title: "Payments Report",
                    subtitle: `Generated on ${new Date().toLocaleDateString()}`,
                    summary: [
                      { label: "Total Transactions", value: filteredPayments.length },
                      { label: "Total Amount (Rs.)", value: filteredPayments.reduce((s, x) => s + x.amount, 0).toLocaleString() }
                    ]
                  }}
                />
              );
            })()}

            <Button
              variant="ghost"
              size="icon"
              onClick={invalidateFinanceQueries}
              title="Refresh"
              className="h-9 w-9 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>

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
          <div className="space-y-3 bg-blue-50/10 p-3.5 rounded-2xl border border-blue-50/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by recipient, invoice no, reference..."
                  className="pl-9 pr-8 h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-9 rounded-xl text-xs border-blue-100">
                  <SelectValue placeholder="Filter by Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  type="date"
                  placeholder="From Date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
                <Input
                  type="date"
                  placeholder="To Date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min Amount"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
                <Input
                  type="number"
                  placeholder="Max Amount"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="h-9 rounded-xl text-xs border-blue-100 focus-visible:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2 flex justify-end items-center">
                {(searchQuery || methodFilter !== "all" || dateFrom || dateTo || minAmount || maxAmount) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setMethodFilter("all");
                      setDateFrom("");
                      setDateTo("");
                      setMinAmount("");
                      setMaxAmount("");
                    }}
                    className="text-xs text-muted-foreground hover:text-blue-600 rounded-xl h-8 px-3"
                  >
                    <X className="h-3 w-3 mr-1" /> Clear All Filters
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-blue-50 overflow-hidden">
            <Table>
              <TableHeader className="bg-blue-50/20">
                <TableRow className="border-blue-50">
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Paid Date</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Invoice No</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Recipient</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Method</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2">Reference</TableHead>
                  <TableHead className="text-slate-700 font-semibold text-xs py-2 text-right">Amount</TableHead>
                  <TableHead className="w-20 py-2 text-right">Actions</TableHead>
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
                        <div>
                          <p className="font-semibold">{getRecipientDetails(p).name}</p>
                          <p className="text-[10px] text-muted-foreground">{getRecipientDetails(p).type}</p>
                        </div>
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
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/50"
                            onClick={() => {
                              setSelectedPayment(p);
                              setTimeout(() => {
                                window.print();
                              }, 150);
                            }}
                            title="Print Receipt"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
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
                        </div>
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
