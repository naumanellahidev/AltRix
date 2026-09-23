/**
 * Students the records suggest are struggling.
 *
 * The tab opened straight into the warning list with nothing saying what the
 * warnings are drawn from, which is the first thing anyone asks of it.
 */
import { LifeBuoy } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { EarlyWarningSystem } from "@/components/ai/EarlyWarningSystem";

interface Props {
  schoolId: string | null;
}

export function CounselorAtRiskModule({ schoolId }: Props) {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={LifeBuoy}
        tone="rose"
        title="Students who may need support"
        description="Drawn from attendance, marks and behaviour records already in the system — a prompt to look, not a judgement."
      />
      <EarlyWarningSystem schoolId={schoolId ?? ""} />
    </div>
  );
}
