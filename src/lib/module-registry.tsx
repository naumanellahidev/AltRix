/**
 * Module Registry
 * ------------------------------------------------------------------
 * Single source of truth that binds a NAV_CATALOG `path` segment to
 * the React component that renders it.
 *
 * Adding a new module anywhere in the system requires only:
 *   1. an entry in NAV_CATALOG (src/lib/role-navigation.ts)
 *   2. an entry in MODULE_REGISTRY here, with the component + optional
 *      props factory.
 *
 * Sidebars (via NAV_CATALOG) and routes (via <AutoCatalogRoutes />)
 * pick it up automatically across every shell whose users have access
 * — no per-dashboard, per-shell, or per-RouteGuard edits required.
 */
import type { ComponentType, ReactElement } from "react";
import type { EduverseRole } from "@/lib/eduverse-roles";

import { AccountantHomeModule } from "@/pages/tenant/accountant-modules/AccountantHomeModule";
import { AccountantInvoicesModule } from "@/pages/tenant/accountant-modules/AccountantInvoicesModule";
import { AccountantPaymentsModule } from "@/pages/tenant/accountant-modules/AccountantPaymentsModule";
import { AccountantExpensesModule } from "@/pages/tenant/accountant-modules/AccountantExpensesModule";
import { AccountantPayrollModule } from "@/pages/tenant/accountant-modules/AccountantPayrollModule";
import { AccountantLedgerModule } from "@/pages/tenant/accountant-modules/AccountantLedgerModule";
import { AccountantVendorsModule } from "@/pages/tenant/accountant-modules/AccountantVendorsModule";
import { AccountantTaxModule } from "@/pages/tenant/accountant-modules/AccountantTaxModule";
import { AccountantReportsModule } from "@/pages/tenant/accountant-modules/AccountantReportsModule";

import FeesUnifiedModule from "@/pages/tenant/modules/FeesUnifiedModule";
import { FinanceModule } from "@/pages/tenant/modules/FinanceModule";
import { ReportsModule } from "@/pages/tenant/modules/ReportsModule";
import { MessagesModule } from "@/pages/tenant/modules/MessagesModule";
import { UsersModule } from "@/pages/tenant/modules/UsersModule";
import { CrmModule } from "@/pages/tenant/modules/CrmModule";
import { AcademicModule } from "@/pages/tenant/modules/AcademicModule";
import { AttendanceModule } from "@/pages/tenant/modules/AttendanceModule";
import { TimetableBuilderModule } from "@/pages/tenant/modules/TimetableBuilderModule";
import NoticesModule from "@/pages/tenant/modules/NoticesModule";
import HolidaysModule from "@/pages/tenant/modules/HolidaysModule";
import DiaryModule from "@/pages/tenant/modules/DiaryModule";
import ExamsModule from "@/pages/tenant/modules/ExamsModule";
import ReportCardModule from "@/pages/tenant/modules/ReportCardModule";
import PrincipalComplaintsModule from "@/pages/tenant/modules/PrincipalComplaintsModule";
import PrincipalParentNotesModule from "@/pages/tenant/modules/PrincipalParentNotesModule";
import AdmissionsModule from "@/pages/tenant/modules/AdmissionsModule";
import { SupportModule } from "@/pages/tenant/modules/SupportModule";

import { HrLeavesModule } from "@/pages/tenant/hr-modules/HrLeavesModule";
import { HrSalariesModule } from "@/pages/tenant/hr-modules/HrSalariesModule";
import { HrContractsModule } from "@/pages/tenant/hr-modules/HrContractsModule";
import { HrReviewsModule } from "@/pages/tenant/hr-modules/HrReviewsModule";
import { HrDocumentsModule } from "@/pages/tenant/hr-modules/HrDocumentsModule";

import { MarketingLeadsModule } from "@/pages/tenant/marketing-modules/MarketingLeadsModule";
import { MarketingFollowUpsModule } from "@/pages/tenant/marketing-modules/MarketingFollowUpsModule";
import { MarketingCallsModule } from "@/pages/tenant/marketing-modules/MarketingCallsModule";
import { MarketingSourcesModule } from "@/pages/tenant/marketing-modules/MarketingSourcesModule";
import { MarketingCampaignsModule } from "@/pages/tenant/marketing-modules/MarketingCampaignsModule";

import { CounselingModule } from "@/pages/tenant/modules/CounselingModule";
import { CounselorBehaviorModule } from "@/pages/tenant/modules/CounselorBehaviorModule";
import { CounselorAtRiskModule } from "@/pages/tenant/modules/CounselorAtRiskModule";
import { AICounselorMode } from "@/components/ai/AICounselorMode";

