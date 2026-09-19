/**
 * Letters of appointment, from an employment contract.
 *
 * The letter was a React page captured from the screen, so printing it printed
 * whatever the browser happened to lay out, and its footer carried the
 * software's name instead of the school's. Missing terms printed as dashes, a
 * missing salary as "As per offer letter" — a promise the school had not made —
 * and the salary itself went through floating point and lost its paisa.
 *
 * Here it is a real letter on the school's letterhead: reference and date, the
 * addressee, a subject line, the terms of appointment (only those the school
 * has set), the salary exactly as stored and in words, the benefits and
 * conditions as written, and signature lines for the school and for the
 * employee's acceptance. A contract that has been ended is marked as such.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { amountInWordsFor } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName, money } from "./format";
import { drawTable } from "./table";

export interface AppointmentLetterInput {
  contractId: string;
  reference?: string | null;
  employeeName: string;
  employeeEmail?: string | null;
  contractType?: string | null;
  position?: string | null;
  department?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  reportingTo?: string | null;
  workingHours?: string | null;
  probationMonths?: number | string | null;
  noticeDays?: number | string | null;
  salaryAmount?: number | string | null;
  salaryCurrency?: string | null;
  benefits?: string | null;
  terms?: string | null;
  body?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  /** active, terminated, expired. */
  status?: string | null;
  /** When the contract was created — the letter's date on a reprint. */
  issuedOn?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Fixed-term contract",
  intern: "Internship",
  probation: "Probation",
  permanent: "Permanent",
};

function plural(n: number, one: string) {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

function wholeNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** The reference printed on the letter. Matches what earlier letters showed. */
export function appointmentReference(input: Pick<AppointmentLetterInput, "reference" | "contractId">): string {
  return input.reference?.trim() || `HR-${input.contractId.slice(0, 8).toUpperCase()}`;
}

/**
 * The terms table, as label and value pairs. A term the school has not set is
 * left out rather than printed as a dash or filled with a stock phrase.
 */
export function appointmentTerms(input: AppointmentLetterInput): Array<[string, string]> {
  const probation = wholeNumber(input.probationMonths);
  const notice = wholeNumber(input.noticeDays);
  const salary = input.salaryAmount === null || input.salaryAmount === undefined ? "" : String(input.salaryAmount).trim();
  const currency = input.salaryCurrency?.trim() || "PKR";
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) rows.push([label, value.trim()]);
  };
  add("Employment type", input.contractType ? TYPE_LABEL[input.contractType] ?? input.contractType : null);
  add("Position", input.position);
  add("Department", input.department);
  add("Date of joining", input.startDate ? formatDate(input.startDate) : null);
  add(
    "Term",
    input.endDate
      ? `Until ${formatDate(input.endDate)}`
      : input.startDate
        ? "Open-ended, until ended by either party with notice"
        : null,
  );
  add("Reporting to", input.reportingTo);
  add("Working hours", input.workingHours);
  add("Probation", probation ? plural(probation, "month") : null);
  add("Notice period", notice ? plural(notice, "day") : null);
  if (salary) add("Salary", `${money(salary, { currency })} per month` + String.fromCharCode(10) + amountInWordsFor(salary, currency));
  return rows;
}

