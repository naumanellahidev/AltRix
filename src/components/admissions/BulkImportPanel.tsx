/**
 * Bringing a school's paper register into the app.
 *
 * A school that has just signed up does not have a hundred new admissions to
 * process; it has four hundred children already in a ledger. Until now the
 * only way in was the admission form, one child at a time, which is why a
 * school's first afternoon with the app was also often its last.
 *
 * The shape of the screen follows the thing that matters most — that the
 * office sees exactly what will happen before anything is written:
 *
 *   download the template  →  fill it in  →  upload  →  read the report  →  import
 *
 * The report is the point. Every row is checked against the school's own
 * classes and its existing roll, and each problem names the row, the column
 * and what to do about it. Rows with an error are held back; the rest still
 * import, so one bad date does not cost the school the other 399 children.
 */
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, PanelCard, StatTiles } from "@/components/tenant/module-kit";
import {
  downloadImportTemplate,
  readWorkbook,
  validateRows,
  type ImportRow,
  type RawRow,
  type RowProblem,
} from "@/lib/admissions/bulk-import";

interface Props {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string; class_id: string }>;
  /** Registration numbers already on the roll, so a re-import is caught. */
  existingRegistrations: string[];
  /** "first last|yyyy-mm-dd" for students already enrolled. */
  existingIdentities: string[];
  onImported: () => void;
}

interface RowResult {
  line: number;
  ok: boolean;
  name: string;
  reason?: string | null;
}

