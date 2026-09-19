/**
 * Student progress reports from a teacher's own class: coursework marks and
 * attendance, one student or the whole class in one printable PDF.
 *
 * It was a plain-text file headed "REPORT CARD" — which it is not; the
 * official report card is issued from the exams module — that printed "N/A"
 * for an unmarked assignment and scored a missing maximum as out of 100. Here
 * each student gets a page on the school's letterhead: attendance with its
 * rate, every graded piece of work with marks, percentage and grade, and the
 * average — each worked out exactly, and left blank rather than guessed where
 * the data is not there.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { mean, ratioPercent } from "./decimal";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { ABSENT, documentFileName, marks as formatMarks, todayLabel } from "./format";
import { drawTable } from "./table";

export interface ProgressWork {
  title: string;
  marks: number | string | null;
  maxMarks: number | string | null;
  grade?: string | null;
}

export interface ProgressStudent {
  id: string;
  name: string;
  work: ProgressWork[];
  attendance: { present: number; absent: number; late: number; total: number };
}

/** Percentage for one piece of work, or null when it cannot be known. */
export function workPercent(w: ProgressWork): string | null {
  if (w.marks === null || w.marks === undefined || w.marks === "") return null;
  if (w.maxMarks === null || w.maxMarks === undefined || w.maxMarks === "") return null;
  return ratioPercent(w.marks, w.maxMarks);
}

/** Average of the percentages that can be known. */
export function averagePercent(work: ProgressWork[]): string | null {
  return mean(work.map(workPercent).filter((p): p is string => p !== null));
}

export function attendanceRate(a: ProgressStudent["attendance"]): string | null {
  return a.total > 0 ? ratioPercent(a.present, a.total) : null;
}

export async function buildProgressReports(
  students: ProgressStudent[],
  meta: { classLabel: string; teacherName?: string | null },
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  if (!students.length) throw new Error("there are no students to report on");
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];

  const doc = await createDocumentAsync({
    title: "Progress Report",
    subtitle: students[0].name,
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: `${students[0].name} · ${meta.classLabel}`,
    footerNote: "Coursework and attendance to date. Not the term report card.",
  });

  let unknownMax = 0;
  students.forEach((s, i) => {
    if (i > 0) doc.beginDocument({ subtitle: s.name, reference: `${s.name} · ${meta.classLabel}` });
    const avg = averagePercent(s.work);
    const rate = attendanceRate(s.attendance);
    doc.fields(
      [
        { label: "Student", value: s.name },
        { label: "Class", value: meta.classLabel },
        { label: "Class teacher", value: meta.teacherName },
        { label: "Average", value: avg ? `${avg}%` : null },
        { label: "Attendance", value: rate ? `${rate}%` : null },
        { label: "Date", value: todayLabel() },
      ],
      3,
    );
    doc.advance(1);

    doc.sectionTitle("Attendance");
    drawTable(doc, {
      columns: [
        { header: "Present", width: 1, align: "right", value: () => String(s.attendance.present) },
        { header: "Late", width: 1, align: "right", value: () => String(s.attendance.late) },
        { header: "Absent", width: 1, align: "right", value: () => String(s.attendance.absent) },
        { header: "Sessions", width: 1, align: "right", value: () => String(s.attendance.total) },
        { header: "Rate", width: 1, align: "right", bold: () => true, value: () => (rate ? `${rate}%` : ABSENT) },
      ],
      rows: [s.attendance],
      zebra: false,
    });
    doc.advance(2);

    doc.sectionTitle("Coursework");
    const avgRow: ProgressWork = { title: "Average", marks: "", maxMarks: null, grade: null };
    s.work.forEach((w) => {
      if (w.marks !== null && w.marks !== undefined && (w.maxMarks === null || w.maxMarks === undefined)) unknownMax += 1;
    });
    drawTable(doc, {
      columns: [
        { header: "Work", width: 3, value: (w: ProgressWork) => w.title },
        {
          header: "Marks",
          width: 1.2,
          align: "right",
          value: (w: ProgressWork) =>
            w === avgRow
              ? ""
              : w.marks === null || w.marks === undefined || w.marks === ""
              ? "Not marked"
              : `${formatMarks(w.marks)} / ${w.maxMarks === null || w.maxMarks === undefined ? "?" : formatMarks(w.maxMarks)}`,
        },
        {
          header: "%",
          width: 0.8,
          align: "right",
          value: (w: ProgressWork) => {
            const pct = w === avgRow ? avg : workPercent(w);
            return pct ? `${pct}%` : ABSENT;
          },
        },
        { header: "Grade", width: 0.8, align: "center", value: (w: ProgressWork) => w.grade ?? "" },
      ],
      rows: s.work,
      footerRows: s.work.length ? [avgRow] : [],
      emptyMessage: "No work has been graded yet.",
    });
    doc.advance(2);
    doc.signatures([{ title: "Class teacher", name: meta.teacherName ?? null }, { title: "Parent / guardian" }]);
  });

  if (unknownMax) warnings.push(`${unknownMax} mark(s) have no maximum recorded, so no percentage is shown for them`);
  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);

  const fileName = documentFileName(
    students.length === 1
      ? [students[0].name, "Progress Report", meta.classLabel]
      : [meta.classLabel, "Progress Reports", todayLabel()],
    "pdf",
  );
  return { doc, fileName, warnings };
}

export async function downloadProgressReports(...args: Parameters<typeof buildProgressReports>) {
  const { doc, fileName, warnings } = await buildProgressReports(...args);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printProgressReports(...args: Parameters<typeof buildProgressReports>) {
  const { doc, warnings } = await buildProgressReports(...args);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the report could not be sent to the printer");
  return { warnings };
}

export async function shareProgressReports(
  ...args: Parameters<typeof buildProgressReports>
): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildProgressReports(...args);
  const outcome = await shareFile(doc.blob(), fileName, { title: fileName.replace(/\.pdf$/, "") });
  return { ...outcome, warnings };
}
