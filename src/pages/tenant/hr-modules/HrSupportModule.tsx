import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { SupportModule } from "@/pages/tenant/modules/SupportModule";

export function HrSupportModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = useMemo(
    () => (tenant.status === "ready" ? tenant.schoolId : null),
    [tenant.status, tenant.schoolId]
  );

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return <SupportModule schoolId={schoolId} />;
}
