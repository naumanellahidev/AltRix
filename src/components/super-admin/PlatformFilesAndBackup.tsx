import { useEffect, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Download,
  FolderArchive,
  FileJson,
  UploadCloud,
  RefreshCw,
  HardDrive,
  Files as FilesIcon,
  Database,
} from "lucide-react";

// All storage buckets registered in this project
const BUCKETS = [
  "admission-documents",
  "fee-payment-proofs",
  "exam-datesheets",
  "student-photos",
  "hr-documents",
  "message-attachments",
  "assignment-submissions",
];

// Core public tables (entire platform data, not per-school)
const PLATFORM_TABLES = [
  "schools","campuses","profiles","user_roles","school_memberships",
  "academic_classes","class_sections","subjects","section_subjects",
  "students","student_guardians","student_enrollments",
  "teacher_subject_assignments",
  "attendance_sessions","attendance_entries",
  "exams","exam_subjects","exam_results","exam_datesheet_distributions","exam_result_publications",
  "fee_plans","fee_plan_items","fee_invoices","fee_invoice_items","fee_payments","fee_payment_proofs","fee_settings",
  "finance_invoices","finance_invoice_items","finance_payments","finance_expenses","finance_payment_methods",
  "timetable_entries","homework","assignments","assignment_submissions","lesson_plans",
  "behavior_notes","diary_entries","notices","holidays",
  "admin_messages","admin_message_recipients","app_notifications",
  "complaints","complaint_feedbacks",
  "hr_job_postings","hr_applicants","hr_interviews","hr_contracts","hr_documents",
  "hr_leave_requests","hr_leave_types","hr_employee_salary_structure",
  "hr_assets","hr_asset_assignments","hr_attendance_regularizations",
  "hr_onboarding_assignments","hr_onboarding_task_status",
  "crm_leads","crm_activities","crm_call_logs","crm_campaigns","crm_follow_ups",
  "crm_lead_sources","crm_lead_attributions","crm_pipelines","crm_stages",
  "ai_student_profiles","ai_teacher_performance","ai_early_warnings",
  "ai_academic_predictions","ai_career_suggestions","ai_counseling_queue",
  "ai_parent_updates","ai_school_reputation",
  "audit_logs",
];

type FileRow = {
  bucket: string;
  path: string;
  size: number;
  updated_at: string | null;
};

const fmtBytes = (b: number) => {
  if (!b) return "0 B";
  const units = ["B","KB","MB","GB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
};

async function listBucketRecursive(bucket: string, prefix = ""): Promise<FileRow[]> {
  const out: FileRow[] = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return out;
  for (const item of data) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    // Folders have no id/metadata
    if (!item.id && !(item as any).metadata) {
      const nested = await listBucketRecursive(bucket, full);
      out.push(...nested);
    } else {
      out.push({
        bucket,
        path: full,
        size: (item as any).metadata?.size ?? 0,
        updated_at: item.updated_at ?? null,
      });
    }
  }
  return out;
}

