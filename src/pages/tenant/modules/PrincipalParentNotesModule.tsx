import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { ParentBehaviorNotesView } from "@/components/behavior/ParentBehaviorNotesView";

export default function PrincipalParentNotesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;
  return <ParentBehaviorNotesView schoolId={schoolId} title="Parent Behavior Notes (All Classes)" />;
}
