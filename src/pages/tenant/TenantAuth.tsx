import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";

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

/* ─── tiny icon components (Material Symbols via font) ─── */
const Icon = ({ name, fill = 0, size = 20, className = "" }: { name: string; fill?: number; size?: number; className?: string }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontSize: `${size}px`,
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      userSelect: "none",
      lineHeight: 1,
    }}
  >
    {name}
  </span>
);

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
      setMessage("Your account is not a member of this school.");
      setMessageType("error");
      await supabase.auth.signOut();
      return;
    }

    const { data: rolesData } = await supabase
      .from("user_roles").select("role").eq("school_id", schoolId).eq("user_id", userId);
    const roles = (rolesData || []).map((r) => r.role as EduverseRole);
    const destRole = resolveDestinationRole(roles);
    if (!destRole) {
      setMessage("No role assigned. Contact an administrator.");
      setMessageType("error");
      await supabase.auth.signOut();
      return;
    }
    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) { setMessageType("error"); return setMessage("Please enter a valid email."); }
    if (!parsedPassword.success) { setMessageType("error"); return setMessage("Password must be at least 8 characters."); }
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
    if (!parsedEmail.success) { setMessageType("error"); return setMessage("Enter your email above, then try again."); }
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) { setResetCooldown(cooldown); setMessageType("error"); return setMessage(`Please wait ${cooldown}s before requesting another reset link.`); }
    setBusy(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const result = await requestPasswordResetLink(parsedEmail.data, returnTo);
      if (!result.ok) { setMessageType("error"); return setMessage(result.error || "Unable to send reset link."); }
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsedEmail.data);
      startResetCooldown(parsedEmail.data, seconds);
      setResetCooldown(seconds);
      const remaining = typeof result.remainingRequests === "number" ? ` ${result.remainingRequests} request${result.remainingRequests === 1 ? "" : "s"} left today.` : "";
      setMessageType("success");
      setMessage(`Reset link sent to ${parsedEmail.data}. Check your inbox.${remaining}`);
    } finally { setBusy(false); }
  };

  return (
    <>
      {/* Google Fonts + Material Symbols */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');

        .auth-body { font-family: 'Hanken Grotesk', sans-serif; }
        .auth-manrope { font-family: 'Manrope', sans-serif; }

        .auth-premium-bg {
          background: linear-gradient(145deg, #f0f6ff 0%, #e0edff 50%, #cce0ff 100%);
        }
        .auth-glass {
          background: rgba(255,255,255,0.70);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.80);
          box-shadow: 0 10px 40px -10px rgba(0,102,255,0.10);
        }
        .auth-input-wrap {
          position: relative;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.9);
          background: rgba(255,255,255,0.60);
          overflow: hidden;
          backdrop-filter: blur(8px);
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          transition: box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease, transform 0.2s ease;
        }
        .auth-input-wrap:focus-within {
          box-shadow: 0 0 0 4px rgba(0,102,255,0.15), 0 4px 20px -5px rgba(0,102,255,0.10);
          border-color: #0066ff;
          background: rgba(255,255,255,0.95);
          transform: scale(1.01);
        }
        .auth-input {
          width: 100%; padding: 14px 14px 14px 46px;
          background: transparent; border: none; outline: none;
          font-family: 'Hanken Grotesk', sans-serif; font-size: 16px; color: #1a1c1e;
        }
        .auth-input::placeholder { color: rgba(114,118,135,0.45); }
        .auth-input-pr { padding-right: 48px; }
        .auth-icon-left {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: rgba(0,102,255,0.65); transition: color 0.2s ease;
          display: flex; align-items: center;
        }
        .auth-input-wrap:focus-within .auth-icon-left { color: #0066ff; }

        .auth-btn {
          width: 100%; padding: 15px; border-radius: 12px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #0050cb 0%, #00a3ff 100%);
          box-shadow: 0 8px 25px -5px rgba(0,102,255,0.40);
          color: white; font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          position: relative; z-index: 1; overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease;
        }
        .auth-btn::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, #004b65 0%, #0066ff 100%);
          z-index: -1; opacity: 0; transition: opacity 0.3s ease;
        }
        .auth-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 30px -5px rgba(0,102,255,0.50); }
        .auth-btn:hover:not(:disabled)::before { opacity: 1; }
        .auth-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        .auth-bento-card {
          padding: 20px; border-radius: 12px;
          background: rgba(255,255,255,0.60);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.80);
          box-shadow: 0 10px 40px -10px rgba(0,102,255,0.10);
          position: relative; overflow: hidden;
          transition: box-shadow 0.3s ease, transform 0.3s ease;
          cursor: default;
        }
        .auth-bento-card:hover { box-shadow: 0 16px 50px -10px rgba(0,102,255,0.18); transform: translateY(-2px); }
        .auth-bento-icon {
          width: 48px; height: 48px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          transition: transform 0.3s ease;
        }
        .auth-bento-card:hover .auth-bento-icon { transform: scale(1.1); }
        .auth-label { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; }
        .auth-gradient-text {
          background: linear-gradient(135deg, #0050cb, #00a3ff);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .auth-gradient-text-hero {
          background: linear-gradient(135deg, #003fa4, #0066ff);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        @keyframes auth-fadein { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .auth-fadein { animation: auth-fadein 0.5s cubic-bezier(0.2,0.8,0.2,1) both; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="auth-body auth-premium-bg" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

        {/* Decorative blurred orbs */}
        <div style={{ position: "fixed", top: "-10%", left: "-10%", width: "40%", height: "40%", borderRadius: "9999px", background: "rgba(147,197,253,0.30)", filter: "blur(100px)", pointerEvents: "none" }} />
        <div style={{ position: "fixed", bottom: "-10%", right: "-5%", width: "50%", height: "50%", borderRadius: "9999px", background: "rgba(165,243,252,0.20)", filter: "blur(120px)", pointerEvents: "none" }} />

        {/* ── HEADER ── */}
        <header style={{ width: "100%", padding: "20px 24px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img src="/pwa-512.png" alt="AltRix Logo" style={{ width: "44px", height: "44px", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,80,203,0.25)" }} />
            <span className="auth-manrope auth-gradient-text" style={{ fontSize: "clamp(28px,5vw,40px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
              AltRix
            </span>
          </div>
          <p style={{ marginTop: "6px", fontSize: "12px", fontWeight: 600, color: "#424656", letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.8 }}>
            School Operating System
          </p>
        </header>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 24px 64px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "48px", flexWrap: "wrap" }}>

            {/* ── LEFT: Value proposition + Bento ── */}
            <motion.div
              initial={reduce ? false : { opacity: 0, x: -20 }}
              animate={reduce ? undefined : { opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ flex: 1, minWidth: "280px", display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div style={{ marginBottom: "8px" }}>
                <h2 className="auth-manrope auth-gradient-text-hero" style={{ fontSize: "clamp(22px,3.5vw,36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em", margin: "0 0 12px" }}>
                  Empowering education through intelligent operations
                </h2>
                <p style={{ fontSize: "16px", color: "#424656", lineHeight: 1.7, maxWidth: "480px" }}>
                  AltRix provides the infrastructure for modern schools to manage performance, security, and communication in one unified platform.
                </p>
              </div>

              {/* Bento grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                {/* AI Insights */}
                <div className="auth-bento-card">
                  <div className="auth-bento-icon" style={{ background: "linear-gradient(135deg, rgba(0,80,203,0.10), rgba(0,80,203,0.05))", border: "1px solid rgba(0,80,203,0.10)" }}>
                    <Icon name="auto_awesome" fill={1} size={22} className="" style={{ color: "#0050cb" } as React.CSSProperties} />
                  </div>
                  <p className="auth-label" style={{ color: "#0050cb", marginBottom: "6px" }}>AI Insights</p>
                  <p style={{ fontSize: "13px", color: "#424656", lineHeight: 1.5 }}>Predictive student performance analytics and trend spotting.</p>
                </div>
                {/* Secure Vault */}
                <div className="auth-bento-card">
                  <div className="auth-bento-icon" style={{ background: "linear-gradient(135deg, rgba(0,102,136,0.10), rgba(0,102,136,0.05))", border: "1px solid rgba(0,102,136,0.10)" }}>
                    <Icon name="shield_with_heart" fill={1} size={22} style={{ color: "#006688" } as React.CSSProperties} />
                  </div>
                  <p className="auth-label" style={{ color: "#0050cb", marginBottom: "6px" }}>Secure Vault</p>
                  <p style={{ fontSize: "13px", color: "#424656", lineHeight: 1.5 }}>Military-grade data encryption and privacy compliance.</p>
                </div>
                {/* Real-time Audit */}
                <div className="auth-bento-card">
                  <div className="auth-bento-icon" style={{ background: "linear-gradient(135deg, rgba(109,114,118,0.12), rgba(109,114,118,0.05))", border: "1px solid rgba(109,114,118,0.10)" }}>
                    <Icon name="analytics" fill={1} size={22} style={{ color: "#555a5d" } as React.CSSProperties} />
                  </div>
                  <p className="auth-label" style={{ color: "#0050cb", marginBottom: "6px" }}>Real-time Audit</p>
                  <p style={{ fontSize: "13px", color: "#424656", lineHeight: 1.5 }}>Live transparent audit logs for staff and administrators.</p>
                </div>
                {/* Universal Hub */}
                <div className="auth-bento-card">
                  <div className="auth-bento-icon" style={{ background: "linear-gradient(135deg, rgba(0,193,253,0.18), rgba(0,193,253,0.06))", border: "1px solid rgba(0,193,253,0.18)" }}>
                    <Icon name="hub" fill={1} size={22} style={{ color: "#00a3cc" } as React.CSSProperties} />
                  </div>
                  <p className="auth-label" style={{ color: "#0050cb", marginBottom: "6px" }}>Universal Hub</p>
                  <p style={{ fontSize: "13px", color: "#424656", lineHeight: 1.5 }}>Unified school-parent communication and collaboration.</p>
                </div>
              </div>

              <p style={{ fontSize: "14px", color: "#424656" }}>
                Need a school account?{" "}
                <a href="mailto:sales@altrix.io" style={{ color: "#0066ff", fontWeight: 600, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  Contact Sales
                </a>
              </p>
            </motion.div>

            {/* ── RIGHT: Sign-in card ── */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ width: "100%", maxWidth: "420px", flexShrink: 0 }}
            >
              <div className="auth-glass" style={{ borderRadius: "20px", padding: "28px", position: "relative", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 20px 60px -15px rgba(0,102,255,0.15)" }}>
                {/* Decorative corner */}
                <div style={{ position: "absolute", top: 0, right: 0, width: "128px", height: "128px", background: "linear-gradient(225deg, rgba(0,193,253,0.18), transparent)", borderBottomLeftRadius: "100%", pointerEvents: "none" }} />

                <div style={{ marginBottom: "24px", position: "relative", zIndex: 1 }}>
                  <h2 className="auth-manrope auth-gradient-text-hero" style={{ fontSize: "clamp(22px,3vw,28px)", fontWeight: 700, margin: "0 0 4px" }}>Welcome Back</h2>
                  <p style={{ fontSize: "14px", color: "#424656", margin: 0 }}>
                    {tenant.status === "ready" ? `Access ${schoolName} portal` : "Access your administrative portal"}
                  </p>
                </div>

                {!showReset ? (
                  /* ── SIGN IN FORM ── */
                  <form
                    onSubmit={(e) => { e.preventDefault(); if (!busy) void doPasswordLogin(); }}
                    style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative", zIndex: 1 }}
                  >
                    {/* School slug display (read-only, shows which school) */}
                    {tenant.slug && (
                      <div>
                        <label className="auth-label" style={{ display: "block", marginLeft: "4px", marginBottom: "8px", color: "#003fa4" }}>School</label>
                        <div className="auth-input-wrap" style={{ pointerEvents: "none" }}>
                          <span className="auth-icon-left"><Icon name="apartment" size={20} /></span>
                          <div className="auth-input" style={{ paddingLeft: "46px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontWeight: 500 }}>{schoolName}</span>
                            <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "999px", background: "linear-gradient(135deg, rgba(179,197,255,0.6), rgba(194,232,255,0.6))", border: "1px solid rgba(255,255,255,0.6)", color: "#003fa4", fontWeight: 600, letterSpacing: "0.02em" }}>
                              ✓ Verified
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Email */}
                    <div>
                      <label className="auth-label" htmlFor="login-email" style={{ display: "block", marginLeft: "4px", marginBottom: "8px", color: "#003fa4" }}>Work Email</label>
                      <div className="auth-input-wrap">
                        <span className="auth-icon-left"><Icon name="mail" size={20} /></span>
                        <input
                          id="login-email"
                          name="email"
                          className="auth-input"
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

                    {/* Password */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginLeft: "4px", marginBottom: "8px" }}>
                        <label className="auth-label" htmlFor="login-password" style={{ color: "#003fa4" }}>Password</label>
                        <button
                          type="button"
                          onClick={() => { setShowReset(true); setMessage(null); }}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "#0066ff", padding: 0, letterSpacing: "0.01em", transition: "color 0.15s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#0050cb")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#0066ff")}
                        >
                          Forgot?
                        </button>
                      </div>
                      <div className="auth-input-wrap">
                        <span className="auth-icon-left"><Icon name="lock" size={20} /></span>
                        <input
                          id="login-password"
                          className="auth-input auth-input-pr"
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
                          style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#727687", transition: "color 0.15s", display: "flex", alignItems: "center", padding: "4px" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#0050cb")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#727687")}
                        >
                          <Icon name={showPassword ? "visibility_off" : "visibility"} size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Admin-only notice */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 12px", background: "rgba(255,255,255,0.40)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.60)", backdropFilter: "blur(8px)" }}>
                      <Icon name="info" size={18} style={{ color: "#555a5d", marginRight: "8px", flexShrink: 0 } as React.CSSProperties} />
                      <p style={{ fontSize: "12px", color: "rgba(66,70,86,0.80)", margin: 0, letterSpacing: "0.02em" }}>Admin-created accounts only · No public signup</p>
                    </div>

                    {/* CTA */}
                    <button type="submit" className="auth-btn" disabled={busy}>
                      {busy
                        ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Signing in…</>
                        : <><span>Sign In to AltRix</span><Icon name="arrow_forward" size={20} style={{ transition: "transform 0.2s ease" } as React.CSSProperties} /></>
                      }
                    </button>

                    {/* Super admin quick access */}
                    {perms.isPlatformSuperAdmin && tenant.status === "ready" && (
                      <div style={{ padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,102,255,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#0050cb" }}>Platform Super Admin</p>
                          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#424656" }}>Quick access to bootstrap tools.</p>
                        </div>
                        <Button type="button" variant="soft" onClick={() => navigate(`/${tenant.slug}/bootstrap`)}>Bootstrap</Button>
                      </div>
                    )}
                  </form>
                ) : (
                  /* ── FORGOT PASSWORD FORM ── */
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative", zIndex: 1 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ display: "inline-flex", padding: "14px", borderRadius: "14px", background: "rgba(0,102,255,0.08)", marginBottom: "12px" }}>
                        <Icon name="key" fill={1} size={26} style={{ color: "#0066ff" } as React.CSSProperties} />
                      </div>
                      <h3 className="auth-manrope" style={{ margin: "0 0 6px", fontSize: "20px", fontWeight: 700, color: "#1a1c1e" }}>Reset Password</h3>
                      <p style={{ fontSize: "14px", color: "#424656", lineHeight: 1.6, margin: 0 }}>
                        Enter your email and we'll send a secure reset link.
                      </p>
                    </div>

                    <div>
                      <label className="auth-label" style={{ display: "block", marginLeft: "4px", marginBottom: "8px", color: "#003fa4" }}>Work Email</label>
                      <div className="auth-input-wrap">
                        <span className="auth-icon-left"><Icon name="mail" size={20} /></span>
                        <input
                          className="auth-input"
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
                      className="auth-btn"
                      disabled={busy || resetCooldown > 0}
                      onClick={() => { if (!busy && resetCooldown <= 0) void doForgotPassword(); }}
                    >
                      {busy
                        ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Sending…</>
                        : resetCooldown > 0
                          ? `Resend in ${resetCooldown}s`
                          : "Send Reset Link"
                      }
                    </button>

                    <button
                      type="button"
                      onClick={() => { setShowReset(false); setMessage(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "#727687", textAlign: "center", padding: 0, transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#0050cb")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#727687")}
                    >
                      ← Back to sign in
                    </button>
                  </div>
                )}

                {/* Messages */}
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: "16px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px",
                      background: messageType === "success" ? "rgba(0,180,100,0.08)" : "rgba(186,26,26,0.06)",
                      border: `1px solid ${messageType === "success" ? "rgba(0,160,80,0.25)" : "rgba(186,26,26,0.20)"}`,
                      color: messageType === "success" ? "#007a40" : "#ba1a1a",
                      lineHeight: 1.5, position: "relative", zIndex: 1,
                    }}
                  >
                    {message}
                  </motion.div>
                )}

                {tenant.status === "error" && (
                  <div style={{ marginTop: "12px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px", background: "rgba(186,26,26,0.06)", border: "1px solid rgba(186,26,26,0.20)", color: "#ba1a1a", lineHeight: 1.5 }}>
                    {tenant.error}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer style={{ width: "100%", background: "rgba(255,255,255,0.30)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.50)", padding: "12px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.5, filter: "grayscale(1)", transition: "all 0.3s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; (e.currentTarget as HTMLDivElement).style.filter = "grayscale(0)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0.5"; (e.currentTarget as HTMLDivElement).style.filter = "grayscale(1)"; }}
            >
              <img src="/pwa-512.png" alt="AltRix" style={{ width: "24px", height: "24px", borderRadius: "6px" }} />
              <span className="auth-manrope" style={{ fontSize: "16px", fontWeight: 700, color: "#1a1c1e" }}>AltRix</span>
            </div>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", justifyContent: "center" }}>
              {["Privacy Policy", "Terms of Service", "Compliance"].map((link) => (
                <a key={link} href="#" style={{ fontSize: "12px", fontWeight: 600, color: "#424656", textDecoration: "none", letterSpacing: "0.01em", transition: "color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0066ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#424656")}
                >
                  {link}
                </a>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "rgba(66,70,86,0.60)", margin: 0 }}>© 2025 AltRix School OS. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default TenantAuth;
