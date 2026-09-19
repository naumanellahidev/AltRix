/**
 * Payslips.
 *
 * A payslip is a statement of what was paid for one period, and every figure
 * on it has to be the figure the payroll run recorded. The old slip was an HTML
 * page downloaded with a .html extension; it filled the basic-salary line by
 * subtracting allowances from gross when no salary record existed, printed 0
 * for allowances it did not know, took the breakdown from today's salary
 * record rather than the one in force for the period, and printed the
 * employee's internal user id as their employee number.
 *
 * Here: gross, deductions and net are the run's own figures. The earnings
 * breakdown is shown only when it adds up to that gross exactly; otherwise the
 * slip shows gross alone and says the breakdown is not on record. Net pay is
 * written out in words.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor, compare, isPositive, subtract, sum } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { type Numeric, date as formatDate, documentFileName, money } from "./format";
import { drawTable } from "./table";

export interface PayslipInput {
  employeeName: string;
  employeeEmail?: string | null;
  /** The employee's staff number. Internal ids are not printed. */
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  periodStart: string;
  periodEnd: string;
  paidAt?: string | null;
  status?: string | null;
  currency?: string | null;
  grossAmount: Numeric;
  deductions: Numeric;
  netAmount: Numeric;
  /** Only used when basic + allowances equals the run's gross. */
  baseSalary?: Numeric;
  allowances?: Numeric;
  payRunId?: string | null;
  paymentMethod?: string | null;
  bankAccount?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function periodLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
    const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
    const monthStart = s.getDate() === 1;
    if (sameMonth && monthStart) return s.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function cur(code?: string | null): string {
  const c = (code ?? "PKR").toUpperCase();
  return c === "PKR" ? "Rs." : c;
}

/** Draw one payslip into `doc`, which is already on a fresh letterhead. */
function drawPayslip(doc: PdfDocument, slip: PayslipInput): string[] {
  const warnings: string[] = [];
  const currency = cur(slip.currency);
  const status = (slip.status ?? "").toLowerCase();

  doc.fields(
    [
      { label: "Employee", value: slip.employeeName },
      { label: "Employee No.", value: slip.employeeCode && !UUID_RE.test(slip.employeeCode) ? slip.employeeCode : null },
      { label: "Designation", value: slip.designation },
      { label: "Department", value: slip.department },
      { label: "Pay period", value: `${formatDate(slip.periodStart)} – ${formatDate(slip.periodEnd)}` },
      { label: "Payment date", value: slip.paidAt ? formatDate(slip.paidAt) : status === "paid" ? null : "Not yet paid" },
      { label: "Payment method", value: slip.paymentMethod },
      { label: "Account", value: slip.bankAccount },
      { label: "Email", value: slip.employeeEmail },
    ],
    3,
  );
  doc.advance(2);

  // Earnings: itemised only if the items account for the gross exactly.
  const itemised =
    isPositive(slip.baseSalary) &&
    compare(sum([slip.baseSalary, slip.allowances ?? 0]), slip.grossAmount) === 0;

  type Line = { label: string; earning: Numeric; deduction: Numeric };
  const lines: Line[] = itemised
    ? [
        { label: "Basic salary", earning: slip.baseSalary, deduction: null },
        ...(isPositive(slip.allowances) ? [{ label: "Allowances", earning: slip.allowances, deduction: null }] : []),
      ]
    : [{ label: "Gross salary", earning: slip.grossAmount, deduction: null }];
  if (isPositive(slip.deductions)) lines.push({ label: "Deductions", earning: null, deduction: slip.deductions });

  drawTable(doc, {
    columns: [
      { header: "Description", width: 3, value: (l: Line) => l.label },
      { header: `Earnings (${currency})`, width: 1.4, align: "right", value: (l: Line) => (l.earning == null ? "" : money(l.earning)) },
      { header: `Deductions (${currency})`, width: 1.4, align: "right", value: (l: Line) => (l.deduction == null ? "" : money(l.deduction)) },
    ],
    rows: lines,
    footerRows: [{ label: "Total", earning: slip.grossAmount, deduction: slip.deductions ?? "0" }],
  });

  if (!itemised && (slip.baseSalary != null || slip.allowances != null)) {
    doc.text("An itemised breakdown for this period is not on record, so gross salary is shown as paid.", {
      size: doc.theme.size.caption,
      color: doc.theme.inkMuted,
      style: "italic",
      spaceAfter: 1,
    });
  }

  // Net pay, with the amount in words.
  const words = amountInWordsFor(slip.netAmount, slip.currency ?? "PKR");
  doc.ensureSpace(24);
  const top = doc.y + 2;
  doc.pdf.setFillColor(...doc.theme.accent);
  doc.pdf.roundedRect(doc.x, top, doc.width, 13, 1.5, 1.5, "F");
  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(10);
  doc.pdf.setTextColor(255, 255, 255);
  doc.pdf.text("NET PAY", doc.x + 5, top + 8.2);
  doc.pdf.setFontSize(15);
  doc.pdf.text(`${currency} ${money(slip.netAmount)}`, doc.x + doc.width - 5, top + 8.8, { align: "right" });
  doc.y = top + 15;
  if (words) doc.text(words, { size: doc.theme.size.small, style: "italic", color: doc.theme.inkMuted, spaceAfter: 2 });

  // Net should equal gross less deductions; if the run says otherwise, the
  // slip prints the run's figures and the screen is told.
  const expected = subtract(slip.grossAmount, slip.deductions ?? 0);
  if (compare(expected, slip.netAmount) !== 0) {
    warnings.push(`${slip.employeeName}: net pay does not equal gross less deductions in the payroll run`);
  }

  doc.note("This payslip is confidential and intended only for the named employee.", { tone: "neutral" });
  doc.signatures([{ title: "Accounts Officer" }, { title: "Employee" }]);
  return warnings;
}

export interface PayslipResult {
  doc: PdfDocument;
  fileName: string;
  warnings: string[];
}

/** One payslip, or a whole run with each employee on their own pages. */
export async function buildPayslips(slips: PayslipInput[], options: { brand?: SchoolBrand } = {}): Promise<PayslipResult> {
  if (!slips.length) throw new Error("there are no payslips to produce");
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];

  const first = slips[0];
  const doc = await createDocumentAsync({
    title: "Payslip",
    subtitle: periodLabel(first.periodStart, first.periodEnd),
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: first.employeeName,
    watermark: (first.status ?? "").toLowerCase() === "draft" ? "draft" : "none",
    footerNote: "Confidential",
  });

  slips.forEach((slip, i) => {
    if (i > 0) {
      doc.beginDocument({
        subtitle: periodLabel(slip.periodStart, slip.periodEnd),
        reference: slip.employeeName,
        watermark: (slip.status ?? "").toLowerCase() === "draft" ? "draft" : "none",
      });
    }
    warnings.push(...drawPayslip(doc, slip));
  });

  const period = periodLabel(first.periodStart, first.periodEnd);
  const fileName =
    slips.length === 1
      ? documentFileName([first.employeeName, "Payslip", period], "pdf")
      : documentFileName(["Payslips", period, `${slips.length} employees`, brand.name], "pdf");
  return { doc, fileName, warnings };
}
