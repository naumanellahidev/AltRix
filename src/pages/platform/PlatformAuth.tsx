import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { MASTER_SUPER_ADMIN_EMAIL } from "@/hooks/usePlatformSuperAdmin";
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

export default function PlatformAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user, loading } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentEmails());
  const [activeTab, setActiveTab] = useState<"signin" | "reset">("signin");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _title = useMemo(() => "Platform Super Admin", []);

  // Prefill with most recent email on first mount
  useEffect(() => {
    if (!email && recentEmails.length > 0) setEmail(recentEmails[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle location state for access denied redirects
  const deniedState = location.state as { denied?: boolean; message?: string } | null;
  useEffect(() => {
    if (deniedState?.denied) {
      setMessage({ text: deniedState.message || "Access denied. Master Super Admin only.", type: "error" });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [deniedState, navigate, location.pathname]);

  useEffect(() => {
    if (loading) return;
    if (user) {
      const emailLower = user.email?.toLowerCase() ?? "";
      if (emailLower !== MASTER_SUPER_ADMIN_EMAIL.toLowerCase()) {
        (async () => {
          await supabase.auth.signOut();
          setMessage({ text: "Access denied. Master Super Admin only.", type: "error" });
        })();
      } else {
        navigate("/super_admin", { replace: true });
      }
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const tick = () => setResetCooldown(email.trim() ? getResetCooldownRemaining(email) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [email]);

  const doPasswordLogin = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) return setMessage({ text: "Please enter a valid email.", type: "error" });
    if (!parsedPassword.success) return setMessage({ text: "Password must be at least 8 characters.", type: "error" });

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: parsedEmail.data,
        password,
      });
      if (error) return setMessage({ text: error.message, type: "error" });
      if (parsedEmail.data.toLowerCase() !== MASTER_SUPER_ADMIN_EMAIL) {
        await supabase.auth.signOut();
        return setMessage({ text: "Access denied. Master Super Admin only.", type: "error" });
      }
      rememberRecentEmail(parsedEmail.data);
      setRecentEmails(getRecentEmails());
      navigate("/super_admin");
    } finally {
      setBusy(false);
    }
  };

  const doResetPassword = async () => {
    setMessage(null);
    const parsedEmail = emailSchema.safeParse(email.trim());
    if (!parsedEmail.success) return setMessage({ text: "Please enter your email first.", type: "error" });
    const cooldown = getResetCooldownRemaining(parsedEmail.data);
    if (cooldown > 0) {
      setResetCooldown(cooldown);
      return setMessage({ text: `Please wait ${cooldown}s before requesting another reset link.`, type: "error" });
    }

    setBusy(true);
    try {
      const result = await requestPasswordResetLink(parsedEmail.data, "/auth");
      if (!result.ok) return setMessage({ text: result.error || "Unable to send reset link. Please try again shortly.", type: "error" });
      const seconds = result.cooldownSeconds || 60;
      rememberResetEmail(parsedEmail.data);
      startResetCooldown(parsedEmail.data, seconds);
      setResetCooldown(seconds);
      const remaining = typeof result.remainingRequests === "number"
        ? ` You have ${result.remainingRequests} reset request${result.remainingRequests === 1 ? "" : "s"} left today.`
        : "";
      setMessage({ text: `Reset link sent to ${parsedEmail.data}. Check your inbox and spam folder.${remaining}`, type: "success" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, hsl(230,40%,4%) 0%, hsl(232,45%,6%) 50%, hsl(228,38%,5%) 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px", position: "relative", overflow: "hidden",
    }}>

      {/* Ambient glows — gold/amber for the super-admin authority feel */}
      <div style={{ position: "absolute", top: "-15%", left: "-8%", width: "700px", height: "700px", background: "radial-gradient(circle, hsl(45,95%,55%,0.06) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "600px", height: "600px", background: "radial-gradient(circle, hsl(35,90%,50%,0.05) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "50%", left: "55%", width: "400px", height: "400px", background: "radial-gradient(circle, hsl(45,80%,50%,0.03) 0%, transparent 65%)", pointerEvents: "none" }} />

      {/* Subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(hsl(0,0%,100%,0.015) 1px, transparent 1px), linear-gradient(90deg, hsl(0,0%,100%,0.015) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ textAlign: "center", marginBottom: "32px" }}
        >
          {/* Gold shield icon */}
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "56px", height: "56px", borderRadius: "16px", marginBottom: "16px",
            background: "linear-gradient(135deg, hsl(45,95%,52%), hsl(38,90%,45%))",
            boxShadow: "0 8px 32px -8px hsl(45,95%,55%,0.55), 0 1px 0 hsl(0,0%,100%,0.15) inset",
          }}>
            <ShieldCheck style={{ width: "26px", height: "26px", color: "hsl(230,40%,10%)" }} />
          </div>

          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "hsl(210,30%,96%)", letterSpacing: "-0.02em" }}>
            Platform Super Admin
          </h1>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "hsl(220,12%,48%)", letterSpacing: "0.01em" }}>
            Restricted access · Master credentials only
          </p>

          {/* Authority badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "12px", padding: "5px 12px", borderRadius: "999px", background: "hsl(45,80%,15%,0.35)", border: "1px solid hsl(45,80%,35%,0.3)" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "hsl(45,95%,58%)", boxShadow: "0 0 6px hsl(45,95%,58%,0.8)" }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "hsl(45,90%,60%)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
              AltRix Command Centre
            </span>
          </div>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <div style={{
            background: "linear-gradient(180deg, hsl(230,35%,9%) 0%, hsl(232,38%,8%) 100%)",
            border: "1px solid hsl(230,28%,17%)",
            borderRadius: "20px",
            boxShadow: "0 28px 80px -24px hsl(0,0%,0%,0.7), 0 1px 0 hsl(0,0%,100%,0.04) inset",
            overflow: "hidden",
          }}>

            {/* Tab strip — gold accent for active */}
            <div style={{ display: "flex", borderBottom: "1px solid hsl(230,28%,13%)" }}>
              {(["signin", "reset"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setMessage(null); }}
                  style={{
                    flex: 1, padding: "16px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer",
                    background: activeTab === tab ? "hsl(230,35%,11%)" : "transparent",
                    color: activeTab === tab ? "hsl(45,95%,62%)" : "hsl(220,12%,45%)",
                    borderBottom: activeTab === tab ? "2px solid hsl(45,95%,55%)" : "2px solid transparent",
                    marginBottom: "-1px", transition: "all 0.2s ease",
                    letterSpacing: "0.07em", textTransform: "uppercase" as const,
                  }}
                >
                  {tab === "signin" ? "Sign In" : "Reset Password"}
                </button>
              ))}
            </div>

            <div style={{ padding: "28px" }}>

              {activeTab === "signin" ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); if (!busy) void doPasswordLogin(); }}
                  style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                >
                  {/* Email */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "hsl(220,12%,52%)", marginBottom: "8px", letterSpacing: "0.10em", textTransform: "uppercase" as const }}>
                      Admin Email
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@altrix.io"
                      type="email"
                      autoComplete="username"
                      inputMode="email"
                      list="saved-emails"
                      style={{
                        width: "100%", padding: "12px 14px", fontSize: "14px", borderRadius: "10px",
                        background: "hsl(230,35%,6%)", border: "1px solid hsl(230,28%,18%)",
                        color: "hsl(210,30%,96%)", outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "hsl(45,95%,50%,0.5)"; e.target.style.boxShadow = "0 0 0 3px hsl(45,95%,50%,0.10)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "hsl(230,28%,18%)"; e.target.style.boxShadow = "none"; }}
                    />
                    {recentEmails.length > 0 && (
                      <datalist id="saved-emails">
                        {recentEmails.map((e) => <option key={e} value={e} />)}
                      </datalist>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "hsl(220,12%,52%)", marginBottom: "8px", letterSpacing: "0.10em", textTransform: "uppercase" as const }}>
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
                          background: "hsl(230,35%,6%)", border: "1px solid hsl(230,28%,18%)",
                          color: "hsl(210,30%,96%)", outline: "none", boxSizing: "border-box",
                          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                        }}
                        onFocus={(e) => { e.target.style.borderColor = "hsl(45,95%,50%,0.5)"; e.target.style.boxShadow = "0 0 0 3px hsl(45,95%,50%,0.10)"; }}
                        onBlur={(e) => { e.target.style.borderColor = "hsl(230,28%,18%)"; e.target.style.boxShadow = "none"; }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "hsl(220,12%,40%)", padding: "4px", display: "flex", alignItems: "center",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(45,80%,65%)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220,12%,40%)")}
                      >
                        {showPassword ? <EyeOff style={{ width: "16px", height: "16px" }} /> : <Eye style={{ width: "16px", height: "16px" }} />}
                      </button>
                    </div>
                  </div>

                  {/* Sign in button — gold gradient */}
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      width: "100%", padding: "13px", fontSize: "14px", fontWeight: 700,
                      borderRadius: "10px", border: "none",
                      cursor: busy ? "not-allowed" : "pointer",
                      background: busy
                        ? "hsl(45,40%,20%)"
                        : "linear-gradient(135deg, hsl(45,95%,56%), hsl(38,90%,48%))",
                      color: busy ? "hsl(220,12%,40%)" : "hsl(230,40%,8%)",
                      letterSpacing: "0.02em",
                      boxShadow: busy ? "none" : "0 8px 28px -8px hsl(45,95%,55%,0.50)",
                      transition: "all 0.2s ease",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                    onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 14px 32px -8px hsl(45,95%,55%,0.65)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = busy ? "none" : "0 8px 28px -8px hsl(45,95%,55%,0.50)"; }}
                  >
                    {busy
                      ? <><Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> Authenticating…</>
                      : <><Lock style={{ width: "15px", height: "15px" }} /> Authenticate</>
                    }
                  </button>

                  {/* Forgot / reset shortcut */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                      type="button"
                      onClick={() => { setActiveTab("reset"); setMessage(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "hsl(45,80%,52%)", fontWeight: 500, padding: 0, transition: "color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(45,95%,65%)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(45,80%,52%)")}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/auth/recover-master")}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "hsl(220,12%,40%)", padding: 0, transition: "color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(220,12%,65%)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220,12%,40%)")}
                    >
                      Recover master admin →
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ textAlign: "center", marginBottom: "4px" }}>
                    <div style={{ display: "inline-flex", padding: "13px", borderRadius: "14px", background: "hsl(45,60%,14%,0.5)", marginBottom: "12px", border: "1px solid hsl(45,80%,30%,0.2)" }}>
                      <KeyRound style={{ width: "22px", height: "22px", color: "hsl(45,95%,60%)" }} />
                    </div>
                    <p style={{ margin: 0, fontSize: "14px", color: "hsl(220,12%,55%)", lineHeight: 1.6 }}>
                      Enter your admin email and we'll send a secure reset link.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "hsl(220,12%,52%)", marginBottom: "8px", letterSpacing: "0.10em", textTransform: "uppercase" as const }}>
                      Admin Email
                    </label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@altrix.io"
                      type="email"
                      autoComplete="email"
                      style={{
                        width: "100%", padding: "12px 14px", fontSize: "14px", borderRadius: "10px",
                        background: "hsl(230,35%,6%)", border: "1px solid hsl(230,28%,18%)",
                        color: "hsl(210,30%,96%)", outline: "none", boxSizing: "border-box",
                        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      }}
                      onFocus={(e) => { e.target.style.borderColor = "hsl(45,95%,50%,0.5)"; e.target.style.boxShadow = "0 0 0 3px hsl(45,95%,50%,0.10)"; }}
                      onBlur={(e) => { e.target.style.borderColor = "hsl(230,28%,18%)"; e.target.style.boxShadow = "none"; }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy || resetCooldown > 0}
                    onClick={() => { if (!busy && resetCooldown <= 0) void doResetPassword(); }}
                    style={{
                      width: "100%", padding: "13px", fontSize: "14px", fontWeight: 700,
                      borderRadius: "10px", border: "1px solid hsl(45,80%,38%,0.35)",
                      cursor: (busy || resetCooldown > 0) ? "not-allowed" : "pointer",
                      background: (busy || resetCooldown > 0) ? "hsl(230,35%,10%)" : "hsl(45,80%,14%,0.4)",
                      color: (busy || resetCooldown > 0) ? "hsl(220,12%,38%)" : "hsl(45,95%,62%)",
                      transition: "all 0.2s ease",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                  >
                    {resetCooldown > 0
                      ? `Resend available in ${resetCooldown}s`
                      : busy
                        ? <><Loader2 style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }} /> Sending…</>
                        : "Send Reset Link"
                    }
                  </button>

                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => { setActiveTab("signin"); setMessage(null); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "hsl(220,12%,45%)", padding: 0, transition: "color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(210,30%,75%)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(220,12%,45%)")}
                    >
                      ← Back to sign in
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback messages */}
              {message && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: "16px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px",
                    background: message.type === "error" ? "hsl(0,60%,15%,0.5)" : "hsl(152,60%,10%,0.5)",
                    border: `1px solid ${message.type === "error" ? "hsl(0,60%,28%,0.4)" : "hsl(152,60%,22%,0.4)"}`,
                    color: message.type === "error" ? "hsl(0,80%,68%)" : "hsl(152,80%,56%)",
                    lineHeight: 1.5,
                  }}
                >
                  {message.text}
                </motion.div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "hsl(220,12%,30%)", lineHeight: 1.6 }}>
            <ShieldCheck style={{ width: "12px", height: "12px", display: "inline", marginRight: "5px", verticalAlign: "middle", color: "hsl(45,80%,40%)" }} />
            This portal is restricted to the master administrator only.
            <br />Unauthorized access attempts are logged.
          </p>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: hsl(220,12%,35%) !important; }
      `}</style>
    </div>
  );
}
