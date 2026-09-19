/**
 * Export an on-screen document as a PDF.
 *
 * Kept as the entry point the existing screens already call. It used to take a
 * screenshot with html2canvas and paste the JPEG into a PDF, cutting it into
 * pages through rows and lines of text. It now draws a real vector PDF through
 * `src/lib/documents/dom-to-pdf.ts`: selectable, searchable text, real margins,
 * page breaks between rows, repeated table headers and page numbers.
 */
import { exportDomToPdf, type DomPdfResult } from "@/lib/documents/dom-to-pdf";

export interface CleanPdfExportOptions {
  filename?: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  /** Accepted for compatibility; vector output has no resolution to set. */
  scale?: number;
  /** PDF title and footer label. Defaults to the filename. */
  documentTitle?: string;
  /** The school or organisation, shown in the footer. */
  author?: string;
  onProgress?: (step: string) => void;
}

/**
 * Export `target` and start the download.
 *
 * Resolves with the result, including any warnings — a photo that could not be
 * loaded, a name that could not be printed. Callers should show them: a report
 * card missing its crest should not reach a parent unremarked.
 */
export async function exportCleanDocumentToPdf(
  target: HTMLElement | string,
  options: CleanPdfExportOptions = {},
): Promise<DomPdfResult> {
  const filename = options.filename ?? "document.pdf";
  return exportDomToPdf(target, {
    filename,
    title: options.documentTitle ?? filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "),
    author: options.author,
    orientation: options.orientation ?? "portrait",
    size: options.format ?? "a4",
    onProgress: options.onProgress,
  });
}
