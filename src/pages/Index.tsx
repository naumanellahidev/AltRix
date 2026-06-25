import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Brain, ShieldCheck, Eye, EyeOff, MessageSquare, ArrowRight, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Info, Building2, Mail, Lock, Key } from "lucide-react";
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

  const [showPassword, setShowPassword] = useState(false);

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
      // Verify OTP against our custom table → get a hashed_token back
      const { data, error } = await supabase.functions.invoke<{
        ok: boolean;
        action?: "token" | "confirmed";
        token?: string;
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

      if (data.action === "token" && data.token) {
        showSuccess("Code verified! Taking you to reset your password...");

        // Exchange the hashed_token for a PASSWORD_RECOVERY session (no redirect URL needed)
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: data.token,
          type: "recovery",
        });

        if (verifyErr) {
          const msg = verifyErr.message || "Session creation failed. Please try again.";
          setOtpError(msg);
          showError(msg);
          return;
        }

        // ResetPassword page will detect the PASSWORD_RECOVERY event via onAuthStateChange
        setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1000);
        return;
      }

      // Fallback
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
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-indigo-50/40 to-sky-100/30 relative overflow-x-hidden font-sans">
      {/* Decorative background glass orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-sky-300/10 blur-[130px] pointer-events-none z-0" />

      {/* ── HEADER ── */}
      <header className="w-full py-8 px-6 flex flex-col items-center relative z-10">
        <div className="flex items-center gap-3.5">
          <img
            src="/pwa-512.png"
            alt="AltRix"
            className="w-11 h-11 rounded-xl shadow-md shadow-blue-500/20 border border-white/40"
          />
          <span className="font-sans text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-800 to-indigo-600 bg-clip-text text-transparent">
            AltRix
          </span>
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase opacity-85">
          School Operating System
        </p>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pb-16 lg:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start z-10 relative">

        {/* ── HEADING BLOCK ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -18 }}
          animate={reduce ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-7 flex flex-col gap-4 min-w-0"
        >
          <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight bg-gradient-to-r from-blue-800 to-indigo-600 bg-clip-text text-transparent">
            Empowering education through intelligent operations
          </h2>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            AltRix provides the infrastructure for modern schools to manage performance, security, and communication in one unified platform.
          </p>
        </motion.div>

        {/* ── SIGN-IN CARD BLOCK ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-5 lg:row-span-2 w-full max-w-md mx-auto"
        >
          <div className="bg-white/80 border border-white/80 shadow-elevated rounded-3xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:shadow-2xl">
            {/* Corner decoration gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-bl-full pointer-events-none" />

            {/* Card header */}
            {authMode === 'login' && (
              <div className="mb-6 relative z-10">
                <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-900 bg-gradient-to-r from-blue-800 to-indigo-600 bg-clip-text text-transparent">
                  Welcome Back
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Enter your school code and credentials.
                </p>
              </div>
            )}

            {/* ── LOGIN MODE ── */}
            {authMode === 'login' && (
              <form
                onSubmit={(e) => { e.preventDefault(); if (!busy) void doLogin(); }}
                className="flex flex-col gap-5 relative z-10"
              >
                {/* School code */}
                <div>
                  <label className="block text-xs font-bold tracking-wider text-blue-700 uppercase mb-2 ml-1">
                    School Code
                  </label>
                  <div className="relative rounded-xl border border-slate-200 bg-white/50 transition-all duration-200 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary focus-within:bg-white">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 flex items-center">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <input
                      className="w-full pl-11 pr-24 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400/70 outline-none"
                      value={schoolSlug}
                      onChange={(e) => setSchoolSlug(e.target.value)}
                      placeholder="e.g. beacon"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    {/* status badge */}
                    {safeSlug && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-700 shrink-0 select-none">
                        {tenant.status === "loading" ? (
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        ) : tenant.status === "ready" ? (
                          <span className="text-emerald-700">✓ Verified</span>
                        ) : tenant.status === "error" ? (
                          <span className="text-red-700">✗ Not found</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {tenantBadge && tenant.status === "ready" && (
                    <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1.5 ml-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Verified: {tenantBadge.label}
                    </p>
                  )}
                  {tenant.status === "error" && safeSlug && (
                    <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1.5 ml-1">
                      <AlertCircle className="h-3.5 w-3.5" /> School not found
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="login-email" className="block text-xs font-bold tracking-wider text-blue-700 uppercase mb-2 ml-1">
                    Work Email
                  </label>
                  <div className="relative rounded-xl border border-slate-200 bg-white/50 transition-all duration-200 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary focus-within:bg-white">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 flex items-center">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      id="login-email"
                      name="email"
                      ref={emailInputRef}
                      className="w-full pl-11 pr-4 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400/70 outline-none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@school.edu"
                      type="email"
                      autoComplete="username"
                      inputMode="email"
                      list="saved-emails"
                    />
                  </div>
                  {recentEmails.length > 0 && (
                    <datalist id="saved-emails">
                      {recentEmails.map((e) => <option key={e} value={e} />)}
                    </datalist>
                  )}
                </div>

                {/* Password */}
                <div>
                  <div className="flex justify-between items-center mb-2 ml-1">
                    <label htmlFor="login-password" className="text-xs font-bold tracking-wider text-blue-700 uppercase">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      onClick={() => { setMessage(null); setAuthMode('forgot_password'); }}
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative rounded-xl border border-slate-200 bg-white/50 transition-all duration-200 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary focus-within:bg-white">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 flex items-center">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      id="login-password"
                      className="w-full pl-11 pr-11 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400/70 outline-none"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors p-1 rounded-lg focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Notice */}
                <div className="flex items-start gap-2.5 p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 backdrop-blur-sm">
                  <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] sm:text-xs text-slate-600 leading-normal">
                    Admin-created accounts only · No public signup
                  </p>
                </div>

                {/* CTA */}
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-500 hover:from-blue-800 hover:to-sky-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={busy || tenant.status !== "ready"}
                >
                  {busy ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                  ) : tenant.status === "loading" && safeSlug ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Verifying school…</>
                  ) : tenant.status === "error" ? (
                    "Invalid school code"
                  ) : !safeSlug ? (
                    "Enter school code"
                  ) : (
                    <><span>Sign In to AltRix</span><ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            )}

            {/* ── FORGOT PASSWORD MODE ── */}
            {authMode === 'forgot_password' && (
              <form
                onSubmit={(e) => { e.preventDefault(); if (!busy) void handleSendForgotPasswordOtp(); }}
                className="flex flex-col gap-5 relative z-10"
              >
                <div className="text-center">
                  <div className="inline-flex p-3 rounded-xl bg-blue-50 border border-blue-100 mb-3.5">
                    <Key className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-sans text-xl font-bold text-slate-900">
                    Reset Password
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                    We'll send a 6-digit code to reset your password.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold tracking-wider text-blue-700 uppercase mb-2 ml-1">
                    Work Email
                  </label>
                  <div className="relative rounded-xl border border-slate-200 bg-white/50 transition-all duration-200 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary focus-within:bg-white">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary/60 flex items-center">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      className="w-full pl-11 pr-4 py-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400/70 outline-none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@school.edu"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-500 hover:from-blue-800 hover:to-sky-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  ) : (
                    <><span>Send Verification Code</span><ArrowRight className="h-4 w-4" /></>
                  )}
                </button>

                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5"
                  onClick={() => { setMessage(null); setAuthMode('login'); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </button>
              </form>
            )}

            {/* ── OTP VERIFY MODE ── */}
            {(authMode === 'forgot_password_otp' || authMode === 'verify_email') && (
              <div className="flex flex-col gap-6 relative z-10">
                <div className="text-center">
                  <h3 className="font-sans text-xl font-bold text-slate-900">
                    {authMode === 'verify_email' ? "Verify your email" : "Enter Verification Code"}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                    {authMode === 'verify_email' 
                      ? `6-digit code sent to ${email} to activate your account.` 
                      : `6-digit reset code sent to ${email}.`}
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
                        if (authMode === 'verify_email') void handleVerifySignUpOtp(val);
                        else void handleVerifyForgotPasswordOtp(val);
                      }
                    }}
                    disabled={isVerificationPending}
                  >
                    <InputOTPGroup className="gap-2 justify-center w-full">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="w-12 h-12 text-lg rounded-xl border-2 border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 bg-white"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </motion.div>

                {otpError && (
                  <p className="text-xs text-red-600 text-center font-semibold">
                    {otpError}
                  </p>
                )}

                <div className="flex flex-col gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-xs py-2.5 rounded-xl transition-all duration-200"
                    onClick={() => {
                      if (authMode === 'verify_email') void handleResendVerifyEmailOtp(email);
                      else void handleSendForgotPasswordOtp();
                    }}
                    disabled={otpCooldown > 0 || isResendingOtp}
                  >
                    {isResendingOtp ? (
                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Sending…</>
                    ) : otpCooldown > 0 ? (
                      `Resend code in ${otpCooldown}s`
                    ) : (
                      "Resend code"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-xs py-2.5 rounded-xl transition-all duration-200"
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

            {/* Feedback message banner */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-3.5 rounded-xl text-xs sm:text-sm border relative z-10 leading-relaxed ${
                  message.tone === "success" 
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" 
                    : message.tone === "error" 
                    ? "bg-red-50/50 border-red-200 text-red-800"
                    : "bg-blue-50/50 border-blue-200 text-blue-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.tone === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                  {message.tone === "error" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  {message.tone === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />}
                  <span className="flex-1">{message.text}</span>
                </div>
              </motion.div>
            )}

            <p className="mt-5 text-center text-xs text-slate-500 relative z-10">
              Demo school: <span className="font-semibold text-slate-800">beacon</span> · Accounts are created by administrators.
            </p>
          </div>
        </motion.div>

        {/* ── BENTO GRID BLOCK ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -18 }}
          animate={reduce ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-7 flex flex-col gap-6 min-w-0"
        >
          {/* Bento Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Brain, iconColor: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", label: "AI Insights", desc: "Predictive student performance analytics and trend spotting." },
              { icon: ShieldCheck, iconColor: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100", label: "Secure Vault", desc: "Military-grade data encryption and privacy compliance." },
              { icon: Eye, iconColor: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200", label: "Real-time Audit", desc: "Live transparent audit logs for staff and administrators." },
              { icon: MessageSquare, iconColor: "text-sky-600", bg: "bg-sky-50", border: "border-sky-100", label: "Universal Hub", desc: "Unified school-parent communication and collaboration." },
            ].map(({ icon: Icon, iconColor, bg, border, label, desc }) => (
              <div 
                key={label} 
                className="p-5 rounded-2xl bg-white/40 border border-white/60 shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-white/60 hover:border-blue-100/60 hover:shadow-soft"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${bg} ${border}`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <p className="text-xs font-bold tracking-wider text-blue-700 uppercase mb-1">{label}</p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-slate-600">
            Need a school account?{" "}
            <a
              href="mailto:sales@altrix.io"
              className="text-blue-600 font-semibold hover:underline"
            >
              Contact Sales
            </a>
          </p>
        </motion.div>

      </main>

      {/* ── FOOTER ── */}
      <footer className="w-full bg-white/40 border-t border-white/50 py-4 px-6 relative z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity duration-200">
            <img src="/pwa-512.png" alt="AltRix" className="w-6 h-6 rounded-md" />
            <span className="font-sans text-sm font-bold text-slate-900">AltRix</span>
          </div>
          <div className="flex gap-6 justify-center flex-wrap">
            {["Privacy Policy", "Terms of Service", "Compliance"].map((link) => (
              <a 
                key={link} 
                href="#" 
                className="text-[11px] sm:text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500">
            © {new Date().getFullYear()} AltRix School OS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
