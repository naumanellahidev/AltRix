/**
 * Leads: the admissions pipeline, from the marketing side.
 *
 * It renders the same board as CRM. Without a heading the two tabs looked
 * identical, and nobody could tell which one they were on.
 */
import { UserPlus } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { CrmModule } from "@/pages/tenant/modules/CrmModule";

export function MarketingLeadsModule() {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={UserPlus}
        tone="violet"
        title="Leads"
        description="Every family who has enquired, where each one has reached, and who is following them up."
      />
      <CrmModule />
    </div>
  );
}
