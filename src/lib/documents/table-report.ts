/**
 * A tabular report as a finished PDF: the defaulters list, the ledger, the
 * attendance summary, the payroll register.
 *
 * The screens that offered "Save as PDF" opened the browser's print dialog and
 * hoped the user picked the right destination; nothing was ever downloaded. This
 * produces the file itself, on the same letterhead as every other document the
 * school issues, with its crest, summary figures above the table, typed and
 * aligned columns, a totals row, a header that repeats on every page and
 * "Page X of Y" at the foot.
 */
import { type LoadedImage } from "./assets";
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { sum } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { ABSENT, date as formatDate, dateTime, documentFileName, marks, money, todayLabel } from "./format";
import { type ColumnType, type SheetColumn, inferColumns } from "./spreadsheet";
import { type Column, drawTable } from "./table";
import { readableOn } from "./theme";

export interface TableReportSpec<Row = Record<string, unknown>> {
  title: string;
  subtitle?: string | null;
  /** Headline figures above the table: "Total due", "Students". */
  summary?: Array<{ label: string; value: string | number | null | undefined }>;
  filters?: Array<{ label: string; value: string | null | undefined }>;
  columns?: SheetColumn<Row>[];
  rows: Row[];
  totalsLabel?: string;
  emptyMessage?: string;
  note?: string | null;
  orientation?: "portrait" | "landscape";
  /**
   * Further tables after the main one, each under its own heading — a
   * consolidated report's cash flow, expense breakdown and P&L.
   */
  sections?: Array<ReportSection>;
  fileNameParts?: Array<string | null | undefined>;
  brand?: SchoolBrand;
  currency?: string;
  generatedBy?: string | null;
}

export interface ReportSection {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns?: SheetColumn<any>[];
  totalsLabel?: string;
  emptyMessage?: string;
}

export interface TableReportResult {
  doc: PdfDocument;
  fileName: string;
  warnings: string[];
}

function display(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return "";
  switch (type) {
    case "money":
      return money(value as string | number);
    case "number":
      return marks(value as string | number);
    case "integer": {
      const n = Number(String(value).replace(/,/g, ""));
      return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : String(value);
    }
    case "percent": {
      const s = String(value).replace(/%$/, "");
      const m = marks(s, { places: 1 });
      return m === ABSENT ? String(value) : `${m}%`;
    }
    // Only real dates are reformatted. A label such as "Sep 12" would parse
    // as 12 September 2001 and print the wrong year.
    case "date": {
      if (!(value instanceof Date) && !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value);
      const shown = formatDate(value as string);
      return shown === ABSENT ? String(value) : shown;
    }
    case "datetime": {
      if (!(value instanceof Date) && !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value);
      const shown = dateTime(value as string);
      return shown === ABSENT ? String(value) : shown;
    }
    default:
      if (typeof value === "boolean") return value ? "Yes" : "No";
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
  }
}

function logoFor(brand: SchoolBrand): string | null {
  const logo: LoadedImage | null = brand.logo;
  if (!logo) return null;
  return logo.format === "PNG" || logo.format === "JPEG" ? logo.data : null;
}

