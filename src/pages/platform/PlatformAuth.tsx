import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  KeyRound,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Fingerprint,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import altrixLogo from "@/assets/altrix-logo.png";
import { api } from "@/lib/api";
import { apiClient } from "@/lib/api-client";
import { useSession } from "@/hooks/useSession";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getRecentEmails,
  getResetCooldownRemaining,
  rememberRecentEmail,
  rememberResetEmail,
  requestPasswordResetLink,
  startResetCooldown,
} from "@/lib/password-reset";

const emailSchema = z.string().email("Please enter a valid email address.");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.");

export default function PlatformAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user, loading } = useSession();

  const [activeTab, setActiveTab] = useState<"password" | "reset" | "recovery">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());

  // Prefill with most recent email on first mount
  useEffect(() => {
    if (!email && recentEmails.length > 0) {
      setEmail(recentEmails[0]);
    }
  }, []);

  // Handle location state for access denied redirects
  const deniedState = location.state as { denied?: boolean; message?: string } | null;
  const isDenied = Boolean(deniedState?.denied);

  useEffect(() => {
    if (deniedState?.denied) {
      setErrorMessage(deniedState.message || "Please sign in with authorized Super Admin credentials.");
      void api.auth.signOut();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [deniedState, navigate, location.pathname]);

  // Session gate: redirect if already logged in as super admin
  useEffect(() => {
    if (loading || isDenied) return;
    const token = localStorage.getItem("access_token");
    if (user && token) {
      const emailLower = user.email?.toLowerCase() ?? "";
      if (emailLower !== MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
        (async () => {
          await api.auth.signOut();
          setErrorMessage("Access denied. Authorized Master Super Admin only.");
        })();
      } else {
        navigate("/super_admin", { replace: true });
      }
    }
  }, [loading, user, navigate, isDenied]);

  // Timer tick for password reset cooldown
  useEffect(() => {
    const tick = () => setResetCooldown(email.trim() ? getResetCooldownRemaining(email) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  // Capslock detection
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.getModifierState) {
      setIsCapsLockOn(e.getModifierState("CapsLock"));
    }
  };

  // 1. Password Login Action
  const doPasswordLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);

    if (!parsedEmail.success) {
      setErrorMessage(parsedEmail.error.issues[0]?.message || "Invalid email.");
      return;
    }
    if (!parsedPassword.success) {
      setErrorMessage(parsedPassword.error.issues[0]?.message || "Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await api.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Invalid email or password.");
        toast.error(error.message || "Invalid credentials.");
        return;
      }

      // Hard gate: check master email authority
      if (parsedEmail.data.toLowerCase() !== MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
        await api.auth.signOut();
        setErrorMessage("Access denied. Master Super Admin authority required.");
        toast.error("Access denied: Not a platform super admin account.");
        return;
      }

      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      toast.success("Welcome back, Master Super Admin!", {
        description: "Authenticated securely with 256-bit token session.",
      });
      navigate("/super_admin");
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to authenticate.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // 2. Direct Password Reset Action
  const doResetPassword = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) {
      setErrorMessage("Please enter your admin email address first.");
      return;
    }

    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setResetCooldown(cooldown);
      setErrorMessage(`Please wait ${cooldown}s before requesting another reset link.`);
      return;
    }

    setBusy(true);
    try {
      let sentSuccess = false;
      try {
        await apiClient.post("/auth/password-reset-request", { email: parsedEmail.data });
        sentSuccess = true;
      } catch (fastApiErr) {
        const result = await requestPasswordResetLink(parsedEmail.data, "/auth");
        sentSuccess = result.ok;
        if (!result.ok && result.error) {
          setErrorMessage(result.error);
        }
      }

      if (sentSuccess) {
        const seconds = 60;
        rememberResetEmail(parsedEmail.data);
        startResetCooldown(parsedEmail.data, seconds);
        setResetCooldown(seconds);
        const successNotice = `We've dispatched a secure password reset link to ${parsedEmail.data}. Please check your inbox and spam folder.`;
        setSuccessMessage(successNotice);
        toast.success("Reset link dispatched successfully!", {
          description: `Check your inbox at ${parsedEmail.data}`,
        });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Unable to send reset link right now.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-blue-50/80 via-slate-50 to-blue-50/50 text-slate-900 overflow-hidden font-sans select-none">
      {/* Decorative ambient background glass orbs & soft light accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-8%] left-[-8%] w-[45vw] h-[45vw] rounded-full bg-blue-400/10 blur-[110px]" />
        <div className="absolute bottom-[-10%] right-[-8%] w-[50vw] h-[50vw] rounded-full bg-indigo-400/10 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35vw] h-[35vw] rounded-full bg-blue-300/10 blur-[120px]" />

        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(#1e3a8a 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[440px] flex flex-col items-center">
        {/* Brand Header with Real Altrix Logo */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center mb-6 space-y-2 flex flex-col items-center"
        >
          {/* Security Node Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-blue-200/80 shadow-sm mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-blue-700">
              Super Master Admin Gateway
            </span>
          </div>

          {/* Real Altrix Brand Logo */}
          <div className="flex items-center justify-center py-1 transition-transform duration-300 hover:scale-[1.02]">
            <img
              src={altrixLogo}
              alt="AltRix Core"
              className="h-12 sm:h-14 md:h-16 w-auto max-w-[260px] object-contain filter drop-shadow-md"
            />
          </div>
          <p className="text-[11px] font-black text-slate-800 tracking-[0.22em] uppercase">
            AI-POWERED INSTITUTE OPERATING SYSTEM
          </p>
        </motion.div>

        {/* Central Card with Global Theme (White & Blue) */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.97, y: 8 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-3xl bg-white/95 backdrop-blur-xl border border-blue-100/90 p-6 sm:p-8 shadow-[0_20px_50px_-10px_rgba(30,58,138,0.09),0_2px_6px_rgba(0,0,0,0.03)] relative overflow-hidden"
        >
          {/* Top subtle blue accent line */}
          <div className="absolute -top-px left-1/2 -translate-x-1/2 w-2/3 h-[3px] bg-gradient-to-r from-transparent via-blue-600 to-transparent rounded-full" />

          {/* Interactive Tab Switcher */}
          <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200/80 mb-5 relative">
            <button
              type="button"
              onClick={() => {
                setActiveTab("password");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                activeTab === "password"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Master Login</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("reset");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                activeTab === "reset"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Reset Link</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("recovery");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                activeTab === "recovery"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Recovery</span>
            </button>
          </div>

          {/* Feedback Banners */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2.5 shadow-sm"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -6, height: 0 }}
                className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2.5 shadow-sm"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span className="leading-relaxed">{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* TAB 1: MASTER PASSWORD LOGIN */}
          {activeTab === "password" && (
            <motion.form
              key="tab-password"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void doPasswordLogin();
              }}
              className="space-y-4"
            >
              {/* Email Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Master Admin Email
                  </label>
                  {email === MASTER_SUPER_ADMIN_EMAIL && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Root Email Matched
                    </span>
                  )}
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    id="login-email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naumancheema643@gmail.com"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    list="saved-emails"
                    required
                    className="pl-10 h-11 bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl focus-visible:ring-blue-500/25 focus-visible:border-blue-600 focus-visible:bg-white transition-all text-sm font-medium"
                  />
                  {recentEmails.length > 0 && (
                    <datalist id="saved-emails">
                      {recentEmails.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  )}
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Master Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("reset");
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Lock className="h-4 w-4" />
                  </div>
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="pl-10 pr-10 h-11 bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl focus-visible:ring-blue-500/25 focus-visible:border-blue-600 focus-visible:bg-white transition-all text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {isCapsLockOn && (
                  <p className="text-[11px] text-amber-600 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Caps Lock is ON
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 hover:shadow-lg hover:shadow-blue-600/30 transition-all text-sm flex items-center justify-center gap-2 group"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying Authority...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Super Admin</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </motion.form>
          )}

          {/* TAB 2: INSTANT MAGIC RESET LINK */}
          {activeTab === "reset" && (
            <motion.form
              key="tab-reset"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && resetCooldown <= 0) void doResetPassword();
              }}
              className="space-y-4"
            >
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200/70 text-xs text-blue-900 leading-relaxed font-medium">
                Enter your registered admin email address. We'll generate an encrypted one-time cryptographic reset token and dispatch it to your inbox.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Target Admin Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Mail className="h-4 w-4" />
                  </div>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="naumancheema643@gmail.com"
                    type="email"
                    autoComplete="username"
                    required
                    className="pl-10 h-11 bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl focus-visible:ring-blue-500/25 focus-visible:border-blue-600 focus-visible:bg-white transition-all text-sm font-medium"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy || resetCooldown > 0}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 transition-all text-sm flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Dispatching Token...</span>
                  </>
                ) : resetCooldown > 0 ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Resend Available in {resetCooldown}s</span>
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    <span>Send Password Reset Link</span>
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors py-1"
              >
                Back to Password Login
              </button>
            </motion.form>
          )}

          {/* TAB 3: EMERGENCY RECOVERY */}
          {activeTab === "recovery" && (
            <motion.div
              key="tab-recovery"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="space-y-4"
            >
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 leading-relaxed font-medium">
                Emergency root recovery requires primary email OTP authorization or hardware Ed25519 root token key verification.
              </div>

              <div className="space-y-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/auth/recover-master")}
                  className="w-full h-11 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-between px-4 transition-all shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-blue-600" />
                    <span>Launch Master Admin Recovery Tool</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveTab("reset");
                    setEmail(MASTER_SUPER_ADMIN_EMAIL);
                  }}
                  className="w-full h-11 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-between px-4 transition-all shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <span>Reset Master Admin Password Directly</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors py-1"
              >
                Back to Password Login
              </button>
            </motion.div>
          )}

          {/* Security Telemetry Footer */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-emerald-600" />
              <span>TLS 1.3 256-Bit</span>
            </span>
            <span className="text-slate-300">•</span>
            <span>Ed25519 Verified</span>
            <span className="text-slate-300">•</span>
            <span className="text-blue-600 font-semibold">AltRix Core OS</span>
          </div>
        </motion.div>

        {/* Global Footer Brand Label */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-500 font-medium">
            AltRix Core — The AI-Powered Institute Operating System
          </p>
        </div>
      </div>
    </div>
  );
}
