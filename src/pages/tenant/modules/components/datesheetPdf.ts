import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { format } from "date-fns";

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
  section: "Class/Section", room: "Room", max: "Max", passing: "Pass", invigilator: "Invigilator",
};

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
  const doc = new jsPDF({ orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(meta.schoolName || "Datesheet", pageW / 2, 14, { align: "center" });
  doc.setFontSize(12); doc.setFont("helvetica", "normal");
  doc.text(`Exam Datesheet — ${meta.examName}`, pageW / 2, 21, { align: "center" });
  let topY = 27;
  if (meta.studentLabel) {
    doc.setFontSize(10);
    doc.text(`${meta.studentLabel}${meta.studentCode ? ` (${meta.studentCode})` : ""}`, pageW / 2, topY, { align: "center" });
    topY += 5;
  }
  if (meta.sectionLabel) {
    doc.setFontSize(10);
    doc.text(`Class/Section: ${meta.sectionLabel}`, pageW / 2, topY, { align: "center" });
    topY += 5;
  }

  // Hall-ticket QR (top right)
  if (opts.includeHallTicketQR && meta.hallTicketUrl) {
    try {
      const dataUrl = await QRCode.toDataURL(meta.hallTicketUrl, { width: 200, margin: 0 });
      doc.addImage(dataUrl, "PNG", pageW - 38, 8, 28, 28);
      doc.setFontSize(7); doc.setTextColor(100);
      doc.text("Hall ticket", pageW - 24, 39, { align: "center" });
      doc.setTextColor(0);
    } catch { /* ignore */ }
  }

  const head = [opts.fields.map((f) => LABELS[f])];
  if (opts.includePaperQR) head[0].push("QR");

  const sorted = rows.slice().sort(
    (a, b) => (a.exam_date || "").localeCompare(b.exam_date || "") || (a.start_time || "").localeCompare(b.start_time || "")
  );

  // Pre-generate per-paper QRs
  const qrMap = new Map<string, string>();
  if (opts.includePaperQR) {
    for (const r of sorted) {
      const payload = JSON.stringify({
        exam: meta.examName, subject: lookups.subjects.get(r.subject_id || "") || "",
        date: r.exam_date, start: r.start_time, room: r.room,
      });
      try { qrMap.set(r.id, await QRCode.toDataURL(payload, { width: 120, margin: 0 })); } catch {}
    }
  }

  const body = sorted.map((r) => {
    const row: any[] = opts.fields.map((f) => {
      switch (f) {
        case "date": return r.exam_date ? format(new Date(r.exam_date), "EEE, MMM d, yyyy") : "—";
        case "start": return r.start_time?.slice(0, 5) || "—";
        case "duration": return r.duration_minutes ? `${r.duration_minutes} min` : "—";
        case "subject": return lookups.subjects.get(r.subject_id || "") || "—";
        case "section": return lookups.sections.get(r.class_section_id || "") || "—";
        case "room": return r.room || "—";
        case "max": return r.max_marks?.toString() || "—";
        case "passing": return r.passing_marks?.toString() || "—";
        case "invigilator": return lookups.staff.get(r.invigilator_user_id || "") || "—";
      }
    });
    if (opts.includePaperQR) row.push("");
    return row;
  });

  autoTable(doc, {
    startY: topY + 2,
    head, body,
    styles: { fontSize: 9, cellPadding: 2.5, valign: "middle" },
    headStyles: { fillColor: [33, 90, 165], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    didDrawCell: (data) => {
      if (!opts.includePaperQR) return;
      if (data.section !== "body") return;
      if (data.column.index !== opts.fields.length) return;
      const r = sorted[data.row.index];
      const url = qrMap.get(r.id);
      if (!url) return;
      const size = Math.min(data.cell.height - 2, 14);
      doc.addImage(url, "PNG", data.cell.x + (data.cell.width - size) / 2, data.cell.y + (data.cell.height - size) / 2, size, size);
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 60;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Generated ${format(new Date(), "PPp")}`, 14, finalY + 8);
  return doc;
}
