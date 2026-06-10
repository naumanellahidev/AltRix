import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit, Users, Coins, TrendingUp, Calendar, FileText, Download, History } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { openBulkPayslipsPDF, downloadBulkPayslipsHTML, PayslipData } from "@/lib/payslip-pdf";
import { SalaryHistoryDialog } from "@/components/hr/SalaryHistoryDialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffCombobox } from "@/components/ui/staff-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type SalaryRecord = {
  id: string;
  user_id: string;
  base_salary: number;
  allowances: number;
  deductions: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  currency: string;
  pay_frequency: string;
  notes: string | null;
};

type PayRun = {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  gross_amount: number;
  deductions: number;
  net_amount: number;
  status: string;
  notes: string | null;
};

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
};

export function HrSalariesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SalaryRecord | null>(null);
  const [payRunDialogOpen, setPayRunDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState<{ id: string; name: string } | null>(null);

  // Salary form
  const [formUserId, setFormUserId] = useState("");
  const [formBaseSalary, setFormBaseSalary] = useState("");
  const [formAllowances, setFormAllowances] = useState("0");
  const [formDeductions, setFormDeductions] = useState("0");
  const [formCurrency, setFormCurrency] = useState("PKR");
  const [formEffectiveFrom, setFormEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [formNotes, setFormNotes] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Pay run form
  const [prPeriodStart, setPrPeriodStart] = useState("");
  const [prPeriodEnd, setPrPeriodEnd] = useState("");
  const [prNotes, setPrNotes] = useState("");

  const { data: salaryRecords = [], isLoading: loadingSalaries } = useQuery({
    queryKey: ["hr_salary_records", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_salary_records")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        base_salary: r.base_salary,
        allowances: r.allowances || 0,
        deductions: r.deductions || 0,
        is_active: r.is_active ?? true,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        currency: r.currency,
        pay_frequency: r.pay_frequency,
        notes: r.notes,
      })) as SalaryRecord[];
    },
    enabled: !!schoolId,
  });

  const { data: payRuns = [], isLoading: loadingPayRuns } = useQuery({
    queryKey: ["hr_pay_runs", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_pay_runs")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        period_start: r.period_start,
        period_end: r.period_end,
        paid_at: r.paid_at,
        gross_amount: r.gross_amount,
        deductions: r.deductions,
        net_amount: r.net_amount,
        status: r.status,
        notes: r.notes,
      })) as PayRun[];
    },
    enabled: !!schoolId,
  });

  const { data: staffMembers = [] } = useQuery({
    queryKey: ["school_staff_directory", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_staff_directory", {
        _school_id: schoolId!,
      });
      if (error) throw error;
      return (data || []).map((m: any) => ({
        id: m.user_id,
        full_name: m.display_name || m.email || "Unknown",
        email: m.email || "",
      })) as StaffMember[];
    },
    enabled: !!schoolId,
  });

  const resetForm = () => {
    setFormUserId("");
    setFormBaseSalary("");
    setFormAllowances("0");
    setFormDeductions("0");
    setFormCurrency("PKR");
    setFormEffectiveFrom(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setFormIsActive(true);
    setEditingRecord(null);
  };

  // Helper to check if record is "active"
  const isRecordActive = (r: SalaryRecord) => r.is_active;

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (record: SalaryRecord) => {
    setEditingRecord(record);
    setFormUserId(record.user_id);
    setFormBaseSalary(record.base_salary.toString());
    setFormAllowances(record.allowances.toString());
    setFormDeductions(record.deductions.toString());
    setFormCurrency(record.currency);
    setFormEffectiveFrom(record.effective_from);
    setFormNotes(record.notes || "");
    setFormIsActive(record.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!formUserId) {
      toast.error("Select a staff member");
      return;
    }
    const baseSalary = Number(formBaseSalary);
    if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
      toast.error("Base salary must be a positive number");
      return;
    }

    const salaryData = {
      user_id: formUserId,
      base_salary: baseSalary,
      allowances: Number(formAllowances) || 0,
      deductions: Number(formDeductions) || 0,
      currency: formCurrency,
      effective_from: formEffectiveFrom,
      effective_to: formIsActive ? null : new Date().toISOString().split("T")[0],
      is_active: formIsActive,
      notes: formNotes.trim() || null,
    };

    if (editingRecord) {
      const { error } = await supabase
        .from("hr_salary_records")
        .update(salaryData)
        .eq("id", editingRecord.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Salary record updated");
    } else {
      // Deactivate existing active records for this user
      await supabase
        .from("hr_salary_records")
        .update({ is_active: false, effective_to: formEffectiveFrom })
        .eq("school_id", schoolId)
        .eq("user_id", formUserId)
        .eq("is_active", true);

      const { error } = await supabase.from("hr_salary_records").insert([
        {
          school_id: schoolId,
          ...salaryData,
          pay_frequency: "monthly",
        },
      ]);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Salary record created");
    }

    setDialogOpen(false);
    resetForm();
    queryClient.invalidateQueries({ queryKey: ["hr_salary_records", schoolId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("hr_salary_records").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Salary record deleted");
    queryClient.invalidateQueries({ queryKey: ["hr_salary_records", schoolId] });
  };

  const handleCreatePayRun = async () => {
    if (!schoolId) return;
    if (!prPeriodStart || !prPeriodEnd) {
      toast.error("Period start and end dates required");
      return;
    }

    const active = salaryRecords.filter((s) => isRecordActive(s));
    if (active.length === 0) {
      toast.error("No active salary records to process");
      return;
    }

    // Create individual pay runs for each staff member
    const payRunRecords = active.map((salary) => ({
      school_id: schoolId,
      user_id: salary.user_id,
      period_start: prPeriodStart,
      period_end: prPeriodEnd,
      gross_amount: salary.base_salary + salary.allowances,
      deductions: salary.deductions,
      net_amount: salary.base_salary + salary.allowances - salary.deductions,
      status: "draft",
      notes: prNotes.trim() || null,
    }));

    const { error } = await supabase.from("hr_pay_runs").insert(payRunRecords);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`${payRunRecords.length} pay runs created for individual staff members`);
    setPayRunDialogOpen(false);
    setPrPeriodStart("");
    setPrPeriodEnd("");
    setPrNotes("");
    queryClient.invalidateQueries({ queryKey: ["hr_pay_runs", schoolId] });
  };

  const handleDeletePayRun = async (id: string) => {
    const { error } = await supabase.from("hr_pay_runs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pay run deleted");
    queryClient.invalidateQueries({ queryKey: ["hr_pay_runs", schoolId] });
  };

  const getStaffMember = (userId: string) => staffMembers.find((s) => s.id === userId);
  const getStaffName = (userId: string) => getStaffMember(userId)?.full_name || "Unknown";

  const openSalaryHistory = (userId: string) => {
    const staff = getStaffMember(userId);
    setSelectedEmployeeForHistory({ id: userId, name: staff?.full_name || "Unknown" });
    setHistoryDialogOpen(true);
  };

  const handleBulkPayslips = (run: PayRun) => {
    // Find the salary record for this specific user
    const salary = salaryRecords.find((s) => s.user_id === run.user_id && isRecordActive(s));
    const staff = getStaffMember(run.user_id);
    
    if (!staff) {
      toast.error("Staff member not found");
      return;
    }

    const schoolName = tenant.status === "ready" ? tenant.school?.name || "School" : "School";

    const payslip: PayslipData = {
      employeeName: staff.full_name,
      employeeEmail: staff.email || "",
      employeeId: run.user_id,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      paidAt: run.paid_at,
      baseSalary: salary?.base_salary || run.gross_amount - (salary?.allowances || 0),
      allowances: salary?.allowances || 0,
      deductions: run.deductions,
      grossAmount: run.gross_amount,
      netAmount: run.net_amount,
      currency: salary?.currency || "PKR",
      schoolName,
      payRunId: run.id,
      status: run.status,
    };

    openBulkPayslipsPDF([payslip]);
    toast.success("Payslip generated!");
  };

  const handleDownloadPayslips = (run: PayRun) => {
    // Find the salary record for this specific user
    const salary = salaryRecords.find((s) => s.user_id === run.user_id && isRecordActive(s));
    const staff = getStaffMember(run.user_id);
    
    if (!staff) {
      toast.error("Staff member not found");
      return;
    }

    const schoolName = tenant.status === "ready" ? tenant.school?.name || "School" : "School";

    const payslip: PayslipData = {
      employeeName: staff.full_name,
      employeeEmail: staff.email || "",
      employeeId: run.user_id,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      paidAt: run.paid_at,
      baseSalary: salary?.base_salary || run.gross_amount - (salary?.allowances || 0),
      allowances: salary?.allowances || 0,
      deductions: run.deductions,
      grossAmount: run.gross_amount,
      netAmount: run.net_amount,
      currency: salary?.currency || "PKR",
      schoolName,
      payRunId: run.id,
      status: run.status,
    };

    downloadBulkPayslipsHTML([payslip], run.period_start, run.period_end);
    toast.success("Payslip downloaded!");
  };

  const activeSalaries = salaryRecords.filter((s) => isRecordActive(s));
  const stats = {
    totalStaff: activeSalaries.length,
    totalPayroll: activeSalaries.reduce((sum, s) => sum + s.base_salary + s.allowances - s.deductions, 0),
    totalAllowances: activeSalaries.reduce((sum, s) => sum + s.allowances, 0),
    totalDeductions: activeSalaries.reduce((sum, s) => sum + s.deductions, 0),
  };

  if (loadingSalaries || loadingPayRuns) {
    return <p className="text-sm text-muted-foreground">Loading salary data...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Active Staff</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.totalStaff}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Monthly Payroll</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-primary">{stats.totalPayroll.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Allowances</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.totalAllowances.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-elevated">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Deductions</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{stats.totalDeductions.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="salaries">
        <TabsList>
          <TabsTrigger value="salaries">Salary Records</TabsTrigger>
          <TabsTrigger value="payruns">Pay Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="salaries" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-xl">Salary Records</CardTitle>
                <p className="text-sm text-muted-foreground">Manage staff salary configurations</p>
              </div>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="hero" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Salary Record
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingRecord ? "Edit Salary Record" : "Add Salary Record"}</DialogTitle>
                    <DialogDescription>Configure salary details for a staff member</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Staff Member</Label>
                      <StaffCombobox
                        staff={staffMembers}
                        value={formUserId}
                        onChange={setFormUserId}
                        disabled={!!editingRecord}
                        placeholder="Select staff member"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Base Salary</Label>
                        <Input
                          type="number"
                          value={formBaseSalary}
                          onChange={(e) => setFormBaseSalary(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <Input
                          value={formCurrency}
                          onChange={(e) => setFormCurrency(e.target.value)}
                          placeholder="PKR"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Allowances</Label>
                        <Input
                          type="number"
                          value={formAllowances}
                          onChange={(e) => setFormAllowances(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Deductions</Label>
                        <Input
                          type="number"
                          value={formDeductions}
                          onChange={(e) => setFormDeductions(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Effective From</Label>
                      <Input
                        type="date"
                        value={formEffectiveFrom}
                        onChange={(e) => setFormEffectiveFrom(e.target.value)}
                      />
                    </div>
                    <div className="rounded-lg bg-accent p-3">
                      <p className="text-sm text-muted-foreground">Net Salary</p>
                      <p className="text-xl font-semibold">
                        {formCurrency} {((Number(formBaseSalary) || 0) + (Number(formAllowances) || 0) - (Number(formDeductions) || 0)).toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="Additional notes..."
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                      <Label>Active</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave}>{editingRecord ? "Update" : "Add Record"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded-xl border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead>Base Salary</TableHead>
                      <TableHead>Allowances</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net Salary</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{getStaffName(record.user_id)}</TableCell>
                        <TableCell>{record.currency} {record.base_salary.toLocaleString()}</TableCell>
                        <TableCell className="text-primary">+{record.allowances.toLocaleString()}</TableCell>
                        <TableCell className="text-destructive">-{record.deductions.toLocaleString()}</TableCell>
                        <TableCell className="font-semibold">
                          {record.currency} {(record.base_salary + record.allowances - record.deductions).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.is_active ? "default" : "secondary"}>
                            {record.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openSalaryHistory(record.user_id)}
                              title="View Salary History"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(record)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete salary record?</AlertDialogTitle>
                                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(record.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {salaryRecords.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          <Users className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                          No salary records configured
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payruns" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-xl">Pay Runs</CardTitle>
                <p className="text-sm text-muted-foreground">Payroll processing history</p>
              </div>
              <Dialog open={payRunDialogOpen} onOpenChange={setPayRunDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="hero">
                    <Plus className="mr-2 h-4 w-4" /> Run Payroll
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Pay Run</DialogTitle>
                    <DialogDescription>Start a new payroll run</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Period Start</Label>
                        <Input
                          type="date"
                          value={prPeriodStart}
                          onChange={(e) => setPrPeriodStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Period End</Label>
                        <Input
                          type="date"
                          value={prPeriodEnd}
                          onChange={(e) => setPrPeriodEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg bg-accent p-4">
                      <p className="text-sm font-medium mb-2">Payroll Summary</p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Gross</p>
                          <p className="font-semibold">
                            {activeSalaries.reduce((s, r) => s + r.base_salary + r.allowances, 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Deductions</p>
                          <p className="font-semibold">
                            {activeSalaries.reduce((s, r) => s + r.deductions, 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Net</p>
                          <p className="font-semibold text-primary">
                            {stats.totalPayroll.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Input
                        value={prNotes}
                        onChange={(e) => setPrNotes(e.target.value)}
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPayRunDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreatePayRun}>Create Pay Run</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {payRuns.map((run) => (
                    <div key={run.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{getStaffName(run.user_id)}</span>
                            <Badge variant={run.status === "completed" ? "default" : "secondary"}>
                              {run.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(run.period_start).toLocaleDateString()} — {new Date(run.period_end).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-6 text-sm">
                            <div>
                              <p className="text-muted-foreground">Gross Amount</p>
                              <p className="font-semibold">{run.gross_amount.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Deductions</p>
                              <p className="font-semibold">{run.deductions.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Net Amount</p>
                              <p className="font-semibold text-primary">{run.net_amount.toLocaleString()}</p>
                            </div>
                          </div>
                          {run.notes && <p className="mt-2 text-sm text-muted-foreground">{run.notes}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleBulkPayslips(run)}
                            title="Print Payslip"
                          >
                            <FileText className="h-4 w-4 mr-1" /> Print
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadPayslips(run)}
                            title="Download Payslip"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete pay run?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePayRun(run.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))}
                  {payRuns.length === 0 && (
                    <div className="text-center py-8">
                      <Coins className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                      <p className="text-muted-foreground">No pay runs yet</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Salary History Dialog */}
      {selectedEmployeeForHistory && (
        <SalaryHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          employeeName={selectedEmployeeForHistory.name}
          employeeId={selectedEmployeeForHistory.id}
          salaryRecords={salaryRecords}
        />
      )}
    </div>
  );
}
