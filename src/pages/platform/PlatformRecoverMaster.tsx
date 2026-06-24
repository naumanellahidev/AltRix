import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { KeyRound, Mail, ShieldCheck, Eye, EyeOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

export default function PlatformRecoverMaster() {
  const navigate = useNavigate();

  const [recoverySecret, setRecoverySecret] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const doRecover = async () => {
    setMessage(null);
    setSuccess(false);

    if (!recoverySecret.trim()) return setMessage("Recovery secret required.");
    const parsedEmail = emailSchema.safeParse(newEmail.trim());
    const parsedPassword = passwordSchema.safeParse(newPassword);
    if (!parsedEmail.success) return setMessage("Valid email required.");
    if (!parsedPassword.success) return setMessage("Password must be at least 8 characters.");

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("eduverse-recover-master", {
        body: {
          recoverySecret: recoverySecret.trim(),
          newEmail: parsedEmail.data.toLowerCase(),
          newPassword: parsedPassword.data,
        },
      });

      if (error) {
        const detail = (error as any)?.context?.body;
        if (detail && typeof detail === "string") {
          try {
            const parsed = JSON.parse(detail);
            return setMessage(parsed?.error ?? error.message);
          } catch {
            return setMessage(error.message);
          }
        }
        return setMessage(error.message);
      }

      const resp = data as any;
      if (resp?.success) {
        setSuccess(true);
        setMessage(`Success! Master admin created with email: ${resp.email}. Redirecting to login…`);
        setTimeout(() => navigate("/auth"), 2500);
      } else {
        setMessage(resp?.error ?? "Recovery failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-10">
      <div className="mx-auto w-full max-w-xl">
        <Card className="shadow-elevated">
          <CardHeader>
            <div className="mb-2 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface shadow-elevated">
                <ShieldCheck />
              </div>
              <div>
                <CardTitle className="font-display text-xl">Recover Master Admin</CardTitle>
                <p className="text-sm text-muted-foreground">Use your recovery secret to regain access.</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-accent p-3 text-sm text-accent-foreground">
              <p className="font-medium">One-time recovery</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your recovery secret + new credentials. This will create a fresh Platform Super Admin.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Recovery secret</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-10"
                  type={showSecret ? "text" : "password"}
                  value={recoverySecret}
                  onChange={(e) => setRecoverySecret(e.target.value)}
                  placeholder="Your secure recovery secret"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">New master admin email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@yourdomain.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">New password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-10"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button variant="hero" size="xl" className="w-full" disabled={busy || success} onClick={doRecover}>
              {busy ? "Recovering…" : "Recover master admin"}
            </Button>

            {message && (
              <div className={`rounded-xl p-3 text-sm ${success ? "bg-green-500/10 text-green-700" : "bg-accent text-accent-foreground"}`}>
                {message}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}