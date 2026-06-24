import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Building2, Eye, EyeOff, KeyRound, Loader2, Lock, Shield } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useSchoolPermissions } from "@/hooks/useSchoolPermissions";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
import { type EduverseRole } from "@/lib/eduverse-roles";
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

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

// Highest priority first. The first matching role wins for default redirect.
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
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());
  const [activeTab, setActiveTab] = useState<"signin" | "reset">("signin");

  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = useMemo(() => {
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
      setMessage({ text: "Your account is not a member of this school.", type: "error" });
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
      setMessage({ text: "No role assigned to your account for this school. Contact an administrator.", type: "error" });
      await supabase.auth.signOut();
      return;
    }

    navigate(`/${tenant.slug}/${roleToPathSegment(destRole)}`);
  };

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) return setMessage({ text: "Please enter a valid email.", type: "error" });
    if (!parsedPassword.success) return setMessage({ text: "Password must be at least 8 characters.", type: "error" });

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });
      if (error) {
        setMessage({ text: error.message, type: "error" });
        return;
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      if (data.user) await routeUserAfterLogin(data.user.id);
    } finally {
      setBusy(false);
    }
  };

  const doForgotPassword = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) return setMessage({ text: "Enter your email above, then try again.", type: "error" });
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setResetCooldown(cooldown);
      return setMessage({ text: `Please wait ${cooldown}s before requesting another reset link.`, type: "error" });
    }
    setBusy(true);
    try {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      const result = await requestPasswordResetLink(parsedEmail.data, returnTo);
      if (!result.ok) return setMessage({ text: result.error || "Unable to send reset link. Please try again shortly.", type: "error" });
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsedEmail.data);
      startResetCooldown(parsedEmail.data, seconds);
      setResetCooldown(seconds);
      const remaining = typeof result.remainingRequests === "number" ? ` You have ${result.remainingRequests} reset request${result.remainingRequests === 1 ? "" : "s"} left today.` : "";
      setMessage({ text: `Reset link sent to ${parsedEmail.data}. Check your inbox and spam folder.${remaining}`, type: "success" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, hsl(224,35%,5%) 0%, hsl(226,40%,8%) 40%, hsl(228,35%,6%) 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", overflow: "hidden" }}>

      {/* Ambient background glows */}
      <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "600px", height: "600px", background: "radial-gradient(circle, hsl(210,100%,50%,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: "500px", height: "500px", background: "radial-gradient(circle, hsl(250,80%,60%,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "40%", left: "60%", width: "300px", height: "300px", background: "radial-gradient(circle, hsl(200,100%,50%,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(hsl(0,0%,100%,0.02) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%,0.02) 1px, transparent 1px)",
        backgroundSize: "60px 60px"
      }} />

      <div style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 1 }}>

        {/* Logo & School name */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ textAlign: "center", marginBottom: "32px" }}
        >
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "52px", height: "52px", borderRadius: "14px", marginBottom: "16px",
            background: "linear-gradient(135deg, hsl(210,100%,50%), hsl(225,100%,55%))",
            boxShadow: "0 8px 32px -8px hsl(210,100%,50%,0.5)",
          }}>
            <Building2 style={{ width: "24px", height: "24px", color: "white" }} />
          </div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "hsl(210,40%,98%)", letterSpacing: "-0.02em" }}>{title}</h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "hsl(220,15%,55%)", letterSpacing: "0.01em" }}>
            Secure access portal · <span style={{ color: "hsl(210,100%,65%)", fontWeight: 500 }}>/{tenant.slug}</span>
          </p>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div style={{
            background: "linear-gradient(180deg, hsl(224,30%,10%) 0%, hsl(226,35%,9%) 100%)",
            border: "1px solid hsl(224,25%,18%)",
            borderRadius: "20px",
            boxShadow: "0 24px 80px -24px hsl(0,0%,0%,0.6), 0 1px 0 hsl(0,0%,100%,0.04) inset",
            overflow: "hidden",
          }}>
            {/* Tab switcher */}
            <div style={{ display: "flex", borderBottom: "1px solid hsl(224,25%,14%)" }}>
              {(["signin", "reset"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setMessage(null); }}
                  style={{
                    flex: 1, padding: "16px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer",
                    background: activeTab === tab ? "hsl(224,30%,13%)" : "transparent",
                    color: activeTab === tab ? "hsl(210,40%,98%)" : "hsl(220,15%,50%)",
                    borderBottom: activeTab === tab ? "2px solid hsl(210,100%,55%)" : "2px solid transparent",
                    marginBottom: "-1px", transition: "all 0.2s ease",
                    letterSpacing: "0.03em", textTransform: "uppercase" as const,
                  }}
                >
                  {tab === "signin" ? "Sign In" : "Reset Password"}
                </button>
              ))}
            </div>

            <div style={{ padding: "28px" }}>

              {activeTab === "signin" ? (
                <form onSubmit={(e) => { e.preventDefault(); if (!busy) void doPasswordLogin(); }} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                  {/* Email field */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "hsl(220,15%,60%)", marginBottom: "8px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                      Email Address
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@school.com"
                      type="email"
                      autoComplete="username"
                      inputMode="email"
                      list="saved-emails"
                      style={{
                        width: "100%", padding: "12px 14px", fontSize: "14px", borderRadius: "10px",
                        background: "hsl(224,30%,7%)", border: "1px solid hsl(224,25%,20%)",
                        color: "hsl(210,40%,96%)", outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "hsl(210,100%,50%,0.6)"; e.target.style.boxShadow = "0 0 0 3px hsl(210,100%,50%,0.12)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "hsl(224,25%,20%)"; e.target.style.boxShadow = "none"; }}
                    />
                    {recentEmails.length > 0 && (
                      <datalist id="saved-emails">
                        {recentEmails.map((e) => <option key={e} value={e} />)}
                      </datalist>
                    )}
                  </div>

                  {/* Password field */}
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "hsl(220,15%,60%)", marginBottom: "8px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                      Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="login-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        style={{
                          width: "100%", padding: "12px 44px 12px 14px", fontSize: "14px", borderRadius: "10px",
                          background: "hsl(224,30%,7%)", border: "1px solid hsl(224,25%,20%)",
                          color: "hsl(210,40%,96%)", outline: "none", boxSizing: "border-box",
                          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "hsl(210,100%,50%,0.6)"; e.target.style.boxShadow = "0 0 0 3px hsl(210,100%,50%,0.12)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "hsl(224,25%,20%)"; e.target.style.boxShadow = "none"; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "hsl(220,15%,45%)", padding: "4px", display: "flex", alignItems: "center",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(210,40%,80%)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220,15%,45%)")}
                      >
                        {showPassword ? <EyeOff style={{ width: "16px", height: "16px" }} /> : <Eye style={{ width: "16px", height: "16px" }} />}
                      </button>
                    </div>
                  </div>

                  {/* Sign in button */}
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      width: "100%", padding: "13px", fontSize: "14px", fontWeight: 700,
                      borderRadius: "10px", border: "none", cursor: busy ? "not-allowed" : "pointer",
                      background: busy ? "hsl(210,60%,30%)" : "linear-gradient(135deg, hsl(210,100%,52%), hsl(220,100%,48%))",
                      color: "white", letterSpacing: "0.02em",
                      boxShadow: busy ? "none" : "0 8px 24px -8px hsl(210,100%,50%,0.5)",
                      transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                    onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 12px 28px -8px hsl(210,100%,50%,0.65)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = busy ? "none" : "0 8px 24px -8px hsl(210,100%,50%,0.5)"; }}
                  >
                    {busy ? (
                      <><Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> Authenticating…</>
                    ) : (
                      <><Lock style={{ width: "15px", height: "15px" }} /> Sign In Securely</>
                    )}
                  </button>

                  {/* Forgot password link */}
                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab("reset")}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "hsl(210,100%,60%)", fontWeight: 500, padding: 0, transition: "color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(210,100%,72%)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(210,100%,60%)")}
                    >
                      Forgot your password?
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ textAlign: "center", marginBottom: "4px" }}>
                    <div style={{ display: "inline-flex", padding: "12px", borderRadius: "12px", background: "hsl(210,60%,20%,0.4)", marginBottom: "12px" }}>
                      <KeyRound style={{ width: "22px", height: "22px", color: "hsl(210,100%,65%)" }} />
                    </div>
                    <p style={{ margin: 0, fontSize: "14px", color: "hsl(220,15%,60%)", lineHeight: 1.5 }}>
                      Enter your email and we'll send a secure link to reset your password.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "hsl(220,15%,60%)", marginBottom: "8px", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                      Email Address
                    </label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@school.com"
                      type="email"
                      autoComplete="email"
                      style={{
                        width: "100%", padding: "12px 14px", fontSize: "14px", borderRadius: "10px",
                        background: "hsl(224,30%,7%)", border: "1px solid hsl(224,25%,20%)",
                        color: "hsl(210,40%,96%)", outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "hsl(210,100%,50%,0.6)"; e.target.style.boxShadow = "0 0 0 3px hsl(210,100%,50%,0.12)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "hsl(224,25%,20%)"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy || resetCooldown > 0}
                    onClick={() => { if (!busy && resetCooldown <= 0) void doForgotPassword(); }}
                    style={{
                      width: "100%", padding: "13px", fontSize: "14px", fontWeight: 700,
                      borderRadius: "10px", border: "1px solid hsl(210,80%,40%,0.4)",
                      cursor: (busy || resetCooldown > 0) ? "not-allowed" : "pointer",
                      background: (busy || resetCooldown > 0) ? "hsl(224,30%,11%)" : "hsl(210,80%,18%,0.5)",
                      color: (busy || resetCooldown > 0) ? "hsl(220,15%,40%)" : "hsl(210,100%,68%)",
                      transition: "all 0.2s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                  >
                    {resetCooldown > 0 ? `Resend available in ${resetCooldown}s` : busy ? <><Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> Sending…</> : "Send Reset Link"}
                  </button>

                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab("signin")}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "hsl(220,15%,50%)", padding: 0, transition: "color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(210,40%,80%)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220,15%,50%)")}
                    >
                      ← Back to sign in
                    </button>
                  </div>
                </div>
              )}

              {/* Messages */}
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: "16px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px",
                    background: message.type === "error" ? "hsl(0,60%,18%,0.5)" : "hsl(152,60%,12%,0.5)",
                    border: `1px solid ${message.type === "error" ? "hsl(0,60%,30%,0.4)" : "hsl(152,60%,25%,0.4)"}`,
                    color: message.type === "error" ? "hsl(0,80%,70%)" : "hsl(152,80%,60%)",
                    lineHeight: 1.5,
                  }}
                >
                  {message.text}
                </motion.div>
              )}

              {tenant.status === "error" && (
                <div style={{
                  marginTop: "16px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px",
                  background: "hsl(0,60%,18%,0.5)", border: "1px solid hsl(0,60%,30%,0.4)",
                  color: "hsl(0,80%,70%)", lineHeight: 1.5,
                }}>
                  {tenant.error}
                </div>
              )}

              {/* Platform super admin quick access */}
              {perms.isPlatformSuperAdmin && tenant.status === "ready" && (
                <div style={{
                  marginTop: "20px", padding: "14px", borderRadius: "12px",
                  background: "hsl(45,80%,15%,0.3)", border: "1px solid hsl(45,80%,40%,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "hsl(45,95%,65%)" }}>Platform Super Admin</p>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "hsl(45,60%,50%)" }}>Quick access to bootstrap tools</p>
                  </div>
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => navigate(`/${tenant.slug}/bootstrap`)}
                  >
                    Bootstrap
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "hsl(220,15%,35%)" }}>
            <Shield style={{ width: "12px", height: "12px", display: "inline", marginRight: "5px", verticalAlign: "middle" }} />
            Accounts are created by administrators only. No public signup.
          </p>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: hsl(220,15%,38%) !important; }
      `}</style>
    </div>
  );
};

export default TenantAuth;
