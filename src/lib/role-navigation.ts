import {
  BarChart3, BookOpen, CalendarDays, Coins, CreditCard, DollarSign, GraduationCap, Headphones,
  KanbanSquare, LayoutGrid, Megaphone, MessageSquare, NotebookPen,
  ShieldAlert, ShieldCheck, Shield, Users, FileText, PartyPopper, UserPlus,
  Briefcase, Wallet, Receipt, FileSignature, ClipboardList, Heart, PhoneCall, Target,
  AlertTriangle, Sparkles, Smile, Brain, FolderOpen, Grid3X3, HeartPulse,
} from "lucide-react";
import type { EduverseRole } from "@/lib/eduverse-roles";

export type NavGroup =
  | "overview" | "academics" | "people" | "finance"
  | "operations" | "communication" | "admin";

export interface NavItem {
  key: string;            // dedupe key
  label: string;
  icon: any;
  group: NavGroup;
  // path segment after `/{slug}/{role}/` — empty string for dashboard root
  path: string;
  roles: EduverseRole[];  // any of these roles unlocks the item
}

/**
 * Catalog of every module the existing dashboards already expose.
 * Routing reuses the existing `/{slug}/{role}/...` URLs so all current
 * modules, permissions, and tenant logic continue to work unchanged.
 */
