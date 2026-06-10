import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { roleLabel, type EduverseRole } from "@/lib/eduverse-roles";

interface AccessDeniedProps {
  /** The path segment the user tried to reach (e.g. "fees-pro"). */
  attemptedPath: string;
  /** The roles the resolver returned for this user. */
  roles: EduverseRole[];
  /** Where the dashboard "Go home" button should land. */
  homePath: string;
  /** Slug used for the sign-out redirect. */
  schoolSlug: string;
}

/**
 * Dedicated UI for permission-denied navigation attempts.
 * Surfaced by `RouteGuard` instead of a silent redirect so users
 * understand exactly which page was blocked and why.
 */
export function AccessDenied({ attemptedPath, roles, homePath, schoolSlug }: AccessDeniedProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(`/${schoolSlug}/auth`);
  };

  const friendlyPath = attemptedPath ? `/${attemptedPath}` : "/";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-destructive/20 bg-surface p-8 text-center shadow-elevated">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have permission to view{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{friendlyPath}</code>.
        </p>

        <div className="mt-6 rounded-2xl border border-border/60 bg-surface-2 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your current access
          </p>
          {roles.length > 0 ? (
            <p className="mt-1 text-sm text-foreground">
              {roles.map((r) => roleLabel[r] ?? r).join(" • ")}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground italic">
              No roles assigned yet. Ask an administrator to grant you access.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            This page is reserved for roles with the matching module permission.
            If you believe this is a mistake, contact your school administrator.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="hero" onClick={() => navigate(homePath)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
