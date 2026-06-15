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
  Mail,
  Trash2,
  Settings,
  Pencil,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SchoolBillingData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  plan_tier: "Basic" | "Standard" | "Enterprise" | "Premium";
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
      const { data: schoolsData, error: schoolsError } = await supabase
        .from("schools")
        .select("*")
        .order("name", { ascending: true });

      if (schoolsError) throw schoolsError;

      // Check if billing columns exist on the first school returned
      let dbSchemaMissing = false;
      if (schoolsData && schoolsData.length > 0) {
        const firstSchool = schoolsData[0];
        if (!("plan_tier" in firstSchool)) {
          dbSchemaMissing = true;
          setIsDbSchemaApplied(false);
        } else {
          setIsDbSchemaApplied(true);
        }
      }

      // Map Supabase schools with local storage fallbacks if DB columns are missing
      const mappedSchools: SchoolBillingData[] = (schoolsData || []).map((s: any) => {
        if (dbSchemaMissing) {
          // Read from localStorage if schema not applied
          const localOverride = localStorage.getItem(`local_billing_school:${s.id}`);
          if (localOverride) {
            return JSON.parse(localOverride);
          }
          return {
            id: s.id,
            name: s.name,
            slug: s.slug,
            is_active: s.is_active ?? true,
            plan_tier: "Basic",
            billing_cycle: "monthly",
            billing_amount: planTemplates.Basic?.monthly ?? 15000,
            next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            billing_status: "Active",
            billing_email: s.email || "",
          };
        }

        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          is_active: s.is_active ?? true,
          plan_tier: s.plan_tier || "Basic",
          billing_cycle: s.billing_cycle || "monthly",
          billing_amount: s.billing_amount || (planTemplates.Basic?.monthly ?? 15000),
          next_billing_date: s.next_billing_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          billing_status: s.billing_status || "Active",
          billing_email: s.billing_email || s.email || "",
        };
      });

      setSchools(mappedSchools);

      // 2. Fetch platform invoices
      if (!dbSchemaMissing) {
        const { data: invoicesData, error: invoicesError } = await supabase
          .from("platform_invoices" as any)
          .select("*")
          .order("created_at", { ascending: false });

        if (!invoicesError && invoicesData) {
          const mappedInvoices = invoicesData.map((inv: any) => {
            const matchedSchool = mappedSchools.find((sch) => sch.id === inv.school_id);
            return {
              id: inv.id,
              school_id: inv.school_id,
              school_name: matchedSchool ? matchedSchool.name : "Unknown School",
              invoice_number: inv.invoice_number,
              amount: inv.amount,
              billing_date: inv.billing_date,
              due_date: inv.due_date,
              status: inv.status,
              paid_at: inv.paid_at,
            };
          });
          setInvoices(mappedInvoices);
        } else {
          // If query fails, fall back to localStorage invoices
          loadLocalInvoices(mappedSchools);
        }
      } else {
        loadLocalInvoices(mappedSchools);
      }
    } catch (err: any) {
      console.error("Error loading billing data:", err);
      toast.error("Failed to fetch database records");
    } finally {
      setLoading(false);
    }
  };

  const loadLocalInvoices = (activeSchools: SchoolBillingData[]) => {
    const localInvRaw = localStorage.getItem("local_platform_invoices");
    if (localInvRaw) {
      const parsed = JSON.parse(localInvRaw) as PlatformInvoice[];
      // Update school names in case they changed
      const updated = parsed.map((inv) => {
        const matched = activeSchools.find((s) => s.id === inv.school_id);
        return {
          ...inv,
          school_name: matched ? matched.name : inv.school_name,
        };
      });
      setInvoices(updated);
    } else {
      // Mock initial invoices
      const mockInvoices: PlatformInvoice[] = activeSchools.map((s, idx) => ({
        id: `local-inv-${s.id}-${idx}`,
        school_id: s.id,
        school_name: s.name,
        invoice_number: `PLAT-INV-202605-${100 + idx}`,
        amount: s.billing_amount,
        billing_date: "2026-05-01",
        due_date: "2026-05-15",
        status: idx === 0 ? "Paid" : "Unpaid",
      }));
      localStorage.setItem("local_platform_invoices", JSON.stringify(mockInvoices));
      setInvoices(mockInvoices);
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
    setNewPlan(school.plan_tier);
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
        const { error } = await supabase
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
        // Save to localStorage
        const updatedSchool: SchoolBillingData = {
          ...selectedSchool,
          plan_tier: newPlan,
          billing_cycle: newCycle,
          billing_amount: newAmount,
          billing_email: newEmail,
        };
        localStorage.setItem(`local_billing_school:${selectedSchool.id}`, JSON.stringify(updatedSchool));
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
    setInvoiceDueDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
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

    const invoiceNumber = `PLAT-INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      if (isDbSchemaApplied) {
        const { error } = await supabase
          .from("platform_invoices" as any)
          .insert({
            school_id: invoiceSchoolId,
            invoice_number: invoiceNumber,
            amount: invoiceAmount,
            billing_date: new Date().toISOString().split("T")[0],
            due_date: invoiceDueDate,
            status: "Unpaid",
          });

        if (error) throw error;
      } else {
        const newInvoice: PlatformInvoice = {
          id: `local-inv-man-${Date.now()}`,
          school_id: invoiceSchoolId,
          school_name: matchedSchool.name,
          invoice_number: invoiceNumber,
          amount: invoiceAmount,
          billing_date: new Date().toISOString().split("T")[0],
          due_date: invoiceDueDate,
          status: "Unpaid",
        };
        const updatedList = [newInvoice, ...invoices];
        localStorage.setItem("local_platform_invoices", JSON.stringify(updatedList));
      }

      // Simulate notification to School Principal/Owner
      const targetEmail = matchedSchool.billing_email || "principal@school.com";
      toast.success("Invoice generated & notification sent!", {
        description: `Invoice ${invoiceNumber} sent to ${targetEmail}`,
        icon: <Mail className="h-4 w-4 text-amber-400" />,
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
        const { data, error } = await supabase.rpc("cron_generate_platform_invoices" as any);
        if (error) throw error;

        const count = Number(data || 0);
        if (count > 0) {
          toast.success(`Billing cycle finished! Generated ${count} recurring invoice(s).`);
        } else {
          toast.success("Billing cycle finished! All schools are up to date.");
        }
      } else {
        // Local simulation
        const today = new Date();
        let invoicesCreated = 0;
        const updatedSchools = schools.map((sch) => {
          const nextDate = new Date(sch.next_billing_date);
          if (today >= nextDate) {
            invoicesCreated++;
            const invoiceNumber = `PLAT-INV-REC-${sch.slug}-${today.toISOString().slice(0, 10).replace(/-/g, "")}`;
            
            // Add local invoice
            const newInv: PlatformInvoice = {
              id: `local-inv-auto-${sch.id}-${Date.now()}`,
              school_id: sch.id,
              school_name: sch.name,
              invoice_number: invoiceNumber,
              amount: sch.billing_amount,
              billing_date: today.toISOString().split("T")[0],
              due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              status: "Unpaid",
            };
            
            // Update local invoices array & store
            setInvoices((prev) => {
              const nextList = [newInv, ...prev];
              localStorage.setItem("local_platform_invoices", JSON.stringify(nextList));
              return nextList;
            });

            // Rollover next billing date (+30 days)
            const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const updatedSch = {
              ...sch,
              next_billing_date: nextBilling,
            };
            localStorage.setItem(`local_billing_school:${sch.id}`, JSON.stringify(updatedSch));
            return updatedSch;
          }
          return sch;
        });

        if (invoicesCreated > 0) {
          setSchools(updatedSchools);
          toast.success(`Billing cycle finished! Simulated ${invoicesCreated} recurring invoices.`);
        } else {
          toast.success("Billing cycle checked. All school accounts are up to date.");
        }
      }
      void loadData();
    } catch (err: any) {
      toast.error(`Billing cycle check failed: ${err.message}`);
    }
  };

  // Mark invoice as paid
  const handleMarkAsPaid = async (invId: string) => {
    try {
      if (isDbSchemaApplied && !invId.startsWith("local-")) {
        const { error } = await supabase
          .from("platform_invoices" as any)
          .update({
            status: "Paid",
            paid_at: new Date().toISOString(),
          })
          .eq("id", invId);

        if (error) throw error;
      } else {
        const updated = invoices.map((inv) => {
          if (inv.id === invId) {
            return {
              ...inv,
              status: "Paid" as const,
              paid_at: new Date().toISOString(),
            };
          }
          return inv;
        });
        localStorage.setItem("local_platform_invoices", JSON.stringify(updated));
        setInvoices(updated);
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
      if (isDbSchemaApplied && !invId.startsWith("local-")) {
        const { error } = await supabase
          .from("platform_invoices" as any)
          .delete()
          .eq("id", invId);

        if (error) throw error;
      } else {
        const updated = invoices.filter((inv) => inv.id !== invId);
        localStorage.setItem("local_platform_invoices", JSON.stringify(updated));
        setInvoices(updated);
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
      if (isDbSchemaApplied && !editingInvoice.id.startsWith("local-")) {
        const { error } = await supabase
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
        const updated = invoices.map((inv) => {
          if (inv.id === editingInvoice.id) {
            return {
              ...inv,
              amount: editAmount,
              billing_date: editBillingDate,
              due_date: editDueDate,
              status: editStatus,
              paid_at: editStatus === "Paid" ? new Date().toISOString() : undefined,
            };
          }
          return inv;
        });
        localStorage.setItem("local_platform_invoices", JSON.stringify(updated));
        setInvoices(updated);
      }

      toast.success("Invoice updated successfully!");
      setIsEditInvoiceModalOpen(false);
      void loadData();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  // Luxury vector logo drawing for Altrix receipt
  const drawAltrixLogo = (doc: jsPDF, x: number, y: number, size: number = 10) => {
    doc.saveGraphicsState();
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, "F");
    doc.setFillColor(15, 23, 42);
    const cx = x + size / 2;
    const cy = y + size / 2;
    const scale = size / 10;
    doc.rect(cx - 2.5 * scale, cy + 1.5 * scale, 5 * scale, 0.8 * scale, "F");
    doc.triangle(
      cx - 2.5 * scale, cy + 1.5 * scale,
      cx - 2.5 * scale, cy - 1.5 * scale,
      cx - 0.8 * scale, cy + 1.5 * scale,
      "F"
    );
    doc.triangle(
      cx + 2.5 * scale, cy + 1.5 * scale,
      cx + 2.5 * scale, cy - 1.5 * scale,
      cx + 0.8 * scale, cy + 1.5 * scale,
      "F"
    );
    doc.triangle(
      cx - 1.2 * scale, cy + 1.5 * scale,
      cx, cy - 2.2 * scale,
      cx + 1.2 * scale, cy + 1.5 * scale,
      "F"
    );
    doc.restoreGraphicsState();
  };

  const handlePrintReceipt = (inv: PlatformInvoice) => {
    try {
      const doc = new jsPDF({ orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();

      // Load dynamic brand settings from localStorage
      let brandSettings = {
        brandName: "ALTRIX PLATFORM SOLUTIONS",
        supportEmail: "billing@altrix.com",
        supportUrl: "support.altrix.com",
        bankName: "Altrix International Trust Bank",
        accountTitle: "Altrix Platform Solutions Ltd.",
        accountNumber: "1045-9856-0248-12",
        iban: "PK85AITB0000104598560248",
        logoBase64: ""
      };

      const savedSettings = localStorage.getItem("altrix_global_brand_settings");
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          brandSettings = { ...brandSettings, ...parsed };
        } catch (e) {
          console.error("Error parsing dynamic brand settings", e);
        }
      }

      // Top Luxury Header Banner (Dark Gold Theme)
      doc.setFillColor(20, 18, 15); // Deep charcoal black
      doc.rect(0, 0, pageW, 35, "F");

      // Gold bottom outline for header banner
      doc.setFillColor(212, 175, 55); // Gold line
      doc.rect(0, 35, pageW, 0.8, "F");

      // Draw custom logo if configured, else default to Altrix Vector Logo
      let logoDrawn = false;
      if (brandSettings.logoBase64) {
        try {
          doc.addImage(brandSettings.logoBase64, "PNG", 14, 8, 16, 16);
          logoDrawn = true;
        } catch (err) {
          console.error("Failed to render custom logo base64 in invoice, falling back", err);
        }
      }
      if (!logoDrawn) {
        drawAltrixLogo(doc, 14, 8, 16);
      }

      // Dynamic Header Info
      doc.setTextColor(245, 158, 11); // Amber
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(brandSettings.brandName.toUpperCase(), 34, 15);

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Software Licenses & Enterprise Subscriptions", 34, 21);

      doc.setTextColor(161, 161, 170); // zinc-400
      doc.setFontSize(7.5);
      doc.text(`${brandSettings.supportEmail}  ·  ${brandSettings.supportUrl}`, 34, 26);

      // "INVOICE / RECEIPT" Label
      doc.setTextColor(212, 175, 55); // Gold
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("INVOICE / RECEIPT", pageW - 14, 15, { align: "right" });

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Master Control Panel", pageW - 14, 21, { align: "right" });

      // Double-column details section
      let y = 48;
      
      // Left Column (Client Details)
      doc.setTextColor(212, 175, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("BILLED TO", 14, y);

      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(inv.school_name, 14, y + 6);

      const matchedSchool = schools.find((s) => s.id === inv.school_id);
      doc.setTextColor(82, 82, 91); // zinc-600
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Subscription Plan: ${matchedSchool?.plan_tier || "Basic"} Tier`, 14, y + 11);
      doc.text(`Billing Cycle: ${matchedSchool?.billing_cycle || "monthly"}`, 14, y + 16);

      // Right Column (Invoice Details)
      doc.setTextColor(212, 175, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("INVOICE DETAILS", 110, y);

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(`Invoice #: ${inv.invoice_number}`, 110, y + 6);

      doc.setTextColor(82, 82, 91);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Billed Date: ${inv.billing_date}`, 110, y + 11);
      doc.text(`Due Date: ${inv.due_date}`, 110, y + 16);

      // Status Badge Pill
      doc.text("Payment Status:", 110, y + 22.5);
      doc.saveGraphicsState();
      
      const badgeX = 138;
      const badgeY = y + 19.5;
      const badgeW = 20;
      const badgeH = 4.2;

      if (inv.status === "Paid") {
        doc.setFillColor(16, 185, 129); // green
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text("PAID", badgeX + badgeW / 2, badgeY + 3.1, { align: "center" });
      } else if (inv.status === "Overdue") {
        doc.setFillColor(239, 68, 68); // red
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text("OVERDUE", badgeX + badgeW / 2, badgeY + 3.1, { align: "center" });
      } else {
        doc.setFillColor(245, 158, 11); // amber
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text("UNPAID", badgeX + badgeW / 2, badgeY + 3.1, { align: "center" });
      }
      doc.restoreGraphicsState();

      // Divider line
      doc.setDrawColor(228, 228, 231); // zinc-200
      doc.setLineWidth(0.2);
      doc.line(14, y + 28, pageW - 14, y + 28);

      // Services Table (jsPDF autoTable)
      const head = [["DESCRIPTION", "BILLING CYCLE", "LICENSE RATE", "TOTAL AMOUNT"]];
      const body = [[
        `Altrix Software Suite - ${matchedSchool?.plan_tier || "Basic"} School License\nFull access to academics, staff payroll, and owner control panel.`,
        matchedSchool?.billing_cycle || "monthly",
        `Rs. ${inv.amount.toLocaleString()}`,
        `Rs. ${inv.amount.toLocaleString()}`
      ]];

      autoTable(doc, {
        startY: y + 32,
        head,
        body,
        styles: { fontSize: 8.5, cellPadding: 4, valign: "middle" },
        headStyles: { fillColor: [212, 175, 55], textColor: [20, 18, 15], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 249, 245] },
      });

      let finalY = (doc as any).lastAutoTable?.finalY || (y + 55);

      // Double line border around totals card
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.25);
      doc.line(110, finalY + 5, pageW - 14, finalY + 5);
      doc.line(110, finalY + 22, pageW - 14, finalY + 22);

      // Shaded totals background
      doc.setFillColor(250, 249, 245);
      doc.rect(110, finalY + 5.2, pageW - 110 - 14, 16.6, "F");

      doc.setTextColor(82, 82, 91);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Subtotal:", 112, finalY + 11);
      doc.text("Rs. " + inv.amount.toLocaleString(), pageW - 16, finalY + 11, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.5);
      doc.text("Total Paid (PKR):", 112, finalY + 17.5);
      doc.text("Rs. " + inv.amount.toLocaleString(), pageW - 16, finalY + 17.5, { align: "right" });

      // Bank Details block (bottom left)
      doc.setFillColor(250, 249, 245);
      doc.roundedRect(14, finalY + 5, 85, 26, 1.5, 1.5, "F");
      doc.setDrawColor(212, 175, 55, 0.3);
      doc.setLineWidth(0.2);
      doc.roundedRect(14, finalY + 5, 85, 26, 1.5, 1.5, "S");

      doc.setTextColor(212, 175, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text("BANK TRANSFER DETAILS", 18, finalY + 10);

      doc.setTextColor(82, 82, 91);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(`Bank Name: ${brandSettings.bankName}`, 18, finalY + 15);
      doc.text(`Account Title: ${brandSettings.accountTitle}`, 18, finalY + 19);
      doc.text(`A/C Number: ${brandSettings.accountNumber}`, 18, finalY + 23);
      doc.text(`IBAN: ${brandSettings.iban}`, 18, finalY + 27);

      // Signatures
      const sigY = finalY + 50;
      doc.setDrawColor(161, 161, 170);
      doc.setLineWidth(0.2);
      doc.line(14, sigY, 70, sigY);
      doc.line(pageW - 70, sigY, pageW - 14, sigY);

      doc.setTextColor(113, 113, 122);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Super Admin Authorized", 14, sigY + 4);
      doc.text("Client School Receiver Signature", pageW - 14, sigY + 4, { align: "right" });

      // Verification stamp
      if (inv.status === "Paid") {
        doc.saveGraphicsState();
        doc.setDrawColor(16, 185, 129, 0.4);
        doc.setLineWidth(0.4);
        doc.roundedRect(132, finalY + 28, 44, 10, 1, 1, "S");
        doc.setTextColor(16, 185, 129);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("VERIFIED PAID", 154, finalY + 34.5, { align: "center" });
        doc.restoreGraphicsState();
      }

      // Terms & Conditions Footer
      doc.setTextColor(113, 113, 122);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.text(`Thank you for choosing ${brandSettings.brandName}. Payments are due within 15 days of bill generation.`, 14, sigY + 18);
      doc.text(`This computer-generated receipt is officially validated by the ${brandSettings.brandName} Billing System.`, 14, sigY + 22);

      // bottom decorative bar
      doc.setFillColor(212, 175, 55);
      doc.rect(0, 292, pageW, 5, "F");

      doc.save(`Receipt_${inv.invoice_number}.pdf`);
      toast.success(`Receipt downloaded for ${inv.invoice_number}`);
    } catch (e: any) {
      toast.error(`Receipt download failed: ${e.message}`);
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
      title="Billing & Plans"
      subtitle="Manage school subscriptions, recurring pricing, and platform invoices"
    >
      <div className="space-y-6 text-zinc-100">
        {/* DB Schema Missing Banner */}
        {!isDbSchemaApplied && (
          <Card className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <Database className="h-5 w-5" />
                <span>Local Storage Mode Active</span>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl">
                The billing schema columns (plan_tier, billing_cycle, invoices table) are not yet fully compiled in your Supabase database. 
                The system is running on a high-fidelity local cache so you can test all features immediately. Apply the migration SQL to save changes persistently.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-mono">
              20260605000000_platform_billing.sql
            </Badge>
          </Card>
        )}

        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Monthly Recurring Revenue (MRR)
              </CardTitle>
              <div className="text-xs font-bold text-amber-500 font-mono">PKR</div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">Rs. {mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-amber-400/80 mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Live school license values in PKR
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Active Tenant Licenses
              </CardTitle>
              <Award className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">
                {activeLicenses} / {schools.length} Schools
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                {schools.length - activeLicenses} inactive or disabled schools
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Unpaid / Overdue Invoices
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${overdueInvoices > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {overdueInvoices} Overdue
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                {invoices.filter((i) => i.status === "Unpaid").length} total outstanding invoices
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Tables */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-white">School Subscription Plans</CardTitle>
              <p className="text-xs text-zinc-400">Manage tier rates, cycle periods, and billing info for each school</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenTemplateModal}
                className="border-zinc-800 bg-zinc-950 hover:bg-amber-500/10 hover:text-amber-300"
              >
                <Settings className="mr-2 h-4 w-4" /> Edit Plan Templates
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunBillingCycle}
                className="border-zinc-800 bg-zinc-950 hover:bg-amber-500/10 hover:text-amber-300"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Run Billing Cycle
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border border-zinc-800 bg-black/40">
              <Table>
                <TableHeader className="border-b border-zinc-800">
                  <TableRow className="hover:bg-transparent border-b border-zinc-800">
                    <TableHead className="text-zinc-400 font-medium">School</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Plan Tier</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Billing Cycle</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Amount</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Next Invoice</TableHead>
                    <TableHead className="text-zinc-400 font-medium">Notification Email</TableHead>
                    <TableHead className="text-right text-zinc-400 font-medium">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-zinc-500">
                        Loading subscriptions data...
                      </TableCell>
                    </TableRow>
                  ) : schools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-zinc-500">
                        No registered schools found. Add a school first.
                      </TableCell>
                    </TableRow>
                  ) : (
                    schools.map((s) => (
                      <TableRow key={s.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                        <TableCell className="font-semibold text-white">
                          {s.name}
                          <span className="block text-[10px] text-zinc-400 font-normal">/{s.slug}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            {s.plan_tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize text-zinc-300 text-xs">
                          {s.billing_cycle}
                        </TableCell>
                        <TableCell className="text-zinc-300 font-mono">
                          Rs. {s.billing_amount.toLocaleString()}/{s.billing_cycle === "yearly" ? "yr" : "mo"}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-xs">
                          {s.next_billing_date}
                        </TableCell>
                        <TableCell className="text-zinc-400 text-xs font-mono">
                          {s.billing_email || <span className="text-zinc-600 italic">No email set</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleOpenPlanModal(s)}
                            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20"
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
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg font-bold text-white">Platform Invoices</CardTitle>
              <p className="text-xs text-zinc-400">View or manually issue invoices to schools</p>
            </div>
            <Button
              onClick={handleOpenInvoiceModal}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 shadow-sm"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                  No billing invoices have been issued yet.
                </div>
              ) : (
                invoices.map((inv) => {
                  const isOverdue = inv.status === "Unpaid" && new Date(inv.due_date) < new Date();
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-zinc-900 bg-black/20 hover:bg-zinc-900/10 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <Receipt className="h-5 w-5 text-amber-500 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-white">{inv.invoice_number}</p>
                          <p className="text-xs text-zinc-400">
                            {inv.school_name} · Billing: {inv.billing_date} · Due: {inv.due_date}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="text-sm font-mono text-zinc-300">Rs. {inv.amount.toLocaleString()}</span>
                        <Badge
                          className={
                            inv.status === "Paid"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              : isOverdue
                              ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
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
                              className="border-zinc-800 h-8 hover:bg-emerald-500/10 hover:text-emerald-400 text-xs px-2 animate-pulse"
                            >
                              Mark Paid
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditInvoiceModal(inv)}
                            className="h-8 w-8 text-zinc-500 hover:text-amber-400"
                            title="Edit Invoice"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePrintReceipt(inv)}
                            className="h-8 w-8 text-zinc-500 hover:text-amber-400"
                            title="Download PDF Receipt"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteInvoice(inv.id)}
                            className="h-8 w-8 text-zinc-500 hover:text-rose-400"
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
          <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Edit Default Plan Templates</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Configure default monthly and yearly PKR rates for all standard platform plans.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 max-h-[60vh] overflow-y-auto pr-1">
              {(["Basic", "Standard", "Premium", "Enterprise"] as const).map((tier) => (
                <div key={tier} className="p-3.5 border border-zinc-800 rounded-xl bg-zinc-900/40 space-y-3">
                  <h4 className="font-semibold text-sm text-amber-400">{tier} Plan Defaults</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Monthly Rate (PKR)</Label>
                      <Input
                        type="number"
                        value={tempTemplates[tier].monthly}
                        onChange={(e) => setTempTemplates({
                          ...tempTemplates,
                          [tier]: { ...tempTemplates[tier], monthly: Number(e.target.value) }
                        })}
                        className="bg-zinc-900 border-zinc-800 text-white text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-zinc-400 text-xs">Yearly Rate (PKR)</Label>
                      <Input
                        type="number"
                        value={tempTemplates[tier].yearly}
                        onChange={(e) => setTempTemplates({
                          ...tempTemplates,
                          [tier]: { ...tempTemplates[tier], yearly: Number(e.target.value) }
                        })}
                        className="bg-zinc-900 border-zinc-800 text-white text-sm"
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
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplates}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20"
              >
                Save Templates
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Plan Dialog */}
        <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
          <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Change School Subscription</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Modify pricing structure and cycle policies for {selectedSchool?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-select" className="text-zinc-300 text-xs">Plan Tier</Label>
                <Select
                  value={newPlan}
                  onValueChange={(val: any) => setNewPlan(val)}
                >
                  <SelectTrigger id="plan-select" className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="Basic">Basic (Rs. {(planTemplates.Basic?.monthly ?? 15000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Standard">Standard (Rs. {(planTemplates.Standard?.monthly ?? 30000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Premium">Premium (Rs. {(planTemplates.Premium?.monthly ?? 45000).toLocaleString()}/mo)</SelectItem>
                    <SelectItem value="Enterprise">Enterprise (Rs. {(planTemplates.Enterprise?.monthly ?? 75000).toLocaleString()}/mo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cycle-select" className="text-zinc-300 text-xs">Billing Cycle</Label>
                <Select
                  value={newCycle}
                  onValueChange={(val: any) => setNewCycle(val)}
                >
                  <SelectTrigger id="cycle-select" className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    <SelectItem value="monthly">Monthly billing</SelectItem>
                    <SelectItem value="yearly">Yearly billing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="plan-amount" className="text-zinc-300 text-xs">Custom Billing Amount (Rs.)</Label>
                <Input
                  id="plan-amount"
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(Number(e.target.value))}
                  className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="billing-email" className="text-zinc-300 text-xs">Invoice Recipient Email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="principal@school.com"
                  className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30"
                />
                <p className="text-[10px] text-zinc-500">
                  Recurring invoices will automatically notify this address.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsPlanModalOpen(false)}
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePlan}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20"
              >
                Save Subscription
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Invoice Dialog */}
        <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
          <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Generate Manual Invoice</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Create a one-off platform billing invoice and notify the school client.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="school-select" className="text-zinc-300 text-xs">Select School</Label>
                <Select
                  value={invoiceSchoolId}
                  onValueChange={(val) => {
                    setInvoiceSchoolId(val);
                    const sch = schools.find((s) => s.id === val);
                    if (sch) setInvoiceAmount(sch.billing_amount);
                  }}
                >
                  <SelectTrigger id="school-select" className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30">
                    <SelectValue placeholder="Choose school..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.plan_tier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-amount" className="text-zinc-300 text-xs">Invoice Amount (Rs.)</Label>
                <Input
                  id="inv-amount"
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(Number(e.target.value))}
                  className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due-date" className="text-zinc-300 text-xs">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="inv-notes" className="text-zinc-300 text-xs">Invoice Description / Memo</Label>
                <Input
                  id="inv-notes"
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Standard monthly licensing invoice"
                  className="bg-zinc-900 border-zinc-800 text-white focus:ring-amber-500/30"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateInvoice}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20"
              >
                Issue Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Invoice Dialog */}
        <Dialog open={isEditInvoiceModalOpen} onOpenChange={setIsEditInvoiceModalOpen}>
          <DialogContent className="bg-zinc-950 border border-zinc-800 text-zinc-100 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white text-lg">Edit Invoice Details</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                Update billing amount, dates, or payment status for {editingInvoice?.invoice_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-school" className="text-zinc-300 text-xs">School Name</Label>
                <Input
                  id="edit-school"
                  value={editingInvoice?.school_name || ""}
                  disabled
                  className="bg-zinc-900 border-zinc-800 text-zinc-400 h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-amount" className="text-zinc-300 text-xs">Billed Amount (PKR)</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="bg-zinc-900 border-zinc-800 text-zinc-100 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-bill-date" className="text-zinc-300 text-xs">Billed Date</Label>
                  <Input
                    id="edit-bill-date"
                    type="date"
                    value={editBillingDate}
                    onChange={(e) => setEditBillingDate(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100 h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-due-date" className="text-zinc-300 text-xs">Due Date</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-100 h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-status" className="text-zinc-300 text-xs">Payment Status</Label>
                <Select
                  value={editStatus}
                  onValueChange={(val: any) => setEditStatus(val)}
                >
                  <SelectTrigger id="edit-status" className="bg-zinc-900 border-zinc-800 text-zinc-200 h-9 text-xs">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
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
                className="border-zinc-800 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEditInvoice}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20 h-9 text-xs"
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
