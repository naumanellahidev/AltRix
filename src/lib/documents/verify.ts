/**
 * Verification marks.
 *
 * A printed document is a claim, and anyone holding one — an employer checking
 * a transcript, a college checking a leaving certificate — has no way to test
 * that claim against the school's records. A QR code pointing at the school's
 * own verification endpoint gives them one.
 *
 * The rule this file exists to enforce: a verification mark is only drawn when
 * there is something real behind it. A QR code that resolves to nothing is
 * worse than no QR code, because it borrows the authority of one.
 */
import type jsPDF from "jspdf";
import QRCode from "qrcode";

import type { PdfDocument } from "./document";

export interface VerificationTarget {
  /** The code the endpoint looks up. No code, no mark. */
  code: string;
  /** Absolute verification URL. Built from `code` when omitted. */
  url?: string;
  /** Printed under the code, e.g. "Verify at school.edu.pk/verify". */
  caption?: string;
}

/** Where a certificate code is checked. */
export function certificateVerificationUrl(code: string, origin = window.location.origin): string {
  return `${origin}/verify/certificate/${encodeURIComponent(code)}`;
}

/** Where a report card code is checked. */
export function reportCardVerificationUrl(code: string, origin = window.location.origin): string {
  return `${origin}/verify/report-card/${encodeURIComponent(code)}`;
}

/**
 * Draw a QR code as vector squares, straight onto a jsPDF page.
 *
 * Not an image: every module is a filled rectangle, so the code is perfectly
 * sharp at any print resolution, adds almost nothing to the file size, and —
 * because it needs no asynchronous rendering — can be drawn from synchronous
 * generators such as the fee voucher.
 *
 * Returns false if the value could not be encoded (too long, for instance).
 */
export function drawQrVector(
  pdf: jsPDF,
  value: string,
  x: number,
  y: number,
  size: number,
  color: [number, number, number] = [17, 24, 39],
): boolean {
  let matrix: { size: number; get: (row: number, col: number) => number | boolean };
  try {
    matrix = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
  } catch {
    return false;
  }

  const cell = size / matrix.size;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, size, size, "F");
  pdf.setFillColor(color[0], color[1], color[2]);

  for (let row = 0; row < matrix.size; row += 1) {
    // Merge horizontal runs into one rectangle: fewer drawing operations and
    // no hairline seams between adjacent modules in some PDF viewers.
    let runStart = -1;
    for (let col = 0; col <= matrix.size; col += 1) {
      const dark = col < matrix.size && Boolean(matrix.get(row, col));
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        pdf.rect(x + runStart * cell, y + row * cell, (col - runStart) * cell + 0.01, cell + 0.01, "F");
        runStart = -1;
      }
    }
  }
  return true;
}

/** Render a QR code as a PNG data URI, for places that need an <img>. */
export async function qrDataUri(value: string, sizePx = 320): Promise<string> {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: sizePx,
    color: { dark: "#111827", light: "#ffffff" },
  });
}

/**
 * Draw a verification block: QR, the code in text, and a caption.
 *
 * Returns false when nothing was drawn, which happens when there is no code —
 * the caller should not leave an empty box on the page in that case.
 */
export async function drawVerification(
  doc: PdfDocument,
  target: VerificationTarget | null | undefined,
  box: { x?: number; y?: number; size?: number } = {},
): Promise<boolean> {
  if (!target?.code) return false;

  const size = box.size ?? 22;
  const x = box.x ?? doc.x + doc.width - size;
  const y = box.y ?? doc.y;
  const url = target.url ?? certificateVerificationUrl(target.code);

  if (!drawQrVector(doc.pdf, url, x, y, size, doc.theme.ink)) {
    // A value too long to encode must not cost the document. Print the code
    // and the URL as text instead, which a person can still act on.
    doc.pdf.setFont(doc.theme.bodyFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text(target.code, x + size / 2, y + 4, { align: "center" });
    doc.pdf.text(url, x + size / 2, y + 7.4, { align: "center" });
    return true;
  }

  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(doc.theme.size.caption);
  doc.pdf.setTextColor(...doc.theme.ink);
  doc.pdf.text(target.code, x + size / 2, y + size + 3.2, { align: "center" });

  if (target.caption) {
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setTextColor(...doc.theme.inkFaint);
    doc.pdf.text(target.caption, x + size / 2, y + size + 6.4, { align: "center" });
  }

  return true;
}
