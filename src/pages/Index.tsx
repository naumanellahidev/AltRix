import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Brain, ShieldCheck, Eye, EyeOff, MessageSquare, ArrowRight,
  Loader2, CheckCircle2, AlertCircle, Info, Sparkles, GraduationCap,
  TrendingUp, Lock, ChevronLeft, Mail, Zap,
} from "lucide-react";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { type EduverseRole } from "@/lib/eduverse-roles";
import {
  getRecentEmails,
  getResetCooldownRemaining,
  rememberRecentEmail,
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
  { icon: Brain, label: "AI-Powered Insights", sub: "Smart analytics for every role", color: "bg-blue-50 text-blue-600", ring: "ring-blue-100" },
  { icon: ShieldCheck, label: "Enterprise Security", sub: "Role-based access control", color: "bg-indigo-50 text-indigo-600", ring: "ring-indigo-100" },
  { icon: TrendingUp, label: "Real-time Analytics", sub: "Live performance dashboards", color: "bg-sky-50 text-sky-600", ring: "ring-sky-100" },
  { icon: MessageSquare, label: "Unified Messaging", sub: "Across all 12 user roles", color: "bg-blue-50 text-blue-500", ring: "ring-blue-100" },
];

const stats = [
  { value: "12", label: "User Roles" },
  { value: "50+", label: "Modules" },
  { value: "99.9%", label: "Uptime" },
];

/* ── Floating Label Input ── */
interface LuxInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  suffix?: React.ReactNode;
  hint?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement>;
  status?: "ok" | "err" | "loading" | null;
}

function LuxInput({ label, suffix, hint, inputRef, status, ...props }: LuxInputProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = !!props.value;
  const floated = focused || hasValue;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "relative rounded-2xl border-2 bg-white transition-all duration-200",
          focused
            ? "border-blue-500 shadow-[0_0_0_4px_hsl(210_100%_50%/0.08)]"
            : status === "ok"
            ? "border-emerald-400 shadow-[0_0_0_3px_hsl(152_65%_40%/0.08)]"
            : status === "err"
            ? "border-red-400 shadow-[0_0_0_3px_hsl(0_84%_60%/0.08)]"
            : "border-slate-200 hover:border-blue-300",
        )}
      >
        <label
          htmlFor={props.id}
          className={cn(
            "pointer-events-none absolute left-4 font-medium select-none transition-all duration-200 z-10",
            floated
              ? "top-2.5 text-[10px] tracking-widest uppercase text-blue-500"
              : "top-1/2 -translate-y-1/2 text-sm text-slate-400",
          )}
        >
          {label}
        </label>
        <input
          {...props}
          ref={inputRef as any}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          className={cn(
            "w-full rounded-2xl bg-transparent px-4 pb-3 pt-7 text-sm text-slate-800 outline-none placeholder:text-transparent",
            suffix ? "pr-11" : "",
          )}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            {suffix}
          </div>
        )}
      </div>
      {hint && <div className="px-1">{hint}</div>}
    </div>
  );
}

