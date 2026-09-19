/**
 * The report card, as the school issues it.
 *
 * Built from the stored card — the one the school published — rather than
 * from whatever the screen happened to be showing, so a card downloaded by a
 * parent, printed by the office and generated for a whole class are the same
 * document. That also makes a class set possible: every published card in a
 * section, one file per child, in one download.
 *
 * What it carries, all of it only when the school has the data:
 *   the letterhead; the child's photo and particulars; headline results
 *   (marks, percentage, grade, GPA, position, attendance); every subject with
 *   class average, highest mark and position; co-curricular grades; a trend
 *   across terms; teacher and principal remarks; signature lines; and a QR code
 *   that anyone can scan to confirm the card with the school.
 *
 * What it never does: print 0 for a mark that was not recorded, print a
 * signature that was not given, or print a verification code for a draft. An
 * unpublished card is marked DRAFT across every page.
 */
import { apiClient } from "@/lib/api-client";

import { tryLoadImage } from "./assets";
import { type SchoolBrand, loadActiveSchoolBrand } from "./brand";
import { type PdfDocument, createDocumentAsync } from "./document";
import { type BulkResult, generateArchive, print as printPdf, shareFile, triggerDownload, type ShareOutcome } from "./deliver";
import { ABSENT, date as formatDate, documentFileName, marks, name as joinName, percent } from "./format";
import { drawTable } from "./table";
import { reportCardVerificationUrl, drawQrVector } from "./verify";

type Num = number | string | null | undefined;

export interface ReportCardDetail {
  report_card: {
    id: string;
    period_type?: string | null;
    period_label?: string | null;
    academic_year?: string | null;
    total_marks?: Num;
    max_total_marks?: Num;
    percentage?: Num;
    gpa?: Num;
    overall_grade?: string | null;
    position_in_class?: number | null;
    total_students_in_class?: number | null;
    attendance_percentage?: Num;
    total_present_days?: number | null;
    total_school_days?: number | null;
    teacher_remarks?: string | null;
    principal_remarks?: string | null;
    is_published?: boolean;
    published_at?: string | null;
    qr_verification_token?: string | null;
    signed_by_name?: string | null;
    signed_by_title?: string | null;
    signed_at?: string | null;
    trend_data?: Array<{ term?: string; label?: string; percentage?: Num; gpa?: Num }> | null;
  };
  subject_entries: Array<{
    subject_name: string;
    marks_obtained?: Num;
    max_marks?: Num;
    percentage?: Num;
    grade?: string | null;
    gpa_points?: Num;
    position_in_subject?: number | null;
    class_average?: Num;
    highest_in_class?: Num;
    teacher_comment?: string | null;
  }>;
  co_curricular: Array<{
    activity_name: string;
    category?: string | null;
    grade?: string | null;
    score?: Num;
    max_score?: Num;
    remarks?: string | null;
  }>;
  student: {
    id: string;
    first_name: string;
    last_name?: string | null;
    roll_number?: string | null;
    registration_number?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    photo_url?: string | null;
    class_name?: string | null;
    section_name?: string | null;
  } | null;
}

export interface GradeBand {
  grade: string;
  min: Num;
  max?: Num;
  remark?: string | null;
}

export interface ReportCardResult {
  doc: PdfDocument;
  fileName: string;
  warnings: string[];
}

