import { useState } from "react";
import {
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageCircle,
  Printer,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canShareFiles, describeShare } from "@/lib/documents";
import {
  exportCSV,
  exportExcel,
  exportJSON,
  exportPDF,
  printReport,
  shareReport,
  type ExportRow,
  type PrintOptions,
} from "@/lib/report-export";

export type ExportFormat = "excel" | "pdf" | "print" | "share" | "csv" | "json";

export interface DataExportMenuProps {
  /** What the report is: "Fee Defaulters". Used for the letterhead and file name. */
  title: string;
  /** What it covers: "September 2026 · Grade 7". */
  subtitle?: string;
  rows: ExportRow[];
  columns?: PrintOptions["columns"];
  summary?: PrintOptions["summary"];
  sections?: PrintOptions["sections"];
  filters?: PrintOptions["filters"];
  note?: string;
  orientation?: "portrait" | "landscape";
  /** File name parts, most specific first. Defaults to title and subtitle. */
  fileNameParts?: Array<string | null | undefined>;
  /** Rows are loaded on demand, e.g. the full data set rather than one page. */
  loadRows?: () => Promise<ExportRow[]>;
  label?: string;
  disabled?: boolean;
  variant?: "outline" | "soft" | "hero" | "ghost" | "default" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  hide?: Partial<Record<ExportFormat, boolean>>;
}

/**
 * Every way a report leaves the app, in one menu, on the school's letterhead:
 * branded Excel, PDF, print, WhatsApp, CSV and JSON.
 *
 * Every action reports what actually happened. A failure says so; a file
 * produced without the school logo says that too; a share on a desktop browser
 * that cannot attach files says the file was downloaded to attach by hand.
 */
export function DataExportMenu({
  title,
  subtitle,
  rows,
  columns,
  summary,
  sections,
  filters,
  note,
  orientation,
  fileNameParts,
  loadRows,
  label = "Export",
  disabled,
  variant = "outline",
  size = "sm",
  hide,
}: DataExportMenuProps) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const options = async (): Promise<PrintOptions> => ({
    title,
    subtitle,
    rows: loadRows ? await loadRows() : rows,
    columns,
    summary,
    sections,
    filters,
    note,
    orientation,
    fileNameParts: fileNameParts ?? [title, subtitle],
  });

  const nothing = !loadRows && (!rows || rows.length === 0) && !(sections ?? []).some((s) => s.rows.length);

  const run = (format: ExportFormat, action: (opts: PrintOptions, id: string | number) => Promise<void>) => async () => {
    if (nothing) {
      toast.error("There is nothing to export yet.");
      return;
    }
    setBusy(format);
    const id = toast.loading("Preparing…");
    try {
      await action(await options(), id);
    } catch (e: any) {
      toast.error(e?.message ? `Could not complete: ${e.message}` : "Could not complete the export", { id });
    } finally {
      setBusy(null);
    }
  };

  const withWarnings = (id: string | number, success: string, warnings: string[]) => {
    if (warnings.length) toast.warning(`${success}, but ${warnings.join("; ")}`, { id, duration: 9000 });
    else toast.success(success, { id });
  };

  const onExcel = run("excel", async (opts, id) => {
    const result = await exportExcel(opts);
    withWarnings(id, `Downloaded ${result.fileName}`, result.warnings);
  });

  const onPdf = run("pdf", async (opts, id) => {
    const result = await exportPDF(opts);
    withWarnings(id, `Downloaded ${result.fileName} · ${result.pages} page${result.pages === 1 ? "" : "s"}`, result.warnings);
  });

  const onPrint = run("print", async (opts, id) => {
    const { warnings } = await printReport(opts);
    if (warnings.length) toast.warning(`Sent to print, but ${warnings.join("; ")}`, { id, duration: 9000 });
    else toast.dismiss(id);
  });

  const onShare = (format: "pdf" | "xlsx") =>
    run("share", async (opts, id) => {
      const outcome = await shareReport(opts, format);
      const { tone, message } = describeShare(outcome);
      const full = outcome.warnings.length ? `${message} (${outcome.warnings.join("; ")})` : message;
      if (tone === "error") toast.error(full, { id });
      else if (tone === "success") toast.success(full, { id });
      else toast.info(full, { id, duration: 9000 });
    });

  const onCsv = run("csv", async (opts, id) => {
    const name = exportCSV(opts.rows, title, opts.fileNameParts);
    toast.success(`Downloaded ${name}`, { id });
  });

  const onJson = run("json", async (opts, id) => {
    const name = exportJSON(opts.rows, title, opts.fileNameParts);
    toast.success(`Downloaded ${name}`, { id });
  });

  const nativeShare = canShareFiles();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled || busy !== null} className="gap-2" data-print="hide" aria-busy={busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
          On your school letterhead
        </DropdownMenuLabel>
        {!hide?.excel && (
          <DropdownMenuItem onClick={onExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
            <span className="flex-1">Excel workbook</span>
            <span className="text-[10px] text-muted-foreground">.xlsx</span>
          </DropdownMenuItem>
        )}
        {!hide?.pdf && (
          <DropdownMenuItem onClick={onPdf}>
            <FileDown className="mr-2 h-4 w-4 text-red-600" />
            <span className="flex-1">PDF document</span>
            <span className="text-[10px] text-muted-foreground">.pdf</span>
          </DropdownMenuItem>
        )}
        {!hide?.print && (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" />
            <span className="flex-1">Print</span>
          </DropdownMenuItem>
        )}
        {!hide?.share && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
              Share {nativeShare ? "" : "· downloads, then opens WhatsApp"}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={onShare("pdf")}>
              <MessageCircle className="mr-2 h-4 w-4 text-green-600" />
              <span className="flex-1">WhatsApp — PDF</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShare("xlsx")}>
              <Share2 className="mr-2 h-4 w-4 text-green-600" />
              <span className="flex-1">WhatsApp — Excel</span>
            </DropdownMenuItem>
          </>
        )}
        {(!hide?.csv || !hide?.json) && <DropdownMenuSeparator />}
        {!hide?.csv && (
          <DropdownMenuItem onClick={onCsv}>
            <FileText className="mr-2 h-4 w-4 text-primary" />
            <span className="flex-1">CSV (data only)</span>
            <span className="text-[10px] text-muted-foreground">.csv</span>
          </DropdownMenuItem>
        )}
        {!hide?.json && (
          <DropdownMenuItem onClick={onJson}>
            <FileJson className="mr-2 h-4 w-4 text-amber-500" />
            <span className="flex-1">JSON (integrations)</span>
            <span className="text-[10px] text-muted-foreground">.json</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
