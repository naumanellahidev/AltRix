/**
 * The school's own help desk: tickets raised by staff, parents and students.
 */
import { Headphones } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { SupportInbox } from "@/pages/tenant/modules/components/SupportInbox";

export function SupportModule({ schoolId }: { schoolId: string }) {
  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={Headphones}
        tone="teal"
        title="Support"
        description="Questions and problems raised by staff, parents and students — with who replied and when."
      />
      <SupportInbox schoolId={schoolId} />
    </div>
  );
}
