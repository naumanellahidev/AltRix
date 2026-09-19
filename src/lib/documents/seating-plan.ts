/**
 * Exam seating plans for the hall door and the invigilator's desk.
 *
 * "Print Door Sheet" called window.print() on the whole application. Here each
 * hall is its own document in one PDF: the sitting's particulars, the hall
 * drawn as a grid of desks (seat, name, roll number, section) facing the
 * front, and a roll-ordered attendance list with a signature column, so the
 * invigilator can check candidates in and the door sheet can be pinned up.
 */
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { date as formatDate, documentFileName } from "./format";
import { drawTable } from "./table";

export interface SeatingSeat {
  student_id: string;
  student_name: string;
  roll_number?: string | null;
  section?: string | null;
  row: number;
  col: number;
  seat: string;
}

export interface SeatingPlanDoc {
  id: string;
  exam_name?: string | null;
  room_name?: string | null;
  rows?: number | null;
  cols?: number | null;
  exam_date?: string | null;
  start_time?: string | null;
  session_label?: string | null;
  invigilators?: Array<{ name?: string | null; role?: string | null }>;
  seats: SeatingSeat[];
}

function time12(value?: string | null): string | null {
  if (!value) return null;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return value;
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function drawGrid(doc: PdfDocument, plan: SeatingPlanDoc) {
  const rows = Math.max(plan.rows ?? 0, ...plan.seats.map((s) => s.row + 1), 1);
  const cols = Math.max(plan.cols ?? 0, ...plan.seats.map((s) => s.col + 1), 1);
  const bySeat = new Map(plan.seats.map((s) => [`${s.row}:${s.col}`, s]));

  // The front of the hall, so the sheet reads the way the room is laid out.
  doc.pdf.setFillColor(...doc.theme.accent);
  doc.pdf.rect(doc.x + doc.width * 0.3, doc.y, doc.width * 0.4, 5, "F");
  doc.pdf.setFont(doc.theme.bodyFont, "bold");
  doc.pdf.setFontSize(doc.theme.size.caption);
  doc.pdf.setTextColor(255, 255, 255);
  doc.pdf.text("FRONT — INVIGILATOR", doc.x + doc.width / 2, doc.y + 3.4, { align: "center" });
  doc.advance(8);

  const gap = 1.6;
  const w = (doc.width - gap * (cols - 1)) / cols;
  const h = Math.min(18, Math.max(12, w * 0.55));
  const nameSize = cols > 8 ? 5.5 : cols > 6 ? 6.2 : 7;

  for (let r = 0; r < rows; r += 1) {
    doc.ensureSpace(h + gap);
    const y = doc.y;
    for (let c = 0; c < cols; c += 1) {
      const x = doc.x + c * (w + gap);
      const seat = bySeat.get(`${r}:${c}`);
      doc.pdf.setDrawColor(...doc.theme.inkFaint);
      doc.pdf.setLineWidth(0.25);
      if (seat) {
        doc.pdf.setFillColor(...doc.theme.accentWash);
        doc.pdf.rect(x, y, w, h, "FD");
      } else {
        doc.pdf.rect(x, y, w, h, "S");
      }
      const label = seat?.seat ?? `${String.fromCharCode(65 + (r % 26))}-${c + 1}`;
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(nameSize);
      doc.pdf.setTextColor(...doc.theme.accent);
      doc.pdf.text(label, x + 1.2, y + 2.8);
      if (!seat) continue;
      doc.pdf.setTextColor(...doc.theme.ink);
      const name = doc.pdf.splitTextToSize(seat.student_name, w - 2.4).slice(0, 2) as string[];
      doc.pdf.text(name, x + 1.2, y + 6);
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      const meta = [seat.roll_number ? `Roll ${seat.roll_number}` : null, seat.section].filter(Boolean).join(" · ");
      if (meta) doc.pdf.text(doc.pdf.splitTextToSize(meta, w - 2.4)[0] as string, x + 1.2, y + h - 1.6);
    }
    doc.y = y + h + gap;
  }
  doc.advance(3);
}

export async function buildSeatingPlans(
  plans: SeatingPlanDoc[],
  options: { brand?: SchoolBrand } = {},
): Promise<{ doc: PdfDocument; fileName: string; warnings: string[] }> {
  if (!plans.length) throw new Error("there is no seating plan to print");
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  const wide = plans.some((p) => (p.cols ?? 0) > 6);

  const sub = (p: SeatingPlanDoc) => [p.room_name, p.exam_name].filter(Boolean).join(" — ");
  const doc = await createDocumentAsync({
    title: "Seating Plan",
    subtitle: sub(plans[0]),
    orientation: wide ? "landscape" : "portrait",
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: sub(plans[0]),
  });

  plans.forEach((plan, i) => {
    if (i > 0) doc.beginDocument({ subtitle: sub(plan), reference: sub(plan) });
    const invigilators = (plan.invigilators ?? []).map((v) => v.name).filter(Boolean).join(", ");
    doc.fields(
      [
        { label: "Hall", value: plan.room_name },
        { label: "Examination", value: plan.exam_name },
        { label: "Sitting", value: plan.session_label },
        { label: "Date", value: plan.exam_date ? formatDate(plan.exam_date) : null },
        { label: "Start time", value: time12(plan.start_time) },
        { label: "Candidates", value: String(plan.seats.length) },
        { label: "Invigilator", value: invigilators || null },
      ],
      wide ? 4 : 3,
    );
    doc.advance(2);
    drawGrid(doc, plan);

    doc.sectionTitle("Attendance");
    const roster = plan.seats
      .slice()
      .sort((a, b) =>
        String(a.roll_number ?? "").localeCompare(String(b.roll_number ?? ""), undefined, { numeric: true }) ||
        a.student_name.localeCompare(b.student_name),
      );
    drawTable(doc, {
      columns: [
        { header: "Seat", width: 0.7, bold: () => true, value: (s: SeatingSeat) => s.seat },
        { header: "Roll No.", width: 0.9, value: (s: SeatingSeat) => s.roll_number ?? "" },
        { header: "Candidate", width: 2.4, value: (s: SeatingSeat) => s.student_name },
        { header: "Class / Section", width: 1.5, value: (s: SeatingSeat) => s.section ?? "" },
        { header: "Signature", width: 1.5, value: () => "" },
      ],
      rows: roster,
      padding: 2.2,
      emptyMessage: "No candidates are seated in this hall.",
    });
    doc.signatures([{ title: "Invigilator", name: invigilators || null }, { title: "Controller of Examinations" }]);
  });

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);
  const first = plans[0];
  const fileName = documentFileName(
    [plans.length === 1 ? first.room_name : `${plans.length} halls`, "Seating Plan", first.exam_name, first.session_label, first.exam_date ? formatDate(first.exam_date) : null],
    "pdf",
  );
  return { doc, fileName, warnings };
}

export async function downloadSeatingPlans(plans: SeatingPlanDoc[]) {
  const { doc, fileName, warnings } = await buildSeatingPlans(plans);
  triggerDownload(doc.blob(), fileName);
  return { fileName, warnings };
}

export async function printSeatingPlans(plans: SeatingPlanDoc[]) {
  const { doc, warnings } = await buildSeatingPlans(plans);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the seating plan could not be sent to the printer");
  return { warnings };
}

export async function shareSeatingPlans(plans: SeatingPlanDoc[]): Promise<ShareOutcome & { warnings: string[] }> {
  const { doc, fileName, warnings } = await buildSeatingPlans(plans);
  const outcome = await shareFile(doc.blob(), fileName, { title: fileName.replace(/\.pdf$/, "") });
  return { ...outcome, warnings };
}
