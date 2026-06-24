import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { KeyRound, CheckCircle2, AlertCircle, Mail, RefreshCw, Timer, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  RESET_LINK_TTL_SECONDS,
  formatDuration,
  getRememberedResetEmail,
  getResetCooldownRemaining,
  rememberResetEmail,
  requestPasswordResetLink,
  startResetCooldown,
} from "@/lib/password-reset";

const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
const emailSchema = z.string().email("Please enter a valid email");

const getResetUrlParams = () => {
  const hash = window.location.hash || "";
  const qs = window.location.search || "";
  return new URLSearchParams((hash.startsWith("#") ? hash.slice(1) : hash) + "&" + qs.replace(/^\?/, ""));
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = useMemo(() => {
    const r = searchParams.get("returnTo");
    if (r && r.startsWith("/")) return r;
    return "/";
  }, [searchParams]);

  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkSecondsLeft, setLinkSecondsLeft] = useState<number | null>(null);

  const [resendEmail, setResendEmail] = useState(() => getRememberedResetEmail());
  const [resending, setResending] = useState(false);
  const [resendSentTo, setResendSentTo] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    const params = getResetUrlParams();
    const errCode = params.get("error_code") || params.get("error");
    const errDesc = params.get("error_description");
    if (errCode) {
      const isExpired = /expired|otp_expired|access_denied/i.test(errCode) || /expired/i.test(errDesc || "");
      setExpired(
        isExpired
          ? "Your password reset link has expired. For your security, links are only valid for a short time."
          : errDesc?.replace(/\+/g, " ") || "This reset link is invalid. Please request a new one.",
      );
      return;
    }

    const computeExpirySeconds = async (sessionExpiresAt?: number | null) => {
      const p = getResetUrlParams();
      const expiresAt = Number(p.get("expires_at") || sessionExpiresAt || 0);
      if (expiresAt > 0) return Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
      const expiresIn = Number(p.get("expires_in") || 0);
      if (expiresIn > 0) return expiresIn;
      return RESET_LINK_TTL_SECONDS;
    };

    const activate = async (sessionExpiresAt?: number | null) => {
      const seconds = await computeExpirySeconds(sessionExpiresAt);
      if (seconds <= 0) {
        setExpired("This password reset link has expired. Please request a new one.");
        return;
      }
      setLinkSecondsLeft(seconds);
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        void activate(session?.expires_at ?? null);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await activate(data.session.expires_at ?? null);
      else {
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (d2.session) await activate(d2.session.expires_at ?? null);
          else setExpired("This password reset link is invalid or has expired. Please request a new one.");
        }, 900);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready || done || linkSecondsLeft === null) return undefined;
    if (linkSecondsLeft <= 0) {
      setReady(false);
      setExpired("This password reset link has expired. Please request a new one.");
      return undefined;
    }
    const timer = window.setInterval(() => {
      setLinkSecondsLeft((current) => {
        if (current === null) return current;
        if (current <= 1) {
          window.clearInterval(timer);
          setReady(false);
          setExpired("This password reset link has expired. Please request a new one.");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ready, done, linkSecondsLeft]);

  useEffect(() => {
    const tick = () => setResendCooldown(resendEmail.trim() ? getResetCooldownRemaining(resendEmail) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [resendEmail]);

  const submit = async () => {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      setDone(true);
      toast.success("Password updated. You can now sign in.");
      await supabase.auth.signOut();
      setTimeout(() => navigate(returnTo, { replace: true }), 1600);
    } finally {
      setBusy(false);
    }
  };

  const resendLink = async () => {
    const parsed = emailSchema.safeParse(resendEmail.trim());
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    const cooldown = getResetCooldownRemaining(parsed.data);
    if (cooldown > 0) {
      setResendCooldown(cooldown);
      toast.error(`Please wait ${cooldown}s before requesting another reset link.`);
      return;
    }
    setResending(true);
    try {
      const result = await requestPasswordResetLink(parsed.data, returnTo);
      if (!result.ok) {
        toast.error(result.error || "Unable to send reset link. Please try again shortly.");
        return;
      }
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsed.data);
      startResetCooldown(parsed.data, seconds);
      setResendCooldown(seconds);
      setResendSentTo(parsed.data);
      toast.success(`New reset link sent to ${parsed.data}`);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-grid grid place-items-center px-6 py-10">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader>
          <CardTitle className="font-display text-xl flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> {expired ? "Reset link expired" : "Set a new password"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {expired
              ? "Request a fresh link below — it only takes a moment."
              : "Choose a strong password you haven't used before."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {expired ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Link no longer valid</p>
                  <p className="text-destructive/80">{expired}</p>
                </div>
              </div>

              {resendSentTo ? (
                <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-sm flex gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium">Email sent</p>
                    <p className="text-muted-foreground">
                      A new reset link is on its way to <span className="font-medium">{resendSentTo}</span>. Check your inbox and spam folder.
                    </p>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); if (!resending && resendCooldown <= 0) void resendLink(); }}
                  className="space-y-3"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Your email
                    </label>
                    <Input
                      type="email"
                      autoComplete="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="name@school.com"
                    />
                  </div>
                  <Button type="submit" variant="hero" size="xl" className="w-full" disabled={resending || resendCooldown > 0}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                    {resending ? "Sending…" : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : "Resend reset link"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    You can request up to 3 reset links in 24 hours.
                  </p>
                </form>
              )}

              {resendSentTo && (
                <Button
                  variant="soft"
                  className="w-full"
                  onClick={() => { setResendSentTo(null); }}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Send again in ${resendCooldown}s` : "Send another reset link"}
                </Button>
              )}
            </div>
          ) : done ? (
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 text-sm flex gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium">Password updated</p>
                <p className="text-muted-foreground">Redirecting you back to sign in…</p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (!busy && ready) void submit(); }}
              className="space-y-3"
            >
              {linkSecondsLeft !== null && (
                <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm flex items-center gap-2">
                  <Timer className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    This reset link expires in <span className="font-medium">{formatDuration(linkSecondsLeft)}</span>.
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">New password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={!ready}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm password</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={!ready}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="hero" size="xl" className="w-full" disabled={busy || !ready}>
                {busy ? "Updating…" : ready ? "Update password" : "Verifying link…"}
              </Button>
            </form>
          )}

          <Button variant="ghost" className="w-full" onClick={() => navigate(returnTo)}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
