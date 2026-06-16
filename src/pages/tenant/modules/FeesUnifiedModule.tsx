import { useMemo } from "react";
import { useSearchParams, Navigate, useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Sparkles, Receipt, Coins } from "lucide-react";
import { AccountantFeesModule } from "@/pages/tenant/accountant-modules/AccountantFeesModule";
import FeesAdvancedModule from "@/pages/tenant/modules/FeesAdvancedModule";
import FeeVouchersModule from "@/pages/tenant/modules/FeeVouchersModule";

const VALID_TABS = ["plans", "advanced", "vouchers"] as const;
type FeesTab = (typeof VALID_TABS)[number];

/**
 * Unified Fees Center — merges Fee Plans, Fees (Advanced) and Fee Vouchers
 * into a single tabbed workspace so users have one clear entry point for all
 * fee-related operations.
 *
 * Deep links supported via ?tab=plans|advanced|vouchers
 */
export default function FeesUnifiedModule() {
  const [params, setParams] = useSearchParams();
  const { schoolSlug } = useParams();

  const tab: FeesTab = useMemo(() => {
    const t = params.get("tab");
    return (VALID_TABS as readonly string[]).includes(t ?? "")
      ? (t as FeesTab)
      : "plans";
  }, [params]);

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === "plans") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  if (params.get("tab") === "invoices") {
    return <Navigate to={`/${schoolSlug}/accountant/invoices`} replace />;
  }

  return (
    <div className="space-y-6">
      {/* Premium Luxury Command Header */}
      <div className="relative overflow-hidden bg-white border border-slate-100 p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.015)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Accent top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
        
        <div className="relative z-10 flex items-start gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl text-white shadow-md shadow-blue-500/20">
            <Coins className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-xl font-black tracking-tight text-slate-800 sm:text-2xl flex items-center gap-2">
              Fees Command Center
            </h2>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">
              Consolidated billing structures, allocations, and proof reconciliations
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full space-y-6">
        <div className="-mx-1 overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex w-max min-w-full md:min-w-0 bg-muted/50 border p-1 rounded-2xl">
            <TabsTrigger 
              value="plans" 
              className="gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
            >
              <DollarSign className="h-4 w-4 shrink-0" />
              <span>Billing Structures</span>
            </TabsTrigger>
            <TabsTrigger 
              value="advanced" 
              className="gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>Advanced Operations</span>
            </TabsTrigger>
            <TabsTrigger 
              value="vouchers" 
              className="gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary"
            >
              <Receipt className="h-4 w-4 shrink-0" />
              <span>Vouchers & Proofs</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="plans" className="mt-0 focus-visible:outline-none transition-all duration-300">
          <AccountantFeesModule />
        </TabsContent>
        <TabsContent value="advanced" className="mt-0 focus-visible:outline-none transition-all duration-300">
          <FeesAdvancedModule />
        </TabsContent>
        <TabsContent value="vouchers" className="mt-0 focus-visible:outline-none transition-all duration-300">
          <FeeVouchersModule />
        </TabsContent>
      </Tabs>
    </div>
  );
}
