import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, ShieldCheck, Eye, MessageSquare, ArrowRight, Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SpotlightBackdrop } from "@/components/visual/SpotlightBackdrop";
import { AltrixLogo } from "@/components/AltrixLogo";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { type EduverseRole } from "@/lib/eduverse-roles";
import {
  getRecentEmails,
  getResetCooldownRemaining,
  rememberRecentEmail,
  rememberResetEmail,
  requestPasswordResetLink,
  startResetCooldown,
} from "@/lib/password-reset";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  startOtpCooldown,
  getOtpCooldownRemaining,
} from "@/lib/otp-auth";
import { toast } from "sonner";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

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

const Index = () => {
  const params = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [schoolSlug, setSchoolSlug] = useState(params.schoolSlug || "beacon");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());
  const emailInputRef = useRef<HTMLInputElement>(null);

  // OTP-specific states
  const [authMode, setAuthMode] = useState<'login' | 'forgot_password' | 'verify_email' | 'forgot_password_otp'>('login');
  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);

  const focusEmail = () => {
    requestAnimationFrame(() => emailInputRef.current?.focus());
  };
  const showError = (text: string) => setMessage({ text, tone: "error" });
  const showSuccess = (text: string) => setMessage({ text, tone: "success" });
  const showInfo = (text: string) => setMessage({ text, tone: "info" });

  const safeSlug = useMemo(
    () => schoolSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""),
    [schoolSlug],
  );

  const tenant = useTenant(safeSlug || undefined);

  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => setResetCooldown(email.trim() ? getResetCooldownRemaining(email) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  useEffect(() => {
    if (!email.trim()) return;
    const tick = () => setOtpCooldown(getOtpCooldownRemaining(email));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email, authMode]);

  const features = [
    { icon: Brain, title: "AI Features", desc: "Smart insights for performance and decision-making." },
    { icon: ShieldCheck, title: "Privacy & Security", desc: "Secure, role-based, protected data system." },
    { icon: Eye, title: "Transparency", desc: "Clear visibility with real-time data." },
    { icon: MessageSquare, title: "Communication", desc: "Unified messaging across all roles." },
  ];

  const routeUserAfterLogin = async (userId: string) => {
    if (tenant.status !== "ready") {
      showError("School not found. Please check the school code.");
      await supabase.auth.signOut();
      return;
    }
    const schoolId = tenant.schoolId;

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

    const { data: membership } = await supabase
      .from("school_memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      showError("Your account is not a member of this school.");
      await supabase.auth.signOut();
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("school_id", schoolId)
      .eq("user_id", userId);

    const roles = (rolesData || []).map((r) => r.role as EduverseRole);
    const destRole = resolveDestinationRole(roles);

    if (!destRole) {
      showError("No role assigned to your account for this school. Contact an administrator.");
      await supabase.auth.signOut();
      return;
    }

    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const handleResendVerifyEmailOtp = async (targetEmail: string) => {
    setIsResendingOtp(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
      });
      if (error) {
        showError("Failed to send verification code: " + error.message);
        return;
      }
      showSuccess("A verification code was sent to " + targetEmail);
      startOtpCooldown(targetEmail);
      setOtpCooldown(60);
    } finally {
      setIsResendingOtp(false);
    }
  };

  const handleVerifySignUpOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: 'signup',
      });
      if (error) {
        setOtpError(error.message);
        showError("Invalid verification code. Please try again.");
        setOtpCode("");
        return;
      }
      showSuccess("Email verified successfully!");
      if (data.user) {
        await routeUserAfterLogin(data.user.id);
      }
    } catch (err: any) {
      setOtpError(err.message || "Verification failed");
      showError(err.message || "Verification failed");
    } finally {
      setIsVerificationPending(false);
    }
  };

  const doLogin = async () => {
    setMessage(null);
    if (!safeSlug) return showError("Please enter your school code.");
    if (tenant.status === "loading") return showInfo("Verifying school code…");
    if (tenant.status === "error") return showError(tenant.error || "School not found.");
    if (tenant.status !== "ready") return showError("School not found.");

    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) {
      focusEmail();
      return showError("Please enter a valid email.");
    }
    if (!parsedPassword.success) return showError("Password must be at least 8 characters.");

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });
      if (error) {
        const isUnconfirmed = error.message.toLowerCase().includes("email not confirmed") ||
                              (error as any).code === "email_not_confirmed" ||
                              error.message.toLowerCase().includes("confirm your email");
        if (isUnconfirmed) {
          setAuthMode('verify_email');
          void handleResendVerifyEmailOtp(parsedEmail.data);
          return;
        }
        showError(error.message);
        return;
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      if (data.user) await routeUserAfterLogin(data.user.id);
    } finally {
      setBusy(false);
    }
  };

  const handleSendForgotPasswordOtp = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) {
      focusEmail();
      return showError("Please enter a valid email to receive the code.");
    }

    if (parsedEmail.data.toLowerCase() === MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
      return showError("Platform Super Admin cannot use OTP reset. Please sign in via password or use the platform recovery page.");
    }

    const cooldown = getOtpCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setOtpCooldown(cooldown);
      return showInfo(`Please wait ${cooldown}s before requesting another verification code.`);
    }

    setBusy(true);
    try {
      // Use our custom send-otp edge function (Resend REST API — no SMTP/domain required)
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; code?: string; cooldownSeconds?: number }>("send-otp", {
        body: { email: parsedEmail.data, purpose: "password_reset" },
      });
      if (error || !data?.ok) {
        const msg = data?.error || error?.message || "Failed to send code. Please try again.";
        const isNotFound = msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not allowed");
        if (isNotFound) {
          return showError("No active account was found for this email. Please check the spelling or contact your school administrator.");
        }
        return showError(msg);
      }
      startOtpCooldown(parsedEmail.data);
      setOtpCooldown(data.cooldownSeconds ?? 60);
      setOtpCode("");
      setOtpError(null);
      setAuthMode('forgot_password_otp');
      showSuccess(`We sent a 6-digit verification code to ${parsedEmail.data}. Check your inbox.`);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyForgotPasswordOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) {
      setIsVerificationPending(false);
      return showError("Email is invalid.");
    }
    try {
      // Use our custom verify-otp edge function — returns a Supabase recovery redirect URL
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        action?: "redirect" | "session";
        url?: string;
        error?: string;
        code?: string;
      }>("verify-otp", {
        body: { email: parsedEmail.data, code, purpose: "password_reset" },
      });

      if (error || !data?.ok) {
        const msg = data?.error || error?.message || "Invalid or expired verification code.";
        setOtpError(msg);
        showError(msg);
        setOtpCode("");
        return;
      }

      if (data.action === "redirect" && data.url) {
        showSuccess("Verification successful! Redirecting you to set a new password...");
        setTimeout(() => {
          // Navigate via the Supabase recovery link which sets the session automatically
          window.location.href = data.url!;
        }, 1200);
        return;
      }

      // Fallback in case action is missing
      showSuccess("Verified! Redirecting...");
      setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1200);
    } catch (err: any) {
      const msg = err.message || "Verification failed";
      setOtpError(msg);
      showError(msg);
    } finally {
      setIsVerificationPending(false);
    }
  };

  const tenantBadge =
    tenant.status === "ready"
      ? { label: tenant.school.name, tone: "ok" as const }
      : tenant.status === "error"
        ? { label: "School not found", tone: "err" as const }
        : safeSlug
          ? { label: "Checking…", tone: "neutral" as const }
          : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-hero-grid">
      <SpotlightBackdrop />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <AltrixLogo size="md" />
          <span className="text-xs text-muted-foreground hidden md:inline">School Operating System</span>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 shadow-elevated">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Admin-created users only</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-16 pt-4">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Title — always first */}
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
            className="order-1 space-y-5 text-center lg:col-start-1 lg:row-start-1 lg:text-left lg:pt-6"
          >
            <AltrixLogo size="lg" className="text-5xl md:text-6xl" />
            <h1 className={cn("font-display text-balance text-3xl font-semibold tracking-tight md:text-4xl")}>
              The AI-Powered Operating System for Modern Schools
            </h1>
            <p className="mx-auto max-w-2xl text-balance text-base text-muted-foreground md:text-lg lg:mx-0">
              One unified platform for academics, finance, HR, communication, and AI-driven insights — built for 12 distinct roles.
            </p>
          </motion.section>

          {/* Login — mobile: 2nd (right after title). Desktop: right column spanning both rows */}
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start lg:pt-6"
          >
            <div className="mx-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-elevated">
              <div className="mb-5 text-center">
                <h2 className="font-display text-2xl font-semibold tracking-tight">Sign in to your school</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your school code and credentials.
                </p>
              </div>

              {authMode === 'login' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) void doLogin();
                  }}
                >
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="school-code">School Code</label>
                    <div className="relative">
                      <Input
                        id="school-code"
                        value={schoolSlug}
                        onChange={(e) => setSchoolSlug(e.target.value)}
                        placeholder="e.g. beacon"
                        aria-label="School code"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className={cn(
                          "pr-9",
                          tenant.status === "ready" && "border-primary/60 focus-visible:ring-primary/30",
                          tenant.status === "error" && "border-destructive/60 focus-visible:ring-destructive/30",
                        )}
                      />
                      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                        {!safeSlug ? null : tenant.status === "loading" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : tenant.status === "ready" ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : tenant.status === "error" ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : null}
                      </div>
                    </div>
                    {tenantBadge && (
                      <p
                        className={cn(
                          "text-xs flex items-center gap-1",
                          tenantBadge.tone === "ok" && "text-primary",
                          tenantBadge.tone === "err" && "text-destructive",
                          tenantBadge.tone === "neutral" && "text-muted-foreground",
                        )}
                      >
                        {tenantBadge.tone === "ok" && <CheckCircle2 className="h-3 w-3" />}
                        {tenantBadge.tone === "err" && <AlertCircle className="h-3 w-3" />}
                        {tenantBadge.tone === "neutral" && <Loader2 className="h-3 w-3 animate-spin" />}
                        <span>
                          {tenantBadge.tone === "ok" ? `Verified: ${tenantBadge.label}` : tenantBadge.label}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="login-email">Email</label>
                    <Input
                      id="login-email"
                      name="email"
                      ref={emailInputRef}
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

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium" htmlFor="login-password">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setMessage(null);
                          setAuthMode('forgot_password');
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="login-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      type="password"
                      autoComplete="current-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="xl"
                    className="w-full"
                    disabled={busy || tenant.status !== "ready"}
                  >
                    {busy ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                    ) : tenant.status === "loading" && safeSlug ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying school…</>
                    ) : tenant.status === "error" ? (
                      "Invalid school code"
                    ) : !safeSlug ? (
                      "Enter school code to continue"
                    ) : (
                      <>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>
                </form>
              )}

              {authMode === 'forgot_password' && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) void handleSendForgotPasswordOtp();
                  }}
                >
                  <div className="text-center mb-2">
                    <p className="text-xs text-muted-foreground">
                      We'll send a 6-digit verification code to reset your password.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="reset-email">Email</label>
                    <Input
                      id="reset-email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@school.com"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="xl"
                    className="w-full"
                    disabled={busy}
                  >
                    {busy ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Code…</>
                    ) : (
                      <>Send Verification Code <ArrowRight className="ml-2 h-4 w-4" /></>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="default"
                    className="w-full text-xs"
                    onClick={() => {
                      setMessage(null);
                      setAuthMode('login');
                    }}
                  >
                    Back to Sign in
                  </Button>
                </form>
              )}

              {(authMode === 'forgot_password_otp' || authMode === 'verify_email') && (
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h3 className="font-display font-semibold text-lg text-foreground">
                      {authMode === 'verify_email' ? "Verify your email" : "Enter Verification Code"}
                    </h3>
                    <p className="text-xs text-muted-foreground text-balance">
                      {authMode === 'verify_email'
                        ? `Please enter the 6-digit confirmation code sent to ${email} to activate your account.`
                        : `We sent a 6-digit password reset code to ${email}.`}
                    </p>
                  </div>

                  <motion.div
                    animate={otpError ? { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } } : {}}
                    className="flex justify-center py-2"
                  >
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(val) => {
                        setOtpCode(val);
                        if (val.length === 6) {
                          if (authMode === 'verify_email') {
                            void handleVerifySignUpOtp(val);
                          } else {
                            void handleVerifyForgotPasswordOtp(val);
                          }
                        }
                      }}
                      disabled={isVerificationPending}
                    >
                      <InputOTPGroup className="gap-2 justify-center w-full">
                        <InputOTPSlot index={0} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                        <InputOTPSlot index={1} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                        <InputOTPSlot index={2} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                        <InputOTPSlot index={3} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                        <InputOTPSlot index={4} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                        <InputOTPSlot index={5} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                      </InputOTPGroup>
                    </InputOTP>
                  </motion.div>

                  {otpError && (
                    <p className="text-xs text-destructive text-center font-medium">
                      {otpError}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => {
                        if (authMode === 'verify_email') {
                          void handleResendVerifyEmailOtp(email);
                        } else {
                          void handleSendForgotPasswordOtp();
                        }
                      }}
                      disabled={otpCooldown > 0 || isResendingOtp}
                    >
                      {isResendingOtp ? (
                        <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Sending…</>
                      ) : otpCooldown > 0 ? (
                        `Resend code in ${otpCooldown}s`
                      ) : (
                        "Resend code"
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => {
                        setMessage(null);
                        setOtpError(null);
                        setOtpCode("");
                        setAuthMode(authMode === 'verify_email' ? 'login' : 'forgot_password');
                      }}
                      disabled={isVerificationPending}
                    >
                      Change Email / Go Back
                    </Button>
                  </div>
                </div>
              )}

              {message && (
                <div
                  role={message.tone === "error" ? "alert" : "status"}
                  className={cn(
                    "mt-4 rounded-xl p-3 text-sm flex items-start gap-2 border",
                    message.tone === "success" && "bg-primary/10 border-primary/30 text-foreground",
                    message.tone === "error" && "bg-destructive/10 border-destructive/30 text-destructive",
                    message.tone === "info" && "bg-accent border-border text-accent-foreground",
                  )}
                >
                  {message.tone === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
                  {message.tone === "error" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  {message.tone === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />}
                  <span className="flex-1">{message.text}</span>
                </div>
              )}

              <p className="mt-5 text-center text-xs text-muted-foreground">
                Demo school: <span className="font-medium text-foreground">beacon</span> · Accounts are created by administrators.
              </p>
            </div>
          </motion.section>

          {/* Features — mobile: 3rd. Desktop: left column below title */}
          <motion.section
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.6 }}
            className="order-3 lg:col-start-1 lg:row-start-2"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl bg-surface p-4 shadow-elevated text-left">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 font-display text-sm font-semibold tracking-tight">{f.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default Index;
