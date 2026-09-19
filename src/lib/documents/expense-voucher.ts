/**
 * Payment vouchers for school expenses.
 *
 * The voucher was an HTML page in a pop-up, headed only "EXPENSE VOUCHER"
 * with no school, the amount through a float, the whole database id as its
 * number, and a pop-up that closed itself — nothing to file or send. Here it
 * is an A5 payment voucher on the school's letterhead: the expense's
 * particulars, the amount exactly and in words, and lines for whoever
 * prepared, authorised and received it.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName, money } from "./format";

export interface ExpenseVoucherInput {
  id: string;
  date: string;
  category?: string | null;
  vendor?: string | null;
  description?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  amount: string | number;
  currency?: string | null;
}

/** A short, stable number for the voucher: PV- and the first eight of its id. */
export function expenseVoucherNumber(id: string): string {
  return `PV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function buildExpenseVoucher(
  input: ExpenseVoucherInput,
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const number = expenseVoucherNumber(input.id);
  const currency = input.currency?.trim() || "PKR";
  const category = input.category ? input.category.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;

  const doc = await createDocumentAsync({
    title: "Payment Voucher",
    subtitle: number,
    size: "a5",
    margins: { top: 10, right: 10, bottom: 14, left: 10 },
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: number,
  });

  doc.fields(
    [
      { label: "Voucher No.", value: number },
      { label: "Date", value: formatDate(input.date.slice(0, 10)) },
      { label: "Paid to", value: input.vendor },
      { label: "Category", value: category },
      { label: "Payment method", value: input.paymentMethod },
      { label: "Reference / slip no.", value: input.reference },
    ],
    2,
  );
  doc.advance(1);
  if (input.description?.trim()) {
    doc.sectionTitle("Particulars");
    doc.text(input.description.trim(), { spaceAfter: 3 });
  }

  // The amount, boxed, with the words under it.
  doc.ensureSpace(22);
  const top = doc.y;
  doc.pdf.setFillColor(...doc.theme.accentWash);
  doc.pdf.setDrawColor(...doc.theme.accent);
  doc.pdf.setLineWidth(0.4);
  doc.pdf.roundedRect(doc.x, top, doc.width, 18, 2, 2, "FD");
  doc.pdf.setFont(doc.theme.bodyFont, "normal");
  doc.pdf.setFontSize(doc.theme.size.caption);
  doc.pdf.setTextColor(...doc.theme.inkMuted);
  doc.pdf.text("AMOUNT PAID", doc.x + 4, top + 5.5);
  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(16);
  doc.pdf.setTextColor(...doc.theme.ink);
  doc.pdf.text(money(input.amount, { currency }), doc.x + doc.width - 4, top + 11.5, { align: "right" });
  doc.y = top + 21;
  doc.text(amountInWordsFor(input.amount, currency), { size: doc.theme.size.small, color: doc.theme.inkMuted, spaceAfter: 2 });

  doc.signatures([{ title: "Prepared by" }, { title: "Authorised by" }, { title: "Received by" }]);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName([number, "Payment Voucher", input.vendor, formatDate(input.date.slice(0, 10))], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadExpenseVoucher(input: ExpenseVoucherInput) {
  const { doc, fileName, warnings } = await buildExpenseVoucher(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printExpenseVoucher(input: ExpenseVoucherInput) {
  const { doc, warnings } = await buildExpenseVoucher(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the voucher could not be sent to the printer");
  return { warnings };
}

export async function shareExpenseVoucher(input: ExpenseVoucherInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildExpenseVoucher(input);
  const outcome = await shareFile(doc.blob(), fileName, { title: fileName.replace(/\.pdf$/, "") });
  return { ...outcome, warnings };
}