export function BulkImportPanel({
  classes,
  sections,
  existingRegistrations,
  existingIdentities,
  onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const checked = useMemo(
    () =>
      rows.length
        ? validateRows(rows, { classes, sections, existingRegistrations, existingIdentities })
        : { ready: [] as ImportRow[], problems: [] as RowProblem[], blockedLines: [] as number[] },
    [rows, classes, sections, existingRegistrations, existingIdentities],
  );

  const errors = checked.problems.filter((p) => p.level === "error");
  const warnings = checked.problems.filter((p) => p.level === "warning");

  const reset = () => {
    setRows([]);
    setUnknownHeaders([]);
    setResults(null);
    setFileName(null);
    setReadError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setResults(null);
    setReadError(null);
    try {
      const { rows: read, unknownHeaders: unknown } = await readWorkbook(file);
      setRows(read);
      setUnknownHeaders(unknown);
      setFileName(file.name);
      if (!read.length) toast.error("That sheet has no rows under its headings");
    } catch (err) {
      // A file that cannot be read is said so, rather than an empty preview
      // that looks like an empty register.
      setRows([]);
      setReadError(err);
    } finally {
      setReading(false);
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!checked.ready.length) return;
    setImporting(true);
    try {
      const { data } = await apiClient.post("/admissions/bulk-import", {
        dry_run: dryRun,
        rows: checked.ready.map((r) => ({
          line: r.line,
          class_section_id: r.classSectionId,
          values: r.values,
        })),
      });
      setResults(data?.rows ?? []);
      if (dryRun) {
        toast.success(`Checked ${data?.rows?.length ?? 0} rows — nothing has been saved yet`);
      } else if (data?.created) {
        toast.success(`${data.created} student${data.created === 1 ? "" : "s"} added to the roll`);
        onImported();
      } else {
        toast.error("No students were added — see the report below");
      }
    } catch (err: any) {
      // The import is never reported as done when it was not.
      toast.error(err?.response?.data?.detail ?? "The import could not be run");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PanelCard
        title="Import a register"
        description="For a school moving in: bring the students you already have, from the spreadsheet you already keep."
        actions={
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await downloadImportTemplate({ classes, sections });
              } catch (err: any) {
                toast.error(err?.message ?? "The template could not be built");
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Download template
          </Button>
        }
      >
        <div className="space-y-4">
          <ol className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
            <li className="rounded-xl border p-3">
              <span className="font-semibold text-foreground">1. Download the template</span>
              <p className="mt-0.5">
                It lists your own classes and sections on a second sheet, so the names match.
              </p>
            </li>
            <li className="rounded-xl border p-3">
              <span className="font-semibold text-foreground">2. Fill in the register</span>
              <p className="mt-0.5">
                One row per child. Leave a cell blank rather than guessing — a blank stays blank.
              </p>
            </li>
            <li className="rounded-xl border p-3">
              <span className="font-semibold text-foreground">3. Upload and check</span>
              <p className="mt-0.5">
                Nothing is saved until you press Import, and you see every problem first.
              </p>
            </li>
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={reading}>
              {reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {fileName ? "Choose a different file" : "Upload filled template"}
            </Button>
            {fileName ? (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileSpreadsheet className="h-4 w-4" /> {fileName}
                <Button variant="ghost" size="sm" onClick={reset}>
                  Clear
                </Button>
              </span>
            ) : null}
          </div>

          {readError ? (
            <Card className="rounded-2xl border-rose-200 dark:border-rose-900">
              <ErrorState
                title="That file could not be read"
                error={readError}
                onRetry={() => fileRef.current?.click()}
              />
            </Card>
          ) : null}

          {unknownHeaders.length ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mr-1.5 inline h-4 w-4" />
              These columns are not part of the template and were ignored:{" "}
              <span className="font-medium">{unknownHeaders.join(", ")}</span>. Nothing from them was imported.
            </p>
          ) : null}
        </div>
      </PanelCard>

      {rows.length ? (
        <>
          <StatTiles
            stats={[
              { label: "Rows in the file", value: rows.length },
              {
                label: "Ready to import",
                value: checked.ready.length,
                tone: checked.ready.length ? "positive" : "default",
              },
              {
                label: "Held back",
                value: checked.blockedLines.length,
                tone: checked.blockedLines.length ? "danger" : "default",
                hint: checked.blockedLines.length ? "These rows have an error and will be skipped" : "None",
              },
              {
                label: "Worth a look",
                value: warnings.length,
                tone: warnings.length ? "warning" : "default",
                hint: warnings.length ? "Imported anyway — check them afterwards" : "None",
              },
            ]}
          />

          {checked.problems.length ? (
            <PanelCard
              title={`${errors.length} to fix, ${warnings.length} to check`}
              description="Each one names the row and column in your file. Fix them there and upload again."
              flush
            >
              <div className="max-h-72 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead className="w-44">Column</TableHead>
                      <TableHead>What is wrong</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checked.problems.map((p, i) => (
                      <TableRow key={`${p.line}-${p.column}-${i}`}>
                        <TableCell className="font-mono text-xs">{p.line}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={p.level === "error" ? "destructive" : "outline"} className="font-normal">
                            {p.column}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{p.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PanelCard>
          ) : null}

          <PanelCard
            title={`${checked.ready.length} students will be added`}
            description={
              checked.blockedLines.length
                ? `Rows ${checked.blockedLines.join(", ")} are held back until they are fixed.`
                : "Every row in the file is ready."
            }
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void runImport(true)} disabled={importing || !checked.ready.length}>
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Check without saving
                </Button>
                <Button onClick={() => void runImport(false)} disabled={importing || !checked.ready.length}>
                  {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                  Import {checked.ready.length} students
                </Button>
              </div>
            }
            flush
          >
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Guardian</TableHead>
                    <TableHead>Date of birth</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checked.ready.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="font-mono text-xs">{r.line}</TableCell>
                      <TableCell className="font-medium">
                        {[r.values.first_name, r.values.last_name].filter(Boolean).join(" ")}
                      </TableCell>
                      <TableCell>
                        {r.className}
                        {r.sectionName ? ` · ${r.sectionName}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.values.parent_name ?? "—"}
                        {r.values.parent_phone ? ` · ${r.values.parent_phone}` : ""}
                      </TableCell>
                      {/* An em dash, never a stand-in date. */}
                      <TableCell className="text-sm">{r.values.date_of_birth ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </PanelCard>
        </>
      ) : !reading && !readError ? (
        <Card className="rounded-2xl">
          <EmptyState
            icon={FileSpreadsheet}
            title="No file loaded"
            description="Download the template, fill in your register, and upload it here. You will see everything that is about to happen before anything is saved."
          />
        </Card>
      ) : null}

      {results ? (
        <PanelCard
          title="What happened"
          description="One line per row, as the server reported it."
          flush
        >
          <div className="max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="font-mono text-xs">{r.line}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Added
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="h-4 w-4" /> {r.reason ?? "Not added"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </PanelCard>
      ) : null}
    </div>
  );
}
