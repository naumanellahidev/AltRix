import { useCallback, useEffect, useRef, useState } from "react";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, CheckCircle2, Database, Download, HardDriveDownload,
  Lock, RefreshCw, ShieldCheck, Trash2, Upload, XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { getAccessToken } from "@/lib/token-store";
import { toast } from "sonner";

/**
 * Backup and restore control for the platform.
 *
 * The download and upload actions are the important ones: they are how a copy
 * of the database leaves this server without shell access and without any
 * third-party account. A backup sitting only on the machine that holds the
 * database protects against a dropped table, not against losing the machine.
 */

interface BackupFile {
  name: string;
  size_bytes: number;
  created_at: string;
  encrypted: boolean;
}

interface BackupHealth {
  available: boolean;
  count?: number;
  latest?: string | null;
  latest_age_hours?: number | null;
  stale?: boolean;
  encrypted?: boolean | null;
  offsite_configured?: boolean;
  offsite_target?: string;
  storage_path?: string;
  last_restore_drill?: { status: string; checked_at?: string; reason?: string } | null;
  warning?: string;
}

interface AlertSettings {
  alert_emails: string[];
  alert_on_failure: boolean;
  alert_on_stale: boolean;
  alert_on_missing_offsite: boolean;
  alert_on_drill_failure: boolean;
  stale_after_hours: number;
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PlatformBackupsPage() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [emailsInput, setEmailsInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BackupFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [listRes, settingsRes] = await Promise.all([
        apiClient.get("/super_admin/backups"),
        apiClient.get("/super_admin/backups/settings/alerts"),
      ]);
      setBackups(listRes.data?.backups ?? []);
      setHealth(listRes.data?.health ?? null);
      setSettings(settingsRes.data);
      setEmailsInput((settingsRes.data?.alert_emails ?? []).join(", "));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const takeBackup = async () => {
    setBusy("run");
    try {
      const res = await apiClient.post("/super_admin/backups/run");
      toast.success(res.data?.message ?? "Backup started");
      setTimeout(load, 8000);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not start the backup");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Downloads go through fetch rather than a plain link because the endpoint
   * needs the Authorization header — an <a download> would arrive anonymous and
   * be refused.
   */
  const download = async (backup: BackupFile, decrypt: boolean) => {
    setBusy(`download:${backup.name}`);
    try {
      const base = apiClient.defaults.baseURL || "/api";
      const res = await fetch(
        `${base}/super_admin/backups/${encodeURIComponent(backup.name)}/download${decrypt ? "?decrypt=true" : ""}`,
        { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = decrypt ? backup.name.replace(/\.enc$/, "") : backup.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Downloaded. Keep this file somewhere other than this server.");
    } catch (err: any) {
      toast.error(err?.message ?? "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    setBusy("upload");
    try {
      const form = new FormData();
      form.append("file", file);
      const base = apiClient.defaults.baseURL || "/api";
      const res = await fetch(`${base}/super_admin/backups/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? `Upload failed (${res.status})`);
      toast.success(`${data.name} uploaded and ready to restore`);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const verify = async (backup: BackupFile) => {
    setBusy(`verify:${backup.name}`);
    try {
      const res = await apiClient.post(
        `/super_admin/backups/verify/${encodeURIComponent(backup.name)}`,
      );
      if (res.data?.readable) toast.success(`${backup.name} is readable and restorable`);
      else toast.error(res.data?.reason ?? "This backup could not be read");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Verification failed");
    } finally {
      setBusy(null);
    }
  };

  const runDrill = async () => {
    setBusy("drill");
    try {
      const res = await apiClient.post("/super_admin/backups/drill");
      toast.success(res.data?.message ?? "Restore drill started");
      setTimeout(load, 20000);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not start the drill");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (backup: BackupFile) => {
    setConfirmRestore(null);
    setBusy(`restore:${backup.name}`);
    try {
      const res = await apiClient.post("/super_admin/backups/restore", {
        backup: backup.name,
      });
      toast.success(res.data?.next_step ?? "Restored into a recovery database", {
        duration: 12000,
      });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Restore failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (backup: BackupFile) => {
    setConfirmDelete(null);
    try {
      await apiClient.delete(`/super_admin/backups/${encodeURIComponent(backup.name)}`);
      toast.success(`${backup.name} deleted`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not delete the backup");
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy("settings");
    try {
      const res = await apiClient.put("/super_admin/backups/settings/alerts", {
        ...settings,
        alert_emails: emailsInput.split(",").map((e) => e.trim()).filter(Boolean),
      });
      setSettings(res.data);
      setEmailsInput((res.data?.alert_emails ?? []).join(", "));
      toast.success("Backup alert settings saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Could not save settings");
    } finally {
      setBusy(null);
    }
  };

  const drill = health?.last_restore_drill;

  return (
    <SuperAdminShell
      title="Backups & Disaster Recovery"
      subtitle="Database snapshots, off-server copies, and proven restores"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={takeBackup} disabled={busy === "run"}>
            <Database className="h-3.5 w-3.5 mr-1.5" />
            {busy === "run" ? "Starting…" : "Back Up Now"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Health */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Latest backup"
            value={
              health?.available
                ? `${health.latest_age_hours ?? "?"}h ago`
                : "None"
            }
            tone={!health?.available || health?.stale ? "bad" : "good"}
            detail={health?.latest ?? health?.warning ?? ""}
          />
          <StatCard
            label="Stored on this server"
            value={String(health?.count ?? 0)}
            tone={health?.count ? "good" : "bad"}
            detail={health?.storage_path ?? ""}
          />
          <StatCard
            label="Encryption"
            value={health?.encrypted ? "AES-256" : "Not encrypted"}
            tone={health?.encrypted ? "good" : "bad"}
            detail={
              health?.encrypted
                ? "Readable only with the backup key"
                : "Dumps contain every student's personal data"
            }
          />
          <StatCard
            label="Recovery proven"
            value={
              drill ? (drill.status === "success" ? "Yes" : "Failed") : "Never tested"
            }
            tone={drill?.status === "success" ? "good" : "bad"}
            detail={
              drill
                ? `${drill.status === "success" ? "Last drill" : drill.reason ?? "Failed"} ${drill.checked_at ? formatWhen(drill.checked_at) : ""}`
                : "A backup nobody has restored is only a hypothesis"
            }
          />
        </div>

        {/* Off-server guidance */}
        {!health?.offsite_configured && (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">
                  No automatic off-server copy
                </p>
                <p className="text-amber-800 mt-1">
                  Backups are on the same machine as the database, so losing the
                  server loses both. Use <strong>Download</strong> below to keep a
                  copy elsewhere — that file can be uploaded back and restored at
                  any time. To have the copy made automatically instead, set{" "}
                  <code className="text-xs">BACKUP_OFFSITE_TARGET=path</code> and{" "}
                  <code className="text-xs">BACKUP_MIRROR_PATH</code> to a second
                  disk or network share.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".dump,.enc"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={busy === "upload"}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {busy === "upload" ? "Uploading…" : "Upload a backup"}
              </Button>
              <Button size="sm" variant="secondary" onClick={runDrill} disabled={busy === "drill"}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                {busy === "drill" ? "Running…" : "Run restore drill"}
              </Button>
              <span className="text-xs text-muted-foreground">
                The drill restores into a throwaway database — it never touches live data.
              </span>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : backups.length === 0 ? (
              <div className="py-10 text-center">
                <Database className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold">No backups yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  One is taken automatically each night. Use “Back Up Now” to take one immediately.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Backup</TableHead>
                      <TableHead>Taken</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-2">
                            {b.encrypted ? (
                              <Lock className="h-3 w-3 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                            )}
                            <span className="truncate max-w-[280px]">{b.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{formatWhen(b.created_at)}</TableCell>
                        <TableCell className="text-xs">{formatBytes(b.size_bytes)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Button
                              size="sm" variant="secondary" className="h-7 text-[11px]"
                              onClick={() => download(b, false)}
                              disabled={busy === `download:${b.name}`}
                            >
                              <Download className="h-3 w-3 mr-1" /> Download
                            </Button>
                            {b.encrypted && (
                              <Button
                                size="sm" variant="ghost" className="h-7 text-[11px]"
                                onClick={() => download(b, true)}
                                title="Decrypted copy — readable by anyone who obtains it"
                              >
                                <HardDriveDownload className="h-3 w-3 mr-1" /> Decrypted
                              </Button>
                            )}
                            <Button
                              size="sm" variant="ghost" className="h-7 text-[11px]"
                              onClick={() => verify(b)}
                              disabled={busy === `verify:${b.name}`}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Verify
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-[11px]"
                              onClick={() => setConfirmRestore(b)}
                              disabled={busy === `restore:${b.name}`}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" /> Restore
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-[11px] text-red-600 hover:text-red-700"
                              onClick={() => setConfirmDelete(b)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Backup alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              A backup system that stops working is only dangerous because it is
              quiet. These messages are sent through the same mail service as the
              rest of the platform.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="alert-emails" className="text-xs font-semibold">
                Send alerts to
              </Label>
              <Input
                id="alert-emails"
                value={emailsInput}
                onChange={(e) => setEmailsInput(e.target.value)}
                placeholder="ops@example.com, cto@example.com"
              />
              <p className="text-[11px] text-muted-foreground">
                Comma separated. Leave empty and failures are only written to the logs.
              </p>
            </div>

            {settings && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  ["alert_on_failure", "A backup fails"],
                  ["alert_on_stale", "Backups stop running"],
                  ["alert_on_missing_offsite", "No off-server copy exists"],
                  ["alert_on_drill_failure", "A restore drill fails"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor={key} className="text-xs font-medium">{label}</Label>
                    <Switch
                      id={key}
                      checked={settings[key]}
                      onCheckedChange={(v) => setSettings({ ...settings, [key]: v })}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button size="sm" onClick={saveSettings} disabled={busy === "settings" || !settings}>
              {busy === "settings" ? "Saving…" : "Save alert settings"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-mono text-xs">{confirmRestore?.name}</span> will
                  be restored into a <strong>new recovery database</strong> beside the
                  live one.
                </p>
                <p>
                  Nothing live is touched. Inspect the recovered data first, then
                  decide whether to promote it.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRestore && restore(confirmRestore)}>
              Restore to recovery database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{confirmDelete?.name}</span> will be
              removed from this server permanently. If you have not downloaded a copy,
              it cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SuperAdminShell>
  );
}

function StatCard({
  label, value, detail, tone,
}: { label: string; value: string; detail?: string; tone: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {tone === "good" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          )}
        </div>
        <p className="text-xl font-bold mt-1">{value}</p>
        {detail && (
          <p className="text-[11px] text-muted-foreground mt-1 break-words line-clamp-2">
            {detail}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
