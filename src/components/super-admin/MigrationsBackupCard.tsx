import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Download, FolderArchive, UploadCloud, RefreshCw,
  FileCode2, Layers, CloudUpload, ShieldCheck, Info,
} from "lucide-react";

// Bundle all SQL migration files at build time as raw text (lazy)
const migrationLoaders = import.meta.glob("/supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

type MigrationFile = { path: string; name: string; load: () => Promise<string> };

const allMigrations: MigrationFile[] = Object.entries(migrationLoaders)
  .map(([path, load]) => ({
    path,
    name: path.split("/").pop() || path,
    load,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BUCKET = "migration-backups";

type RemoteFile = { name: string; size: number; updated_at: string | null };
const fmtBytes = (b: number) => {
  if (!b) return "0 B";
  const u = ["B","KB","MB","GB"]; let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
};

export function MigrationsBackupCard() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteFile[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const filtered = useMemo(
    () => allMigrations.filter(m => m.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const loadRemote = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: 1000, sortBy: { column: "name", order: "desc" },
    });
    if (error) {
      // Don't toast hard — bucket may be empty
      setRemote([]);
      return;
    }
    setRemote(
      (data || [])
        .filter(d => d.id || (d as any).metadata)
        .map(d => ({
          name: d.name,
          size: (d as any).metadata?.size ?? 0,
          updated_at: d.updated_at ?? null,
        }))
    );
  };

  useEffect(() => { void loadRemote(); }, []);

  const downloadSingle = async (m: MigrationFile) => {
    const text = await m.load();
    const blob = new Blob([text], { type: "application/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = m.name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    setBusy("Packing all migration files…");
    try {
      const zip = new JSZip();
      const folder = zip.folder("supabase-migrations");
      let i = 0;
      for (const m of allMigrations) {
        i++;
        setBusy(`Adding ${i}/${allMigrations.length}: ${m.name}`);
        const text = await m.load();
        folder?.file(m.name, text);
      }
      // Include a single combined SQL file too — handy for one-shot restore
      setBusy("Building combined SQL file…");
      let combined = `-- AltRix — Combined SQL migrations\n-- Generated ${new Date().toISOString()}\n-- Total files: ${allMigrations.length}\n\n`;
      for (const m of allMigrations) {
        const text = await m.load();
        combined += `\n\n-- ============================================================\n-- FILE: ${m.name}\n-- ============================================================\n\n${text}\n`;
      }
      zip.file("ALL_MIGRATIONS_COMBINED.sql", combined);
      zip.file("README.txt",
`AltRix — School Operating System
Database Migration Backup

This archive contains every SQL migration file that defines the AltRix
database structure (tables, security rules, functions, etc.).

How to use:
  1. Keep this ZIP somewhere safe — it is your full schema history.
  2. To restore on a fresh database, open ALL_MIGRATIONS_COMBINED.sql
     in any SQL client connected to your project and run it.
  3. Or apply the individual files one by one in name order.

Files: ${allMigrations.length}
Generated: ${new Date().toISOString()}
`);
      setBusy("Compressing archive…");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `altrix-sql-migrations-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${allMigrations.length} migration files as ZIP`);
    } catch (e: any) {
      toast.error("ZIP failed: " + (e?.message ?? e));
    }
    setBusy(null);
  };

  const uploadBackup = async () => {
    if (!uploadFile) return toast.error("Choose a .sql or .zip file first");
    setBusy(`Uploading ${uploadFile.name}…`);
    try {
      const path = `uploads/${new Date().toISOString().replace(/[:.]/g,"-")}_${uploadFile.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, {
        upsert: false,
        contentType: uploadFile.type || (uploadFile.name.endsWith(".zip") ? "application/zip" : "application/sql"),
      });
      if (error) throw error;
      toast.success("Backup safely saved to secure storage", {
        description: "You can download it again any time from the list below.",
      });
      setUploadFile(null);
      await loadRemote();
    } catch (e: any) {
      toast.error("Upload failed: " + (e?.message ?? e));
    }
    setBusy(null);
  };

  const uploadGeneratedSnapshot = async () => {
    setBusy("Snapshotting current migrations to cloud storage…");
    try {
      const zip = new JSZip();
      const folder = zip.folder("supabase-migrations");
      for (const m of allMigrations) {
        const text = await m.load();
        folder?.file(m.name, text);
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const path = `snapshots/altrix-sql-migrations-${new Date().toISOString().replace(/[:.]/g,"-")}.zip`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "application/zip", upsert: false,
      });
      if (error) throw error;
      toast.success("Snapshot saved to secure cloud storage");
      await loadRemote();
    } catch (e: any) {
      toast.error("Snapshot failed: " + (e?.message ?? e));
    }
    setBusy(null);
  };

  const downloadRemote = async (name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(name);
    if (error || !data) return toast.error("Download failed");
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = name.split("/").pop() || name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Friendly explainer */}
      <Card className="bg-gradient-to-br from-amber-500/10 via-zinc-950 to-zinc-950 border-amber-500/20">
        <CardContent className="p-5 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Info className="h-5 w-5 text-amber-400" />
          </div>
          <div className="text-sm text-zinc-300 leading-relaxed">
            <p className="font-semibold text-white mb-1">What is this?</p>
            <p>
              These are the <span className="text-amber-300 font-medium">SQL blueprint files</span> that build your
              entire AltRix database — every table, every security rule, every formula.
              Download them as a single ZIP to keep a safe copy of your platform's structure,
              upload a previous backup to keep it stored securely in the cloud, or take a fresh
              snapshot any time. Simple, one-click, no technical know-how required.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Migration Files</p>
            <h3 className="text-2xl font-bold text-amber-500 mt-1">{allMigrations.length}</h3>
          </div>
          <FileCode2 className="h-8 w-8 text-amber-500/30" />
        </Card>
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Saved Cloud Backups</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">{remote.length}</h3>
          </div>
          <Layers className="h-8 w-8 text-emerald-400/30" />
        </Card>
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Security</p>
            <h3 className="text-sm font-bold text-white mt-1">Master Admin only · Private bucket</h3>
          </div>
          <ShieldCheck className="h-8 w-8 text-white/20" />
        </Card>
      </div>

      {/* Big actions */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">One-Click Backup & Restore</CardTitle>
          <p className="text-xs text-zinc-400">
            Download everything at once, save a snapshot to secure cloud storage, or upload a previous backup file.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button
            onClick={downloadAllZip}
            disabled={!!busy}
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-bold"
          >
            <FolderArchive className="h-4 w-4 mr-2" />
            Download ALL Migrations (ZIP)
          </Button>
          <Button
            onClick={uploadGeneratedSnapshot}
            disabled={!!busy}
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold"
          >
            <CloudUpload className="h-4 w-4 mr-2" />
            Save Snapshot to Cloud
          </Button>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".sql,.zip,application/sql,application/zip"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="bg-zinc-900 border-zinc-800 text-zinc-200 w-72"
            />
            <Button
              onClick={uploadBackup}
              disabled={!uploadFile || !!busy}
              variant="outline"
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              Upload a Backup File
            </Button>
          </div>
          <Button variant="ghost" onClick={loadRemote} disabled={!!busy} className="text-zinc-300 hover:text-amber-300">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {busy && <span className="text-xs text-amber-300/80 font-mono">{busy}</span>}
        </CardContent>
      </Card>

      {/* Saved cloud backups */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">Saved Cloud Backups</CardTitle>
          <p className="text-xs text-zinc-400">
            Snapshots and uploads kept in your private storage area. Download any of them any time.
          </p>
        </CardHeader>
        <CardContent>
          {remote.length === 0 ? (
            <p className="text-sm text-zinc-500 italic py-6 text-center">
              No cloud backups yet. Click <span className="text-emerald-400 font-semibold">"Save Snapshot to Cloud"</span> to create one.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-zinc-900">
              <Table>
                <TableHeader className="bg-zinc-900/40">
                  <TableRow className="border-b border-zinc-900 hover:bg-transparent">
                    <TableHead className="text-zinc-400">File</TableHead>
                    <TableHead className="text-zinc-400">Size</TableHead>
                    <TableHead className="text-zinc-400">Saved</TableHead>
                    <TableHead className="text-zinc-400 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remote.map(r => (
                    <TableRow key={r.name} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                      <TableCell className="font-mono text-xs text-zinc-200 break-all">{r.name}</TableCell>
                      <TableCell className="text-zinc-400 text-xs">{fmtBytes(r.size)}</TableCell>
                      <TableCell className="text-zinc-500 text-xs">
                        {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-amber-300 hover:bg-amber-500/10"
                          onClick={() => downloadRemote(r.name)}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> Download
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-file list */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-white">All SQL Migration Files</CardTitle>
            <p className="text-xs text-zinc-400">Click any file to download just that one.</p>
          </div>
          <Input
            placeholder="Search migration name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72 bg-zinc-900 border-zinc-800 text-zinc-200"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border border-zinc-900 max-h-[520px]">
            <Table>
              <TableHeader className="bg-zinc-900/40 sticky top-0">
                <TableRow className="border-b border-zinc-900 hover:bg-transparent">
                  <TableHead className="text-zinc-400 w-12">#</TableHead>
                  <TableHead className="text-zinc-400">File name</TableHead>
                  <TableHead className="text-zinc-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-zinc-500 py-10">
                      No migration files match your search.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((m, idx) => (
                  <TableRow key={m.path} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                    <TableCell className="text-zinc-500 text-xs">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-200 break-all">
                      <Badge variant="outline" className="border-amber-500/20 text-amber-300 text-[10px] mr-2">SQL</Badge>
                      {m.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-amber-300 hover:bg-amber-500/10"
                        onClick={() => downloadSingle(m)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
