/**
 * Fee invoices.
 *
 * The invoice screen printed a hidden copy of itself with CSS, gave every line
 * a quantity of 1 and a unit price equal to its total (the data has no
 * quantities — those columns were invented), summed payments as floats, and
 * printed discount and late-fee rows of zero on every invoice.
 *
 * Here: the lines are the invoice's lines; discount and late fee appear only
 * when there are any; paid-to-date is the exact sum of the payments recorded,
 * and those payments are listed; the invoice is stamped with where it stands;
 * and its number is printed as a QR code a bank or the office can scan.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor, atLeastZero, compare, isPositive, subtract, sum } from "./decimal";
import { type PdfDocument, type Watermark, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { type Numeric, date as formatDate, dateTime, documentFileName, money } from "./format";
import { drawSummary, drawTable } from "./table";
import { drawQrVector } from "./verify";

export interface InvoiceInput {
  invoiceNumber: string;
  issuedAt?: string | null;
  dueDate?: string | null;
  periodLabel?: string | null;
  status?: string | null;
  billedTo: string | null;
  billedToDetail?: string | null;
  contact?: string | null;
  lines: Array<{ label: string; amount: Numeric }>;
  subtotal?: Numeric;
  discount?: Numeric;
  lateFee?: Numeric;
  total: Numeric;
  payments?: Array<{ paidAt?: string | null; method?: string | null; reference?: string | null; amount: Numeric }>;
  notes?: string | null;
  currency?: string | null;
  /** Bank details to pay into, when the school has them. */
  bank?: Array<{ label: string; value: string | null | undefined }> | null;
}

function cur(code?: string | null) {
  const c = (code ?? "PKR").toUpperCase();
  return c === "PKR" ? "Rs." : c;
}

function standing(input: InvoiceInput, balance: string): { watermark: Watermark; label: string } {
  const status = (input.status ?? "").toLowerCase();
  if (status === "cancelled" || status === "void") return { watermark: "cancelled", label: "Cancelled" };
  if (!isPositive(balance) && isPositive(input.total)) return { watermark: "paid", label: "Paid in full" };
  if (input.dueDate && input.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    return { watermark: "overdue", label: "Overdue" };
  }
  return { watermark: "none", label: isPositive(sum((input.payments ?? []).map((p) => p.amount))) ? "Partially paid" : "Unpaid" };
}

