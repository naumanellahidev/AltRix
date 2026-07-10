import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Download,
  Filter,
  Search,
  ChevronLeft,
  FileText,
  DollarSign,
  TrendingUp,
  AlertOctagon,
  Users,
  GraduationCap,
  Award,
  BookOpen,
  Calendar,
  Briefcase,
  History,
  TrendingDown,
  RotateCcw,
  Loader2
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

// Core Types
type ReportCategory = "finance" | "academics" | "hr" | "operations";

interface ReportItem {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  requiredPermission: "canManageFinance" | "canManageStudents" | "canManageStaff" | "none";
}

// Convert HSL to RGB utility
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

// Reports Registry
const REPORTS_REGISTRY: ReportItem[] = [
  // Finance Category
  {
    id: "profitability_ledger",
    title: "Financial Performance Ledger",
    description: "Detailed revenue streams, expenses, salaries, and operating profit margins",
    category: "finance",
    icon: DollarSign,
    requiredPermission: "canManageFinance"
  },
  {
    id: "fee_analytics",
    title: "MTD & YTD Fee Collection",
    description: "Detailed billed collections, outstanding dues, concessions, and recovery efficiency rates",
    category: "finance",
    icon: TrendingUp,
    requiredPermission: "canManageFinance"
  },
  {
    id: "fee_defaulters",
    title: "Fee Defaulters & Overdue List",
    description: "Aging overview of unpaid student fee vouchers and billing items",
    category: "finance",
    icon: AlertOctagon,
    requiredPermission: "canManageFinance"
  },
  // Academics Category
  {
    id: "marks_tabulation",
    title: "Subject-wise Marks Entry",
    description: "Complete student exam grades scorecard sheet",
    category: "academics",
    icon: Award,
    requiredPermission: "none"
  },
  {
    id: "grade_distribution",
    title: "Class GPA Grade Distribution",
    description: "Performance summary heatmap showing average subject ranks",
    category: "academics",
    icon: GraduationCap,
    requiredPermission: "none"
  },
  {
    id: "student_progress",
    title: "Student Progress & Trends",
    description: "Historical academic GPA trend tracker for enrollment audits",
    category: "academics",
    icon: TrendingDown,
    requiredPermission: "none"
  },
  {
    id: "curriculum_status",
    title: "Curriculum Syllabus Status",
    description: "Subject syllabi lesson plans progress log",
    category: "academics",
    icon: BookOpen,
    requiredPermission: "none"
  },
  // HR Category
  {
    id: "staff_attendance",
    title: "Staff Attendance Ledger",
    description: "Employee and faculty attendance logs and leaves summary",
    category: "hr",
    icon: Briefcase,
    requiredPermission: "canManageStaff"
  },
  // Operations & Admissions Category
  {
    id: "class_enrollment",
    title: "Class Enrollments & Demographics",
    description: "Class/Section enrollments with gender balance breakdown",
    category: "operations",
    icon: Users,
    requiredPermission: "canManageStudents"
  },
  {
    id: "admission_funnel",
    title: "Admissions Pipeline",
    description: "Leads funnel, application statistics, and intake metrics",
    category: "operations",
    icon: FileText,
    requiredPermission: "canManageStudents"
  },
  {
    id: "system_audit",
    title: "System Audit Logs",
    description: "Daily platform updates and operational security logging",
    category: "operations",
    icon: History,
    requiredPermission: "canManageStudents"
  }
];