export function PlatformFilesAndBackup() {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [query, setQuery] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const all: FileRow[] = [];
      for (const b of BUCKETS) {
        const rows = await listBucketRecursive(b);
        all.push(...rows);
      }
      setFiles(all);
    } catch (e: any) {
      toast.error("Failed to list files: " + (e?.message ?? e));
    }
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = files.filter(f =>
    `${f.bucket}/${f.path}`.toLowerCase().includes(query.toLowerCase())
  );

  const totalSize = files.reduce((a, f) => a + (f.size || 0), 0);
  const perBucket = BUCKETS.map(b => ({
    bucket: b,
    count: files.filter(f => f.bucket === b).length,
    size: files.filter(f => f.bucket === b).reduce((a, f) => a + (f.size || 0), 0),
  }));

  const downloadSingle = async (row: FileRow) => {
    const { data, error } = await supabase.storage.from(row.bucket).download(row.path);
    if (error || !data) return toast.error("Download failed: " + (error?.message ?? "no data"));
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = row.path.split("/").pop() || "file";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadAllAsZip = async () => {
    if (!files.length) return toast.info("No files to download.");
    setDownloadingAll(true);
    setProgress("Preparing archive…");
    try {
      const zip = new JSZip();
      let i = 0;
      for (const f of files) {
        i++;
        setProgress(`Packing ${i}/${files.length}: ${f.bucket}/${f.path}`);
        const { data, error } = await supabase.storage.from(f.bucket).download(f.path);
        if (error || !data) continue;
        const buf = await data.arrayBuffer();
        zip.folder(f.bucket)?.file(f.path, buf);
      }
      setProgress("Compressing…");
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `altrix-files-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${files.length} files as ZIP`);
    } catch (e: any) {
      toast.error("ZIP failed: " + (e?.message ?? e));
    }
    setDownloadingAll(false);
    setProgress("");
  };

  const downloadFullBackup = async () => {
    setBackupBusy(true);
    setProgress("Compiling full database backup…");
    try {
      const dump: Record<string, any[]> = {};
      let total = 0;
      for (const t of PLATFORM_TABLES) {
        try {
          const { data, error } = await supabase.from(t as any).select("*");
          if (!error && Array.isArray(data)) {
            dump[t] = data;
            total += data.length;
            setProgress(`Exported ${t} (${data.length} rows)`);
          } else {
            dump[t] = [];
          }
        } catch {
          dump[t] = [];
        }
      }
      const payload = {
        exportedAt: new Date().toISOString(),
        platform: "AltRix - School Operating System",
        tableCount: Object.keys(dump).length,
        rowCount: total,
        tables: dump,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `altrix-platform-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Backup ready: ${total} rows across ${Object.keys(dump).length} tables`);
    } catch (e: any) {
      toast.error("Backup failed: " + (e?.message ?? e));
    }
    setBackupBusy(false);
    setProgress("");
  };

  const handleRestore = async () => {
    if (!restoreFile) return toast.error("Select a backup JSON first");
    setRestoreBusy(true);
    setProgress("Reading backup file…");
    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);
      const tables = parsed.tables || parsed;
      let ok = 0, fail = 0;
      for (const [t, rows] of Object.entries(tables)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        setProgress(`Restoring ${t} (${rows.length})…`);
        // Upsert in chunks
        const chunkSize = 200;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const { error } = await supabase.from(t as any).upsert(chunk as any, { onConflict: "id" });
          if (error) { fail++; }
          else { ok++; }
        }
      }
      toast.success(`Restore complete. ${ok} chunks succeeded, ${fail} failed (skipped restricted tables).`);
    } catch (e: any) {
      toast.error("Restore failed: " + (e?.message ?? e));
    }
    setRestoreBusy(false);
    setProgress("");
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Storage Buckets</p>
            <h3 className="text-2xl font-bold text-amber-500 mt-1">{BUCKETS.length}</h3>
          </div>
          <HardDrive className="h-8 w-8 text-amber-500/30" />
        </Card>
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Total Files</p>
            <h3 className="text-2xl font-bold text-white mt-1">{files.length.toLocaleString()}</h3>
          </div>
          <FilesIcon className="h-8 w-8 text-white/20" />
        </Card>
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Total File Size</p>
            <h3 className="text-2xl font-bold text-white mt-1">{fmtBytes(totalSize)}</h3>
          </div>
          <FolderArchive className="h-8 w-8 text-white/20" />
        </Card>
        <Card className="bg-zinc-950 border-amber-500/10 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Tables Tracked</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">{PLATFORM_TABLES.length}</h3>
          </div>
          <Database className="h-8 w-8 text-emerald-400/20" />
        </Card>
      </div>

      {/* Operations */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-white">Platform Backup & Restore</CardTitle>
          <p className="text-xs text-zinc-400">
            Download every uploaded file across all buckets, export a complete database snapshot, or restore from a previous backup.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button
            onClick={downloadAllAsZip}
            disabled={downloadingAll || loading}
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-bold"
          >
            <FolderArchive className="h-4 w-4 mr-2" />
            {downloadingAll ? "Packing ZIP…" : "Download All Files (ZIP)"}
          </Button>
          <Button
            onClick={downloadFullBackup}
            disabled={backupBusy}
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold"
          >
            <FileJson className="h-4 w-4 mr-2" />
            {backupBusy ? "Compiling…" : "Download Full DB Backup (JSON)"}
          </Button>
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="application/json"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              className="bg-zinc-900 border-zinc-800 text-zinc-200 w-72"
            />
            <Button
              onClick={handleRestore}
              disabled={!restoreFile || restoreBusy}
              variant="outline"
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              {restoreBusy ? "Restoring…" : "Restore from Backup"}
            </Button>
          </div>
          <Button variant="ghost" onClick={refresh} disabled={loading} className="text-zinc-300 hover:text-amber-300">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {progress && (
            <span className="text-xs text-amber-300/80 font-mono">{progress}</span>
          )}
        </CardContent>
      </Card>

      {/* Per-bucket summary */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader>
          <CardTitle className="text-base font-bold text-white">Storage Buckets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {perBucket.map(b => (
              <div key={b.bucket} className="rounded-lg border border-zinc-900 p-3 bg-zinc-950/60">
                <p className="text-xs font-mono text-amber-300">{b.bucket}</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-lg font-bold text-white">{b.count}</span>
                  <span className="text-[10px] text-zinc-400">{fmtBytes(b.size)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File list */}
      <Card className="bg-zinc-950 border-amber-500/10">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-white">All Uploaded Files</CardTitle>
            <p className="text-xs text-zinc-400">Across every storage bucket on the platform</p>
          </div>
          <Input
            placeholder="Search file path or bucket…"
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
                  <TableHead className="text-zinc-400">Bucket</TableHead>
                  <TableHead className="text-zinc-400">Path</TableHead>
                  <TableHead className="text-zinc-400">Size</TableHead>
                  <TableHead className="text-zinc-400">Updated</TableHead>
                  <TableHead className="text-zinc-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-zinc-500 py-10">
                      {loading ? "Loading…" : "No files found."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.slice(0, 500).map((f, idx) => (
                  <TableRow key={`${f.bucket}/${f.path}-${idx}`} className="border-b border-zinc-900/80 hover:bg-zinc-900/30">
                    <TableCell>
                      <Badge variant="outline" className="border-amber-500/20 text-amber-300 text-[10px] font-mono">
                        {f.bucket}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-200 break-all">{f.path}</TableCell>
                    <TableCell className="text-zinc-400 text-xs">{fmtBytes(f.size)}</TableCell>
                    <TableCell className="text-zinc-500 text-xs">
                      {f.updated_at ? new Date(f.updated_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-amber-300 hover:bg-amber-500/10"
                        onClick={() => downloadSingle(f)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 500 && (
              <p className="text-xs text-zinc-500 px-3 py-2">Showing first 500 of {filtered.length}. Refine with search.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
