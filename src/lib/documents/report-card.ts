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
import { DEFAULT_MARGINS } from "./paper";
import { scaledSizes } from "./theme";
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
  /** What it took to fit: 1 is the comfortable layout. */
  density: number;
  orientation: "portrait" | "landscape";
  /** 2 when the subjects were set side by side to save height. */
  subjectColumns: 1 | 2;
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

/** What the school chose, once, about how its cards are printed. */
export interface ReportCardPrintSettings {
  /** What to do when a card genuinely will not fit one portrait sheet. */
  fitStrategy: "compact" | "landscape" | "two_pages";
  template: "classic" | "modern" | "minimal";
  showPhoto: boolean;
  showAttendance: boolean;
  showActivities: boolean;
  showTermTrend: boolean;
  showGradeKey: boolean;
  showRank: boolean;
}

/** Used until a school has been asked. Shows everything, tightens to fit. */
export const DEFAULT_PRINT_SETTINGS: ReportCardPrintSettings = {
  fitStrategy: "compact",
  template: "classic",
  showPhoto: true,
  showAttendance: true,
  showActivities: true,
  showTermTrend: true,
  showGradeKey: true,
  showRank: true,
};

export interface BuildReportCardOptions {
  brand?: SchoolBrand;
  gradeScale?: GradeBand[];
  settings?: ReportCardPrintSettings;
  /**
   * 1 is the comfortable layout. Below that, type and spacing tighten
   * together so a long subject list still fits one sheet. No content is
   * dropped at any density: a mark that is not printed is a mark the family
   * never sees.
   */
  density?: number;
  orientation?: "portrait" | "landscape";
  /** Subjects side by side, which a landscape sheet has room for. */
  subjectColumns?: 1 | 2;
}

/** The lowest density that still prints legibly on a domestic printer. */
export const MIN_DENSITY = 0.72;

