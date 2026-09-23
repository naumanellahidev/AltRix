/**
 * Offboarding: the same checklist machinery as onboarding, run the other way.
 *
 * The tab used to open straight into the list with no heading at all, which
 * made it indistinguishable from Onboarding beside it.
 */
import { UserMinus } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { HrOnboardingModule } from "./HrOnboardingModule";

export function HrOffboardingModule() {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={UserMinus}
        tone="slate"
        title="Offboarding"
        description="Everything that must happen when a member of staff leaves — handover, clearances, access and final pay — tracked to completion."
      />
      <HrOnboardingModule kind="offboarding" />
    </div>
  );
}
