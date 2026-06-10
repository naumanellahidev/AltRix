import { PropsWithChildren, useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { usePermissions } from "@/lib/permissions";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { AccessDenied } from "@/components/tenant/AccessDenied";
import { isEduverseRole } from "@/lib/eduverse-roles";

interface RouteGuardProps extends PropsWithChildren {
  /**
   * Path segments (relative to `/{slug}/{role}/`) that the wrapping
   * dashboard exposes beyond the centralized NAV_CATALOG. The guard
   * treats these as always-allowed for the current role, so role-home
   * sub-pages (e.g. teacher "gradebook", parent "ai-insights") don't
   * trip the catalog-based check.
   */
  extraAllowedPaths?: string[];
}

/**
 * Route-level access guard.
 *
 * Validates that the first path segment after `/{schoolSlug}/{role}/`
 * is either in the user's centralized permission bundle or in the
 * dashboard-supplied `extraAllowedPaths` list. If neither, renders the
 * dedicated `AccessDenied` UI (no silent redirect) so users see why.
 */
export function RouteGuard({ children, extraAllowedPaths }: RouteGuardProps) {
  const { schoolSlug, role } = useParams();
  const location = useLocation();
  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;

  // Support route aliases that are nicer than DB enum values.
  const resolvedRole = useMemo(() => {
    if (!role) return null;
    if (role === "hr") return "hr_manager";
    if (role === "marketing") return "marketing_staff";
    return role;
  }, [role]);

  const fallbackRoles = useMemo(() => (isEduverseRole(resolvedRole) ? [resolvedRole] : []), [resolvedRole]);
  const perms = usePermissions(schoolId, fallbackRoles);

  const base = `/${schoolSlug}/${role}`;
  const remainder = location.pathname.startsWith(base)
    ? location.pathname.slice(base.length).replace(/^\/+/, "")
    : "";
  const segment = remainder.split("/")[0] ?? "";

  const extraSet = useMemo(() => new Set(extraAllowedPaths ?? []), [extraAllowedPaths]);

  const allowed =
    perms.loading || segment === "" || extraSet.has(segment) || perms.canAccess(segment);

  if (perms.loading) {
    return <>{children}</>;
  }

  if (!allowed) {
    return (
      <AccessDenied
        attemptedPath={segment}
        roles={perms.roles}
        homePath={base}
        schoolSlug={schoolSlug ?? ""}
      />
    );
  }

  return <>{children}</>;
}
