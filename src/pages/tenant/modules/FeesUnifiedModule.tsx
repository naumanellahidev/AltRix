import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Sparkles, Receipt } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Fees Center
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage fee plans, advanced fee operations and student vouchers in one place.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:inline-grid sm:w-auto">
          <TabsTrigger value="plans" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Advanced</span>
          </TabsTrigger>
          <TabsTrigger value="vouchers" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Vouchers</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 focus-visible:outline-none">
          <AccountantFeesModule />
        </TabsContent>
        <TabsContent value="advanced" className="mt-4 focus-visible:outline-none">
          <FeesAdvancedModule />
        </TabsContent>
        <TabsContent value="vouchers" className="mt-4 focus-visible:outline-none">
          <FeeVouchersModule />
        </TabsContent>
      </Tabs>
    </div>
  );
}
