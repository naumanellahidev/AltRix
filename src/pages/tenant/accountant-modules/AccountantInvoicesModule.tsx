import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Plus, 
  FileText, 
  Eye, 
  Edit,
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Printer, 
  Download,
  Receipt,
  Search,
  X
} from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

type InvoiceItem = {
  id?: string;
  invoice_id: string;
  label: string;
  category: string;
  amount: number;
  sort_order: number;
};

type Invoice = {
  id: string;
  invoice_number: string;
  student_id: string;
  subtotal: number;
  discount_amount: number;
  late_fee: number;
  total_amount: number;
  status: string;
  created_at: string;
  due_date: string;
  notes: string | null;
  fee_payments?: {
    id: string;
    amount: number;
    paid_at: string | null;
    transaction_ref: string | null;
    method: string;
  }[];
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
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" }
];

const getCategoryFromDescription = (desc: string): string => {
  const d = desc.toLowerCase();
  if (d.includes("tuition")) return "tuition";
  if (d.includes("admission")) return "admission";
  if (d.includes("transport") || d.includes("bus")) return "transport";
  if (d.includes("exam") || d.includes("test")) return "exam";
  if (d.includes("uniform")) return "uniform";
  if (d.includes("book")) return "books";
  if (d.includes("lab") || d.includes("computer")) return "lab";
  if (d.includes("sport") || d.includes("game")) return "sports";
  if (d.includes("library")) return "library";
  return "other";
};

