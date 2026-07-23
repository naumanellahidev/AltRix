/**
 * AutoCatalogRoutes
 * ------------------------------------------------------------------
 * Renders a <Route> for every NAV_CATALOG entry whose `path` is bound
 * in MODULE_REGISTRY AND is visible to one of the supplied roles
 * (with inheritance expansion).
 *
 * Mount inside a parent <Routes> block. Explicit <Route> elements
 * declared BEFORE this component still take precedence — so dashboards
 * can keep custom overrides while letting every new catalog entry
 * auto-register without code changes.
 */
import { Fragment, createElement } from "react";
import { Route } from "react-router-dom";
import { NAV_CATALOG } from "@/lib/role-navigation";
import { resolvePermissions } from "@/lib/permissions";
import { MODULE_REGISTRY, type ModuleCtx } from "@/lib/module-registry";
import { ModuleErrorBoundary } from "@/components/tenant/ModuleErrorBoundary";
import type { EduverseRole } from "@/lib/eduverse-roles";

interface Props {
  /** Roles to include — inheritance is applied automatically. */
  roles: EduverseRole[];
  /** Context forwarded to each module's prop factory. */
  ctx: Omit<ModuleCtx, "roles">;
  /**
   * Optional list of `path` segments to skip — useful when a dashboard
   * provides its own custom <Route> for that path.
   */
  exclude?: string[];
}

export function createCatalogRouteElements({ roles, ctx, exclude }: Props) {
  const { roles: expanded, allowedPaths } = resolvePermissions(roles);
  const skip = new Set(exclude ?? []);
  const seen = new Set<string>();

  return NAV_CATALOG.flatMap((item) => {
    if (!item.path) return [];                         // dashboard root
    if (skip.has(item.path) || seen.has(item.path)) return [];
    if (!allowedPaths.has(item.path)) return [];       // role not permitted
    const entry = MODULE_REGISTRY[item.path];
    if (!entry) return [];                             // no UI bound yet
    seen.add(item.path);

    const fullCtx: ModuleCtx = { ...ctx, roles: expanded };
    const RawComp = entry.Component as any;
    const Component = RawComp?.default || RawComp;

    if (!Component || (typeof Component !== "function" && typeof Component !== "object")) {
      return [];
    }

    const node = entry.render
      ? entry.render(fullCtx)
      : createElement(Component, entry.propsFor ? entry.propsFor(fullCtx) : {});

    return [
      <Route
        key={item.path}
        path={item.path}
        element={
          <ModuleErrorBoundary name={item.label}>{node}</ModuleErrorBoundary>
        }
      />,
    ];
  });
}

export function AutoCatalogRoutes(props: Props) {
  return <Fragment>{createCatalogRouteElements(props)}</Fragment>;
}
