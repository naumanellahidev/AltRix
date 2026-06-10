import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, KeyRound, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { type EduverseRole } from "@/lib/eduverse-roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRecentEmails,
  getResetCooldownRemaining,
  rememberRecentEmail,
  rememberResetEmail,
  requestPasswordResetLink,
  startResetCooldown,
} from "@/lib/password-reset";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

// Highest priority first. The first matching role wins for default redirect.
const ROLE_PRIORITY: EduverseRole[] = [
  "super_admin",
  "school_owner",
  "principal",
  "vice_principal",
  "school_admin",
  "academic_coordinator",
  "hr_manager",
  "accountant",
  "marketing_staff",
  "counselor",
  "teacher",
  "parent",
  "student",
];

const roleToPathSegment = (role: EduverseRole) => {
  if (role === "hr_manager") return "hr";
  if (role === "marketing_staff") return "marketing";
  return role;
};

const resolveDestinationRole = (roles: EduverseRole[]): EduverseRole | null => {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return roles[0] ?? null;
};

const TenantAuth = () => {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const perms = useSchoolPermissions(tenant.status === "ready" ? tenant.schoolId : null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());

  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = useMemo(() => {
    if (tenant.status === "ready") return tenant.school.name;
    return "AltRix";
  }, [tenant.status, tenant.school]);

  useEffect(() => {
    const tick = () => setResetCooldown(email.trim() ? getResetCooldownRemaining(email) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  const routeUserAfterLogin = async (userId: string) => {
    if (tenant.status !== "ready") return;
    const schoolId = tenant.schoolId;

    // Master Super Admin: only the single hard-coded email may enter
    // the platform territory, regardless of platform_super_admins rows.
    const { data: authUser } = await supabase.auth.getUser();
    const signedInEmail = authUser.user?.email?.toLowerCase() ?? null;
    if (signedInEmail === MASTER_SUPER_ADMIN_EMAIL) {
      const { data: psa } = await supabase
        .from("platform_super_admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (psa?.user_id) {
        navigate("/super_admin");
        return;
      }
    }

    // Verify school membership
    const { data: membership } = await supabase
      .from("school_memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      setMessage("Your account is not a member of this school.");
      await supabase.auth.signOut();
      return;
    }

    // Fetch ALL roles for this user in this school
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("school_id", schoolId)
      .eq("user_id", userId);

    const roles = (rolesData || []).map((r) => r.role as EduverseRole);
    const destRole = resolveDestinationRole(roles);

    if (!destRole) {
      setMessage("No role assigned to your account for this school. Contact an administrator.");
      await supabase.auth.signOut();
      return;
    }

    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) return setMessage("Please enter a valid email.");
    if (!parsedPassword.success) return setMessage("Password must be at least 8 characters.");

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      if (data.user) await routeUserAfterLogin(data.user.id);
    } finally {
      setBusy(false);
    }
  };

  const doForgotPassword = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) return setMessage("Enter your email above, then try again.");
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setResetCooldown(cooldown);
      return setMessage(`Please wait ${cooldown}s before requesting another reset link.`);
    }
    setBusy(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const result = await requestPasswordResetLink(parsedEmail.data, returnTo);
      if (!result.ok) return setMessage(result.error || "Unable to send reset link. Please try again shortly.");
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsedEmail.data);
      startResetCooldown(parsedEmail.data, seconds);
      setResetCooldown(seconds);
      const remaining = typeof result.remainingRequests === "number" ? ` You have ${result.remainingRequests} reset request${result.remainingRequests === 1 ? "" : "s"} left today.` : "";
      setMessage(`We sent a password reset link to ${parsedEmail.data}. Check your inbox and spam folder.${remaining}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-10 flex items-center">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex items-center gap-3 justify-center">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface shadow-elevated">
            <Building2 />
          </div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
            <p className="text-sm text-muted-foreground">Secure access • /{tenant.slug}</p>
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Sign in</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your credentials. We'll take you to the right workspace automatically.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void doPasswordLogin();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="login-email">Email</label>
                  <Input
                    id="login-email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@school.com"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    list="saved-emails"
                  />
                  {recentEmails.length > 0 && (
                    <datalist id="saved-emails">
                      {recentEmails.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="login-password">Password</label>
                  <Input
                    id="login-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    type="password"
                    autoComplete="current-password"
                  />
                </div>

                <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy}>
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : "Sign in"}
                </Button>
              </form>

              <div className="pt-2 border-t border-border/60">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-foreground">Forgot password?</p>
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Enter your account email above and we'll send a secure reset link.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="w-full"
                  onClick={() => { if (!busy && resetCooldown <= 0) void doForgotPassword(); }}
                  disabled={busy || resetCooldown > 0}
                >
                  {resetCooldown > 0 ? `Send reset link again in ${resetCooldown}s` : "Send password reset link"}
                </Button>
              </div>

              {message && <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{message}</div>}

              {tenant.status === "error" && (
                <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{tenant.error}</div>
              )}

              {perms.isPlatformSuperAdmin && tenant.status === "ready" && (
                <div className="rounded-xl border border-border bg-card/40 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Platform Super Admin</p>
                      <p className="text-xs text-muted-foreground">Quick access to bootstrap tools for this tenant.</p>
                    </div>
                    <Button
                      type="button"
                      variant="soft"
                      onClick={() => navigate(`/${tenant.slug}/bootstrap`)}
                    >
                      Open Bootstrap
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Accounts are created by administrators. No public signup.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default TenantAuth;
