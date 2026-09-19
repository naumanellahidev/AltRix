/**
 * Report exports — every format, on the school's letterhead.
 *
 * Kept as the module the report screens already import, rebuilt on the shared
 * document system (`src/lib/documents`):
 *
 *  - Excel is a real .xlsx with the school's crest, name and colour, typed
 *    numbers and dates, live totals, frozen headers and print setup. It used to
 *    be an HTML table renamed .xls, which Excel opened with a warning and read
 *    as text.
 *  - PDF is a real downloaded file. "Save as PDF" used to open the print
 *    dialog and hope the user chose the right destination.
 *  - Print prints that same PDF, so paper, file and screen agree, with page
 *    numbers — the old print template printed "Page" followed by nothing.
 *  - CSV carries a byte-order mark so Urdu opens correctly, and is guarded
 *    against formula injection.
 *  - Files are named after what they contain.
 *  - No caller-supplied HTML is ever written into a page. The old `extraHtml`
 *    let user-entered text (an expense category) run as markup in a
 *    same-origin window.
 */
import {
  buildSpreadsheet,
  buildTableReport,
  exportCsv,
  inferColumns,
  print as printPdf,
  shareFile,
  triggerDownload,
  type ReportSection,
  type SheetColumn,
  type ShareOutcome,
  type SpreadsheetResult,
} from "@/lib/documents";
import { documentFileName, todayLabel } from "@/lib/documents/format";

export type ExportRow = Record<string, string | number | null | undefined>;
export type { ReportSection };

export interface PrintOptions {
  title: string;
  subtitle?: string;
  rows: ExportRow[];
  /** Column definitions. Inferred from the rows when omitted. */
  columns?: SheetColumn[];
  /** Headline figures shown above the table. */
  summary?: Array<{ label: string; value: string | number }>;
  /** Further tables, each under its own heading. Replaces the old `extraHtml`. */
  sections?: ReportSection[];
  /** Filters the report was run with, printed so a subset says it is one. */
  filters?: Array<{ label: string; value: string | null | undefined }>;
  /** Parts of the file name. Defaults to the title and subtitle. */
  fileNameParts?: Array<string | null | undefined>;
  /** Accepted for compatibility; the school's own name is always used. */
  schoolName?: string;
  brandColor?: string;
  contactLine?: string;
  note?: string;
  orientation?: "portrait" | "landscape";
}

function partsFor(opts: { title: string; subtitle?: string; fileNameParts?: PrintOptions["fileNameParts"] }) {
  return opts.fileNameParts ?? [opts.title, opts.subtitle];
}

/** CSV download. Returns the file name. */
export function exportCSV(rows: ExportRow[], baseName: string, fileNameParts?: PrintOptions["fileNameParts"]) {
  return exportCsv(rows, fileNameParts ?? [humanBase(baseName)]);
}

/** JSON download, for integrations. Returns the file name. */
export function exportJSON(rows: ExportRow[], baseName: string, fileNameParts?: PrintOptions["fileNameParts"]) {
  const fileName = documentFileName([...(fileNameParts ?? [humanBase(baseName)]), todayLabel()], "json");
  triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" }), fileName);
  return fileName;
}

/** "fee-defaulters" → "Fee Defaulters", for callers that pass a slug. */
function humanBase(baseName: string): string {
  return baseName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function workbookFor(opts: PrintOptions) {
  return {
    fileNameParts: partsFor(opts),
    sheets: [
      {
        name: opts.title,
        title: opts.title,
        subtitle: opts.subtitle,
        filters: opts.filters,
        columns: opts.columns ?? inferColumns(opts.rows),
        rows: opts.rows,
        note: opts.note,
      },
      ...(opts.sections ?? []).map((section) => ({
        name: section.title,
        title: `${opts.title} — ${section.title}`,
        subtitle: opts.subtitle,
        columns: section.columns ?? inferColumns(section.rows),
        rows: section.rows,
        emptyMessage: section.emptyMessage,
      })),
    ],
  };
}

/**
 * Branded Excel workbook. Accepts either the old positional form
 * `(rows, baseName, title)` or a full `PrintOptions`.
 */
export async function exportExcel(
  rowsOrOptions: ExportRow[] | PrintOptions,
  baseName?: string,
  title?: string,
): Promise<SpreadsheetResult> {
  const opts: PrintOptions = Array.isArray(rowsOrOptions)
    ? { rows: rowsOrOptions, title: title ?? humanBase(baseName ?? "Report") }
    : rowsOrOptions;
  const result = await buildSpreadsheet(workbookFor(opts));
  triggerDownload(result.blob, result.fileName);
  return result;
}

async function reportPdf(opts: PrintOptions) {
  return buildTableReport({
    title: opts.title,
    subtitle: opts.subtitle,
    summary: opts.summary,
    filters: opts.filters,
    columns: opts.columns,
    rows: opts.rows,
    sections: opts.sections,
    note: opts.note ?? null,
    orientation: opts.orientation,
    fileNameParts: partsFor(opts),
  });
}

/** A real PDF file, downloaded. Resolves with the file name and any warnings. */
export async function exportPDF(opts: PrintOptions): Promise<{ fileName: string; warnings: string[]; pages: number }> {
  const { doc, fileName, warnings } = await reportPdf(opts);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings, pages: doc.pages };
}

/**
 * Print the report. Prints the same PDF the download produces, so the paper
 * copy has the letterhead, repeated table headers and "Page X of Y".
 */
export async function printReport(opts: PrintOptions): Promise<{ warnings: string[] }> {
  const { doc, warnings } = await reportPdf(opts);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the report could not be sent to the printer");
  return { warnings };
}

/** Share the report — on a phone, straight into WhatsApp. */
export async function shareReport(opts: PrintOptions, format: "pdf" | "xlsx" = "pdf"): Promise<ShareOutcome & { warnings: string[] }> {
  if (format === "xlsx") {
    const result = await buildSpreadsheet(workbookFor(opts));
    const outcome = await shareFile(result.blob, result.fileName, { title: opts.title, text: `${opts.title}${opts.subtitle ? ` — ${opts.subtitle}` : ""}` });
    return { ...outcome, warnings: result.warnings };
  }
  const { doc, fileName, warnings } = await reportPdf(opts);
  const outcome = await shareFile(doc.blob(), fileName, { title: opts.title, text: `${opts.title}${opts.subtitle ? ` — ${opts.subtitle}` : ""}` });
  return { ...outcome, warnings };
}

/**
 * Header-plus-rows tables — the shape the hand-built CSV exports used — as the
 * keyed rows every export format takes. Headers become the column names.
 */
export function rowsFromTable(header: string[], body: unknown[][]): ExportRow[] {
  return body.map((cells) => {
    const row: ExportRow = {};
    header.forEach((h, i) => {
      const v = cells[i];
      row[h] = v === undefined || v === null ? null : typeof v === "number" ? v : String(v);
    });
    return row;
  });
}
