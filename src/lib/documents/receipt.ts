/**
 * Payment receipts.
 *
 * The receipt screen printed by hiding everything else on the page with CSS and
 * calling window.print(): no file to keep, nothing to send the parent, the
 * amount formatted through a float, and "Unknown" printed where an invoice
 * number could not be found.
 *
 * A receipt here is an A5 document — the size a receipt book is — on the
 * school's letterhead: who paid, when, how, against which invoice, the amount in
 * figures and in words, and, when the invoice is known, what remains due. A
 * reprint is marked DUPLICATE so it cannot pass for a second payment.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor, atLeastZero, isPositive, subtract } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { shareFile, triggerDownload, print as printPdf, type ShareOutcome } from "./deliver";
import { type Numeric, dateTime, documentFileName, money } from "./format";

export interface ReceiptInput {
  /** The payment's own reference; the receipt number. */
  receiptNumber: string;
  payerName: string | null;
  payerType?: string | null;
  payerContact?: string | null;
  /** Roll number, class — whatever identifies a student payer. */
  payerDetail?: string | null;
  paidAt: string;
  method?: string | null;
  /** Bank or wallet transaction reference, if different from the receipt number. */
  transactionReference?: string | null;
  invoiceNumber?: string | null;
  invoicePeriod?: string | null;
  amount: Numeric;
  currency?: string | null;
  /** When known, the invoice's total and what has been paid against it including this payment. */
  invoiceTotal?: Numeric;
  invoicePaidToDate?: Numeric;
  notes?: string | null;
  receivedBy?: string | null;
  /** A reprint: marked DUPLICATE. */
  duplicate?: boolean;
}

function cur(code?: string | null) {
  const c = (code ?? "PKR").toUpperCase();
  return c === "PKR" ? "Rs." : c;
}

export async function buildReceipt(input: ReceiptInput, options: { brand?: SchoolBrand } = {}) {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const currency = cur(input.currency);

  const doc: PdfDocument = await createDocumentAsync({
    title: "Receipt",
    subtitle: `No. ${input.receiptNumber}`,
    size: "a5",
    margins: { top: 12, right: 12, bottom: 16, left: 12 },
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: input.receiptNumber,
    watermark: input.duplicate ? "duplicate" : "none",
    footerNote: "Computer-generated receipt. Keep it for your records.",
  });

  doc.fields(
    [
      { label: "Received from", value: input.payerName },
      { label: "Payer", value: [input.payerType, input.payerDetail].filter(Boolean).join(" · ") || null },
      { label: "Contact", value: input.payerContact },
      { label: "Date", value: dateTime(input.paidAt) },
      { label: "Method", value: input.method },
      { label: "Transaction ref.", value: input.transactionReference },
      { label: "Invoice", value: input.invoiceNumber },
      { label: "Period", value: input.invoicePeriod },
    ],
    2,
  );
  doc.advance(2);

  // Amount received, in figures and in words.
  doc.ensureSpace(22);
  const top = doc.y;
  doc.pdf.setFillColor(...doc.theme.accent);
  doc.pdf.roundedRect(doc.x, top, doc.width, 13, 1.5, 1.5, "F");
  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(9);
  doc.pdf.setTextColor(255, 255, 255);
  doc.pdf.text("AMOUNT RECEIVED", doc.x + 4, top + 8);
  doc.pdf.setFontSize(14);
  doc.pdf.text(`${currency} ${money(input.amount)}`, doc.x + doc.width - 4, top + 8.6, { align: "right" });
  doc.y = top + 15;
  const words = amountInWordsFor(input.amount, input.currency ?? "PKR");
  if (words) doc.text(words, { size: doc.theme.size.small, style: "italic", color: doc.theme.inkMuted, spaceAfter: 2 });

  // Where the invoice stands after this payment — only when both figures are known.
  if (isPositive(input.invoiceTotal) && input.invoicePaidToDate != null) {
    const balance = atLeastZero(subtract(input.invoiceTotal, input.invoicePaidToDate));
    const settled = !isPositive(balance);
    const rows: Array<[string, string, boolean?]> = [
      ["Invoice total", `${currency} ${money(input.invoiceTotal)}`],
      ["Paid to date", `${currency} ${money(input.invoicePaidToDate)}`],
      [settled ? "Settled in full" : "Balance due", `${currency} ${money(balance)}`, true],
    ];
    doc.ensureSpace(rows.length * 6 + 3);
    rows.forEach(([label, value, strong]) => {
      doc.pdf.setFont(doc.theme.bodyFont, strong ? "bold" : "normal");
      doc.pdf.setFontSize(doc.theme.size.small);
      const tone = strong ? (settled ? doc.theme.positive : doc.theme.danger) : doc.theme.inkMuted;
      doc.pdf.setTextColor(...tone);
      doc.pdf.text(label, doc.x, doc.y + 4);
      doc.pdf.text(value, doc.x + doc.width, doc.y + 4, { align: "right" });
      doc.y += 5.6;
    });
    doc.advance(1);
  } else if (input.invoiceNumber) {
    warnings.push("the invoice's total was not available, so the remaining balance is not shown");
  }

  if (input.notes) doc.note(input.notes);

  doc.signatures([{ title: "Received by", name: input.receivedBy ?? null }, { title: "Payer" }]);

  const fileName = documentFileName(
    [input.payerName, "Payment Receipt", input.receiptNumber, input.duplicate ? "DUPLICATE" : null],
    "pdf",
  );
  return { doc, fileName, warnings };
}

export async function downloadReceipt(input: ReceiptInput) {
  const { doc, fileName, warnings } = await buildReceipt(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printReceipt(input: ReceiptInput) {
  const { doc, warnings } = await buildReceipt(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the receipt could not be sent to the printer");
  return { warnings };
}

/** Share to the payer — on WhatsApp to their number when it is a phone number. */
export async function shareReceipt(input: ReceiptInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildReceipt(input);
  const phone = input.payerContact && /^[+\d][\d\s-]{6,}$/.test(input.payerContact) ? input.payerContact : null;
  const outcome = await shareFile(doc.blob(), fileName, {
    title: `Payment receipt ${input.receiptNumber}`,
    text: `Payment receipt ${input.receiptNumber} — ${cur(input.currency)} ${money(input.amount)} received${input.payerName ? ` from ${input.payerName}` : ""}.`,
    phone,
  });
  return { ...outcome, warnings };
}
