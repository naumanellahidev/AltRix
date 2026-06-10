import { useState } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ShieldCheck, KeyRound, ShieldAlert, Users, Database } from "lucide-react";
import { toast } from "sonner";

export default function PlatformSecurityPage() {
  const [securitySettings, setSecuritySettings] = useState({
    enforceMfa: true,
    wafProtection: true,
    ipRateLimiting: true,
    sessionTimeoutMin: "60",
    lastBackup: "2026-06-03 04:00 AM"
  });

  const handleToggle = (setting: keyof typeof securitySettings) => {
    setSecuritySettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
    toast.success("Security configuration updated!");
  };

  const handleBackupNow = () => {
    toast.info("Database backup process initiated", {
      description: "Triggering a manual snapshot of AltRix main cluster..."
    });
    setTimeout(() => {
      setSecuritySettings(prev => ({ ...prev, lastBackup: new Date().toLocaleString() }));
      toast.success("Snapshot created successfully!");
    }, 1500);
  };

  return (
    <SuperAdminShell title="Security Center" subtitle="Manage global platform security policies, authentication, and audits">
      <div className="space-y-6">
        {/* KPI Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Security Rating</CardTitle>
              <ShieldCheck className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">A+ Compliance</div>
              <div className="text-xs text-amber-400 mt-1">MFA & encryption fully enforced</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Database Backups</CardTitle>
              <Database className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">Automated Daily</div>
              <div className="text-xs text-zinc-400 mt-1">Last: {securitySettings.lastBackup}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">WAF Block Events</CardTitle>
              <ShieldAlert className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">0 in last 24h</div>
              <div className="text-xs text-zinc-400 mt-1">Global firewall protecting endpoints</div>
            </CardContent>
          </Card>
        </div>

        {/* Global Security Policy */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">Global Security Switches</CardTitle>
            <p className="text-xs text-zinc-400">Configure global authentication and filtering mechanisms</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-900 bg-black/20">
              <div>
                <p className="text-sm font-semibold text-white">Enforce Multi-Factor Authentication (MFA)</p>
                <p className="text-xs text-zinc-400 mt-0.5">Require all platform owners and master admins to enroll in MFA.</p>
              </div>
              <Switch checked={securitySettings.enforceMfa} onCheckedChange={() => handleToggle("enforceMfa")} />
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-900 bg-black/20">
              <div>
                <p className="text-sm font-semibold text-white">Web Application Firewall (WAF) Protection</p>
                <p className="text-xs text-zinc-400 mt-0.5">Filter in-flight SQL injection and CSRF script probes at platform edge.</p>
              </div>
              <Switch checked={securitySettings.wafProtection} onCheckedChange={() => handleToggle("wafProtection")} />
            </div>

            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-900 bg-black/20">
              <div>
                <p className="text-sm font-semibold text-white">IP-based Rate Limiting</p>
                <p className="text-xs text-zinc-400 mt-0.5">Block rapid API calls exceeding 300 requests per minute from a single IP.</p>
              </div>
              <Switch checked={securitySettings.ipRateLimiting} onCheckedChange={() => handleToggle("ipRateLimiting")} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Session Timeout Interval (Minutes)</label>
                <Input
                  type="number"
                  className="bg-zinc-950 border-amber-500/20 text-white placeholder:text-zinc-500 focus-visible:ring-amber-500/30"
                  value={securitySettings.sessionTimeoutMin}
                  onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionTimeoutMin: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => toast.success("Timeout configuration updated successfully.")}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold border border-amber-400/20"
                >
                  <KeyRound className="h-4 w-4 mr-2" /> Save Session Config
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Snapshots */}
        <Card className="bg-zinc-950 border-amber-500/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg font-bold text-white">Database Snapshots & Disaster Recovery</CardTitle>
              <p className="text-xs text-zinc-400">Trigger immediate snapshots or review historical archives</p>
            </div>
            <Button variant="outline" onClick={handleBackupNow} className="border-amber-500/20 text-amber-400 hover:bg-amber-500/10 font-bold">
              Backup Now
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { name: "Daily Backup - Automatic", size: "24.8 MB", date: "2026-06-03 04:00 AM", checksum: "sha256:7f01a..." },
                { name: "Daily Backup - Automatic", size: "24.7 MB", date: "2026-06-02 04:00 AM", checksum: "sha256:5b82d..." },
              ].map((b) => (
                <div key={b.date} className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-900 bg-black/20">
                  <div>
                    <p className="text-sm font-semibold text-white">{b.name}</p>
                    <p className="text-xs text-zinc-400">Checksum: {b.checksum}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-zinc-300">{b.size}</p>
                    <p className="text-[11px] text-zinc-400">{b.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminShell>
  );
}
