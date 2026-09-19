/**
 * Spreadsheets a school can hand to anyone.
 *
 * The app's "Excel" export was an HTML table saved with an .xls extension. Excel
 * opened it with a warning that the file was not what it claimed to be, every
 * number came through as text so nothing could be summed or sorted, and the
 * school name at the top was read from a storage key the app no longer wrote,
 * so it was always blank. The CSV exports had no byte-order mark, which is why
 * Urdu names opened in Excel as rows of accented Latin letters.
 *
 * This writes a real .xlsx workbook:
 *
 *  - A letterhead: the school's crest, its name in its own colour, the report
 *    title, the filters or period it covers, and when it was generated.
 *  - A header row in the school's colour, frozen in place and filterable.
 *  - Real types: amounts are numbers with thousands separators, dates are
 *    dates, percentages are percentages — so Excel can sort, filter and sum
 *    them. Nothing absent is written as zero.
 *  - Optional totals, as live SUM formulas rather than typed-in figures.
 *  - Urdu cells aligned right-to-left.
 *  - Print-ready: A4, fitted to the page width, the header row repeated on
 *    every printed page, and "Page X of Y" in the footer.
 */
import type { Workbook, Worksheet } from "exceljs";

import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { triggerDownload } from "./deliver";
import { isArabicScript } from "./fonts";
import { documentFileName, todayLabel } from "./format";
import { tint } from "./theme";

export type ColumnType = "text" | "number" | "integer" | "money" | "percent" | "date" | "datetime";

export interface SheetColumn<Row = Record<string, unknown>> {
  header: string;
  /** Read the value from this key when `value` is not given. */
  key?: string;
  value?: (row: Row, index: number) => unknown;
  type?: ColumnType;
  /** Width in characters. Measured from the content when omitted. */
  width?: number;
  /** A totals-row formula for this column. */
  total?: "sum" | "average" | "count" | "min" | "max";
  align?: "left" | "center" | "right";
}

export interface SheetSpec<Row = Record<string, unknown>> {
  /** Tab name. Excel allows 31 characters. */
  name: string;
  /** The report's title, under the school's name. */
  title: string;
  /** Period, class, campus — what this report covers. */
  subtitle?: string | null;
  /** Filters the user applied, shown so a printout says what it is a subset of. */
  filters?: Array<{ label: string; value: string | null | undefined }>;
  columns: SheetColumn<Row>[];
  rows: Row[];
  /** Label for the totals row, when any column has `total`. */
  totalsLabel?: string;
  /** Shown instead of an empty table. */
  emptyMessage?: string;
  /** A line under the table: a disclaimer, a source. */
  note?: string | null;
}

export interface WorkbookSpec {
  /** Parts of the file name, most important first. The school name is added. */
  fileNameParts: Array<string | null | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: SheetSpec<any>[];
  /** Defaults to the active school. */
  brand?: SchoolBrand;
  /** Who generated it, for the workbook properties and the letterhead. */
  generatedBy?: string | null;
  /** Currency label used in money column headers. Default "Rs.". */
  currency?: string;
}

export interface SpreadsheetResult {
  fileName: string;
  blob: Blob;
  rows: number;
  warnings: string[];
}

// ─── Values ──────────────────────────────────────────────────────────────────

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s]/g, "").replace(/^(rs\.?|pkr|\$|£|€)/i, "").replace(/%$/, "");
    if (cleaned === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    // A bare YYYY-MM-DD is a calendar date, not midnight UTC; build it in local
    // time so it does not display as the day before.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** The cell value for a column type. Absent stays absent. */
function cellValue(raw: unknown, type: ColumnType): unknown {
  if (isBlank(raw)) return null;
  switch (type) {
    case "money":
    case "number":
    case "integer": {
      const n = toNumber(raw);
      return n === null ? String(raw) : n;
    }
    case "percent": {
      const n = toNumber(raw);
      // Stored as 0–100 across the app; Excel's percent format expects 0–1.
      return n === null ? String(raw) : n / 100;
    }
    case "date":
    case "datetime": {
      const d = toDate(raw);
      return d ?? String(raw);
    }
    default:
      if (typeof raw === "boolean") return raw ? "Yes" : "No";
      if (Array.isArray(raw)) return raw.join(", ");
      if (typeof raw === "object") return JSON.stringify(raw);
      return String(raw);
  }
}

const FORMATS: Record<ColumnType, string | undefined> = {
  text: "@",
  number: "#,##0.##",
  integer: "#,##0",
  money: "#,##0.00;[Red]-#,##0.00",
  percent: "0.0%",
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
};

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// ─── Inference, for callers that only have plain row objects ────────────────

const MONEY_KEY = /(amount|fee|fees|total|paid|balance|due|salary|price|cost|payable|fine|discount|revenue|expense|income|net|gross|deduction|allowance|bonus|tax|budget|outstanding)/i;
const PERCENT_KEY = /(percent|percentage|pct|rate|ratio|%)/i;
const DATE_KEY = /(date|_at$|_on$|dob|birth|joined|issued|due_on|deadline|time)/i;
const INTEGER_KEY = /(count|qty|quantity|days|number_of|students|staff|seats|capacity|periods|roll)/i;

/** "fee_amount" → "Fee Amount"; "createdAt" → "Created At". */
export function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bCnic\b/g, "CNIC");
}

