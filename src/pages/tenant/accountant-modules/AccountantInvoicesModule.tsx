import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Eye, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { ReportExportMenu } from "@/components/accountant/ReportExportMenu";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Invoice = {
  id: string;
  invoice_no: string;
  student_id: string;
  subtotal: number;
  discount_total: number;
  late_fee_total: number;
  total: number;
  status: string;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
};

type Student = {
  id: string;
  first_name: string;
  last_name: string | null;
};

export function AccountantInvoicesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formStudentId, setFormStudentId] = useState("");
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formSubtotal, setFormSubtotal] = useState("");
  const [formDiscount, setFormDiscount] = useState("0");
  const [formLateFee, setFormLateFee] = useState("0");
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["finance_invoices", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_invoices")
        .select("*")
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

  const resetForm = () => {
    setFormStudentId("");
    setFormInvoiceNo("");
    setFormSubtotal("");
    setFormDiscount("0");
    setFormLateFee("0");
    setFormDueDate("");
    setFormNotes("");
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

  const handleCreate = async () => {
    if (!schoolId) return;
    if (!formStudentId) {
      toast.error("Select a student");
      return;
    }
    if (!formInvoiceNo.trim()) {
      toast.error("Invoice number required");
      return;
    }

    const subtotal = Number(formSubtotal) || 0;
    const discount = Number(formDiscount) || 0;
    const lateFee = Number(formLateFee) || 0;
    const total = subtotal - discount + lateFee;

    if (total <= 0) {
      toast.error("Total must be greater than 0");
      return;
    }

    const { error } = await supabase.from("finance_invoices").insert({
      school_id: schoolId,
      student_id: formStudentId,
      invoice_no: formInvoiceNo.trim(),
      subtotal,
      discount_total: discount,
      late_fee_total: lateFee,
      total,
      status: "unpaid",
      due_date: formDueDate || null,
      notes: formNotes.trim() || null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Invoice created");
    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["finance_invoices", schoolId] });
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("finance_invoices")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Invoice marked as ${newStatus}`);
    queryClient.invalidateQueries({ queryKey: ["finance_invoices", schoolId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("finance_invoices").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invoice deleted");
    queryClient.invalidateQueries({ queryKey: ["finance_invoices", schoolId] });
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
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle className="mr-1 h-3 w-3" /> Paid
          </Badge>
        );
      case "overdue":
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="mr-1 h-3 w-3" /> Overdue
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20">
            <Clock className="mr-1 h-3 w-3" /> Partial
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" /> Unpaid
          </Badge>
        );
    }
  };

  const filteredInvoices = statusFilter === "all" 
    ? invoices 
    : invoices.filter((inv) => inv.status === statusFilter);

  const stats = {
    total: invoices.length,
    paid: invoices.filter((i) => i.status === "paid").length,
    unpaid: invoices.filter((i) => i.status === "unpaid").length,
    overdue: invoices.filter((i) => i.status === "overdue").length,
    totalAmount: invoices.reduce((sum, i) => sum + i.total, 0),
    paidAmount: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total, 0),
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invoices...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Invoices</p>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-semibold text-primary">{stats.paid}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Unpaid</p>
            <p className="text-2xl font-semibold">{stats.unpaid}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
            <p className="text-2xl font-semibold">{(stats.totalAmount - stats.paidAmount).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-display text-xl">Invoices</CardTitle>
            <p className="text-sm text-muted-foreground">Generate and manage student invoices</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              const exportRows = filteredInvoices.map((inv) => ({
                invoice_no: inv.invoice_no,
                student: getStudentName(inv.student_id),
                subtotal: inv.subtotal,
                discount: inv.discount_total,
                late_fee: inv.late_fee_total,
                total: inv.total,
                status: inv.status,
                issue_date: inv.issue_date,
                due_date: inv.due_date || "",
                notes: inv.notes || "",
              }));
              const totalAmount = filteredInvoices.reduce((s, i) => s + (i.total || 0), 0);
              const paidCount = filteredInvoices.filter((i) => i.status === "paid").length;
              return (
                <ReportExportMenu
                  baseName="invoices"
                  rows={exportRows}
                  print={{
                    title: "Invoices Report",
                    subtitle: `Generated ${new Date().toLocaleDateString()} • Filter: ${statusFilter}`,
                    summary: [
                      { label: "Invoices", value: filteredInvoices.length },
                      { label: "Total billed", value: totalAmount.toLocaleString() },
                      { label: "Paid", value: paidCount },
                      { label: "Outstanding", value: filteredInvoices.length - paidCount },
                    ],
                  }}
                />
              );
            })()}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="hero" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Generate Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Generate Invoice</DialogTitle>
                  <DialogDescription>Create a new invoice for a student</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Student</Label>
                    <Select value={formStudentId} onValueChange={setFormStudentId}>
                      <SelectTrigger>
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
                    <div className="space-y-2">
                      <Label>Invoice No</Label>
                      <Input value={formInvoiceNo} onChange={(e) => setFormInvoiceNo(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Subtotal</Label>
                      <Input type="number" value={formSubtotal} onChange={(e) => setFormSubtotal(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Discount</Label>
                      <Input type="number" value={formDiscount} onChange={(e) => setFormDiscount(e.target.value)} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Late Fee</Label>
                      <Input type="number" value={formLateFee} onChange={(e) => setFormLateFee(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="rounded-lg bg-accent p-3">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-semibold">
                      {((Number(formSubtotal) || 0) - (Number(formDiscount) || 0) + (Number(formLateFee) || 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Additional notes..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Generate Invoice</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-auto rounded-xl border bg-surface">
            <div className="min-w-[900px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                    <TableCell>{getStudentName(inv.student_id)}</TableCell>
                    <TableCell>{Number(inv.total ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell>{new Date(inv.issue_date).toLocaleDateString()}</TableCell>
                    <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setViewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {inv.status !== "paid" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdateStatus(inv.id, "paid")}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(inv.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                      No invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice No</p>
                  <p className="font-medium">{selectedInvoice.invoice_no}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Student</p>
                  <p className="font-medium">{getStudentName(selectedInvoice.student_id)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Issue Date</p>
                  <p className="font-medium">{new Date(selectedInvoice.issue_date).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{Number(selectedInvoice.subtotal ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{Number(selectedInvoice.discount_total ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Late Fee</span>
                  <span>+{Number(selectedInvoice.late_fee_total ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span>{Number(selectedInvoice.total ?? 0).toLocaleString()}</span>
                </div>
              </div>
              {selectedInvoice.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
