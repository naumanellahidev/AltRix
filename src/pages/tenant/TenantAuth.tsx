import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, Sparkles, Shield, Activity, Workflow, Building2, Mail, Lock, Eye, EyeOff, Info, ArrowRight, ArrowLeft, Key } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { type EduverseRole } from "@/lib/eduverse-roles";
import { Button } from "@/components/ui/button";
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

const TenantAuth = () => {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const perms = useSchoolPermissions(tenant.status === "ready" ? tenant.schoolId : null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schoolName = useMemo(() => {
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

    const { data: authUser } = await supabase.auth.getUser();
    const signedInEmail = authUser.user?.email?.toLowerCase() ?? null;
    if (signedInEmail === MASTER_SUPER_ADMIN_EMAIL) {
      const { data: psa } = await supabase
        .from("platform_super_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (psa?.user_id) { navigate("/super_admin"); return; }
    }

    const { data: membership } = await supabase
      .from("school_memberships").select("id")
      .eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
    if (!membership) {
      setMessageType("error");
      setMessage("Your account is not a member of this school.");
      await supabase.auth.signOut();
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles").select("role").eq("school_id", schoolId).eq("user_id", userId);
    const roles = (rolesData || []).map((r) => r.role as EduverseRole);
    const destRole = resolveDestinationRole(roles);
    if (!destRole) {
      setMessageType("error");
      setMessage("No role assigned. Contact an administrator.");
      await supabase.auth.signOut();
      return;
    }
    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) { setMessageType("error"); setMessage("Please enter a valid email."); return; }
    if (!parsedPassword.success) { setMessageType("error"); setMessage("Password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: parsedEmail.data, password });
      if (error) { setMessageType("error"); setMessage(error.message); return; }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      if (data.user) await routeUserAfterLogin(data.user.id);
    } finally { setBusy(false); }
  };

  const doForgotPassword = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) { setMessageType("error"); setMessage("Enter your email above, then try again."); return; }
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) { setResetCooldown(cooldown); setMessageType("error"); setMessage(`Please wait ${cooldown}s before requesting another reset link.`); return; }
    setBusy(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const result = await requestPasswordResetLink(parsedEmail.data, returnTo);
      if (!result.ok) { setMessageType("error"); setMessage(result.error || "Unable to send reset link."); return; }
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsedEmail.data);
      startResetCooldown(parsedEmail.data, seconds);
      setResetCooldown(seconds);
      const remaining = typeof result.remainingRequests === "number"
        ? ` ${result.remainingRequests} request${result.remainingRequests === 1 ? "" : "s"} left today.`
        : "";
      setMessageType("success");
      setMessage(`Reset link sent to ${parsedEmail.data}. Check your inbox.${remaining}`);
    } finally { setBusy(false); }
  };

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

        {/* ── RIGHT: Sign-in Card ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-5 lg:row-span-2 w-full max-w-md mx-auto"
        >
          <div className="bg-white/80 border border-white/80 shadow-elevated rounded-3xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:shadow-2xl">
            {/* Corner decoration gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-bl-full pointer-events-none" />

            {!showReset ? (
              <>
                {/* Header */}
                <div className="mb-6 relative z-10">
                  <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-900 bg-gradient-to-r from-blue-800 to-indigo-600 bg-clip-text text-transparent">
                    Welcome Back
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    {tenant.status === "ready" ? `Access ${schoolName} portal` : "Access your administrative portal"}
                  </p>
                </div>

                {/* Sign-in Form */}
                <form
                  onSubmit={(e) => { e.preventDefault(); if (!busy) void doPasswordLogin(); }}
                  className="flex flex-col gap-5 relative z-10"
                >
                  {/* School Name Display */}
                  {tenant.slug && (
                    <div>
                      <label className="block text-xs font-bold tracking-wider text-blue-700 uppercase mb-2 ml-1">
                        School
                      </label>
                      <div className="relative rounded-xl border border-slate-200 bg-white/50 px-4 py-3 text-sm text-slate-800 flex items-center justify-between gap-3 backdrop-blur-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                          <span className="font-semibold truncate">{schoolName}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold shrink-0">
                          Verified
                        </span>
                      </div>
                      <a 
                        href="/auth" 
                        className="text-xs text-blue-600 hover:underline font-semibold mt-1.5 inline-block transition-colors"
                      >
                        Not your school? Switch school
                      </a>
                    </div>
                  )}

                  {/* Email Input */}
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
                      <datalist id="saved-emails">{recentEmails.map((e) => <option key={e} value={e} />)}</datalist>
                    )}
                  </div>

                  {/* Password Input */}
                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                      <label htmlFor="login-password" className="text-xs font-bold tracking-wider text-blue-700 uppercase">
                        Password
                      </label>
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        onClick={() => { setShowReset(true); setMessage(null); }}
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
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors p-1 rounded-lg focus:outline-none"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Info Badge */}
                  <div className="flex items-start gap-2.5 p-3.5 bg-slate-50/50 rounded-xl border border-slate-100 backdrop-blur-sm">
                    <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] sm:text-xs text-slate-600 leading-normal">
                      Admin-created accounts only · No public signup
                    </p>
                  </div>

                  {/* Sign In CTA */}
                  <button 
                    type="submit" 
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-500 hover:from-blue-800 hover:to-sky-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={busy}
                  >
                    {busy ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                    ) : (
                      <><span>Sign In to AltRix</span><ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>

                  {/* Super admin quick-access */}
                  {perms.isPlatformSuperAdmin && tenant.status === "ready" && (
                    <div className="mt-2 p-3.5 rounded-xl bg-blue-50/30 border border-blue-100/50 flex items-center justify-between gap-3 backdrop-blur-sm">
                      <div>
                        <p className="text-xs font-semibold text-blue-700">Platform Super Admin</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Quick access to bootstrap tools.</p>
                      </div>
                      <Button type="button" size="sm" variant="soft" onClick={() => navigate(`/${tenant.slug}/bootstrap`)}>Bootstrap</Button>
                    </div>
                  )}
                </form>
              </>
            ) : (
              /* ── RESET PASSWORD ── */
              <div className="flex flex-col gap-6 relative z-10">
                <div className="text-center">
                  <div className="inline-flex p-3 rounded-xl bg-blue-50 border border-blue-100 mb-3.5">
                    <Key className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-sans text-xl font-bold text-slate-900">
                    Reset Password
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                    Enter your email and we'll send a secure reset link.
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
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-700 to-sky-500 hover:from-blue-800 hover:to-sky-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={busy || resetCooldown > 0}
                  onClick={() => { if (!busy && resetCooldown <= 0) void doForgotPassword(); }}
                >
                  {busy ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  ) : resetCooldown > 0 ? (
                    `Resend in ${resetCooldown}s`
                  ) : (
                    "Send Reset Link"
                  )}
                </button>

                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5"
                  onClick={() => { setShowReset(false); setMessage(null); }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </button>
              </div>
            )}

            {/* Feedback message banner */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-3.5 rounded-xl text-xs sm:text-sm border relative z-10 leading-relaxed ${
                  messageType === "success" 
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" 
                    : "bg-red-50/50 border-red-200 text-red-800"
                }`}
              >
                {message}
              </motion.div>
            )}

            {tenant.status === "error" && (
              <div className="mt-4 p-3.5 rounded-xl text-xs sm:text-sm bg-red-50/50 border border-red-200 text-red-800 leading-relaxed">
                {tenant.error}
              </div>
            )}
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
              { icon: Sparkles, iconColor: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", label: "AI Insights", desc: "Predictive student performance analytics and trend spotting." },
              { icon: Shield, iconColor: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100", label: "Secure Vault", desc: "Military-grade data encryption and privacy compliance." },
              { icon: Activity, iconColor: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200", label: "Real-time Audit", desc: "Live transparent audit logs for staff and administrators." },
              { icon: Workflow, iconColor: "text-sky-600", bg: "bg-sky-50", border: "border-sky-100", label: "Universal Hub", desc: "Unified school-parent communication and collaboration." },
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

export default TenantAuth;