/** Context passed to each module's prop factory. */
export interface ModuleCtx {
  schoolId: string | null;
  schoolSlug: string;
  role: EduverseRole | null;
  /** Expanded roles (with inheritance) — useful for canManage-style flags. */
  roles: EduverseRole[];
}

const isGov = (roles: EduverseRole[]) =>
  roles.some((r) =>
    ["super_admin","school_owner","principal","vice_principal","school_admin"].includes(r)
  );

const isAcademicGov = (roles: EduverseRole[]) =>
  roles.some((r) =>
    ["super_admin","school_owner","principal","vice_principal","school_admin","academic_coordinator","teacher"].includes(r)
  );

export interface ModuleEntry {
  Component: ComponentType<any>;
  /** Build props from ctx. If omitted, the component renders with no props. */
  propsFor?: (ctx: ModuleCtx) => Record<string, unknown>;
  /** Render a custom element instead of <Component {...propsFor(ctx)} />. */
  render?: (ctx: ModuleCtx) => ReactElement;
}

/**
 * Path segment → module binding. Key MUST match the NAV_CATALOG `path`.
 * Dashboard-root ("") is rendered per-shell (each dashboard owns its
 * own home), so it is intentionally not in this registry.
 */
export const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  // Finance
  fees:     { Component: FeesUnifiedModule },
  finance:  { Component: FinanceModule },
  invoices: { Component: AccountantInvoicesModule },
  payments: { Component: AccountantPaymentsModule },
  expenses: { Component: AccountantExpensesModule },
  payroll:  { Component: AccountantPayrollModule },
  ledger:   { Component: AccountantLedgerModule },
  vendors:  { Component: AccountantVendorsModule },
  tax:      { Component: AccountantTaxModule },

  // Academics
  academic:      { Component: AcademicModule },
  timetable:     { Component: TimetableBuilderModule },
  attendance:    { Component: AttendanceModule },
  exams:         { Component: ExamsModule,        propsFor: (c) => ({ schoolId: c.schoolId, canManage: isAcademicGov(c.roles) }) },
  "report-cards":{ Component: ReportCardModule,   propsFor: (c) => ({ schoolId: c.schoolId, canManage: isAcademicGov(c.roles) }) },
  diary:         { Component: DiaryModule,        propsFor: (c) => ({ schoolId: c.schoolId, canManage: isAcademicGov(c.roles) }) },

  // People / HR / Marketing
  users:          { Component: UsersModule },
  leaves:         { Component: HrLeavesModule },
  salaries:       { Component: HrSalariesModule },
  contracts:      { Component: HrContractsModule },
  reviews:        { Component: HrReviewsModule },
  documents:      { Component: HrDocumentsModule },
  admissions:     { Component: AdmissionsModule },
  crm:            { Component: CrmModule },
  leads:          { Component: MarketingLeadsModule },
  "follow-ups":   { Component: MarketingFollowUpsModule },
  calls:          { Component: MarketingCallsModule },
  sources:        { Component: MarketingSourcesModule },
  campaigns:      { Component: MarketingCampaignsModule },
  "parent-notes": { Component: PrincipalParentNotesModule },

  // Operations
  notices:    { Component: NoticesModule,  propsFor: (c) => ({ schoolId: c.schoolId, canManage: true }) },
  holidays:   { Component: HolidaysModule, propsFor: (c) => ({ schoolId: c.schoolId, canManage: isGov(c.roles) }) },
  reports:    { Component: ReportsModule },
  complaints: { Component: PrincipalComplaintsModule },
  counseling: { Component: CounselingModule, propsFor: (c) => ({ schoolId: c.schoolId }) },
  behavior:   { Component: CounselorBehaviorModule, propsFor: (c) => ({ schoolId: c.schoolId }) },
  "at-risk":  { Component: CounselorAtRiskModule, propsFor: (c) => ({ schoolId: c.schoolId }) },
  "ai-counselor": { Component: AICounselorMode, propsFor: (c) => ({ schoolId: c.schoolId ?? "" }) },

  // Communication
  messages: { Component: MessagesModule, propsFor: (c) => ({ schoolId: c.schoolId }) },
  support:  { Component: SupportModule,  propsFor: (c) => ({ schoolId: c.schoolId }) },
};

/**
 * Accountant-shell home module (registered separately so the
 * Accountant dashboard can render it on the index route).
 */
export { AccountantHomeModule, AccountantReportsModule };
