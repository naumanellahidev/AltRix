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

  /* ── inline styles (scoped to auth page only) ── */
  const iWrap: React.CSSProperties = {
    position: "relative", borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.85)",
    background: "rgba(255,255,255,0.60)",
    overflow: "hidden", backdropFilter: "blur(8px)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
    transition: "box-shadow .25s,border-color .25s,background .25s",
  };
  const iBase: React.CSSProperties = {
    width: "100%", padding: "13px 14px 13px 44px",
    background: "transparent", border: "none", outline: "none",
    fontFamily: "'Hanken Grotesk',sans-serif", fontSize: "15px",
    color: "#1a1c1e", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    display: "block", fontSize: "11px", fontWeight: 700,
    letterSpacing: "0.07em", textTransform: "uppercase",
    color: "#003fa4", marginBottom: "7px",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap');
        .idx-iw:focus-within{box-shadow:0 0 0 4px rgba(0,102,255,.14),0 4px 18px -5px rgba(0,102,255,.10)!important;border-color:#0066ff!important;background:rgba(255,255,255,.96)!important;transform:scale(1.005);}
        .idx-iw:focus-within .idx-ico{color:#0066ff!important;}
        .idx-ico{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:rgba(0,102,255,.6);display:flex;align-items:center;transition:color .2s;}
        .idx-btn{width:100%;padding:14px;border-radius:12px;border:none;cursor:pointer;background:linear-gradient(135deg,#0050cb,#00a3ff);box-shadow:0 8px 24px -5px rgba(0,102,255,.4);color:#fff;font-family:'Manrope',sans-serif;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;position:relative;z-index:1;overflow:hidden;transition:transform .3s cubic-bezier(.16,1,.3,1),box-shadow .3s;}
        .idx-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,#003fa4,#0066ff);z-index:-1;opacity:0;transition:opacity .3s ease;}
        .idx-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px -5px rgba(0,102,255,.52);}
        .idx-btn:hover:not(:disabled)::before{opacity:1;}
        .idx-btn:disabled{opacity:.6;cursor:not-allowed;}
        .idx-bento{padding:20px;border-radius:12px;background:rgba(255,255,255,.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.85);box-shadow:0 8px 30px -8px rgba(0,102,255,.08);position:relative;overflow:hidden;transition:box-shadow .3s,transform .3s,border-color .3s;cursor:default;}
        .idx-bento:hover{box-shadow:0 16px 48px -10px rgba(0,102,255,.18);transform:translateY(-3px);border-color:rgba(255,255,255,1);}
        .idx-bento-ico{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;transition:transform .3s;}
        .idx-bento:hover .idx-bento-ico{transform:scale(1.1);}
        .idx-ghost{background:none;border:none;cursor:pointer;padding:0;font-family:'Hanken Grotesk',sans-serif;transition:color .15s;}
        .idx-ghost:hover{text-decoration:underline;}
        .material-symbols-outlined{font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24;user-select:none;line-height:1;}
        @keyframes idx-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .idx-spin{animation:idx-spin 1s linear infinite;}
        input::placeholder{color:rgba(114,118,135,.4)!important;}
      `}</style>

      <div style={{fontFamily:"'Hanken Grotesk',sans-serif",minHeight:"100vh",display:"flex",flexDirection:"column",background:"linear-gradient(145deg,#f0f6ff 0%,#e0edff 50%,#cce0ff 100%)",position:"relative",overflowX:"hidden"}}>

        {/* Orbs */}
        <div style={{position:"fixed",top:"-10%",left:"-10%",width:"40%",height:"40%",borderRadius:"9999px",background:"rgba(147,197,253,.28)",filter:"blur(100px)",pointerEvents:"none",zIndex:0}}/>
        <div style={{position:"fixed",bottom:"-10%",right:"-5%",width:"50%",height:"50%",borderRadius:"9999px",background:"rgba(165,243,252,.18)",filter:"blur(120px)",pointerEvents:"none",zIndex:0}}/>

        {/* HEADER */}
        <header style={{width:"100%",padding:"18px 24px 14px",display:"flex",flexDirection:"column",alignItems:"center",position:"relative",zIndex:10}}>
          <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
            <img src="/pwa-512.png" alt="AltRix" style={{width:"44px",height:"44px",borderRadius:"12px",boxShadow:"0 4px 14px rgba(0,80,203,.22)"}}/>
            <span style={{fontFamily:"'Manrope',sans-serif",fontSize:"clamp(28px,5vw,40px)",fontWeight:800,letterSpacing:"-0.02em",lineHeight:1,background:"linear-gradient(135deg,#0050cb,#00a3ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>AltRix</span>
          </div>
          <p style={{marginTop:"5px",fontSize:"11px",fontWeight:600,color:"#424656",letterSpacing:"0.18em",textTransform:"uppercase",opacity:.8}}>School Operating System</p>
        </header>

        {/* MAIN */}
        <main style={{flex:1,width:"100%",maxWidth:"1280px",margin:"0 auto",padding:"4px 24px 60px",position:"relative",zIndex:10}}>
          <div style={{display:"flex",flexDirection:"row",alignItems:"flex-start",gap:"40px",flexWrap:"wrap"}}>

            {/* LEFT: value prop + bento */}
            <motion.div initial={reduce?false:{opacity:0,x:-16}} animate={reduce?undefined:{opacity:1,x:0}} transition={{duration:.6,ease:[.2,.8,.2,1]}} style={{flex:1,minWidth:"280px",display:"flex",flexDirection:"column",gap:"16px"}}>
              <div>
                <h2 style={{fontFamily:"'Manrope',sans-serif",fontSize:"clamp(22px,3.2vw,34px)",fontWeight:700,lineHeight:1.22,letterSpacing:"-0.01em",margin:"0 0 12px",color:"hsl(var(--primary))"}}>
                  Empowering education through intelligent operations
                </h2>
                <p style={{fontSize:"16px",color:"#424656",lineHeight:1.7,maxWidth:"480px",margin:0}}>
                  AltRix provides the infrastructure for modern schools to manage performance, security, and communication in one unified platform.
                </p>
              </div>

              {/* Bento */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"14px"}}>
                {[
                  {icon:"auto_awesome",fill:1,ic:"#0050cb",bg:"rgba(0,80,203,.08)",bd:"rgba(0,80,203,.10)",label:"AI Insights",desc:"Predictive student performance analytics and trend spotting."},
                  {icon:"shield_with_heart",fill:1,ic:"#006688",bg:"rgba(0,102,136,.08)",bd:"rgba(0,102,136,.10)",label:"Secure Vault",desc:"Military-grade data encryption and privacy compliance."},
                  {icon:"analytics",fill:1,ic:"#555a5d",bg:"rgba(109,114,118,.10)",bd:"rgba(109,114,118,.10)",label:"Real-time Audit",desc:"Live transparent audit logs for staff and administrators."},
                  {icon:"hub",fill:1,ic:"#0088aa",bg:"rgba(0,193,253,.12)",bd:"rgba(0,193,253,.15)",label:"Universal Hub",desc:"Unified school-parent communication and collaboration."},
                ].map(({icon,fill,ic,bg,bd,label,desc})=>(
                  <div key={label} className="idx-bento">
                    <div className="idx-bento-ico" style={{background:bg,border:`1px solid ${bd}`}}>
                      <span className="material-symbols-outlined" style={{fontSize:"22px",color:ic,fontVariationSettings:`'FILL' ${fill},'wght' 400,'GRAD' 0,'opsz' 24`}}>{icon}</span>
                    </div>
                    <p style={{fontSize:"12px",fontWeight:700,letterSpacing:"0.05em",color:"#0050cb",margin:"0 0 5px"}}>{label}</p>
                    <p style={{fontSize:"13px",color:"#424656",lineHeight:1.55,margin:0}}>{desc}</p>
                  </div>
                ))}
              </div>

              <p style={{fontSize:"13px",color:"#424656",margin:0}}>
                Need a school account?{" "}
                <a href="mailto:sales@altrix.io" style={{color:"#0066ff",fontWeight:600,textDecoration:"none"}} onMouseEnter={e=>(e.currentTarget.style.textDecoration="underline")} onMouseLeave={e=>(e.currentTarget.style.textDecoration="none")}>Contact Sales</a>
              </p>
            </motion.div>

            {/* RIGHT: sign-in card */}
            <motion.div initial={reduce?false:{opacity:0,y:18}} animate={reduce?undefined:{opacity:1,y:0}} transition={{duration:.55,delay:.06,ease:[.2,.8,.2,1]}} style={{width:"100%",maxWidth:"415px",flexShrink:0}}>
              <div style={{background:"rgba(255,255,255,.72)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,.88)",borderTop:"1px solid rgba(255,255,255,.96)",borderRadius:"20px",padding:"28px",position:"relative",overflow:"hidden",boxShadow:"0 20px 60px -15px rgba(0,102,255,.16),0 1px 0 rgba(255,255,255,.8) inset"}}>
                {/* Corner deco */}
                <div style={{position:"absolute",top:0,right:0,width:"120px",height:"120px",background:"linear-gradient(225deg,rgba(0,193,253,.16),transparent)",borderBottomLeftRadius:"100%",pointerEvents:"none"}}/>

                {/* Card header */}
                {authMode==='login' && (
                  <div style={{marginBottom:"20px",position:"relative",zIndex:1}}>
                    <h2 style={{fontFamily:"'Manrope',sans-serif",fontSize:"clamp(20px,2.5vw,26px)",fontWeight:700,margin:"0 0 4px",color:"hsl(var(--primary))"}}>Welcome Back</h2>
                    <p style={{fontSize:"14px",color:"#424656",margin:0}}>Enter your school code and credentials.</p>
                  </div>
                )}

                {/* ── LOGIN MODE ── */}
                {authMode==='login' && (
                  <form onSubmit={e=>{e.preventDefault();if(!busy)void doLogin();}} style={{display:"flex",flexDirection:"column",gap:"16px",position:"relative",zIndex:1}}>

                    {/* School code */}
                    <div>
                      <label style={lbl}>School Code</label>
                      <div className="idx-iw" style={iWrap}>
                        <span className="idx-ico"><span className="material-symbols-outlined" style={{fontSize:"19px"}}>apartment</span></span>
                        <input style={{...iBase,paddingRight:"90px"}} value={schoolSlug} onChange={e=>setSchoolSlug(e.target.value)} placeholder="e.g. beacon" autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
                        {/* status badge */}
                        {safeSlug && (
                          <div style={{position:"absolute",right:"8px",top:"50%",transform:"translateY(-50%)",display:"flex",alignItems:"center",gap:"4px",padding:"4px 10px",borderRadius:"999px",background:"linear-gradient(135deg,rgba(179,197,255,.55),rgba(194,232,255,.55))",border:"1px solid rgba(255,255,255,.65)",fontSize:"11px",fontWeight:700,color:"#003fa4",letterSpacing:"0.03em",pointerEvents:"none"}}>
                            {tenant.status==="loading" ? <Loader2 size={11} className="idx-spin"/> : tenant.status==="ready" ? "✓ Verified" : tenant.status==="error" ? "✗ Not found" : null}
                          </div>
                        )}
                      </div>
                      {tenantBadge && tenant.status==="ready" && (
                        <p style={{fontSize:"12px",color:"#0050cb",marginTop:"5px",display:"flex",alignItems:"center",gap:"4px"}}>
                          <CheckCircle2 size={12}/> Verified: {tenantBadge.label}
                        </p>
                      )}
                      {tenant.status==="error" && safeSlug && (
                        <p style={{fontSize:"12px",color:"#ba1a1a",marginTop:"5px",display:"flex",alignItems:"center",gap:"4px"}}>
                          <AlertCircle size={12}/> School not found
                        </p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="login-email" style={lbl}>Work Email</label>
                      <div className="idx-iw" style={iWrap}>
                        <span className="idx-ico"><span className="material-symbols-outlined" style={{fontSize:"19px"}}>mail</span></span>
                        <input id="login-email" name="email" ref={emailInputRef} style={iBase} value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@school.edu" type="email" autoComplete="username" inputMode="email" list="saved-emails"/>
                      </div>
                      {recentEmails.length>0 && <datalist id="saved-emails">{recentEmails.map(e=><option key={e} value={e}/>)}</datalist>}
                    </div>

                    {/* Password */}
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"7px"}}>
                        <label htmlFor="login-password" style={{...lbl,margin:0}}>Password</label>
                        <button type="button" className="idx-ghost" onClick={()=>{setMessage(null);setAuthMode('forgot_password');}} style={{fontSize:"12px",fontWeight:600,color:"#0066ff"}}>Forgot?</button>
                      </div>
                      <div className="idx-iw" style={iWrap}>
                        <span className="idx-ico"><span className="material-symbols-outlined" style={{fontSize:"19px"}}>lock</span></span>
                        <input id="login-password" style={{...iBase,paddingRight:"44px"}} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type={showPassword ? "text" : "password"} autoComplete="current-password"/>
                        <button type="button" onClick={() => setShowPassword(!showPassword)} style={{position:"absolute",right:"13px",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"rgba(0,102,255,0.6)",display:"flex",alignItems:"center",padding:0}}>
                          <span className="material-symbols-outlined" style={{fontSize:"20px"}}>
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Notice */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 12px",background:"rgba(255,255,255,.45)",borderRadius:"12px",border:"1px solid rgba(255,255,255,.65)",backdropFilter:"blur(8px)"}}>
                      <span className="material-symbols-outlined" style={{fontSize:"17px",color:"#555a5d",marginRight:"7px",flexShrink:0}}>info</span>
                      <p style={{fontSize:"12px",color:"rgba(66,70,86,.8)",margin:0,letterSpacing:"0.02em"}}>Admin-created accounts only · No public signup</p>
                    </div>

                    {/* CTA */}
                    <button type="submit" className="idx-btn" disabled={busy||tenant.status!=="ready"}>
                      {busy ? <><Loader2 size={17} className="idx-spin"/> Signing in…</> : tenant.status==="loading"&&safeSlug ? <><Loader2 size={17} className="idx-spin"/> Verifying school…</> : tenant.status==="error" ? "Invalid school code" : !safeSlug ? "Enter school code" : <>Sign in to AltRix <span className="material-symbols-outlined" style={{fontSize:"20px"}}>arrow_forward</span></>}
                    </button>
                  </form>
                )}

                {/* ── FORGOT PASSWORD MODE ── */}
                {authMode==='forgot_password' && (
                  <form onSubmit={e=>{e.preventDefault();if(!busy)void handleSendForgotPasswordOtp();}} style={{display:"flex",flexDirection:"column",gap:"16px",position:"relative",zIndex:1}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{display:"inline-flex",padding:"13px",borderRadius:"14px",background:"rgba(0,102,255,.08)",marginBottom:"12px"}}>
                        <span className="material-symbols-outlined" style={{fontSize:"26px",color:"#0066ff",fontVariationSettings:"'FILL' 1"}}>key</span>
                      </div>
                      <h3 style={{fontFamily:"'Manrope',sans-serif",margin:"0 0 6px",fontSize:"20px",fontWeight:700,color:"#1a1c1e"}}>Reset Password</h3>
                      <p style={{fontSize:"14px",color:"#424656",margin:0,lineHeight:1.6}}>We'll send a 6-digit code to reset your password.</p>
                    </div>
                    <div>
                      <label style={lbl}>Work Email</label>
                      <div className="idx-iw" style={iWrap}>
                        <span className="idx-ico"><span className="material-symbols-outlined" style={{fontSize:"19px"}}>mail</span></span>
                        <input style={iBase} value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@school.edu" type="email" autoComplete="email" inputMode="email"/>
                      </div>
                    </div>
                    <button type="submit" className="idx-btn" disabled={busy}>
                      {busy ? <><Loader2 size={17} className="idx-spin"/> Sending…</> : <>Send Verification Code <span className="material-symbols-outlined" style={{fontSize:"20px"}}>arrow_forward</span></>}
                    </button>
                    <button type="button" className="idx-ghost" onClick={()=>{setMessage(null);setAuthMode('login');}} style={{fontSize:"14px",color:"#727687",textAlign:"center",width:"100%"}}>← Back to sign in</button>
                  </form>
                )}

                {/* ── OTP VERIFY MODE ── */}
                {(authMode==='forgot_password_otp'||authMode==='verify_email') && (
                  <div style={{display:"flex",flexDirection:"column",gap:"16px",position:"relative",zIndex:1}}>
                    <div style={{textAlign:"center"}}>
                      <h3 style={{fontFamily:"'Manrope',sans-serif",margin:"0 0 6px",fontSize:"20px",fontWeight:700,color:"#1a1c1e"}}>
                        {authMode==='verify_email'?"Verify your email":"Enter Verification Code"}
                      </h3>
                      <p style={{fontSize:"13px",color:"#424656",margin:0,lineHeight:1.6}}>
                        {authMode==='verify_email'?`6-digit code sent to ${email} to activate your account.`:`6-digit reset code sent to ${email}.`}
                      </p>
                    </div>
                    <motion.div animate={otpError?{x:[-10,10,-10,10,0],transition:{duration:.4}}:{}} style={{display:"flex",justifyContent:"center",padding:"8px 0"}}>
                      <InputOTP maxLength={6} value={otpCode} onChange={val=>{setOtpCode(val);if(val.length===6){if(authMode==='verify_email')void handleVerifySignUpOtp(val);else void handleVerifyForgotPasswordOtp(val);}}} disabled={isVerificationPending}>
                        <InputOTPGroup className="gap-2 justify-center w-full">
                          {[0,1,2,3,4,5].map(i=><InputOTPSlot key={i} index={i} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface"/>)}
                        </InputOTPGroup>
                      </InputOTP>
                    </motion.div>
                    {otpError && <p style={{fontSize:"12px",color:"#ba1a1a",textAlign:"center",fontWeight:600}}>{otpError}</p>}
                    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                      <Button type="button" variant="outline" className="w-full text-xs" onClick={()=>{if(authMode==='verify_email')void handleResendVerifyEmailOtp(email);else void handleSendForgotPasswordOtp();}} disabled={otpCooldown>0||isResendingOtp}>
                        {isResendingOtp?<><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin"/>Sending…</>:otpCooldown>0?`Resend code in ${otpCooldown}s`:"Resend code"}
                      </Button>
                      <Button type="button" variant="ghost" className="w-full text-xs" onClick={()=>{setMessage(null);setOtpError(null);setOtpCode("");setAuthMode(authMode==='verify_email'?'login':'forgot_password');}} disabled={isVerificationPending}>
                        Change Email / Go Back
                      </Button>
                    </div>
                  </div>
                )}

                {/* Messages */}
                {message && (
                  <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} style={{marginTop:"14px",padding:"11px 14px",borderRadius:"10px",fontSize:"13px",background:message.tone==="success"?"rgba(0,160,80,.07)":message.tone==="error"?"rgba(186,26,26,.06)":"rgba(0,102,255,.06)",border:`1px solid ${message.tone==="success"?"rgba(0,140,70,.22)":message.tone==="error"?"rgba(186,26,26,.18)":"rgba(0,102,255,.18)"}`,color:message.tone==="success"?"#007a40":message.tone==="error"?"#ba1a1a":"#0050cb",lineHeight:1.55,display:"flex",alignItems:"flex-start",gap:"8px",position:"relative",zIndex:1}}>
                    {message.tone==="success" && <CheckCircle2 size={15} style={{marginTop:"1px",flexShrink:0}}/>}
                    {message.tone==="error" && <AlertCircle size={15} style={{marginTop:"1px",flexShrink:0}}/>}
                    {message.tone==="info" && <Info size={15} style={{marginTop:"1px",flexShrink:0,opacity:.7}}/>}
                    <span style={{flex:1}}>{message.text}</span>
                  </motion.div>
                )}

                <p style={{marginTop:"18px",textAlign:"center",fontSize:"12px",color:"rgba(66,70,86,.65)",position:"relative",zIndex:1}}>
                  Demo school: <span style={{fontWeight:600,color:"#1a1c1e"}}>beacon</span> · Accounts are created by administrators.
                </p>
              </div>
            </motion.div>
          </div>
        </main>

        {/* FOOTER */}
        <footer style={{width:"100%",background:"rgba(255,255,255,.30)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",borderTop:"1px solid rgba(255,255,255,.55)",padding:"10px 24px",position:"relative",zIndex:10}}>
          <div style={{maxWidth:"1280px",margin:"0 auto",display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:"8px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",opacity:.45,filter:"grayscale(1)",transition:"opacity .3s,filter .3s"}} onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.opacity="1";(e.currentTarget as HTMLDivElement).style.filter="grayscale(0)";}} onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.opacity=".45";(e.currentTarget as HTMLDivElement).style.filter="grayscale(1)";}}>
              <img src="/pwa-512.png" alt="AltRix" style={{width:"22px",height:"22px",borderRadius:"5px"}}/>
              <span style={{fontFamily:"'Manrope',sans-serif",fontSize:"15px",fontWeight:700,color:"#1a1c1e"}}>AltRix</span>
            </div>
            <div style={{display:"flex",gap:"20px",flexWrap:"wrap",justifyContent:"center"}}>
              {["Privacy Policy","Terms of Service","Compliance"].map(l=><a key={l} href="#" style={{fontSize:"12px",fontWeight:600,color:"#424656",textDecoration:"none",letterSpacing:"0.01em",transition:"color .15s"}} onMouseEnter={e=>(e.currentTarget.style.color="#0066ff")} onMouseLeave={e=>(e.currentTarget.style.color="#424656")}>{l}</a>)}
            </div>
            <p style={{fontSize:"12px",color:"rgba(66,70,86,.55)",margin:0}}>© {new Date().getFullYear()} AltRix School OS. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Index;