export async function buildInvoice(input: InvoiceInput, options: { brand?: SchoolBrand } = {}) {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const currency = cur(input.currency);

  const paid = sum((input.payments ?? []).map((p) => p.amount));
  const balance = atLeastZero(subtract(input.total, paid));
  const { watermark, label } = standing(input, balance);

  const doc: PdfDocument = await createDocumentAsync({
    title: "Invoice",
    subtitle: input.invoiceNumber,
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: input.invoiceNumber,
    watermark,
    footerNote: "Please quote the invoice number with every payment.",
  });

  // Particulars, with the invoice number as a scannable code on the right.
  const qr = 22;
  const top = doc.y;
  drawQrVector(doc.pdf, input.invoiceNumber, doc.x + doc.width - qr, top, qr, doc.theme.ink);
  doc.fields(
    [
      { label: "Billed to", value: input.billedTo },
      { label: "Details", value: input.billedToDetail },
      { label: "Contact", value: input.contact },
      { label: "Issued", value: input.issuedAt ? formatDate(input.issuedAt) : null },
      { label: "Due", value: input.dueDate ? formatDate(input.dueDate) : null },
      { label: "Period", value: input.periodLabel },
      { label: "Status", value: label },
    ],
    2,
    { width: doc.width - qr - 6 },
  );
  doc.y = Math.max(doc.y, top + qr + 3);

  // Lines.
  type Line = InvoiceInput["lines"][number];
  drawTable(doc, {
    columns: [
      { header: "Description", width: 4, value: (l: Line) => l.label },
      { header: `Amount (${currency})`, width: 1.3, align: "right", value: (l: Line) => money(l.amount) },
    ],
    rows: input.lines,
    emptyMessage: "No line items are recorded on this invoice.",
  });

  const summary: Array<{ label: string; value: string; emphasis?: boolean; tone?: "danger" | "positive" }> = [];
  if (input.subtotal != null) summary.push({ label: "Subtotal", value: money(input.subtotal) });
  if (isPositive(input.discount)) summary.push({ label: "Discount", value: `– ${money(input.discount)}`, tone: "positive" });
  if (isPositive(input.lateFee)) summary.push({ label: "Late fee", value: `+ ${money(input.lateFee)}`, tone: "danger" });
  summary.push({ label: "Total", value: `${currency} ${money(input.total)}`, emphasis: true });
  if (isPositive(paid)) summary.push({ label: "Paid to date", value: money(paid), tone: "positive" });
  summary.push({
    label: isPositive(balance) ? "Balance due" : "Balance",
    value: `${currency} ${money(balance)}`,
    emphasis: true,
    tone: isPositive(balance) ? "danger" : "positive",
  });
  drawSummary(doc, summary);

  // The subtotal, adjustments and total come from the invoice. If they do not
  // agree with each other, print them as recorded and say so.
  if (input.subtotal != null) {
    const expected = subtract(sum([input.subtotal, input.lateFee ?? 0]), input.discount ?? 0);
    if (compare(expected, input.total) !== 0) {
      warnings.push(`invoice ${input.invoiceNumber}: subtotal, discount and late fee do not add up to the recorded total`);
    }
  }

  if (isPositive(balance)) {
    const words = amountInWordsFor(balance, input.currency ?? "PKR");
    if (words) doc.text(`Balance due: ${words}`, { size: doc.theme.size.small, style: "italic", color: doc.theme.inkMuted, spaceAfter: 2 });
  }

  // Payments received against this invoice.
  const payments = input.payments ?? [];
  if (payments.length) {
    doc.sectionTitle("Payments received");
    type Pay = (typeof payments)[number];
    drawTable(doc, {
      columns: [
        { header: "Date", width: 1.6, value: (p: Pay) => (p.paidAt ? dateTime(p.paidAt) : "") },
        { header: "Method", width: 1.4, value: (p: Pay) => p.method ?? "" },
        { header: "Reference", width: 1.6, value: (p: Pay) => p.reference ?? "" },
        { header: `Amount (${currency})`, width: 1.2, align: "right", value: (p: Pay) => money(p.amount) },
      ],
      rows: payments,
      footerRows: [{ paidAt: null, method: "Total paid", reference: null, amount: paid }],
      padding: 1.6,
    });
  }

  const bank = (input.bank ?? []).filter((b) => b.value);
  if (bank.length && isPositive(balance)) {
    doc.note(`Pay into: ${bank.map((b) => `${b.label}: ${b.value}`).join("   ·   ")}`);
  }
  if (input.notes) doc.note(input.notes);

  doc.signatures([{ title: "Accounts Office" }, { title: "Stamp & Date" }]);

  const fileName = documentFileName([input.billedTo, "Invoice", input.invoiceNumber], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadInvoice(input: InvoiceInput) {
  const { doc, fileName, warnings } = await buildInvoice(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printInvoice(input: InvoiceInput) {
  const { doc, warnings } = await buildInvoice(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the invoice could not be sent to the printer");
  return { warnings };
}

export async function shareInvoice(input: InvoiceInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildInvoice(input);
  const phone = input.contact && /^[+\d][\d\s-]{6,}$/.test(input.contact) ? input.contact : null;
  const outcome = await shareFile(doc.blob(), fileName, {
    title: `Invoice ${input.invoiceNumber}`,
    text: `Invoice ${input.invoiceNumber}${input.billedTo ? ` for ${input.billedTo}` : ""} — ${cur(input.currency)} ${money(input.total)}${input.dueDate ? `, due ${formatDate(input.dueDate)}` : ""}.`,
    phone,
  });
  return { ...outcome, warnings };
}
