/**
 * The document system.
 *
 * One place that owns how this product puts things on paper: the page, the
 * margins, the type, the school's branding, tables that survive a page break,
 * page numbers, signature blocks, verification marks, and how a finished
 * document reaches the person who asked for it.
 *
 * Before this, fifteen modules each answered those questions differently, and
 * the shared exporter answered them by screenshotting the page. A report card
 * and a fee voucher from the same school did not look like they came from the
 * same school.
 *
 * Start with `createDocument`, draw with the methods on it, and deliver with
 * `download`, `print` or `generateArchive`.
 *
 * ```ts
 * const doc = createDocument({
 *   title: "Fee Voucher",
 *   subtitle: invoice.number,
 *   school,
 *   accent: school.brandColor,
 *   reference: invoice.number,
 *   watermark: invoice.isCopy ? "duplicate" : "none",
 * });
 *
 * doc.fields([
 *   { label: "Student", value: student.name },
 *   { label: "Class", value: student.className },
 * ]);
 *
 * drawTable(doc, { columns, rows: invoice.lines });
 * drawSummary(doc, [{ label: "Total", value: money(invoice.total, { currency: "PKR" }), emphasis: true }]);
 * doc.signatures([{ title: "Accounts Officer" }, { title: "Received By" }]);
 *
 * const result = download(doc);
 * const { tone, message } = describe(result);
 * ```
 */

export {
  PdfDocument,
  createDocument,
  createDocumentAsync,
  DEFAULT_THEME,
  readableOn,
} from "./document";
export type {
  DocumentOptions,
  DocumentSchool,
  DocumentTheme,
  Rgb,
  TextOptions,
  Watermark,
} from "./document";

export {
  COMPACT_MARGINS,
  DEFAULT_MARGINS,
  MM_PER_PT,
  geometry,
  mmToPt,
  ptToMm,
} from "./paper";
export type { Margins, Orientation, PageSize, PaperGeometry } from "./paper";

export { hslToRgb, parseColor, themeFor, tint } from "./theme";

export {
  DEFAULT_UNICODE_FONT,
  applyLoadedUnicodeFont,
  ensureUnicodeFontLoaded,
  installTextSafety,
  isArabicScript,
  needsUnicodeFont,
  preloadUnicodeFont,
  registerUnicodeFontData,
  seedUnicodeFont,
  toWinAnsi,
  unsupportedText,
  useUnicodeFont,
} from "./fonts";
export type { UnicodeFontSource } from "./fonts";

export { drawSummary, drawTable } from "./table";
export type { CellAlign, Column, TableOptions } from "./table";

export {
  ABSENT,
  date,
  dateTime,
  documentFileName,
  todayLabel,
  marks,
  money,
  name,
  outOf,
  percent,
  roundDecimalString,
  slug,
  text,
} from "./format";
export type { DateInput, MoneyOptions, Numeric } from "./format";

export {
  amountInWords,
  amountInWordsFor,
  atLeastZero,
  compare,
  fromMinor,
  isPositive,
  isZero,
  percentOf,
  subtract,
  sum,
  toMinor,
} from "./decimal";
export type { AmountInWordsOptions } from "./decimal";

export {
  clearImageCache,
  fit,
  loadImage,
  loadImages,
  tryLoadImage,
} from "./assets";
export type { ImageLoadFailure, LoadedImage } from "./assets";

export {
  certificateVerificationUrl,
  drawQrVector,
  drawVerification,
  qrDataUri,
  reportCardVerificationUrl,
} from "./verify";
export type { VerificationTarget } from "./verify";

export { activeSchoolBrandSync, clearSchoolBrandCache, loadActiveSchoolBrand } from "./brand";
export type { SchoolBrand } from "./brand";

export {
  buildCsv,
  buildSpreadsheet,
  exportCsv,
  exportRowsToSpreadsheet,
  exportSpreadsheet,
  humanize,
  inferColumns,
} from "./spreadsheet";
export type { ColumnType, SheetColumn, SheetSpec, SpreadsheetResult, WorkbookSpec } from "./spreadsheet";

export { exportDomToPdf, parseCssColor, renderDomToPdf } from "./dom-to-pdf";
export type { DomPdfOptions, DomPdfResult } from "./dom-to-pdf";

export { buildTableReport, headerTextFor } from "./table-report";
export {
  buildReportCard,
  downloadReportCard,
  downloadReportCardSet,
  fetchReportCardDetail,
  printReportCard,
  shareReportCard,
} from "./report-card";
export type { GradeBand, ReportCardDetail, ReportCardResult } from "./report-card";
export { buildPayslips } from "./payslip";
export { buildReceipt, downloadReceipt, printReceipt, shareReceipt } from "./receipt";
export type { ReceiptInput } from "./receipt";
export { buildInvoice, downloadInvoice, printInvoice, shareInvoice } from "./invoice";
export type { InvoiceInput } from "./invoice";
export { buildIdCardSheets } from "./id-card";
export type { IdCardSettings, IdCardSheetResult, IdCardStudent } from "./id-card";
export {
  buildCertificate,
  certificateWording,
  downloadCertificate,
  fetchCertificateDetail,
  printCertificate,
  shareCertificate,
} from "./certificate";
export type { CertificateDetail, CertificateResult, Signatory } from "./certificate";
export { buildAdmitCards } from "./admit-card";
export type { AdmitCardResult, AdmitMeta, AdmitPaper, AdmitStudent } from "./admit-card";
export { buildTimetable, downloadTimetable, printTimetable, shareTimetable } from "./timetable";
export type { TimetableEntryInput, TimetableInput, TimetablePeriodInput } from "./timetable";
export type { PayslipInput, PayslipResult } from "./payslip";
export type { ReportSection, TableReportResult, TableReportSpec } from "./table-report";

export { canShareFiles, describeShare, printBlob, shareFile } from "./deliver";
export type { ShareOutcome } from "./deliver";

export {
  describe,
  download,
  failed,
  generateArchive,
  openInTab,
  print,
  succeeded,
  triggerDownload,
} from "./deliver";
export type {
  BulkItem,
  BulkOptions,
  BulkResult,
  GenerationResult,
  GenerationWarning,
} from "./deliver";
