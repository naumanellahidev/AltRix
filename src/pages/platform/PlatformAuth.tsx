import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function PlatformAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user, loading } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());

  // Prefill with most recent email on first mount
  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = useMemo(() => "Platform Super Admin", []);

  // Handle location state for access denied redirects
  const deniedState = location.state as { denied?: boolean; message?: string } | null;
  useEffect(() => {
    if (deniedState?.denied) {
      setMessage(deniedState.message || "Access denied. Master Super Admin only.");
      // Clear location state so the message doesn't persist forever
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [deniedState, navigate, location.pathname]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      const emailLower = user.email?.toLowerCase() ?? "";
      if (emailLower !== MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
        (async () => {
          await supabase.auth.signOut();
          setMessage("Access denied. Master Super Admin only.");
        })();
      } else {
        navigate("/super_admin", { replace: true });
      }
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const tick = () => setResetCooldown(email.trim() ? getResetCooldownRemaining(email) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) return setMessage("Please enter a valid email.");
    if (!parsedPassword.success) return setMessage("Password must be at least 8 characters.");

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });
      if (error) return setMessage(error.message);
      // Hard gate: only the master email may enter the platform territory.
      if (parsedEmail.data.toLowerCase() !== MASTER_SUPER_ADMIN_EMAIL) {
        await supabase.auth.signOut();
        return setMessage("Access denied. Master Super Admin only.");
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      navigate("/super_admin");
    } finally {
      setBusy(false);
    }
  };

  const doResetPassword = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) return setMessage("Please enter your email first.");
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setResetCooldown(cooldown);
      return setMessage(`Please wait ${cooldown}s before requesting another reset link.`);
    }

    setBusy(true);
    try {
      const result = await requestPasswordResetLink(parsedEmail.data, "/auth");
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
    <div className="min-h-screen bg-hero-grid px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface shadow-elevated">
            <ShieldCheck />
          </div>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
            <p className="text-sm text-muted-foreground">Sign in to manage all schools.</p>
          </div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-xl">Super Admin Login</CardTitle>
              <p className="text-sm text-muted-foreground">No public signup. Use your admin email.</p>
            <div className="mt-2">
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/auth/recover-master")}>
                Forgot credentials? → Recover master admin
              </Button>
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  id="login-email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com"
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


              <Tabs defaultValue="password">
                <TabsList className="w-full">
                  <TabsTrigger value="password" className="flex-1">
                    <KeyRound className="mr-2 h-4 w-4" /> Password
                  </TabsTrigger>
                  <TabsTrigger value="reset" className="flex-1">
                    <Mail className="mr-2 h-4 w-4" /> Reset
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="password" className="mt-4 space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!busy) void doPasswordLogin();
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Password</label>
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        type="password"
                      />
                    </div>
                    <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy}>
                      Sign in
                    </Button>
                  </form>

                  <div className="pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground">Forget password?</p>
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Enter your admin email above and we'll send a secure reset link.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="w-full"
                      onClick={() => { if (!busy && resetCooldown <= 0) void doResetPassword(); }}
                      disabled={busy || resetCooldown > 0}
                    >
                      {resetCooldown > 0 ? `Send reset link again in ${resetCooldown}s` : "Send password reset link"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="reset" className="mt-4 space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!busy) void doResetPassword();
                    }}
                    className="space-y-3"
                  >
                    <p className="text-sm text-muted-foreground">We'll email you a secure link to set a new password.</p>
                    <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy}>
                      {resetCooldown > 0 ? `Send again in ${resetCooldown}s` : "Send reset email"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {message && <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{message}</div>}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