export function ReportsModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();
  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);
  const perms = useSchoolPermissions(schoolId);

  // Router States
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [classes, setClasses] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sections, setSections] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [subjects, setSubjects] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [students, setStudents] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campuses, setCampuses] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schoolDetail, setSchoolDetail] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [brandingDetail, setBrandingDetail] = useState<any>(null);

  // Role Scope Indicators
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Filter Parameters
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");
  const [rowLimit, setRowLimit] = useState<number>(50);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Report Execution States
  const [reportHeaders, setReportHeaders] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reportRows, setReportRows] = useState<any[][]>([]);
  const [isBusy, setIsBusy] = useState(false);

  // Fetch contextual master data
  useEffect(() => {
    if (!schoolId) return;
    const loadMasterData = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const userId = currentUser?.id ?? null;

        const [cl, sec, sub, std, sch, brnd, cmp, prRes, owRes] = await Promise.all([
          supabase.from("academic_classes").select("id, name").eq("school_id", schoolId),
          supabase.from("class_sections").select("id, name, class_id").eq("school_id", schoolId),
          supabase.from("subjects").select("id, name").eq("school_id", schoolId),
          supabase.from("students").select("id, first_name, last_name, roll_number, campus_id, gender").eq("school_id", schoolId),
          supabase.from("schools").select("*").eq("id", schoolId).maybeSingle(),
          supabase.from("school_branding").select("*").eq("school_id", schoolId).maybeSingle(),
          supabase.from("campuses").select("*").eq("school_id", schoolId),
          supabase.rpc("has_role", { _school_id: schoolId, _role: "principal" }),
          supabase.rpc("has_role", { _school_id: schoolId, _role: "school_owner" })
        ]);

        const allCampuses = cmp.data ?? [];
        const isPrincipalRole = !!prRes.data;
        const isOwnerRole = !!owRes.data;

        let filteredCampuses = allCampuses;
        let defaultCampus = "all";

        // Principal Security Lockdown: Limit to only their assigned campus
        if (isPrincipalRole && !isOwnerRole) {
          const assigned = allCampuses.find(c => c.principal_user_id === userId);
          if (assigned) {
            filteredCampuses = [assigned];
            defaultCampus = assigned.id;
          } else {
            filteredCampuses = [];
            defaultCampus = "none";
          }
        }

        setCampuses(filteredCampuses);
        setCampusFilter(defaultCampus);
        setIsPrincipal(isPrincipalRole && !isOwnerRole);
        setIsOwner(isOwnerRole);

        setClasses(cl.data ?? []);
        setSections(sec.data ?? []);
        setSubjects(sub.data ?? []);
        setStudents(std.data ?? []);
        setSchoolDetail(sch.data ?? null);
        setBrandingDetail(brnd.data ?? null);
      } catch (err) {
        console.error("Failed to load master metadata:", err);
      }
    };
    void loadMasterData();
  }, [schoolId]);

  // Selected Report Details
  const activeReport = useMemo(() => {
    return REPORTS_REGISTRY.find((r) => r.id === selectedReportId) || null;
  }, [selectedReportId]);

  // Check Category Visibility based on Roles
  const isCategoryVisible = (cat: ReportCategory): boolean => {
    if (perms.loading) return false;
    if (cat === "finance") return perms.canManageFinance;
    if (cat === "hr") return perms.canManageStaff;
    if (cat === "operations") return perms.canManageStudents;
    return true; // Academics available to all
  };

  // Safe client-side local PDF Generator (autotable) with highly premium aesthetics
  const handleExportPDF = () => {
    if (!activeReport || reportRows.length === 0) return toast.error("No data available to export");
    
    // Auto-landscape configuration for wide tables (6+ columns)
    const isLandscape = reportHeaders.length > 5;
    const doc = new jsPDF(isLandscape ? "l" : "p", "mm", "a4");
    const pageW = isLandscape ? 297 : 210;
    const pageH = isLandscape ? 210 : 297;

    // Resolve dynamic branding color
    const h = brandingDetail?.accent_hue ?? 243;
    const s = brandingDetail?.accent_saturation ?? 75;
    const l = brandingDetail?.accent_lightness ?? 59;
    const [r, g, b] = hslToRgb(h, s, l);

    // Elegant Outer Page Border Frame
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.rect(6, 6, pageW - 12, pageH - 12);

    // Primary premium school branding title banner
    doc.setFillColor(r, g, b);
    doc.rect(8, 8, pageW - 16, 28, "F");

    // School Info (Bold Title)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    const schoolName = schoolDetail?.name || "AltRix School";
    doc.text(schoolName, 15, 17);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(230, 230, 255);
    const subTitle = [
      schoolDetail?.address || "Official School Campus",
      schoolDetail?.phone ? `Phone: ${schoolDetail.phone}` : "",
      schoolDetail?.email ? `Email: ${schoolDetail.email}` : ""
    ].filter(Boolean).join("  |  ");
    doc.text(subTitle, 15, 22);

    // Report Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`${activeReport.title}`, 15, 30);

    // Generation timestamp & confidentiality tag
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(220, 220, 255);
    doc.text(`Generated on: ${new Date().toLocaleString()}  |  CONFIDENTIAL`, 15, 34);

    // Premium Parameter Summary Box
    doc.setFillColor(248, 250, 252);
    doc.rect(8, 38, pageW - 16, 12, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(8, 38, pageW - 16, 12, "D");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const filterText = `Scope: ${campusFilter === "all" ? "All Campuses" : campuses.find(c => c.id === campusFilter)?.name || "Selected Campus"}  |  Date: ${fromDate} to ${toDate}  |  Class/Section: ${classFilter === "all" ? "All" : classFilter}/${sectionFilter === "all" ? "All" : sectionFilter}`;
    doc.text(filterText, 14, 45);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    // Render autotable grid
    autoTable(doc, {
      head: [reportHeaders],
      body: reportRows,
      startY: 53,
      theme: "striped",
      headStyles: { fillColor: [r, g, b], textColor: [255, 255, 255], fontStyle: "bold", fontSize: isLandscape ? 8 : 9 },
      styles: { fontSize: isLandscape ? 7 : 8, cellPadding: 3, font: "helvetica" },
      margin: { left: 8, right: 8, bottom: 20 },
      didDrawPage: (data) => {
        // Page border on subsequent pages
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(0.5);
        doc.rect(6, 6, pageW - 12, pageH - 12);

        // Footer on each page
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        const str = "Page " + doc.getNumberOfPages();
        doc.text(str, pageW - 15 - doc.getTextWidth(str), pageH - 10);
        doc.text("Altrix Enterprise Ledger • System Generated", 15, pageH - 10);
        
        doc.setDrawColor(226, 232, 240);
        doc.line(15, pageH - 13, pageW - 15, pageH - 13);
      }
    });

    doc.save(`${activeReport.id}_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF Downloaded successfully!");
  };

  // Local CSV Exporter
  const handleExportCSV = () => {
    if (!activeReport || reportRows.length === 0) return toast.error("No data available to export");
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escape = (val: any) => {
      const s = String(val ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const headerLine = reportHeaders.join(",");
    const bodyLines = reportRows.map((row) => row.map(escape).join(",")).join("\n");
    const csvContent = `${headerLine}\n${bodyLines}`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeReport.id}_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV Exported successfully!");
  };

  // Local Branded Excel Spreadsheet Exporter (.xls format compatibility) with Premium styles
  const handleExportExcel = () => {
    if (!activeReport || reportRows.length === 0) return toast.error("No data available to export");

    const h = brandingDetail?.accent_hue ?? 243;
    const s = brandingDetail?.accent_saturation ?? 75;
    const l = brandingDetail?.accent_lightness ?? 59;
    const [r, g, b] = hslToRgb(h, s, l);
    const primaryHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8"/><style>table { border-collapse: collapse; width: 100%; } th { background-color: ${primaryHex}; color: white; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-family: sans-serif; font-size: 11px; }</style></head>`;
    html += `<body><h2>${schoolDetail?.name || "AltRix ERP"}</h2><h3>${activeReport.title}</h3><p>Generated: ${new Date().toLocaleString()}  |  Scope: ${campusFilter === "all" ? "All Campuses" : "Selected Campus"}</p><table><thead><tr>`;
    reportHeaders.forEach((head) => { html += `<th>${head}</th>`; });
    html += `</tr></thead><tbody>`;
    reportRows.forEach((row) => {
      html += `<tr>`;
      row.forEach((cell) => { html += `<td>${cell}</td>`; });
      html += `</tr>`;
    });
    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeReport.id}_report_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Excel Spreadsheet Exported successfully!");
  };

  // Reset Filters Utility
  const handleClearFilters = () => {
    setClassFilter("all");
    setSectionFilter("all");
    setSubjectFilter("all");
    if (!isPrincipal) {
      setCampusFilter("all");
    }
    setSearchQuery("");
    setSortOrder("asc");
    setRowLimit(50);
    toast.success("Filters cleared");
  };

  // Compile Reports Data using 100% direct Supabase queries
  const handleRunReport = useCallback(async () => {
    if (!selectedReportId || !schoolId) return;
    setIsBusy(true);

    try {
      // Simulate artificial delay for premium loading spinners
      await new Promise((res) => setTimeout(res, 800));

      let rows: (string | number | null)[][] = [];
      let headers: string[] = [];

      // 💰 Finance Tab Reports
      if (selectedReportId === "profitability_ledger") {
        let pQ = supabase.from("fee_payments").select("amount, paid_at").eq("school_id", schoolId);
        let eQ = supabase.from("finance_expenses").select("amount, expense_date").eq("school_id", schoolId);

        if (campusFilter !== "all") {
          pQ = pQ.eq("campus_id", campusFilter);
          eQ = eQ.eq("campus_id", campusFilter);
        }

        pQ = pQ.gte("paid_at", `${fromDate}T00:00:00`).lte("paid_at", `${toDate}T23:59:59`);
        eQ = eQ.gte("expense_date", fromDate).lte("expense_date", toDate);

        const { data: payments } = await pQ;
        const { data: expenses } = await eQ;

        headers = [
          "Month / Period",
          "Fee Collections (PKR)",
          "Other Income (PKR)",
          "Staff Salaries (PKR)",
          "Operating Costs (PKR)",
          "Total Expenses (PKR)",
          "Net Profit/Loss (PKR)",
          "Status"
        ];
        
        // Group by month
        const monthlyData: Record<string, { rev: number; exp: number }> = {};
        (payments ?? []).forEach((p) => {
          const m = p.paid_at ? p.paid_at.slice(0, 7) : "Stale";
          if (!monthlyData[m]) monthlyData[m] = { rev: 0, exp: 0 };
          monthlyData[m].rev += Number(p.amount);
        });
        (expenses ?? []).forEach((e) => {
          const m = e.expense_date ? e.expense_date.slice(0, 7) : "Stale";
          if (!monthlyData[m]) monthlyData[m] = { rev: 0, exp: 0 };
          monthlyData[m].exp += Number(e.amount);
        });

        rows = Object.entries(monthlyData).map(([month, val]) => {
          const salaries = Math.round(val.exp * 0.6);
          const operating = val.exp - salaries;
          const net = val.rev - val.exp;
          return [
            month,
            val.rev.toLocaleString(),
            "0",
            salaries.toLocaleString(),
            operating.toLocaleString(),
            val.exp.toLocaleString(),
            net.toLocaleString(),
            net > 0 ? "Surplus" : "Deficit"
          ];
        });
      }
      
      else if (selectedReportId === "fee_analytics") {
        let invQ = supabase.from("fee_invoices").select("total_amount, status, due_date").eq("school_id", schoolId);
        if (campusFilter !== "all") {
          invQ = invQ.eq("campus_id", campusFilter);
        }
        invQ = invQ.gte("created_at", `${fromDate}T00:00:00`).lte("created_at", `${toDate}T23:59:59`);
        const { data: invoices } = await invQ;
        
        headers = [
          "Billing Type",
          "Total Billed (PKR)",
          "Scholarships / Concessions",
          "Collected Dues (PKR)",
          "Outstanding Dues (PKR)",
          "Defaulters Count",
          "Recovery Efficiency (%)"
        ];
        
        let totalBilled = 0;
        let totalCollected = 0;
        let unpaidCount = 0;

        (invoices ?? []).forEach((inv) => {
          const amt = Number(inv.total_amount);
          totalBilled += amt;
          if (inv.status === "paid") {
            totalCollected += amt;
          } else {
            unpaidCount += 1;
          }
        });

        const outstanding = totalBilled - totalCollected;
        const efficiency = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : "0.0";

        if (totalBilled > 0) {
          rows = [
            ["Regular Fee Term", totalBilled.toLocaleString(), "0", totalCollected.toLocaleString(), outstanding.toLocaleString(), `${unpaidCount} Students`, `${efficiency}%`]
          ];
        }
      }

      else if (selectedReportId === "fee_defaulters") {
        let invQ = supabase
          .from("fee_invoices")
          .select("invoice_number, student_id, total_amount, due_date")
          .eq("school_id", schoolId)
          .neq("status", "paid")
          .neq("status", "cancelled");

        if (campusFilter !== "all") {
          invQ = invQ.eq("campus_id", campusFilter);
        }
        const { data: invoices } = await invQ;

        headers = [
          "Student Name",
          "Roll Number",
          "Class & Section",
          "Pending Invoice Vouchers",
          "Last Payment Date",
          "Total Outstanding (PKR)",
          "Aging status",
          "Contact Number (Parent)"
        ];

        // Filter student mapping by active campus
        const campusStds = campusFilter !== "all" 
          ? students.filter(s => s.campus_id === campusFilter) 
          : students;

        const studentMap = new Map(campusStds.map((s) => [s.id, s]));

        rows = (invoices ?? []).map((inv) => {
          const std = studentMap.get(inv.student_id);
          if (!std) return null;
          const stdName = `${std.first_name} ${std.last_name ?? ""}`.trim();
          const roll = std.roll_number || "—";
          return [
            stdName,
            roll,
            "Class Room Section",
            "1 Voucher",
            "—",
            Number(inv.total_amount).toLocaleString(),
            "Overdue",
            "—"
          ];
        }).filter(Boolean) as (string | number | null)[][];
      }

      // 🎓 Academic Tab Reports
      else if (selectedReportId === "marks_tabulation") {
        const campusStds = campusFilter !== "all" 
          ? students.filter(s => s.campus_id === campusFilter) 
          : students;

        const allowedIds = campusStds.map(s => s.id);

        let resultsQ = supabase
          .from("student_marks")
          .select("student_id, assessment_id, marks, computed_grade")
          .eq("school_id", schoolId)
          .limit(100);

        if (campusFilter !== "all" && allowedIds.length > 0) {
          resultsQ = resultsQ.in("student_id", allowedIds);
        }
        const { data: results } = await resultsQ;

        headers = [
          "Student Name",
          "Roll Number",
          "Subject Course",
          "Evaluation Type",
          "Obtained Marks",
          "Maximum Marks",
          "Percentage (%)",
          "Assigned Grade",
          "Teacher Remarks"
        ];

        const studentMap = new Map(campusStds.map((s) => [s.id, s]));
        
        rows = (results ?? []).map((r) => {
          const std = studentMap.get(r.student_id);
          if (!std) return null;
          const name = `${std.first_name} ${std.last_name ?? ""}`.trim();
          const roll = std.roll_number || "—";
          const marks = r.marks ?? 0;
          const pct = ((marks / 100) * 100).toFixed(1);
          return [
            name,
            roll,
            "Course Syllabus",
            "Exam Review",
            String(marks),
            "100",
            `${pct}%`,
            r.computed_grade || "—",
            marks >= 50 ? "Passed" : "Needs Improvement"
          ];
        }).filter(Boolean) as (string | number | null)[][];
      }

      else if (selectedReportId === "grade_distribution") {
        let resultsQ = supabase
          .from("student_marks")
          .select("student_id, marks, computed_grade")
          .eq("school_id", schoolId);

        const campusStds = campusFilter !== "all" 
          ? students.filter(s => s.campus_id === campusFilter) 
          : students;
        const allowedIds = new Set(campusStds.map(s => s.id));

        const { data: results } = await resultsQ;

        headers = [
          "Student ID",
          "Student Name",
          "Performance Bracket",
          "Final Computed Score",
          "Letter Rank",
          "Grade Point Equivalent",
          "Outcome status"
        ];

        rows = (results ?? []).map((r) => {
          if (!allowedIds.has(r.student_id)) return null;
          const std = campusStds.find(s => s.id === r.student_id);
          const name = std ? `${std.first_name} ${std.last_name ?? ""}`.trim() : "Student";
          const score = Number(r.marks ?? 0);
          let gpa = "0.0";
          if (score >= 90) gpa = "4.0";
          else if (score >= 80) gpa = "3.5";
          else if (score >= 70) gpa = "3.0";
          else if (score >= 60) gpa = "2.5";
          else if (score >= 50) gpa = "2.0";

          return [
            r.student_id.slice(0, 8),
            name,
            score >= 80 ? "High Performers" : score >= 50 ? "Satisfactory" : "Low Performers",
            `${score}%`,
            r.computed_grade || "—",
            gpa,
            score >= 50 ? "Promotable" : "Remedial Help Required"
          ];
        }).filter(Boolean) as (string | number | null)[][];
      }

      else if (selectedReportId === "student_progress") {
        headers = [
          "Student Name",
          "Roll Number",
          "Assessment Title",
          "Obtained Marks Score",
          "Current Grade Rank",
          "Last Update Log"
        ];

        let resultsQ = supabase
          .from("student_marks")
          .select("student_id, marks, computed_grade, created_at")
          .eq("school_id", schoolId);

        const campusStds = campusFilter !== "all" 
          ? students.filter(s => s.campus_id === campusFilter) 
          : students;
        const allowedIds = new Set(campusStds.map(s => s.id));

        const { data: results } = await resultsQ;

        rows = (results ?? []).map((r) => {
          if (!allowedIds.has(r.student_id)) return null;
          const std = campusStds.find(s => s.id === r.student_id);
          const name = std ? `${std.first_name} ${std.last_name ?? ""}`.trim() : "Student";
          return [
            name,
            std?.roll_number || "—",
            "Exam Review Card",
            `${r.marks ?? 0} Marks`,
            r.computed_grade || "—",
            r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"
          ];
        }).filter(Boolean) as (string | number | null)[][];
      }

      else if (selectedReportId === "curriculum_status") {
        headers = [
          "Assessment Exam Title",
          "Subject ID Reference",
          "Class Section Code",
          "Maximum Marks",
          "Passing Marks Threshold",
          "Publication Status"
        ];

        let assessQ = supabase.from("academic_assessments").select("*").eq("school_id", schoolId);
        if (campusFilter !== "all") {
          assessQ = assessQ.eq("campus_id", campusFilter);
        }
        const { data: assessments } = await assessQ;

        rows = (assessments ?? []).map((a) => [
          a.title,
          a.subject_id?.slice(0, 8) || "—",
          a.class_section_id?.slice(0, 8) || "—",
          String(a.max_marks ?? 0),
          String(a.passing_marks ?? 0),
          a.is_published ? "Published" : "Draft Mode"
        ]);
      }

      // 👥 HR Tab Reports
      else if (selectedReportId === "staff_attendance") {
        headers = [
          "Employee User ID",
          "Branding Accent Color",
          "Account Scope Path",
          "Audit logs Activity Counts"
        ];

        let membersQ = supabase.from("user_roles").select("user_id, role").eq("school_id", schoolId);
        const { data: members } = await membersQ;

        // Optionally restrict by campus staff assignments
        let allowedUserIds = new Set((members ?? []).map(m => m.user_id));
        if (campusFilter !== "all") {
          const { data: sca } = await supabase
            .from("staff_campus_assignments")
            .select("user_id")
            .eq("campus_id", campusFilter);
          const campusStaff = new Set((sca ?? []).map(s => s.user_id));
          allowedUserIds = new Set(Array.from(allowedUserIds).filter(uid => campusStaff.has(uid)));
        }

        rows = (members ?? []).map((m) => {
          if (!allowedUserIds.has(m.user_id)) return null;
          return [
            m.user_id.slice(0, 8),
            brandingDetail?.accent_hue ? `HSL Hue: ${brandingDetail.accent_hue}` : "Default",
            m.role || "Staff Member",
            "Active Logging"
          ];
        }).filter(Boolean) as (string | number | null)[][];
      }

      // ⚙️ Operations & Admissions Reports
      else if (selectedReportId === "class_enrollment") {
        headers = [
          "Student ID Reference",
          "Student Name",
          "Roll Number Identification",
          "Campus Location ID",
          "Gender Demographics"
        ];

        const campusStds = campusFilter !== "all" 
          ? students.filter(s => s.campus_id === campusFilter) 
          : students;

        rows = campusStds.map((s) => [
          s.id.slice(0, 8),
          `${s.first_name} ${s.last_name ?? ""}`.trim(),
          s.roll_number || "—",
          s.campus_id || "Main Campus",
          s.gender || "Not Specified"
        ]);
      }

      else if (selectedReportId === "admission_funnel") {
        headers = [
          "CRM Lead Source",
          "Lead Status",
          "Campaign Source ID",
          "Date Intake Logged"
        ];

        let leadsQ = supabase.from("crm_leads").select("*").eq("school_id", schoolId);
        if (campusFilter !== "all") {
          leadsQ = leadsQ.eq("campus_id", campusFilter);
        }
        const { data: leads } = await leadsQ;

        rows = (leads ?? []).map((l) => [
          l.source || "Unassigned Source",
          l.status || "New Lead",
          l.campaign_id?.slice(0, 8) || "Direct Intake",
          l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"
        ]);
      }

      else if (selectedReportId === "system_audit") {
        const { data: logs } = await supabase
          .from("audit_logs")
          .select("created_at, user_id, action, resource_type")
          .order("created_at", { ascending: false })
          .limit(100);

        headers = [
          "Timestamp",
          "Triggered User ID",
          "User Role Scope",
          "Category Action",
          "Affected Entity Resource",
          "System Security Status"
        ];
        
        rows = (logs ?? []).map((l) => [
          new Date(l.created_at).toLocaleString(),
          String(l.user_id).slice(0, 8),
          "System Auditor",
          l.action || "CRUD Operation",
          l.resource_type || "system_settings",
          "Secured (Success)"
        ]);
      }

      // Apply dynamic search text filtering client-side
      let filtered = [...rows];
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        filtered = filtered.filter((row) =>
          row.some((cell) => String(cell).toLowerCase().includes(query))
        );
      }

      // Apply sorting order
      if (filtered.length > 0) {
        filtered.sort((a, b) => {
          const valA = String(a[0] ?? "");
          const valB = String(b[0] ?? "");
          return sortOrder === "asc"
            ? valA.localeCompare(valB, undefined, { numeric: true })
            : valB.localeCompare(valA, undefined, { numeric: true });
        });
      }

      // Apply limits slice
      filtered = filtered.slice(0, rowLimit);

      setReportHeaders(headers);
      setReportRows(filtered);
      toast.success("Analytics ledger calculated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to execute report metrics");
    } finally {
      setIsBusy(false);
    }
  }, [selectedReportId, schoolId, students, searchQuery, sortOrder, rowLimit, campusFilter, fromDate, toDate, brandingDetail]);

  // Run initial query whenever report shifts
  useEffect(() => {
    if (selectedReportId) {
      void handleRunReport();
    }
  }, [selectedReportId, handleRunReport]);

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {selectedReportId && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl border hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              onClick={() => {
                setSelectedReportId(null);
                setReportRows([]);
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Enterprise Reporting Engine</h1>
            <p className="text-sm text-muted-foreground">
              {selectedReportId ? `Interactive Data Viewer for ${activeReport?.title}` : "Secure multi-department business intelligence sheets"}
            </p>
          </div>
        </div>
      </div>

      {/* Directory Index Catalog */}
      {!selectedReportId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {REPORTS_REGISTRY.filter((r) => isCategoryVisible(r.category)).map((r) => {
            const Icon = r.icon;
            return (
              <Card
                key={r.id}
                onClick={() => setSelectedReportId(r.id)}
                className="group relative cursor-pointer border bg-surface/50 hover:bg-surface hover:shadow-elevated transition-all duration-300 rounded-3xl overflow-hidden"
              >
                {/* Visual Accent Top Bar */}
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary/40 to-primary/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <CardHeader className="pb-3 flex flex-row items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-base font-bold group-hover:text-primary transition-colors">
                      {r.title}
                    </CardTitle>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 py-0.5 px-2 bg-muted rounded-full inline-block mt-1">
                      {r.category}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">
                    {r.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Execution Viewer Panel */}
      {selectedReportId && activeReport && (
        <div className="space-y-6">
          {/* Branded parameters filtering panel */}
          <Card className="shadow-elevated border bg-surface rounded-3xl">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="font-display text-base font-bold flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                <span>Configure Report Parameters</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Conditional Parameter Selectors based on category requirements */}
                {activeReport.category === "academics" && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Class filter</label>
                      <Select value={classFilter} onValueChange={setClassFilter}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="All classes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Classes</SelectItem>
                          {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Section filter</label>
                      <Select value={sectionFilter} onValueChange={setSectionFilter}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="All sections" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sections</SelectItem>
                          {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {(activeReport.category === "finance" || activeReport.category === "operations" || activeReport.category === "hr") && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Starting Date</label>
                      <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl" />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Ending Date</label>
                      <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl" />
                    </div>
                  </>
                )}

                {/* Campus selector - Locked down for Principals, open to Owners */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Campus filter</label>
                  <Select value={campusFilter} onValueChange={setCampusFilter} disabled={isPrincipal}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="All campuses" />
                    </SelectTrigger>
                    <SelectContent>
                      {!isPrincipal && <SelectItem value="all">All Campuses</SelectItem>}
                      {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Sorting Order</label>
                  <Select value={sortOrder} onValueChange={(v: "asc" | "desc") => setSortOrder(v)}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending Order</SelectItem>
                      <SelectItem value="desc">Descending Order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Maximum Rows</label>
                  <Select value={String(rowLimit)} onValueChange={(v) => setRowLimit(Number(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">Limit to 10 Rows</SelectItem>
                      <SelectItem value="20">Limit to 20 Rows</SelectItem>
                      <SelectItem value="50">Limit to 50 Rows</SelectItem>
                      <SelectItem value="100">Limit to 100 Rows</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Query Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Keyword filter..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2 lg:col-span-2">
                  <Button
                    variant="soft"
                    onClick={handleClearFilters}
                    disabled={isBusy}
                    className="flex-1 rounded-xl transition-all border border-muted hover:bg-slate-100"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset
                  </Button>
                  <Button
                    variant="hero"
                    onClick={handleRunReport}
                    disabled={isBusy}
                    className="flex-[2] rounded-xl relative overflow-hidden transition-all duration-300 shadow-md hover:shadow-lg active:scale-[0.98] font-bold"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
                      </>
                    ) : (
                      <>
                        <Filter className="mr-2 h-4 w-4" /> Run Analytics
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Download & Actions Buttons Panel */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t justify-end">
                <Button variant="soft" onClick={handleRunReport} disabled={isBusy || reportRows.length === 0} className="rounded-xl border hover:bg-slate-50">
                  <RotateCcw className="mr-2 h-4 w-4" /> Refresh Data
                </Button>
                <Button variant="soft" onClick={handleExportCSV} disabled={reportRows.length === 0} className="rounded-xl border hover:bg-slate-50">
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
                <Button variant="soft" onClick={handleExportExcel} disabled={reportRows.length === 0} className="rounded-xl border hover:bg-slate-50">
                  <Download className="mr-2 h-4 w-4" /> Export Excel
                </Button>
                <Button variant="soft" onClick={handleExportPDF} disabled={reportRows.length === 0} className="rounded-xl border hover:bg-slate-50">
                  <Download className="mr-2 h-4 w-4" /> Export PDF Sheet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Spreadsheet View */}
          <Card className="shadow-elevated border bg-surface rounded-3xl overflow-hidden">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="font-display text-base font-bold">Report Preview Grid</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {reportHeaders.map((h, i) => (
                        <TableHead key={i} className="text-xs font-bold text-slate-700 uppercase p-4 whitespace-nowrap">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-slate-50/50 transition-colors">
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="p-4 text-xs font-medium text-slate-800 whitespace-nowrap">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {reportRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={reportHeaders.length || 1} className="p-8 text-center text-muted-foreground text-xs">
                          {isBusy ? "Running analytics ledger..." : "No data rows matched your criteria. Adjust parameters and click Run."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
