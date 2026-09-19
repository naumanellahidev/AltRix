/**
 * Payslips for the payroll screens.
 *
 * Kept under the names the screens already import. Every function now produces
 * a real PDF through the document system (`src/lib/documents/payslip.ts`); the
 * "download" used to save an HTML page, and employee names were written into
 * that page unescaped.
 */
import {
  buildPayslips,
  describeShare,
  print as printPdf,
  shareFile,
  triggerDownload,
  type PayslipInput,
} from "@/lib/documents";

export type PayslipData = {
  employeeName: string;
  employeeEmail: string;
  /** Internal user id; never printed. Use employeeCode for the staff number. */
  employeeId: string;
  employeeCode?: string | null;
  designation?: string | null;
  department?: string | null;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  baseSalary: number | string | null;
  allowances: number | string | null;
  deductions: number | string;
  grossAmount: number | string;
  netAmount: number | string;
  currency: string;
  schoolName: string;
  payRunId: string;
  status: string;
};

function toInput(d: PayslipData): PayslipInput {
  return {
    employeeName: d.employeeName,
    employeeEmail: d.employeeEmail,
    employeeCode: d.employeeCode ?? null,
    designation: d.designation ?? null,
    department: d.department ?? null,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    paidAt: d.paidAt,
    status: d.status,
    currency: d.currency,
    grossAmount: d.grossAmount,
    deductions: d.deductions,
    netAmount: d.netAmount,
    baseSalary: d.baseSalary,
    allowances: d.allowances,
    payRunId: d.payRunId,
  };
}

export interface PayslipOutcome {
  fileName: string;
  warnings: string[];
}

/** Print one payslip. */
export async function openPayslipPDF(data: PayslipData): Promise<PayslipOutcome> {
  return openBulkPayslipsPDF([data]);
}

/** Download one payslip as a PDF. */
export async function downloadPayslipPDF(data: PayslipData): Promise<PayslipOutcome> {
  return downloadBulkPayslipsHTML([data]);
}

/** Print a run: every employee's payslip, each on its own pages, in one job. */
export async function openBulkPayslipsPDF(payslips: PayslipData[]): Promise<PayslipOutcome> {
  const { doc, fileName, warnings } = await buildPayslips(payslips.map(toInput));
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the payslips could not be sent to the printer");
  return { fileName, warnings };
}

/**
 * Download a run as one PDF. The name is kept for the screens that call it;
 * the file is a PDF, not HTML.
 */
export async function downloadBulkPayslipsHTML(
  payslips: PayslipData[],
  _periodStart?: string,
  _periodEnd?: string,
): Promise<PayslipOutcome> {
  const { doc, fileName, warnings } = await buildPayslips(payslips.map(toInput));
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

/** Share one payslip — to the employee on WhatsApp, from a phone. */
export async function sharePayslip(data: PayslipData) {
  const { doc, fileName, warnings } = await buildPayslips([toInput(data)]);
  const outcome = await shareFile(doc.blob(), fileName, { title: `${data.employeeName} — Payslip` });
  return { ...describeShare(outcome), warnings };
}