/** Build the report card PDF. Does not download it. */
export async function buildReportCard(
  detail: ReportCardDetail,
  options: BuildReportCardOptions = {},
): Promise<ReportCardResult> {
  const warnings: string[] = [];
  const settings = options.settings ?? DEFAULT_PRINT_SETTINGS;
  const density = Math.max(MIN_DENSITY, Math.min(1, options.density ?? 1));
  /** A millimetre constant at this density. */
  const mm = (value: number) => Math.round(value * density * 100) / 100;
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
    orientation: options.orientation ?? "portrait",
    // Tighter type and margins are what "compact" means; both move together,
    // so the page keeps its proportions instead of only shrinking the words.
    theme: density < 1 ? { size: scaledSizes(density) } : undefined,
    margins: density < 1
      ? {
          top: mm(DEFAULT_MARGINS.top),
          right: mm(DEFAULT_MARGINS.right),
          bottom: mm(DEFAULT_MARGINS.bottom),
          left: mm(DEFAULT_MARGINS.left),
        }
      : undefined,
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
  const photoSize = mm(26);
  let photoDrawn = false;
  if (settings.showPhoto && student?.photo_url) {
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
  if (settings.showRank && card.position_in_class) {
    tiles.push({
      label: "Position",
      value: card.total_students_in_class
        ? `${ordinal(card.position_in_class)} of ${card.total_students_in_class}`
        : ordinal(card.position_in_class),
    });
  }
  if (settings.showAttendance && (present(card.attendance_percentage) || (card.total_present_days != null && card.total_school_days))) {
    const days =
      card.total_present_days != null && card.total_school_days ? `${card.total_present_days}/${card.total_school_days} days` : null;
    const pct = present(card.attendance_percentage) ? percent(card.attendance_percentage) : null;
    tiles.push({ label: "Attendance", value: [pct, days].filter(Boolean).join(" · ") });
  }

  if (tiles.length) {
    const perRow = Math.min(tiles.length, 6);
    const gap = mm(2.5);
    const w = (doc.width - gap * (perRow - 1)) / perRow;
    const h = mm(13);
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
      doc.pdf.text(t.label.toUpperCase(), x + w / 2, y + mm(4.4), { align: "center" });
      doc.pdf.setFontSize((t.value.length > 14 ? 9 : 11.5) * density);
      doc.pdf.setTextColor(...doc.theme.accent);
      doc.pdf.text(doc.pdf.splitTextToSize(t.value, w - mm(3))[0] as string, x + w / 2, y + mm(10.2), { align: "center" });
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

  // Two columns when the fitting pass asks for them and the table is narrow
  // enough to halve — a per-subject comment needs the full width, so a card
  // that carries comments stays in one column and is tightened instead.
  const twoColumns = (options.subjectColumns ?? 1) === 2 && !hasComments && entries.length >= 6;

  // Half the width means half the room for headings, so they are abbreviated
  // rather than cut off mid-word ("Ma…", "Ou…").
  const head = (full: string, short: string) => (twoColumns ? short : full);

  // When every subject is marked out of the same number, that column repeats
  // one fact down the page. In the narrow layout it is said once, above the
  // table, and the column gives its width to the subject names.
  const maxMarksValues = new Set(entries.filter((e) => present(e.max_marks)).map((e) => String(e.max_marks)));
  const uniformMax = twoColumns && maxMarksValues.size === 1 ? [...maxMarksValues][0] : null;

  const columns = [
    { header: "Subject", width: twoColumns ? 2.1 : 2.4, value: (e: Entry) => e.subject_name },
    { header: head("Marks", "Mks"), width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.marks_obtained) ? marks(e.marks_obtained) : "") },
    ...(uniformMax
      ? []
      : [{ header: head("Out of", "Max"), width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.max_marks) ? marks(e.max_marks) : "") }]),
    { header: "%", width: 0.9, align: "right" as const, value: (e: Entry) => (present(e.percentage) ? percent(e.percentage) : "") },
    {
      header: head("Grade", "Gr"),
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
      ? [{ header: head("Pos.", "Pos"), width: 0.75, align: "center" as const, value: (e: Entry) => (e.position_in_subject ? ordinal(e.position_in_subject) : "") }]
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

  if (uniformMax) {
    doc.text(`Every subject is marked out of ${marks(uniformMax)}.`, {
      size: doc.theme.size.caption,
      color: doc.theme.inkMuted,
      spaceAfter: mm(1),
    });
  }

  if (twoColumns) {
    const gap = mm(5);
    const colWidth = (doc.width - gap) / 2;
    const half = Math.ceil(entries.length / 2);
    const top = doc.y;
    let deepest = top;

    doc.inBand(doc.x, colWidth, () => {
      drawTable(doc, {
        columns,
        rows: entries.slice(0, half),
        emptyMessage: "No subject results have been recorded on this card.",
        padding: mm(1.5),
      });
      deepest = Math.max(deepest, doc.y);
    });

    doc.y = top;
    doc.inBand(doc.x + colWidth + gap, colWidth, () => {
      drawTable(doc, {
        columns,
        rows: entries.slice(half),
        footerRows: totals ? [totals] : [],
        emptyMessage: "",
        padding: mm(1.5),
      });
      deepest = Math.max(deepest, doc.y);
    });

    doc.y = deepest;
  } else {
    drawTable(doc, {
      columns,
      rows: entries,
      footerRows: totals ? [totals] : [],
      emptyMessage: "No subject results have been recorded on this card.",
      padding: mm(1.5),
    });
  }

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
  const co = settings.showActivities ? (detail.co_curricular ?? []) : [];
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
      padding: mm(1.4),
      rows: co,
    });
  }

  // ── Trend across terms ────────────────────────────────────────────────────
  const trend = settings.showTermTrend ? (card.trend_data ?? []).filter((t) => present(t.percentage)) : [];
  if (trend.length >= 2) {
    doc.sectionTitle("Progress across terms");
    const chartH = mm(16);
    doc.ensureSpace(chartH + mm(10));
    const top = doc.y;
    const barGap = mm(4);
    const barW = Math.min(mm(18), (doc.width - barGap * (trend.length - 1)) / trend.length);
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
      doc.pdf.text(percent(t.percentage), x + barW / 2, top + chartH - h - mm(1.2), { align: "center" });
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(String(t.label ?? t.term ?? ""), x + barW / 2, top + chartH + mm(4), { align: "center" });
    });
    doc.y = top + chartH + mm(8);
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
  const scale = settings.showGradeKey ? (options.gradeScale ?? []).filter((g) => present(g.grade)) : [];
  if (scale.length) {
    doc.ensureSpace(mm(10));
    doc.text(
      `Grading key: ${scale.map((g) => `${g.grade} ${marks(g.min)}${present(g.max) ? `–${marks(g.max)}` : "+"}%`).join("   ")}`,
      { size: doc.theme.size.caption, color: doc.theme.inkMuted, spaceAfter: 1 },
    );
  }

  // ── Signatures and verification ───────────────────────────────────────────
  const qrSize = mm(18);
  const token = published ? card.qr_verification_token : null;
  doc.ensureSpace(mm(26));
  const blockTop = doc.y;
  if (token) {
    drawQrVector(doc.pdf, reportCardVerificationUrl(token), doc.x + doc.width - qrSize, blockTop + mm(4), qrSize, doc.theme.ink);
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text("Scan to verify", doc.x + doc.width - qrSize / 2, blockTop + qrSize + mm(7), { align: "center" });
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
  ], { width: token ? doc.width - qrSize - mm(6) : doc.width });
  doc.y = Math.max(doc.y, blockTop + qrSize + mm(10));

  for (const lost of doc.unprintableText) warnings.push(`"${lost}" could not be printed`);

  const fileName = documentFileName(
    [studentName, "Report Card", card.period_label, card.academic_year, published ? null : "DRAFT"],
    "pdf",
  );
  return {
    doc,
    fileName,
    warnings,
    density,
    orientation: options.orientation ?? "portrait",
    subjectColumns: twoColumns ? 2 : 1,
  };
}