/* ── Main Component ── */
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
    if (!destRole) { showError("No role assigned. Contact an administrator."); await supabase.auth.signOut(); return; }
    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const handleResendVerifyEmailOtp = async (targetEmail: string) => {
    setIsResendingOtp(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: targetEmail });
      if (error) { showError("Failed to send code: " + error.message); return; }
      showSuccess("Verification code sent to " + targetEmail);
      startOtpCooldown(targetEmail);
      setOtpCooldown(60);
    } finally { setIsResendingOtp(false); }
  };

  const handleVerifySignUpOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'signup' });
      if (error) { setOtpError(error.message); showError("Invalid code. Please try again."); setOtpCode(""); return; }
      showSuccess("Email verified!");
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
    if (!parsedEmail.success) { focusEmail(); return showError("Please enter a valid email."); }
    if (parsedEmail.data.toLowerCase() === MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) return showError("Platform Super Admin cannot use OTP reset.");
    const cooldown = getOtpCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) { setOtpCooldown(cooldown); return showInfo(`Wait ${cooldown}s before requesting another code.`); }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string; cooldownSeconds?: number }>("send-otp", { body: { email: parsedEmail.data, purpose: "password_reset" } });
      if (error || !data?.ok) {
        const msg = data?.error || error?.message || "Failed to send code.";
        const isNotFound = msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("not allowed");
        if (isNotFound) return showError("No account found for this email. Contact your school administrator.");
        return showError(msg);
      }
      startOtpCooldown(parsedEmail.data);
      setOtpCooldown(data.cooldownSeconds ?? 60);
      setOtpCode(""); setOtpError(null);
      setAuthMode('forgot_password_otp');
      showSuccess(`6-digit code sent to ${parsedEmail.data}. Check your inbox.`);
    } finally { setBusy(false); }
  };

  const handleVerifyForgotPasswordOtp = async (code: string) => {
    setIsVerificationPending(true);
    setOtpError(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) { setIsVerificationPending(false); return showError("Email is invalid."); }
    try {
      const { data, error } = await supabase.functions.invoke<{ ok: boolean; action?: "token" | "confirmed"; token?: string; error?: string }>("verify-otp", { body: { email: parsedEmail.data, code, purpose: "password_reset" } });
      if (error || !data?.ok) { const msg = data?.error || error?.message || "Invalid or expired code."; setOtpError(msg); showError(msg); setOtpCode(""); return; }
      if (data.action === "token" && data.token) {
        showSuccess("Code verified! Redirecting to reset your password…");
        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: data.token, type: "recovery" });
        if (verifyErr) { const msg = verifyErr.message || "Session error."; setOtpError(msg); showError(msg); return; }
        setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1000);
        return;
      }
      showSuccess("Verified! Redirecting…");
      setTimeout(() => navigate(`/reset-password?returnTo=/${safeSlug}/auth`), 1200);
    } catch (err: any) {
      const msg = err.message || "Verification failed";
      setOtpError(msg); showError(msg);
    } finally { setIsVerificationPending(false); }
  };

  const slugStatus = !safeSlug ? null : tenant.status === "loading" ? "loading" : tenant.status === "ready" ? "ok" : "err" as const;
  const schoolName = tenant.status === "ready" ? tenant.school.name : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60">

      {/* ── Decorative background blobs ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Top-left large orb */}
        <div className="absolute -top-40 -left-40 h-[700px] w-[700px] rounded-full bg-gradient-to-br from-blue-200/60 to-indigo-200/40 blur-3xl" />
        {/* Top-right medium orb */}
        <div className="absolute -top-20 right-0 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-sky-200/50 to-blue-100/30 blur-3xl" />
        {/* Bottom-center orb */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-gradient-to-t from-indigo-100/50 to-transparent blur-3xl" />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `radial-gradient(circle, hsl(210 100% 60% / 0.18) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-xl tracking-tight text-slate-800">AltRix</span>
            <span className="ml-2 text-xs text-slate-400 hidden sm:inline">School OS</span>
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_hsl(152_65%_45%)]" />
            <span className="text-xs font-medium text-emerald-700">All systems operational</span>
          </div>
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-4 lg:pt-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_460px] lg:gap-16 lg:items-center" style={{ minHeight: "calc(100vh - 140px)" }}>

          {/* ════ LEFT: Brand panel ════ */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -24 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
            className="order-2 lg:order-1 space-y-9"
          >
            {/* Eyebrow pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered School Management Platform
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="font-bold leading-[1.1] tracking-tight text-slate-900" style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)" }}>
                The Operating System
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 bg-clip-text text-transparent">
                  for Modern Schools
                </span>
              </h1>
              <p className="text-slate-500 text-lg leading-relaxed max-w-lg">
                One unified platform for academics, finance, HR, communication, and AI-driven insights — built for 12 distinct roles.
              </p>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-10">
              {stats.map((s, i) => (
                <div key={s.label} className={cn("relative", i !== 0 && "pl-10 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-8 before:w-px before:bg-slate-200")}>
                  <p className="text-3xl font-extrabold bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent">{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3.5">
              {features.map((f) => (
                <motion.div
                  key={f.label}
                  whileHover={reduce ? undefined : { y: -3, scale: 1.01 }}
                  transition={{ duration: 0.2 }}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm hover:shadow-md hover:border-blue-200 transition-all duration-300"
                >
                  {/* Subtle gradient tint on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-indigo-50/0 group-hover:from-blue-50/60 group-hover:to-indigo-50/40 transition-all duration-300 rounded-2xl" />
                  <div className="relative">
                    <div className={cn("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ring-4", f.color, f.ring)}>
                      <f.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{f.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{f.sub}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* ════ RIGHT: Auth card ════ */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
            className="order-1 lg:order-2"
          >
            {/* Outer glow ring */}
            <div className="relative">
              <div className="absolute -inset-1.5 rounded-[28px] bg-gradient-to-br from-blue-400/20 via-indigo-400/15 to-blue-300/20 blur-lg" />

              {/* Card */}
              <div className="relative rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-2xl shadow-blue-900/8 backdrop-blur-xl">

                {/* Top accent bar */}
                <div className="absolute inset-x-0 top-0 h-1 rounded-t-3xl bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-400" />

                <AnimatePresence mode="wait">

                  {/* ── LOGIN ── */}
                  {authMode === 'login' && (
                    <motion.div
                      key="login"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28 }}
                    >
                      {/* Card header */}
                      <div className="mb-7 flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
                          <Lock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h2 className="font-bold text-xl text-slate-900 tracking-tight">Welcome back</h2>
                          <p className="text-sm text-slate-400">Sign in to your school portal</p>
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
                            !safeSlug ? null
                            : tenant.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                            : tenant.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            : tenant.status === "error" ? <AlertCircle className="h-4 w-4 text-red-400" />
                            : null
                          }
                          hint={
                            safeSlug && tenant.status === "ready" ? (
                              <p className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                                <CheckCircle2 className="h-3 w-3" /> Verified: {schoolName}
                              </p>
                            ) : safeSlug && tenant.status === "error" ? (
                              <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> School not found
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
                                className="text-slate-400 hover:text-blue-500 transition-colors"
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
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                            >
                              Forgot password?
                            </button>
                          </div>
                        </div>

                        {/* Submit button */}
                        <button
                          type="submit"
                          disabled={busy || tenant.status !== "ready"}
                          className={cn(
                            "group relative w-full overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300",
                            "bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600",
                            "shadow-lg shadow-blue-500/30",
                            "hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.01]",
                            "active:scale-[0.99]",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-md",
                          )}
                        >
                          {/* Shimmer overlay */}
                          <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
                          <span className="relative flex items-center justify-center gap-2">
                            {busy ? (
                              <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                            ) : tenant.status === "loading" && safeSlug ? (
                              <><Loader2 className="h-4 w-4 animate-spin" /> Verifying school…</>
                            ) : tenant.status === "error" ? (
                              "Invalid school code"
                            ) : !safeSlug ? (
                              "Enter school code to continue"
                            ) : (
                              <>Sign in <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></>
                            )}
                          </span>
                        </button>
                      </form>

                      {/* Footer */}
                      <div className="mt-6 flex items-center justify-center gap-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-300" />
                        <p className="text-center text-xs text-slate-400">
                          Demo school: <span className="font-semibold text-slate-600">beacon</span> · Admin-created accounts only
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ── FORGOT PASSWORD ── */}
                  {authMode === 'forgot_password' && (
                    <motion.div
                      key="forgot"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28 }}
                      className="space-y-6"
                    >
                      <button
                        onClick={() => { setMessage(null); setAuthMode('login'); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Back to sign in
                      </button>

                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/25">
                          <Mail className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h2 className="font-bold text-xl text-slate-900 tracking-tight">Reset password</h2>
                          <p className="text-sm text-slate-400">We'll send a 6-digit code to your email</p>
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
                            "group relative w-full overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300",
                            "bg-gradient-to-r from-indigo-600 to-blue-600 shadow-lg shadow-indigo-500/30",
                            "hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                          )}
                        >
                          <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:translate-x-[100%] transition-transform duration-700" />
                          <span className="relative flex items-center justify-center gap-2">
                            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <>Send Verification Code <ArrowRight className="h-4 w-4" /></>}
                          </span>
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {/* ── OTP VERIFY ── */}
                  {(authMode === 'forgot_password_otp' || authMode === 'verify_email') && (
                    <motion.div
                      key="otp"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.28 }}
                      className="space-y-6"
                    >
                      <button
                        onClick={() => { setMessage(null); setOtpError(null); setOtpCode(""); setAuthMode(authMode === 'verify_email' ? 'login' : 'forgot_password'); }}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" /> Go back
                      </button>

                      <div className="text-center space-y-1">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                          <Zap className="h-6 w-6 text-white" />
                        </div>
                        <h3 className="font-bold text-xl text-slate-900">
                          {authMode === 'verify_email' ? "Verify your email" : "Enter verification code"}
                        </h3>
                        <p className="text-xs text-slate-400 text-balance max-w-xs mx-auto">
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
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot
                                key={i}
                                index={i}
                                className="w-11 h-12 text-lg font-bold rounded-2xl border-2 border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </motion.div>

                      {otpError && (
                        <p className="text-xs text-red-500 text-center font-medium">{otpError}</p>
                      )}

                      <button
                        type="button"
                        onClick={() => { if (authMode === 'verify_email') void handleResendVerifyEmailOtp(email); else void handleSendForgotPasswordOtp(); }}
                        disabled={otpCooldown > 0 || isResendingOtp}
                        className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-3 text-sm font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isResendingOtp
                          ? <><Loader2 className="inline mr-2 h-3.5 w-3.5 animate-spin" />Sending…</>
                          : otpCooldown > 0
                          ? `Resend code in ${otpCooldown}s`
                          : "Resend code"}
                      </button>
                    </motion.div>
                  )}

                </AnimatePresence>

                {/* ── Feedback message ── */}
                <AnimatePresence>
                  {message && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.22 }}
                      role={message.tone === "error" ? "alert" : "status"}
                      className={cn(
                        "mt-5 rounded-2xl p-4 text-xs flex items-start gap-2.5 border",
                        message.tone === "success" && "bg-emerald-50 border-emerald-200 text-emerald-700",
                        message.tone === "error" && "bg-red-50 border-red-200 text-red-700",
                        message.tone === "info" && "bg-blue-50 border-blue-200 text-blue-700",
                      )}
                    >
                      {message.tone === "success" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />}
                      {message.tone === "error" && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />}
                      {message.tone === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />}
                      <span className="flex-1 leading-relaxed font-medium">{message.text}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Trust badges below card */}
            <div className="mt-5 flex items-center justify-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                <span>256-bit SSL encrypted</span>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                <span>SOC 2 compliant</span>
              </div>
              <div className="h-3 w-px bg-slate-200" />
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Zap className="h-3.5 w-3.5 text-blue-400" />
                <span>99.9% uptime SLA</span>
              </div>
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
};

export default Index;
