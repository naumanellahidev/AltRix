/**
 * Annual certificate of fees paid — the one a parent files with their tax
 * return.
 *
 * It was a plain-text file reading "Verified by AltRix Institute Platform
 * Finance Module", with the amount rounded through floating point and no list
 * of the payments behind it. Here it is a certificate on the school's
 * letterhead: the fiscal year spelled out as dates, the total received to the
 * paisa and in words, every payment with its date, invoice, method and
 * reference, and lines for the accountant's and principal's signatures and
 * the school's stamp.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor, sum } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName, money } from "./format";
import { drawTable } from "./table";

export interface FeeCertificatePayment {
  date?: string | null;
  amount?: string | number | null;
  method?: string | null;
  ref?: string | null;
  invoice_number?: string | null;
  period?: string | null;
}

export interface FeeCertificateInput {
  certificate_number: string;
  fiscal_year: string;
  total_fees_paid: string | number;
  school_ntn?: string | null;
  payment_details?: FeeCertificatePayment[] | null;
  generated_at?: string | null;
}

export interface FeeCertificateStudent {
  name: string;
  className?: string | null;
  studentCode?: string | null;
  rollNumber?: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  card: "Card",
  online: "Online",
};

/** "2025-2026" -> the first and last day it covers, 1 July to 30 June. */
export function fiscalYearRange(fy: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{4})$/.exec(fy.trim());
  if (!m || Number(m[2]) !== Number(m[1]) + 1) return null;
  return { from: `${m[1]}-07-01`, to: `${m[2]}-06-30` };
}

export async function buildFeeCertificate(
  cert: FeeCertificateInput,
  student: FeeCertificateStudent,
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  if (!brand.name) warnings.push("the school's name could not be loaded");
  const schoolName = brand.name ?? "the school";

  const payments = (cert.payment_details ?? []).slice().sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  const total = String(cert.total_fees_paid ?? "0");
  const listed = sum(payments.map((p) => p.amount ?? 0));
  if (payments.length && money(listed) !== money(total)) {
    warnings.push("the payments listed do not add up to the certificate's total; request a fresh certificate");
  }
  const range = fiscalYearRange(cert.fiscal_year);
  const fyLabel = range ? `${formatDate(range.from)} to ${formatDate(range.to)}` : cert.fiscal_year;
  const issued = cert.generated_at ? new Date(cert.generated_at) : null;

  const doc = await createDocumentAsync({
    title: "Certificate of Fees Paid",
    subtitle: `Fiscal year ${cert.fiscal_year.replace("-", "–")}`,
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: cert.certificate_number,
    issuedAt: issued && !Number.isNaN(issued.getTime()) ? issued : null,
  });

  doc.fields(
    [
      { label: "Certificate No.", value: cert.certificate_number },
      { label: "Date of issue", value: cert.generated_at ? formatDate(cert.generated_at.slice(0, 10)) : null },
      { label: "Fiscal year", value: fyLabel },
      { label: "Student", value: student.name },
      { label: "Class", value: student.className },
      { label: "Student code", value: student.studentCode ?? student.rollNumber },
      { label: "School NTN", value: cert.school_ntn },
    ],
    3,
  );
  doc.advance(2);

  const words = amountInWordsFor(total, "PKR");
  doc.text(
    `This is to certify that ${schoolName} received ${money(total, { currency: "PKR" })} (${words}) as fees for ${student.name} during the fiscal year ${fyLabel}${payments.length ? ", as detailed below." : "."}`,
    { spaceAfter: 3, lineHeight: 1.5 },
  );

  if (payments.length) {
    drawTable(doc, {
      columns: [
        { header: "Date", width: 1.1, value: (p: FeeCertificatePayment) => (p.date ? formatDate(p.date.slice(0, 10)) : "") },
        { header: "Invoice", width: 1.5, value: (p: FeeCertificatePayment) => p.invoice_number ?? "" },
        { header: "Period", width: 1.3, value: (p: FeeCertificatePayment) => p.period ?? "" },
        { header: "Method", width: 1, value: (p: FeeCertificatePayment) => (p.method ? METHOD_LABEL[p.method] ?? p.method : "") },
        { header: "Reference", width: 1.3, value: (p: FeeCertificatePayment) => p.ref ?? "" },
        {
          header: "Amount (PKR)",
          width: 1.1,
          align: "right",
          value: (p: FeeCertificatePayment) => (p.amount === undefined ? "" : money(p.amount ?? 0)),
        },
      ],
      rows: payments,
      footerRows: [{ date: null, invoice_number: "Total received", amount: total }],
    });
  } else if (money(total) === money(0)) {
    doc.note(`No fee payments were recorded for ${student.name} in this fiscal year.`, { tone: "warning" });
    warnings.push("no payments were recorded in this fiscal year");
  } else {
    doc.note("This certificate was issued without an itemised list of payments.", { tone: "neutral" });
  }

  doc.advance(2);
  doc.text("Issued at the request of the parent or guardian. Valid with the signature and stamp of the school.", {
    size: doc.theme.size.small,
    color: doc.theme.inkMuted,
  });
  doc.signatures([
    { title: "Accountant", note: brand.name },
    { title: "Principal", note: brand.name },
    { title: "School stamp" },
  ]);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName([student.name, "Fee Certificate", `FY ${cert.fiscal_year}`], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadFeeCertificate(cert: FeeCertificateInput, student: FeeCertificateStudent) {
  const { doc, fileName, warnings } = await buildFeeCertificate(cert, student);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printFeeCertificate(cert: FeeCertificateInput, student: FeeCertificateStudent) {
  const { doc, warnings } = await buildFeeCertificate(cert, student);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the certificate could not be sent to the printer");
  return { warnings };
}

export async function shareFeeCertificate(
  cert: FeeCertificateInput,
  student: FeeCertificateStudent,
): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildFeeCertificate(cert, student);
  const outcome = await shareFile(doc.blob(), fileName, {
    title: `Fee certificate — ${student.name}, FY ${cert.fiscal_year}`,
  });
  return { ...outcome, warnings };
}
