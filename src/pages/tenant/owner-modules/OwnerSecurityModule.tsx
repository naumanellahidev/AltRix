import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Activity, AlertTriangle, Users, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  schoolId: string | null;
}

export function OwnerSecurityModule({ schoolId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["owner_security", schoolId],
    queryFn: async () => {
      if (!schoolId) return null;
      const [
        rolesRes,
        membersRes,
        warningsRes,
        jzRes,
        epRes,
        brandingRes,
        ownersRes,
      ] = await Promise.all([
        supabase.from("user_roles").select("user_id,role").eq("school_id", schoolId),
        supabase.from("school_memberships").select("user_id,created_at").eq("school_id", schoolId),
        supabase
          .from("ai_early_warnings")
          .select("id,severity,status,created_at,warning_type,title")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("jazzcash_settings").select("is_enabled").eq("school_id", schoolId).maybeSingle(),
        supabase.from("easypaisa_settings").select("is_enabled").eq("school_id", schoolId).maybeSingle(),
        supabase.from("school_branding").select("school_id").eq("school_id", schoolId).maybeSingle(),
        supabase.from("school_owner_assignments").select("owner_user_id").eq("school_id", schoolId),
      ]);

      return {
        roles: rolesRes.data ?? [],
        members: membersRes.data ?? [],
        warnings: warningsRes.data ?? [],
        jzEnabled: jzRes.data?.is_enabled ?? false,
        epEnabled: epRes.data?.is_enabled ?? false,
        brandingConfigured: !!brandingRes.data,
        owners: ownersRes.data ?? [],
      };
    },
    enabled: !!schoolId,
  });

  const summary = useMemo(() => {
    const roles = data?.roles ?? [];
    const warnings = data?.warnings ?? [];
    const activeWarnings = warnings.filter((w) => w.status === "active");
    const highSev = warnings.filter(
      (w) => w.severity === "high" || w.severity === "critical"
    );

    const roleCounts: Record<string, number> = {};
    roles.forEach((r) => {
      roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;
    });

    // Privileged roles
    const privilegedRoles = ["super_admin", "school_owner", "principal", "vice_principal"];
    const privilegedCount = roles.filter((r) => privilegedRoles.includes(r.role)).length;

    // 30-day new members
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newMembers = (data?.members ?? []).filter(
      (m: any) => new Date(m.created_at).getTime() >= cutoff
    ).length;

    return {
      totalMembers: data?.members?.length ?? 0,
      totalRoles: roles.length,
      roleCounts,
      privilegedCount,
      activeWarnings: activeWarnings.length,
      highSeverity: highSev.length,
      newMembers,
      warnings,
    };
  }, [data]);

  const securityChecks = [
    {
      label: "Owner assigned to school",
      ok: (data?.owners?.length ?? 0) > 0,
      detail: `${data?.owners?.length ?? 0} owner(s)`,
    },
    {
      label: "School branding configured",
      ok: data?.brandingConfigured ?? false,
      detail: data?.brandingConfigured ? "Customised" : "Default theme",
    },
    {
      label: "Payment gateway enabled",
      ok: !!(data?.jzEnabled || data?.epEnabled),
      detail: `${data?.jzEnabled ? "JazzCash" : ""}${data?.jzEnabled && data?.epEnabled ? " + " : ""}${data?.epEnabled ? "EasyPaisa" : ""}` || "None enabled",
    },
    {
      label: "Privileged accounts under control",
      ok: summary.privilegedCount > 0 && summary.privilegedCount <= 10,
      detail: `${summary.privilegedCount} privileged user(s)`,
    },
    {
      label: "No high-severity warnings",
      ok: summary.highSeverity === 0,
      detail: `${summary.highSeverity} high/critical active`,
    },
  ];

  const passed = securityChecks.filter((c) => c.ok).length;
  const score = Math.round((passed / securityChecks.length) * 100);
  const status = score >= 80 ? "Secure" : score >= 60 ? "Caution" : "At Risk";
  const statusColor = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">System & Security</h1>
        <p className="text-muted-foreground">Access posture, accounts, and active warnings</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <Shield className={`h-5 w-5 ${statusColor}`} />
            <p className={`mt-2 font-display text-2xl font-bold ${statusColor}`}>{status}</p>
            <p className="text-xs text-muted-foreground">System Status • {score}/100</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="mt-2 font-display text-2xl font-bold">{summary.activeWarnings}</p>
            <p className="text-xs text-muted-foreground">Active Warnings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Users className="h-5 w-5 text-blue-600" />
            <p className="mt-2 font-display text-2xl font-bold">{summary.totalMembers}</p>
            <p className="text-xs text-muted-foreground">School Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Lock className="h-5 w-5 text-primary" />
            <p className="mt-2 font-display text-2xl font-bold">{summary.privilegedCount}</p>
            <p className="text-xs text-muted-foreground">Privileged Accounts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Security Posture Checks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {securityChecks.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between rounded-lg border bg-card/40 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.detail}</p>
                  </div>
                </div>
                <Badge variant={c.ok ? "default" : "destructive"} className="h-5 text-[10px]">
                  {c.ok ? "OK" : "Fix"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(summary.roleCounts).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No roles assigned.</p>
            ) : (
              Object.entries(summary.roleCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{role.replace(/_/g, " ")}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))
            )}
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>New members (30 days)</span>
              <span className="font-medium text-foreground">{summary.newMembers}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent System Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          ) : summary.warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No warnings recorded. AI early-warning system has not flagged any issues.
            </p>
          ) : (
            <div className="space-y-2">
              {summary.warnings.slice(0, 10).map((w: any) => (
                <div
                  key={w.id}
                  className="flex items-start justify-between gap-3 rounded-lg border bg-card/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {w.title || w.warning_type || "Warning"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(w.created_at), "MMM d, yyyy")} • {w.status}
                    </p>
                  </div>
                  <Badge
                    variant={
                      w.severity === "critical" || w.severity === "high"
                        ? "destructive"
                        : w.severity === "medium"
                          ? "secondary"
                          : "outline"
                    }
                    className="h-5 text-[10px] shrink-0"
                  >
                    {w.severity || "info"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