export async function buildAppointmentLetter(
  input: AppointmentLetterInput,
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  if (!brand.name) warnings.push("the school's name could not be loaded");
  const schoolName = brand.name ?? "the school";
  const reference = appointmentReference(input);
  const status = (input.status ?? "active").toLowerCase();
  const ended = status === "terminated" || status === "expired";

  const issued = input.issuedOn ? new Date(input.issuedOn) : null;
  const doc = await createDocumentAsync({
    title: "Letter of Appointment",
    subtitle: input.employeeName,
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference,
    issuedAt: issued && !Number.isNaN(issued.getTime()) ? issued : null,
    watermark: status === "terminated" ? "cancelled" : "none",
  });

  // Reference and date, then the addressee.
  doc.fields(
    [
      { label: "Reference", value: reference },
      { label: "Date", value: formatDate(input.issuedOn?.slice(0, 10) ?? new Date()) },
    ],
    2,
  );
  doc.advance(1);
  doc.text("To", { size: doc.theme.size.caption, color: doc.theme.inkMuted, spaceAfter: 0.5 });
  doc.text(input.employeeName, { style: "bold", spaceAfter: 0.3 });
  if (input.employeeEmail) doc.text(input.employeeEmail, { size: doc.theme.size.small, color: doc.theme.inkMuted });
  doc.advance(3);

  if (ended) {
    doc.note(
      status === "terminated"
        ? "This contract has been terminated. This copy is a record of the terms on which the appointment was made."
        : "This contract has expired. This copy is a record of the terms on which the appointment was made.",
      { tone: "warning" },
    );
  }

  const position = input.position?.trim();
  doc.text(`Subject: Appointment${position ? ` as ${position}` : ""}`, { style: "bold", spaceAfter: 3 });

  const firstName = input.employeeName.trim().split(/\s+/)[0];
  doc.text(`Dear ${firstName || "Colleague"},`, { spaceAfter: 2.5 });
  const role = [
    position ? `the position of ${position}` : "a position",
    input.department?.trim() ? ` in the ${input.department.trim()} department` : "",
  ].join("");
  doc.text(
    `We are pleased to offer you ${role} at ${schoolName}, on the terms and conditions set out below.`,
    { spaceAfter: 3 },
  );

  // Terms of appointment: only what the school has actually set.
  const rows = appointmentTerms(input);
  const hasSalary = rows.some(([label]) => label === "Salary");

  doc.sectionTitle("Terms of appointment");
  drawTable(doc, {
    columns: [
      { header: "Term", width: 1, bold: () => true, value: (r: [string, string]) => r[0] },
      { header: "Details", width: 2.4, value: (r: [string, string]) => r[1] },
    ],
    rows,
    accentHeader: false,
    zebra: true,
    emptyMessage: "No terms have been recorded on this contract.",
  });
  if (!hasSalary) warnings.push("no salary is recorded on this contract, so the letter does not state one");
  doc.advance(2);

  const block = (title: string, value: string | null | undefined) => {
    if (!value?.trim()) return;
    doc.sectionTitle(title);
    doc.text(value.trim(), { spaceAfter: 2 });
  };
  block("Benefits", input.benefits);
  block("Terms and conditions", input.terms);
  if (input.body?.trim()) {
    doc.advance(1);
    doc.text(input.body.trim(), { spaceAfter: 2 });
  }

  doc.advance(1);
  doc.text(
    `Please confirm your acceptance by signing and returning a copy of this letter. We look forward to your contribution to ${schoolName}.`,
    { spaceAfter: 3 },
  );
  doc.text("Sincerely,");

  doc.signatures([
    { title: input.signatoryTitle?.trim() || "Authorised Signatory", name: input.signatoryName?.trim() || null, note: brand.name },
    { title: "Accepted by the employee", name: input.employeeName, note: "Signature and date" },
  ]);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName([input.employeeName, "Appointment Letter", reference], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadAppointmentLetter(input: AppointmentLetterInput) {
  const { doc, fileName, warnings } = await buildAppointmentLetter(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printAppointmentLetter(input: AppointmentLetterInput) {
  const { doc, warnings } = await buildAppointmentLetter(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the letter could not be sent to the printer");
  return { warnings };
}

export async function shareAppointmentLetter(
  input: AppointmentLetterInput,
  phone?: string | null,
): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildAppointmentLetter(input);
  const outcome = await shareFile(doc.blob(), fileName, {
    title: `Letter of Appointment — ${input.employeeName}`,
    text: `Letter of appointment for ${input.employeeName} (${appointmentReference(input)}).`,
    phone,
  });
  return { ...outcome, warnings };
}