export const NAV_CATALOG: NavItem[] = [
  { key: "home", label: "Dashboard", icon: LayoutGrid, group: "overview", path: "",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","accountant","hr_manager","counselor","marketing_staff","parent","student"] },

  // Academics
  { key: "academic", label: "Academic", icon: GraduationCap, group: "academics", path: "academic",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher"] },
  { key: "timetable", label: "Timetable", icon: CalendarDays, group: "academics", path: "timetable",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent","counselor"] },
  { key: "attendance", label: "Attendance", icon: ClipboardList, group: "academics", path: "attendance",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent","counselor"] },
  { key: "exams", label: "Exams", icon: FileSignature, group: "academics", path: "exams",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent"] },
  { key: "seating-plan", label: "Seating Planner", icon: Grid3X3, group: "academics", path: "seating-plan",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher"] },
  { key: "report-cards", label: "Report Cards", icon: FileText, group: "academics", path: "report-cards",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent"] },
  { key: "curriculum", label: "Curriculum Standards", icon: BookOpen, group: "academics", path: "curriculum",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher"] },
  { key: "events", label: "Events Calendar", icon: CalendarDays, group: "academics", path: "events",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent"] },
  { key: "diary", label: "Diary", icon: BookOpen, group: "academics", path: "diary",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent"] },

  // People
  { key: "users", label: "Staff", icon: Users, group: "people", path: "users",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "staff-attendance", label: "Staff Attendance", icon: ClipboardList, group: "people", path: "staff-attendance",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "leaves", label: "Leaves", icon: FileSignature, group: "people", path: "leaves",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "salaries", label: "Salaries", icon: Wallet, group: "people", path: "salaries",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "contracts", label: "Contracts", icon: FileSignature, group: "people", path: "contracts",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "reviews", label: "Performance Reviews", icon: ShieldCheck, group: "people", path: "reviews",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "documents", label: "Documents", icon: Briefcase, group: "people", path: "documents",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "recruitment", label: "Recruitment", icon: UserPlus, group: "people", path: "recruitment",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "onboarding", label: "Onboarding", icon: ClipboardList, group: "people", path: "onboarding",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "offboarding", label: "Offboarding", icon: FileSignature, group: "people", path: "offboarding",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "hr-analytics", label: "HR Analytics", icon: BarChart3, group: "people", path: "hr-analytics",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","hr_manager"] },
  { key: "admissions", label: "Admissions", icon: UserPlus, group: "people", path: "admissions",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","marketing_staff"] },
  { key: "crm", label: "CRM", icon: KanbanSquare, group: "people", path: "crm",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "leads", label: "Leads", icon: Users, group: "people", path: "leads",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "follow-ups", label: "Follow-ups", icon: ClipboardList, group: "people", path: "follow-ups",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "calls", label: "Call Logs", icon: PhoneCall, group: "people", path: "calls",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "sources", label: "Lead Sources", icon: Target, group: "people", path: "sources",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "campaigns", label: "Campaigns", icon: Megaphone, group: "people", path: "campaigns",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","marketing_staff"] },
  { key: "parent-notes", label: "Parent Notes", icon: NotebookPen, group: "people", path: "parent-notes",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","counselor"] },
  { key: "student-cards", label: "Student ID Cards", icon: CreditCard, group: "people", path: "student-cards",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","teacher"] },
  { key: "inquiries", label: "Inquiries Center", icon: UserPlus, group: "people", path: "inquiries",
    roles: ["super_admin","school_owner","principal","vice_principal"] },

  // Finance
  { key: "finance-dashboard", label: "Finance & Cashflow", icon: BarChart3, group: "finance", path: "finance",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "fees", label: "Fees Center", icon: DollarSign, group: "finance", path: "fees",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","accountant"] },
  { key: "admin-fees", label: "Fee Configurations", icon: Settings, group: "finance", path: "admin-fees",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "invoices", label: "Invoices", icon: FileText, group: "finance", path: "invoices",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "payments", label: "Payments", icon: CreditCard, group: "finance", path: "payments",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "expenses", label: "Expenses", icon: Receipt, group: "finance", path: "expenses",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "payroll", label: "Payroll", icon: Wallet, group: "finance", path: "payroll",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "ledger", label: "Cash Ledger", icon: BookOpen, group: "finance", path: "ledger",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "vendors", label: "Vendors", icon: Briefcase, group: "finance", path: "vendors",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "tax", label: "Tax Center", icon: Receipt, group: "finance", path: "tax",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },
  { key: "budget-simulator", label: "Budget Simulator", icon: Coins, group: "finance", path: "budget-simulator",
    roles: ["super_admin","school_owner","principal","vice_principal","accountant"] },

  // Operations
  { key: "complaints", label: "Complaints", icon: ShieldAlert, group: "operations", path: "complaints",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin"] },
  { key: "owner-insights", label: "AI Board Insights", icon: Brain, group: "operations", path: "owner-insights",
    roles: ["super_admin","school_owner","principal","vice_principal"] },
  { key: "doc-management", label: "DMS Vault", icon: FolderOpen, group: "operations", path: "doc-management",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","hr_manager"] },
  { key: "staff-appraisals", label: "Staff Appraisals", icon: ShieldCheck, group: "operations", path: "staff-appraisals",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student"] },
  { key: "student-wellbeing", label: "Student Wellbeing", icon: HeartPulse, group: "operations", path: "student-wellbeing",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent"] },
  { key: "gate-visitor", label: "Gate Console", icon: Shield, group: "operations", path: "gate-visitor",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin"] },
  { key: "at-risk", label: "At-Risk Students", icon: AlertTriangle, group: "operations", path: "at-risk",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","counselor"] },
  { key: "counseling", label: "Counseling Center", icon: Heart, group: "operations", path: "counseling",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","counselor"] },
  { key: "behavior", label: "Behavior Notes", icon: NotebookPen, group: "operations", path: "behavior",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","counselor"] },
  { key: "attendance-heatmap", label: "Attendance Heatmap", icon: BarChart3, group: "operations", path: "attendance-heatmap",
    roles: ["super_admin","school_owner","principal","vice_principal"] },
  { key: "reports", label: "Reports", icon: BarChart3, group: "operations", path: "reports",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","hr_manager","accountant","marketing_staff","counselor"] },
  { key: "notices", label: "Notices", icon: Megaphone, group: "operations", path: "notices",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent","hr_manager","marketing_staff","accountant","counselor"] },
  { key: "holidays", label: "Holidays", icon: PartyPopper, group: "operations", path: "holidays",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","student","parent","hr_manager","counselor"] },
  { key: "ai-counselor", label: "AI Counselor", icon: Sparkles, group: "operations", path: "ai-counselor",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","counselor"] },

  // Communication
  { key: "messages", label: "Messages", icon: MessageSquare, group: "communication", path: "messages",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","accountant","hr_manager","counselor","marketing_staff","parent","student"] },
  { key: "collaboration", label: "Collaboration Hub", icon: MessageSquare, group: "communication", path: "collaboration",
    roles: ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher","accountant","hr_manager","counselor","marketing_staff","parent"] },
  { key: "support", label: "Support", icon: Headphones, group: "communication", path: "support",
    roles: ["super_admin","school_owner","principal","vice_principal","hr_manager","counselor"] },

  // Admin
  { key: "admin", label: "Admin Console", icon: ShieldCheck, group: "admin", path: "admin",
    roles: ["super_admin"] },
  { key: "schools", label: "Schools", icon: Briefcase, group: "admin", path: "schools",
    roles: ["super_admin"] },
];

export const GROUP_LABELS: Record<NavGroup, string> = {
  overview: "Overview",
  academics: "Academics",
  people: "People",
  finance: "Finance",
  operations: "Operations",
  communication: "Communication",
  admin: "Administration",
};

export const GROUP_ORDER: NavGroup[] = [
  "overview", "academics", "people", "finance", "operations", "communication", "admin",
];

const ROLE_PRIORITY: EduverseRole[] = [
  "super_admin","school_owner","principal","vice_principal","school_admin",
  "academic_coordinator","hr_manager","accountant","marketing_staff",
  "counselor","teacher","parent","student",
];

export function pickPrimaryRole(roles: EduverseRole[]): EduverseRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return roles[0] ?? null;
}

/**
 * Sidebar inheritance mirror of permissions.ts. super_admin, school_owner,
 * principal, and vice_principal see all staff modules in the sidebar.
 * Actual write/edit access is still enforced server-side by RLS + RPCs.
 */
const NAV_INHERITANCE: Partial<Record<EduverseRole, EduverseRole[]>> = {
  super_admin: [
    "school_owner","principal","vice_principal","school_admin","hr_manager",
    "accountant","academic_coordinator","teacher","marketing_staff",
    "counselor","student","parent",
  ],
  school_owner: [
    "principal","vice_principal","school_admin","hr_manager","accountant",
    "academic_coordinator","teacher","marketing_staff","counselor","student","parent",
  ],
  principal: [
    "vice_principal","school_admin","hr_manager","accountant",
    "academic_coordinator","counselor","marketing_staff",
  ],
  vice_principal: [
    "school_admin","hr_manager","accountant","academic_coordinator",
    "counselor","marketing_staff",
  ],
};

function expandNavRoles(roles: EduverseRole[]): EduverseRole[] {
  const out = new Set<EduverseRole>(roles);
  for (const r of roles) for (const i of NAV_INHERITANCE[r] ?? []) out.add(i);
  return Array.from(out);
}

/**
 * Merge nav items across all of the user's roles, applying role
 * inheritance so owners/principals automatically see staff modules.
 */
export function buildMergedNav(inputRoles: EduverseRole[]) {
  const roles = expandNavRoles(inputRoles);
  const set = new Set<string>();
  const items: NavItem[] = [];
  for (const item of NAV_CATALOG) {
    if (item.roles.some((r) => roles.includes(r)) && !set.has(item.key)) {
      set.add(item.key);
      items.push(item);
    }
  }
  const grouped: Record<NavGroup, NavItem[]> = {
    overview: [], academics: [], people: [], finance: [],
    operations: [], communication: [], admin: [],
  };
  for (const it of items) grouped[it.group].push(it);
  return { items, grouped };
}

export const DROPDOWN_MAPPING: Record<string, { groupKey: string; label: string; icon: any }> = {
  academic: { groupKey: "academic_setup", label: "Academic Setup", icon: GraduationCap },
  exams: { groupKey: "academic_setup", label: "Academic Setup", icon: GraduationCap },
  "report-cards": { groupKey: "academic_setup", label: "Academic Setup", icon: GraduationCap },

  salaries: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  "staff-attendance": { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  contracts: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  reviews: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  documents: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  recruitment: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  onboarding: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  offboarding: { groupKey: "hr_talent", label: "HR & Talent", icon: Users },
  "hr-analytics": { groupKey: "hr_talent", label: "HR & Talent", icon: Users },

  admissions: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  crm: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  leads: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  "follow-ups": { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  calls: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  sources: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },
  campaigns: { groupKey: "admissions_crm", label: "Admissions & CRM", icon: KanbanSquare },

  invoices: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  payments: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  expenses: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  payroll: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  ledger: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  vendors: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },
  tax: { groupKey: "financial_ops", label: "Financial Ops", icon: Coins },

  notices: { groupKey: "school_ops", label: "School Ops", icon: ClipboardList },
  holidays: { groupKey: "school_ops", label: "School Ops", icon: ClipboardList },
  reports: { groupKey: "school_ops", label: "School Ops", icon: ClipboardList },
  "ai-counselor": { groupKey: "school_ops", label: "School Ops", icon: ClipboardList },

  admin: { groupKey: "system_admin", label: "System Admin", icon: ShieldCheck },
  schools: { groupKey: "system_admin", label: "System Admin", icon: ShieldCheck },
  support: { groupKey: "system_admin", label: "System Admin", icon: ShieldCheck },
};

