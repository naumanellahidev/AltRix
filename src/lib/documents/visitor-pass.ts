/**
 * Visitor gate passes and badges.
 *
 * Three screens each wrote their own HTML page into a pop-up and printed it:
 * the parent's pass was headed "ALTRIX ACADEMY" whatever the school, the
 * visitor's name went into the page as raw HTML, a blocked pop-up failed
 * silently, and none carried a code the gate scanner could read.
 *
 * Here one A5 pass on the school's letterhead: the pass code large and as a
 * QR code the gate console scans, the visitor, purpose, date and (on the
 * gate's badge) check-in time, and the rules for the visit.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName } from "./format";
import { drawQrVector } from "./verify";

export interface VisitorPassInput {
  kind: "pass" | "badge";
  visitorName: string;
  purpose?: string | null;
  phone?: string | null;
  /** The code the gate scans or types in. */
  code?: string | null;
  scheduledDate?: string | null;
  checkInAt?: string | null;
  visiting?: string | null;
  details?: string | null;
  /** Used when the school's brand has not been loaded (the public page). */
  schoolName?: string | null;
}

const title = (s?: string | null) => (s ? s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null);

/** Last four digits only: a pass is shown at the gate and may be left lying about. */
export function maskPhone(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export async function buildVisitorPass(
  input: VisitorPassInput,
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const schoolName = brand.name ?? input.schoolName?.trim() ?? "";
  if (!schoolName) warnings.push("the school's name could not be loaded");
  const heading = input.kind === "badge" ? "Visitor Badge" : "Visitor Gate Pass";

  const doc = await createDocumentAsync({
    title: heading,
    subtitle: input.visitorName,
    size: "a5",
    margins: { top: 10, right: 10, bottom: 14, left: 10 },
    school: {
      name: schoolName,
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: input.code ?? input.visitorName,
  });

  // The visitor, large, and the pass code with its QR.
  const top = doc.y + 2;
  doc.pdf.setFillColor(...doc.theme.accent);
  doc.pdf.roundedRect(doc.x, top, doc.width, 11, 2, 2, "F");
  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(14);
  doc.pdf.setTextColor(255, 255, 255);
  doc.pdf.text("VISITOR", doc.x + doc.width / 2, top + 7.4, { align: "center" });
  doc.y = top + 16;

  doc.text(input.visitorName, { style: "bold", size: 18, align: "center", spaceAfter: 4 });

  if (input.code) {
    const qr = 34;
    drawQrVector(doc.pdf, input.code.trim().toUpperCase(), doc.x + (doc.width - qr) / 2, doc.y, qr, doc.theme.ink);
    doc.y += qr + 4;
    doc.text(input.code.trim().toUpperCase(), { style: "bold", size: 16, align: "center", color: doc.theme.accent, spaceAfter: 1 });
    doc.text("Show this code at the gate", { size: doc.theme.size.caption, align: "center", color: doc.theme.inkMuted, spaceAfter: 4 });
  } else {
    warnings.push("this pass has no code for the gate to scan");
  }

  doc.fields(
    [
      { label: "Purpose", value: title(input.purpose) },
      { label: "Visiting", value: input.visiting },
      { label: input.kind === "badge" ? "Checked in" : "Date of visit", value: input.kind === "badge"
          ? (input.checkInAt ? new Date(input.checkInAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : formatDate(new Date()))
          : (input.scheduledDate ? formatDate(input.scheduledDate.slice(0, 10)) : null) },
      { label: "Phone", value: maskPhone(input.phone) },
    ],
    2,
  );
  if (input.details?.trim()) doc.text(input.details.trim(), { size: doc.theme.size.small, spaceAfter: 2 });

  doc.advance(2);
  doc.note(
    input.kind === "badge"
      ? "Wear this badge visibly while on the premises and return it at the gate when you leave."
      : "Valid for the date shown only. Carry your CNIC; the gate may ask to see it.",
  );

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName(
    [input.visitorName, heading, input.scheduledDate ? formatDate(input.scheduledDate.slice(0, 10)) : null],
    "pdf",
  );
  return { doc, fileName, warnings };
}

export async function downloadVisitorPass(input: VisitorPassInput) {
  const { doc, fileName, warnings } = await buildVisitorPass(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printVisitorPass(input: VisitorPassInput) {
  const { doc, warnings } = await buildVisitorPass(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the pass could not be sent to the printer");
  return { warnings };
}

export async function shareVisitorPass(input: VisitorPassInput, phone?: string | null): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildVisitorPass(input);
  const outcome = await shareFile(doc.blob(), fileName, {
    title: fileName.replace(/\.pdf$/, ""),
    text: input.code ? `Your gate pass code is ${input.code.trim().toUpperCase()}.` : undefined,
    phone,
  });
  return { ...outcome, warnings };
}
