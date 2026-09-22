/**
 * The Fees Centre.
 *
 * It used to be three legacy modules behind three labels nobody could act on —
 * "Billing Structures", "Advanced Operations", "Vouchers & Proofs" — while the
 * same component also answered the "Fee Configurations" and "Finance" tabs, and
 * payments, expenses, gateways and discounts each appeared in two or three
 * places. This shell gives every job one home, in the order the office does
 * them:
 *
 *   Collection Board → Fee Structure → Student Ledger → Billing Run →
 *   Collections → Defaulters & Reminders
 *
 * Nothing was removed. Each old screen still exists; it now sits under the tab
 * that owns that job, and the places that merely duplicated it link here.
 */
import { lazy, Suspense, useMemo } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  BadgeDollarSign,
  BellRing,
  Coins,
  LayoutDashboard,
  Receipt,
  UserCog,
  Wallet,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { CollectionBoard } from "./CollectionBoard";
import { DefaultersBoard } from "./DefaultersBoard";
import { DuplicateInvoicesCard } from "./DuplicateInvoicesCard";
import { StudentLedger } from "./StudentLedger";

const AccountantFeesModule = lazy(() =>
  import("@/pages/tenant/accountant-modules/AccountantFeesModule").then((m) => ({
    default: m.AccountantFeesModule,
  })),
);
const FeesAdvancedModule = lazy(() => import("@/pages/tenant/modules/FeesAdvancedModule"));
const FeeVouchersModule = lazy(() => import("@/pages/tenant/modules/FeeVouchersModule"));

export const TABS = [
  {
    value: "board",
    label: "Collection Board",
    hint: "What was billed, what came in, what is still owed",
    icon: LayoutDashboard,
  },
  {
    value: "structure",
    label: "Fee Structure",
    hint: "Fee heads and the class-wise plans built from them",
    icon: Coins,
  },
  {
    value: "ledger",
    label: "Student Ledger",
    hint: "Who is on which plan, with their concessions",
    icon: UserCog,
  },
  {
    value: "billing",
    label: "Billing Run",
    hint: "Generate and issue vouchers for a class or a child",
    icon: Receipt,
  },
  {
    value: "collections",
    label: "Collections",
    hint: "Record payments and verify the proofs parents upload",
    icon: Wallet,
  },
  {
    value: "defaulters",
    label: "Defaulters & Reminders",
    hint: "Who is behind, how far, and what has been sent",
    icon: BellRing,
  },
] as const;

export type FeesTab = (typeof TABS)[number]["value"];

/** Where the three old deep links land now, so no saved link breaks. */
export const LEGACY_TABS: Record<string, FeesTab> = {
  plans: "structure",
  advanced: "ledger",
  vouchers: "billing",
  proofs: "collections",
  payments: "collections",
};

function SectionFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function FeesCentreModule() {
  const [params, setParams] = useSearchParams();
  const { schoolSlug } = useParams();
  const location = useLocation();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  // The same Centre is reached as principal, owner or accountant; sibling links
  // must stay inside whichever shell the user is actually in.
  const basePath = useMemo(() => {
    const [, slug, role] = location.pathname.split("/");
    return role ? `/${slug}/${role}` : `/${schoolSlug}`;
  }, [location.pathname, schoolSlug]);

  const tab: FeesTab = useMemo(() => {
    const raw = params.get("tab") ?? "";
    if (TABS.some((t) => t.value === raw)) return raw as FeesTab;
    return LEGACY_TABS[raw] ?? "board";
  }, [params]);

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "board") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  // Invoices have their own screen; this tab used to swallow that link.
  if (params.get("tab") === "invoices") {
    return <Navigate to={`/${schoolSlug}/accountant/invoices`} replace />;
  }

  const active = TABS.find((t) => t.value === tab)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border bg-card p-5 sm:p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-3 text-white shadow-md shadow-blue-500/20">
            <BadgeDollarSign className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-black tracking-tight sm:text-2xl">Fees Centre</h2>
            <p className="mt-1 text-sm text-muted-foreground">{active.hint}</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full space-y-5">
        <div className="-mx-1 overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-max min-w-full rounded-2xl border bg-muted/50 p-1 md:min-w-0">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm sm:text-sm"
              >
                <t.icon className="h-4 w-4 shrink-0" />
                <span>{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="board" className="mt-0 focus-visible:outline-none">
          <CollectionBoard
            onOpenDefaulters={() => setTab("defaulters")}
            onOpenBilling={() => setTab("billing")}
          />
        </TabsContent>

        <TabsContent value="structure" className="mt-0 focus-visible:outline-none">
          <Suspense fallback={<SectionFallback />}>
            <AccountantFeesModule />
          </Suspense>
        </TabsContent>

        <TabsContent value="ledger" className="mt-0 space-y-5 focus-visible:outline-none">
          <StudentLedger schoolId={schoolId} />
          <Suspense fallback={<SectionFallback />}>
            <FeesAdvancedModule section="assignments" />
          </Suspense>
        </TabsContent>

        <TabsContent value="billing" className="mt-0 space-y-5 focus-visible:outline-none">
          <DuplicateInvoicesCard />
          <Suspense fallback={<SectionFallback />}>
            <FeeVouchersModule section="billing" />
          </Suspense>
        </TabsContent>

        <TabsContent value="collections" className="mt-0 space-y-5 focus-visible:outline-none">
          <Suspense fallback={<SectionFallback />}>
            <FeesAdvancedModule section="payments" />
            <FeeVouchersModule section="proofs" />
          </Suspense>
        </TabsContent>

        <TabsContent value="defaulters" className="mt-0 focus-visible:outline-none">
          <DefaultersBoard />
        </TabsContent>
      </Tabs>

      {/* Where the jobs that are not fees live. Linked, not duplicated. */}
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Elsewhere:</span>
          <Link className="hover:text-primary hover:underline" to={`${basePath}/invoices`}>
            Invoices
          </Link>
          <Link className="hover:text-primary hover:underline" to={`${basePath}/payments`}>
            All payments
          </Link>
          <Link className="hover:text-primary hover:underline" to={`${basePath}/expenses`}>
            Expenses
          </Link>
          <Link className="hover:text-primary hover:underline" to={`${basePath}/admin-fees`}>
            Fee configurations &amp; gateways
          </Link>
          <Link className="hover:text-primary hover:underline" to={`${basePath}/finance`}>
            Finance &amp; cashflow
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
