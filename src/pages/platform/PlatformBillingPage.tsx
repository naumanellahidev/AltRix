import { localDay } from "@/lib/local-date";
import { useEffect, useState, useMemo } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  ShieldAlert,
  Award,
  Receipt,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  PlusCircle,
  Database,
  Trash2,
  Settings,
  Pencil,
  Download,
  Printer,
  MessageCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  downloadPlatformInvoice,
  printPlatformInvoice,
  sharePlatformInvoice,
} from "@/lib/documents/platform-invoice";
import { describeShare } from "@/lib/documents/deliver";

interface SchoolBillingData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  /** "free" is what a school starts on until the platform sets a plan. */
  plan_tier: "free" | "Basic" | "Standard" | "Enterprise" | "Premium";
  billing_cycle: "monthly" | "yearly";
  billing_amount: number;
  next_billing_date: string;
  billing_status: "Active" | "Overdue" | "Suspended";
  billing_email?: string;
}

interface PlatformInvoice {
  id: string;
  school_id: string;
  school_name: string;
  invoice_number: string;
  amount: number;
  billing_date: string;
  due_date: string;
  status: "Paid" | "Unpaid" | "Overdue";
  paid_at?: string;
}

interface PlanTemplate {
  monthly: number;
  yearly: number;
}

interface PlanTemplates {
  Basic: PlanTemplate;
  Standard: PlanTemplate;
  Premium: PlanTemplate;
  Enterprise: PlanTemplate;
}

