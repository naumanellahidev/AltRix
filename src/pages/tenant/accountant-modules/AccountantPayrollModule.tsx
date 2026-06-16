import { useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Play,
  CheckCircle,
  Clock,
  Trash2,
  Users,
  Coins,
  FileText,
  Download,
  History,
  RefreshCw,
  Search,
  Edit,
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarDays,
  Layers,
  Percent,
  Plus as PlusIcon,
  Minus,
  ChevronDown,
  PiggyBank,
  AlertCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { useOfflineSalaryRecords, useOfflineStaffMembers } from "@/hooks/useOfflineData";
import { OfflineDataBanner } from "@/components/offline/OfflineDataBanner";
import {
  openBulkPayslipsPDF,
  downloadBulkPayslipsHTML,
  PayslipData,
} from "@/lib/payslip-pdf";
import { SalaryHistoryDialog } from "@/components/hr/SalaryHistoryDialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
};

// Group pay-runs by period for batch operations
type PayRunBatch = {
  key: string;
  period_start: string;
  period_end: string;
  runs: PayRun[];
  gross: number;
  deductions: number;
  net: number;
  draft: number;
  processing: number;
  completed: number;
};

const periodKey = (start: string, end: string) => `${start}__${end}`;

const fmt = (n: number, currency = "PKR") => {
  const displayCurrency = currency === "PKR" ? "Rs." : currency;
  return `${displayCurrency} ${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export function AccountantPayrollModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const queryClient = useQueryClient();
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // Offline
  const {
    isOffline,
    isUsingCache: salariesFromCache,
    refresh: refreshSalaries,
  } = useOfflineSalaryRecords(schoolId);
  const { isUsingCache: staffFromCache, refresh: refreshStaff } =
    useOfflineStaffMembers(schoolId);
  const isUsingCache = salariesFromCache || staffFromCache;

  const handleRefresh = useCallback(() => {
    if (!isOffline) {
      refreshSalaries();
      refreshStaff();
    }
  }, [isOffline, refreshSalaries, refreshStaff]);

  // UI state
  const [tab, setTab] = useState("salaries");
  const [staffSearch, setStaffSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );

  // Dialog state
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<SalaryRecord | null>(null);
  const [payRunDialogOpen, setPayRunDialogOpen] = useState(false);
  const [groupOpDialogOpen, setGroupOpDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] =
    useState<{ id: string; name: string } | null>(null);

  // Salary form
  const [formUserId, setFormUserId] = useState("");
  const [formBaseSalary, setFormBaseSalary] = useState("");
  const [formAllowances, setFormAllowances] = useState("0");
  const [formDeductions, setFormDeductions] = useState("0");
  const [formCurrency, setFormCurrency] = useState("PKR");
  const [formFrequency, setFormFrequency] = useState("monthly");
  const [formEffectiveFrom, setFormEffectiveFrom] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [formNotes, setFormNotes] = useState("");

  // Pay run form
  const [prPeriodStart, setPrPeriodStart] = useState("");
  const [prPeriodEnd, setPrPeriodEnd] = useState("");
  const [prNotes, setPrNotes] = useState("");
  const [prScope, setPrScope] = useState<"all" | "selected">("all");
  const [prMarkPaid, setPrMarkPaid] = useState(false);

  // Group op form
  const [groupOpType, setGroupOpType] = useState<
    "raise_pct" | "raise_amt" | "bonus" | "deduction" | "deactivate"
  >("raise_pct");
  const [groupOpValue, setGroupOpValue] = useState("");
  const [groupOpEffective, setGroupOpEffective] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [groupOpReason, setGroupOpReason] = useState("");

  // Realtime invalidation
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["hr_pay_runs", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["hr_salary_records", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["hr_pay_runs_home"] });
    queryClient.invalidateQueries({ queryKey: ["hr_salary_records_home"] });
  }, [queryClient, schoolId]);

  useRealtimeTable({
    channel: `accountant-payroll-pay-runs-${schoolId}`,
    table: "hr_pay_runs",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidate,
  });

  useRealtimeTable({
    channel: `accountant-payroll-salaries-${schoolId}`,
    table: "hr_salary_records",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
    enabled: !!schoolId,
    onChange: invalidate,
  });

  // Queries
  const { data: payRuns = [], isLoading: loadingPayRuns } = useQuery({
    queryKey: ["hr_pay_runs", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_pay_runs")
        .select("*")
        .eq("school_id", schoolId!)
        .order("period_end", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayRun[];
    },
    enabled: !!schoolId,
  });

  const { data: salaryRecords = [], isLoading: loadingSalaries } = useQuery({
    queryKey: ["hr_salary_records", schoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_salary_records")
        .select("*")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        base_salary: Number(r.base_salary || 0),
        allowances: Number(r.allowances || 0),
        deductions: Number(r.deductions || 0),
        is_active: r.is_active ?? true,
        effective_from: r.effective_from,
        effective_to: r.effective_to,
        currency: r.currency || "PKR",
        pay_frequency: r.pay_frequency || "monthly",
        notes: r.notes,
      })) as SalaryRecord[];
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

  // Derived
  const getStaffMember = useCallback(
    (userId: string) => staffMembers.find((s) => s.id === userId),
    [staffMembers],
  );
  const getStaffName = useCallback(
    (userId: string) => getStaffMember(userId)?.full_name || "Unknown",
    [getStaffMember],
  );

  const activeSalaries = useMemo(
    () => salaryRecords.filter((s) => s.is_active),
    [salaryRecords],
  );

  const filteredSalaries = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return salaryRecords.filter((r) => {
      if (!q) return true;
      const name = getStaffName(r.user_id).toLowerCase();
      const email = (getStaffMember(r.user_id)?.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [salaryRecords, staffSearch, getStaffMember, getStaffName]);

  const stats = useMemo(() => {
    const totals = activeSalaries.reduce(
      (acc, s) => {
        const net = s.base_salary + s.allowances - s.deductions;
        acc.gross += s.base_salary + s.allowances;
        acc.deductions += s.deductions;
        acc.net += net;
        acc.count += 1;
        if (net > acc.max) acc.max = net;
        if (acc.min === 0 || net < acc.min) acc.min = net;
        return acc;
      },
      { gross: 0, deductions: 0, net: 0, count: 0, max: 0, min: 0 },
    );
    const avg = totals.count ? totals.net / totals.count : 0;
    const completedPayRuns = payRuns.filter((p) => p.status === "completed").length;
    const draftPayRuns = payRuns.filter((p) => p.status === "draft").length;
    return { ...totals, avg, completedPayRuns, draftPayRuns };
  }, [activeSalaries, payRuns]);

  // Group pay runs by period
  const payRunBatches = useMemo<PayRunBatch[]>(() => {
    const map = new Map<string, PayRunBatch>();
    for (const r of payRuns) {
      const k = periodKey(r.period_start, r.period_end);
      let batch = map.get(k);
      if (!batch) {
        batch = {
          key: k,
          period_start: r.period_start,
          period_end: r.period_end,
          runs: [],
          gross: 0,
          deductions: 0,
          net: 0,
          draft: 0,
          processing: 0,
          completed: 0,
        };
        map.set(k, batch);
      }
      batch.runs.push(r);
      batch.gross += Number(r.gross_amount || 0);
      batch.deductions += Number(r.deductions || 0);
      batch.net += Number(r.net_amount || 0);
      if (r.status === "draft") batch.draft += 1;
      else if (r.status === "processing") batch.processing += 1;
      else if (r.status === "completed") batch.completed += 1;
    }
    return Array.from(map.values()).sort((a, b) =>
      b.period_end.localeCompare(a.period_end),
    );
  }, [payRuns]);

  const filteredBatches = useMemo(() => {
    if (statusFilter === "all") return payRunBatches;
    return payRunBatches
      .map((b) => ({
        ...b,
        runs: b.runs.filter((r) => r.status === statusFilter),
      }))
      .filter((b) => b.runs.length > 0);
  }, [payRunBatches, statusFilter]);

  // Selection helpers
  const toggleSelect = (uid: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredSalaries.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredSalaries.map((s) => s.user_id)));
    }
  };
  const selectedActiveSalaries = useMemo(
    () => activeSalaries.filter((s) => selectedUserIds.has(s.user_id)),
    [activeSalaries, selectedUserIds],
  );

  // Salary CRUD
  const resetSalaryForm = () => {
    setFormUserId("");
    setFormBaseSalary("");
    setFormAllowances("0");
    setFormDeductions("0");
    setFormCurrency("PKR");
    setFormFrequency("monthly");
    setFormEffectiveFrom(new Date().toISOString().split("T")[0]);
    setFormNotes("");
    setEditingSalary(null);
  };

  const openCreateSalary = () => {
    resetSalaryForm();
    setSalaryDialogOpen(true);
  };

  const openEditSalary = (rec: SalaryRecord) => {
    setEditingSalary(rec);
    setFormUserId(rec.user_id);
    setFormBaseSalary(String(rec.base_salary));
    setFormAllowances(String(rec.allowances));
    setFormDeductions(String(rec.deductions));
    setFormCurrency(rec.currency);
    setFormFrequency(rec.pay_frequency);
    setFormEffectiveFrom(rec.effective_from);
    setFormNotes(rec.notes || "");
    setSalaryDialogOpen(true);
  };

  const handleSaveSalary = async () => {
    if (!schoolId) return;
    if (!formUserId) return toast.error("Select a staff member");
    const base = Number(formBaseSalary);
    if (!Number.isFinite(base) || base <= 0)
      return toast.error("Base salary must be a positive number");

    const payload = {
      base_salary: base,
      allowances: Number(formAllowances) || 0,
      deductions: Number(formDeductions) || 0,
      currency: formCurrency,
      pay_frequency: formFrequency,
      effective_from: formEffectiveFrom,
      notes: formNotes.trim() || null,
    };

    if (editingSalary) {
      const { error } = await supabase
        .from("hr_salary_records")
        .update(payload)
        .eq("id", editingSalary.id);
      if (error) return toast.error(error.message);
      toast.success("Salary record updated");
    } else {
      // Close previous active record
      await supabase
        .from("hr_salary_records")
        .update({ is_active: false, effective_to: formEffectiveFrom })
        .eq("school_id", schoolId)
        .eq("user_id", formUserId)
        .eq("is_active", true);

      const { error } = await supabase.from("hr_salary_records").insert([
        {
          school_id: schoolId,
          user_id: formUserId,
          is_active: true,
          ...payload,
        },
      ]);
      if (error) return toast.error(error.message);
      toast.success("Salary record created");
    }
    setSalaryDialogOpen(false);
    resetSalaryForm();
    invalidate();
  };

  const handleDeleteSalary = async (id: string) => {
    const { error } = await supabase.from("hr_salary_records").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Salary record deleted");
    invalidate();
  };

  const handleToggleActive = async (rec: SalaryRecord) => {
    const { error } = await supabase
      .from("hr_salary_records")
      .update({
        is_active: !rec.is_active,
        effective_to: !rec.is_active ? null : new Date().toISOString().split("T")[0],
      })
      .eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success(rec.is_active ? "Salary deactivated" : "Salary re-activated");
    invalidate();
  };

  // Group operations on selected staff
  const handleGroupOp = async () => {
    if (!schoolId) return;
    const targets = selectedActiveSalaries;
    if (targets.length === 0) return toast.error("Select active staff first");

    if (groupOpType === "deactivate") {
      const ids = targets.map((t) => t.id);
      const { error } = await supabase
        .from("hr_salary_records")
        .update({
          is_active: false,
          effective_to: groupOpEffective,
        })
        .in("id", ids);
      if (error) return toast.error(error.message);
      toast.success(`Deactivated ${ids.length} salary record(s)`);
      setGroupOpDialogOpen(false);
      setSelectedUserIds(new Set());
      invalidate();
      return;
    }

    const value = Number(groupOpValue);
    if (!Number.isFinite(value) || value < 0)
      return toast.error("Enter a valid amount / percentage");

    // Build new versions of salary records and insert them, closing existing
    const newRows = targets.map((t) => {
      let base = t.base_salary;
      let allowances = t.allowances;
      let deductions = t.deductions;
      if (groupOpType === "raise_pct") {
        base = Math.round(base * (1 + value / 100));
      } else if (groupOpType === "raise_amt") {
        base = base + value;
      } else if (groupOpType === "bonus") {
        allowances = allowances + value;
      } else if (groupOpType === "deduction") {
        deductions = deductions + value;
      }
      return {
        school_id: schoolId,
        user_id: t.user_id,
        base_salary: base,
        allowances,
        deductions,
        is_active: true,
        effective_from: groupOpEffective,
        currency: t.currency,
        pay_frequency: t.pay_frequency,
        notes: groupOpReason.trim() || `Group ${groupOpType} ${value}`,
      };
    });

    // Close prior active records for those users
    const ids = targets.map((t) => t.id);
    const close = await supabase
      .from("hr_salary_records")
      .update({ is_active: false, effective_to: groupOpEffective })
      .in("id", ids);
    if (close.error) return toast.error(close.error.message);

    const ins = await supabase.from("hr_salary_records").insert(newRows);
    if (ins.error) return toast.error(ins.error.message);

    toast.success(`Applied to ${newRows.length} staff member(s)`);
    setGroupOpDialogOpen(false);
    setGroupOpValue("");
    setGroupOpReason("");
    setSelectedUserIds(new Set());
    invalidate();
  };

  // Pay run creation
  const resetPayRunForm = () => {
    setPrPeriodStart("");
    setPrPeriodEnd("");
    setPrNotes("");
    setPrScope("all");
    setPrMarkPaid(false);
  };

  const handleCreatePayRun = async () => {
    if (!schoolId) return;
    if (!prPeriodStart || !prPeriodEnd)
      return toast.error("Period start and end dates required");
    if (prPeriodEnd < prPeriodStart)
      return toast.error("Period end must be after start");

    const scope =
      prScope === "selected" ? selectedActiveSalaries : activeSalaries;
    if (scope.length === 0)
      return toast.error(
        prScope === "selected"
          ? "Select active staff first"
          : "No active salary records to process",
      );

    const now = new Date().toISOString();
    const rows = scope.map((salary) => ({
      school_id: schoolId,
      user_id: salary.user_id,
      period_start: prPeriodStart,
      period_end: prPeriodEnd,
      gross_amount: salary.base_salary + salary.allowances,
      deductions: salary.deductions,
      net_amount: salary.base_salary + salary.allowances - salary.deductions,
      status: prMarkPaid ? "completed" : "draft",
      paid_at: prMarkPaid ? now : null,
      notes: prNotes.trim() || null,
    }));

    const { error } = await supabase.from("hr_pay_runs").insert(rows);
    if (error) return toast.error(error.message);

    toast.success(`Created ${rows.length} pay slip(s) for the period`);
    setPayRunDialogOpen(false);
    resetPayRunForm();
    invalidate();
  };

  const handleUpdateRunStatus = async (id: string, status: string) => {
    const update: Record<string, unknown> = { status };
    if (status === "completed") update.paid_at = new Date().toISOString();
    if (status === "draft") update.paid_at = null;
    const { error } = await supabase.from("hr_pay_runs").update(update).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Pay slip ${status}`);
    invalidate();
  };

  const handleBatchStatus = async (batch: PayRunBatch, status: string) => {
    const update: Record<string, unknown> = { status };
    if (status === "completed") update.paid_at = new Date().toISOString();
    const ids = batch.runs.map((r) => r.id);
    const { error } = await supabase
      .from("hr_pay_runs")
      .update(update)
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${ids.length} pay slip(s) marked ${status}`);
    invalidate();
  };

  const handleDeleteRun = async (id: string) => {
    const { error } = await supabase.from("hr_pay_runs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pay slip deleted");
    invalidate();
  };

  const handleDeleteBatch = async (batch: PayRunBatch) => {
    const ids = batch.runs.map((r) => r.id);
    const { error } = await supabase.from("hr_pay_runs").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length} pay slip(s)`);
    invalidate();
  };

  // Payslips
  const runToPayslip = useCallback(
    (run: PayRun): PayslipData | null => {
      const salary = salaryRecords.find(
        (s) => s.user_id === run.user_id && s.is_active,
      );
      const staff = getStaffMember(run.user_id);
      if (!staff) return null;
      const schoolName =
        tenant.status === "ready" ? tenant.school?.name || "School" : "School";
      return {
        employeeName: staff.full_name,
        employeeEmail: staff.email || "",
        employeeId: run.user_id,
        periodStart: run.period_start,
        periodEnd: run.period_end,
        paidAt: run.paid_at,
        baseSalary:
          salary?.base_salary ||
          Number(run.gross_amount) - (salary?.allowances || 0),
        allowances: salary?.allowances || 0,
        deductions: run.deductions,
        grossAmount: run.gross_amount,
        netAmount: run.net_amount,
        currency: salary?.currency || "PKR",
        schoolName,
        payRunId: run.id,
        status: run.status,
      };
    },
    [salaryRecords, getStaffMember, tenant],
  );

  const handlePrintRun = (run: PayRun) => {
    const slip = runToPayslip(run);
    if (!slip) return toast.error("Staff member not found");
    openBulkPayslipsPDF([slip]);
  };

  const handleDownloadRun = (run: PayRun) => {
    const slip = runToPayslip(run);
    if (!slip) return toast.error("Staff member not found");
    downloadBulkPayslipsHTML([slip], run.period_start, run.period_end);
    toast.success("Payslip downloaded");
  };

  const handleBatchPrint = (batch: PayRunBatch) => {
    const slips = batch.runs
      .map(runToPayslip)
      .filter((s): s is PayslipData => !!s);
    if (slips.length === 0) return toast.error("No payslips to print");
    openBulkPayslipsPDF(slips);
  };

  const handleBatchDownload = (batch: PayRunBatch) => {
    const slips = batch.runs
      .map(runToPayslip)
      .filter((s): s is PayslipData => !!s);
    if (slips.length === 0) return toast.error("No payslips to download");
    downloadBulkPayslipsHTML(slips, batch.period_start, batch.period_end);
    toast.success(`Downloaded ${slips.length} payslip(s)`);
  };

  const openSalaryHistory = (userId: string) => {
    const staff = getStaffMember(userId);
    setSelectedEmployeeForHistory({
      id: userId,
      name: staff?.full_name || "Unknown",
    });
    setHistoryDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <CheckCircle className="mr-1 h-3 w-3" /> Paid
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20">
            <Play className="mr-1 h-3 w-3" /> Processing
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" /> Draft
          </Badge>
        );
    }
  };

  if ((loadingPayRuns || loadingSalaries) && !isUsingCache) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Estimated totals for pay run dialog
  const scopeSalaries = prScope === "selected" ? selectedActiveSalaries : activeSalaries;
  const scopeTotals = scopeSalaries.reduce(
    (acc, s) => {
      acc.gross += s.base_salary + s.allowances;
      acc.deductions += s.deductions;
      acc.net += s.base_salary + s.allowances - s.deductions;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 },
  );

  const allFilteredSelected =
    filteredSalaries.length > 0 &&
    filteredSalaries.every((s) => selectedUserIds.has(s.user_id));
  const someFilteredSelected =
    !allFilteredSelected &&
    filteredSalaries.some((s) => selectedUserIds.has(s.user_id));

  const currency = activeSalaries[0]?.currency || "PKR";

  return (
    <div className="space-y-6">
      <OfflineDataBanner
        isOffline={isOffline}
        isUsingCache={isUsingCache}
        onRefresh={handleRefresh}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4 text-primary" />}
          label="Active Staff"
          value={String(stats.count)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4 text-primary" />}
          label="Monthly Net"
          value={fmt(stats.net, currency)}
          highlight
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4 text-success" />}
          label="Avg Salary"
          value={fmt(stats.avg, currency)}
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4 text-destructive" />}
          label="Deductions"
          value={fmt(stats.deductions, currency)}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-grid sm:w-auto">
          <TabsTrigger value="salaries" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Salaries</span>
          </TabsTrigger>
          <TabsTrigger value="payruns" className="gap-1.5">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Pay Runs</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <PiggyBank className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* ============================== SALARIES ============================== */}
        <TabsContent value="salaries" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="font-display text-xl">
                    Employee Salaries
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure base pay, allowances, deductions and run group
                    operations.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      placeholder="Search staff…"
                      className="w-[180px] pl-8 sm:w-[220px]"
                    />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={selectedUserIds.size === 0}
                      >
                        Group actions ({selectedUserIds.size})
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Apply to selected</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupOpType("raise_pct");
                          setGroupOpDialogOpen(true);
                        }}
                      >
                        <Percent className="mr-2 h-4 w-4" /> Salary raise (%)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupOpType("raise_amt");
                          setGroupOpDialogOpen(true);
                        }}
                      >
                        <PlusIcon className="mr-2 h-4 w-4" /> Salary raise (amount)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupOpType("bonus");
                          setGroupOpDialogOpen(true);
                        }}
                      >
                        <TrendingUp className="mr-2 h-4 w-4" /> Add allowance / bonus
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setGroupOpType("deduction");
                          setGroupOpDialogOpen(true);
                        }}
                      >
                        <Minus className="mr-2 h-4 w-4" /> Add deduction
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setGroupOpType("deactivate");
                          setGroupOpDialogOpen(true);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Deactivate salaries
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={openCreateSalary} variant="hero">
                    <Plus className="mr-1 h-4 w-4" /> Add salary
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-auto">
                <div className="min-w-[760px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              allFilteredSelected
                                ? true
                                : someFilteredSelected
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">Allowances</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Freq.</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSalaries.map((record) => {
                        const net =
                          record.base_salary + record.allowances - record.deductions;
                        return (
                          <TableRow
                            key={record.id}
                            data-state={
                              selectedUserIds.has(record.user_id)
                                ? "selected"
                                : undefined
                            }
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedUserIds.has(record.user_id)}
                                onCheckedChange={() => toggleSelect(record.user_id)}
                                aria-label="Select row"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {getStaffName(record.user_id)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {getStaffMember(record.user_id)?.email}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {fmt(record.base_salary, record.currency)}
                            </TableCell>
                            <TableCell className="text-right text-success">
                              +{fmt(record.allowances, record.currency)}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              -{fmt(record.deductions, record.currency)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmt(net, record.currency)}
                            </TableCell>
                            <TableCell className="text-xs capitalize text-muted-foreground">
                              {record.pay_frequency}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={record.is_active ? "default" : "secondary"}
                                className="cursor-pointer"
                                onClick={() => handleToggleActive(record)}
                                title="Click to toggle"
                              >
                                {record.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openSalaryHistory(record.user_id)}
                                  title="History"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditSalary(record)}
                                  title="Edit"
                                >
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
                                      <AlertDialogTitle>
                                        Delete salary record?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This permanently removes the record. Use
                                        Deactivate instead to preserve history.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteSalary(record.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredSalaries.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={9}
                            className="py-10 text-center text-muted-foreground"
                          >
                            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                            No salary records found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================== PAY RUNS ============================== */}
        <TabsContent value="payruns" className="mt-4">
          <Card className="shadow-elevated">
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="font-display text-xl">Pay Runs</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Grouped by period — process individually or as a batch.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                  <Dialog
                    open={payRunDialogOpen}
                    onOpenChange={setPayRunDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button variant="hero" onClick={resetPayRunForm}>
                        <Plus className="mr-1 h-4 w-4" /> New pay run
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Create pay run</DialogTitle>
                        <DialogDescription>
                          Generates one payslip per included staff member.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Period start</Label>
                            <Input
                              type="date"
                              value={prPeriodStart}
                              onChange={(e) => setPrPeriodStart(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Period end</Label>
                            <Input
                              type="date"
                              value={prPeriodEnd}
                              onChange={(e) => setPrPeriodEnd(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Include</Label>
                          <Select
                            value={prScope}
                            onValueChange={(v) =>
                              setPrScope(v as "all" | "selected")
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All active staff ({activeSalaries.length})
                              </SelectItem>
                              <SelectItem value="selected">
                                Pick staff ({selectedActiveSalaries.length} selected)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {prScope === "selected" && (
                            <div className="mt-2 space-y-2">
                              {activeSalaries.length === 0 ? (
                                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                  No active salary records yet. Add a salary in the Salaries tab first.
                                </p>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between text-xs">
                                    <button
                                      type="button"
                                      className="text-primary hover:underline"
                                      onClick={() =>
                                        setSelectedUserIds(
                                          new Set(activeSalaries.map((s) => s.user_id)),
                                        )
                                      }
                                    >
                                      Select all
                                    </button>
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:underline"
                                      onClick={() => setSelectedUserIds(new Set())}
                                    >
                                      Clear
                                    </button>
                                  </div>
                                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                                    {activeSalaries.map((s) => {
                                      const checked = selectedUserIds.has(s.user_id);
                                      const net =
                                        s.base_salary + s.allowances - s.deductions;
                                      return (
                                        <label
                                          key={s.id}
                                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={() =>
                                              toggleSelect(s.user_id)
                                            }
                                          />
                                          <span className="flex-1 truncate">
                                            {getStaffName(s.user_id)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {fmt(net, s.currency)}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="mb-2 text-sm font-medium">
                            Estimated totals
                          </p>
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Gross</p>
                              <p className="font-semibold">
                                {fmt(scopeTotals.gross, currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Deductions
                              </p>
                              <p className="font-semibold text-destructive">
                                {fmt(scopeTotals.deductions, currency)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Net</p>
                              <p className="font-semibold text-primary">
                                {fmt(scopeTotals.net, currency)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={prMarkPaid}
                            onCheckedChange={(v) => setPrMarkPaid(!!v)}
                          />
                          Mark all as paid immediately
                        </label>
                        <div className="space-y-1.5">
                          <Label>Notes (optional)</Label>
                          <Textarea
                            value={prNotes}
                            onChange={(e) => setPrNotes(e.target.value)}
                            placeholder="e.g. February salary cycle"
                            rows={2}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setPayRunDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleCreatePayRun}>Create</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[640px] pr-2">
                <div className="space-y-4">
                  {filteredBatches.map((batch) => (
                    <PayRunBatchCard
                      key={batch.key}
                      batch={batch}
                      getStaffName={getStaffName}
                      currency={currency}
                      onBatchPrint={() => handleBatchPrint(batch)}
                      onBatchDownload={() => handleBatchDownload(batch)}
                      onMarkAllPaid={() => handleBatchStatus(batch, "completed")}
                      onMarkAllDraft={() => handleBatchStatus(batch, "draft")}
                      onDeleteBatch={() => handleDeleteBatch(batch)}
                      onRunPrint={handlePrintRun}
                      onRunDownload={handleDownloadRun}
                      onRunStatus={handleUpdateRunStatus}
                      onRunDelete={handleDeleteRun}
                      getStatusBadge={getStatusBadge}
                    />
                  ))}
                  {filteredBatches.length === 0 && (
                    <div className="py-10 text-center">
                      <Coins className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-muted-foreground">No pay runs yet</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================== ANALYTICS ============================== */}
        <TabsContent value="analytics" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="font-display text-lg">
                  Payroll snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Active employees" value={String(stats.count)} />
                <Row label="Total monthly gross" value={fmt(stats.gross, currency)} />
                <Row
                  label="Total monthly deductions"
                  value={fmt(stats.deductions, currency)}
                />
                <Row
                  label="Total monthly net"
                  value={fmt(stats.net, currency)}
                  emphasis
                />
                <Row label="Average net salary" value={fmt(stats.avg, currency)} />
                <Row label="Highest net salary" value={fmt(stats.max, currency)} />
                <Row label="Lowest net salary" value={fmt(stats.min, currency)} />
              </CardContent>
            </Card>
            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="font-display text-lg">Pay runs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Total pay slips" value={String(payRuns.length)} />
                <Row label="Drafts" value={String(stats.draftPayRuns)} />
                <Row label="Paid" value={String(stats.completedPayRuns)} emphasis />
                <Row label="Distinct periods" value={String(payRunBatches.length)} />
                {payRunBatches[0] && (
                  <Row
                    label="Latest period"
                    value={`${new Date(payRunBatches[0].period_start).toLocaleDateString()} – ${new Date(payRunBatches[0].period_end).toLocaleDateString()}`}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Salary dialog */}
      <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSalary ? "Edit salary record" : "Add salary record"}
            </DialogTitle>
            <DialogDescription>
              Configure compensation. Creating a new record automatically closes
              the previous active one for that staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              <StaffCombobox
                staff={staffMembers}
                value={formUserId}
                onChange={setFormUserId}
                disabled={!!editingSalary}
                placeholder="Select staff"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Base salary</Label>
                <Input
                  type="number"
                  value={formBaseSalary}
                  onChange={(e) => setFormBaseSalary(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Allowances</Label>
                <Input
                  type="number"
                  value={formAllowances}
                  onChange={(e) => setFormAllowances(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Deductions</Label>
                <Input
                  type="number"
                  value={formDeductions}
                  onChange={(e) => setFormDeductions(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input
                  value={formCurrency}
                  onChange={(e) => setFormCurrency(e.target.value.toUpperCase())}
                  maxLength={6}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Effective from</Label>
                <Input
                  type="date"
                  value={formEffectiveFrom}
                  onChange={(e) => setFormEffectiveFrom(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-lg bg-accent p-3">
              <p className="text-xs text-muted-foreground">Net salary preview</p>
              <p className="text-xl font-semibold">
                {fmt(
                  (Number(formBaseSalary) || 0) +
                    (Number(formAllowances) || 0) -
                    (Number(formDeductions) || 0),
                  formCurrency,
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSalary}>
              {editingSalary ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group op dialog */}
      <Dialog open={groupOpDialogOpen} onOpenChange={setGroupOpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {groupOpType === "raise_pct" && "Apply salary raise (%)"}
              {groupOpType === "raise_amt" && "Apply salary raise (amount)"}
              {groupOpType === "bonus" && "Add allowance / bonus"}
              {groupOpType === "deduction" && "Add deduction"}
              {groupOpType === "deactivate" && "Deactivate salaries"}
            </DialogTitle>
            <DialogDescription>
              Applies to {selectedActiveSalaries.length} active staff member(s).
              New salary records are created so history is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {groupOpType !== "deactivate" && (
              <div className="space-y-1.5">
                <Label>
                  {groupOpType === "raise_pct"
                    ? "Percentage (e.g. 10 for +10%)"
                    : "Amount"}
                </Label>
                <Input
                  type="number"
                  value={groupOpValue}
                  onChange={(e) => setGroupOpValue(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Effective from</Label>
              <Input
                type="date"
                value={groupOpEffective}
                onChange={(e) => setGroupOpEffective(e.target.value)}
              />
            </div>
            {groupOpType !== "deactivate" && (
              <div className="space-y-1.5">
                <Label>Reason / note (optional)</Label>
                <Input
                  value={groupOpReason}
                  onChange={(e) => setGroupOpReason(e.target.value)}
                  placeholder="Annual increment 2026"
                />
              </div>
            )}
            <div className="flex gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" />
              This is an additive change. Previous salary records are deactivated
              and remain in history.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGroupOpDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGroupOp}
              variant={groupOpType === "deactivate" ? "destructive" : "default"}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

/* -------- small presentational helpers -------- */

function StatCard({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="shadow-elevated min-w-0">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-1.5">{icon}</div>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <p
          className={`truncate text-lg font-bold tracking-tight sm:text-xl ${
            highlight ? "text-primary" : ""
          }`}
          title={value}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-semibold ${emphasis ? "text-primary" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function PayRunBatchCard({
  batch,
  getStaffName,
  currency,
  onBatchPrint,
  onBatchDownload,
  onMarkAllPaid,
  onMarkAllDraft,
  onDeleteBatch,
  onRunPrint,
  onRunDownload,
  onRunStatus,
  onRunDelete,
  getStatusBadge,
}: {
  batch: PayRunBatch;
  getStaffName: (id: string) => string;
  currency: string;
  onBatchPrint: () => void;
  onBatchDownload: () => void;
  onMarkAllPaid: () => void;
  onMarkAllDraft: () => void;
  onDeleteBatch: () => void;
  onRunPrint: (r: PayRun) => void;
  onRunDownload: (r: PayRun) => void;
  onRunStatus: (id: string, status: string) => void;
  onRunDelete: (id: string) => void;
  getStatusBadge: (s: string) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const periodLabel = `${new Date(batch.period_start).toLocaleDateString()} – ${new Date(batch.period_end).toLocaleDateString()}`;
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 items-center gap-2 text-left"
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{periodLabel}</p>
              <p className="text-xs text-muted-foreground">
                {batch.runs.length} payslip{batch.runs.length === 1 ? "" : "s"}
                {" · "}
                {batch.draft > 0 && `${batch.draft} draft `}
                {batch.processing > 0 && `${batch.processing} processing `}
                {batch.completed > 0 && `${batch.completed} paid`}
              </p>
            </div>
            <ChevronDown
              className={`ml-1 h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col items-end text-xs text-muted-foreground sm:text-right">
              <span>Gross {fmt(batch.gross, currency)}</span>
              <span className="font-semibold text-primary">
                Net {fmt(batch.net, currency)}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Batch <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onBatchPrint}>
                  <FileText className="mr-2 h-4 w-4" /> Print all payslips
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onBatchDownload}>
                  <Download className="mr-2 h-4 w-4" /> Download all payslips
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onMarkAllPaid}>
                  <CheckCircle className="mr-2 h-4 w-4" /> Mark all as paid
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMarkAllDraft}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Reset all to draft
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete entire batch
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete batch?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Deletes all {batch.runs.length} payslips for{" "}
                        {periodLabel}. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDeleteBatch}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {expanded && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batch.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {getStaffName(run.user_id)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(run.gross_amount, currency)}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      -{fmt(run.deductions, currency)}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      {fmt(run.net_amount, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRunPrint(run)}
                          title="Print"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRunDownload(run)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {run.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRunStatus(run.id, "processing")}
                            title="Start"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {run.status !== "completed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRunStatus(run.id, "completed")}
                            title="Mark paid"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {run.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRunStatus(run.id, "draft")}
                            title="Reset to draft"
                          >
                            <RefreshCw className="h-4 w-4" />
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
                              <AlertDialogTitle>Delete payslip?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Removes this individual payslip.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onRunDelete(run.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
