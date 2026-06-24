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

/* ── Material Symbol icon helper ── */
interface IconProps {
  name: string;
  fill?: number;
  size?: number;
  style?: React.CSSProperties;
}
const MIcon = ({ name, fill = 0, size = 20, style }: IconProps) => (
  <span
    className="material-symbols-outlined"
    style={{
      fontSize: `${size}px`,
      fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      userSelect: "none",
      lineHeight: 1,
      ...style,
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

  /* ─── shared input field style ─── */
  const inputWrapBase: React.CSSProperties = {
    position: "relative",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.9)",
    background: "rgba(255,255,255,0.60)",
    overflow: "hidden",
    backdropFilter: "blur(8px)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
    transition: "box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "14px 14px 14px 46px",
    background: "transparent",
    border: "none",
    outline: "none",
    fontFamily: "'Hanken Grotesk', sans-serif",
    fontSize: "15px",
    color: "#1a1c1e",
    boxSizing: "border-box",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');

        .ta-body * { box-sizing: border-box; }
        .ta-body input::placeholder { color: rgba(114,118,135,0.45); }
        .ta-body input { font-family: 'Hanken Grotesk', sans-serif; }

        .ta-input-wrap:focus-within {
          box-shadow: 0 0 0 4px rgba(0,102,255,0.15), 0 4px 20px -5px rgba(0,102,255,0.10) !important;
          border-color: #0066ff !important;
          background: rgba(255,255,255,0.95) !important;
          transform: scale(1.005);
        }
        .ta-input-wrap:focus-within .ta-icon-left { color: #0066ff !important; }

        .ta-btn {
          width: 100%; padding: 15px; border-radius: 12px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #0050cb 0%, #00a3ff 100%);
          box-shadow: 0 8px 25px -5px rgba(0,102,255,0.40);
          color: white; font-family: 'Manrope', sans-serif; font-size: 16px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          position: relative; z-index: 1; overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease;
          letter-spacing: 0.01em;
        }
        .ta-btn::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, #003fa4 0%, #0066ff 100%);
          z-index: -1; opacity: 0; transition: opacity 0.3s ease;
        }
        .ta-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 32px -5px rgba(0,102,255,0.55); }
        .ta-btn:hover:not(:disabled)::before { opacity: 1; }
        .ta-btn:disabled { opacity: 0.60; cursor: not-allowed; }

        .ta-bento {
          padding: 20px; border-radius: 12px;
          background: rgba(255,255,255,0.65);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.85);
          box-shadow: 0 8px 32px -8px rgba(0,102,255,0.08);
          position: relative; overflow: hidden; cursor: default;
          transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
        }
        .ta-bento:hover {
          box-shadow: 0 16px 48px -10px rgba(0,102,255,0.18);
          transform: translateY(-3px);
          border-color: rgba(255,255,255,1);
        }
        .ta-bento-icon {
          width: 48px; height: 48px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
          transition: transform 0.3s ease;
        }
        .ta-bento:hover .ta-bento-icon { transform: scale(1.12); }

        .ta-footer-logo { opacity: 0.45; filter: grayscale(1); transition: opacity 0.3s, filter 0.3s; }
        .ta-footer-logo:hover { opacity: 1; filter: grayscale(0); }

        .ta-footer-link { font-size: 12px; font-weight: 600; color: #424656; text-decoration: none; letter-spacing: 0.01em; transition: color 0.15s; }
        .ta-footer-link:hover { color: #0066ff; }

        .ta-forgot-btn { background:none; border:none; cursor:pointer; padding:0; transition:color 0.15s; }
        .ta-forgot-btn:hover { color: #0050cb !important; }
        .ta-back-btn { background:none; border:none; cursor:pointer; font-size:14px; color:#727687; padding:0; transition:color 0.15s; width:100%; text-align:center; }
        .ta-back-btn:hover { color: #0050cb; }

        @keyframes ta-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .ta-spin { animation: ta-spin 1s linear infinite; }

        @keyframes ta-fade-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .ta-fade-in { animation: ta-fade-in 0.5s cubic-bezier(0.2,0.8,0.2,1) both; }
      `}</style>

      <div
        className="ta-body"
        style={{
          fontFamily: "'Hanken Grotesk', sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(145deg, #f0f6ff 0%, #e0edff 50%, #cce0ff 100%)",
          position: "relative",
          overflowX: "hidden",
        }}
      >
        {/* Decorative orbs */}
        <div style={{ position: "fixed", top: "-10%", left: "-10%", width: "40%", height: "40%", borderRadius: "9999px", background: "rgba(147,197,253,0.30)", filter: "blur(100px)", pointerEvents: "none", zIndex: 0 }} />
        <div style={{ position: "fixed", bottom: "-10%", right: "-5%", width: "50%", height: "50%", borderRadius: "9999px", background: "rgba(165,243,252,0.20)", filter: "blur(120px)", pointerEvents: "none", zIndex: 0 }} />

        {/* ── HEADER ── */}
        <header style={{ width: "100%", padding: "20px 24px 16px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img
              src="/pwa-512.png"
              alt="AltRix"
              style={{ width: "46px", height: "46px", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,80,203,0.22)" }}
            />
            <span
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: "clamp(30px, 5vw, 42px)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                background: "linear-gradient(135deg, #0050cb, #00a3ff)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              AltRix
            </span>
          </div>
          <p style={{ marginTop: "6px", fontSize: "11px", fontWeight: 600, color: "#424656", letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.75, margin: "6px 0 0" }}>
            School Operating System
          </p>
        </header>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "8px 24px 64px", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "40px", flexWrap: "wrap" }}>

            {/* ── LEFT: Value proposition + Bento Grid ── */}
            <motion.div
              initial={reduce ? false : { opacity: 0, x: -18 }}
              animate={reduce ? undefined : { opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ flex: 1, minWidth: "280px", display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "clamp(22px, 3.2vw, 34px)",
                    fontWeight: 700,
                    lineHeight: 1.2,
                    letterSpacing: "-0.01em",
                    margin: "0 0 12px",
                    background: "linear-gradient(135deg, #003fa4, #0066ff)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Empowering education through intelligent operations
                </h2>
                <p style={{ fontSize: "16px", color: "#424656", lineHeight: 1.7, maxWidth: "480px", margin: 0 }}>
                  AltRix provides the infrastructure for modern schools to manage performance, security, and communication in one unified platform.
                </p>
              </div>

              {/* Bento Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "14px" }}>
                {[
                  { icon: "auto_awesome", fill: 1, iconColor: "#0050cb", bg: "rgba(0,80,203,0.08)", border: "rgba(0,80,203,0.10)", label: "AI Insights", desc: "Predictive student performance analytics and trend spotting." },
                  { icon: "shield_with_heart", fill: 1, iconColor: "#006688", bg: "rgba(0,102,136,0.08)", border: "rgba(0,102,136,0.10)", label: "Secure Vault", desc: "Military-grade data encryption and privacy compliance." },
                  { icon: "analytics", fill: 1, iconColor: "#555a5d", bg: "rgba(109,114,118,0.10)", border: "rgba(109,114,118,0.10)", label: "Real-time Audit", desc: "Live transparent audit logs for staff and administrators." },
                  { icon: "hub", fill: 1, iconColor: "#0088aa", bg: "rgba(0,193,253,0.12)", border: "rgba(0,193,253,0.15)", label: "Universal Hub", desc: "Unified school-parent communication and collaboration." },
                ].map(({ icon, fill, iconColor, bg, border, label, desc }) => (
                  <div key={label} className="ta-bento">
                    <div className="ta-bento-icon" style={{ background: bg, border: `1px solid ${border}` }}>
                      <MIcon name={icon} fill={fill} size={22} style={{ color: iconColor }} />
                    </div>
                    <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.05em", color: "#0050cb", marginBottom: "6px", margin: "0 0 6px" }}>{label}</p>
                    <p style={{ fontSize: "13px", color: "#424656", lineHeight: 1.55, margin: 0 }}>{desc}</p>
                  </div>
                ))}
              </div>

              <p style={{ fontSize: "13px", color: "#424656", margin: 0 }}>
                Need a school account?{" "}
                <a
                  href="mailto:sales@altrix.io"
                  style={{ color: "#0066ff", fontWeight: 600, textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  Contact Sales
                </a>
              </p>
            </motion.div>

            {/* ── RIGHT: Sign-in Card ── */}
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.06, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ width: "100%", maxWidth: "410px", flexShrink: 0 }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.72)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.85)",
                  borderTop: "1px solid rgba(255,255,255,0.95)",
                  borderRadius: "20px",
                  padding: "28px",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 20px 60px -15px rgba(0,102,255,0.15), 0 1px 0 rgba(255,255,255,0.8) inset",
                }}
              >
                {/* Corner decoration */}
                <div style={{ position: "absolute", top: 0, right: 0, width: "120px", height: "120px", background: "linear-gradient(225deg, rgba(0,193,253,0.16), transparent)", borderBottomLeftRadius: "100%", pointerEvents: "none" }} />

                {!showReset ? (
                  <>
                    {/* Header */}
                    <div style={{ marginBottom: "22px", position: "relative", zIndex: 1 }}>
                      <h2
                        style={{
                          fontFamily: "'Manrope', sans-serif",
                          fontSize: "clamp(20px, 2.5vw, 26px)",
                          fontWeight: 700,
                          margin: "0 0 4px",
                          background: "linear-gradient(135deg, #003fa4, #0066ff)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        Welcome Back
                      </h2>
                      <p style={{ fontSize: "14px", color: "#424656", margin: 0 }}>
                        {tenant.status === "ready" ? `Access ${schoolName} portal` : "Access your administrative portal"}
                      </p>
                    </div>

                    {/* Sign-in Form */}
                    <form
                      onSubmit={(e) => { e.preventDefault(); if (!busy) void doPasswordLogin(); }}
                      style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative", zIndex: 1 }}
                    >
                      {/* School (read-only display) */}
                      {tenant.slug && (
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", color: "#003fa4", marginBottom: "8px", marginLeft: "2px" }}>
                            School
                          </label>
                          <div className="ta-input-wrap" style={{ ...inputWrapBase, pointerEvents: "none" }}>
                            <span className="ta-icon-left" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(0,102,255,0.65)", display: "flex", alignItems: "center" }}>
                              <MIcon name="apartment" size={20} />
                            </span>
                            <div style={{ ...inputBase, display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontWeight: 500 }}>{schoolName}</span>
                              <span style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "999px", background: "linear-gradient(135deg, rgba(179,197,255,0.55), rgba(194,232,255,0.55))", border: "1px solid rgba(255,255,255,0.6)", color: "#003fa4", fontWeight: 700, letterSpacing: "0.03em", flexShrink: 0 }}>
                                ✓ Verified
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Email */}
                      <div>
                        <label htmlFor="login-email" style={{ display: "block", fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", color: "#003fa4", marginBottom: "8px", marginLeft: "2px" }}>
                          Work Email
                        </label>
                        <div className="ta-input-wrap" style={inputWrapBase}>
                          <span className="ta-icon-left" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(0,102,255,0.65)", display: "flex", alignItems: "center" }}>
                            <MIcon name="mail" size={20} />
                          </span>
                          <input
                            id="login-email"
                            name="email"
                            style={inputBase}
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
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", marginLeft: "2px", marginRight: "2px" }}>
                          <label htmlFor="login-password" style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", color: "#003fa4" }}>
                            Password
                          </label>
                          <button
                            type="button"
                            className="ta-forgot-btn"
                            onClick={() => { setShowReset(true); setMessage(null); }}
                            style={{ fontSize: "12px", fontWeight: 600, color: "#0066ff", letterSpacing: "0.01em" }}
                          >
                            Forgot?
                          </button>
                        </div>
                        <div className="ta-input-wrap" style={inputWrapBase}>
                          <span className="ta-icon-left" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(0,102,255,0.65)", display: "flex", alignItems: "center" }}>
                            <MIcon name="lock" size={20} />
                          </span>
                          <input
                            id="login-password"
                            style={{ ...inputBase, paddingRight: "48px" }}
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
                            style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#727687", display: "flex", alignItems: "center", padding: "4px", transition: "color 0.15s" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#0050cb")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "#727687")}
                          >
                            <MIcon name={showPassword ? "visibility_off" : "visibility"} size={20} />
                          </button>
                        </div>
                      </div>

                      {/* Notice badge */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", background: "rgba(255,255,255,0.45)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.65)", backdropFilter: "blur(8px)" }}>
                        <MIcon name="info" size={17} style={{ color: "#555a5d", marginRight: "8px", flexShrink: 0 }} />
                        <p style={{ fontSize: "12px", color: "rgba(66,70,86,0.80)", margin: 0, letterSpacing: "0.02em" }}>
                          Admin-created accounts only · No public signup
                        </p>
                      </div>

                      {/* Sign In CTA */}
                      <button type="submit" className="ta-btn" disabled={busy}>
                        {busy
                          ? <><Loader2 size={17} className="ta-spin" /> Signing in…</>
                          : <><span>Sign In to AltRix</span><MIcon name="arrow_forward" size={20} /></>
                        }
                      </button>

                      {/* Super admin quick-access */}
                      {perms.isPlatformSuperAdmin && tenant.status === "ready" && (
                        <div style={{ padding: "12px 14px", borderRadius: "12px", background: "rgba(255,255,255,0.5)", border: "1px solid rgba(0,102,255,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#0050cb" }}>Platform Super Admin</p>
                            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#424656" }}>Quick access to bootstrap tools.</p>
                          </div>
                          <Button type="button" variant="soft" onClick={() => navigate(`/${tenant.slug}/bootstrap`)}>Bootstrap</Button>
                        </div>
                      )}
                    </form>
                  </>
                ) : (
                  /* ── RESET PASSWORD ── */
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px", position: "relative", zIndex: 1 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ display: "inline-flex", padding: "14px", borderRadius: "14px", background: "rgba(0,102,255,0.08)", marginBottom: "12px" }}>
                        <MIcon name="key" fill={1} size={28} style={{ color: "#0066ff" }} />
                      </div>
                      <h3 style={{ fontFamily: "'Manrope', sans-serif", margin: "0 0 6px", fontSize: "20px", fontWeight: 700, color: "#1a1c1e" }}>
                        Reset Password
                      </h3>
                      <p style={{ fontSize: "14px", color: "#424656", lineHeight: 1.6, margin: 0 }}>
                        Enter your email and we'll send a secure reset link.
                      </p>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", color: "#003fa4", marginBottom: "8px", marginLeft: "2px" }}>
                        Work Email
                      </label>
                      <div className="ta-input-wrap" style={inputWrapBase}>
                        <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "rgba(0,102,255,0.65)", display: "flex", alignItems: "center" }}>
                          <MIcon name="mail" size={20} />
                        </span>
                        <input
                          style={inputBase}
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
                      className="ta-btn"
                      disabled={busy || resetCooldown > 0}
                      onClick={() => { if (!busy && resetCooldown <= 0) void doForgotPassword(); }}
                    >
                      {busy
                        ? <><Loader2 size={17} className="ta-spin" /> Sending…</>
                        : resetCooldown > 0
                          ? `Resend in ${resetCooldown}s`
                          : "Send Reset Link"
                      }
                    </button>

                    <button
                      type="button"
                      className="ta-back-btn"
                      onClick={() => { setShowReset(false); setMessage(null); }}
                    >
                      ← Back to sign in
                    </button>
                  </div>
                )}

                {/* Feedback message */}
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      fontSize: "13px",
                      background: messageType === "success" ? "rgba(0,160,80,0.07)" : "rgba(186,26,26,0.06)",
                      border: `1px solid ${messageType === "success" ? "rgba(0,140,70,0.22)" : "rgba(186,26,26,0.18)"}`,
                      color: messageType === "success" ? "#007a40" : "#ba1a1a",
                      lineHeight: 1.55,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {message}
                  </motion.div>
                )}

                {tenant.status === "error" && (
                  <div style={{ marginTop: "12px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px", background: "rgba(186,26,26,0.06)", border: "1px solid rgba(186,26,26,0.18)", color: "#ba1a1a", lineHeight: 1.55 }}>
                    {tenant.error}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer style={{ width: "100%", background: "rgba(255,255,255,0.30)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTop: "1px solid rgba(255,255,255,0.55)", padding: "12px 24px", position: "relative", zIndex: 10 }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div className="ta-footer-logo" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/pwa-512.png" alt="AltRix" style={{ width: "24px", height: "24px", borderRadius: "6px" }} />
              <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: "16px", fontWeight: 700, color: "#1a1c1e" }}>AltRix</span>
            </div>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", justifyContent: "center" }}>
              {["Privacy Policy", "Terms of Service", "Compliance"].map((link) => (
                <a key={link} href="#" className="ta-footer-link">{link}</a>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "rgba(66,70,86,0.55)", margin: 0 }}>
              © 2025 AltRix School OS. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default TenantAuth;