/** Column specs guessed from a set of plain rows. */
export function inferColumns(rows: Array<Record<string, unknown>>): SheetColumn[] {
  const keys: string[] = [];
  for (const row of rows.slice(0, 50)) for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);

  return keys.map((key) => {
    const sample = rows.map((r) => r[key]).filter((v) => !isBlank(v)).slice(0, 25);
    const allNumeric = sample.length > 0 && sample.every((v) => toNumber(v) !== null);
    const allDates = sample.length > 0 && sample.every((v) => toDate(v) !== null);
    const looksLikeCode = /(phone|mobile|cnic|code|number|no$|roll_no|contact|account|iban|zip|postal|registration|admission)/i.test(key);

    let type: ColumnType = "text";
    if (allDates && DATE_KEY.test(key)) type = /_at$|time/i.test(key) ? "datetime" : "date";
    else if (allNumeric && !looksLikeCode) {
      const whole = sample.every((v) => Number.isInteger(toNumber(v)));
      // Counts first: "Total Students" is a head count, not an amount of money.
      if (PERCENT_KEY.test(key)) type = "percent";
      else if (INTEGER_KEY.test(key) && whole) type = "integer";
      else if (MONEY_KEY.test(key)) type = "money";
      else type = whole ? "integer" : "number";
    }
    return {
      header: humanize(key),
      key,
      type,
      total: type === "money" ? "sum" : undefined,
    } satisfies SheetColumn;
  });
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function writeSheet(
  workbook: Workbook,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: SheetSpec<any>,
  brand: SchoolBrand,
  context: { logoId: number | null; generatedBy?: string | null; currency: string; usedNames: Set<string> },
): { sheet: Worksheet; rows: number } {
  const accent = brand.accentHex;
  const wash = `#${tint(brand.accent, 0.92).map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const zebra = `#${tint(brand.accent, 0.965).map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const columns = spec.columns.length ? spec.columns : [{ header: "Value", key: "value" } as SheetColumn];
  const colCount = Math.max(columns.length, 3);
  const lastCol = columnLetter(colCount - 1);

  const sheet = workbook.addWorksheet(safeSheetName(spec.name, context.usedNames), {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9, // A4
      orientation: columns.length > 7 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
  });

  // ── Letterhead ────────────────────────────────────────────────────────────
  const textStart = context.logoId !== null ? 2 : 1; // column B when a logo sits in A
  const letterFrom = columnLetter(textStart - 1);

  const put = (row: number, value: string, font: Partial<import("exceljs").Font>, height?: number) => {
    const cellRef = `${letterFrom}${row}`;
    sheet.mergeCells(`${cellRef}:${lastCol}${row}`);
    const cell = sheet.getCell(cellRef);
    cell.value = value;
    cell.font = font;
    cell.alignment = { vertical: "middle", horizontal: "left", readingOrder: isArabicScript(value) ? "rtl" : "ltr" };
    if (height) sheet.getRow(row).height = height;
  };

  put(1, brand.name ?? "School", { name: "Calibri", size: 18, bold: true, color: { argb: argb(accent) } }, 28);
  put(2, spec.title, { name: "Calibri", size: 13, bold: true, color: { argb: "FF1F2937" } }, 20);

  const contact = [brand.address, brand.phone, brand.email].filter(Boolean).join("  ·  ");
  const generated = `Generated ${new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}${context.generatedBy ? ` by ${context.generatedBy}` : ""}`;
  put(3, [spec.subtitle, generated].filter(Boolean).join("  ·  "), { name: "Calibri", size: 10, color: { argb: "FF64748B" } });

  let row = 4;
  if (contact) {
    put(row, contact, { name: "Calibri", size: 9, color: { argb: "FF94A3B8" } });
    row += 1;
  }
  const filters = (spec.filters ?? []).filter((f) => !isBlank(f.value));
  if (filters.length) {
    put(row, `Filters: ${filters.map((f) => `${f.label}: ${f.value}`).join("  ·  ")}`, {
      name: "Calibri",
      size: 9,
      italic: true,
      color: { argb: "FF475569" },
    });
    row += 1;
  }

  if (context.logoId !== null) {
    sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 0, 11);
    sheet.addImage(context.logoId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 64, height: 64 }, editAs: "oneCell" });
  }

  // A rule in the school's colour under the letterhead.
  for (let c = 1; c <= colCount; c += 1) {
    sheet.getCell(row, c).border = { bottom: { style: "medium", color: { argb: argb(accent) } } };
  }
  sheet.getRow(row).height = 6;
  row += 2;

  // ── Header ────────────────────────────────────────────────────────────────
  const headerRow = row;
  columns.forEach((column, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    const label = column.type === "money" && !/\(.*\)/.test(column.header) ? `${column.header} (${context.currency})` : column.header;
    cell.value = label;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(accent) } };
    cell.alignment = {
      vertical: "middle",
      horizontal: column.align ?? (["money", "number", "integer", "percent"].includes(column.type ?? "text") ? "right" : "left"),
      wrapText: true,
    };
    cell.border = { top: { style: "thin", color: { argb: argb(accent) } }, bottom: { style: "thin", color: { argb: argb(accent) } } };
  });
  sheet.getRow(headerRow).height = 24;

  // ── Body ──────────────────────────────────────────────────────────────────
  const widths = columns.map((c) => Math.min(60, Math.max(8, (c.header.length + (c.type === "money" ? 6 : 0)) * 1.1)));
  const firstData = headerRow + 1;
  let r = firstData;

  if (!spec.rows.length) {
    sheet.mergeCells(`A${r}:${columnLetter(columns.length - 1)}${r}`);
    const cell = sheet.getCell(`A${r}`);
    cell.value = spec.emptyMessage ?? "No records match this report.";
    cell.font = { italic: true, color: { argb: "FF64748B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(r).height = 26;
    r += 1;
  }

  spec.rows.forEach((source, index) => {
    columns.forEach((column, i) => {
      const type = column.type ?? "text";
      const raw = column.value ? column.value(source, index) : column.key ? source?.[column.key] : undefined;
      const value = cellValue(raw, type);
      const cell = sheet.getCell(r, i + 1);
      cell.value = value as never;
      const numeric = typeof value === "number";
      const dated = value instanceof Date;
      if ((numeric || dated) && FORMATS[type]) cell.numFmt = FORMATS[type]!;
      const rtl = typeof value === "string" && isArabicScript(value);
      cell.font = { name: rtl ? "Arial" : "Calibri", size: 10, color: { argb: "FF111827" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: column.align ?? (rtl ? "right" : numeric ? "right" : dated ? "center" : "left"),
        readingOrder: rtl ? "rtl" : "ltr",
        wrapText: typeof value === "string" && value.length > 60,
      };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(zebra) } };

      const shown = dated ? 12 : numeric ? String(Math.round(Math.abs(value as number))).length + 5 : String(value ?? "").length;
      widths[i] = Math.min(60, Math.max(widths[i], shown * 1.05 + 2));
    });
    r += 1;
  });
  const lastData = r - 1;

  // ── Totals ────────────────────────────────────────────────────────────────
  if (spec.rows.length && columns.some((c) => c.total)) {
    const labelIndex = columns.findIndex((c) => !c.total);
    columns.forEach((column, i) => {
      const cell = sheet.getCell(r, i + 1);
      const letter = columnLetter(i);
      if (column.total) {
        const fn = { sum: "SUM", average: "AVERAGE", count: "COUNTA", min: "MIN", max: "MAX" }[column.total];
        cell.value = { formula: `${fn}(${letter}${firstData}:${letter}${lastData})` } as never;
        cell.numFmt = FORMATS[column.type ?? "number"] ?? "#,##0.00";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (i === (labelIndex < 0 ? 0 : labelIndex)) {
        cell.value = spec.totalsLabel ?? "Total";
      }
      cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF111827" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(wash) } };
      cell.border = { top: { style: "double", color: { argb: argb(accent) } }, bottom: { style: "thin", color: { argb: argb(accent) } } };
    });
    sheet.getRow(r).height = 22;
    r += 1;
  }

  if (spec.note) {
    r += 1;
    sheet.mergeCells(`A${r}:${lastCol}${r}`);
    const cell = sheet.getCell(`A${r}`);
    cell.value = spec.note;
    cell.font = { italic: true, size: 9, color: { argb: "FF64748B" } };
    cell.alignment = { wrapText: true, vertical: "top" };
    sheet.getRow(r).height = 30;
  }

  // ── Sheet mechanics ───────────────────────────────────────────────────────
  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width ?? Math.round(widths[i]);
  });
  if (context.logoId !== null) sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 0, 11);

  sheet.views = [{ state: "frozen", ySplit: headerRow, showGridLines: false, rightToLeft: false }];
  if (spec.rows.length) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastData, column: columns.length } };
  }
  sheet.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  sheet.pageSetup.printArea = `A1:${columnLetter(columns.length - 1)}${Math.max(r - 1, headerRow)}`;
  const schoolName = (brand.name ?? "").replace(/&/g, "&&");
  const titleText = spec.title.replace(/&/g, "&&");
  sheet.headerFooter = {
    oddFooter: `&L&8${schoolName}&C&8${titleText}&R&8Page &P of &N`,
    evenFooter: `&L&8${schoolName}&C&8${titleText}&R&8Page &P of &N`,
  };

  return { sheet, rows: spec.rows.length };
}

