import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Brain, ShieldCheck, Eye, EyeOff, MessageSquare, ArrowRight,
  Loader2, CheckCircle2, AlertCircle, Info, Sparkles, GraduationCap,
  TrendingUp, Lock, ChevronLeft, Mail
} from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

const ROLE_PRIORITY: EduverseRole[] = [
  "super_admin", "school_owner", "principal", "vice_principal",
  "school_admin", "academic_coordinator", "hr_manager", "accountant",
  "marketing_staff", "counselor", "teacher", "parent", "student",
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

const features = [
  { icon: Brain, label: "AI-Powered Insights", color: "from-violet-500 to-purple-600" },
  { icon: ShieldCheck, label: "Enterprise Security", color: "from-emerald-500 to-teal-600" },
  { icon: TrendingUp, label: "Real-time Analytics", color: "from-blue-500 to-cyan-600" },
  { icon: MessageSquare, label: "Unified Communication", color: "from-rose-500 to-pink-600" },
];

const stats = [
  { value: "12", label: "User Roles" },
  { value: "50+", label: "Modules" },
  { value: "99.9%", label: "Uptime" },
];

/* ─── Floating Orb ─── */
function Orb({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute rounded-full blur-3xl opacity-30",
        className
      )}
    />
  );
}

/* ─── Luxury Input ─── */
interface LuxInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  suffix?: React.ReactNode;
  status?: "ok" | "err" | "loading" | null;
  hint?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
}

function LuxInput({ label, suffix, status, hint, inputRef, ...props }: LuxInputProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = !!props.value;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "relative rounded-xl border bg-white/5 transition-all duration-300",
          focused
            ? "border-blue-400/70 shadow-[0_0_0_3px_hsl(210_100%_50%/0.15)]"
            : status === "ok"
            ? "border-emerald-400/50"
            : status === "err"
            ? "border-red-400/50"
            : "border-white/10 hover:border-white/20",
        )}
      >
        <label
          className={cn(
            "pointer-events-none absolute left-3.5 font-medium transition-all duration-200 select-none",
            focused || hasValue
              ? "top-2 text-[10px] tracking-widest uppercase text-blue-300/80"
              : "top-1/2 -translate-y-1/2 text-sm text-white/40",
          )}
          htmlFor={props.id}
        >
          {label}
        </label>
        <input
          {...props}
          ref={inputRef as any}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          className={cn(
            "w-full rounded-xl bg-transparent px-3.5 pb-2.5 pt-6 text-sm text-white outline-none",
            "placeholder:text-white/20",
            suffix ? "pr-10" : "",
          )}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 flex items-center px-3">
            {suffix}
          </div>
        )}
      </div>
      {hint && <div className="px-1">{hint}</div>}
    </div>
  );
}

