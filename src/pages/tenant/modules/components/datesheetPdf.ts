/**
 * Exam datesheets — for a whole exam, one section, or one student.
 *
 * Rebuilt on the document system: the school's letterhead and colour instead
 * of a bare title in hard-coded blue; QR codes drawn as vectors instead of
 * pasted PNGs; table headers repeated and "Page X of Y" on long datesheets;
 * papers grouped by day so a family reads it as a schedule; and exam dates
 * printed as the calendar dates they are (they were parsed as midnight UTC and
 * could print a day early).
 *
 * The exported names and the returned jsPDF are unchanged for the screens
 * that save it or upload it per student.
 */
import type jsPDF from "jspdf";

import { createDocumentAsync, loadActiveSchoolBrand } from "@/lib/documents";
import { date as formatDate, documentFileName } from "@/lib/documents/format";
import { drawTable, type Column } from "@/lib/documents/table";
import { drawQrVector } from "@/lib/documents/verify";

export type DatesheetField =
  | "date" | "start" | "duration" | "subject" | "section" | "room" | "max" | "passing" | "invigilator";

export const ALL_FIELDS: { key: DatesheetField; label: string; default: boolean }[] = [
  { key: "date", label: "Date", default: true },
  { key: "start", label: "Start time", default: true },
  { key: "duration", label: "Duration", default: true },
  { key: "subject", label: "Subject", default: true },
  { key: "section", label: "Class / Section", default: true },
  { key: "room", label: "Room", default: true },
  { key: "max", label: "Max marks", default: true },
  { key: "passing", label: "Passing marks", default: false },
  { key: "invigilator", label: "Invigilator", default: false },
];

export interface DatesheetRow {
  id: string;
  subject_id: string | null;
  class_section_id: string | null;
  exam_date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number | null;
  passing_marks: number | null;
  room: string | null;
  invigilator_user_id: string | null;
}

export interface DatesheetMeta {
  schoolName: string;
  examName: string;
  sectionLabel?: string;
  studentLabel?: string;
  studentCode?: string;
  hallTicketUrl?: string;
}

export interface BuildOpts {
  fields: DatesheetField[];
  includePaperQR?: boolean;
  includeHallTicketQR?: boolean;
}

const LABELS: Record<DatesheetField, string> = {
  date: "Date", start: "Start", duration: "Duration", subject: "Subject",
  section: "Class / Section", room: "Room", max: "Max", passing: "Pass", invigilator: "Invigilator",
};

const WIDTHS: Record<DatesheetField, number> = {
  date: 1.6, start: 0.8, duration: 0.9, subject: 2, section: 1.4, room: 0.9, max: 0.7, passing: 0.7, invigilator: 1.5,
};

function time12(value: string | null): string {
  if (!value) return "";
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return value.slice(0, 5);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

function duration(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

function weekdayDate(value: string | null): string {
  if (!value) return "";
  const [y, mo, d] = value.slice(0, 10).split("-").map(Number);
  const local = new Date(y, mo - 1, d);
  if (Number.isNaN(local.getTime())) return value;
  return `${local.toLocaleDateString("en-GB", { weekday: "short" })}, ${formatDate(value.slice(0, 10))}`;
}

/** The file name a datesheet should be saved under. */
export function datesheetFileName(meta: DatesheetMeta): string {
  return documentFileName(
    [meta.studentLabel ?? meta.sectionLabel ?? "All classes", "Datesheet", meta.examName],
    "pdf",
  );
}

export async function buildDatesheetPDF(
  rows: DatesheetRow[],
  meta: DatesheetMeta,
  opts: BuildOpts,
  lookups: {
    subjects: Map<string, string>;
    sections: Map<string, string>;
    staff: Map<string, string>;
  },
): Promise<jsPDF> {
  const brand = await loadActiveSchoolBrand();
  const wide = opts.fields.length + (opts.includePaperQR ? 1 : 0) > 6;

  const doc = await createDocumentAsync({
    title: "Datesheet",
    subtitle: meta.examName,
    orientation: wide ? "landscape" : "portrait",
    school: {
      name: brand.name ?? meta.schoolName,
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: meta.studentLabel ?? meta.sectionLabel ?? meta.examName,
  });

  // Who and what it is for, with the hall-ticket code alongside.
  const qrSize = 24;
  const hallTicket = opts.includeHallTicketQR && meta.hallTicketUrl ? meta.hallTicketUrl : null;
  const top = doc.y;
  if (hallTicket) {
    drawQrVector(doc.pdf, hallTicket, doc.x + doc.width - qrSize, top, qrSize, doc.theme.ink);
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text("Hall ticket — scan to verify", doc.x + doc.width - qrSize / 2, top + qrSize + 3, { align: "center" });
  }
  doc.fields(
    [
      { label: "Examination", value: meta.examName },
      { label: "Student", value: meta.studentLabel },
      { label: "Student code", value: meta.studentCode },
      { label: "Class / Section", value: meta.sectionLabel },
      { label: "Papers", value: String(rows.length) },
    ],
    3,
    { width: hallTicket ? doc.width - qrSize - 6 : doc.width },
  );
  if (hallTicket) doc.y = Math.max(doc.y, top + qrSize + 6);
  doc.advance(1);

  const sorted = rows
    .slice()
    // Papers without a date go last, not first: "" sorts before any date.
    .sort(
      (a, b) =>
        (a.exam_date ? 0 : 1) - (b.exam_date ? 0 : 1) ||
        (a.exam_date || "").localeCompare(b.exam_date || "") ||
        (a.start_time || "").localeCompare(b.start_time || ""),
    );

  const columns: Column<DatesheetRow>[] = opts.fields.map((f) => ({
    header: LABELS[f],
    width: WIDTHS[f],
    align: f === "max" || f === "passing" ? "right" : "left",
    bold: f === "subject" ? () => true : undefined,
    value: (r: DatesheetRow) => {
      switch (f) {
        case "date": return weekdayDate(r.exam_date);
        case "start": return time12(r.start_time);
        case "duration": return duration(r.duration_minutes);
        case "subject": return lookups.subjects.get(r.subject_id || "") ?? "";
        case "section": return lookups.sections.get(r.class_section_id || "") ?? "";
        case "room": return r.room ?? "";
        case "max": return r.max_marks != null ? String(r.max_marks) : "";
        case "passing": return r.passing_marks != null ? String(r.passing_marks) : "";
        case "invigilator": return lookups.staff.get(r.invigilator_user_id || "") ?? "";
      }
    },
  }));

  if (opts.includePaperQR) {
    columns.push({
      header: "Paper QR",
      width: 0.8,
      value: () => "",
      minHeight: 16,
      drawCell: (d, r, _i, box) => {
        const payload = [
          meta.examName,
          lookups.subjects.get(r.subject_id || "") ?? "",
          r.exam_date ? formatDate(r.exam_date) : "",
          time12(r.start_time),
          r.room ? `Room ${r.room}` : "",
        ].filter(Boolean).join(" | ");
        const size = Math.min(box.h - 2, 14);
        drawQrVector(d.pdf, payload, box.x + (box.w - size) / 2, box.y + (box.h - size) / 2, size, d.theme.ink);
      },
    });
  }

  drawTable(doc, {
    columns,
    rows: sorted,
    emptyMessage: "No papers are scheduled for this selection.",
  });

  const undated = sorted.filter((r) => !r.exam_date).length;
  if (undated) {
    doc.note(`${undated} paper${undated === 1 ? " has" : "s have"} no date set yet and ${undated === 1 ? "is" : "are"} listed without one.`, {
      tone: "warning",
    });
  }

  doc.finish();
  return doc.pdf;
}
