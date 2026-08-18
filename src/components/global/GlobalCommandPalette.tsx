import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Search,
  Users,
  GraduationCap,
  KanbanSquare,
  BarChart3,
  CalendarDays,
  Coins,
  Headphones,
  Settings,
  LayoutGrid,
  ShieldCheck,
  UserCircle,
  Building2,
  FileText,
  Loader2,
  Bus,
  BookOpen,
  Package,
  Home,
  Award,
  HeartPulse,
  Sparkles,
  Layers,
  FileSignature,
  CreditCard,
  Receipt,
  Bell,
  MessageSquare,
  AlertTriangle,
  FolderLock,
  PlusCircle,
  TrendingUp,
  Clock,
  DoorClosed,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";

type Props = {
  basePath: string; // e.g. "/beacon/principal" or "/beacon/teacher"
};

type SearchResult = {
  entity: "students" | "parents" | "staff" | "leads" | "classes" | "transport" | "library" | "inventory";
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  url?: string;
};

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GlobalCommandPalette({ basePath }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 200);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Extract schoolSlug and current role from basePath (format: /schoolSlug/role)
  const { schoolSlug, currentRole } = useMemo(() => {
    const parts = basePath.split("/").filter(Boolean);
    return {
      schoolSlug: parts[0] || "",
      currentRole: parts[1] || "principal",
    };
  }, [basePath]);

  const [schoolId, setSchoolId] = useState<string | null>(null);

  // Fetch schoolId on mount
  useEffect(() => {
    if (!schoolSlug) return;
    (async () => {
      const { data } = await api
        .from("schools")
        .select("id")
        .eq("slug", schoolSlug)
        .maybeSingle();
      if (data?.id) setSchoolId(data.id);
    })();
  }, [schoolSlug]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key?.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("eduverse:open-search", onOpen);
    return () => window.removeEventListener("eduverse:open-search", onOpen);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Search across all entities
  const performSearch = useCallback(async () => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }

    setSearching(true);
    const q = debouncedQuery.toLowerCase();

    // 1. Primary: High-speed FastAPI global search
    try {
      const resp = await apiClient.get("/search/global", { params: { q, limit: 35 } });
      if (resp.data?.results && Array.isArray(resp.data.results) && resp.data.results.length > 0) {
        const mappedResults: SearchResult[] = resp.data.results.map((r: any) => {
          let url = r.url;
          if (!url) {
            if (r.entity === "students") url = `${basePath}/academic?studentId=${r.id}`;
            else if (r.entity === "parents") url = `${basePath}/parent-notes`;
            else if (r.entity === "staff") url = `${basePath}/users?userId=${r.id}`;
            else if (r.entity === "classes") url = `${basePath}/academic?classId=${r.id}`;
            else if (r.entity === "leads") url = `${basePath}/crm?leadId=${r.id}`;
            else if (r.entity === "transport") url = `${basePath}/transport`;
            else if (r.entity === "library") url = `${basePath}/library`;
            else if (r.entity === "inventory") url = `${basePath}/inventory`;
            else url = basePath;
          }
          return {
            entity: r.entity,
            id: r.id,
            title: r.title,
            subtitle: r.subtitle,
            status: r.status,
            url,
          };
        });
        setResults(mappedResults);
        setSearching(false);
        return;
      }
    } catch (err) {
      console.warn("FastAPI global search fallback:", err);
    }

    // 2. Fallback: Direct safe entity queries (resilient with try/catch)
    if (!schoolId) {
      setResults([]);
      setSearching(false);
      return;
    }

    try {
      const [
        studentsRes,
        parentsRes,
        staffRes,
        leadsRes,
        classesRes,
        transportRes,
        libraryRes,
        inventoryRes,
      ] = await Promise.all([
        // 1. Students
        api
          .from("students")
          .select("id, first_name, last_name, admission_number, roll_number, status, phone")
          .eq("school_id", schoolId)
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,admission_number.ilike.%${q}%,roll_number.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(8)
          .catch(() => ({ data: [] })),
        // 2. Parents (from students parent details)
        api
          .from("students")
          .select("id, first_name, last_name, parent_name, parent_phone, parent_email")
          .eq("school_id", schoolId)
          .not("parent_name", "is", null)
          .or(`parent_name.ilike.%${q}%,parent_phone.ilike.%${q}%,parent_email.ilike.%${q}%`)
          .limit(8)
          .catch(() => ({ data: [] })),
        // 3. Staff & Faculty (from profiles)
        api
          .from("profiles")
          .select("id, display_name, email, phone")
          .or(`display_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(8)
          .catch(() => ({ data: [] })),
        // 4. CRM Leads
        api
          .from("crm_leads")
          .select("id, student_name, parent_name, phone, status")
          .eq("school_id", schoolId)
          .or(`student_name.ilike.%${q}%,parent_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(6)
          .catch(() => ({ data: [] })),
        // 5. Academic Classes
        api
          .from("academic_classes")
          .select("id, name, grade_level")
          .eq("school_id", schoolId)
          .ilike("name", `%${q}%`)
          .limit(4)
          .catch(() => ({ data: [] })),
        // 6. Fleet / Vehicles
        api
          .from("transport_vehicles")
          .select("id, bus_number, registration_no, driver_name")
          .eq("school_id", schoolId)
          .or(`bus_number.ilike.%${q}%,registration_no.ilike.%${q}%,driver_name.ilike.%${q}%`)
          .limit(4)
          .catch(() => ({ data: [] })),
        // 7. Library Books
        api
          .from("library_books")
          .select("id, title, author, isbn, barcode")
          .eq("school_id", schoolId)
          .or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%,barcode.ilike.%${q}%`)
          .limit(4)
          .catch(() => ({ data: [] })),
        // 8. Inventory Items
        api
          .from("inventory_items")
          .select("id, item_name, category, sku")
          .eq("school_id", schoolId)
          .or(`item_name.ilike.%${q}%,category.ilike.%${q}%,sku.ilike.%${q}%`)
          .limit(4)
          .catch(() => ({ data: [] })),
      ]);

      const studentList: SearchResult[] = (studentsRes.data || []).map((s: any) => ({
        entity: "students",
        id: s.id,
        title: `${s.first_name || ""} ${s.last_name || ""}`.trim() || "Student",
        subtitle: `Roll: ${s.roll_number || s.admission_number || "N/A"} • Adm: ${s.admission_number || "N/A"}`,
        status: s.status || "enrolled",
        url: `${basePath}/academic?studentId=${s.id}`,
      }));

      const parentsList: SearchResult[] = (parentsRes.data || []).map((p: any) => ({
        entity: "parents",
        id: p.id,
        title: p.parent_name || "Parent / Guardian",
        subtitle: `Child: ${p.first_name || ""} ${p.last_name || ""} • Phone: ${p.parent_phone || p.parent_email || "N/A"}`.trim(),
        status: "active",
        url: `${basePath}/parent-notes`,
      }));

      const staffList: SearchResult[] = (staffRes.data || []).map((st: any) => ({
        entity: "staff",
        id: st.id,
        title: st.display_name || st.email || "Staff Member",
        subtitle: `Staff & Faculty • ${st.email || st.phone || "Active"}`,
        url: `${basePath}/users?userId=${st.id}`,
      }));

      const leadsList: SearchResult[] = (leadsRes.data || []).map((l: any) => ({
        entity: "leads",
        id: l.id,
        title: l.student_name || "Lead Applicant",
        subtitle: `Parent: ${l.parent_name || "N/A"} • ${l.phone || ""}`,
        status: l.status || "new",
        url: `${basePath}/crm?leadId=${l.id}`,
      }));

      const classesList: SearchResult[] = (classesRes.data || []).map((c: any) => ({
        entity: "classes",
        id: c.id,
        title: `Class: ${c.name}`,
        subtitle: `Grade Level: ${c.grade_level || "N/A"}`,
        url: `${basePath}/academic?classId=${c.id}`,
      }));

      const transportList: SearchResult[] = (transportRes.data || []).map((t: any) => ({
        entity: "transport",
        id: t.id,
        title: `Bus: ${t.bus_number}`,
        subtitle: `Driver: ${t.driver_name || "Unassigned"} • ${t.registration_no || ""}`,
        url: `${basePath}/transport`,
      }));

      const libraryList: SearchResult[] = (libraryRes.data || []).map((b: any) => ({
        entity: "library",
        id: b.id,
        title: `Book: ${b.title}`,
        subtitle: `Author: ${b.author || "Unknown"} • ISBN: ${b.isbn || "N/A"}`,
        url: `${basePath}/library`,
      }));

      const inventoryList: SearchResult[] = (inventoryRes.data || []).map((i: any) => ({
        entity: "inventory",
        id: i.id,
        title: `Asset: ${i.item_name}`,
        subtitle: `Category: ${i.category || "General"} • SKU: ${i.sku || "N/A"}`,
        url: `${basePath}/inventory`,
      }));

      setResults([
        ...studentList,
        ...parentsList,
        ...staffList,
        ...leadsList,
        ...classesList,
        ...transportList,
        ...libraryList,
        ...inventoryList,
      ]);
    } catch (error) {
      console.error("Global search fallback error:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [schoolId, debouncedQuery, basePath]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  // Comprehensive navigation items covering all features and submodules
  const navItems = useMemo(
    () => [
      // Core & Academics
      { label: "Dashboard Overview", icon: LayoutGrid, href: basePath, keywords: "home overview kpis command center operations metrics" },
      { label: "Academic Management", icon: GraduationCap, href: `${basePath}/academic`, keywords: "classes sections subjects teachers students curriculum enrollment" },
      { label: "Timetable Builder", icon: CalendarDays, href: `${basePath}/timetable`, keywords: "schedule periods routine slots teacher allocation weekly master timetable" },
      { label: "Student Attendance Center", icon: CheckCircle2, href: `${basePath}/attendance`, keywords: "attendance present absent late excused daily rollcall register" },
      { label: "Seating Planner", icon: Layers, href: `${basePath}/seating-planner`, keywords: "seating arrangement exam seats classroom layout desks" },
      { label: "Curriculum Standards", icon: BookOpen, href: `${basePath}/curriculum`, keywords: "syllabus learning outcomes lesson plans standards rubrics" },
      { label: "Events Calendar", icon: CalendarDays, href: `${basePath}/events`, keywords: "annual calendar school events sports gala meetings parent teacher meeting" },
      { label: "School Diary", icon: BookOpen, href: `${basePath}/diary`, keywords: "homework daily diary class notes student assignments tasks" },
      { label: "Academic Setup", icon: Settings, href: `${basePath}/academic-setup`, keywords: "sessions terms grading scales academic years" },

      // People & HR
      { label: "Staff & Faculty Directory", icon: Users, href: `${basePath}/users`, keywords: "employees teachers staff profiles user accounts permissions" },
      { label: "Staff Appraisals & KPIs", icon: Award, href: `${basePath}/staff-appraisals`, keywords: "evaluation performance review staff ratings kpi scorecards pip" },
      { label: "HR Leaves Management", icon: Clock, href: `${basePath}/leaves`, keywords: "leave requests sick casual annual approval hr approvals" },
      { label: "HR Staff Attendance", icon: CheckCircle2, href: `${basePath}/staff-attendance`, keywords: "faculty biometric checkin punch in staff presence timesheet" },
      { label: "HR Payroll & Salaries", icon: Receipt, href: `${basePath}/salaries`, keywords: "payroll salary slips bonuses deductions payslips" },
      { label: "HR Contracts & Policies", icon: FileSignature, href: `${basePath}/contracts`, keywords: "employment contracts agreements policy documents" },
      { label: "HR Documents", icon: FolderLock, href: `${basePath}/documents`, keywords: "staff files credentials certificates records" },

      // Operations & Logistics
      { label: "Fleet & Transport Logistics", icon: Bus, href: `${basePath}/transport`, keywords: "school bus routes fleet drivers stops gps tracking vehicle allocation" },
      { label: "Library & Barcode Circulation", icon: BookOpen, href: `${basePath}/library`, keywords: "books issue return catalog isbn shelf barcode circulation" },
      { label: "Asset & Inventory Management", icon: Package, href: `${basePath}/inventory`, keywords: "stock assets consumables lab equipment stationery purchase orders" },
      { label: "Hostel & Boarding Management", icon: Home, href: `${basePath}/hostel`, keywords: "rooms beds boarding warden student resident meal plan" },
      { label: "Alumni Network & Career Tracker", icon: Award, href: `${basePath}/alumni`, keywords: "graduates alumni association placements higher studies donations" },

      // Student Services & Wellbeing
      { label: "Student Wellbeing & Infirmary", icon: HeartPulse, href: `${basePath}/student-wellbeing`, keywords: "medical clinic infirmary doctor nurse vaccinations allergies health records" },
      { label: "Counseling & Guidance Center", icon: Sparkles, href: `${basePath}/counselor`, keywords: "counselor appointments behavioral sessions student support guidance" },
      { label: "At-Risk Students (Early Warning)", icon: AlertTriangle, href: `${basePath}/counselor/at-risk`, keywords: "early warning dropouts attendance risk academic intervention support" },
      { label: "Student Behavior & Disciplinary Notes", icon: FileText, href: `${basePath}/counselor/behavior`, keywords: "behavior incidents infractions warnings disciplinary records praise" },
      { label: "Gate & Visitor Security Console", icon: DoorClosed, href: `${basePath}/gate-visitor`, keywords: "security gate visitor passes checkin checkout badges entry log" },

      // CRM & Admissions
      { label: "Admissions Pipeline (CRM)", icon: KanbanSquare, href: `${basePath}/crm`, keywords: "admissions inquiry leads prospects kanban stages followups" },
      { label: "Marketing Leads", icon: Users, href: `${basePath}/leads`, keywords: "lead management inquiry call lists" },
      { label: "Follow-Ups & Call Logs", icon: Clock, href: `${basePath}/follow-ups`, keywords: "crm followups phone calls scheduled appointments" },
      { label: "Campaigns & Marketing Sources", icon: TrendingUp, href: `${basePath}/campaigns`, keywords: "marketing campaigns ads open days social media" },

      // Finance & Accounts
      { label: "Fees & Finance Center", icon: Coins, href: `${basePath}/fees`, keywords: "fee collection vouchers fee structures concessions discounts bank accounts" },
      { label: "Student Fee Invoices", icon: FileText, href: `${basePath}/invoices`, keywords: "generate invoices challans dues unpaid pending arrears" },
      { label: "Payment Collections", icon: CreditCard, href: `${basePath}/payments`, keywords: "cash payments online payments bank receipts vouchers collected" },
      { label: "Expense Tracker", icon: Receipt, href: `${basePath}/expenses`, keywords: "petty cash bills utility invoices purchase vouchers payments" },
      { label: "General Ledger & Accounting", icon: BarChart3, href: `${basePath}/ledger`, keywords: "chart of accounts balance sheet journal entries double entry" },
      { label: "Vendor Management", icon: Building2, href: `${basePath}/vendors`, keywords: "suppliers contractors vendors invoices procurement" },

      // Analytics, Admin & Communication
      { label: "Executive Reports & Analytics", icon: BarChart3, href: `${basePath}/reports`, keywords: "reports statistical graphs export excel pdf financial summaries" },
      { label: "AI Board & Owner Insights", icon: Sparkles, href: `${basePath}/owner-insights`, keywords: "ai forecasting board summary revenue predictions growth retention" },
      { label: "Complaints & Grievance Desk", icon: AlertTriangle, href: `${basePath}/complaints`, keywords: "parent complaints teacher issues unresolved tickets disputes feedback" },
      { label: "Parent Communication Notes", icon: MessageSquare, href: `${basePath}/parent-notes`, keywords: "parent messages feedback diary notes meetings" },
      { label: "Student ID Cards Studio", icon: CreditCard, href: `${basePath}/id-cards`, keywords: "generate id cards student badges printable barcode qr code" },
      { label: "Examinations & Term Assessments", icon: FileText, href: `${basePath}/exams`, keywords: "exams datesheet term marks grading entry roll numbers" },
      { label: "Report Cards & Transcripts", icon: Award, href: `${basePath}/report-cards`, keywords: "result cards print transcripts term evaluations gpa grades" },
      { label: "School Notices & Circulars", icon: Bell, href: `${basePath}/notices`, keywords: "announcements circulars public notices staff alerts" },
      { label: "Holiday & Vacation Planner", icon: CalendarDays, href: `${basePath}/holidays`, keywords: "public holidays school vacations gazetted off days" },
      { label: "Messages & Broadcasts", icon: MessageSquare, href: `${basePath}/messages`, keywords: "chat broadcast sms internal communication group discussions" },
      { label: "Help & Support Desk", icon: Headphones, href: `${basePath}/support`, keywords: "support tickets technical help documentation guide" },
      { label: "Campus & System Settings", icon: Settings, href: `${basePath}?settings=1`, keywords: "institute profile branding academic preferences configuration" },
    ],
    [basePath]
  );

  // Quick Action shortcuts
  const quickActions = useMemo(
    () => [
      { label: "Admit New Student", icon: PlusCircle, href: `${basePath}/academic?action=new-student`, keywords: "add register enroll student admission" },
      { label: "Collect Fee Payment", icon: CreditCard, href: `${basePath}/fees?action=collect-fee`, keywords: "pay fee voucher receipt cash payment" },
      { label: "Mark Today's Attendance", icon: CheckCircle2, href: `${basePath}/attendance`, keywords: "mark roll call daily present" },
      { label: "Register School Bus", icon: Bus, href: `${basePath}/transport?action=new-bus`, keywords: "add bus new route fleet vehicle" },
      { label: "Create Expense Voucher", icon: Receipt, href: `${basePath}/expenses?action=new-expense`, keywords: "add bill expense voucher petty cash" },
      { label: "Broadcast School Notice", icon: Bell, href: `${basePath}/notices?action=new-notice`, keywords: "post notice send circular announcement" },
    ],
    [basePath]
  );

  // Filter navigation items based on query
  const filteredNavItems = useMemo(() => {
    if (!query.trim()) return navItems.slice(0, 10);
    const q = query.toLowerCase();
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [navItems, query]);

  // Filter quick actions
  const filteredQuickActions = useMemo(() => {
    if (!query.trim()) return quickActions;
    const q = query.toLowerCase();
    return quickActions.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [quickActions, query]);

  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case "students":
        return GraduationCap;
      case "parents":
        return Users;
      case "staff":
        return UserCircle;
      case "leads":
        return KanbanSquare;
      case "classes":
        return Layers;
      case "transport":
        return Bus;
      case "library":
        return BookOpen;
      case "inventory":
        return Package;
      default:
        return FileText;
    }
  };

  const navigateToResult = (result: SearchResult) => {
    setOpen(false);
    if (result.url) {
      navigate(result.url);
    }
  };

  // Group results by entity
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {
      students: [],
      parents: [],
      staff: [],
      leads: [],
      classes: [],
      transport: [],
      library: [],
      inventory: [],
    };
    results.forEach((r) => {
      if (groups[r.entity]) {
        groups[r.entity].push(r);
      }
    });
    return groups;
  }, [results]);

  const hasResults = results.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search all modules, students, staff, classes, fleet, library, actions (⌘ K)..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[65vh] overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-muted-foreground">Searching entire campus ecosystem...</span>
          </div>
        )}

        {!searching && debouncedQuery && !hasResults && filteredNavItems.length === 0 && filteredQuickActions.length === 0 && (
          <CommandEmpty>No matching features, modules, or campus records found for "{debouncedQuery}"</CommandEmpty>
        )}

        {/* Quick Actions (when query matches action keywords) */}
        {filteredQuickActions.length > 0 && (
          <CommandGroup heading="Quick Actions">
            {filteredQuickActions.map((qa) => (
              <CommandItem
                key={qa.label}
                value={`action-${qa.label}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(qa.href);
                }}
                className="cursor-pointer"
              >
                <qa.icon className="mr-2.5 h-4 w-4 text-blue-600" />
                <span className="font-medium text-slate-900 dark:text-slate-100">{qa.label}</span>
                <CommandShortcut>Action</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results - Students */}
        {groupedResults.students.length > 0 && (
          <CommandGroup heading={`Students (${groupedResults.students.length})`}>
            {groupedResults.students.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}-${r.title}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-blue-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                  {r.status && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {r.status}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Parents */}
        {groupedResults.parents.length > 0 && (
          <CommandGroup heading={`Parents & Guardians (${groupedResults.parents.length})`}>
            {groupedResults.parents.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}-${r.title}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-purple-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    Parent / Guardian
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Staff */}
        {groupedResults.staff.length > 0 && (
          <CommandGroup heading={`Staff & Faculty (${groupedResults.staff.length})`}>
            {groupedResults.staff.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}-${r.title}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-indigo-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Leads */}
        {groupedResults.leads.length > 0 && (
          <CommandGroup heading={`Admissions & Leads (${groupedResults.leads.length})`}>
            {groupedResults.leads.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-emerald-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                  {r.status && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {r.status}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Classes */}
        {groupedResults.classes.length > 0 && (
          <CommandGroup heading={`Academic Classes (${groupedResults.classes.length})`}>
            {groupedResults.classes.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-violet-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Transport / Fleet */}
        {groupedResults.transport.length > 0 && (
          <CommandGroup heading={`Transport & Fleet (${groupedResults.transport.length})`}>
            {groupedResults.transport.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-amber-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Library */}
        {groupedResults.library.length > 0 && (
          <CommandGroup heading={`Library Books (${groupedResults.library.length})`}>
            {groupedResults.library.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-sky-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {/* Search Results - Inventory */}
        {groupedResults.inventory.length > 0 && (
          <CommandGroup heading={`Asset & Inventory Items (${groupedResults.inventory.length})`}>
            {groupedResults.inventory.map((r) => {
              const Icon = getEntityIcon(r.entity);
              return (
                <CommandItem
                  key={`${r.entity}-${r.id}`}
                  value={`${r.entity}-${r.title}-${r.subtitle}`}
                  onSelect={() => navigateToResult(r)}
                  className="cursor-pointer"
                >
                  <Icon className="mr-2.5 h-4 w-4 text-teal-600" />
                  <div className="flex flex-1 flex-col">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground">{r.subtitle}</span>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {(hasResults || debouncedQuery) && filteredNavItems.length > 0 && <CommandSeparator />}

        {/* Navigation Items (All Modules & Features) */}
        {filteredNavItems.length > 0 && (
          <CommandGroup heading="Modules & Feature Navigation">
            {filteredNavItems.map((it) => (
              <CommandItem
                key={it.label}
                value={`nav-${it.label}-${it.keywords}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(it.href);
                }}
                className="cursor-pointer"
              >
                <it.icon className="mr-2.5 h-4 w-4 text-slate-500 group-hover:text-blue-600" />
                <span className="text-slate-800 dark:text-slate-200 font-medium">{it.label}</span>
                <CommandShortcut>Go</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!debouncedQuery && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Campus Intelligence Tips">
              <CommandItem disabled className="text-muted-foreground text-xs">
                <span>• Search by student name, roll number, or admission ID</span>
              </CommandItem>
              <CommandItem disabled className="text-muted-foreground text-xs">
                <span>• Search by teacher name, email, or department</span>
              </CommandItem>
              <CommandItem disabled className="text-muted-foreground text-xs">
                <span>• Search any feature e.g. "bus", "library", "hostel", "exams", "fees", "crm"</span>
              </CommandItem>
              <CommandItem disabled className="text-muted-foreground text-xs">
                <span>• Press <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border">K</kbd> to open search anywhere</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

