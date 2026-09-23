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
 * It comes out on one sheet, and filling that sheet is part of the job: a card
 * with six subjects is opened up until it reaches the foot of the page, and a
 * card with twenty is tightened until it fits — both without dropping a single
 * mark. See buildFittedReportCard.
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
import { scaledSizes, tint } from "./theme";
import {
  type HeadlineFigure,
  type ReportCardTemplateId,
  drawFigures,
  drawNameplate,
  drawPageFrame,
  drawParticulars,
  drawSeal,
  drawSectionTitle,
  railWidth,
  templateFor,
} from "./report-card-templates";
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
  /** What it took to fit: 1 is the comfortable layout, above it is opened up. */
  density: number;
  orientation: "portrait" | "landscape";
  /** 2 when the subjects were set side by side to save height. */
  subjectColumns: 1 | 2;
  /**
   * Millimetres of page left over below the content, before the signature
   * block was moved down to the foot. This is the white space the fitting pass
   * spends, and zero is what it aims for.
   */
  slack: number;
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
  template: ReportCardTemplateId;
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
   * together so a long subject list still fits one sheet; above it, they open
   * up so a short one still reaches the foot of the page. No content is
   * dropped at any density: a mark that is not printed is a mark the family
   * never sees.
   */
  density?: number;
  orientation?: "portrait" | "landscape";
  /** Subjects side by side, which a landscape sheet has room for. */
  subjectColumns?: 1 | 2;
  /**
   * Millimetres of empty page to absorb into the layout — taller result rows,
   * more air between the blocks. Measured by the fitting pass and handed back
   * on a second build. See buildFittedReportCard.
   */
  stretch?: number;
}

/** The lowest density that still prints legibly on a domestic printer. */
export const MIN_DENSITY = 0.72;
/** The largest a short card may be opened up before the type looks shouted. */
export const MAX_DENSITY = 1.22;

