/**
 * Weekly timetables — a class's, or a teacher's.
 *
 * The teacher timetable was an HTML page printed from a pop-up, and its
 * "download" saved that page as a .html file. The class timetable printed the
 * whole application window from behind its preview dialog. Both are now a
 * landscape A4 grid on the school's letterhead: periods down the side with
 * their times, the school week across, each lesson with its subject, class or
 * teacher, and room. Break rows are shaded. Two lessons in one slot — a clash
 * — are both printed and reported, never silently dropped.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { documentFileName } from "./format";
import { drawTable, type Column } from "./table";

export interface TimetablePeriodInput {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  is_break?: boolean;
}

export interface TimetableEntryInput {
  day_of_week: number;
  period_id: string;
  subject_name: string | null;
  room: string | null;
  section_label?: string | null;
  teacher_name?: string | null;
}

export interface TimetableInput {
  /** "Class Timetable" or "Teacher Timetable". */
  title: string;
  /** Whose it is: "Grade 7 — Blue", or the teacher's name. */
  subject: string;
  periods: TimetablePeriodInput[];
  entries: TimetableEntryInput[];
  /** Show the teacher in each cell (class timetable) or the class (teacher timetable). */
  cellDetail: "teacher" | "section";
  effectiveFrom?: string | null;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function t12(v: string | null): string {
  if (!v) return "";
  const [h, m] = v.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return v.slice(0, 5);
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")}${h >= 12 ? " PM" : " AM"}`;
}

function isBreak(p: TimetablePeriodInput) {
  return p.is_break === true || /\b(break|recess|lunch|assembly)\b/i.test(p.label);
}

export async function buildTimetable(input: TimetableInput, options: { brand?: SchoolBrand } = {}) {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];

  // The school week: Monday to Friday, plus any other day that has lessons.
  const used = new Set(input.entries.map((e) => e.day_of_week));
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => (d >= 1 && d <= 5) || used.has(d));
  const periods = input.periods.slice().sort((a, b) => a.sort_order - b.sort_order);

  const slot = new Map<string, TimetableEntryInput[]>();
  for (const e of input.entries) {
    const key = `${e.period_id}:${e.day_of_week}`;
    slot.set(key, [...(slot.get(key) ?? []), e]);
  }
  const clashes = [...slot.entries()].filter(([, list]) => list.length > 1);
  if (clashes.length) {
    warnings.push(`${clashes.length} slot${clashes.length === 1 ? " has" : "s have"} more than one lesson — all are printed, marked "clash"`);
  }
  const orphaned = input.entries.filter((e) => !periods.some((p) => p.id === e.period_id)).length;
  if (orphaned) warnings.push(`${orphaned} lesson${orphaned === 1 ? " is" : "s are"} attached to a period that no longer exists and could not be placed`);

  const cellText = (list: TimetableEntryInput[] | undefined): string => {
    if (!list?.length) return "";
    const one = (e: TimetableEntryInput) =>
      [
        e.subject_name ?? "",
        input.cellDetail === "teacher" ? e.teacher_name ?? "" : e.section_label ?? "",
        e.room ? `Room ${e.room}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    return list.length === 1 ? one(list[0]) : `CLASH\n${list.map(one).join("\n—\n")}`;
  };

  const doc: PdfDocument = await createDocumentAsync({
    title: input.title,
    subtitle: input.subject,
    orientation: "landscape",
    margins: { top: 12, right: 12, bottom: 16, left: 12 },
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: input.subject,
  });

  const lessons = input.entries.filter((e) => periods.some((p) => p.id === e.period_id)).length;
  doc.fields(
    [
      { label: input.cellDetail === "teacher" ? "Class" : "Teacher", value: input.subject },
      { label: "Lessons per week", value: String(lessons) },
      { label: "School days", value: days.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ") },
      { label: "Effective from", value: input.effectiveFrom ?? null },
    ],
    4,
  );

  type Row = TimetablePeriodInput;
  const columns: Column<Row>[] = [
    {
      header: "Period",
      width: 1.1,
      bold: () => true,
      value: (p) => [p.label, [t12(p.start_time), t12(p.end_time)].filter(Boolean).join(" – ")].filter(Boolean).join("\n"),
    },
    ...days.map((d) => ({
      header: DAY_NAMES[d],
      width: 1.6,
      value: (p: Row) => (isBreak(p) && !slot.get(`${p.id}:${d}`) ? "" : cellText(slot.get(`${p.id}:${d}`))),
      color: (p: Row) => ((slot.get(`${p.id}:${d}`)?.length ?? 0) > 1 ? doc.theme.danger : undefined),
      drawCell: (dd: PdfDocument, p: Row, _i: number, box: { x: number; y: number; w: number; h: number }) => {
        if (isBreak(p) && !slot.get(`${p.id}:${d}`)) {
          dd.pdf.setFillColor(...dd.theme.accentWash);
          dd.pdf.rect(box.x, box.y, box.w, box.h, "F");
          dd.pdf.setFont(dd.theme.bodyFont, "italic");
          dd.pdf.setFontSize(dd.theme.size.caption);
          dd.pdf.setTextColor(...dd.theme.inkMuted);
          dd.pdf.text(p.label, box.x + box.w / 2, box.y + box.h / 2 + 1, { align: "center" });
        }
      },
    })),
  ];

  drawTable(doc, {
    columns,
    rows: periods,
    fontSize: days.length > 5 ? 7 : 7.5,
    padding: 1.6,
    zebra: false,
    emptyMessage: "No periods have been set up for this timetable.",
  });

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const fileName = documentFileName([input.subject, input.title], "pdf");
  return { doc, fileName, warnings };
}

export async function downloadTimetable(input: TimetableInput) {
  const { doc, fileName, warnings } = await buildTimetable(input);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printTimetable(input: TimetableInput) {
  const { doc, warnings } = await buildTimetable(input);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the timetable could not be sent to the printer");
  return { warnings };
}

export async function shareTimetable(input: TimetableInput): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildTimetable(input);
  const outcome = await shareFile(doc.blob(), fileName, { title: `${input.subject} — ${input.title}` });
  return { ...outcome, warnings };
}