/**
 * Build a card that comes out on one sheet.
 *
 * It builds at the comfortable layout first and only tightens if the page
 * overflows, one step at a time, down to the legible floor. Nothing is ever
 * dropped to make room: a subject, a remark or an activity that is on the card
 * is on the print.
 *
 * If it still will not fit, the school's own answer decides — given once, on
 * the Report Cards screen, and applied to every card after that:
 *
 *   compact     keep the tightest single-sheet attempt, even where that means
 *               the last block runs onto a second sheet
 *   landscape   turn the sheet, which buys roughly a third more width
 *   two_pages   keep the comfortable portrait layout across two sheets
 *
 * The result says which of those happened, so the screen can tell the truth
 * rather than claim one page.
 */
export async function buildFittedReportCard(
  detail: ReportCardDetail,
  options: BuildReportCardOptions = {},
): Promise<ReportCardResult & { fittedOnOnePage: boolean }> {
  const settings = options.settings ?? DEFAULT_PRINT_SETTINGS;
  // Steps, not a search: each is a layout a printer can be handed, and four
  // builds is cheaper than a binary search over a continuum nobody can see.
  const steps = [1, 0.92, 0.85, 0.78, MIN_DENSITY];

  if (settings.fitStrategy === "two_pages") {
    const result = await buildReportCard(detail, options);
    return { ...result, fittedOnOnePage: result.doc.pages === 1 };
  }

  let last: ReportCardResult | null = null;
  for (const density of steps) {
    // At each size, one column first — it reads better — then two, which
    // halves the height a long subject list takes. Both are tried before the
    // type is made smaller again.
    for (const subjectColumns of [1, 2] as const) {
      const result = await buildReportCard(detail, { ...options, density, subjectColumns });
      if (result.doc.pages === 1) return { ...result, fittedOnOnePage: true };
      last = result;
    }
  }

  if (settings.fitStrategy === "landscape") {
    // A landscape sheet is wider but shorter, so it only helps a card whose
    // subjects can be set side by side.
    for (const density of steps) {
      for (const subjectColumns of [2, 1] as const) {
        const result = await buildReportCard(detail, {
          ...options,
          density,
          subjectColumns,
          orientation: "landscape",
        });
        if (result.doc.pages === 1) return { ...result, fittedOnOnePage: true };
        last = result;
      }
    }
  }

  // Everything was tried. Hand back the tightest attempt and say plainly that
  // it did not fit, rather than quietly printing two sheets as though it had.
  const result = last!;
  return {
    ...result,
    fittedOnOnePage: false,
    warnings: [
      ...result.warnings,
      `this card needs ${result.doc.pages} pages even at the tightest legible layout — ` +
        "turn off a section, or allow two pages, in the report card print settings",
    ],
  };
}

/** Load, build and download one card, fitted to a single sheet. */
export async function downloadReportCard(cardId: string, options: BuildReportCardOptions = {}) {
  const detail = await fetchReportCardDetail(cardId);
  const result = await buildFittedReportCard(detail, options);
  triggerDownload(result.doc.blob(), result.fileName);
  return {
    fileName: result.fileName,
    warnings: result.warnings,
    pages: result.doc.pages,
    density: result.density,
    orientation: result.orientation,
    fittedOnOnePage: result.fittedOnOnePage,
  };
}

/** Load, build and share one card — to WhatsApp on a phone. */
export async function shareReportCard(
  cardId: string,
  options: BuildReportCardOptions = {},
): Promise<ShareOutcome & { warnings: string[] }> {
  const detail = await fetchReportCardDetail(cardId);
  const { doc, fileName, warnings } = await buildFittedReportCard(detail, options);
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
  options: BuildReportCardOptions = {},
): Promise<BulkResult<string>> {
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  return generateArchive({
    items: cards.map((c) => ({ subject: c.id, label: `${c.label} - Report Card` })),
    archiveName,
    onProgress,
    signal,
    // Every card in a class set is fitted the same way, so a stack printed
    // from the archive is one sheet per child.
    build: async (item) =>
      (await buildFittedReportCard(await fetchReportCardDetail(item.subject), { ...options, brand })).doc,
  });
}

/** Load, build and send one card to the printer, fitted to a single sheet. */
export async function printReportCard(cardId: string, options: BuildReportCardOptions = {}) {
  const detail = await fetchReportCardDetail(cardId);
  const { doc, warnings, density, fittedOnOnePage } = await buildFittedReportCard(detail, options);
  const result = printPdf(doc);
  if (!result.ok) throw new Error(result.error ?? "the report card could not be sent to the printer");
  return { warnings, pages: doc.pages, density, fittedOnOnePage };
}
