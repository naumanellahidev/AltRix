/**
 * School certificates: school leaving (transfer), character, bonafide and no
 * objection.
 *
 * The old certificate was a pop-up with "AltRix Academy" printed across the top
 * of every school's certificate, and "AUTHORIZED SIGNATORY — Digitally Signed"
 * printed whether or not anyone had signed. It carried no certificate number
 * and no way to check it.
 *
 * This is a framed landscape certificate on the school's own name and crest,
 * with a number from the school's sequence, a date, wording built only from
 * what the school's records hold — a sentence whose facts are missing is left
 * out rather than printed with a blank — a signature line for the person who
 * signs it, and a QR code that verifies it against the school's records. A
 * revoked certificate is printed with VOID across it.
 */
import jsPDF from "jspdf";

import { apiClient } from "@/lib/api-client";

import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { printBlob, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { applyLoadedUnicodeFont, ensureUnicodeFontLoaded, installTextSafety, unsupportedText } from "./fonts";
import { date as formatDate, documentFileName } from "./format";
import { tint } from "./theme";
import { certificateVerificationUrl, drawQrVector } from "./verify";

export interface CertificateDetail {
  certificate: {
    id: string;
    certificate_type: string;
    certificate_number: string;
    issue_date: string | null;
    remarks: string | null;
    qr_verification_code: string;
    status: string;
  };
  title: string;
  student: {
    first_name: string;
    last_name: string | null;
    roll_number: string | null;
    registration_number: string | null;
    date_of_birth: string | null;
    gender: string | null;
    admission_date: string | null;
    status: string | null;
    class_name: string | null;
    section_name: string | null;
  } | null;
}

export interface Signatory {
  name?: string | null;
  title?: string | null;
}

export async function fetchCertificateDetail(id: string): Promise<CertificateDetail> {
  const res = await apiClient.get<CertificateDetail>(`/documents/certificates/${id}`);
  if (!res.data?.certificate) throw new Error("the certificate could not be loaded");
  return res.data;
}

function pronouns(gender: string | null | undefined) {
  const g = (gender ?? "").toLowerCase();
  if (g.startsWith("m")) return { subject: "He", possessive: "his", object: "him" };
  if (g.startsWith("f")) return { subject: "She", possessive: "her", object: "her" };
  return { subject: "The student", possessive: "their", object: "them" };
}

/** The certificate's wording, one paragraph per entry, from recorded facts only. */
export function certificateWording(detail: CertificateDetail, schoolName: string): string[] {
  const s = detail.student;
  const name = s ? [s.first_name, s.last_name].filter(Boolean).join(" ") : "the student named";
  const p = pronouns(s?.gender);
  const reg = s?.registration_number ? `, Registration No. ${s.registration_number},` : "";
  const cls = [s?.class_name, s?.section_name].filter(Boolean).join(" – ");
  const roll = s?.roll_number ? ` (Roll No. ${s.roll_number})` : "";
  const dob = s?.date_of_birth ? `${p.possessive === "their" ? "The student's" : p.possessive[0].toUpperCase() + p.possessive.slice(1)} date of birth, as recorded in the admission register, is ${formatDate(s.date_of_birth)}.` : null;
  const admitted = s?.admission_date ? ` since ${formatDate(s.admission_date)}` : "";
  const remarks = detail.certificate.remarks?.trim() || null;

  switch (detail.certificate.certificate_type) {
    case "transfer_certificate":
      return [
        `This is to certify that ${name}${reg} was a student of ${schoolName}${s?.admission_date ? `, admitted on ${formatDate(s.admission_date)}` : ""}${cls ? `, and was studying in ${cls}${roll} at the time of leaving` : ""}.`,
        dob,
        `${p.subject} has left the school, and this certificate is issued on ${formatDate(detail.certificate.issue_date)}.`,
        remarks ? `Remarks: ${remarks}` : null,
        "We wish " + p.object + " every success in the future.",
      ].filter((x): x is string => !!x);
    case "character_certificate":
      return [
        `This is to certify that ${name}${reg} has been a student of ${schoolName}${admitted}${cls ? `, presently in ${cls}` : ""}.`,
        remarks
          ? remarks
          : `To the best of the school's knowledge, ${p.subject === "The student" ? "the student" : p.subject.toLowerCase()} bears a good moral character.`,
        dob,
      ].filter((x): x is string => !!x);
    case "noc":
      return [
        `This is to certify that ${name}${reg} is a student of ${schoolName}${cls ? `, enrolled in ${cls}${roll}` : ""}.`,
        `The school has no objection${remarks ? ` ${remarks.replace(/^to\s+/i, "to ")}` : " to the purpose for which this certificate is requested"}.`,
        dob,
      ].filter((x): x is string => !!x);
    case "bonafide":
    default:
      return [
        `This is to certify that ${name}${reg} is a bonafide student of ${schoolName}${admitted}${cls ? `, currently enrolled in ${cls}${roll}` : ""}.`,
        dob,
        remarks ? `This certificate is issued ${remarks.replace(/^for\s+/i, "for ")}.` : "This certificate is issued on request.",
      ].filter((x): x is string => !!x);
  }
}

export interface CertificateResult {
  pdf: jsPDF;
  fileName: string;
  warnings: string[];
}

export async function buildCertificate(
  detail: CertificateDetail,
  options: { brand?: SchoolBrand; signatory?: Signatory } = {},
): Promise<CertificateResult> {
  // A certificate is a statement about a person; without the person's record
  // there is nothing true to print.
  if (!detail.student) throw new Error("the student's record for this certificate could not be found");
  const [brand] = await Promise.all([options.brand ?? loadActiveSchoolBrand(), ensureUnicodeFontLoaded()]);
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const schoolName = brand.name ?? "School";
  const revoked = detail.certificate.status !== "valid";

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  installTextSafety(pdf);
  applyLoadedUnicodeFont(pdf);
  pdf.setProperties({ title: `${detail.title} — ${detail.certificate.certificate_number}`, author: schoolName, creator: schoolName });

  const W = 297;
  const H = 210;
  const accent = brand.accent;
  const gold: [number, number, number] = [184, 145, 58];

  // Frame: an outer rule in the school's colour, an inner gold rule, corner marks.
  pdf.setFillColor(...tint(accent, 0.965));
  pdf.rect(0, 0, W, H, "F");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(10, 10, W - 20, H - 20, "F");
  pdf.setDrawColor(...accent);
  pdf.setLineWidth(1.6);
  pdf.rect(10, 10, W - 20, H - 20, "S");
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(0.5);
  pdf.rect(14, 14, W - 28, H - 28, "S");
  for (const [cx, cy, sx, sy] of [
    [14, 14, 1, 1],
    [W - 14, 14, -1, 1],
    [14, H - 14, 1, -1],
    [W - 14, H - 14, -1, -1],
  ] as const) {
    pdf.setFillColor(...gold);
    pdf.triangle(cx, cy, cx + 9 * sx, cy, cx, cy + 9 * sy, "F");
  }

  // Crest and school name.
  let y = 26;
  const logo = brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo : null;
  if (logo) {
    try {
      pdf.addImage(logo.data, logo.format, W / 2 - 9, y, 18, 18);
      y += 21;
    } catch {
      warnings.push("the school logo could not be drawn");
    }
  }
  pdf.setFont("times", "bold");
  pdf.setTextColor(...accent);
  let size = 22;
  pdf.setFontSize(size);
  while (size > 15 && pdf.getTextWidth(schoolName) > W - 70) {
    size -= 0.5;
    pdf.setFontSize(size);
  }
  pdf.text(schoolName, W / 2, y + 4, { align: "center" });
  y += 8;
  const contact = [brand.address, brand.phone].filter(Boolean).join("  ·  ");
  if (contact) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(contact, W / 2, y + 1, { align: "center" });
    y += 5;
  }

  // Title.
  y += 6;
  pdf.setFont("times", "bolditalic");
  pdf.setFontSize(26);
  pdf.setTextColor(...gold);
  pdf.text(detail.title, W / 2, y + 6, { align: "center" });
  y += 10;
  pdf.setDrawColor(...gold);
  pdf.setLineWidth(0.4);
  pdf.line(W / 2 - 45, y + 1, W / 2 + 45, y + 1);

  // Number and date.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Certificate No. ${detail.certificate.certificate_number}`, 30, 30);
  pdf.text(`Date: ${formatDate(detail.certificate.issue_date)}`, W - 30, 30, { align: "right" });

  // Body, centred in the space between the title and the signatures.
  const sigY = H - 38;
  pdf.setFont("times", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 41, 59);
  const width = W - 90;
  const paragraphs = certificateWording(detail, schoolName).map((p) => pdf.splitTextToSize(p, width) as string[]);
  const blockHeight = paragraphs.reduce((h, lines) => h + lines.length * 6.2 + 2.2, 0);
  const areaTop = y + 10;
  const areaBottom = sigY - 16;
  y = Math.max(areaTop, areaTop + (areaBottom - areaTop - blockHeight) / 2);
  for (const lines of paragraphs) {
    for (const line of lines) {
      pdf.text(line, W / 2, y, { align: "center" });
      y += 6.2;
    }
    y += 2.2;
  }

  // Signatures: a line for the issuing authority, named only if a name was given.
  pdf.setDrawColor(100, 116, 139);
  pdf.setLineWidth(0.3);
  pdf.line(40, sigY, 110, sigY);
  pdf.line(W - 110, sigY, W - 40, sigY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(30, 41, 59);
  pdf.text(options.signatory?.title?.trim() || "Principal", 75, sigY + 5, { align: "center" });
  pdf.text("School Seal", W - 75, sigY + 5, { align: "center" });
  if (options.signatory?.name?.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(options.signatory.name.trim(), 75, sigY + 9.5, { align: "center" });
  }

  // Verification — only for a certificate that is in force.
  if (!revoked && detail.certificate.qr_verification_code) {
    const q = 24;
    drawQrVector(pdf, certificateVerificationUrl(detail.certificate.qr_verification_code), W / 2 - q / 2, H - 50, q, [30, 41, 59]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Scan to verify with the school", W / 2, H - 22.5, { align: "center" });
  }

  if (revoked) {
    pdf.saveGraphicsState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = pdf as any;
    if (api.GState) api.setGState(new api.GState({ opacity: 0.14 }));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(110);
    pdf.setTextColor(153, 27, 27);
    pdf.text("VOID", W / 2, H / 2 + 10, { align: "center", angle: 20 });
    pdf.restoreGraphicsState();
    warnings.push("this certificate has been revoked and is printed as VOID");
  }

  if (y > sigY - 14) warnings.push("the wording is long enough to crowd the signature area; consider shortening the remarks");
  for (const lost of unsupportedText(pdf)) warnings.push(`"${lost}" could not be printed`);

  const who = detail.student ? [detail.student.first_name, detail.student.last_name].filter(Boolean).join(" ") : null;
  const fileName = documentFileName([who, detail.title, detail.certificate.certificate_number], "pdf");
  return { pdf, fileName, warnings };
}

export async function downloadCertificate(id: string, signatory?: Signatory) {
  const { pdf, fileName, warnings } = await buildCertificate(await fetchCertificateDetail(id), { signatory });
  triggerDownload(pdf.output("blob"), fileName);
  return { fileName, warnings };
}

export async function printCertificate(id: string, signatory?: Signatory) {
  const { pdf, warnings } = await buildCertificate(await fetchCertificateDetail(id), { signatory });
  printBlob(pdf.output("blob"));
  return { warnings };
}

export async function shareCertificate(id: string, signatory?: Signatory): Promise<ShareOutcome & { warnings: string[] }> {
  const detail = await fetchCertificateDetail(id);
  const { pdf, fileName, warnings } = await buildCertificate(detail, { signatory });
  const outcome = await shareFile(pdf.output("blob"), fileName, { title: `${detail.title} ${detail.certificate.certificate_number}` });
  return { ...outcome, warnings };
}
