import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { EmptyState, ErrorState, ModuleHeader } from "@/components/tenant/module-kit";
import { useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { useTenant } from "@/hooks/useTenant";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AdminConsole() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const { user } = useSession();

  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);
  // A failed read of the lock used to leave it "unlocked" and the button live.
  const [lockError, setLockError] = useState<unknown>(null);
  const [adminPassword, setAdminPassword] = useState<string>("");

  const [schoolName, setSchoolName] = useState("New School");
  const [adminEmail, setAdminEmail] = useState("");

  const schoolId = useMemo(() => (tenant.status === "ready" ? tenant.schoolId : null), [tenant.status, tenant.schoolId]);

  const readLock = async () => {
    if (!schoolId) return;
    setLockError(null);
    const { data, error } = await api
      .from("school_bootstrap")
      .select("locked,bootstrapped_at")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error) {
      setLocked(null);
      setLockError(error);
      return;
    }
    setLocked(data?.locked ?? false);
  };

  useEffect(() => {
    void readLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const run = async () => {
    setStatus(null);
    if (!tenant.slug) return;
    if (!secret.trim()) return setStatus("Secret required.");
    if (!adminEmail.trim()) return setStatus("Admin email required.");
    if (adminPassword.trim().length < 8) return setStatus("Admin password must be at least 8 characters.");

    setBusy(true);
    try {
      const { data, error } = await api.functions.invoke("eduverse-bootstrap", {
        body: {
          bootstrapSecret: secret.trim(),
          schoolSlug: tenant.slug,
          schoolName: schoolName.trim() || tenant.slug,
          adminEmail: adminEmail.trim().toLowerCase(),
          adminPassword,
          displayName: "Super Admin",
          force: false,
        },
      });
      if (error) return setStatus(error.message);
      setStatus(JSON.stringify(data, null, 2));
      // refresh lock state
      if (schoolId) {
        const { data: bs } = await api.from("school_bootstrap").select("locked").eq("school_id", schoolId).maybeSingle();
        setLocked(bs?.locked ?? true);
      }

      // audit log
      if (schoolId && user?.id) {
        await api.from("audit_logs").insert({
          school_id: schoolId,
          actor_user_id: user.id,
          action: "bootstrap_run",
          entity_type: "school",
          entity_id: tenant.slug,
          metadata: { ok: true },
        });
      }
    } catch (e) {
      // A thrown request is a failure to report, not a click that did nothing.
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={SlidersHorizontal}
        tone="slate"
        title="Admin console"
        description="One-time setup of a new school: its first administrator account. It locks itself once it has run."
      />
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl">Admin Console</CardTitle>
          <p className="text-sm text-muted-foreground">Secure operational tools for platform owners.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">Bootstrap lock</p>
                <p className="mt-1">
                  {lockError
                    ? "The lock could not be read, so setup stays disabled."
                    : locked === null
                    ? "Loading…"
                    : locked
                    ? "Locked (already bootstrapped)."
                    : "Unlocked (can run once)."}
                </p>
              </div>
            </div>
          </div>

          {lockError ? (
            <ErrorState title="The setup lock could not be read" error={lockError} onRetry={() => void readLock()} />
          ) : null}

          {locked === true ? (
            <EmptyState
              icon={ShieldCheck}
              title="This school is already set up"
              description="Setup runs once, to create a new school's first administrator, and has locked itself. Add staff and administrators from Users & Roles."
            />
          ) : (
          <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">School name</label>
              <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bootstrap secret</label>
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin email</label>
              <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin password</label>
              <Input
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                type="password"
                placeholder="Minimum 8 characters"
              />
            </div>
          </div>

          <Button
            variant="hero"
            size="xl"
            className="w-full"
            disabled={busy || locked !== false || !!lockError}
            onClick={run}
          >
            Run bootstrap (once)
          </Button>
          </>
          )}

          {status && (
            <pre className="max-h-[260px] overflow-auto rounded-2xl bg-accent p-4 text-xs text-accent-foreground">
              {status}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