function present(v: unknown): boolean {
  return v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Load a card's full detail from the server. */
export async function fetchReportCardDetail(cardId: string): Promise<ReportCardDetail> {
  const res = await apiClient.get<ReportCardDetail>(`/report-cards/${cardId}`);
  if (!res.data?.report_card) throw new Error("the report card could not be loaded");
  return res.data;
}

/** Build the report card PDF. Does not download it. */
export async function buildReportCard(
  detail: ReportCardDetail,
  options: { brand?: SchoolBrand; gradeScale?: GradeBand[] } = {},
): Promise<ReportCardResult> {
  const warnings: string[] = [];
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  if (brand.logoProblem) warnings.push(brand.logoProblem);

  const card = detail.report_card;
  const student = detail.student;
  const studentName = student ? joinName(student.first_name, student.last_name) : ABSENT;
  const published = card.is_published === true;
  const period = [card.period_label, card.academic_year].filter(present).join(" · ");

  const doc = await createDocumentAsync({
    title: "Report Card",
    subtitle: period || null,
    school: {
      name: brand.name ?? "School",
      address: brand.address,
      phone: brand.phone,
      email: brand.email,
      website: brand.website,
      logoUrl: brand.logo && (brand.logo.format === "PNG" || brand.logo.format === "JPEG") ? brand.logo.data : null,
    },
    accent: brand.accentHex,
    reference: studentName,
    watermark: published ? "none" : "draft",
    footerNote: published
      ? `Issued ${formatDate(card.published_at)}${card.qr_verification_token ? " · Scan the code to verify with the school" : ""}`
      : "DRAFT — not yet published by the school",
  });

  // ── Student particulars, with photo ───────────────────────────────────────
  const photoSize = 26;
  let photoDrawn = false;
  if (student?.photo_url) {
    const { image, failure } = await tryLoadImage(student.photo_url, "student-photos");
    if (image && (image.format === "PNG" || image.format === "JPEG")) {
      doc.pdf.setDrawColor(...doc.theme.rule);
      doc.pdf.setLineWidth(0.3);
      doc.pdf.rect(doc.x + doc.width - photoSize, doc.y, photoSize, photoSize * 1.2, "S");
      photoDrawn = doc.image(image.data, image.format, {
        x: doc.x + doc.width - photoSize + 0.6,
        y: doc.y + 0.6,
        width: photoSize - 1.2,
        height: photoSize * 1.2 - 1.2,
      });
    } else if (failure) {
      warnings.push(`the student's photo could not be loaded (${failure.reason})`);
    }
  }

  const startY = doc.y;
  const classLine = [student?.class_name, student?.section_name].filter(present).join(" – ");
  doc.fields(
    [
      { label: "Student", value: studentName },
      { label: "Class", value: classLine },
      { label: "Roll No.", value: student?.roll_number },
      { label: "Registration No.", value: student?.registration_number },
      { label: "Date of Birth", value: student?.date_of_birth ? formatDate(student.date_of_birth) : null },
      // Term and session are in the heading; they are only repeated here when
      // there is no heading line to carry them.
      ...(period ? [] : [{ label: "Term", value: card.period_label }]),
    ],
    photoDrawn ? 2 : 3,
    { width: photoDrawn ? doc.width - photoSize - 4 : doc.width },
  );
  if (photoDrawn) doc.y = Math.max(doc.y, startY + photoSize * 1.2 + 2);
  doc.advance(1);

  // ── Headline results ──────────────────────────────────────────────────────
  const tiles: Array<{ label: string; value: string }> = [];
  if (present(card.total_marks) && present(card.max_total_marks)) {
    tiles.push({ label: "Marks", value: `${marks(card.total_marks)} / ${marks(card.max_total_marks)}` });
  }
  if (present(card.percentage)) tiles.push({ label: "Percentage", value: percent(card.percentage, { places: 2 }) });
  if (present(card.overall_grade)) tiles.push({ label: "Grade", value: String(card.overall_grade) });
  if (present(card.gpa)) tiles.push({ label: "GPA", value: marks(card.gpa) });
  if (card.position_in_class) {
    tiles.push({
      label: "Position",
      value: card.total_students_in_class
        ? `${ordinal(card.position_in_class)} of ${card.total_students_in_class}`
        : ordinal(card.position_in_class),
    });
  }
  if (present(card.attendance_percentage) || (card.total_present_days != null && card.total_school_days)) {
    const days =
      card.total_present_days != null && card.total_school_days ? `${card.total_present_days}/${card.total_school_days} days` : null;
    const pct = present(card.attendance_percentage) ? percent(card.attendance_percentage) : null;
    tiles.push({ label: "Attendance", value: [pct, days].filter(Boolean).join(" · ") });
  }

  if (tiles.length) {
    const perRow = Math.min(tiles.length, 6);
    const gap = 2.5;
    const w = (doc.width - gap * (perRow - 1)) / perRow;
    const h = 13;
    const rows = Math.ceil(tiles.length / perRow);
    doc.ensureSpace(rows * (h + gap));
    tiles.forEach((t, i) => {
      const x = doc.x + (i % perRow) * (w + gap);
      const y = doc.y + Math.floor(i / perRow) * (h + gap);
      doc.pdf.setFillColor(...doc.theme.accentWash);
      doc.pdf.roundedRect(x, y, w, h, 1.5, 1.5, "F");
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(doc.theme.size.caption);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(t.label.toUpperCase(), x + w / 2, y + 4.4, { align: "center" });
      doc.pdf.setFontSize(t.value.length > 14 ? 9 : 11.5);
      doc.pdf.setTextColor(...doc.theme.accent);
      doc.pdf.text(doc.pdf.splitTextToSize(t.value, w - 3)[0] as string, x + w / 2, y + 10.2, { align: "center" });
    });
    doc.advance(rows * (h + gap) + 1);
  }

  // ── Subjects ──────────────────────────────────────────────────────────────
  doc.sectionTitle("Academic performance");
  type Entry = ReportCardDetail["subject_entries"][number];
  const entries = detail.subject_entries ?? [];
  const hasStats = entries.some((e) => present(e.class_average) || present(e.highest_in_class));
  const hasPosition = entries.some((e) => e.position_in_subject);
  const hasComments = entries.some((e) => present(e.teacher_comment));

  const columns = [
    { header: "Subject", width: 2.4, value: (e: Entry) => e.subject_name },
    { header: "Marks", width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.marks_obtained) ? marks(e.marks_obtained) : "") },
    { header: "Out of", width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.max_marks) ? marks(e.max_marks) : "") },
    { header: "%", width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.percentage) ? percent(e.percentage) : "") },
    {
      header: "Grade",
      width: 0.8,
      align: "center" as const,
      value: (e: Entry) => e.grade ?? "",
      bold: () => true,
    },
    ...(hasStats
      ? [
          { header: "Avg", width: 0.8, align: "right" as const, value: (e: Entry) => (present(e.class_average) ? marks(e.class_average) : "") },
          { header: "Top", width: 0.8, align: "right" as const, value: (e: Entry) => (present(e.highest_in_class) ? marks(e.highest_in_class) : "") },
        ]
      : []),
    ...(hasPosition
      ? [{ header: "Pos.", width: 0.7, align: "center" as const, value: (e: Entry) => (e.position_in_subject ? ordinal(e.position_in_subject) : "") }]
      : []),
    ...(hasComments ? [{ header: "Comment", width: 2.6, value: (e: Entry) => e.teacher_comment ?? "" }] : []),
  ];

  const totals: Entry | null =
    entries.length && present(card.total_marks)
      ? {
          subject_name: "Total",
          marks_obtained: card.total_marks,
          max_marks: card.max_total_marks,
          percentage: card.percentage,
          grade: card.overall_grade ?? null,
        }
      : null;

  drawTable(doc, {
    columns,
    rows: entries,
    footerRows: totals ? [totals] : [],
    emptyMessage: "No subject results have been recorded on this card.",
    padding: 1.5,
  });

  // A subject with no mark recorded is shown blank, never as zero, and says why.
  if (entries.some((e) => !present(e.marks_obtained))) {
    doc.text("A blank mark means no result was recorded for that subject; it is not a score of zero.", {
      size: doc.theme.size.caption,
      color: doc.theme.inkMuted,
      style: "italic",
      spaceAfter: 1,
    });
  }

  // ── Co-curricular ─────────────────────────────────────────────────────────
  const co = detail.co_curricular ?? [];
  if (co.length) {
    doc.sectionTitle("Co-curricular activities");
    type Co = (typeof co)[number];
    const coColumns = [
      { header: "Activity", width: 2, value: (c: Co) => c.activity_name },
      ...(co.some((c) => present(c.category)) ? [{ header: "Category", width: 1.3, value: (c: Co) => c.category ?? "" }] : []),
      ...(co.some((c) => present(c.grade)) ? [{ header: "Grade", width: 0.8, align: "center" as const, value: (c: Co) => c.grade ?? "" }] : []),
      ...(co.some((c) => present(c.score))
        ? [{
            header: "Score",
            width: 1,
            align: "right" as const,
            value: (c: Co) => (present(c.score) ? `${marks(c.score)}${present(c.max_score) ? ` / ${marks(c.max_score)}` : ""}` : ""),
          }]
        : []),
      ...(co.some((c) => present(c.remarks)) ? [{ header: "Remarks", width: 2.6, value: (c: Co) => c.remarks ?? "" }] : []),
    ];
    drawTable(doc, {
      columns: coColumns,
      padding: 1.4,
      rows: co,
    });
  }

  // ── Trend across terms ────────────────────────────────────────────────────
  const trend = (card.trend_data ?? []).filter((t) => present(t.percentage));
  if (trend.length >= 2) {
    doc.sectionTitle("Progress across terms");
    const chartH = 16;
    doc.ensureSpace(chartH + 10);
    const top = doc.y;
    const barGap = 4;
    const barW = Math.min(18, (doc.width - barGap * (trend.length - 1)) / trend.length);
    const totalW = trend.length * barW + (trend.length - 1) * barGap;
    const left = doc.x + (doc.width - totalW) / 2;
    doc.pdf.setDrawColor(...doc.theme.ruleFaint);
    doc.pdf.setLineWidth(0.2);
    for (const pct of [25, 50, 75, 100]) {
      const y = top + chartH - (chartH * pct) / 100;
      doc.pdf.line(doc.x, y, doc.x + doc.width, y);
    }
    trend.forEach((t, i) => {
      const value = Math.max(0, Math.min(100, Number(t.percentage)));
      const h = (chartH * value) / 100;
      const x = left + i * (barW + barGap);
      const last = i === trend.length - 1;
      doc.pdf.setFillColor(...(last ? doc.theme.accent : doc.theme.accentWash));
      if (!last) doc.pdf.setDrawColor(...doc.theme.accent);
      doc.pdf.rect(x, top + chartH - h, barW, h, last ? "F" : "FD");
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(doc.theme.size.caption);
      doc.pdf.setTextColor(...doc.theme.ink);
      doc.pdf.text(percent(t.percentage), x + barW / 2, top + chartH - h - 1.2, { align: "center" });
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(String(t.label ?? t.term ?? ""), x + barW / 2, top + chartH + 4, { align: "center" });
    });
    doc.y = top + chartH + 8;
  }

  // ── Remarks ───────────────────────────────────────────────────────────────
  if (present(card.teacher_remarks) || present(card.principal_remarks)) {
    doc.sectionTitle("Remarks");
    doc.note(
      [
        present(card.teacher_remarks) ? `Class teacher: ${card.teacher_remarks}` : null,
        present(card.principal_remarks) ? `Principal: ${card.principal_remarks}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  // ── Grading key ───────────────────────────────────────────────────────────
  const scale = (options.gradeScale ?? []).filter((g) => present(g.grade));
  if (scale.length) {
    doc.ensureSpace(10);
    doc.text(
      `Grading key: ${scale.map((g) => `${g.grade} ${marks(g.min)}${present(g.max) ? `–${marks(g.max)}` : "+"}%`).join("   ")}`,
      { size: doc.theme.size.caption, color: doc.theme.inkMuted, spaceAfter: 1 },
    );
  }

  // ── Signatures and verification ───────────────────────────────────────────
  const qrSize = 18;
  const token = published ? card.qr_verification_token : null;
  doc.ensureSpace(26);
  const blockTop = doc.y;
  if (token) {
    drawQrVector(doc.pdf, reportCardVerificationUrl(token), doc.x + doc.width - qrSize, blockTop + 4, qrSize, doc.theme.ink);
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text("Scan to verify", doc.x + doc.width - qrSize / 2, blockTop + qrSize + 7, { align: "center" });
  }
  // Signature lines in the space left of the code. A digital sign-off is
  // stated as what it is; an unsigned line stays empty for a pen.
  doc.signatures([
    { title: "Class Teacher" },
    {
      title: card.signed_by_title || "Principal",
      name: card.signed_by_name ?? null,
      note: card.signed_at ? `Signed digitally ${formatDate(card.signed_at)}` : null,
    },
    { title: "Parent / Guardian" },
  ], { width: token ? doc.width - qrSize - 6 : doc.width });
  doc.y = Math.max(doc.y, blockTop + qrSize + 10);

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);

  const fileName = documentFileName(
    [studentName, "Report Card", card.period_label, card.academic_year, published ? null : "DRAFT"],
    "pdf",
  );
  return { doc, fileName, warnings };
}

/** Load, build and download one card. */
export async function downloadReportCard(cardId: string, options: { gradeScale?: GradeBand[] } = {}) {
  const detail = await fetchReportCardDetail(cardId);
  const result = await buildReportCard(detail, options);
  triggerDownload(result.doc.blob(), result.fileName);
  return { fileName: result.fileName, warnings: result.warnings, pages: result.doc.pages };
}

/** Load, build and share one card — to WhatsApp on a phone. */
export async function shareReportCard(cardId: string): Promise<ShareOutcome & { warnings: string[] }> {
  const detail = await fetchReportCardDetail(cardId);
  const { doc, fileName, warnings } = await buildReportCard(detail);
  const who = detail.student ? joinName(detail.student.first_name, detail.student.last_name) : "Student";
  const outcome = await shareFile(doc.blob(), fileName, {
    title: `${who} — Report Card`,
    text: `${who} — Report Card${detail.report_card.period_label ? `, ${detail.report_card.period_label}` : ""}`,
  });
  return { ...outcome, warnings };
}

/**
 * A class set: every card, one PDF per child, in a single archive named after
 * the class and term. Cards that fail are listed inside the archive.
 */
export async function downloadReportCardSet(
  cards: Array<{ id: string; label: string }>,
  archiveName: string,
  onProgress?: (done: number, total: number, label: string) => void,
  signal?: AbortSignal,
): Promise<BulkResult<string>> {
  const brand = await loadActiveSchoolBrand();
  return generateArchive({
    items: cards.map((c) => ({ subject: c.id, label: `${c.label} - Report Card` })),
    archiveName,
    onProgress,
    signal,
    build: async (item) => (await buildReportCard(await fetchReportCardDetail(item.subject), { brand })).doc,
  });
}

/** Load, build and send one card to the printer. */
export async function printReportCard(cardId: string, options: { gradeScale?: GradeBand[] } = {}) {
  const detail = await fetchReportCardDetail(cardId);
  const { doc, warnings } = await buildReportCard(detail, options);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the report card could not be sent to the printer");
  return { warnings };
}