export function AccountantInvoicesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // Dialog & state management
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Invoice Form State
  const [formStudentId, setFormStudentId] = useState("");
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formLineItems, setFormLineItems] = useState<{ description: string; quantity: number; amount: number }[]>([
    { description: "", quantity: 1, amount: 0 }
  ]);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formLateFee, setFormLateFee] = useState("0");
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Payment Form State
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Queries
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["fee_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_invoices")
        .select(`
          *,
          fee_payments (
            id,
            amount,
            paid_at,
            transaction_ref,
            method
          )
        `)
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!schoolId,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("school_id", schoolId!)
        .order("first_name");
      if (error) throw error;
      return data as Student[];
    },
    enabled: !!schoolId,
  });

  const { data: activeInvoiceItems = [], isLoading: isLoadingItems } = useQuery({
    queryKey: ["fee_invoice_items", selectedInvoice?.id],
    queryFn: async () => {
      if (!selectedInvoice?.id) return [];
      const { data, error } = await supabase
        .from("fee_invoice_items")
        .select("*")
        .eq("invoice_id", selectedInvoice.id);
      if (error) throw error;
      
      // Map back to front-end InvoiceItem schema
      return (data || []).map(item => ({
        id: item.id,
        invoice_id: item.invoice_id,
        label: item.label,
        category: item.category,
        qty: 1, // Db only stores amount, we treat qty as 1
        unit_price: item.amount,
        amount: item.amount
      })) as any[];
    },
    enabled: !!selectedInvoice?.id,
  });

  const resetForm = () => {
    setFormStudentId("");
    setFormInvoiceNo("");
    setFormLineItems([{ description: "", quantity: 1, amount: 0 }]);
    setFormDiscount("0");
    setFormLateFee("0");
    setFormDueDate("");
    setFormNotes("");
    setEditingInvoice(null);
  };

  const generateInvoiceNo = () => {
    const prefix = "INV";
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  };

  const openCreate = () => {
    resetForm();
    setFormInvoiceNo(generateInvoiceNo());
    setDialogOpen(true);
  };

  const openEdit = async (inv: Invoice) => {
    setEditingInvoice(inv);
    setFormStudentId(inv.student_id);
    setFormInvoiceNo(inv.invoice_number);
    setFormDiscount(String(inv.discount_amount));
    setFormLateFee(String(inv.late_fee));
    setFormDueDate(inv.due_date ? inv.due_date.slice(0, 10) : "");
    setFormNotes(inv.notes || "");

    // Fetch items directly to populate form
    const { data: items, error } = await supabase
      .from("fee_invoice_items")
      .select("*")
      .eq("invoice_id", inv.id);
    
    if (error) {
      toast.error("Failed to load invoice items");
      return;
    }

    if (items && items.length > 0) {
      setFormLineItems(items.map(i => ({
        description: i.label,
        quantity: 1,
        amount: Number(i.amount)
      })));
    } else {
      setFormLineItems([{ description: "", quantity: 1, amount: 0 }]);
    }

    setDialogOpen(true);
  };

  const addLineItem = () => {
    setFormLineItems([...formLineItems, { description: "", quantity: 1, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (formLineItems.length <= 1) {
      setFormLineItems([{ description: "", quantity: 1, amount: 0 }]);
    } else {
      setFormLineItems(formLineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: "description" | "quantity" | "amount", value: string | number) => {
    const updated = [...formLineItems];
    if (field === "description") {
      updated[index].description = String(value);
    } else if (field === "quantity") {
      updated[index].quantity = Number(value) || 0;
    } else if (field === "amount") {
      updated[index].amount = Number(value) || 0;
    }
    setFormLineItems(updated);
  };

  const calculatedSubtotal = formLineItems.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
  const calculatedTotal = calculatedSubtotal - (Number(formDiscount) || 0) + (Number(formLateFee) || 0);

  const getInvoicePaidAmount = (inv: Invoice) => {
    if (!inv.fee_payments) return 0;
    return inv.fee_payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const getInvoiceStatus = (inv: Invoice) => {
    const paid = getInvoicePaidAmount(inv);
    if (paid >= inv.total_amount) return "paid";
    if (paid > 0) return "partial";
    if (inv.due_date && new Date(inv.due_date) < new Date()) {
      return "overdue";
    }
    return "unpaid";
  };

  const handleSaveInvoice = async () => {
    if (!schoolId) return;
    if (!formStudentId) {
      toast.error("Select a student");
      return;
    }
    if (!formInvoiceNo.trim()) {
      toast.error("Invoice number required");
      return;
    }
    if (formLineItems.some(item => !item.description.trim())) {
      toast.error("All line items must have a description");
      return;
    }
    if (calculatedTotal <= 0) {
      toast.error("Total must be greater than 0");
      return;
    }

    const invoicePayload = {
      school_id: schoolId,
      student_id: formStudentId,
      invoice_number: formInvoiceNo.trim(),
      subtotal: calculatedSubtotal,
      discount_amount: Number(formDiscount) || 0,
      late_fee: Number(formLateFee) || 0,
      total_amount: calculatedTotal,
      due_date: formDueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      notes: formNotes.trim() || null,
    };

    if (editingInvoice) {
      // Update Invoice
      const { error: invoiceError } = await supabase
        .from("fee_invoices")
        .update(invoicePayload)
        .eq("id", editingInvoice.id);

      if (invoiceError) {
        toast.error(invoiceError.message);
        return;
      }

      // Recreate items: Delete old first
      await supabase.from("fee_invoice_items").delete().eq("invoice_id", editingInvoice.id);

      // Insert new ones
      const { error: itemsError } = await supabase.from("fee_invoice_items").insert(
        formLineItems.map((item, index) => ({
          school_id: schoolId,
          invoice_id: editingInvoice.id,
          label: item.quantity > 1 ? `${item.description} (x${item.quantity})` : item.description,
          category: getCategoryFromDescription(item.description),
          amount: item.quantity * item.amount,
          sort_order: index + 1
        }))
      );

      if (itemsError) {
        toast.error("Invoice updated, but failed to update some line items: " + itemsError.message);
      } else {
        toast.success("Invoice updated successfully");
      }
    } else {
      // Create Invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("fee_invoices")
        .insert({
          ...invoicePayload,
          status: "pending",
        })
        .select()
        .single();

      if (invoiceError) {
        toast.error(invoiceError.message);
        return;
      }

      const invoiceId = invoiceData.id;

      const { error: itemsError } = await supabase.from("fee_invoice_items").insert(
        formLineItems.map((item, index) => ({
          school_id: schoolId,
          invoice_id: invoiceId,
          label: item.quantity > 1 ? `${item.description} (x${item.quantity})` : item.description,
          category: getCategoryFromDescription(item.description),
          amount: item.quantity * item.amount,
          sort_order: index + 1
        }))
      );

      if (itemsError) {
        toast.error("Invoice created, but failed to save line items: " + itemsError.message);
      } else {
        toast.success("Invoice generated successfully");
      }
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["fee_invoices", schoolId] });
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    // Map internal frontend statuses to the backend allowed invoice statuses
    const dbStatus = newStatus === "unpaid" ? "pending" : newStatus;

    const { error } = await supabase
      .from("fee_invoices")
      .update({ status: dbStatus })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Invoice marked as ${newStatus}`);
    queryClient.invalidateQueries({ queryKey: ["fee_invoices", schoolId] });
  };

  const handleDelete = async (id: string) => {
    // Delete invoice items first to satisfy foreign keys
    await supabase.from("fee_invoice_items").delete().eq("invoice_id", id);
    const { error } = await supabase.from("fee_invoices").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invoice deleted");
    queryClient.invalidateQueries({ queryKey: ["fee_invoices", schoolId] });
  };

  const openRecordPayment = (inv: Invoice) => {
    setSelectedInvoice(inv);
    const balance = inv.total_amount - getInvoicePaidAmount(inv);
    setPayAmount(String(balance));
    setPayMethod("cash");
    setPayReference("");
    setPayNotes("");
    setPayDialogOpen(true);
  };

  const handleRecordPaymentSubmit = async () => {
    if (!schoolId || !selectedInvoice) return;
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    const { error } = await supabase.from("fee_payments").insert({
      school_id: schoolId,
      invoice_id: selectedInvoice.id,
      student_id: selectedInvoice.student_id,
      amount,
      method: payMethod as any,
      status: "success",
      transaction_ref: payReference.trim() || null,
      notes: payNotes.trim() || null,
      paid_at: new Date().toISOString()
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Payment logged successfully");
    setPayDialogOpen(false);
    
    // Automatically update invoice status to paid or partial
    const totalPaid = getInvoicePaidAmount(selectedInvoice) + amount;
    const newStatus = totalPaid >= selectedInvoice.total_amount ? "paid" : "partial";
    await handleUpdateStatus(selectedInvoice.id, newStatus);
  };

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return "Unknown";
    return `${student.first_name} ${student.last_name || ""}`.trim();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            <CheckCircle className="mr-1 h-3 w-3" /> Paid
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
            <XCircle className="mr-1 h-3 w-3" /> Overdue
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Clock className="mr-1 h-3 w-3" /> Partial
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
            <Clock className="mr-1 h-3 w-3" /> Unpaid
          </Badge>
        );
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const statusMatches = statusFilter === "all" || getInvoiceStatus(inv) === statusFilter;
    const studentName = getStudentName(inv.student_id).toLowerCase();
    const invoiceNo = inv.invoice_number.toLowerCase();
    const searchMatches = !searchQuery || studentName.includes(searchQuery.toLowerCase()) || invoiceNo.includes(searchQuery.toLowerCase());
    return statusMatches && searchMatches;
  });

  const stats = {
    total: invoices.length,
    paid: invoices.filter((i) => getInvoiceStatus(i) === "paid").length,
    unpaid: invoices.filter((i) => getInvoiceStatus(i) === "unpaid" || getInvoiceStatus(i) === "overdue").length,
    totalAmount: invoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
    paidAmount: invoices.reduce((sum, i) => sum + getInvoicePaidAmount(i), 0),
    totalOutstanding: invoices.reduce((sum, i) => sum + (i.total_amount - getInvoicePaidAmount(i)), 0),
  };

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-invoice-area, #printable-invoice-area * {
            visibility: visible !important;
          }
          #printable-invoice-area {
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

      {/* Printable Invoice Container */}
      <div id="printable-invoice-area" className="hidden print:block p-8 max-w-4xl mx-auto bg-white text-black space-y-6">
        <div className="flex justify-between items-start border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold uppercase">{tenant.status === "ready" ? tenant.school?.name : "School Fee Voucher"}</h1>
            <p className="text-sm text-gray-500">Official Fee Invoice</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold text-gray-700 font-mono">INVOICE</h2>
            <p className="text-sm font-medium">{selectedInvoice?.invoice_number}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <p className="font-semibold text-gray-600">Billed To:</p>
            <p className="font-bold text-base">{selectedInvoice ? getStudentName(selectedInvoice.student_id) : ""}</p>
            <p className="text-gray-500">Student ID: {selectedInvoice?.student_id}</p>
          </div>
          <div className="text-right text-gray-700">
            <p><span className="font-semibold text-gray-600">Issue Date:</span> {selectedInvoice?.created_at ? new Date(selectedInvoice.created_at).toLocaleDateString() : ""}</p>
            <p><span className="font-semibold text-gray-600">Due Date:</span> {selectedInvoice?.due_date ? new Date(selectedInvoice.due_date).toLocaleDateString() : "—"}</p>
            <p className="mt-2"><span className="font-semibold text-gray-600">Status:</span> <span className="uppercase font-bold">{selectedInvoice ? getInvoiceStatus(selectedInvoice) : ""}</span></p>
          </div>
        </div>

        <table className="w-full text-left border-collapse text-sm mt-6">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <th className="py-2.5 px-3 font-semibold text-gray-600">Description</th>
              <th className="py-2.5 px-3 text-center font-semibold text-gray-600 w-20">Qty</th>
              <th className="py-2.5 px-3 text-right font-semibold text-gray-600 w-32">Unit Price</th>
              <th className="py-2.5 px-3 text-right font-semibold text-gray-600 w-32">Total</th>
            </tr>
          </thead>
          <tbody>
            {activeInvoiceItems.map((item, idx) => (
              <tr key={item.id || idx} className="border-b">
                <td className="py-2.5 px-3">{item.label}</td>
                <td className="py-2.5 px-3 text-center">1</td>
                <td className="py-2.5 px-3 text-right">Rs. {Number(item.amount || 0).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">Rs. {Number(item.amount || 0).toLocaleString()}</td>
              </tr>
            ))}
            {activeInvoiceItems.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-gray-400 italic">No line items specified.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end mt-6">
          <div className="w-64 space-y-2 text-sm border-t pt-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span>Rs. {Number(selectedInvoice?.subtotal || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>-Rs. {Number(selectedInvoice?.discount_amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Late Fee</span>
              <span>+Rs. {Number(selectedInvoice?.late_fee || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span>
              <span>Rs. {Number(selectedInvoice?.total_amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-gray-600">
              <span>Amount Paid</span>
              <span>Rs. {selectedInvoice ? getInvoicePaidAmount(selectedInvoice).toLocaleString() : 0}</span>
            </div>
            <div className="flex justify-between font-bold text-red-600">
              <span>Balance Due</span>
              <span>Rs. {selectedInvoice ? (selectedInvoice.total_amount - getInvoicePaidAmount(selectedInvoice)).toLocaleString() : 0}</span>
            </div>
          </div>
        </div>

        <div className="pt-16 grid grid-cols-2 gap-8 text-xs">
          <div>
            {selectedInvoice?.notes && (
              <div>
                <p className="font-semibold text-gray-600">Notes:</p>
                <p className="text-gray-500 mt-1">{selectedInvoice.notes}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col justify-end items-end">
            <div className="w-48 border-t border-gray-400 text-center pt-2 mt-auto">
              <p className="font-semibold text-gray-600">Authorized Signature</p>
              <p className="text-gray-400 mt-1">Stamp & Date</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-blue-600 uppercase font-semibold">Total Invoices</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-blue-600 uppercase font-semibold">Paid</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.paid}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-blue-600 uppercase font-semibold">Unpaid</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.unpaid}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/20 shadow-sm">
          <CardContent className="pt-4">
            <p className="text-xs text-blue-600 uppercase font-semibold">Total Outstanding</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">Rs. {stats.totalOutstanding.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border border-blue-50">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-blue-50 gap-4">
          <div>
            <CardTitle className="font-display text-lg font-bold text-slate-800">Invoices Register</CardTitle>
            <CardDescription className="text-xs">Generate, edit, and track student bills.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const exportRows = filteredInvoices.map((inv) => ({
                invoice_no: inv.invoice_number,
                student: getStudentName(inv.student_id),
                subtotal: inv.subtotal,
                discount: inv.discount_amount,
                late_fee: inv.late_fee,
                total: inv.total_amount,
                status: getInvoiceStatus(inv),
                issue_date: inv.created_at,
                due_date: inv.due_date || "",
                notes: inv.notes || "",
              }));
              const totalAmount = filteredInvoices.reduce((s, i) => s + (i.total_amount || 0), 0);
              const paidCount = filteredInvoices.filter((i) => getInvoiceStatus(i) === "paid").length;
              return (
                <ReportExportMenu
                  baseName="invoices"
                  rows={exportRows}
                  print={{
                    title: "Invoices Report",
                    subtitle: `Generated ${new Date().toLocaleDateString()} • Filter: ${statusFilter}`,
                    summary: [
                      { label: "Invoices", value: filteredInvoices.length },
                      { label: "Total billed", value: `Rs. ${totalAmount.toLocaleString()}` },
                      { label: "Paid", value: paidCount },
                      { label: "Outstanding", value: filteredInvoices.length - paidCount },
                    ],
                  }}
                />
              );
            })()}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] rounded-xl border-blue-100 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate} className="rounded-xl h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Generate Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 border-b border-blue-50 bg-blue-50/10">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoice number or student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 rounded-xl border-blue-100 h-9 text-xs focus-visible:ring-blue-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader className="bg-blue-50/20">
                <TableRow className="hover:bg-transparent border-blue-50">
                  <TableHead className="text-slate-700 text-xs font-semibold py-2">Invoice #</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2">Student</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2 text-right">Amount</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2">Status</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2">Issue Date</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2">Due Date</TableHead>
                  <TableHead className="text-slate-700 text-xs font-semibold py-2 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="border-blue-50 hover:bg-blue-50/5">
                    <TableCell className="font-semibold text-xs text-slate-800 py-3">{inv.invoice_number}</TableCell>
                    <TableCell className="text-xs text-slate-800">{getStudentName(inv.student_id)}</TableCell>
                    <TableCell className="text-xs text-right font-bold text-slate-800">Rs. {Number(inv.total_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="py-3">{getStatusBadge(getInvoiceStatus(inv))}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-slate-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setViewDialogOpen(true);
                          }}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
                          onClick={() => openEdit(inv)}
                          title="Edit Invoice"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {getInvoiceStatus(inv) !== "paid" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
                            onClick={() => openRecordPayment(inv)}
                            title="Record Payment"
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-500 hover:text-destructive hover:bg-destructive/5" title="Delete Invoice">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl border-blue-100">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
                              <AlertDialogDescription>This action will permanently delete invoice {inv.invoice_number}. This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl border-blue-100 text-slate-600">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(inv.id)} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/95">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                      No invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Invoice Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl rounded-2xl border-blue-100">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-slate-800">
              {editingInvoice ? `Edit Invoice: ${formInvoiceNo}` : "Generate Invoice"}
            </DialogTitle>
            <DialogDescription>
              {editingInvoice ? "Modify invoice parameters and update line items." : "Create a new invoice template for a student."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Select value={formStudentId} onValueChange={setFormStudentId}>
                <SelectTrigger className="rounded-xl border-blue-100">
                  <SelectValue placeholder="Select student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name || ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice No</Label>
                <Input value={formInvoiceNo} onChange={(e) => setFormInvoiceNo(e.target.value)} className="rounded-xl border-blue-100 focus-visible:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} className="rounded-xl border-blue-100 focus-visible:ring-blue-500" />
              </div>
            </div>

            {/* Dynamic Line Items Editor */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-sm text-slate-700">Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="h-8 rounded-xl border-blue-100 text-blue-600 hover:bg-blue-50/50">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Row
                </Button>
              </div>
              <div className="max-h-[160px] overflow-y-auto border border-blue-50 rounded-xl p-3 space-y-2.5 bg-blue-50/5">
                {formLineItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="e.g. Tuition Fee"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                      className="flex-1 rounded-xl border-blue-100 h-9 text-xs focus-visible:ring-blue-500"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      disabled={true} // fee_invoice_items db schema doesn't have Qty, keep as 1
                      className="w-16 rounded-xl border-blue-100 h-9 text-xs focus-visible:ring-blue-500 bg-slate-50"
                      min="1"
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.amount}
                      onChange={(e) => updateLineItem(index, "amount", e.target.value)}
                      className="w-24 rounded-xl border-blue-100 h-9 text-xs focus-visible:ring-blue-500"
                    />
                    <div className="w-24 text-right text-xs font-bold text-slate-800 pr-1">
                      Rs. {item.amount.toLocaleString()}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg shrink-0"
                      onClick={() => removeLineItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discount (Rs.)</Label>
                <Input type="number" value={formDiscount} onChange={(e) => setFormDiscount(e.target.value)} placeholder="0" className="rounded-xl border-blue-100 focus-visible:ring-blue-500" />
              </div>
              <div className="space-y-1.5">
                <Label>Late Fee (Rs.)</Label>
                <Input type="number" value={formLateFee} onChange={(e) => setFormLateFee(e.target.value)} placeholder="0" className="rounded-xl border-blue-100 focus-visible:ring-blue-500" />
              </div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/20 p-3.5 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Calculated Subtotal</p>
                <p className="text-sm font-semibold text-slate-800">Rs. {calculatedSubtotal.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-blue-600 uppercase font-semibold">Total Amount Due</p>
                <p className="text-lg font-bold text-blue-600 font-display">Rs. {calculatedTotal.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Additional billing descriptions..." className="rounded-xl border-blue-100 min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl border-blue-100 text-slate-600">Cancel</Button>
            <Button onClick={handleSaveInvoice} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {editingInvoice ? "Save Changes" : "Generate Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl border-blue-100">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-slate-800">Record Payment</DialogTitle>
            <DialogDescription>Log a manual student payment transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount (Rs.)</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="rounded-xl border-blue-100">
                  <SelectValue placeholder="Select Method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Reference</Label>
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="e.g. Bank receipt #, Chq #..."
                className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Payment description..."
                className="rounded-xl border-blue-100 min-h-[50px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} className="rounded-xl border-blue-100 text-slate-600">Cancel</Button>
            <Button onClick={handleRecordPaymentSubmit} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">Record Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-blue-100">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-slate-800">Invoice details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 border-b pb-4 border-blue-50">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Invoice No</p>
                  <p className="font-bold text-sm text-slate-800 mt-0.5">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Status</p>
                  <div className="mt-0.5">{getStatusBadge(getInvoiceStatus(selectedInvoice))}</div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Student</p>
                  <p className="font-semibold text-sm text-slate-800 mt-0.5">{getStudentName(selectedInvoice.student_id)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Issue Date</p>
                  <p className="font-semibold text-sm text-slate-800 mt-0.5">{new Date(selectedInvoice.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Line Items</p>
                <div className="rounded-xl border border-blue-50 max-h-[160px] overflow-y-auto bg-blue-50/5">
                  <Table>
                    <TableHeader className="bg-blue-50/10">
                      <TableRow className="hover:bg-transparent border-blue-50">
                        <TableHead className="py-2 h-auto text-xs text-slate-700 font-semibold">Description</TableHead>
                        <TableHead className="py-2 h-auto text-xs text-center w-12 text-slate-700 font-semibold">Qty</TableHead>
                        <TableHead className="py-2 h-auto text-xs text-right w-24 text-slate-700 font-semibold">Price</TableHead>
                        <TableHead className="py-2 h-auto text-xs text-right w-24 text-slate-700 font-semibold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingItems ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">Loading items...</TableCell>
                        </TableRow>
                      ) : activeInvoiceItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground">No line items specified</TableCell>
                        </TableRow>
                      ) : (
                        activeInvoiceItems.map((item, idx) => (
                          <TableRow key={item.id || idx} className="border-blue-50">
                            <TableCell className="py-2 text-xs font-medium text-slate-800">{item.label}</TableCell>
                            <TableCell className="py-2 text-xs text-center text-slate-600">1</TableCell>
                            <TableCell className="py-2 text-xs text-right text-slate-500">Rs. {Number(item.amount || 0).toLocaleString()}</TableCell>
                            <TableCell className="py-2 text-xs text-right font-bold text-slate-800">Rs. {Number(item.amount || 0).toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="rounded-xl border border-blue-50 p-4 space-y-2.5 text-xs bg-blue-50/10">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Subtotal</span>
                  <span className="text-slate-800 font-medium">Rs. {Number(selectedInvoice.subtotal ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span className="text-slate-500 font-medium">Discount</span>
                  <span className="font-semibold">-Rs. {Number(selectedInvoice.discount_amount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span className="text-slate-500 font-medium">Late Fee</span>
                  <span className="font-semibold">+Rs. {Number(selectedInvoice.late_fee ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-blue-100 pt-2 font-bold text-sm text-slate-800">
                  <span>Total Amount</span>
                  <span>Rs. {Number(selectedInvoice.total_amount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-blue-600 font-bold">
                  <span>Amount Paid</span>
                  <span>Rs. {getInvoicePaidAmount(selectedInvoice).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs font-extrabold text-red-600">
                  <span>Balance Due</span>
                  <span>Rs. {(selectedInvoice.total_amount - getInvoicePaidAmount(selectedInvoice)).toLocaleString()}</span>
                </div>
              </div>

              {selectedInvoice.notes && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Notes</p>
                  <p className="text-xs bg-slate-50 border border-slate-100 p-2.5 rounded-xl leading-relaxed text-slate-600">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)} className="rounded-xl border-blue-100 text-slate-600">Close</Button>
            <Button onClick={() => window.print()} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9 text-xs">
              <Printer className="h-4 w-4" /> Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
