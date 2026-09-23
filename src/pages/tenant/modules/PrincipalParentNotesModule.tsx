/**
 * Behaviour notes as the parents see them, across every class.
 *
 * The tab opened straight into the list with no heading, so nothing told a
 * principal that these are the notes families can read — which is the whole
 * reason to review them.
 */
import { useParams } from "react-router-dom";
import { NotebookPen } from "lucide-react";

import { ModuleHeader } from "@/components/tenant/module-kit";
import { useTenant } from "@/hooks/useTenant";
import { ParentBehaviorNotesView } from "@/components/behavior/ParentBehaviorNotesView";

export default function PrincipalParentNotesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  return (
    <div className="space-y-5">
      <ModuleHeader
        icon={NotebookPen}
        tone="violet"
        title="Parent notes"
        description="Every behaviour note that has been shared with a family, across all classes — what the parents can see, in one place."
      />
      <ParentBehaviorNotesView schoolId={schoolId} title="Shared with parents — all classes" />
    </div>
  );
}
