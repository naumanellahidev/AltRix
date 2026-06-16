import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import {
  Users,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Bell,
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Send,
  Filter,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface StudentFeeTrackerProps {
  schoolId: string;
}

interface StudentLedger {
  student_id: string;
  school_id: string;
  first_name: string;
  last_name: string | null;
  student_code: string | null;
  total_invoiced: number;
  total_paid: number;
  outstanding_balance: number;
  invoice_count: number;
  payment_count: number;
  overdue_amount: number;
  overdue_count: number;
}

interface Invoice {
  id: string;
  invoice_no: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  status: string;
}

interface Payment {
  id: string;
  amount: number;
  paid_at: string;
  invoice_id: string;
}

interface FeeReminder {
  id: string;
  student_id: string;
  invoice_id: string | null;
  reminder_type: string;
  scheduled_date: string;
  status: string;
  message: string | null;
  sent_at: string | null;
}

const MotionCard = motion.create(Card);

export function StudentFeeTracker({ schoolId }: StudentFeeTrackerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentLedger | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderType, setReminderType] = useState<string>("upcoming");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");

  // Fetch student ledgers
  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ["student_fee_ledger", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_fee_ledger")
        .select("*")
        .eq("school_id", schoolId)
        .order("outstanding_balance", { ascending: false });
      if (error) throw error;
      return (data || []) as StudentLedger[];
    },
    enabled: !!schoolId,
  });

  // Fetch invoices for selected student
  const { data: studentInvoices = [] } = useQuery({
    queryKey: ["student_invoices", selectedStudent?.student_id],
    queryFn: async () => {
      if (!selectedStudent) return [];
      const { data, error } = await supabase
        .from("fee_invoices")
        .select("id, invoice_number, created_at, due_date, total_amount, status")
        .eq("student_id", selectedStudent.student_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((inv: any) => ({
        id: inv.id,
        invoice_no: inv.invoice_number,
        issue_date: inv.created_at,
        due_date: inv.due_date,
        total: inv.total_amount,
        status: inv.status,
      })) as Invoice[];
    },
    enabled: !!selectedStudent,
  });

  // Fetch payments for selected student
  const { data: studentPayments = [] } = useQuery({
    queryKey: ["student_payments", selectedStudent?.student_id],
    queryFn: async () => {
      if (!selectedStudent) return [];
      const invoiceIds = studentInvoices.map((i) => i.id);
      if (invoiceIds.length === 0) return [];
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, amount, paid_at, invoice_id")
        .in("invoice_id", invoiceIds)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Payment[];
    },
    enabled: !!selectedStudent && studentInvoices.length > 0,
  });

  // Fetch reminders for selected student
  const { data: studentReminders = [] } = useQuery({
    queryKey: ["fee_reminders", selectedStudent?.student_id],
    queryFn: async () => {
      if (!selectedStudent) return [];
      const { data, error } = await (supabase as any)
        .from("fee_reminders")
        .select("*")
        .eq("student_id", selectedStudent.student_id)
        .order("scheduled_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as FeeReminder[];
    },
    enabled: !!selectedStudent,
  });

  // Filter ledgers
  const filteredLedgers = useMemo(() => {
    return ledgers.filter((ledger) => {
      const matchesSearch =
        searchQuery === "" ||
        `${ledger.first_name} ${ledger.last_name || ""}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ledger.student_code || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "overdue" && ledger.overdue_amount > 0) ||
        (statusFilter === "outstanding" && ledger.outstanding_balance > 0 && ledger.overdue_amount === 0) ||
        (statusFilter === "clear" && ledger.outstanding_balance <= 0);

      return matchesSearch && matchesStatus;
    });
  }, [ledgers, searchQuery, statusFilter]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalOutstanding = ledgers.reduce((sum, l) => sum + l.outstanding_balance, 0);
    const totalOverdue = ledgers.reduce((sum, l) => sum + l.overdue_amount, 0);
    const studentsWithOverdue = ledgers.filter((l) => l.overdue_amount > 0).length;
    const studentsWithOutstanding = ledgers.filter((l) => l.outstanding_balance > 0).length;
    const collectionRate = ledgers.reduce((sum, l) => sum + l.total_paid, 0) /
      Math.max(ledgers.reduce((sum, l) => sum + l.total_invoiced, 0), 1) * 100;

    return { totalOutstanding, totalOverdue, studentsWithOverdue, studentsWithOutstanding, collectionRate };
  }, [ledgers]);

  const openStudentDetails = (ledger: StudentLedger) => {
    setSelectedStudent(ledger);
    setDetailsOpen(true);
  };

  const openReminderDialog = () => {
    setReminderType("upcoming");
    setReminderDate(format(addDays(new Date(), 3), "yyyy-MM-dd"));
    setReminderMessage("");
    setReminderDialogOpen(true);
  };

  const handleScheduleReminder = async () => {
    if (!selectedStudent || !reminderDate) {
      toast.error("Please select a date");
      return;
    }

    const { error } = await (supabase as any).from("fee_reminders").insert({
      school_id: schoolId,
      student_id: selectedStudent.student_id,
      reminder_type: reminderType,
      scheduled_date: reminderDate,
      message: reminderMessage || null,
      status: "pending",
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Reminder scheduled successfully");
    setReminderDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["fee_reminders", selectedStudent.student_id] });
  };

  const getStatusBadge = (ledger: StudentLedger) => {
    if (ledger.overdue_amount > 0) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    if (ledger.outstanding_balance > 0) {
      return <Badge variant="secondary">Outstanding</Badge>;
    }
    return <Badge variant="default">Clear</Badge>;
  };

  const getReminderTypeBadge = (type: string) => {
    switch (type) {
      case "upcoming":
        return <Badge variant="outline">Upcoming</Badge>;
      case "due":
        return <Badge variant="secondary">Due</Badge>;
      case "overdue":
        return <Badge variant="destructive">Overdue</Badge>;
      case "final_notice":
        return <Badge variant="destructive">Final Notice</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading student fee data...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-2xl font-bold">PKR {summaryStats.totalOutstanding.toLocaleString()}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="shadow-elevated border-destructive/30"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Overdue</p>
                <p className="text-2xl font-bold text-destructive">
                  PKR {summaryStats.totalOverdue.toLocaleString()}
                </p>
              </div>
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Students with Dues</p>
                <p className="text-2xl font-bold">{summaryStats.studentsWithOutstanding}</p>
                <p className="text-xs text-destructive">{summaryStats.studentsWithOverdue} overdue</p>
              </div>
              <div className="rounded-full bg-chart-2/10 p-3">
                <Users className="h-5 w-5 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </MotionCard>

        <MotionCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="shadow-elevated"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collection Rate</p>
                <p className="text-2xl font-bold">{summaryStats.collectionRate.toFixed(1)}%</p>
                <Progress value={summaryStats.collectionRate} className="mt-2 h-2" />
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                {summaryStats.collectionRate >= 80 ? (
                  <TrendingUp className="h-5 w-5 text-primary" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-destructive" />
                )}
              </div>
            </div>
          </CardContent>
        </MotionCard>
      </div>

      {/* Filters */}
      <Card className="shadow-elevated">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by student name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="clear">Clear</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Student Ledger Table */}
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Student Fee Ledger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="text-right">Total Invoiced</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLedgers.map((ledger) => (
                  <TableRow key={ledger.student_id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {ledger.first_name} {ledger.last_name || ""}
                        </p>
                        {ledger.student_code && (
                          <p className="text-xs text-muted-foreground">{ledger.student_code}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      PKR {ledger.total_invoiced.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-primary">
                      PKR {ledger.total_paid.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      PKR {ledger.outstanding_balance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {ledger.overdue_amount > 0 ? `PKR ${ledger.overdue_amount.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(ledger)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openStudentDetails(ledger)}>
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLedgers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No students found matching your criteria
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Student Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedStudent?.first_name} {selectedStudent?.last_name || ""}
            </DialogTitle>
            <DialogDescription>
              {selectedStudent?.student_code && `Student Code: ${selectedStudent.student_code}`}
            </DialogDescription>
          </DialogHeader>

          {selectedStudent && (
            <div className="space-y-6">
              {/* Balance Overview */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Invoiced</p>
                    <p className="text-xl font-bold">
                      PKR {selectedStudent.total_invoiced.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-primary/5">
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Paid</p>
                    <p className="text-xl font-bold text-primary">
                      PKR {selectedStudent.total_paid.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card className={selectedStudent.outstanding_balance > 0 ? "bg-destructive/5" : "bg-primary/5"}>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Outstanding Balance</p>
                    <p className={`text-xl font-bold ${selectedStudent.outstanding_balance > 0 ? "text-destructive" : "text-primary"}`}>
                      PKR {selectedStudent.outstanding_balance.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Invoices */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoices ({studentInvoices.length})
                </h4>
                <ScrollArea className="h-[200px] rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Issue Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                          <TableCell>{format(new Date(invoice.issue_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            {invoice.due_date
                              ? format(new Date(invoice.due_date), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            PKR {invoice.total.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                invoice.status === "paid"
                                  ? "default"
                                  : invoice.status === "overdue"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {studentInvoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No invoices found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Payments */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment History ({studentPayments.length})
                </h4>
                <ScrollArea className="h-[200px] rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentPayments.map((payment) => {
                        const invoice = studentInvoices.find((i) => i.id === payment.invoice_id);
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>{format(new Date(payment.paid_at), "MMM d, yyyy")}</TableCell>
                            <TableCell className="text-right text-primary font-medium">
                              PKR {payment.amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{invoice?.invoice_no || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {studentPayments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Scheduled Reminders */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Scheduled Reminders ({studentReminders.length})
                  </h4>
                  <Button variant="outline" size="sm" onClick={openReminderDialog}>
                    <Bell className="mr-2 h-4 w-4" />
                    Schedule Reminder
                  </Button>
                </div>
                <ScrollArea className="h-[150px] rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Scheduled Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentReminders.map((reminder) => (
                        <TableRow key={reminder.id}>
                          <TableCell>{getReminderTypeBadge(reminder.reminder_type)}</TableCell>
                          <TableCell>{format(new Date(reminder.scheduled_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={reminder.status === "sent" ? "default" : "outline"}>
                              {reminder.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {reminder.message || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {studentReminders.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            No reminders scheduled
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Reminder Dialog */}
      <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Fee Reminder</DialogTitle>
            <DialogDescription>
              Schedule an automated reminder for {selectedStudent?.first_name} {selectedStudent?.last_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reminder Type</Label>
              <Select value={reminderType} onValueChange={setReminderType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming Due</SelectItem>
                  <SelectItem value="due">Due Today</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="final_notice">Final Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Custom Message (Optional)</Label>
              <Textarea
                placeholder="Add a custom message for the reminder..."
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleReminder}>
              <Send className="mr-2 h-4 w-4" />
              Schedule Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