/** Build the report card PDF. Does not download it. */
export async function buildReportCard(
  detail: ReportCardDetail,
  options: BuildReportCardOptions = {},
): Promise<ReportCardResult> {
  const warnings: string[] = [];
  const settings = options.settings ?? DEFAULT_PRINT_SETTINGS;
  // The school's chosen look. It drives the shape of the page - where the name
  // sits, how the particulars are set, whether there is a rail or a nameplate -
  // and not only its colours.
  const template = templateFor(settings.template);
  const density = Math.max(MIN_DENSITY, Math.min(MAX_DENSITY, options.density ?? 1));
  /** A millimetre constant at this density. */
  const mm = (value: number) => Math.round(value * density * 100) / 100;
  const stretch = Math.max(0, options.stretch ?? 0);
  /**
   * The head's share of the empty page, per line.
   *
   * The particulars and the headline figures are set more generously on a card
   * that has room, which is most of what stops a short report from huddling
   * under the letterhead with the rest of the sheet white.
   */
  const headStretch = stretch > 0 ? Math.min(mm(19), stretch * 0.11) : 0;
  const brand = options.brand ?? (await loadActiveSchoolBrand());
  if (brand.logoProblem) warnings.push(brand.logoProblem);

  const card = detail.report_card;
  const student = detail.student;
  const studentName = student ? joinName(student.first_name, student.last_name) : ABSENT;
  const published = card.is_published === true;
  const period = [card.period_label, card.academic_year].filter(present).join(" · ");
  const classLine = [student?.class_name, student?.section_name].filter(present).join(" – ");

  const doc = await createDocumentAsync({
    title: "Report Card",
    subtitle: period || null,
    orientation: options.orientation ?? "portrait",
    // Tighter type and margins are what "compact" means; both move together,
    // so the page keeps its proportions instead of only shrinking the words.
    theme: {
      headingFont: template.headingFont,
      ...(density !== 1 ? { size: scaledSizes(density) } : {}),
    },
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
    // A card a family keeps does not want "Beacon International School ·
    // Nauman Ellahi" and "Page 1 of 1" ruled across its foot: the school is on
    // the letterhead and the child's name is the largest thing on the sheet.
    // Only what the reader cannot get anywhere else stays.
    footerStyle: "minimal",
    footerNote: published
      ? [
          present(card.published_at) ? `Issued ${formatDate(card.published_at)}` : null,
          card.qr_verification_token ? "Scan the code to verify with the school" : null,
        ]
          .filter(Boolean)
          .join(" · ") || null
      : "DRAFT — not yet published by the school",
  });

  // ── The facts the head of the card is built from ──────────────────────────
  const particulars = [
    { label: "Student", value: studentName },
    { label: "Class", value: classLine },
    { label: "Roll No.", value: student?.roll_number },
    { label: "Registration No.", value: student?.registration_number },
    { label: "Date of Birth", value: student?.date_of_birth ? formatDate(student.date_of_birth) : null },
    // Term and session are in the heading; they are only repeated here when
    // there is no heading line to carry them.
    ...(period ? [] : [{ label: "Term", value: card.period_label ?? null }]),
  ];

  const figures: HeadlineFigure[] = [];
  if (present(card.total_marks) && present(card.max_total_marks)) {
    figures.push({ label: "Marks", value: `${marks(card.total_marks)} / ${marks(card.max_total_marks)}` });
  }
  if (present(card.percentage)) figures.push({ label: "Percentage", value: percent(card.percentage, { places: 2 }) });
  if (present(card.overall_grade)) figures.push({ label: "Grade", value: String(card.overall_grade) });
  if (present(card.gpa)) figures.push({ label: "GPA", value: marks(card.gpa) });
  if (settings.showRank && card.position_in_class) {
    figures.push({
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
    figures.push({ label: "Attendance", value: [pct, days].filter(Boolean).join(" · ") });
  }

  // Loaded once, before anything is drawn. `inBand` restores the content box
  // as soon as its callback returns, so awaiting inside one would hand the
  // page back mid-draw and set the rest of the rail across the full width.
  let photo: { data: string; format: string } | null = null;
  if (settings.showPhoto && student?.photo_url) {
    const { image, failure } = await tryLoadImage(student.photo_url, "student-photos");
    if (image && (image.format === "PNG" || image.format === "JPEG")) {
      photo = { data: image.data, format: image.format };
    } else if (failure) {
      warnings.push(`the student's photo could not be loaded (${failure.reason})`);
    }
  }

  /** Place the child's photo in the given box. Returns false if there is none. */
  const placePhoto = (box: { x: number; y: number; width: number; height: number }, framed: boolean) => {
    if (!photo) return false;
    if (framed) {
      doc.pdf.setFillColor(255, 255, 255);
      doc.pdf.rect(box.x - 0.8, box.y - 0.8, box.width + 1.6, box.height + 1.6, "F");
      doc.pdf.setDrawColor(...doc.theme.rule);
      doc.pdf.setLineWidth(0.3);
      doc.pdf.rect(box.x - 0.8, box.y - 0.8, box.width + 1.6, box.height + 1.6, "S");
    }
    return doc.image(photo.data, photo.format, box);
  };

  // ── The head of the card, in the shape this design gives it ───────────────
  let railTop = doc.y;
  let bandX = doc.x;
  let bandWidth = doc.width;

  if (template.layout === "banner") {
    // The child leads the page: name and result reversed out of a deep band,
    // with the photo set into it.
    const photoBox = drawNameplate(
      doc,
      template,
      { name: studentName, sub: [classLine, period].filter(Boolean).join("  ·  "), figures },
      { density, photo: Boolean(photo) },
    );
    if (photoBox) placePhoto(photoBox, true);
    drawParticulars(doc, template, particulars.slice(2), { density, columns: 3, stretch: headStretch });
  } else if (template.layout === "sidebar") {
    // A tinted rail carrying who the child is, with the marks in their own
    // column beside it. The rail runs to the foot of the sheet, so a short
    // card has a designed page rather than a blank lower half.
    const rail = railWidth(doc, density);
    const gap = mm(6);
    railTop = doc.y;
    doc.pdf.setFillColor(...tint(doc.theme.accent, 0.94));
    doc.pdf.rect(doc.x - mm(2), railTop - mm(2), rail + mm(4), doc.bottomLimit - railTop + mm(2), "F");
    doc.pdf.setFillColor(...doc.theme.accent);
    doc.pdf.rect(doc.x - mm(2), railTop - mm(2), mm(1.2), doc.bottomLimit - railTop + mm(2), "F");

    doc.inBand(doc.x, rail, () => {
      if (photo) {
        const size = Math.min(rail, mm(30));
        const box = { x: doc.x + (rail - size) / 2, y: doc.y, width: size, height: size * 1.2 };
        if (placePhoto(box, true)) doc.y += box.height + mm(4);
      }
      doc.pdf.setFont(template.headingFont, "bold");
      doc.pdf.setFontSize(13 * density);
      doc.pdf.setTextColor(...doc.theme.ink);
      for (const line of doc.wrap(studentName, rail, { size: 13 * density, style: "bold", font: template.headingFont })) {
        doc.pdf.text(line, doc.x, doc.y + mm(4));
        doc.y += mm(5);
      }
      doc.advance(mm(1));
      drawParticulars(doc, template, particulars.slice(1), {
        density,
        columns: 1,
        width: rail,
        stretch: headStretch,
      });
      doc.advance(mm(1));
      drawFigures(doc, template, figures, { density, width: rail, stacked: true, stretch: headStretch });
    });

    doc.y = railTop;
    bandX = doc.x + rail + gap;
    bandWidth = doc.width - rail - gap;
  } else if (template.layout === "centred") {
    // The formal statement: a centred overline, then the particulars on dot
    // leaders, then the results. The photo sits under the overline, centred.
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text(
      "STATEMENT OF ACADEMIC PROGRESS".split("").join(" "),
      doc.x + doc.width / 2,
      doc.y + mm(3),
      { align: "center" },
    );
    doc.y += mm(6);
    if (photo) {
      const size = mm(24);
      const box = { x: doc.x + (doc.width - size) / 2, y: doc.y, width: size, height: size * 1.2 };
      if (placePhoto(box, true)) doc.y += box.height + mm(4);
    }
    drawParticulars(doc, template, particulars, { density, stretch: headStretch });
    doc.advance(mm(1));
    drawFigures(doc, template, figures, { density, stretch: headStretch });
  } else {
    // standard and register: particulars across the top with the photo at the
    // right, then the headline figures.
    const photoSize = mm(26);
    const photoDrawn = photo
      ? placePhoto({ x: doc.x + doc.width - photoSize, y: doc.y, width: photoSize, height: photoSize * 1.2 }, true)
      : false;
    const startY = doc.y;
    drawParticulars(doc, template, particulars, {
      density,
      columns: photoDrawn ? 2 : 3,
      width: photoDrawn ? doc.width - photoSize - mm(5) : doc.width,
      stretch: headStretch,
    });
    if (photoDrawn) doc.y = Math.max(doc.y, startY + photoSize * 1.2 + mm(3));
    doc.advance(mm(1));
    drawFigures(doc, template, figures, { density, stretch: headStretch });
  }

  // ── Everything below the head ─────────────────────────────────────────────
  type Entry = ReportCardDetail["subject_entries"][number];
  const entries = detail.subject_entries ?? [];
  const hasComments = entries.some((e) => present(e.teacher_comment));
  // Two columns when the fitting pass asks for them and the table is narrow
  // enough to halve - a per-subject comment needs the full width, so a card
  // that carries comments stays in one column and is tightened instead.
  const twoColumns = (options.subjectColumns ?? 1) === 2 && !hasComments && entries.length >= 6;

  /**
   * The body of the card. Run inside a narrower band for the rail layout, and
   * across the full width for every other one.
   */
  const drawBody = () => {
    // Air between the blocks is the second place the empty page goes, after
    // the result rows. A card with three subjects wants to breathe; one with
    // twenty has nothing to give and this is zero.
    const sectionGap = stretch > 0 ? Math.min(mm(6), stretch * 0.06) : 0;
    const openSection = (label: string) => {
      if (sectionGap > 0) doc.advance(sectionGap);
      drawSectionTitle(doc, template, label, density);
    };

    openSection("Academic performance");

    const hasStats = entries.some((e) => present(e.class_average) || present(e.highest_in_class));
    const hasPosition = entries.some((e) => e.position_in_subject);

    // Less width means less room for headings, so they are abbreviated rather
    // than cut off mid-word ("Ma…", "Ou…"). It is the band that decides, not
    // the column count: the rail layout is narrow at full width too.
    const narrow = twoColumns || doc.width < 150;
    const head = (full: string, short: string) => (narrow ? short : full);

    // When every subject is marked out of the same number, that column repeats
    // one fact down the page. In the narrow layout it is said once, above the
    // table, and the column gives its width to the subject names.
    const maxMarksValues = new Set(entries.filter((e) => present(e.max_marks)).map((e) => String(e.max_marks)));
    const uniformMax = twoColumns && maxMarksValues.size === 1 ? [...maxMarksValues][0] : null;

    /** The grade, as a filled chip rather than a letter in a column. */
    const gradePill = {
      header: head("Grade", "Gr"),
      width: 0.9,
      align: "center" as const,
      // The totals line is drawn as an emphasis row, which skips drawn cells,
      // so its grade is set as ordinary text there. Without this the overall
      // grade simply vanished off the bottom of the table.
      value: (e: Entry, i: number) => (i >= entries.length ? (e.grade ?? "") : ""),
      bold: (_e: Entry, i: number) => i >= entries.length,
      drawCell: (d2: PdfDocument, row: Entry, _i: number, box: { x: number; y: number; w: number; h: number }) => {
        const label = row.grade ?? "";
        if (!label.trim()) return;
        d2.pdf.setFont(d2.theme.bodyFont, "bold");
        d2.pdf.setFontSize(d2.theme.size.small);
        const textWidth = d2.pdf.getTextWidth(label);
        const w = Math.min(box.w - 2, textWidth + mm(4));
        const h = Math.min(box.h - 1.4, mm(5));
        const x = box.x + (box.w - w) / 2;
        const y = box.y + (box.h - h) / 2;
        d2.pdf.setFillColor(...tint(d2.theme.accent, 0.84));
        d2.pdf.roundedRect(x, y, w, h, h / 2, h / 2, "F");
        d2.pdf.setTextColor(...d2.theme.accent);
        d2.pdf.text(label, x + w / 2, y + h * 0.72, { align: "center" });
      },
    };

    /**
     * A bar for the subject, and a tick where the class average fell.
     *
     * Only drawn from a percentage that was recorded. A subject with no mark
     * gets no bar — an empty track is not a score of zero.
     */
    const markBar = {
      header: head("Against the class", "vs class"),
      headerAlign: "center" as const,
      width: 1.7,
      value: () => "",
      minHeight: mm(5.4),
      drawCell: (d2: PdfDocument, row: Entry, _i: number, box: { x: number; y: number; w: number; h: number }) => {
        if (!present(row.percentage)) return;
        const value = Math.max(0, Math.min(100, Number(row.percentage)));
        const pad = mm(1.5);
        const trackW = box.w - pad * 2;
        const trackH = mm(2.6);
        const x = box.x + pad;
        const y = box.y + (box.h - trackH) / 2;
        d2.pdf.setFillColor(...d2.theme.ruleFaint);
        d2.pdf.rect(x, y, trackW, trackH, "F");
        d2.pdf.setFillColor(...d2.theme.accent);
        d2.pdf.rect(x, y, (trackW * value) / 100, trackH, "F");
        if (present(row.class_average) && present(row.max_marks) && Number(row.max_marks) > 0) {
          const avg = Math.max(0, Math.min(100, (Number(row.class_average) / Number(row.max_marks)) * 100));
          d2.pdf.setDrawColor(...d2.theme.ink);
          d2.pdf.setLineWidth(0.4);
          d2.pdf.line(x + (trackW * avg) / 100, y - 0.6, x + (trackW * avg) / 100, y + trackH + 0.6);
        }
      },
    };

    const columns = [
      { header: "Subject", width: narrow ? 2 : 2.4, value: (e: Entry) => e.subject_name },
      { header: head("Marks", "Mks"), width: 1, align: "right" as const, value: (e: Entry) => (present(e.marks_obtained) ? marks(e.marks_obtained) : "") },
      ...(uniformMax
        ? []
        : [{ header: head("Out of", "Max"), width: 1, align: "right" as const, value: (e: Entry) => (present(e.max_marks) ? marks(e.max_marks) : "") }]),
      // Wide enough for a bold "85.42%" on the totals line: a percentage that
      // wraps onto a second line reads as two numbers.
      { header: "%", width: 1.15, align: "right" as const, value: (e: Entry) => (present(e.percentage) ? percent(e.percentage) : "") },
      ...(template.subjectMark === "pill"
        ? [gradePill]
        : [{
            header: head("Grade", "Gr"),
            width: 0.8,
            align: "center" as const,
            value: (e: Entry) => e.grade ?? "",
            bold: () => true,
          }]),
      // The bar needs real width, so it is only offered when the table has it.
      ...(template.subjectMark === "bar" && !twoColumns && !hasComments ? [markBar] : []),
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

    // Most of the empty page is spent here: taller result rows, which is what
    // a printed card does with a short subject list - three subjects on ruled
    // lines an inch apart, not three lines huddled under the letterhead. The
    // cap is what keeps a row a row rather than a band of white.
    const stretchedRows = Math.max(1, twoColumns ? Math.ceil(entries.length / 2) : entries.length) + (totals ? 1 : 0);
    const rowStretch = stretch > 0 ? Math.min(mm(19), (stretch * 0.55) / stretchedRows) : 0;
    const shared = {
      padding: mm(1.5),
      accentHeader: template.table.accentHeader,
      zebra: template.table.zebra,
      rowRules: template.table.rowRules,
      columnRules: template.table.columnRules,
      minRowHeight: rowStretch > 0 ? mm(6) + rowStretch : 0,
    };

    if (twoColumns) {
      const gap = mm(5);
      const colWidth = (doc.width - gap) / 2;
      const half = Math.ceil(entries.length / 2);
      const top = doc.y;
      let deepest = top;

      doc.inBand(doc.x, colWidth, () => {
        drawTable(doc, {
          ...shared,
          columns,
          rows: entries.slice(0, half),
          emptyMessage: "No subject results have been recorded on this card.",
        });
        deepest = Math.max(deepest, doc.y);
      });

      const leftX = doc.x;
      doc.y = top;
      doc.inBand(leftX + colWidth + gap, colWidth, () => {
        drawTable(doc, {
          ...shared,
          columns,
          rows: entries.slice(half),
          footerRows: totals ? [totals] : [],
          emptyMessage: "",
        });
        deepest = Math.max(deepest, doc.y);
      });

      doc.y = deepest;
    } else {
      const tableTop = doc.y;
      drawTable(doc, {
        ...shared,
        columns,
        rows: entries,
        footerRows: totals ? [totals] : [],
        emptyMessage: "No subject results have been recorded on this card.",
      });
      // A framed table is what makes the register-style templates read as a
      // record rather than a list.
      if (template.table.frame && doc.y > tableTop) {
        doc.pdf.setDrawColor(...doc.theme.rule);
        doc.pdf.setLineWidth(0.3);
        doc.pdf.rect(doc.x, tableTop, doc.width, doc.y - tableTop, "S");
      }
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
    if (template.subjectMark === "bar" && entries.some((e) => present(e.class_average))) {
      doc.text("On each bar, the upright mark is the class average for that subject.", {
        size: doc.theme.size.caption,
        color: doc.theme.inkMuted,
        style: "italic",
        spaceAfter: 1,
      });
    }

    // ── Co-curricular ───────────────────────────────────────────────────────
    const co = settings.showActivities ? (detail.co_curricular ?? []) : [];
    if (co.length) {
      openSection("Co-curricular activities");
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
        accentHeader: template.table.accentHeader,
        zebra: template.table.zebra,
        columnRules: template.table.columnRules,
        minRowHeight: stretch > 0 ? Math.min(mm(14), mm(6) + (stretch * 0.18) / co.length) : 0,
      });
    }

    // ── Trend across terms ──────────────────────────────────────────────────
    const trend = settings.showTermTrend ? (card.trend_data ?? []).filter((t) => present(t.percentage)) : [];
    if (trend.length >= 2) {
      openSection("Progress across terms");
      const chartH = mm(16) + (stretch > 0 ? Math.min(mm(10), stretch * 0.12) : 0);
      doc.ensureSpace(chartH + mm(10));
      const top = doc.y;
      const barGap = mm(6);
      const barW = Math.min(mm(34), (doc.width - barGap * (trend.length + 1)) / trend.length);
      const totalW = trend.length * barW + (trend.length - 1) * barGap;
      const left = doc.x + (doc.width - totalW) / 2;
      doc.pdf.setDrawColor(...doc.theme.ruleFaint);
      doc.pdf.setLineWidth(0.2);
      for (const pct of [25, 50, 75, 100]) {
        const y = top + chartH - (chartH * pct) / 100;
        doc.pdf.line(left - barGap, y, left + totalW + barGap, y);
      }
      trend.forEach((t, i) => {
        const value = Math.max(0, Math.min(100, Number(t.percentage)));
        const h = (chartH * value) / 100;
        const x = left + i * (barW + barGap);
        // Every term is filled; the one being reported is filled in the
        // school's colour and the earlier ones in a tint of it. An outline
        // reads as an empty bar, which is a score nobody got.
        const last = i === trend.length - 1;
        doc.pdf.setFillColor(...(last ? doc.theme.accent : tint(doc.theme.accent, 0.62)));
        doc.pdf.rect(x, top + chartH - h, barW, h, "F");
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

    // ── Remarks ─────────────────────────────────────────────────────────────
    // The narrative is the part of a report a family actually reads twice, so
    // it is set as its own block and given room, not tucked under the numbers.
    if (present(card.teacher_remarks) || present(card.principal_remarks)) {
      openSection("Remarks");
      doc.note(
        [
          present(card.teacher_remarks) ? `Class teacher: ${card.teacher_remarks}` : null,
          present(card.principal_remarks) ? `Principal: ${card.principal_remarks}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    // ── Grading key ─────────────────────────────────────────────────────────
    // A grade nobody can interpret is not a report, so the scale prints on the
    // card itself rather than in a prospectus the family does not have.
    const scale = settings.showGradeKey ? (options.gradeScale ?? []).filter((g) => present(g.grade)) : [];
    if (scale.length) {
      doc.ensureSpace(mm(10));
      doc.text(
        `Grading key: ${scale.map((g) => `${g.grade} ${marks(g.min)}${present(g.max) ? `–${marks(g.max)}` : "+"}%`).join("   ")}`,
        { size: doc.theme.size.caption, color: doc.theme.inkMuted, spaceAfter: 1 },
      );
    }
  };

  if (template.layout === "sidebar") {
    doc.inBand(bandX, bandWidth, drawBody);
  } else {
    drawBody();
  }

  // ── Signatures and verification ───────────────────────────────────────────
  const signatureX = template.layout === "sidebar" ? bandX : doc.x;
  const signatureWidth = template.layout === "sidebar" ? bandWidth : doc.width;
  const qrSize = mm(18);
  const token = published ? card.qr_verification_token : null;
  // `signatures()` reserves a fixed 24mm of its own, whatever the density —
  // it is shared with every other document and does not scale. Reserving less
  // than that here is what sent a tightened card onto a second sheet: the QR
  // was placed at the foot of page one and the signature lines, finding 24mm
  // were not left, started page two.
  const blockHeight = Math.max(24, token || template.ornament === "seal" ? mm(4) + qrSize + mm(8) : 0);

  // How much of the sheet the card did not use. Measured before the block is
  // moved, because moving it is what hides the gap rather than closing it.
  const slack = doc.pages === 1 ? Math.max(0, doc.bottomLimit - (doc.y + blockHeight)) : 0;

  doc.inBand(signatureX, signatureWidth, () => {
    doc.ensureSpace(blockHeight);
    // Signature lines belong at the foot of the page, where a pen expects
    // them — and putting them there is also what stops a short card from
    // ending two-thirds of the way down with nothing underneath.
    if (doc.bottomLimit - blockHeight > doc.y) {
      doc.y = doc.bottomLimit - blockHeight;
    }
    const blockTop = doc.y;
    if (token) {
      drawQrVector(doc.pdf, reportCardVerificationUrl(token), doc.x + doc.width - qrSize, blockTop + mm(4), qrSize, doc.theme.ink);
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.caption);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text("Scan to verify", doc.x + doc.width - qrSize / 2, blockTop + qrSize + mm(7), { align: "center" });
    } else if (template.ornament === "seal") {
      drawSeal(doc, doc.x + doc.width - qrSize / 2, blockTop + mm(4) + qrSize / 2, qrSize / 2);
    }
    // A digital sign-off is stated as what it is; an unsigned line stays empty
    // for a pen.
    doc.signatures(
      [
        { title: "Class Teacher" },
        {
          title: card.signed_by_title || "Principal",
          name: card.signed_by_name ?? null,
          note: card.signed_at ? `Signed digitally ${formatDate(card.signed_at)}` : null,
        },
        { title: "Parent / Guardian" },
      ],
      { width: token || template.ornament === "seal" ? doc.width - qrSize - mm(6) : doc.width },
    );
    doc.y = Math.max(doc.y, blockTop + qrSize + mm(10));
  });

  if (template.pageFrame !== "none" || template.ornament === "corners") {
    const finished = doc.pdf.getNumberOfPages();
    for (let page = 1; page <= finished; page += 1) {
      doc.pdf.setPage(page);
      drawPageFrame(doc, template);
    }
    doc.pdf.setPage(finished);
  }

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
    slack,
  };
}

/**
 * Build a card that comes out on one sheet — and fills it.
 *
 * Two things are wrong with a report card: one that spills onto a second sheet,
 * and one that stops a third of the way down leaving the rest of the page
 * blank. This closes both, and never by dropping data.
 *
 *   1. It opens the card up first — larger type and more air — and keeps the
 *      largest size that still comes out on one sheet.
 *   2. If nothing that large fits, it tightens instead, one step at a time,
 *      down to the legible floor, trying the two-column subject list at each
 *      size before making the type smaller again.
 *   3. Whatever wins, it measures the page that is left over and builds once
 *      more with that slack handed back, so the result rows open out and the
 *      signature block sits on the foot of the sheet.
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
  // Steps, not a search: each is a layout a printer can be handed, and a
  // handful of builds is cheaper than a binary search over a continuum nobody
  // can see.
  const grow = [MAX_DENSITY, 1.12, 1.05];
  const shrink = [1, 0.92, 0.85, 0.78, MIN_DENSITY];

  /**
   * Spend the leftover page on the layout.
   *
   * How much taller a row becomes for a given stretch is not a straight line -
   * the caps see to that - so one pass cannot land on the foot of the sheet.
   * It is re-measured and re-spent instead, which converges in two or three
   * builds, and stops the moment a pass stops helping or tips onto a second
   * sheet.
   */
  const fill = async (result: ReportCardResult): Promise<ReportCardResult> => {
    let best = result;
    let spent = 0;
    for (let pass = 0; pass < 6 && best.slack >= 6; pass += 1) {
      spent += best.slack;
      const stretched = await buildReportCard(detail, {
        ...options,
        density: best.density,
        subjectColumns: best.subjectColumns,
        orientation: best.orientation,
        stretch: spent,
      });
      // Overshot onto a second sheet, or stopped closing the gap: the build
      // before it is the right answer.
      if (stretched.doc.pages !== 1 || stretched.slack >= best.slack) break;
      best = stretched;
    }
    return best;
  };

  if (settings.fitStrategy === "two_pages") {
    const result = await buildReportCard(detail, options);
    return { ...result, fittedOnOnePage: result.doc.pages === 1 };
  }

  let last: ReportCardResult | null = null;

  // Open it up as far as it will go. A card with six subjects should use the
  // sheet it is printed on.
  for (const density of grow) {
    const result = await buildReportCard(detail, { ...options, density, subjectColumns: 1 });
    if (result.doc.pages === 1) return { ...(await fill(result)), fittedOnOnePage: true };
    last = result;
  }

  for (const density of shrink) {
    // At each size, one column first — it reads better — then two, which
    // halves the height a long subject list takes. Both are tried before the
    // type is made smaller again.
    for (const subjectColumns of [1, 2] as const) {
      const result = await buildReportCard(detail, { ...options, density, subjectColumns });
      if (result.doc.pages === 1) return { ...(await fill(result)), fittedOnOnePage: true };
      last = result;
    }
  }

  if (settings.fitStrategy === "landscape") {
    // A landscape sheet is wider but shorter, so it only helps a card whose
    // subjects can be set side by side.
    for (const density of shrink) {
      for (const subjectColumns of [2, 1] as const) {
        const result = await buildReportCard(detail, {
          ...options,
          density,
          subjectColumns,
          orientation: "landscape",
        });
        if (result.doc.pages === 1) return { ...(await fill(result)), fittedOnOnePage: true };
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
