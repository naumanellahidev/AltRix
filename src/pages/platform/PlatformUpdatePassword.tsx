import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { KeyRound, Eye, EyeOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const passwordSchema = z.string().min(8);

export default function PlatformUpdatePassword() {
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const title = useMemo(() => "Set a new password", []);

  useEffect(() => {
    if (loading) return;
    // When coming from a recovery/reset email, a session should be established automatically.
    if (!user) setMessage("Open this page from your password reset email link.");
  }, [loading, user]);

  const updatePassword = async () => {
    setMessage(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setMessage("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) return setMessage(error.message);
      navigate("/platform", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-10">
      <div className="mx-auto w-full max-w-xl">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display text-xl">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">Choose a strong password for your account.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">New password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
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

            <Button variant="hero" size="xl" className="w-full" disabled={busy || !user} onClick={updatePassword}>
              Update password
            </Button>

            {message && <div className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">{message}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