export default function PlatformBillingPage() {
  const [schools, setSchools] = useState<SchoolBillingData[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDbSchemaApplied, setIsDbSchemaApplied] = useState(true);

  // Editable Plan Templates state
  const [planTemplates, setPlanTemplates] = useState<PlanTemplates>(() => {
    const defaultTemplates = {
      Basic: { monthly: 15000, yearly: 150000 },
      Standard: { monthly: 30000, yearly: 300000 },
      Premium: { monthly: 45000, yearly: 450000 },
      Enterprise: { monthly: 75000, yearly: 750000 },
    };
    const saved = localStorage.getItem("platform_plan_templates");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          Basic: parsed?.Basic || defaultTemplates.Basic,
          Standard: parsed?.Standard || defaultTemplates.Standard,
          Premium: parsed?.Premium || defaultTemplates.Premium,
          Enterprise: parsed?.Enterprise || defaultTemplates.Enterprise,
        };
      } catch (e) {
        console.error("Error parsing plan templates", e);
      }
    }
    return defaultTemplates;
  });

  // Modal Dialog states
  const [selectedSchool, setSelectedSchool] = useState<SchoolBillingData | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Edit Invoice states
  const [editingInvoice, setEditingInvoice] = useState<PlatformInvoice | null>(null);
  const [isEditInvoiceModalOpen, setIsEditInvoiceModalOpen] = useState(false);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editBillingDate, setEditBillingDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState<"Paid" | "Unpaid" | "Overdue">("Unpaid");

  const handleOpenEditInvoiceModal = (inv: PlatformInvoice) => {
    setEditingInvoice(inv);
    setEditAmount(inv.amount);
    setEditBillingDate(inv.billing_date);
    setEditDueDate(inv.due_date);
    setEditStatus(inv.status);
    setIsEditInvoiceModalOpen(true);
  };

  // Edit Plan state variables
  const [newPlan, setNewPlan] = useState<"Basic" | "Standard" | "Enterprise" | "Premium">("Basic");
  const [newCycle, setNewCycle] = useState<"monthly" | "yearly">("monthly");
  const [newAmount, setNewAmount] = useState<number>(15000);
  const [newEmail, setNewEmail] = useState("");

  // Create Invoice state variables
  const [invoiceSchoolId, setInvoiceSchoolId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState<number>(15000);
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  // Temporary state for editing templates
  const [tempTemplates, setTempTemplates] = useState<PlanTemplates>(planTemplates);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch schools from Supabase
      const { data: schoolsData, error: schoolsError } = await api
        .from("schools")
        .select("*")
        .order("name", { ascending: true });

      if (schoolsError) throw schoolsError;

      // The billing columns are part of the schema (migrations 20260922030000
      // and 20261031000300). If they are missing, the server needs its
      // migrations — this used to switch to a "local simulation" that invented
      // plans, amounts and invoices in the browser.
      if (schoolsData && schoolsData.length > 0 && !("plan_tier" in schoolsData[0])) {
        setIsDbSchemaApplied(false);
        throw new Error("The billing columns are missing on the server; its migrations have not run.");
      }
      setIsDbSchemaApplied(true);

      // What is stored, and nothing else: a school with no amount or no billing
      // date shows as such, rather than as a template price due in 30 days.
      const mappedSchools: SchoolBillingData[] = (schoolsData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        is_active: s.is_active ?? true,
        plan_tier: s.plan_tier || "free",
        billing_cycle: s.billing_cycle || "monthly",
        billing_amount: Number(s.billing_amount ?? 0),
        next_billing_date: s.next_billing_date || "",
        billing_status: s.billing_status || "Active",
        billing_email: s.billing_email || s.email || "",
      }));

      setSchools(mappedSchools);

      // 2. The platform's invoices to schools.
      const { data: invoicesData, error: invoicesError } = await api
        .from("platform_invoices" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (invoicesError) throw invoicesError;
      setInvoices(
        (invoicesData ?? []).map((inv: any) => {
          const matchedSchool = mappedSchools.find((sch) => sch.id === inv.school_id);
          return {
            id: inv.id,
            school_id: inv.school_id,
            school_name: matchedSchool ? matchedSchool.name : "Unknown School",
            invoice_number: inv.invoice_number,
            amount: Number(inv.amount),
            billing_date: inv.billing_date,
            due_date: inv.due_date,
            status: inv.status,
            paid_at: inv.paid_at,
          };
        }),
      );
    } catch (err: any) {
      console.error("Error loading billing data:", err);
      toast.error(`Billing records could not be loaded: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Update billing plan values dynamically when modal values change
  useEffect(() => {
    const defaultAmt = planTemplates[newPlan]?.[newCycle] ?? 0;
    setNewAmount(defaultAmt);
  }, [newPlan, newCycle, planTemplates]);

  // Edit Plan trigger
  const handleOpenPlanModal = (school: SchoolBillingData) => {
    setSelectedSchool(school);
    setNewPlan(school.plan_tier === "free" ? "Basic" : school.plan_tier);
    setNewCycle(school.billing_cycle);
    setNewAmount(school.billing_amount);
    setNewEmail(school.billing_email || "");
    setIsPlanModalOpen(true);
  };

  // Save Plan configuration
  const handleSavePlan = async () => {
    if (!selectedSchool) return;

    try {
      if (isDbSchemaApplied) {
        // Save to Supabase
        const { error } = await api
          .from("schools")
          .update({
            plan_tier: newPlan,
            billing_cycle: newCycle,
            billing_amount: newAmount,
            billing_email: newEmail,
          } as any)
          .eq("id", selectedSchool.id);

        if (error) throw error;
      } else {
        // The columns exist now (migration 20260922030000). If this school row
        // still has no plan_tier, something is wrong with the database, and
        // saying so beats writing the plan into this one browser's
        // localStorage, where no invoice or renewal will ever see it.
        throw new Error(
          "This school's billing columns are missing from the database — the plan was not saved.",
        );
      }

      toast.success("Plan updated successfully!", {
        description: `${selectedSchool.name} is now on the ${newPlan} plan (${newCycle}).`,
      });

      setIsPlanModalOpen(false);
      void loadData();
    } catch (err: any) {
      toast.error(`Upgrade failed: ${err.message}`);
    }
  };

  // Open Create Invoice Modal
  const handleOpenInvoiceModal = () => {
    if (schools.length === 0) {
      return toast.error("No schools available to bill");
    }
    setInvoiceSchoolId(schools[0].id);
    setInvoiceAmount(schools[0].billing_amount);
    setInvoiceDueDate(localDay(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)));
    setInvoiceNotes("");
    setIsInvoiceModalOpen(true);
  };

  // Open Templates Modal
  const handleOpenTemplateModal = () => {
    setTempTemplates({ ...planTemplates });
    setIsTemplateModalOpen(true);
  };

  // Save editable plan templates
  const handleSaveTemplates = () => {
    setPlanTemplates(tempTemplates);
    localStorage.setItem("platform_plan_templates", JSON.stringify(tempTemplates));
    toast.success("Default plan templates updated successfully!", {
      description: "New default rates will apply to all subsequent plan selections."
    });
    setIsTemplateModalOpen(false);
    void loadData();
  };

  // Save manual Invoice
  const handleCreateInvoice = async () => {
    const matchedSchool = schools.find((s) => s.id === invoiceSchoolId);
    if (!matchedSchool) return toast.error("Invalid school selected");

    const invoiceNumber = `PLAT-INV-${localDay().replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      if (isDbSchemaApplied) {
        const { error } = await api
          .from("platform_invoices" as any)
          .insert({
            school_id: invoiceSchoolId,
            invoice_number: invoiceNumber,
            amount: invoiceAmount,
            billing_date: localDay(),
            due_date: invoiceDueDate,
            status: "Unpaid",
          });

        if (error) throw error;
      } else {
        throw new Error("Billing is not set up on the server, so nothing was saved.");
      }

      // No email goes out from here, so the message does not say one did.
      toast.success("Invoice recorded", {
        description: `${invoiceNumber} for ${matchedSchool.name}. Send it to ${matchedSchool.billing_email || "the school"} yourself — no email is sent automatically.`,
      });

      setIsInvoiceModalOpen(false);
      void loadData();
    } catch (err: any) {
      toast.error(`Invoice generation failed: ${err.message}`);
    }
  };

  // Run billing cycle / roll over checks
  const handleRunBillingCycle = async () => {
    toast.info("Running platform billing cycle checks...");

    try {
      if (isDbSchemaApplied) {
        const { data, error } = await api.rpc("cron_generate_platform_invoices" as any);
        if (error) throw error;

        const count = Number(data || 0);
        if (count > 0) {
          toast.success(`Billing cycle finished! Generated ${count} recurring invoice(s).`);
        } else {
          toast.success("Billing cycle finished! All schools are up to date.");
        }
      } else {
        throw new Error("Billing is not set up on the server, so nothing was saved.");
      }
      void loadData();
    } catch (err: any) {
      toast.error(`Billing cycle check failed: ${err.message}`);
    }
  };

  // Mark invoice as paid
  const handleMarkAsPaid = async (invId: string) => {
    try {
      if (isDbSchemaApplied) {
        const { error } = await api
          .from("platform_invoices" as any)
          .update({
            status: "Paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", invId);

        if (error) throw error;
      } else {
        throw new Error("Billing is not set up on the server, so nothing was saved.");
      }

      toast.success("Invoice marked as Paid!");
      void loadData();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  // Delete invoice
  const handleDeleteInvoice = async (invId: string) => {
    if (!confirm("Are you sure you want to delete this invoice record?")) return;

    try {
      if (isDbSchemaApplied) {
        const { error } = await api
          .from("platform_invoices" as any)
          .delete()
          .eq("id", invId);

        if (error) throw error;
      } else {
        throw new Error("Billing is not set up on the server, so nothing was saved.");
      }

      toast.success("Invoice deleted successfully");
      void loadData();
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  const handleSaveEditInvoice = async () => {
    if (!editingInvoice) return;
    try {
      if (isDbSchemaApplied) {
        const { error } = await api
          .from("platform_invoices" as any)
          .update({
            amount: editAmount,
            billing_date: editBillingDate,
            due_date: editDueDate,
            status: editStatus,
            paid_at: editStatus === "Paid" ? new Date().toISOString() : null,
          })
          .eq("id", editingInvoice.id);

        if (error) throw error;
      } else {
        throw new Error("Billing is not set up on the server, so nothing was saved.");
      }

      toast.success("Invoice updated successfully!");
      setIsEditInvoiceModalOpen(false);
      void loadData();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  /** Invoice (unpaid) or receipt (paid) as a PDF: download, print or share. */
  const handlePrintReceipt = async (inv: PlatformInvoice, kind: "download" | "print" | "share" = "download") => {
    const school = schools.find((s) => s.id === inv.school_id);
    const input = {
      invoiceNumber: inv.invoice_number,
      schoolName: inv.school_name,
      amount: inv.amount,
      billingDate: inv.billing_date,
      dueDate: inv.due_date,
      status: inv.status,
      paidAt: inv.paid_at ?? null,
      planTier: school?.plan_tier ?? null,
      billingCycle: school?.billing_cycle ?? null,
    };
    const id = toast.loading(inv.status === "Paid" ? "Preparing the receipt…" : "Preparing the invoice…");
    try {
      if (kind === "share") {
        const outcome = await sharePlatformInvoice(input);
        const { tone, message } = describeShare(outcome);
        const note = outcome.warnings.length ? ` Note: ${outcome.warnings.join("; ")}` : "";
        if (tone === "error") toast.error(message + note, { id });
        else if (tone === "info") toast.info(message + note, { id, duration: 9000 });
        else toast.success(message + note, { id });
        return;
      }
      const result: { warnings: string[]; fileName?: string } =
        kind === "print" ? await printPlatformInvoice(input) : await downloadPlatformInvoice(input);
      const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
      if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 10000 });
      else if (kind === "print") toast.dismiss(id);
      else toast.success(done, { id });
    } catch (e: any) {
      toast.error(`The document could not be produced: ${e?.message ?? String(e)}`, { id });
    }
  };

  // Calculations for KPIs
  const mrr = useMemo(() => {
    return schools
      .filter((s) => s.is_active)
      .reduce((sum, s) => {
        const monthlyCost = s.billing_cycle === "yearly" ? s.billing_amount / 12 : s.billing_amount;
        return sum + monthlyCost;
      }, 0);
  }, [schools]);

  const overdueInvoices = useMemo(() => {
    return invoices.filter((i) => i.status === "Overdue" || (i.status === "Unpaid" && new Date(i.due_date) < new Date())).length;
  }, [invoices]);

  const activeLicenses = useMemo(() => {
    return schools.filter((s) => s.is_active).length;
  }, [schools]);

  return (
    <SuperAdminShell
      title="04. Revenue & Subscriptions Engine"
      subtitle="Automated tier pricing rules, billing vouchers, PDF generation & grace period workflows"
    >
      <div className="space-y-6 text-slate-900">
        {/* DB Schema Missing Banner */}
        {!isDbSchemaApplied && (
          <Card className="bg-amber-950/20 border border-blue-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-700 font-semibold">
                <Database className="h-5 w-5" />
                <span>Billing is not set up on this server</span>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                The billing columns or the invoices table are missing, so nothing on this page can be shown or saved.
                Run the server's migrations (deploy) and reload.
              </p>
            </div>
            <Badge variant="outline" className="border-blue-200 text-blue-700 font-mono">
              20261031000300_platform_billing.sql
            </Badge>
          </Card>
        )}

        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border border-slate-200 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Monthly Recurring Revenue (MRR)
              </CardTitle>
              <div className="text-xs font-bold text-blue-700 font-mono">PKR / USD</div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900 font-mono">Rs. {mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-blue-700 font-semibold mt-1 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600" /> Live school license values in PKR ($14,250 USD eq.)
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    // The catch used to report success. Combined with apiClient
                    // never having been imported, every click threw and then
                    // claimed a dunning sweep had run across all overdue
                    // accounts — while nothing at all had happened.
                    try {
                      const res = await apiClient.post("/super_admin/billing/dunning/run", { grace_period_days: 5 });
                      toast.success(res.data?.message ?? "Dunning sweep completed", {
                        description: `Reminders sent: ${res.data?.summary?.reminders_sent ?? 0}, Read-only locks: ${res.data?.summary?.read_only_locks_applied ?? 0}`,
                      });
                    } catch (err: any) {
                      toast.error(
                        err?.response?.data?.detail ?? "Dunning sweep failed. No reminders were sent.",
                      );
                    }
                  }}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-slate-900 font-bold text-xs h-8 shadow-sm"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Execute Dunning Sweep
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Active Tenant Licenses
              </CardTitle>
              <Award className="h-4 w-4 text-blue-700" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">
                {activeLicenses} / {schools.length} Schools
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {schools.length - activeLicenses} inactive or disabled schools
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Unpaid / Overdue Invoices
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${overdueInvoices > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {overdueInvoices} Overdue
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {invoices.filter((i) => i.status === "Unpaid").length} total outstanding invoices
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Tables */}
        <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">School Subscription Plans</CardTitle>
              <p className="text-xs text-slate-500">Manage tier rates, cycle periods, and billing info for each school</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenTemplateModal}
                className="border-slate-200 bg-white hover:bg-blue-50 hover:text-blue-700"
              >
                <Settings className="mr-2 h-4 w-4" /> Edit Plan Templates
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunBillingCycle}
                className="border-slate-200 bg-white hover:bg-blue-50 hover:text-blue-700"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Run Billing Cycle
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader className="border-b border-slate-200">
                  <TableRow className="hover:bg-transparent border-b border-slate-200">
                    <TableHead className="text-slate-500 font-medium">School</TableHead>
                    <TableHead className="text-slate-500 font-medium">Plan Tier</TableHead>
                    <TableHead className="text-slate-500 font-medium">Billing Cycle</TableHead>
                    <TableHead className="text-slate-500 font-medium">Amount</TableHead>
                    <TableHead className="text-slate-500 font-medium">Next Invoice</TableHead>
                    <TableHead className="text-slate-500 font-medium">Notification Email</TableHead>
                    <TableHead className="text-right text-slate-500 font-medium">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-400">
                        Loading subscriptions data...
                      </TableCell>
                    </TableRow>
                  ) : schools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-400">
                        No registered schools found. Add a school first.
                      </TableCell>
                    </TableRow>
                  ) : (
                    schools.map((s) => (
                      <TableRow key={s.id} className="hover:bg-slate-50/20 border-b border-slate-200">
                        <TableCell className="font-semibold text-slate-900">
                          {s.name}
                          <span className="block text-[10px] text-slate-500 font-normal">/{s.slug}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-blue-600/15 text-blue-700 border border-slate-300">
                            {s.plan_tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize text-slate-700 text-xs">
                          {s.billing_cycle}
                        </TableCell>
                        <TableCell className="text-slate-700 font-mono">
                          {s.billing_amount > 0
                            ? `Rs. ${s.billing_amount.toLocaleString()}/${s.billing_cycle === "yearly" ? "yr" : "mo"}`
                            : "Not billed"}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">
                          {s.next_billing_date || "Not scheduled"}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs font-mono">
                          {s.billing_email || <span className="text-slate-500 italic">No email set</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleOpenPlanModal(s)}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0"
                          >
                            Manage Plan
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Records */}
        <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Platform Invoices</CardTitle>
              <p className="text-xs text-slate-500">View or manually issue invoices to schools</p>
            </div>
            <Button
              onClick={handleOpenInvoiceModal}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0 shadow-sm"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No billing invoices have been issued yet.
                </div>
              ) : (
                invoices.map((inv) => {
                  const isOverdue = inv.status === "Unpaid" && new Date(inv.due_date) < new Date();
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-50/10 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <Receipt className="h-5 w-5 text-blue-700 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{inv.invoice_number}</p>
                          <p className="text-xs text-slate-500">
                            {inv.school_name} · Billing: {inv.billing_date} · Due: {inv.due_date}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="text-sm font-mono text-slate-700">Rs. {inv.amount.toLocaleString()}</span>
                        <Badge
                          className={
                            inv.status === "Paid"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              : isOverdue
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                              : "bg-blue-600/15 text-blue-700 border border-slate-300"
                          }
                        >
                          {inv.status === "Paid" ? "Paid" : isOverdue ? "Overdue" : "Unpaid"}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {inv.status !== "Paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAsPaid(inv.id)}
                              className="border-slate-200 h-8 hover:bg-emerald-500/10 hover:text-emerald-400 text-xs px-2 animate-pulse"
                            >
                              Mark Paid
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditInvoiceModal(inv)}
                            className="h-8 w-8 text-slate-400 hover:text-blue-700"
                            title="Edit Invoice"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintReceipt(inv, "share")}
                            className="h-8 w-8 text-slate-400 hover:text-blue-700"
                            title={inv.status === "Paid" ? "Share receipt on WhatsApp" : "Share invoice on WhatsApp"}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintReceipt(inv, "print")}
                            className="h-8 w-8 text-slate-400 hover:text-blue-700"
                            title={inv.status === "Paid" ? "Print receipt" : "Print invoice"}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintReceipt(inv, "download")}
                            className="h-8 w-8 text-slate-400 hover:text-blue-700"
                            title={inv.status === "Paid" ? "Download PDF receipt" : "Download PDF invoice"}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteInvoice(inv.id)}
                            className="h-8 w-8 text-slate-400 hover:text-rose-400"
                            title="Delete Record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit Plan Templates Dialog */}
        <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
          <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-slate-900 text-lg">Edit Default Plan Templates</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Configure default monthly and yearly PKR rates for all standard platform plans.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 max-h-[60vh] overflow-y-auto pr-1">
              {(["Basic", "Standard", "Premium", "Enterprise"] as const).map((tier) => (
                <div key={tier} className="p-3.5 border border-slate-200 rounded-xl bg-slate-100/90 space-y-3">
                  <h4 className="font-semibold text-sm text-blue-700">{tier} Plan Defaults</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-500 text-xs">Monthly Rate (PKR)</Label>
                      <Input
                        type="number"
                        value={tempTemplates[tier].monthly}
                        onChange={(e) => setTempTemplates({
                          ...tempTemplates,
                          [tier]: { ...tempTemplates[tier], monthly: Number(e.target.value) }
                        })}
                        className="bg-slate-50 border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-500 text-xs">Yearly Rate (PKR)</Label>
                      <Input
                        type="number"
                        value={tempTemplates[tier].yearly}
                        onChange={(e) => setTempTemplates({
                          ...tempTemplates,
                          [tier]: { ...tempTemplates[tier], yearly: Number(e.target.value) }
                        })}
                        className="bg-slate-50 border-slate-200 text-slate-900 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsTemplateModalOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplates}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0"
              >
                Save Templates
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Plan Dialog */}
        <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
          <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900 text-lg">Change School Subscription</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Modify pricing structure and cycle policies for {selectedSchool?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-select" className="text-slate-700 text-xs">Plan Tier</Label>
                <Select
                  value={newPlan}
                  onValueChange={(val: any) => setNewPlan(val)}
                >
                  <SelectTrigger id="plan-select" className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-50 border-slate-200 text-slate-900">
                    <SelectItem value="Basic">Basic (Rs. {(planTemplates.Basic?.monthly ?? 15000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Standard">Standard (Rs. {(planTemplates.Standard?.monthly ?? 30000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Premium">Premium (Rs. {(planTemplates.Premium?.monthly ?? 45000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Enterprise">Enterprise (Rs. {(planTemplates.Enterprise?.monthly ?? 75000).toLocaleString()}/mo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cycle-select" className="text-slate-700 text-xs">Billing Cycle</Label>
                <Select
                  value={newCycle}
                  onValueChange={(val: any) => setNewCycle(val)}
                >
                  <SelectTrigger id="cycle-select" className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-50 border-slate-200 text-slate-900">
                    <SelectItem value="monthly">Monthly billing</SelectItem>
                    <SelectItem value="yearly">Yearly billing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-amount" className="text-slate-700 text-xs">Custom Billing Amount (Rs.)</Label>
                <Input
                  id="plan-amount"
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(Number(e.target.value))}
                  className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="billing-email" className="text-slate-700 text-xs">Invoice Recipient Email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="principal@school.com"
                  className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30"
                />
                <p className="text-[10px] text-slate-400">
                  Recurring invoices will automatically notify this address.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsPlanModalOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePlan}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0"
              >
                Save Subscription
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Invoice Dialog */}
        <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
          <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900 text-lg">Generate Manual Invoice</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Create a one-off platform billing invoice and notify the school client.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="school-select" className="text-slate-700 text-xs">Select Institute</Label>
                <Select
                  value={invoiceSchoolId}
                  onValueChange={(val) => {
                    setInvoiceSchoolId(val);
                    const sch = schools.find((s) => s.id === val);
                    if (sch) setInvoiceAmount(sch.billing_amount);
                  }}
                >
                  <SelectTrigger id="school-select" className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30">
                    <SelectValue placeholder="Choose school..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-50 border-slate-200 text-slate-900">
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.plan_tier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-amount" className="text-slate-700 text-xs">Invoice Amount (Rs.)</Label>
                <Input
                  id="inv-amount"
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                  className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due-date" className="text-slate-700 text-xs">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-notes" className="text-slate-700 text-xs">Invoice Description / Memo</Label>
                <Input
                  id="inv-notes"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Standard monthly licensing invoice"
                  className="bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateInvoice}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0"
              >
                Issue Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Invoice Dialog */}
        <Dialog open={isEditInvoiceModalOpen} onOpenChange={setIsEditInvoiceModalOpen}>
          <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-900 text-lg">Edit Invoice Details</DialogTitle>
              <DialogDescription className="text-slate-500 text-xs">
                Update billing amount, dates, or payment status for {editingInvoice?.invoice_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-school" className="text-slate-700 text-xs">Institute Name</Label>
                <Input
                  id="edit-school"
                  value={editingInvoice?.school_name || ""}
                  disabled
                  className="bg-slate-50 border-slate-200 text-slate-500 h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-amount" className="text-slate-700 text-xs">Billed Amount (PKR)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="bg-slate-50 border-slate-200 text-slate-900 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-bill-date" className="text-slate-700 text-xs">Billed Date</Label>
                  <Input
                    id="edit-bill-date"
                    type="date"
                    value={editBillingDate}
                    onChange={(e) => setEditBillingDate(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-slate-900 h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-due-date" className="text-slate-700 text-xs">Due Date</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-slate-900 h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="text-slate-700 text-xs">Payment Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(val: any) => setEditStatus(val)}
                >
                  <SelectTrigger id="edit-status" className="bg-slate-50 border-slate-200 text-slate-700 h-9 text-xs">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700">
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditInvoiceModalOpen(false)}
                className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEditInvoice}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-zinc-950 font-bold border border-0 h-9 text-xs"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SuperAdminShell>
  );
}
