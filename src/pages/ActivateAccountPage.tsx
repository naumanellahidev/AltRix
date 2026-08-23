import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Building2,
  Mail,
  UserCheck,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import altrixLogo from "@/assets/altrix-logo.png";

interface InvitationData {
  valid: boolean;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  schoolName?: string | null;
  schoolSlug?: string | null;
  expiresAt?: string | null;
  error?: string | null;
}

export default function ActivateAccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ token?: string; "*": string }>();
  const [searchParams] = useSearchParams();

  const token = useMemo(() => {
    let raw = "";
    // 1. Search param ?token=...
    const qToken = searchParams.get("token");
    if (qToken) raw = qToken.trim();
    // 2. Wildcard splat parameter
    else if (params["*"]) raw = params["*"].trim();
    // 3. Named token parameter
    else if (params.token) raw = params.token.trim();
    // 4. Raw pathname parsing fallback
    else {
      const match = location.pathname.match(/^\/activate-account\/(.+)$/);
      if (match && match[1]) raw = match[1].trim();
    }

    // Strip out any trailing path segments like /n/A
    if (raw.includes("/")) {
      const parts = raw.split("/").map((p) => p.trim()).filter((p) => p && p !== "n" && p !== "A" && p.toLowerCase() !== "n/a");
      if (parts.length > 0) return parts[0];
    }
    return raw;
  }, [params, searchParams, location.pathname]);

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);

  // Form State
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activatedSuccess, setActivatedSuccess] = useState(false);

  // Password criteria
  const hasMinLength = password.length >= 8;
  const hasUpperAndLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordStrong = hasMinLength && hasUpperAndLower && hasNumberOrSpecial;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setInvitation({ valid: false, error: "No invitation token provided in the link." });
      return;
    }

    const checkToken = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/auth/invitations/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        setInvitation(data);
      } catch (err: any) {
        setInvitation({ valid: false, error: "Failed to connect to verification server." });
      } finally {
        setLoading(false);
      }
    };

    checkToken();
  }, [token]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordStrong) {
      toast.error("Please satisfy all password security requirements.");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/invitations/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          displayName: invitation?.displayName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.error || "Account activation failed");
      }

      // Establish active session in global auth state
      if (data.access_token) {
        await api.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
      }

      setActivatedSuccess(true);
      toast.success("Account activated successfully! Welcome to AltRix.");

      // Smooth redirect to tenant workspace hub after 1.5 seconds
      setTimeout(() => {
        const slug = data.schoolSlug || invitation?.schoolSlug || "altrix";
        navigate(`/${slug}/hub`, { replace: true });
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Failed to activate account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between items-center px-4 py-8 sm:py-12 relative overflow-hidden font-sans selection:bg-blue-600 selection:text-white">
      {/* Ambient background lighting */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[650px] h-[650px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Brand Header */}
      <header className="w-full flex flex-col items-center justify-center text-center relative z-10 mb-6">
        <div className="flex items-center justify-center transition-transform duration-300 hover:scale-[1.02] mb-3">
          <img
            src={altrixLogo}
            alt="AltRix Operating System"
            className="h-12 sm:h-14 md:h-16 w-auto max-w-[240px] sm:max-w-[290px] object-contain filter drop-shadow-md"
          />
        </div>
        <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-bold uppercase tracking-widest shadow-sm">
          <ShieldCheck className="h-3.5 w-3.5" /> Enterprise Identity & Staff Activation
        </div>
      </header>

      {/* Main Activation Card */}
      <Card className="w-full max-w-md bg-slate-900/90 border-slate-800 backdrop-blur-2xl shadow-2xl relative z-10 text-slate-100 rounded-2xl overflow-hidden my-auto">
        {loading ? (
          <CardContent className="py-16 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-200 text-sm">Verifying Secure Invitation Token</p>
              <p className="text-xs text-slate-400">Authenticating single-use cryptographic token...</p>
            </div>
          </CardContent>
        ) : activatedSuccess ? (
          <CardContent className="py-12 text-center space-y-5">
            <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Account Successfully Activated!</h2>
              <p className="text-sm text-slate-300">
                Welcome to <strong>{invitation?.schoolName || "AltRix"}</strong>. Your personal credentials have been established.
              </p>
              <p className="text-xs text-blue-400 font-medium">Redirecting you to your staff dashboard now...</p>
            </div>
          </CardContent>
        ) : !invitation?.valid ? (
          <CardContent className="py-12 text-center space-y-5">
            <div className="h-14 w-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">Invitation Invalid or Expired</h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                {invitation?.error || "This invitation link is invalid, has expired, or was already consumed."}
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs w-full"
                onClick={() => navigate("/auth")}
              >
                Return to Login
              </Button>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleActivate}>
            <CardHeader className="pb-3 pt-6 px-6">
              <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-400" /> Activate Your Account
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-1">
                Welcome, <strong className="text-slate-200">{invitation.displayName || invitation.email}</strong>. Complete your staff onboarding by setting up your password.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 px-6">
              {/* Institution and Role Context */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-blue-400" /> Institution:
                  </span>
                  <span className="font-semibold text-slate-200">{invitation.schoolName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-400" /> Assigned Role:
                  </span>
                  <Badge variant="secondary" className="bg-blue-500/10 text-blue-300 border-blue-500/20 uppercase font-bold text-[10px] tracking-wider">
                    {invitation.role?.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400" /> Official Email:
                  </span>
                  <span className="font-mono text-slate-300">{invitation.email}</span>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Create New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your personal password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={submitting}
                    className="bg-slate-950/80 border-slate-700 text-slate-100 pr-10 focus-visible:ring-blue-500 text-sm h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300">Confirm Password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={submitting}
                  className="bg-slate-950/80 border-slate-700 text-slate-100 focus-visible:ring-blue-500 text-sm h-10"
                />
              </div>

              {/* Password Criteria Checklist */}
              <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800 space-y-1.5 text-[11px]">
                <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Minimum 8 characters
                </div>
                <div className={`flex items-center gap-1.5 ${hasUpperAndLower ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Both upper and lowercase letters
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumberOrSpecial ? "text-emerald-400 font-semibold" : "text-slate-500"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> At least one number or special character
                </div>
                {confirmPassword && (
                  <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-400 font-semibold" : "text-rose-400"}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="pt-2 pb-6 px-6 flex flex-col gap-3">
              <Button
                type="submit"
                disabled={!isPasswordStrong || !passwordsMatch || submitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-600/30 transition-all text-sm py-5 rounded-xl"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activating Identity...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" /> Activate Account & Enter Workspace <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
              <p className="text-[10px] text-slate-500 text-center">
                By activating, you confirm your official identity on the AltRix Cloud OS.
              </p>
            </CardFooter>
          </form>
        )}
      </Card>

      {/* Footer */}
      <footer className="w-full text-center relative z-10 mt-6">
        <p className="text-[11px] text-slate-500 tracking-wider">
          © {new Date().getFullYear()} AltRix Institute OS • Enterprise Cloud Identity
        </p>
      </footer>
    </div>
  );
}