/* ─── Main Component ─── */
const Index = () => {
  const params = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [schoolSlug, setSchoolSlug] = useState(params.schoolSlug || "beacon");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());
  const emailInputRef = useRef<HTMLInputElement>(null);

  const [authMode, setAuthMode] = useState<'login' | 'forgot_password' | 'verify_email' | 'forgot_password_otp'>('login');
  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);

  const focusEmail = () => requestAnimationFrame(() => emailInputRef.current?.focus());
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
      const { data: psa } = await supabase.from("platform_super_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (psa?.user_id) { navigate("/super_admin"); return; }
    }
    const { data: membership } = await supabase.from("school_memberships").select("id").eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
    if (!membership) { showError("Your account is not a member of this school."); await supabase.auth.signOut(); return; }
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("school_id", schoolId).eq("user_id", userId);
    const roles = (rolesData || []).map((r) => r.role as EduverseRole);
    const destRole = resolveDestinationRole(roles);
    if (!destRole) { showError("No role assigned to your account. Contact an administrator."); await supabase.auth.signOut(); return; }
    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const handleResendVerifyEmailOtp = async (targetEmail: string) => {
    setIsResendingOtp(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: targetEmail });
      if (error) { showError("Failed to send verification code: " + error.message); return; }
      showSuccess("A verification code was sent to " + targetEmail);
      startOtpCooldown(targetEmail);
      setOtpCooldown(60);
    } finally { setIsResendingOtp(false); }
  };

  const handleVerifySignUpOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'signup' });
      if (error) { setOtpError(error.message); showError("Invalid verification code. Please try again."); setOtpCode(""); return; }
      showSuccess("Email verified successfully!");
      if (data.user) await routeUserAfterLogin(data.user.id);
    } catch (err: any) {
      setOtpError(err.message || "Verification failed");
      showError(err.message || "Verification failed");
    } finally { setIsVerificationPending(false); }
  };

  const doLogin = async () => {
    setMessage(null);
    if (!safeSlug) return showError("Please enter your school code.");
    if (tenant.status === "loading") return showInfo("Verifying school code…");
    if (tenant.status === "error") return showError(tenant.error || "School not found.");
    if (tenant.status !== "ready") return showError("School not found.");
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) { focusEmail(); return showError("Please enter a valid email."); }
    if (!parsedPassword.success) return showError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: parsedEmail.data, password });
      if (error) {
        const isUnconfirmed = error.message.toLowerCase().includes("email not confirmed") || (error as any).code === "email_not_confirmed" || error.message.toLowerCase().includes("confirm your email");
        if (isUnconfirmed) { setAuthMode('verify_email'); void handleResendVerifyEmailOtp(parsedEmail.data); return; }
        showError(error.message);
        return;
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      if (data.user) await routeUserAfterLogin(data.user.id);
    } finally { setBusy(false); }
  };

  const handleSendForgotPasswordOtp = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) { focusEmail(); return showError("Please enter a valid email to receive the code."); }
    if (parsedEmail.data.toLowerCase() === MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) return showError("Platform Super Admin cannot use OTP reset.");
    const cooldown = getOtpCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) { setOtpCooldown(cooldown); return showInfo(`Please wait ${cooldown}s before requesting another code.`); }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; cooldownSeconds?: number }>("send-otp", { body: { email: parsedEmail.data, purpose: "password_reset" } });
      if (error || !data?.ok) {
        const msg = data?.error || error?.message || "Failed to send code. Please try again.";
        const isNotFound = msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not allowed");
        if (isNotFound) return showError("No active account found for this email. Contact your school administrator.");
        return showError(msg);
      }
      startOtpCooldown(parsedEmail.data);
      setOtpCooldown(data.cooldownSeconds ?? 60);
      setOtpCode(""); setOtpError(null);
      setAuthMode('forgot_password_otp');
      showSuccess(`We sent a 6-digit code to ${parsedEmail.data}. Check your inbox.`);
    } finally { setBusy(false); }
  };

  const handleVerifyForgotPasswordOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) { setIsVerificationPending(false); return showError("Email is invalid."); }
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; action?: "token" | "confirmed"; token?: string; error?: string }>("verify-otp", { body: { email: parsedEmail.data, code, purpose: "password_reset" } });
      if (error || !data?.ok) { const msg = data?.error || error?.message || "Invalid or expired verification code."; setOtpError(msg); showError(msg); setOtpCode(""); return; }
      if (data.action === "token" && data.token) {
        showSuccess("Code verified! Taking you to reset your password...");
        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.token, type: "recovery" });
        if (verifyErr) { const msg = verifyErr.message || "Session creation failed."; setOtpError(msg); showError(msg); return; }
        setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1000);
        return;
      }
      showSuccess("Verified! Redirecting...");
      setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1200);
    } catch (err: any) {
      const msg = err.message || "Verification failed";
      setOtpError(msg); showError(msg);
    } finally { setIsVerificationPending(false); }
  };

  const slugStatus = !safeSlug ? null : tenant.status === "loading" ? "loading" : tenant.status === "ready" ? "ok" : "err" as const;
  const schoolName = tenant.status === "ready" ? tenant.school.name : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080c14] text-white">
      {/* ── Ambient orbs ── */}
      <Orb className="w-[900px] h-[900px] bg-blue-600 -top-48 -left-48 animate-[pulse_8s_ease-in-out_infinite]" />
      <Orb className="w-[600px] h-[600px] bg-violet-700 top-1/2 -right-64 animate-[pulse_10s_ease-in-out_infinite_2s]" />
      <Orb className="w-[400px] h-[400px] bg-cyan-600 bottom-0 left-1/3 animate-[pulse_12s_ease-in-out_infinite_4s]" />

      {/* ── Subtle grid overlay ── */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(hsl(210 100% 70% / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(210 100% 70% / 0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/30">
            <GraduationCap className="h-5 w-5 text-white" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
          </div>
          <span className="font-bold tracking-tight text-xl bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            AltRix
          </span>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_hsl(152_65%_50%)]" />
            <span className="text-xs text-white/60">All systems operational</span>
          </div>
        </div>
      </header>

      {/* ── Main split layout ── */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-4 lg:pt-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px] lg:gap-16 lg:items-center min-h-[calc(100vh-120px)]">

          {/* ════ LEFT: Brand panel ════ */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -24 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            className="order-2 lg:order-1 space-y-10"
          >
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-300">
              <Sparkles className="h-3 w-3" />
              AI-Powered School Management Platform
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="font-bold text-4xl md:text-5xl xl:text-6xl leading-[1.1] tracking-tight">
                <span className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-transparent">
                  The Operating System
                </span>
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                  for Modern Schools
                </span>
              </h1>
              <p className="text-white/50 text-lg leading-relaxed max-w-lg">
                One unified platform for academics, finance, HR, communication, and AI‑driven insights — built for 12 distinct roles.
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-3xl font-bold bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">{s.value}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => (
                <motion.div
                  key={f.label}
                  whileHover={reduce ? undefined : { y: -2, scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                  className="group flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3.5 backdrop-blur-sm hover:border-white/10 hover:bg-white/[0.06] transition-all duration-300"
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", f.color, "shadow-lg")}>
                    <f.icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{f.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ════ RIGHT: Auth card ════ */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            className="order-1 lg:order-2"
          >
            {/* Glass card */}
            <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-2xl shadow-2xl shadow-black/40">
              {/* Card inner glow */}
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.06] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-3xl" />

              <AnimatePresence mode="wait">

                {/* ── LOGIN FORM ── */}
                {authMode === 'login' && (
                  <motion.div
                    key="login"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    {/* Card header */}
                    <div className="mb-8">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-500/30">
                          <Lock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h2 className="font-bold text-xl text-white tracking-tight">Welcome back</h2>
                          <p className="text-xs text-white/40">Sign in to your school portal</p>
                        </div>
                      </div>
                    </div>

                    <form
                      className="space-y-4"
                      onSubmit={(e) => { e.preventDefault(); if (!busy) void doLogin(); }}
                    >
                      {/* School Code */}
                      <LuxInput
                        id="school-code"
                        label="School Code"
                        value={schoolSlug}
                        onChange={(e) => setSchoolSlug((e.target as HTMLInputElement).value)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        status={slugStatus}
                        suffix={
                          !safeSlug ? null : tenant.status === "loading" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-white/30" />
                          ) : tenant.status === "ready" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : tenant.status === "error" ? (
                            <AlertCircle className="h-4 w-4 text-red-400" />
                          ) : null
                        }
                        hint={
                          safeSlug && tenant.status === "ready" ? (
                            <p className="text-xs text-emerald-400/80 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified: {schoolName}
                            </p>
                          ) : safeSlug && tenant.status === "error" ? (
                            <p className="text-xs text-red-400/80 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              School not found
                            </p>
                          ) : null
                        }
                      />

                      {/* Email */}
                      <div>
                        <LuxInput
                          id="login-email"
                          label="Email Address"
                          type="email"
                          inputRef={emailInputRef}
                          value={email}
                          onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                          autoComplete="username"
                          inputMode="email"
                          list="saved-emails"
                        />
                        {recentEmails.length > 0 && (
                          <datalist id="saved-emails">
                            {recentEmails.map((e) => <option key={e} value={e} />)}
                          </datalist>
                        )}
                      </div>

                      {/* Password */}
                      <div>
                        <LuxInput
                          id="login-password"
                          label="Password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
                          autoComplete="current-password"
                          suffix={
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="text-white/30 hover:text-white/60 transition-colors"
                              tabIndex={-1}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          }
                        />
                        <div className="flex justify-end mt-2">
                          <button
                            type="button"
                            onClick={() => { setMessage(null); setAuthMode('forgot_password'); }}
                            className="text-xs text-blue-400/80 hover:text-blue-300 transition-colors"
                          >
                            Forgot password?
                          </button>
                        </div>
                      </div>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={busy || tenant.status !== "ready"}
                        className={cn(
                          "relative w-full overflow-hidden rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300",
                          "bg-gradient-to-r from-blue-600 via-blue-500 to-violet-600",
                          "shadow-lg shadow-blue-500/30",
                          "hover:shadow-xl hover:shadow-blue-500/40 hover:brightness-110",
                          "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                          "active:scale-[0.98]",
                        )}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {busy ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                          ) : tenant.status === "loading" && safeSlug ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Verifying school…</>
                          ) : tenant.status === "error" ? (
                            "Invalid school code"
                          ) : !safeSlug ? (
                            "Enter school code to continue"
                          ) : (
                            <>Sign in <ArrowRight className="h-4 w-4" /></>
                          )}
                        </span>
                        {/* Shimmer */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none" />
                      </button>
                    </form>

                    {/* Footer note */}
                    <p className="mt-6 text-center text-xs text-white/25">
                      Demo school: <span className="text-white/50 font-medium">beacon</span> · Accounts are created by administrators
                    </p>
                  </motion.div>
                )}

                {/* ── FORGOT PASSWORD FORM ── */}
                {authMode === 'forgot_password' && (
                  <motion.div
                    key="forgot"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <button
                      onClick={() => { setMessage(null); setAuthMode('login'); }}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Back to sign in
                    </button>

                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30">
                          <Mail className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h2 className="font-bold text-xl text-white tracking-tight">Reset password</h2>
                          <p className="text-xs text-white/40">We'll send a 6-digit code to your email</p>
                        </div>
                      </div>
                    </div>

                    <form
                      className="space-y-4"
                      onSubmit={(e) => { e.preventDefault(); if (!busy) void handleSendForgotPasswordOtp(); }}
                    >
                      <LuxInput
                        id="reset-email"
                        label="Email Address"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                        autoComplete="email"
                        inputMode="email"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className={cn(
                          "relative w-full overflow-hidden rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300",
                          "bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/30",
                          "hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]",
                        )}
                      >
                        <span className="flex items-center justify-center gap-2">
                          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Send Verification Code <ArrowRight className="h-4 w-4" /></>}
                        </span>
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* ── OTP / VERIFY EMAIL ── */}
                {(authMode === 'forgot_password_otp' || authMode === 'verify_email') && (
                  <motion.div
                    key="otp"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <button
                      onClick={() => { setMessage(null); setOtpError(null); setOtpCode(""); setAuthMode(authMode === 'verify_email' ? 'login' : 'forgot_password'); }}
                      className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Go back
                    </button>

                    <div className="text-center space-y-1">
                      <h3 className="font-bold text-xl text-white">
                        {authMode === 'verify_email' ? "Verify your email" : "Enter verification code"}
                      </h3>
                      <p className="text-xs text-white/40 text-balance">
                        {authMode === 'verify_email'
                          ? `Enter the 6-digit code sent to ${email}`
                          : `We sent a 6-digit password reset code to ${email}`}
                      </p>
                    </div>

                    <motion.div
                      animate={otpError ? { x: [-8, 8, -8, 8, 0], transition: { duration: 0.4 } } : {}}
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
                          {[0,1,2,3,4,5].map((i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="w-11 h-12 text-lg rounded-xl border-2 border-white/10 bg-white/5 text-white focus:border-blue-400/70 focus:ring-2 focus:ring-blue-500/20"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </motion.div>

                    {otpError && <p className="text-xs text-red-400 text-center font-medium">{otpError}</p>}

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => { if (authMode === 'verify_email') void handleResendVerifyEmailOtp(email); else void handleSendForgotPasswordOtp(); }}
                        disabled={otpCooldown > 0 || isResendingOtp}
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isResendingOtp ? <><Loader2 className="inline mr-2 h-3.5 w-3.5 animate-spin" />Sending…</> : otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : "Resend code"}
                      </button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>

              {/* ── Feedback message ── */}
              <AnimatePresence>
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.25 }}
                    role={message.tone === "error" ? "alert" : "status"}
                    className={cn(
                      "mt-5 rounded-2xl p-3.5 text-xs flex items-start gap-2.5 border",
                      message.tone === "success" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
                      message.tone === "error" && "bg-red-500/10 border-red-500/20 text-red-300",
                      message.tone === "info" && "bg-blue-500/10 border-blue-500/20 text-blue-300",
                    )}
                  >
                    {message.tone === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                    {message.tone === "error" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    {message.tone === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span className="flex-1 leading-relaxed">{message.text}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Security badge below card */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-white/25" />
              <span className="text-xs text-white/25">256-bit encrypted · Admin-created accounts only</span>
            </div>
          </motion.div>
        </div>
      </main>

      {/* ── Shimmer keyframe ── */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};

export default Index;