/** One typed, formatted table with an optional totals row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTypedTable<Row extends Record<string, any>>(
  doc: PdfDocument,
  rows: Row[],
  columns: SheetColumn<Row>[],
  opts: { currency: string; totalsLabel?: string; emptyMessage?: string },
): void {
  const currency = opts.currency;
  const spec = { rows, totalsLabel: opts.totalsLabel, emptyMessage: opts.emptyMessage };
  const pdfColumns: Column<Row>[] = columns.map((c) => {
    const type = c.type ?? "text";
    const numeric = ["money", "number", "integer", "percent"].includes(type);
    const header = type === "money" && !/\(.*\)/.test(c.header) ? `${c.header} (${currency})` : c.header;
    const base = numeric ? 1 : type === "date" || type === "datetime" ? 1.1 : 1.6;
    return {
      header,
      width: c.width ? c.width / 10 : base,
      align: c.align ?? (numeric ? "right" : "left"),
      value: (row: Row, index: number) => display(c.value ? c.value(row, index) : c.key ? row[c.key] : undefined, type),
    };
  });

  const totalsRow: Record<string, string> | null = spec.rows.length && columns.some((c) => c.total) ? {} : null;
  let footerRows: Row[] = [];
  if (totalsRow) {
    const labelIndex = columns.findIndex((c) => !c.total);
    const totals = columns.map((c, i) => {
      const values = spec.rows.map((r, idx) => (c.value ? c.value(r, idx) : c.key ? r[c.key] : undefined));
      if (c.total === "sum") {
        return c.type === "money" ? money(sum(values as never[])) : display(sum(values as never[], 3), c.type ?? "number");
      }
      if (c.total === "count") return String(values.filter((v) => v !== null && v !== undefined && v !== "").length);
      if (c.total === "average") {
        const present = values.filter((v) => v !== null && v !== undefined && v !== "");
        if (!present.length) return "";
        const total = Number(sum(present as never[], 3));
        return display(total / present.length, c.type ?? "number");
      }
      return i === (labelIndex < 0 ? 0 : labelIndex) ? spec.totalsLabel ?? "Total" : "";
    });
    // The totals row is drawn through the same columns, so it carries its own
    // pre-formatted strings keyed by position.
    footerRows = [{ __totals: totals } as unknown as Row];
    pdfColumns.forEach((col, i) => {
      const original = col.value;
      col.value = (row: Row, index: number) =>
        (row as unknown as { __totals?: string[] }).__totals ? (row as unknown as { __totals: string[] }).__totals[i] : original(row, index);
    });
  }

  drawTable(doc, {
    columns: pdfColumns,
    rows: spec.rows,
    footerRows,
    emptyMessage: spec.emptyMessage ?? "No records match this report.",
    fontSize: pdfColumns.length > 8 ? 7 : doc.theme.size.small,
  });

}

/** Build the PDF. Does not download it. */
export async function buildTableReport<Row extends Record<string, unknown>>(
  spec: TableReportSpec<Row>,
): Promise<TableReportResult> {
  const warnings: string[] = [];
  const brand = spec.brand ?? (await loadActiveSchoolBrand());
  if (brand.logoProblem) warnings.push(brand.logoProblem);

  const columns = (spec.columns ?? (inferColumns(spec.rows) as SheetColumn<Row>[])) as SheetColumn<Row>[];
  const orientation = spec.orientation ?? (columns.length > 6 ? "landscape" : "portrait");
  const currency = spec.currency ?? "Rs.";

  const doc = await createDocumentAsync({
    title: spec.title,
    subtitle: spec.subtitle ?? todayLabel(),
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: logoFor(brand),
    },
    accent: brand.accentHex,
    orientation,
    reference: null,
    footerNote: `Generated ${dateTime(new Date())}${spec.generatedBy ? ` by ${spec.generatedBy}` : ""}`,
  });

  // ── Filters ──
  const filters = (spec.filters ?? []).filter((f) => f.value != null && String(f.value).trim() !== "");
  if (filters.length) {
    doc.text(`Filters: ${filters.map((f) => `${f.label}: ${f.value}`).join("   ·   ")}`, {
      size: doc.theme.size.small,
      color: doc.theme.inkMuted,
      style: "italic",
      spaceAfter: 2,
    });
  }

  // ── Summary tiles ──
  const tiles = (spec.summary ?? []).filter((s) => s.value !== null && s.value !== undefined && String(s.value) !== "");
  if (tiles.length) {
    const perRow = Math.min(tiles.length, orientation === "landscape" ? 5 : 4);
    const gap = 3;
    const tileW = (doc.width - gap * (perRow - 1)) / perRow;
    const tileH = 15;
    const rowsNeeded = Math.ceil(tiles.length / perRow);
    doc.ensureSpace(rowsNeeded * (tileH + gap));
    tiles.forEach((tile, i) => {
      const x = doc.x + (i % perRow) * (tileW + gap);
      const y = doc.y + Math.floor(i / perRow) * (tileH + gap);
      doc.pdf.setFillColor(...doc.theme.accentWash);
      doc.pdf.roundedRect(x, y, tileW, tileH, 1.6, 1.6, "F");
      doc.pdf.setFillColor(...doc.theme.accent);
      doc.pdf.rect(x, y + 2.5, 1.1, tileH - 5, "F");
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(doc.theme.size.caption);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(String(tile.label).toUpperCase(), x + 4, y + 5);
      doc.pdf.setFontSize(12.5);
      doc.pdf.setTextColor(...doc.theme.ink);
      doc.pdf.text(doc.pdf.splitTextToSize(String(tile.value), tileW - 6)[0] as string, x + 4, y + 11.5);
    });
    doc.advance(rowsNeeded * (tileH + gap) + 1);
  }

  drawTypedTable(doc, spec.rows, columns, { currency, totalsLabel: spec.totalsLabel, emptyMessage: spec.emptyMessage });

  for (const section of spec.sections ?? []) {
    doc.sectionTitle(section.title);
    drawTypedTable(doc, section.rows, section.columns ?? inferColumns(section.rows), {
      currency,
      totalsLabel: section.totalsLabel,
      emptyMessage: section.emptyMessage,
    });
  }

  doc.advance(1);
  doc.text(`${spec.rows.length} record${spec.rows.length === 1 ? "" : "s"}`, {
    size: doc.theme.size.caption,
    color: doc.theme.inkMuted,
    align: "right",
  });
  if (spec.note) doc.note(spec.note);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" contains characters that could not be printed`);

  const fileName = documentFileName([...(spec.fileNameParts ?? [spec.title, spec.subtitle]), brand.name, todayLabel()], "pdf");
  return { doc, fileName, warnings };
}

/** Header text colour on the school's brand — exported for screens that preview it. */
export function headerTextFor(brand: SchoolBrand): string {
  const [r, g, b] = readableOn(brand.accent);
  return `rgb(${r}, ${g}, ${b})`;
}
