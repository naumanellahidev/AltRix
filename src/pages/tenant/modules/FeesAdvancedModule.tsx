import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Trash2, Receipt, Settings as SettingsIcon, Wallet, FileText, Users as UsersIcon, CreditCard, Send, BarChart3, Search, X, Edit2, Eye, Download, Printer, SlidersHorizontal, Filter, RefreshCw } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

  const [tab, setTab] = useState("assignments");

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
  const [assignFilterSection, setAssignFilterSection] = useState<string>("__all");
  const [assignSearch, setAssignSearch] = useState("");
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ class_id: "", section_id: "__all", fee_plan_id: "", discount_pct: 0, scholarship_amount: 0 });

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

  // expenses
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expSearch, setExpSearch] = useState("");
  const [expCategory, setExpCategory] = useState("__all");
  const [expFromDate, setExpFromDate] = useState("");
  const [expToDate, setExpToDate] = useState("");
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    description: "",
    category: "salaries",
    amount: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    vendor: "",
    payment_method_id: "",
    reference: ""
  });
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);
  const [viewExpense, setViewExpense] = useState<any | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [payMethods, setPayMethods] = useState<any[]>([]);
  const [showExpFilters, setShowExpFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reloadData = async (silent = false) => {
    if (!schoolId) return;
    if (!silent) setRefreshing(true);
    try {
      const [cRes, sRes, stRes, settRes, pRes, iRes, aRes, invRes, payRes, expRes, pmRes] = await Promise.all([
        supabase.from("academic_classes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId).order("name"),
        supabase.from("students").select("id, first_name, last_name, parent_phone, parent_email").eq("school_id", schoolId).order("first_name").limit(2000),
        supabase.from("fee_settings").select("*").eq("school_id", schoolId).maybeSingle(),
        supabase.from("fee_plans").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }),
        supabase.from("fee_plan_items").select("*").eq("school_id", schoolId),
        supabase.from("student_fee_assignments").select("id, student_id, fee_plan_id, discount_pct, scholarship_amount").eq("school_id", schoolId),
        supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500),
        supabase.from("fee_payments").select("*").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(500),
        supabase.from("finance_expenses").select("*").eq("school_id", schoolId).order("expense_date", { ascending: false }).limit(500),
        supabase.from("finance_payment_methods").select("id, name, type").eq("school_id", schoolId).eq("is_active", true),
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
      setExpenses((expRes.data as any[]) || []);
      setPayMethods(pmRes.data || []);
      if (!silent) toast.success("Advanced operations ledger refreshed");
    } catch (err) {
      if (!silent) toast.error("Failed to refresh ledger");
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  // ---------- LOAD ----------
  useEffect(() => {
    reloadData(true);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_expenses", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("finance_expenses").select("*").eq("school_id", schoolId).order("expense_date", { ascending: false }).limit(500);
        setExpenses(data || []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_fee_assignments", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("student_fee_assignments").select("id, student_id, fee_plan_id, discount_pct, scholarship_amount").eq("school_id", schoolId);
        setAssignments((data as StudentAssignment[]) || []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_plans", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("fee_plans").select("*").eq("school_id", schoolId).order("created_at", { ascending: false });
        setPlans((data as FeePlanRow[]) || []);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fee_plan_items", filter: `school_id=eq.${schoolId}` }, async () => {
        const { data } = await supabase.from("fee_plan_items").select("*").eq("school_id", schoolId);
        setItems((data as FeePlanItem[]) || []);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [schoolId]);

  const studentsById = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const plansById = useMemo(() => Object.fromEntries(plans.map(p => [p.id, p])), [plans]);
  const planItems = useMemo(() => items.filter(i => i.fee_plan_id === selectedPlanId).sort((a, b) => a.sort_order - b.sort_order), [items, selectedPlanId]);
  const planSubtotal = useMemo(() => planItems.reduce((s, i) => s + Number(i.amount), 0), [planItems]);

  // ---------- EXPENSES ----------
  const startEditExpense = (expense: any) => {
    setEditExpenseId(expense.id);
    setExpForm({
      description: expense.description || "",
      category: expense.category || "salaries",
      amount: String(expense.amount),
      expense_date: (expense.expense_date || "").slice(0, 10),
      vendor: expense.vendor || "",
      payment_method_id: expense.payment_method_id || "",
      reference: expense.reference || "",
    });
    setExpOpen(true);
  };

  const recordExpense = async () => {
    if (!schoolId || !expForm.description || !expForm.amount || !expForm.expense_date) {
      return toast.error("Description, amount and date are required");
    }
    const payload = {
      school_id: schoolId,
      description: expForm.description,
      amount: Number(expForm.amount),
      category: expForm.category,
      expense_date: expForm.expense_date,
      vendor: expForm.vendor || null,
      payment_method_id: expForm.payment_method_id || null,
      reference: expForm.reference || null,
    };

    if (editExpenseId) {
      const { data, error } = await supabase
        .from("finance_expenses")
        .update(payload)
        .eq("id", editExpenseId)
        .select("*")
        .single();
      if (error) return toast.error(error.message);
      toast.success("Expense updated");
      setExpenses(expenses.map(e => (e.id === editExpenseId ? data : e)));
      setEditExpenseId(null);
      setExpOpen(false);
      setExpForm({
        description: "",
        category: "salaries",
        amount: "",
        expense_date: format(new Date(), "yyyy-MM-dd"),
        vendor: "",
        payment_method_id: "",
        reference: "",
      });
    } else {
      const { data, error } = await supabase
        .from("finance_expenses")
        .insert(payload)
        .select("*")
        .single();
      if (error) return toast.error(error.message);
      toast.success("Expense recorded");
      setExpenses([data, ...expenses]);
      setExpOpen(false);
      setExpForm({
        description: "",
        category: "salaries",
        amount: "",
        expense_date: format(new Date(), "yyyy-MM-dd"),
        vendor: "",
        payment_method_id: "",
        reference: "",
      });
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("finance_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setExpenses(expenses.filter(e => e.id !== id));
    toast.success("Expense deleted");
  };

  const csvEscape = (val: any) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const exportExpensesCsv = () => {
    const headers = ["Date", "Category", "Vendor", "Description", "Amount", "Payment Method", "Reference"];
    const rows = filteredExpenses.map(e => {
      const payMethodName = payMethods.find(pm => pm.id === e.payment_method_id)?.name || "—";
      return [
        format(new Date(e.expense_date), "yyyy-MM-dd"),
        e.category,
        e.vendor || "—",
        e.description,
        e.amount,
        payMethodName,
        e.reference || "—"
      ];
    });

    const csvContent = [
      headers.map(csvEscape).join(","),
      ...rows.map(row => row.map(csvEscape).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `expenses_report_${format(new Date(), "yyyy_MM_dd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printExpensesReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window. Please allow popups.");

    const payMethodMap = Object.fromEntries(payMethods.map(pm => [pm.id, pm.name]));
    const totalFiltered = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const rowsHtml = filteredExpenses.map(e => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${format(new Date(e.expense_date), "MMM d, yyyy")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: capitalize;">${e.category}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${e.vendor || "—"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${e.description}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${payMethodMap[e.payment_method_id] || "—"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${e.reference || "—"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right; font-weight: bold;">${settings.currency} ${Number(e.amount).toLocaleString()}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Expenses Report</title>
          <style>
            body { font-family: sans-serif; color: #333; margin: 40px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f4f4f5; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 15px; }
            .summary { margin-top: 30px; text-align: right; font-size: 1.2em; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 style="margin: 0; font-size: 24px; color: #0f172a;">Expenses Report</h1>
              <p style="margin: 5px 0 0 0; color: #666;">School Expense Register</p>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0;"><b>Date:</b> ${format(new Date(), "MMM d, yyyy")}</p>
              <p style="margin: 5px 0 0 0; color: #666;"><b>Records:</b> ${filteredExpenses.length}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Description</th>
                <th>Payment Method</th>
                <th>Reference</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="summary">
            <b>Total Expenditures:</b> <span style="color: #b91c1c; font-weight: bold;">${settings.currency} ${totalFiltered.toLocaleString()}</span>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printSingleExpenseReceipt = (e: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Could not open print window. Please allow popups.");

    const payMethodName = payMethods.find(pm => pm.id === e.payment_method_id)?.name || "—";

    printWindow.document.write(`
      <html>
        <head>
          <title>Expense Voucher #${e.id.slice(0, 8).toUpperCase()}</title>
          <style>
            body { font-family: sans-serif; color: #333; margin: 40px; }
            .container { max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
            .row { display: flex; justify-content: space-between; margin: 12px 0; border-bottom: 1px dashed #e2e8f0; padding-bottom: 8px; }
            .label { font-weight: 600; color: #475569; }
            .value { color: #0f172a; }
            .amount-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; text-align: center; border-radius: 8px; margin-top: 25px; }
            .amount { font-size: 1.5em; font-weight: bold; color: #b91c1c; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div>
                <h2 style="margin: 0; color: #0f172a;">EXPENSE VOUCHER</h2>
                <small style="color: #64748b; font-family: monospace;">ID: ${e.id.toUpperCase()}</small>
              </div>
              <div style="text-align: right;">
                <p style="margin: 0; font-weight: bold;">Receipt Voucher</p>
              </div>
            </div>
            <div class="row">
              <span class="label">Date:</span>
              <span class="value">${format(new Date(e.expense_date), "MMMM d, yyyy")}</span>
            </div>
            <div class="row">
              <span class="label">Category:</span>
              <span class="value" style="text-transform: capitalize;">${e.category}</span>
            </div>
            <div class="row">
              <span class="label">Paid To / Vendor:</span>
              <span class="value">${e.vendor || "—"}</span>
            </div>
            <div class="row">
              <span class="label">Description:</span>
              <span class="value">${e.description}</span>
            </div>
            <div class="row">
              <span class="label">Payment Method:</span>
              <span class="value">${payMethodName}</span>
            </div>
            <div class="row">
              <span class="label">Reference / Slip #:</span>
              <span class="value">${e.reference || "—"}</span>
            </div>
            <div class="amount-box">
              <div class="label" style="margin-bottom: 5px;">Total Amount Paid</div>
              <div class="amount">${settings.currency} ${Number(e.amount).toLocaleString()}</div>
            </div>
            <div style="margin-top: 40px; display: flex; justify-content: space-between; color: #64748b; font-size: 0.85em;">
              <div>Prepared By: __________________</div>
              <div>Authorized By: __________________</div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filteredExpenses = useMemo(() => {
    const q = expSearch.trim().toLowerCase();
    return expenses.filter(e => {
      if (expCategory !== "__all" && e.category !== expCategory) return false;
      const day = (e.expense_date || "").slice(0, 10);
      if (expFromDate && day < expFromDate) return false;
      if (expToDate && day > expToDate) return false;
      if (q) {
        const hay = `${e.description} ${e.vendor || ""} ${e.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, expSearch, expCategory, expFromDate, expToDate]);

  const { mtdExpensesSum, totalExpensesSum, topCategory } = useMemo(() => {
    const now = new Date();
    const startOfMonthStr = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    let mtd = 0;
    let total = 0;
    const catMap: Record<string, number> = {};

    expenses.forEach(e => {
      const amt = Number(e.amount ?? 0);
      total += amt;
      const day = (e.expense_date || "").slice(0, 10);
      if (day >= startOfMonthStr) {
        mtd += amt;
      }
      catMap[e.category] = (catMap[e.category] || 0) + amt;
    });

    let topCat = "—";
    let maxAmt = 0;
    Object.entries(catMap).forEach(([cat, amt]) => {
      if (amt > maxAmt) {
        maxAmt = amt;
        topCat = cat;
      }
    });

    return { mtdExpensesSum: mtd, totalExpensesSum: total, topCategory: topCat };
  }, [expenses]);

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

  const filteredSectionsForAssignment = useMemo(() => {
    if (assignFilterClass === "__all") return [];
    return sections.filter(s => s.class_id === assignFilterClass);
  }, [sections, assignFilterClass]);

  const handleClassFilterChange = (val: string) => {
    setAssignFilterClass(val);
    setAssignFilterSection("__all");
  };

  // ---------- ASSIGNMENTS ----------
  const studentsForFilter = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    let list = students;
    if (assignFilterClass !== "__all") {
      if (assignFilterSection !== "__all") {
        list = list.filter(s => (s as any).class_section_id === assignFilterSection);
      } else {
        const sectionIds = sections.filter(s => s.class_id === assignFilterClass).map(s => s.id);
        list = list.filter(s => sectionIds.includes((s as any).class_section_id));
      }
    }
    if (q) {
      list = list.filter(s => 
        `${s.first_name} ${s.last_name || ""}`.toLowerCase().includes(q) || 
        (s.parent_email || "").toLowerCase().includes(q) || 
        (s.parent_phone || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [students, sections, assignFilterClass, assignFilterSection, assignSearch]);

  const handleBulkAssign = async () => {
    if (!schoolId || !bulkForm.class_id || !bulkForm.fee_plan_id) {
      toast.error("Please select both a class and a fee plan");
      return;
    }

    let targetSectionIds: string[] = [];
    if (bulkForm.section_id === "__all") {
      targetSectionIds = sections.filter(s => s.class_id === bulkForm.class_id).map(s => s.id);
    } else {
      targetSectionIds = [bulkForm.section_id];
    }

    if (targetSectionIds.length === 0) {
      toast.error("No sections found for this class");
      return;
    }

    const tId = toast.loading("Assigning plan in bulk...");
    try {
      const { data: enrolls, error: enrollsError } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("school_id", schoolId)
        .is("end_date", null)
        .in("class_section_id", targetSectionIds);

      if (enrollsError) throw enrollsError;

      const studentIds = Array.from(new Set((enrolls || []).map((e: any) => e.student_id)));
      if (studentIds.length === 0) {
        toast.error("No enrolled students found in selected class/section(s)", { id: tId });
        return;
      }

      // Fetch existing assignments for these students
      const { data: existingAssignments } = await supabase
        .from("student_fee_assignments")
        .select("id, student_id")
        .eq("school_id", schoolId)
        .in("student_id", studentIds);

      const existingMap = Object.fromEntries((existingAssignments || []).map(a => [a.student_id, a.id]));

      const upsertPayload = studentIds.map(sid => {
        const payload: any = {
          school_id: schoolId,
          student_id: sid,
          fee_plan_id: bulkForm.fee_plan_id,
          discount_pct: Number(bulkForm.discount_pct) || 0,
          scholarship_amount: Number(bulkForm.scholarship_amount) || 0
        };
        if (existingMap[sid]) {
          payload.id = existingMap[sid];
        }
        return payload;
      });

      const { error: upsertError } = await supabase
        .from("student_fee_assignments")
        .upsert(upsertPayload);

      if (upsertError) throw upsertError;

      toast.success(`Successfully assigned plan to ${studentIds.length} students`, { id: tId });
      setBulkAssignOpen(false);

      // Refresh assignments
      const { data: refreshed } = await supabase
        .from("student_fee_assignments")
        .select("id, student_id, fee_plan_id, discount_pct, scholarship_amount")
        .eq("school_id", schoolId);
      setAssignments((refreshed as StudentAssignment[]) || []);
    } catch (err: any) {
      toast.error("Bulk assignment failed: " + (err.message || err), { id: tId });
    }
  };

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
      if (error) { toast.error(error.message); return; }
      setAssignments(assignments.map(a => a.id === existing.id ? (data as any) : a));
    } else {
      const { data, error } = await supabase.from("student_fee_assignments").insert(payload).select("*").single();
      if (error) { toast.error(error.message); return; }
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
    const amount = Number(payForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return toast.error("Amount must be a positive number");
    }

    const inv = invoices.find(i => i.id === payForm.invoice_id);
    if (!inv) return toast.error("Invoice not found");

    if (inv.status === "paid" || inv.paid_amount >= inv.total_amount) {
      return toast.error("This invoice is already fully paid.");
    }

    const remainingBalance = inv.total_amount - inv.paid_amount;
    if (amount > remainingBalance) {
      return toast.error(`Payment amount exceeds the remaining balance of Rs. ${remainingBalance.toLocaleString()}`);
    }

    const { error: paymentError } = await supabase.from("fee_payments").insert({
      school_id: schoolId, invoice_id: inv.id, student_id: inv.student_id,
      amount, method: payForm.method as any, status: "success",
      transaction_ref: payForm.transaction_ref || null, notes: payForm.notes || null,
      paid_at: new Date().toISOString()
    });
    if (paymentError) return toast.error(paymentError.message);

    // Automatically recalculate and update invoice status
    const remaining = inv.total_amount - (inv.paid_amount + amount);
    let nextStatus = "partial";
    if (remaining <= 0) {
      nextStatus = "paid";
    } else if (inv.paid_amount + amount === 0) {
      nextStatus = "pending";
    }

    const { error: invoiceError } = await supabase
      .from("fee_invoices")
      .update({
        paid_amount: inv.paid_amount + amount,
        status: nextStatus as any
      })
      .eq("id", inv.id);

    if (invoiceError) {
      toast.error("Payment logged, but failed to update invoice status: " + invoiceError.message);
    } else {
      toast.success("Payment recorded successfully");
    }

    setPayOpen(false);
    setPayForm({ invoice_id: "", amount: "", method: "cash", transaction_ref: "", notes: "" });
  };

  const statusVariant = (s: string): any => s === "paid" ? "default" : s === "overdue" ? "destructive" : s === "partial" ? "secondary" : "outline";
  const studentName = (sid: string) => { const s = studentsById[sid]; return s ? `${s.first_name} ${s.last_name || ""}`.trim() : sid.slice(0, 8); };

  if (!schoolId) return <div className="p-6 text-muted-foreground">Loading school…</div>;
  if (!canManage) return <div className="p-6 text-muted-foreground">You do not have access to fee management.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Fees</h1>
          <p className="text-muted-foreground">Manage fee plans, student assignments, invoices, and payments.</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => reloadData()}
          disabled={refreshing}
          title="Refresh Operations"
          className="h-9 w-9 rounded-xl border-blue-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50/50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Tabs defaultValue="assignments" value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full max-w-5xl h-auto gap-1">
          <TabsTrigger value="assignments"><UsersIcon className="h-4 w-4 mr-1" />Assignments</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-1" />Payments</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="h-4 w-4 mr-1" />Expenses</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1" />Analytics</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" />Settings</TabsTrigger>
        </TabsList>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments" className="space-y-4">
          <Card className="rounded-2xl border border-blue-50 shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-blue-50 gap-4">
              <div>
                <CardTitle className="font-display text-lg font-bold text-slate-800">Per-Student Plan Assignments & Overrides</CardTitle>
                <p className="text-xs text-muted-foreground">Assign fee plans and override scholarship or discount percentages.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setBulkAssignOpen(true)} className="rounded-xl h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs">
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Bulk Assign Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Search students by name, parent email/phone…" className="pl-8 pr-8 rounded-xl border-blue-100 h-9 text-xs focus-visible:ring-blue-500" />
                  {assignSearch && (
                    <button type="button" onClick={() => setAssignSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select value={assignFilterClass} onValueChange={handleClassFilterChange}>
                  <SelectTrigger className="w-[200px] rounded-xl border-blue-100 h-9 text-xs"><SelectValue placeholder="Filter by class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All classes</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {assignFilterClass !== "__all" && (
                  <Select value={assignFilterSection} onValueChange={setAssignFilterSection}>
                    <SelectTrigger className="w-[200px] rounded-xl border-blue-100 h-9 text-xs"><SelectValue placeholder="Filter by section" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All sections</SelectItem>
                      {filteredSectionsForAssignment.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="rounded-2xl border border-blue-50 overflow-hidden">
                <Table>
                  <TableHeader className="bg-blue-50/20">
                    <TableRow className="border-blue-50 hover:bg-transparent">
                      <TableHead className="text-slate-700 text-xs font-semibold py-2">Student</TableHead>
                      <TableHead className="text-slate-700 text-xs font-semibold py-2">Plan</TableHead>
                      <TableHead className="text-slate-700 text-xs font-semibold py-2">Discount %</TableHead>
                      <TableHead className="text-slate-700 text-xs font-semibold py-2">Scholarship</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentsForFilter.slice(0, 200).map(st => {
                      const a = assignments.find(x => x.student_id === st.id);
                      return (
                        <StudentAssignmentRow
                          key={st.id}
                          st={st}
                          a={a}
                          plans={plans}
                          sections={sections}
                          classes={classes}
                          onSave={setStudentAssignment}
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {studentsForFilter.length > 200 && <p className="text-xs text-muted-foreground">Showing first 200 — narrow filters for full list.</p>}
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

        {/* EXPENSES */}
        <TabsContent value="expenses" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="relative overflow-hidden bg-gradient-to-br from-red-500/5 to-rose-500/5 border border-red-500/10 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MTD Operating Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-red-600 dark:text-red-400">{settings.currency} {mtdExpensesSum.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Operating costs logged during this calendar month</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-500/5 to-blue-500/5 border border-indigo-500/10 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Logged Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-indigo-600 dark:text-indigo-400">{settings.currency} {totalExpensesSum.toLocaleString()}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Cumulative tracked institutional expenditure</p>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Cost Center</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-display text-amber-600 dark:text-amber-400 capitalize">{topCategory}</div>
                <p className="text-[10px] text-muted-foreground mt-1">Cost segment with highest relative value</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b gap-4">
              <div>
                <CardTitle className="font-display text-lg font-bold">Expense Register</CardTitle>
                <p className="text-xs text-muted-foreground">Log and monitor outlays, supplier settlements, and operating costs.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowExpFilters(!showExpFilters)} 
                  className={`rounded-xl h-9 text-xs border ${showExpFilters ? "bg-primary/5 border-primary text-primary" : "border-muted-foreground/20"}`}
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <span>Filters</span>
                  {((expSearch ? 1 : 0) + (expCategory !== "__all" ? 1 : 0) + (expFromDate ? 1 : 0) + (expToDate ? 1 : 0)) > 0 && (
                    <Badge variant="default" className="ml-1.5 px-1.5 py-0 h-4 min-w-4 text-[9px] rounded-full flex items-center justify-center">
                      {((expSearch ? 1 : 0) + (expCategory !== "__all" ? 1 : 0) + (expFromDate ? 1 : 0) + (expToDate ? 1 : 0))}
                    </Badge>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={exportExpensesCsv} className="rounded-xl h-9 text-xs border-muted-foreground/20"><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button>
                <Button variant="outline" size="sm" onClick={printExpensesReport} className="rounded-xl h-9 text-xs border-muted-foreground/20"><Printer className="h-3.5 w-3.5 mr-1.5" />Print Report</Button>
                <Button onClick={() => {
                  setEditExpenseId(null);
                  setExpForm({
                    description: "",
                    category: "salaries",
                    amount: "",
                    expense_date: format(new Date(), "yyyy-MM-dd"),
                    vendor: "",
                    payment_method_id: "",
                    reference: "",
                  });
                  setExpOpen(true);
                }} className="rounded-xl h-9 text-xs shadow-sm"><Plus className="h-3.5 w-3.5 mr-1.5" />Log Expense</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Expandable Advanced Filters Accordion */}
              <div className={`transition-all duration-300 ease-in-out border-b bg-muted/20 overflow-hidden ${showExpFilters ? "max-h-[300px] p-4 opacity-100" : "max-h-0 opacity-0 pointer-events-none"}`}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 space-y-1">
                    <Label className="text-xs text-muted-foreground">Search text</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={expSearch} onChange={e => setExpSearch(e.target.value)} placeholder="Search description, supplier..." className="pl-8 h-9 rounded-xl text-xs" />
                      {expSearch && (
                        <button type="button" onClick={() => setExpSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select value={expCategory} onValueChange={setExpCategory}>
                      <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All categories</SelectItem>
                        <SelectItem value="rent">Rent</SelectItem>
                        <SelectItem value="utilities">Utilities</SelectItem>
                        <SelectItem value="salaries">Salaries & Wages</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="supplies">Supplies & Material</SelectItem>
                        <SelectItem value="marketing">Marketing & CRM</SelectItem>
                        <SelectItem value="taxes">Taxes & Levies</SelectItem>
                        <SelectItem value="software">Software & IT</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-5 grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">From Date</Label>
                      <Input type="date" className="h-9 rounded-xl text-xs" value={expFromDate} onChange={e => setExpFromDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">To Date</Label>
                      <Input type="date" className="h-9 rounded-xl text-xs" value={expToDate} onChange={e => setExpToDate(e.target.value)} />
                    </div>
                  </div>
                </div>
                {((expSearch ? 1 : 0) + (expCategory !== "__all" ? 1 : 0) + (expFromDate ? 1 : 0) + (expToDate ? 1 : 0)) > 0 && (
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setExpSearch(""); setExpCategory("__all"); setExpFromDate(""); setExpToDate(""); }} className="text-xs h-7 px-2.5 rounded-lg text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3 mr-1" /> Reset Filters
                    </Button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6 py-3">Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                          No expense vouchers found matching the active filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.slice(0, 200).map(e => (
                        <TableRow key={e.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="pl-6 py-3.5 text-xs font-semibold">{format(new Date(e.expense_date), "MMM d, ytd") === "Invalid Date" ? e.expense_date : format(new Date(e.expense_date), "MMM d, yyyy")}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize rounded-md text-[10px] px-1.5 py-0.5">{e.category}</Badge></TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{e.vendor || "—"}</TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={e.description}>{e.description}</TableCell>
                          <TableCell className="text-right font-bold text-xs text-foreground">{settings.currency} {Number(e.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex justify-end gap-1.5">
                              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => { setViewExpense(e); setViewOpen(true); }} title="View details">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canManage && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5" onClick={() => startEditExpense(e)} title="Edit voucher">
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5" onClick={() => deleteExpense(e.id)} title="Delete voucher">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
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
        </TabsContent>

        {/* ANALYTICS */}
        <TabsContent value="analytics" className="space-y-4">
          <FeesAnalyticsTab
            schoolId={schoolId}
            currency={settings.currency}
            invoices={invoices as any}
            payments={payments as any}
            students={students as any}
            expenses={expenses}
            onRefresh={async () => {
              const [invRes, payRes, expRes] = await Promise.all([
                supabase.from("fee_invoices").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(500),
                supabase.from("fee_payments").select("*").eq("school_id", schoolId).order("paid_at", { ascending: false }).limit(500),
                supabase.from("finance_expenses").select("*").eq("school_id", schoolId).order("expense_date", { ascending: false }).limit(500),
              ]);
              setInvoices((invRes.data as FeeInvoice[]) || []);
              setPayments((payRes.data as FeePayment[]) || []);
              setExpenses((expRes.data as any[]) || []);
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

      {/* Expense Dialog */}
      <Dialog open={expOpen} onOpenChange={setExpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editExpenseId ? "Edit Expense" : "Log Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Description</Label><Input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} placeholder="e.g. Electricity Bill June" /></div>
            <div><Label>Category</Label>
              <Select value={expForm.category} onValueChange={v => setExpForm({ ...expForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">Rent</SelectItem>
                  <SelectItem value="utilities">Utilities</SelectItem>
                  <SelectItem value="salaries">Salaries & Wages</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="supplies">Supplies & Material</SelectItem>
                  <SelectItem value="marketing">Marketing & CRM</SelectItem>
                  <SelectItem value="taxes">Taxes & Levies</SelectItem>
                  <SelectItem value="software">Software & IT</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} /></div>
            <div><Label>Expense Date</Label><Input type="date" value={expForm.expense_date} onChange={e => setExpForm({ ...expForm, expense_date: e.target.value })} /></div>
            <div><Label>Vendor / Paid To</Label><Input value={expForm.vendor} onChange={e => setExpForm({ ...expForm, vendor: e.target.value })} placeholder="e.g. Electric Supply Co." /></div>
            <div><Label>Payment Method</Label>
              <Select value={expForm.payment_method_id || ""} onValueChange={v => setExpForm({ ...expForm, payment_method_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Payment Method" />
                </SelectTrigger>
                <SelectContent>
                  {payMethods.map(pm => (
                    <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference / Slip #</Label><Input value={expForm.reference} onChange={e => setExpForm({ ...expForm, reference: e.target.value })} placeholder="e.g. Chq-10293, Bank Ref, etc." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button><Button onClick={recordExpense}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Expense Detail Modal (Split-Screen Design) */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-[820px] rounded-3xl p-0 overflow-hidden">
          {viewExpense && (
            <div className="grid grid-cols-1 md:grid-cols-2">
              {/* Left Side: Metadata Logs */}
              <div className="p-6 space-y-5 flex flex-col justify-between border-b md:border-b-0 md:border-r bg-muted/10">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-lg text-foreground">Voucher Metadata</h3>
                    <p className="text-xs text-muted-foreground">Audit trails and transaction properties.</p>
                  </div>
                  
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Date Logged</Label>
                        <p className="font-semibold text-foreground mt-0.5">{format(new Date(viewExpense.expense_date), "MMMM d, yyyy")}</p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost Center</Label>
                        <p className="font-semibold text-foreground mt-0.5 capitalize">{viewExpense.category}</p>
                      </div>
                    </div>
                    
                    <div className="border-t pt-2.5">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Supplier / Payee</Label>
                      <p className="font-semibold text-foreground text-sm mt-0.5">{viewExpense.vendor || "—"}</p>
                    </div>

                    <div className="border-t pt-2.5">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</Label>
                      <p className="text-muted-foreground text-xs leading-relaxed mt-0.5">{viewExpense.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2.5">
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Settlement Way</Label>
                        <p className="font-semibold text-foreground mt-0.5">
                          {payMethods.find(pm => pm.id === viewExpense.payment_method_id)?.name || "—"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Reference Slip</Label>
                        <p className="font-mono font-semibold text-foreground mt-0.5">{viewExpense.reference || "—"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t mt-4">
                  <Button variant="outline" size="sm" className="rounded-xl flex-1 text-xs" onClick={() => printSingleExpenseReceipt(viewExpense)}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Voucher
                  </Button>
                  <Button variant="default" size="sm" className="rounded-xl flex-1 text-xs" onClick={() => setViewOpen(false)}>Close Log</Button>
                </div>
              </div>

              {/* Right Side: Virtual Receipt Mock */}
              <div className="p-6 flex flex-col justify-center items-center bg-card relative min-h-[360px]">
                {/* Decorative Scissors Cut Line */}
                <div className="absolute top-4 left-0 right-0 flex items-center justify-center pointer-events-none opacity-20">
                  <span className="border-t border-dashed w-[90%] border-foreground" />
                </div>
                
                {/* Visual Voucher Slip */}
                <div className="w-full max-w-[280px] border border-muted-foreground/30 p-5 rounded-2xl shadow-lg bg-surface/50 border-dashed space-y-4 flex flex-col justify-between select-none">
                  <div className="text-center space-y-1">
                    <p className="font-display font-extrabold text-[10px] tracking-widest text-muted-foreground uppercase">Expense Slip</p>
                    <p className="font-mono text-[9px] text-muted-foreground">ID: #{viewExpense.id?.slice(0, 8).toUpperCase()}</p>
                  </div>
                  
                  <div className="space-y-2 py-2 border-y border-dashed border-muted-foreground/30 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">DATE:</span>
                      <span className="font-bold">{format(new Date(viewExpense.expense_date), "yyyy-MM-dd")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PAYEE:</span>
                      <span className="font-bold truncate max-w-[140px]">{viewExpense.vendor || "CASH OUT"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SLIP #:</span>
                      <span className="font-bold">{viewExpense.reference?.slice(0, 10) || "—"}</span>
                    </div>
                  </div>

                  <div className="text-center space-y-1.5 pt-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Debited</p>
                    <p className="text-xl font-extrabold text-red-600 dark:text-red-400">
                      {settings.currency} {Number(viewExpense.amount).toLocaleString()}
                    </p>
                  </div>

                  {/* Stamp Graphic */}
                  <div className="flex justify-center pt-2">
                    <div className="border-[2px] border-emerald-500/50 text-emerald-500/60 font-mono font-bold text-[10px] px-2.5 py-0.5 rounded rotate-12 uppercase tracking-widest select-none">
                      Paid & Cleared
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Fee Plan Dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-2xl border-blue-100">
          <DialogHeader>
            <DialogTitle className="text-slate-800 font-display font-bold">Bulk Assign Fee Plan</DialogTitle>
            <DialogDescription>Assign a fee plan and discount values to all students of a class or section.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label>Select Class</Label>
              <Select value={bulkForm.class_id} onValueChange={v => setBulkForm({ ...bulkForm, class_id: v, section_id: "__all" })}>
                <SelectTrigger className="rounded-xl border-blue-100">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {bulkForm.class_id && (
              <div className="space-y-1.5">
                <Label>Select Section</Label>
                <Select value={bulkForm.section_id} onValueChange={v => setBulkForm({ ...bulkForm, section_id: v })}>
                  <SelectTrigger className="rounded-xl border-blue-100">
                    <SelectValue placeholder="All Sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All Sections</SelectItem>
                    {sections.filter(s => s.class_id === bulkForm.class_id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Select Fee Plan</Label>
              <Select value={bulkForm.fee_plan_id} onValueChange={v => setBulkForm({ ...bulkForm, fee_plan_id: v })}>
                <SelectTrigger className="rounded-xl border-blue-100">
                  <SelectValue placeholder="Select Plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Discount (%)</Label>
                <Input
                  type="number"
                  value={bulkForm.discount_pct}
                  onChange={(e) => setBulkForm({ ...bulkForm, discount_pct: Number(e.target.value) || 0 })}
                  className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scholarship (Rs.)</Label>
                <Input
                  type="number"
                  value={bulkForm.scholarship_amount}
                  onChange={(e) => setBulkForm({ ...bulkForm, scholarship_amount: Number(e.target.value) || 0 })}
                  className="rounded-xl border-blue-100 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignOpen(false)} className="rounded-xl border-blue-100">
              Cancel
            </Button>
            <Button onClick={handleBulkAssign} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              Apply Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface StudentAssignmentRowProps {
  st: StudentRow;
  a: StudentAssignment | undefined;
  plans: FeePlanRow[];
  sections: SectionRow[];
  classes: ClassRow[];
  onSave: (studentId: string, planId: string | null, opts?: { discount_pct?: number; scholarship_amount?: number }) => Promise<void>;
}

function StudentAssignmentRow({
  st,
  a,
  plans,
  sections,
  classes,
  onSave
}: StudentAssignmentRowProps) {
  const [discount, setDiscount] = useState<string>(String(a?.discount_pct ?? 0));
  const [scholarship, setScholarship] = useState<string>(String(a?.scholarship_amount ?? 0));

  useEffect(() => {
    setDiscount(String(a?.discount_pct ?? 0));
    setScholarship(String(a?.scholarship_amount ?? 0));
  }, [a]);

  const section = sections.find(sec => sec.id === st.class_section_id);
  const cls = classes.find(c => c.id === section?.class_id);
  const classSectionName = section && cls ? `${cls.name} - ${section.name}` : "Unassigned";

  const handleBlurDiscount = () => {
    const val = Number(discount) || 0;
    if (val !== (a?.discount_pct ?? 0)) {
      onSave(st.id, a!.fee_plan_id, { discount_pct: val });
    }
  };

  const handleBlurScholarship = () => {
    const val = Number(scholarship) || 0;
    if (val !== (a?.scholarship_amount ?? 0)) {
      onSave(st.id, a!.fee_plan_id, { scholarship_amount: val });
    }
  };

  return (
    <TableRow className="hover:bg-blue-50/5 border-blue-50">
      <TableCell className="py-2.5">
        <div>
          <p className="font-semibold text-slate-800 text-xs">{st.first_name} {st.last_name || ""}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{classSectionName}</p>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <Select value={a?.fee_plan_id || "__none"} onValueChange={v => onSave(st.id, v === "__none" ? null : v)}>
          <SelectTrigger className="w-[240px] rounded-xl border-blue-100 h-8 text-xs focus:ring-blue-500">
            <SelectValue placeholder="Assign plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— No plan —</SelectItem>
            {plans.filter(p => p.is_active).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-2.5">
        <Input 
          type="number" 
          className="w-24 rounded-xl border-blue-100 h-8 text-xs focus-visible:ring-blue-500" 
          disabled={!a} 
          value={discount}
          onChange={e => setDiscount(e.target.value)}
          onBlur={handleBlurDiscount}
          onKeyDown={e => e.key === "Enter" && handleBlurDiscount()}
        />
      </TableCell>
      <TableCell className="py-2.5">
        <Input 
          type="number" 
          className="w-32 rounded-xl border-blue-100 h-8 text-xs focus-visible:ring-blue-500" 
          disabled={!a} 
          value={scholarship}
          onChange={e => setScholarship(e.target.value)}
          onBlur={handleBlurScholarship}
          onKeyDown={e => e.key === "Enter" && handleBlurScholarship()}
        />
      </TableCell>
    </TableRow>
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
