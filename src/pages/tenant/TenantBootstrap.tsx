import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, KeyRound, School } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const TenantBootstrap = () => {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const reduce = useReducedMotion();

  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [schoolName, setSchoolName] = useState("Beacon International School");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showBootstrapSecret, setShowBootstrapSecret] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const slug = useMemo(() => tenant.slug || "", [tenant.slug]);

  const runBootstrap = async () => {
    setResult(null);
    if (!bootstrapSecret.trim()) return setResult("Bootstrap secret is required.");
    if (!slug) return setResult("School slug is required.");
    if (!adminEmail.trim()) return setResult("Admin email is required.");
    if (adminPassword.trim().length < 8) return setResult("Admin password must be at least 8 characters.");

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("eduverse-bootstrap", {
        body: {
          bootstrapSecret: bootstrapSecret.trim(),
          schoolSlug: slug,
          schoolName: schoolName.trim() || slug,
          adminEmail: adminEmail.trim().toLowerCase(),
          adminPassword: adminPassword,
          displayName: "Super Admin",
          force,
        },
      });

      if (error) {
        setResult(error.message);
        return;
      }
      setResult(JSON.stringify(data, null, 2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-hero-grid px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Card className="shadow-elevated">
            <CardHeader>
              <CardTitle className="font-display text-xl">AltRix Bootstrap</CardTitle>
              <p className="text-sm text-muted-foreground">
                One-time secure setup to create the first Super Admin (no public signup).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">School Slug</label>
                  <Input value={slug} disabled />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">School Name</label>
                  <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bootstrap Secret</label>
                <div className="relative">
                  <Input
                    value={bootstrapSecret}
                    onChange={(e) => setBootstrapSecret(e.target.value)}
                    type={showBootstrapSecret ? "text" : "password"}
                    placeholder="(provided in backend secrets)"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBootstrapSecret((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showBootstrapSecret ? "Hide secret" : "Show secret"}
                  >
                    {showBootstrapSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Super Admin Email</label>
                  <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@org.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Super Admin Password</label>
                  <div className="relative">
                    <Input
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      type={showAdminPassword ? "text" : "password"}
                      placeholder="Minimum 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showAdminPassword ? "Hide password" : "Show password"}
                    >
                      {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent p-4">
                <div>
                  <p className="text-sm font-medium text-accent-foreground">Force re-issue link</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If the school is already bootstrapped, enable this to generate a fresh password-set link (safe).
                  </p>
                </div>
                <Switch checked={force} onCheckedChange={setForce} />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="hero" size="xl" disabled={busy} onClick={runBootstrap} className="flex-1">
                  <KeyRound className="mr-2 h-4 w-4" /> Run bootstrap
                </Button>
                <Button variant="soft" size="xl" asChild className="flex-1">
                  <a href={`/${slug}/auth`}>
                    <School className="mr-2 h-4 w-4" /> Go to login
                  </a>
                </Button>
              </div>

              {result && (
                <pre className="max-h-[280px] overflow-auto rounded-2xl bg-accent p-4 text-xs text-accent-foreground">
                  {result}
                </pre>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default TenantBootstrap;
