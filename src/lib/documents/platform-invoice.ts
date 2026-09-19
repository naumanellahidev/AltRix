/**
 * The platform's invoice or receipt to a school for its software licence.
 *
 * It was drawn by hand on a bare jsPDF page, with the amount through
 * toLocaleString, the title "INVOICE / RECEIPT" whether or not it had been
 * paid, a "due within 15 days" term the invoice's own due date contradicted,
 * and — unless the super admin had overwritten them — an invented bank
 * account for the school to pay into. Here it is an invoice (unpaid) or a
 * receipt (paid) on the platform's letterhead, the amount exact and in words,
 * PAID / OVERDUE marked, and bank details printed only when they are real.
 */
import { amountInWordsFor } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName, money } from "./format";
import { drawTable } from "./table";
import { type PlatformBrandSettings, hasBankDetails, loadPlatformBrand } from "../platform-brand";

export interface PlatformInvoiceInput {
  invoiceNumber: string;
  schoolName: string;
  amount: number | string;
  billingDate: string;
  dueDate: string;
  status: "Paid" | "Unpaid" | "Overdue";
  paidAt?: string | null;
  planTier?: string | null;
  billingCycle?: string | null;
}

export async function buildPlatformInvoice(
  inv: PlatformInvoiceInput,
  options: { brand?: PlatformBrandSettings } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? loadPlatformBrand();
  const warnings: string[] = [];
  const paid = inv.status === "Paid";
  const kind = paid ? "Receipt" : "Invoice";
  const platform = brand.brandName || "AltRix";
  const logo = /^data:image\/(png|jpe?g);base64,/i.test(brand.logoBase64) ? brand.logoBase64 : null;

  const doc = await createDocumentAsync({
    title: kind,
    subtitle: inv.invoiceNumber,
    school: {
      name: platform,
      email: brand.supportEmail || null,
      website: brand.supportUrl || null,
      logoUrl: logo,
    },
    reference: inv.invoiceNumber,
    watermark: paid ? "paid" : inv.status === "Overdue" ? "overdue" : "none",
    issuedAt: paid && inv.paidAt ? new Date(inv.paidAt) : null,
  });

  doc.fields(
    [
      { label: "Billed to", value: inv.schoolName },
      { label: `${kind} No.`, value: inv.invoiceNumber },
      { label: "Status", value: inv.status },
      { label: "Billing date", value: formatDate(inv.billingDate) },
      { label: paid ? "Paid on" : "Due date", value: paid ? (inv.paidAt ? formatDate(inv.paidAt) : null) : formatDate(inv.dueDate) },
      { label: "Plan", value: [inv.planTier, inv.billingCycle].filter(Boolean).join(" · ") || null },
    ],
    3,
  );
  doc.advance(2);

  type Line = { description: string; cycle: string; amount: string };
  const line: Line = {
    description: `${platform} software licence${inv.planTier ? ` — ${inv.planTier} plan` : ""}`,
    cycle: inv.billingCycle ?? "",
    amount: String(inv.amount),
  };
  drawTable(doc, {
    columns: [
      { header: "Description", width: 3, value: (l: Line) => l.description },
      { header: "Billing cycle", width: 1.1, value: (l: Line) => l.cycle },
      { header: "Amount (PKR)", width: 1.1, align: "right", value: (l: Line) => money(l.amount) },
    ],
    rows: [line],
    footerRows: [{ description: paid ? "Total paid" : "Total due", cycle: "", amount: String(inv.amount) }],
  });
  doc.text(amountInWordsFor(inv.amount, "PKR"), { size: doc.theme.size.small, color: doc.theme.inkMuted, spaceAfter: 3 });

  if (!paid) {
    if (hasBankDetails(brand)) {
      doc.sectionTitle("Pay by bank transfer");
      doc.fields(
        [
          { label: "Bank", value: brand.bankName || null },
          { label: "Account title", value: brand.accountTitle },
          { label: "Account number", value: brand.accountNumber || null },
          { label: "IBAN", value: brand.iban || null },
        ],
        2,
      );
      doc.text(`Please quote ${inv.invoiceNumber} as the payment reference, and pay by ${formatDate(inv.dueDate)}.`, {
        size: doc.theme.size.small,
        spaceAfter: 2,
      });
    } else {
      warnings.push("no bank account is set in Platform Settings, so the invoice does not say where to pay");
    }
  }

  doc.signatures([{ title: `For ${platform}` }, { title: `Received by ${inv.schoolName}` }]);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName([inv.schoolName, kind, inv.invoiceNumber], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadPlatformInvoice(inv: PlatformInvoiceInput) {
  const { doc, fileName, warnings } = await buildPlatformInvoice(inv);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printPlatformInvoice(inv: PlatformInvoiceInput) {
  const { doc, warnings } = await buildPlatformInvoice(inv);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the invoice could not be sent to the printer");
  return { warnings };
}

export async function sharePlatformInvoice(inv: PlatformInvoiceInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildPlatformInvoice(inv);
  const outcome = await shareFile(doc.blob(), fileName, { title: fileName.replace(/\.pdf$/, "") });
  return { ...outcome, warnings };
}
