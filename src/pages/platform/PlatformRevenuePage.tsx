import { useEffect, useState, useMemo } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
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
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  Filter,
  RefreshCw,
  Sliders,
  DollarSign,
  Percent,
  Sparkles,
  Database,
  Search,
  ChevronRight,
  PieChart as PieIcon,
  BarChart3,
  CalendarDays,
  Pencil,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
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

interface PlanTemplates {
  Basic: { monthly: number; yearly: number };
  Standard: { monthly: number; yearly: number };
  Premium: { monthly: number; yearly: number };
  Enterprise: { monthly: number; yearly: number };
}

export default function PlatformRevenuePage() {
  const [schools, setSchools] = useState<SchoolBillingData[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDbSchemaApplied, setIsDbSchemaApplied] = useState(true);

  // Edit Invoice States
  const [editingInvoice, setEditingInvoice] = useState<PlatformInvoice | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editBillingDate, setEditBillingDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState<"Paid" | "Unpaid" | "Overdue">("Unpaid");

  const handleOpenEditModal = (inv: PlatformInvoice) => {
    setEditingInvoice(inv);
    setEditAmount(inv.amount);
    setEditBillingDate(inv.billing_date);
    setEditDueDate(inv.due_date);
    setEditStatus(inv.status);
    setIsEditModalOpen(true);
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
      setIsEditModalOpen(false);
      void loadData();
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`);
    }
  };

  // Editable Plan Templates state (same defaults as PlatformBillingPage)
  const [planTemplates] = useState<PlanTemplates>(() => {
    const saved = localStorage.getItem("platform_plan_templates");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing plan templates", e);
      }
    }
    return {
      Basic: { monthly: 15000, yearly: 150000 },
      Standard: { monthly: 30000, yearly: 300000 },
      Premium: { monthly: 45000, yearly: 450000 },
      Enterprise: { monthly: 75000, yearly: 750000 },
    };
  });

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");

  // Growth Simulator States
  const [growthNewSchools, setGrowthNewSchools] = useState<number>(5);
  const [growthPriceAdjust, setGrowthPriceAdjust] = useState<number>(10); // percentage price change
  const [simulatorPlanTier, setSimulatorPlanTier] = useState<"Basic" | "Standard" | "Premium" | "Enterprise" | "Average">("Standard");

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch schools from Supabase
      const { data: schoolsData, error: schoolsError } = await supabase
        .from("schools")
        .select("*")
        .order("name", { ascending: true });

      if (schoolsError) throw schoolsError;

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
            billing_amount: planTemplates.Basic.monthly,
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
          billing_amount: s.billing_amount || planTemplates.Basic.monthly,
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
              amount: Number(inv.amount),
              billing_date: inv.billing_date,
              due_date: inv.due_date,
              status: inv.status,
              paid_at: inv.paid_at,
            };
          });
          setInvoices(mappedInvoices);
        } else {
          loadLocalInvoices(mappedSchools);
        }
      } else {
        loadLocalInvoices(mappedSchools);
      }
    } catch (err: any) {
      console.error("Error loading billing revenue data:", err);
      toast.error("Failed to fetch database records");
    } finally {
      setLoading(false);
    }
  };

  const loadLocalInvoices = (activeSchools: SchoolBillingData[]) => {
    const localInvRaw = localStorage.getItem("local_platform_invoices");
    if (localInvRaw) {
      const parsed = JSON.parse(localInvRaw) as PlatformInvoice[];
      const updated = parsed.map((inv) => {
        const matched = activeSchools.find((s) => s.id === inv.school_id);
        return {
          ...inv,
          school_name: matched ? matched.name : inv.school_name,
          amount: Number(inv.amount),
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
        status: idx % 2 === 0 ? "Paid" : "Unpaid",
      }));
      localStorage.setItem("local_platform_invoices", JSON.stringify(mockInvoices));
      setInvoices(mockInvoices);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // 1. KPI Calculations
  const metrics = useMemo(() => {
    const activeSchoolsList = schools.filter((s) => s.is_active);
    const activeCount = activeSchoolsList.length;

    // Monthly Recurring Revenue (MRR) - yearly licenses normalized to monthly
    const mrrVal = activeSchoolsList.reduce((sum, s) => {
      const monthlyAmount = s.billing_cycle === "yearly" ? s.billing_amount / 12 : s.billing_amount;
      return sum + monthlyAmount;
    }, 0);

    const totalBilled = invoices.reduce((sum, inv) => sum + inv.amount, 0);
    const totalCollected = invoices.filter((i) => i.status === "Paid").reduce((sum, inv) => sum + inv.amount, 0);
    const outstanding = invoices.filter((i) => i.status !== "Paid").reduce((sum, inv) => sum + inv.amount, 0);

    const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;
    const arps = activeCount > 0 ? mrrVal / activeCount : 0;

    return {
      mrr: mrrVal,
      totalBilled,
      totalCollected,
      outstanding,
      collectionRate,
      arps,
      activeCount,
      totalCount: schools.length,
    };
  }, [schools, invoices]);

  // 2. Chart Visualizations - Collections & Outstanding by Month (Last 6 Months)
  const monthlyCollectionsData = useMemo(() => {
    const groups: Record<string, { key: string; month: string; paid: number; outstanding: number; total: number }> = {};
    
    // Seed last 6 months including current month
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      groups[key] = { key, month: label, paid: 0, outstanding: 0, total: 0 };
    }

    invoices.forEach((inv) => {
      const dateObj = new Date(inv.billing_date);
      const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
      if (groups[key]) {
        if (inv.status === "Paid") {
          groups[key].paid += inv.amount;
        } else {
          groups[key].outstanding += inv.amount;
        }
        groups[key].total += inv.amount;
      }
    });

    return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  }, [invoices]);

  // Plan Distribution Count and Revenue Contribution
  const planChartData = useMemo(() => {
    const planCounts = { Basic: 0, Standard: 0, Premium: 0, Enterprise: 0 };
    const planMRR = { Basic: 0, Standard: 0, Premium: 0, Enterprise: 0 };

    schools.forEach((s) => {
      if (s.is_active) {
        planCounts[s.plan_tier] = (planCounts[s.plan_tier] || 0) + 1;
        const monthlyAmount = s.billing_cycle === "yearly" ? s.billing_amount / 12 : s.billing_amount;
        planMRR[s.plan_tier] = (planMRR[s.plan_tier] || 0) + monthlyAmount;
      }
    });

    const colors = {
      Basic: "#f59e0b",      // Amber
      Standard: "#f59e0b",   // Gold-amber
      Premium: "#d97706",    // Deep amber
      Enterprise: "#78350f"  // Brown-amber
    };

    const countData = Object.entries(planCounts).map(([name, value]) => ({
      name,
      value,
      fill: colors[name as keyof typeof colors],
    }));

    const contributionData = Object.entries(planMRR).map(([name, value]) => ({
      name,
      value,
      fill: colors[name as keyof typeof colors],
    }));

    return { countData, contributionData };
  }, [schools]);

  // 3. Growth Projections Simulator Calculations
  const simulatedProjections = useMemo(() => {
    const baseMRR = metrics.mrr;
    
    // Determine the average cost of the selected target plan
    let simulatedRate = 0;
    if (simulatorPlanTier === "Average") {
      simulatedRate = metrics.arps;
    } else {
      const template = planTemplates[simulatorPlanTier];
      simulatedRate = template.monthly;
    }

    // Adjust rate by price increase slider
    const adjustedRateForNew = simulatedRate * (1 + growthPriceAdjust / 100);
    
    // MRR projection with new schools added
    const simulatedMRR = baseMRR * (1 + growthPriceAdjust / 100) + (growthNewSchools * adjustedRateForNew);
    const simulatedARR = simulatedMRR * 12;
    const currentARR = baseMRR * 12;

    const mrrDelta = simulatedMRR - baseMRR;
    const arrDelta = simulatedARR - currentARR;
    const growthPercent = baseMRR > 0 ? (mrrDelta / baseMRR) * 100 : 0;

    return {
      simulatedMRR,
      simulatedARR,
      mrrDelta,
      arrDelta,
      growthPercent,
    };
  }, [metrics.mrr, metrics.arps, planTemplates, growthNewSchools, growthPriceAdjust, simulatorPlanTier]);

  // 4. Ledger Filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Search term
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.school_name.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Status filter
      const matchesStatus = statusFilter === "all" || inv.status.toLowerCase() === statusFilter.toLowerCase();

      // 3. School filter
      const matchesSchool = schoolFilter === "all" || inv.school_id === schoolFilter;

      // 4. Plan tier filter (Need to resolve from schools data)
      const matchedSchool = schools.find((s) => s.id === inv.school_id);
      const matchesPlan = planFilter === "all" || (matchedSchool && matchedSchool.plan_tier === planFilter);

      return matchesSearch && matchesStatus && matchesSchool && matchesPlan;
    });
  }, [invoices, schools, searchTerm, statusFilter, schoolFilter, planFilter]);

  // CSV Report Export
  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) {
      return toast.warning("No invoices available to export.");
    }
    const headers = ["Invoice Number", "School Name", "Billing Date", "Due Date", "Amount (PKR)", "Status", "Paid Date"];
    const rows = filteredInvoices.map((inv) => [
      inv.invoice_number,
      inv.school_name,
      inv.billing_date,
      inv.due_date,
      inv.amount,
      inv.status,
      inv.paid_at ? inv.paid_at.slice(0, 10) : "N/A"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `platform_revenue_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV Report downloaded successfully!");
  };

  // PDF Report Export (Clean styling matching platform branding)
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();

      // Title & Branding
      doc.setFillColor(15, 11, 4); // bg-zinc-950 equivalent
      doc.rect(0, 0, pageW, 40, "F");

      doc.setTextColor(245, 158, 11); // Amber-500
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("ALTRIX PLATFORM FINANCIAL REPORT", 14, 18);

      doc.setTextColor(200, 200, 200);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString()} · Super Admin Control Panel`, 14, 26);
      doc.text(`License Status: ${metrics.activeCount} Active Schools / ${metrics.totalCount} Total`, 14, 32);

      // Add KPI overview cards in PDF
      doc.setDrawColor(245, 158, 11, 0.2);
      doc.setFillColor(240, 240, 240);
      doc.rect(14, 45, pageW - 28, 30);

      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("FINANCIAL SUMMARY (PKR)", 18, 51);

      doc.setFont("helvetica", "normal");
      doc.text(`Monthly Recurring Revenue (MRR):`, 18, 58);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${metrics.mrr.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, 58);

      doc.setFont("helvetica", "normal");
      doc.text(`Total Collections (Paid):`, 18, 64);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${metrics.totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, 64);

      doc.setFont("helvetica", "normal");
      doc.text(`Outstanding Balance (Unpaid/Overdue):`, 18, 70);
      doc.setFont("helvetica", "bold");
      doc.text(`Rs. ${metrics.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, 70);

      // Projections Simulation summary
      doc.setFillColor(248, 250, 252);
      doc.rect(14, 80, pageW - 28, 26);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(50, 50, 50);
      doc.text("REVENUE SIMULATED PROJECTIONS", 18, 86);
      doc.setFont("helvetica", "normal");
      doc.text(`Simulated MRR (with +${growthNewSchools} schools, +${growthPriceAdjust}% pricing):`, 18, 93);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129); // green
      doc.text(`Rs. ${simulatedProjections.simulatedMRR.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 125, 93);
      doc.setTextColor(50, 50, 50);

      // Ledger table
      const head = [["Invoice Number", "School Name", "Billing Date", "Due Date", "Amount (PKR)", "Status"]];
      const body = filteredInvoices.map((inv) => [
        inv.invoice_number,
        inv.school_name,
        inv.billing_date,
        inv.due_date,
        `Rs. ${inv.amount.toLocaleString()}`,
        inv.status,
      ]);

      autoTable(doc, {
        startY: 112,
        head,
        body,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [245, 158, 11], textColor: [20, 20, 20], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 150;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text("Altrix Platform System Finance Department. Confidential.", 14, finalY + 10);

      doc.save(`platform_revenue_analytics_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("PDF Report generated & downloaded!");
    } catch (e: any) {
      console.error(e);
      toast.error(`Failed to export PDF: ${e.message}`);
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

  // Single Invoice PDF Receipt download
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

  return (
    <SuperAdminShell
      title="Revenue & Analytics"
      subtitle="Comprehensive insights into platform revenue streams, collection status, and future forecasts"
    >
      <div className="space-y-6 text-zinc-100">
        {/* DB Schema Missing Banner */}
        {!isDbSchemaApplied && (
          <Card className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-semibold">
                <Database className="h-5 w-5" />
                <span>Local Storage Sandbox Active</span>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl">
                The platform database schema columns are not fully deployed yet. The revenue analytics dashboard is successfully aggregating data from local cache and active schools.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-mono">
              20260605000000_platform_billing.sql
            </Badge>
          </Card>
        )}

        {/* Financial KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Monthly Rec. Revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">
                Rs. {metrics.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1 font-semibold">
                <TrendingUp className="h-3 w-3" /> Projected MRR
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Total Revenue Collected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-emerald-400 font-mono">
                Rs. {metrics.totalCollected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                Billed: Rs. {metrics.totalBilled.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Outstanding Accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-rose-400 font-mono">
                Rs. {metrics.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">
                Pending or Overdue bills
              </p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Cash Collection Rate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono">
                {metrics.collectionRate.toFixed(1)}%
              </div>
              <div className="w-full bg-zinc-900 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, metrics.collectionRate)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Avg. Revenue Per School
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-white font-mono font-semibold">
                Rs. {metrics.arps.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <p className="text-[10px] text-zinc-400 mt-1">
                Contract rate average / month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Layout */}
        <Tabs defaultValue="charts" className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <TabsList className="bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg">
              <TabsTrigger
                value="charts"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 text-zinc-400 hover:text-zinc-200 px-4 py-1.5 text-xs font-semibold rounded-md"
              >
                <BarChart3 className="h-4 w-4 mr-2" /> Visual Charts
              </TabsTrigger>
              <TabsTrigger
                value="simulator"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 text-zinc-400 hover:text-zinc-200 px-4 py-1.5 text-xs font-semibold rounded-md"
              >
                <Sliders className="h-4 w-4 mr-2" /> Growth Simulator
              </TabsTrigger>
              <TabsTrigger
                value="ledger"
                className="data-[state=active]:bg-amber-500 data-[state=active]:text-zinc-950 text-zinc-400 hover:text-zinc-200 px-4 py-1.5 text-xs font-semibold rounded-md"
              >
                <Receipt className="h-4 w-4 mr-2" /> Financial Ledger
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                className="border-zinc-800 bg-zinc-950 hover:bg-amber-500/10 hover:text-amber-300 h-9"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="border-zinc-800 bg-zinc-950 hover:bg-amber-500/10 hover:text-amber-300 text-xs h-9"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export CSV
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                className="border-zinc-800 bg-zinc-950 hover:bg-amber-500/10 hover:text-amber-300 text-xs h-9"
              >
                <FileText className="mr-2 h-4 w-4" /> Export PDF Report
              </Button>
            </div>
          </div>

          {/* Visual Charts Tab */}
          <TabsContent value="charts" className="space-y-6 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly Collection Trend */}
              <Card className="lg:col-span-2 bg-zinc-950 border-amber-500/10 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-500" /> Collections & Outstanding Trend
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Monthly overview of paid vs outstanding billed amounts in PKR (Last 6 Months)
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyCollectionsData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                      <YAxis
                        stroke="#71717a"
                        fontSize={11}
                        tickFormatter={(value) => `Rs.${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: "rgba(9, 9, 11, 0.95)", borderColor: "#3f3f46", borderRadius: "8px" }}
                        itemStyle={{ color: "#f4f4f5" }}
                        labelStyle={{ color: "#f4f4f5", fontWeight: "bold" }}
                        formatter={(value: any) => [`Rs. ${value.toLocaleString()}`, ""]}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Bar dataKey="paid" name="Collected (Paid)" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="outstanding" name="Outstanding" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Revenue Contribution by Plan Tier */}
              <Card className="bg-zinc-950 border-amber-500/10 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <PieIcon className="h-4 w-4 text-amber-500" /> Revenue Contribution by Plan
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Distribution of active Monthly Recurring Revenue by subscription tier
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-80 flex flex-col justify-between">
                  {planChartData.contributionData.every((item) => item.value === 0) ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                      No active subscription revenue data
                    </div>
                  ) : (
                    <>
                      <div className="h-52 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={planChartData.contributionData.filter((d) => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {planChartData.contributionData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: "rgba(9, 9, 11, 0.95)", borderColor: "#3f3f46", borderRadius: "8px" }}
                              itemStyle={{ color: "#f4f4f5" }}
                              labelStyle={{ color: "#a1a1aa" }}
                              formatter={(value: any) => [`Rs. ${value.toLocaleString()}/mo`, "MRR"]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-900">
                        {planChartData.contributionData.map((plan) => (
                          <div key={plan.name} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: plan.fill }} />
                            <span className="text-zinc-400 truncate">{plan.name}:</span>
                            <span className="text-zinc-200 font-mono font-semibold">
                              {((plan.value / (metrics.mrr || 1)) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* School Plan Count Distribution */}
            <Card className="bg-zinc-950 border-amber-500/10 shadow-lg">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-500" /> Active School License Distribution
                </CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Number of active tenant schools assigned to each billing plan tier
                </CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={planChartData.countData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" stroke="#71717a" fontSize={11} width={80} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(9, 9, 11, 0.95)", borderColor: "#3f3f46", borderRadius: "8px" }}
                      itemStyle={{ color: "#f4f4f5" }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(value: any) => [`${value} School(s)`, "Active licenses"]}
                    />
                    <Bar dataKey="value" name="Licenses" radius={[0, 4, 4, 0]} maxBarSize={30}>
                      {planChartData.countData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Growth Projections Simulator */}
          <TabsContent value="simulator" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Simulator settings */}
              <Card className="bg-zinc-950 border-amber-500/10 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-amber-500" /> Growth Parameters
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Adjust pricing parameters and school projections to simulate future ARR
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Slider 1: New school licenses */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label className="text-zinc-300 font-medium">New School Signups</Label>
                      <span className="text-amber-500 font-bold font-mono">+{growthNewSchools} Schools</span>
                    </div>
                    <Slider
                      min={0}
                      max={50}
                      step={1}
                      value={[growthNewSchools]}
                      onValueChange={(val) => setGrowthNewSchools(val[0])}
                      className="py-2"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Simulated number of school licenses to acquire over the projection period.
                    </p>
                  </div>

                  {/* Dropdown: Target tier for new schools */}
                  <div className="space-y-2">
                    <Label className="text-zinc-300 text-xs font-medium">Assumed Plan Tier for New Signups</Label>
                    <Select
                      value={simulatorPlanTier}
                      onValueChange={(val: any) => setSimulatorPlanTier(val)}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-200 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
                        <SelectItem value="Average">Average Contract Value (ARPS)</SelectItem>
                        <SelectItem value="Basic">Basic (Rs. {planTemplates.Basic.monthly.toLocaleString()}/mo)</SelectItem>
                        <SelectItem value="Standard">Standard (Rs. {planTemplates.Standard.monthly.toLocaleString()}/mo)</SelectItem>
                        <SelectItem value="Premium">Premium (Rs. {planTemplates.Premium.monthly.toLocaleString()}/mo)</SelectItem>
                        <SelectItem value="Enterprise">Enterprise (Rs. {planTemplates.Enterprise.monthly.toLocaleString()}/mo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Slider 2: Price changes */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <Label className="text-zinc-300 font-medium">Subscription Price Adjustment</Label>
                      <span className={`font-bold font-mono ${growthPriceAdjust >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {growthPriceAdjust >= 0 ? "+" : ""}{growthPriceAdjust}%
                      </span>
                    </div>
                    <Slider
                      min={-50}
                      max={100}
                      step={5}
                      value={[growthPriceAdjust]}
                      onValueChange={(val) => setGrowthPriceAdjust(val[0])}
                      className="py-2"
                    />
                    <p className="text-[10px] text-zinc-500">
                      Simulate a price change on all platform subscriptions (existing + new).
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Simulation outputs */}
              <Card className="lg:col-span-2 bg-zinc-950 border-amber-500/10 shadow-lg relative overflow-hidden">
                {/* Glow effect */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                <CardHeader>
                  <CardTitle className="text-sm font-bold text-white flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-400" /> Projection Summary
                    </span>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-mono text-xs">
                      +{simulatedProjections.growthPercent.toFixed(0)}% Growth
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-400">
                    Projected growth outcomes comparing current benchmarks against simulated metrics
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* MRR Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-zinc-900">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400">Current MRR</span>
                      <div className="text-xl font-bold text-zinc-300 font-mono">
                        Rs. {metrics.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">Simulated MRR</span>
                      <div className="text-2xl font-black text-amber-400 font-mono">
                        Rs. {simulatedProjections.simulatedMRR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                        (+Rs. {simulatedProjections.mrrDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo)
                      </span>
                    </div>
                  </div>

                  {/* Annualized Projection comparisons */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-zinc-900">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400">Current Annual Run Rate (ARR)</span>
                      <div className="text-xl font-bold text-zinc-300 font-mono">
                        Rs. {(metrics.mrr * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">Projected Annual Run Rate (ARR)</span>
                      <div className="text-2xl font-black text-emerald-400 font-mono">
                        Rs. {simulatedProjections.simulatedARR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                        (+Rs. {simulatedProjections.arrDelta.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr)
                      </span>
                    </div>
                  </div>

                  {/* Growth Forecast Timeline */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200 mb-3 flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-zinc-400" /> Revenue Forecast Timeline
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-black/40 border border-zinc-900 p-2.5 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-500 font-medium">3-Month Forecast</span>
                        <div className="text-xs font-bold text-zinc-300 font-mono">
                          Rs. {(simulatedProjections.simulatedMRR * 3).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <span className="text-[9px] text-zinc-500">
                          Current: Rs. {(metrics.mrr * 3).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>

                      <div className="bg-black/40 border border-zinc-900 p-2.5 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-500 font-medium">6-Month Forecast</span>
                        <div className="text-xs font-bold text-zinc-300 font-mono">
                          Rs. {(simulatedProjections.simulatedMRR * 6).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <span className="text-[9px] text-zinc-500">
                          Current: Rs. {(metrics.mrr * 6).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>

                      <div className="bg-black/40 border border-zinc-900 p-2.5 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-500 font-medium">12-Month Forecast</span>
                        <div className="text-xs font-bold text-amber-400 font-mono">
                          Rs. {(simulatedProjections.simulatedMRR * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <span className="text-[9px] text-zinc-500">
                          Current: Rs. {(metrics.mrr * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Financial Ledger Tab */}
          <TabsContent value="ledger" className="mt-0">
            <Card className="bg-zinc-950 border-amber-500/10 shadow-lg">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-amber-500" /> Platform Billing Ledger
                    </CardTitle>
                    <CardDescription className="text-xs text-zinc-400">
                      Audit recent invoice collections, outstanding accounts, and individual school payments
                    </CardDescription>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <Input
                        placeholder="Search ref or school..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 w-44 bg-zinc-900 border-zinc-800 text-xs text-zinc-300 placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                      />
                    </div>

                    {/* Status */}
                    <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val)}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-300 text-[10px] h-8 w-28">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs">
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Unpaid">Unpaid</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Plan */}
                    <Select value={planFilter} onValueChange={(val) => setPlanFilter(val)}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-300 text-[10px] h-8 w-28">
                        <SelectValue placeholder="All Plans" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs">
                        <SelectItem value="all">All Plans</SelectItem>
                        <SelectItem value="Basic">Basic</SelectItem>
                        <SelectItem value="Standard">Standard</SelectItem>
                        <SelectItem value="Premium">Premium</SelectItem>
                        <SelectItem value="Enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* School */}
                    <Select value={schoolFilter} onValueChange={(val) => setSchoolFilter(val)}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-300 text-[10px] h-8 w-36">
                        <SelectValue placeholder="All Schools" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300 text-xs">
                        <SelectItem value="all">All Schools</SelectItem>
                        {schools.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto rounded-xl border border-zinc-800 bg-black/40">
                  <Table>
                    <TableHeader className="border-b border-zinc-800">
                      <TableRow className="hover:bg-transparent border-b border-zinc-800">
                        <TableHead className="text-zinc-400 font-medium">Invoice Number</TableHead>
                        <TableHead className="text-zinc-400 font-medium">School</TableHead>
                        <TableHead className="text-zinc-400 font-medium">Plan Tier</TableHead>
                        <TableHead className="text-zinc-400 font-medium">Billed Date</TableHead>
                        <TableHead className="text-zinc-400 font-medium">Due Date</TableHead>
                        <TableHead className="text-zinc-400 font-medium">Amount</TableHead>
                        <TableHead className="text-zinc-400 font-medium">Status</TableHead>
                        <TableHead className="text-right text-zinc-400 font-medium">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-zinc-500">
                            Loading ledger records...
                          </TableCell>
                        </TableRow>
                      ) : filteredInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-zinc-500">
                            No matching invoice records found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInvoices.map((inv) => {
                          const matchedSchool = schools.find((s) => s.id === inv.school_id);
                          const isOverdue = inv.status === "Unpaid" && new Date(inv.due_date) < new Date();
                          return (
                            <TableRow key={inv.id} className="hover:bg-zinc-900/20 border-b border-zinc-900">
                              <TableCell className="font-semibold text-white font-mono text-xs">
                                {inv.invoice_number}
                              </TableCell>
                              <TableCell className="text-zinc-300 font-medium">
                                {inv.school_name}
                              </TableCell>
                              <TableCell>
                                <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px]">
                                  {matchedSchool?.plan_tier || "Basic"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-zinc-400 text-xs font-mono">
                                {inv.billing_date}
                              </TableCell>
                              <TableCell className="text-zinc-400 text-xs font-mono">
                                {inv.due_date}
                              </TableCell>
                              <TableCell className="text-zinc-200 font-mono text-xs">
                                Rs. {inv.amount.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    inv.status === "Paid"
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px]"
                                      : isOverdue
                                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/20 text-[10px]"
                                      : "bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px]"
                                  }
                                >
                                  {inv.status === "Paid" ? "Paid" : isOverdue ? "Overdue" : "Unpaid"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenEditModal(inv)}
                                    className="h-8 w-8 p-0 text-zinc-500 hover:text-amber-400"
                                    title="Edit Invoice"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handlePrintReceipt(inv)}
                                    className="h-8 w-8 p-0 text-zinc-500 hover:text-amber-400"
                                    title="Download PDF Voucher Receipt"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Invoice Dialog */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
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
                onClick={() => setIsEditModalOpen(false)}
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