/** Build a branded workbook. Does not download it. */
export async function buildSpreadsheet(spec: WorkbookSpec): Promise<SpreadsheetResult> {
  const warnings: string[] = [];
  const brand = spec.brand ?? (await loadActiveSchoolBrand());
  if (brand.logoProblem) warnings.push(brand.logoProblem);

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = brand.name ?? "AltRix";
  workbook.company = brand.name ?? "";
  workbook.title = spec.sheets[0]?.title ?? "Report";
  workbook.created = new Date();
  workbook.modified = new Date();

  let logoId: number | null = null;
  if (brand.logo) {
    const extension = brand.logo.format === "JPEG" ? "jpeg" : brand.logo.format === "PNG" ? "png" : null;
    if (extension) {
      try {
        logoId = workbook.addImage({ base64: brand.logo.data, extension });
      } catch {
        warnings.push("the school logo could not be embedded in the spreadsheet");
      }
    } else {
      warnings.push("the school logo is in a format Excel cannot embed (use PNG or JPEG)");
    }
  }

  const usedNames = new Set<string>();
  let rows = 0;
  for (const sheet of spec.sheets) {
    rows += writeSheet(workbook, sheet, brand, {
      logoId,
      generatedBy: spec.generatedBy,
      currency: spec.currency ?? "Rs.",
      usedNames,
    }).rows;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = documentFileName([...spec.fileNameParts, brand.name, todayLabel()], "xlsx");
  return { fileName, blob, rows, warnings };
}

/** Build and download a branded workbook. */
export async function exportSpreadsheet(spec: WorkbookSpec): Promise<SpreadsheetResult> {
  const result = await buildSpreadsheet(spec);
  triggerDownload(result.blob, result.fileName);
  return result;
}

/**
 * Plain rows to a branded workbook, columns inferred. For the many screens that
 * already assemble an array of objects for export.
 */
export async function exportRowsToSpreadsheet(
  rows: Array<Record<string, unknown>>,
  options: {
    title: string;
    subtitle?: string | null;
    fileNameParts?: Array<string | null | undefined>;
    filters?: SheetSpec["filters"];
    columns?: SheetColumn[];
    currency?: string;
    generatedBy?: string | null;
  },
): Promise<SpreadsheetResult> {
  return exportSpreadsheet({
    fileNameParts: options.fileNameParts ?? [options.title, options.subtitle],
    currency: options.currency,
    generatedBy: options.generatedBy,
    sheets: [
      {
        name: options.title,
        title: options.title,
        subtitle: options.subtitle,
        filters: options.filters,
        columns: options.columns ?? inferColumns(rows),
        rows,
      },
    ],
  });
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // A leading =, +, - or @ makes Excel evaluate the cell as a formula — a
  // known way to smuggle a command into a spreadsheet someone else opens.
  const guarded = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * CSV for data interchange: other systems, imports, scripts.
 *
 * Written with a UTF-8 byte-order mark and CRLF line endings, which is what
 * Excel needs to open Urdu text correctly, and guarded against formula
 * injection.
 */
export function buildCsv(rows: Array<Record<string, unknown>>, columns?: SheetColumn[]): string {
  const cols = columns ?? inferColumns(rows);
  const header = cols.map((c) => csvEscape(c.header)).join(",");
  const lines = rows.map((row, i) =>
    cols
      .map((c) => {
        const raw = c.value ? c.value(row, i) : c.key ? row[c.key] : "";
        if (raw instanceof Date) return csvEscape(raw.toISOString().slice(0, 10));
        return csvEscape(raw);
      })
      .join(","),
  );
  return `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
}

export function exportCsv(
  rows: Array<Record<string, unknown>>,
  fileNameParts: Array<string | null | undefined>,
  columns?: SheetColumn[],
): string {
  const brand = activeBrandName();
  const fileName = documentFileName([...fileNameParts, brand, todayLabel()], "csv");
  triggerDownload(new Blob([buildCsv(rows, columns)], { type: "text/csv;charset=utf-8" }), fileName);
  return fileName;
}

function activeBrandName(): string | null {
  try {
    const slug = window.location.pathname.split("/").filter(Boolean)[0];
    const raw = slug ? localStorage.getItem(`eduverse_tenant_basic_${slug}`) : null;
    return raw ? JSON.parse(raw)?.data?.name ?? null : null;
  } catch {
    return null;
  }
}
