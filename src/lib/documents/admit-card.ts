/**
 * Examination admit cards (hall tickets), one per student, for a section.
 *
 * The old card printed "Eduverse Academy" when the school's name did not load,
 * "N/A" for a missing student code, and exam rules on single unwrapped lines
 * that ran off the edge of the page; with a long datesheet the signatures fell
 * off the bottom. It had no photograph — the one thing an invigilator needs to
 * match a card to a face.
 *
 * Each card here is its own document within one printable PDF: the school's
 * letterhead, the student's photo and particulars, a QR code that opens the
 * school's own verification page, the student's papers, the rules wrapped to
 * the page, and signature lines — all paginated so nothing is lost.
 */
import { tryLoadImage, type LoadedImage } from "./assets";
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { date as formatDate, documentFileName } from "./format";
import { drawTable } from "./table";
import { drawQrVector } from "./verify";

export interface AdmitStudent {
  id: string;
  name: string;
  code?: string | null;
  rollNumber?: string | null;
  photoUrl?: string | null;
}

export interface AdmitPaper {
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  subject: string;
  room: string | null;
}

export interface AdmitMeta {
  examName: string;
  sectionLabel: string;
  /** Builds the verification link for a student. */
  verifyUrl: (studentId: string) => string;
  rules: string[];
}

function time12(value: string | null): string {
  if (!value) return "";
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return value.slice(0, 5);
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function weekdayDate(value: string | null): string {
  if (!value) return "";
  const [y, mo, d] = value.slice(0, 10).split("-").map(Number);
  const local = new Date(y, mo - 1, d);
  return Number.isNaN(local.getTime())
    ? value
    : `${local.toLocaleDateString("en-GB", { weekday: "short" })}, ${formatDate(value.slice(0, 10))}`;
}

async function photos(students: AdmitStudent[]) {
  const out = new Map<string, LoadedImage | null>();
  const queue = [...students];
  let failed = 0;
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (!s.photoUrl) {
        out.set(s.id, null);
        continue;
      }
      const { image, failure } = await tryLoadImage(s.photoUrl, "student-photos");
      out.set(s.id, image);
      if (failure) failed += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, students.length) }, worker));
  return { map: out, failed };
}

function drawCard(doc: PdfDocument, student: AdmitStudent, photo: LoadedImage | null, papers: AdmitPaper[], meta: AdmitMeta) {
  // Photo on the left, particulars in the middle, verification on the right.
  const top = doc.y;
  const pw = 26;
  const ph = 32;
  const qr = 26;
  doc.pdf.setFillColor(...doc.theme.accentWash);
  doc.pdf.rect(doc.x, top, pw, ph, "F");
  if (photo && (photo.format === "PNG" || photo.format === "JPEG")) {
    doc.image(photo.data, photo.format, { x: doc.x, y: top, width: pw, height: ph });
  } else {
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text(["Affix", "photograph"], doc.x + pw / 2, top + ph / 2 - 1, { align: "center" });
  }
  doc.pdf.setDrawColor(...doc.theme.accent);
  doc.pdf.setLineWidth(0.4);
  doc.pdf.rect(doc.x, top, pw, ph, "S");

  drawQrVector(doc.pdf, meta.verifyUrl(student.id), doc.x + doc.width - qr, top, qr, doc.theme.ink);
  doc.pdf.setFont(doc.theme.bodyFont, "normal");
  doc.pdf.setFontSize(doc.theme.size.caption);
  doc.pdf.setTextColor(...doc.theme.inkMuted);
  doc.pdf.text("Scan to verify", doc.x + doc.width - qr / 2, top + qr + 3, { align: "center" });

  doc.fields(
    [
      { label: "Candidate", value: student.name },
      { label: "Student code", value: student.code },
      { label: "Roll No.", value: student.rollNumber },
      { label: "Class / Section", value: meta.sectionLabel },
      { label: "Examination", value: meta.examName },
    ],
    2,
    { x: doc.x + pw + 5, width: doc.width - pw - 5 - qr - 6 },
  );
  doc.y = Math.max(doc.y, top + ph + 4);

  drawTable(doc, {
    columns: [
      { header: "Date", width: 1.6, value: (p: AdmitPaper) => weekdayDate(p.exam_date) },
      { header: "Time", width: 0.9, value: (p: AdmitPaper) => time12(p.start_time) },
      { header: "Duration", width: 0.9, value: (p: AdmitPaper) => (p.duration_minutes ? `${p.duration_minutes} min` : "") },
      { header: "Paper", width: 2.2, bold: () => true, value: (p: AdmitPaper) => p.subject },
      { header: "Room", width: 0.9, value: (p: AdmitPaper) => p.room ?? "" },
      { header: "Invigilator", width: 1.1, value: () => "" },
    ],
    rows: papers,
    padding: 1.8,
  });
  doc.text("The invigilator initials each paper as it is sat.", { size: doc.theme.size.caption, color: doc.theme.inkMuted, spaceAfter: 2 });

  if (meta.rules.length) {
    doc.sectionTitle("Instructions");
    meta.rules.forEach((rule, i) => {
      doc.text(`${i + 1}. ${rule.replace(/^\d+[.)]\s*/, "")}`, { size: doc.theme.size.small, spaceAfter: 0.6 });
    });
  }

  doc.signatures([{ title: "Class Teacher" }, { title: "Controller of Examinations" }, { title: "Candidate" }]);
}

export interface AdmitCardResult {
  doc: PdfDocument;
  fileName: string;
  warnings: string[];
}

export async function buildAdmitCards(
  students: AdmitStudent[],
  papers: AdmitPaper[],
  meta: AdmitMeta,
  options: { brand?: SchoolBrand } = {},
): Promise<AdmitCardResult> {
  if (!students.length) throw new Error("there are no students in this section");
  if (!papers.length) throw new Error("this section has no papers on the datesheet");
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  const warnings: string[] = brand.logoProblem ? [brand.logoProblem] : [];
  if (!brand.name) warnings.push("the school's name could not be loaded");

  const { map: photoMap, failed } = await photos(students);
  const missing = students.filter((s) => !s.photoUrl).length;
  if (missing) warnings.push(`${missing} student${missing === 1 ? " has" : "s have"} no photo on file; their cards have a box to affix one`);
  if (failed) warnings.push(`${failed} photo${failed === 1 ? "" : "s"} could not be loaded`);

  const sorted = papers
    .slice()
    // Papers without a date go last, not first: "" sorts before any date.
    .sort(
      (a, b) =>
        (a.exam_date ? 0 : 1) - (b.exam_date ? 0 : 1) ||
        (a.exam_date || "").localeCompare(b.exam_date || "") ||
        (a.start_time || "").localeCompare(b.start_time || ""),
    );

  const doc = await createDocumentAsync({
    title: "Admit Card",
    subtitle: meta.examName,
    school: {
      name: brand.name ?? "",
      address: brand.address,
      phone: brand.phone,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: students[0].name,
  });

  students.forEach((student, i) => {
    if (i > 0) doc.beginDocument({ reference: student.name });
    drawCard(doc, student, photoMap.get(student.id) ?? null, sorted, meta);
  });

  const fileName = documentFileName(
    [students.length === 1 ? students[0].name : meta.sectionLabel, "Admit Card" + (students.length === 1 ? "" : "s"), meta.examName],
    "pdf",
  );
  return { doc, fileName, warnings };
}
