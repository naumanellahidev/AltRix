/**
 * How a report card looks.
 *
 * These seven are not one layout wearing seven colour schemes. Each one moves
 * the furniture: where the child's name sits, whether the particulars are a
 * grid or a boxed register or a line of dot leaders, whether the marks are the
 * whole page or a column beside a tinted rail, whether the sheet carries a
 * border, a seal or nothing at all. Put two of them side by side and nobody
 * has to be told they are different designs.
 *
 * What they took from the schools that issue this kind of document:
 *
 *   - the particulars are a *block*, set apart from the marks by a rule, a
 *     panel or a box — never a paragraph of labels running into the table;
 *   - the grading key is printed on the card, because a grade nobody can
 *     interpret is not a report;
 *   - the narrative — the class teacher's and the head's remarks — is given
 *     real width and real weight, not a footnote under the numbers;
 *   - the sheet is signed by hand, so the signature lines sit at the foot of
 *     the page where a pen expects them, with room for the school's stamp.
 *
 * Every one of them prints on the school's own letterhead in the school's own
 * colour, survives the single-sheet fitting pass, and is drawn in vector, so
 * the text is real text at any size.
 */
import type { PdfDocument } from "./document";
import { type Rgb, readableOn, tint } from "./theme";

export type ReportCardTemplateId =
  | "classic"
  | "modern"
  | "minimal"
  | "crest"
  | "ledger"
  | "bulletin"
  | "heritage";

/**
 * The shape of the page — the thing that actually makes two designs different.
 *
 *   standard   particulars across the top, then the marks, full width
 *   sidebar    a tinted rail down the left carrying the photo, the particulars
 *              and the headline figures; the marks run beside it
 *   banner     a deep colour nameplate holding the name and the figures in
 *              reverse-out, with the particulars as a quiet strip beneath
 *   centred    everything on the centre line, with dot-leader particulars —
 *              the formal statement of results
 *   register   the particulars drawn as a bordered form and the marks as a
 *              full grid, the way an examination register is ruled
 */
export type ReportCardLayout = "standard" | "sidebar" | "banner" | "centred" | "register";

export interface ReportCardTemplate {
  id: ReportCardTemplateId;
  /** Shown in the picker. */
  name: string;
  /** One line telling a principal what they are choosing. */
  description: string;

  layout: ReportCardLayout;
  /** Serif or sans for the headings and the student's name. */
  headingFont: "times" | "helvetica";
  /** Section headings: a rule under them, a rule each side, or a filled band. */
  sectionStyle: "rule" | "band" | "sideRules" | "plain";
  /** Headline figures: filled tiles, outlined tiles, or one plain strip. */
  tileStyle: "filled" | "outlined" | "strip";
  /** The subject table. */
  table: {
    /** Header band in the school's colour. */
    accentHeader: boolean;
    zebra: boolean;
    /** A rule under every row. */
    rowRules: boolean;
    /** A box around the whole table. */
    frame: boolean;
    /** A hairline between every column — the ruled register. */
    columnRules: boolean;
  };
  /** A border drawn around the whole page. */
  pageFrame: "none" | "hairline" | "double" | "topBand";
  /** Student particulars: a field grid, a tinted panel, a form, dot leaders. */
  particulars: "plain" | "panel" | "boxed" | "leaders";
  /** What decorates the sheet. */
  ornament: "none" | "seal" | "corners";
  /**
   * How a subject's result is shown beyond the number:
   *   plain  the mark and the grade as text
   *   bar    a bar in the row, against the class average where it is known
   *   pill   the grade in a filled chip, the way a modern report sets it
   */
  subjectMark: "plain" | "bar" | "pill";
}

export const REPORT_CARD_TEMPLATES: Record<ReportCardTemplateId, ReportCardTemplate> = {
  classic: {
    id: "classic",
    name: "Classic",
    description:
      "The familiar school report, properly set: serif headings, particulars across the top, a coloured table head and ruled results.",
    layout: "standard",
    headingFont: "times",
    sectionStyle: "rule",
    tileStyle: "filled",
    table: { accentHeader: true, zebra: true, rowRules: true, frame: false, columnRules: false },
    pageFrame: "none",
    particulars: "plain",
    ornament: "none",
    subjectMark: "plain",
  },
  modern: {
    id: "modern",
    name: "Rail",
    description:
      "A tinted rail down the left carries the photo, the particulars and the headline figures; the marks run in their own column beside it. Grades set in chips.",
    layout: "sidebar",
    headingFont: "helvetica",
    sectionStyle: "plain",
    tileStyle: "outlined",
    table: { accentHeader: false, zebra: true, rowRules: false, frame: false, columnRules: false },
    pageFrame: "none",
    particulars: "plain",
    ornament: "none",
    subjectMark: "pill",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description:
      "Hairlines and nothing else — no fills, no frame, the figures on one ruled strip. Everything the marks need and not one mark more.",
    layout: "standard",
    headingFont: "helvetica",
    sectionStyle: "plain",
    tileStyle: "strip",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: false, columnRules: false },
    pageFrame: "none",
    particulars: "plain",
    ornament: "none",
    subjectMark: "plain",
  },
  crest: {
    id: "crest",
    name: "Crest",
    description:
      "The formal statement of results: everything on the centre line, particulars on dot leaders, a double border and a place for the school's seal.",
    layout: "centred",
    headingFont: "times",
    sectionStyle: "sideRules",
    tileStyle: "outlined",
    table: { accentHeader: true, zebra: false, rowRules: true, frame: true, columnRules: false },
    pageFrame: "double",
    particulars: "leaders",
    ornament: "seal",
    subjectMark: "plain",
  },
  ledger: {
    id: "ledger",
    name: "Register",
    description:
      "Ruled like an examination register: the particulars as a bordered form, the marks in a full grid with every column ruled, figures on one line above.",
    layout: "register",
    headingFont: "times",
    sectionStyle: "rule",
    tileStyle: "strip",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: true, columnRules: true },
    pageFrame: "hairline",
    particulars: "boxed",
    ornament: "none",
    subjectMark: "plain",
  },
  bulletin: {
    id: "bulletin",
    name: "Nameplate",
    description:
      "A deep colour nameplate across the head holding the child's name and result in reverse-out, then the marks with a bar showing each against the class.",
    layout: "banner",
    headingFont: "helvetica",
    sectionStyle: "band",
    tileStyle: "filled",
    table: { accentHeader: true, zebra: true, rowRules: false, frame: false, columnRules: false },
    pageFrame: "topBand",
    particulars: "plain",
    ornament: "none",
    subjectMark: "bar",
  },
  heritage: {
    id: "heritage",
    name: "Heritage",
    description:
      "For a school that frames its results: a double border with ruled corners, serif throughout, and the particulars in a tinted panel.",
    layout: "standard",
    headingFont: "times",
    sectionStyle: "sideRules",
    tileStyle: "outlined",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: true, columnRules: false },
    pageFrame: "double",
    particulars: "panel",
    ornament: "corners",
    subjectMark: "plain",
  },
};

/** Every template, in the order the picker shows them. */
export const TEMPLATE_ORDER: ReportCardTemplateId[] = [
  "classic",
  "modern",
  "minimal",
  "crest",
  "ledger",
  "bulletin",
  "heritage",
];

export function templateFor(id: string | null | undefined): ReportCardTemplate {
  return REPORT_CARD_TEMPLATES[id as ReportCardTemplateId] ?? REPORT_CARD_TEMPLATES.classic;
}

// ─── Small drawing helpers ───────────────────────────────────────────────────

/** Mix a colour towards black — a nameplate wants the accent, but deeper. */
export function deepen(color: Rgb, amount: number): Rgb {
  const a = Math.min(1, Math.max(0, amount));
  return [
    Math.round(color[0] * (1 - a)),
    Math.round(color[1] * (1 - a)),
    Math.round(color[2] * (1 - a)),
  ];
}

/**
 * Set `text` at `size`, or as much smaller as it takes to fit `width`.
 *
 * The alternative is what this replaces: taking the first line of a wrap, so
 * "94.5% · 104/110 days" printed as "94.5% · 104/110" and the word that said
 * what the number meant was gone. A figure is shrunk, never truncated.
 */
function fitted(doc: PdfDocument, text: string, width: number, size: number, floor = 6.5): number {
  let at = size;
  doc.pdf.setFontSize(at);
  while (at > floor && doc.pdf.getTextWidth(text) > width) {
    at -= 0.25;
    doc.pdf.setFontSize(at);
  }
  return at;
}

/** A row of dots between a label and its value, as a printed form sets it. */
function leader(doc: PdfDocument, fromX: number, toX: number, y: number): void {
  if (toX - fromX < 2) return;
  doc.pdf.setDrawColor(...doc.theme.inkFaint);
  doc.pdf.setLineWidth(0.2);
  try {
    doc.pdf.setLineDashPattern([0.4, 1.1], 0);
    doc.pdf.line(fromX, y, toX, y);
  } finally {
    // Leaving the pen dashed would rule the whole rest of the page in dots.
    doc.pdf.setLineDashPattern([], 0);
  }
}

/** The width of the rail, for the layouts that have one. */
export function railWidth(doc: PdfDocument, density: number): number {
  return Math.min(62 * density, doc.width * 0.34);
}

export interface Particular {
  label: string;
  value: string | null | undefined;
}

function kept(entries: Particular[]): Array<{ label: string; value: string }> {
  return entries
    .filter((e) => e.value != null && String(e.value).trim() !== "")
    .map((e) => ({ label: e.label, value: String(e.value) }));
}

/**
 * The child's particulars, in this template's manner.
 *
 * Returns nothing; the cursor is left below the block. `width`/`x` narrow it,
 * which is how the rail layout puts the same facts in a 60mm column.
 */
export function drawParticulars(
  doc: PdfDocument,
  template: ReportCardTemplate,
  entries: Particular[],
  opts: { density?: number; width?: number; x?: number; columns?: number; stretch?: number } = {},
): void {
  const rows = kept(entries);
  if (!rows.length) return;

  const d = opts.density ?? 1;
  const width = opts.width ?? doc.width;
  const x = opts.x ?? doc.x;
  const columns = Math.max(1, opts.columns ?? 3);
  /**
   * A share of the empty page, in millimetres added to each line — bounded by
   * how many lines there are to share it between. The nameplate design leaves
   * a single particular under the band, and a lone "ROLL NO. 4" given a
   * nineteen-millimetre line is a gap, not a design.
   */
  const lineCount = Math.ceil(rows.length / columns);
  const open = Math.min(Math.max(0, opts.stretch ?? 0), 3 + 5 * lineCount);

  if (template.particulars === "boxed") {
    // A bordered form: every fact in its own ruled cell, the way an admission
    // register or an examination form is printed.
    const cellH = 10.5 * d + open;
    const lines = Math.ceil(rows.length / columns);
    const cellW = width / columns;
    doc.ensureSpace(lines * cellH + 3);
    const top = doc.y;

    rows.forEach((row, i) => {
      const cx = x + (i % columns) * cellW;
      const cy = top + Math.floor(i / columns) * cellH;
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.caption * 0.95);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(row.label.toUpperCase(), cx + 2, cy + 3.6 * d + open / 2);
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(doc.theme.size.body);
      doc.pdf.setTextColor(...doc.theme.ink);
      doc.pdf.text(doc.pdf.splitTextToSize(row.value, cellW - 4)[0] as string, cx + 2, cy + 8.2 * d + open / 2);
    });

    const height = lines * cellH;
    doc.pdf.setDrawColor(...doc.theme.rule);
    doc.pdf.setLineWidth(0.3);
    doc.pdf.rect(x, top, width, height, "S");
    doc.pdf.setLineWidth(0.15);
    for (let c = 1; c < columns; c += 1) doc.pdf.line(x + c * cellW, top, x + c * cellW, top + height);
    for (let r = 1; r < lines; r += 1) doc.pdf.line(x, top + r * cellH, x + width, top + r * cellH);

    doc.y = top + height + 3 * d;
    return;
  }

  if (template.particulars === "leaders") {
    // Label, dots, value — centred, two to a line. The formal register of a
    // school that issues a *statement* rather than a printout.
    // Two to a line from three particulars up. One per line draws a dot
    // leader the whole width of the sheet, which reads as a form nobody
    // filled in rather than a statement of results.
    const perLine = rows.length >= 3 ? 2 : 1;
    const blockW = Math.min(width, 168 * d);
    const blockX = x + (width - blockW) / 2;
    const colW = blockW / perLine;
    const lines = Math.ceil(rows.length / perLine);
    // The cap above was worked out from the caller's column count; these rows
    // are set to their own.
    const rowH = 6.6 * d + Math.min(open, 3 + 5 * lines);
    doc.ensureSpace(lines * rowH + 3);
    const top = doc.y;

    rows.forEach((row, i) => {
      const cx = blockX + (i % perLine) * colW;
      const cy = top + Math.floor(i / perLine) * rowH + 4 * d;
      const pad = perLine > 1 ? 5 : 0;

      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.small);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      const label = `${row.label}`;
      doc.pdf.text(label, cx, cy);
      const labelWidth = doc.pdf.getTextWidth(label);

      doc.pdf.setFont(template.headingFont, "bold");
      doc.pdf.setFontSize(doc.theme.size.body);
      doc.pdf.setTextColor(...doc.theme.ink);
      const value = doc.pdf.splitTextToSize(row.value, colW - labelWidth - pad - 8)[0] as string;
      const valueWidth = doc.pdf.getTextWidth(value);
      const right = cx + colW - pad;
      doc.pdf.text(value, right, cy, { align: "right" });

      leader(doc, cx + labelWidth + 1.5, right - valueWidth - 1.5, cy - 0.9);
    });

    doc.y = top + lines * rowH + 3 * d;
    return;
  }

  if (template.particulars === "panel") {
    const rowHeight = 7.6 + open;
    const lines = Math.ceil(rows.length / columns);
    const height = lines * rowHeight + 6;
    doc.ensureSpace(height + 3);
    const top = doc.y;
    doc.pdf.setFillColor(...tint(doc.theme.accent, 0.93));
    doc.pdf.roundedRect(x, top, width, height, 2, 2, "F");
    doc.pdf.setDrawColor(...tint(doc.theme.accent, 0.72));
    doc.pdf.setLineWidth(0.25);
    doc.pdf.roundedRect(x, top, width, height, 2, 2, "S");
    doc.y = top + 3;
    doc.fields(rows, columns, { x: x + 4, width: width - 8, rowHeight });
    doc.y = top + height + 3;
    return;
  }

  doc.fields(rows, columns, { x, width, rowHeight: 7.6 + open });
}

export interface HeadlineFigure {
  label: string;
  value: string;
}

/**
 * The headline results — marks, percentage, grade, position, attendance.
 *
 * `stacked` sets them one above another, which is what the rail layout needs;
 * `reverse` draws them light-on-dark, for the nameplate.
 */
export function drawFigures(
  doc: PdfDocument,
  template: ReportCardTemplate,
  figures: HeadlineFigure[],
  opts: { density?: number; width?: number; x?: number; stacked?: boolean; stretch?: number } = {},
): void {
  if (!figures.length) return;
  const d = opts.density ?? 1;
  const width = opts.width ?? doc.width;
  const x = opts.x ?? doc.x;
  /** A share of the empty page, in millimetres added to each figure's box. */
  const open = Math.max(0, opts.stretch ?? 0);

  if (opts.stacked) {
    // One under another, each with a hairline over it: a rail of facts.
    const rowH = 11 * d + open;
    doc.ensureSpace(figures.length * rowH);
    const top = doc.y;
    figures.forEach((f, i) => {
      const y = top + i * rowH;
      if (i > 0) {
        doc.pdf.setDrawColor(...tint(doc.theme.accent, 0.7));
        doc.pdf.setLineWidth(0.2);
        doc.pdf.line(x, y, x + width, y);
      }
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.caption * 0.95);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(f.label.toUpperCase(), x, y + 4 * d);
      doc.pdf.setFont(template.headingFont, "bold");
      doc.pdf.setTextColor(...doc.theme.accent);
      fitted(doc, f.value, width, 12 * d);
      doc.pdf.text(f.value, x, y + 9.4 * d);
    });
    doc.y = top + figures.length * rowH + 2 * d;
    return;
  }

  if (template.tileStyle === "strip") {
    // One line of figures over a rule: the register look, where the marks
    // below are the point and these are a caption to them.
    const height = 8 * d + open;
    doc.ensureSpace(height + 3 * d);
    const slot = width / figures.length;
    const baseline = doc.y + 5 * d + open / 2;
    figures.forEach((f, i) => {
      const centre = x + slot * i + slot / 2;
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.caption * 0.95);
      doc.pdf.setTextColor(...doc.theme.inkMuted);
      doc.pdf.text(f.label.toUpperCase(), centre, doc.y + 1.8 * d + open / 2, { align: "center" });
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setTextColor(...doc.theme.ink);
      fitted(doc, f.value, slot - 3 * d, 11 * d);
      doc.pdf.text(f.value, centre, baseline, { align: "center" });
      if (i > 0) {
        doc.pdf.setDrawColor(...doc.theme.ruleFaint);
        doc.pdf.setLineWidth(0.2);
        doc.pdf.line(x + slot * i, doc.y, x + slot * i, doc.y + height - 2 * d);
      }
    });
    doc.y += height;
    doc.pdf.setDrawColor(...doc.theme.rule);
    doc.pdf.setLineWidth(0.3);
    doc.pdf.line(x, doc.y, x + width, doc.y);
    doc.y += 3 * d;
    return;
  }

  const perRow = Math.min(figures.length, 6);
  const gap = 2.5 * d;
  const w = (width - gap * (perRow - 1)) / perRow;
  const h = 13 * d + open;
  const lines = Math.ceil(figures.length / perRow);
  const outlined = template.tileStyle === "outlined";
  doc.ensureSpace(lines * (h + gap));
  const top = doc.y;

  figures.forEach((f, i) => {
    const tx = x + (i % perRow) * (w + gap);
    const ty = top + Math.floor(i / perRow) * (h + gap);
    if (outlined) {
      doc.pdf.setDrawColor(...doc.theme.rule);
      doc.pdf.setLineWidth(0.3);
      doc.pdf.roundedRect(tx, ty, w, h, 1.5, 1.5, "S");
    } else {
      doc.pdf.setFillColor(...doc.theme.accentWash);
      doc.pdf.roundedRect(tx, ty, w, h, 1.5, 1.5, "F");
    }
    doc.pdf.setFont(doc.theme.bodyFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.caption);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text(f.label.toUpperCase(), tx + w / 2, ty + 4.4 * d + open / 2, { align: "center" });
    doc.pdf.setTextColor(...(outlined ? doc.theme.ink : doc.theme.accent));
    fitted(doc, f.value, w - 3 * d, 11.5 * d);
    doc.pdf.text(f.value, tx + w / 2, ty + 10.2 * d + open / 2, { align: "center" });
  });

  doc.y = top + lines * (h + gap) + 1;
}

/**
 * The nameplate: a deep band carrying the child's name and headline results in
 * reverse-out. The one design where the student, not the school, leads the page.
 *
 * Returns the box the photo may occupy inside the band, so the caller can place
 * it there — or null when there is no photo to place.
 */
export function drawNameplate(
  doc: PdfDocument,
  template: ReportCardTemplate,
  content: { name: string; sub: string; figures: HeadlineFigure[] },
  opts: { density?: number; photo?: boolean } = {},
): { x: number; y: number; width: number; height: number } | null {
  const d = opts.density ?? 1;
  const band = deepen(doc.theme.accent, 0.25);
  const onBand = readableOn(band);
  const height = (content.figures.length ? 34 : 22) * d;
  doc.ensureSpace(height + 4 * d);
  const top = doc.y;
  const photoW = opts.photo ? 20 * d : 0;
  const photoBox = opts.photo
    ? { x: doc.x + doc.width - photoW - 5 * d, y: top + 3 * d, width: photoW, height: height - 6 * d }
    : null;

  doc.pdf.setFillColor(...band);
  doc.pdf.rect(doc.x, top, doc.width, height, "F");
  // A brighter keyline along the foot, so the band reads as designed rather
  // than as a printer's block of ink.
  doc.pdf.setFillColor(...tint(doc.theme.accent, 0.45));
  doc.pdf.rect(doc.x, top + height - 0.8 * d, doc.width, 0.8 * d, "F");

  const textRight = doc.x + doc.width - photoW - (opts.photo ? 9 * d : 5 * d);
  const textWidth = textRight - (doc.x + 5 * d);

  doc.pdf.setFont(template.headingFont, "bold");
  doc.pdf.setFontSize(17 * d);
  doc.pdf.setTextColor(onBand[0], onBand[1], onBand[2]);
  doc.pdf.text(doc.pdf.splitTextToSize(content.name, textWidth)[0] as string, doc.x + 5 * d, top + 9.5 * d);

  if (content.sub) {
    doc.pdf.setFont(doc.theme.bodyFont, "normal");
    doc.pdf.setFontSize(doc.theme.size.small);
    doc.pdf.setTextColor(onBand[0], onBand[1], onBand[2]);
    doc.pdf.text(doc.pdf.splitTextToSize(content.sub, textWidth)[0] as string, doc.x + 5 * d, top + 15 * d);
  }

  if (content.figures.length) {
    const slot = textWidth / content.figures.length;
    content.figures.forEach((f, i) => {
      const fx = doc.x + 5 * d + slot * i;
      doc.pdf.setFont(doc.theme.bodyFont, "normal");
      doc.pdf.setFontSize(doc.theme.size.caption * 0.9);
      doc.pdf.setTextColor(onBand[0], onBand[1], onBand[2]);
      doc.pdf.text(f.label.toUpperCase(), fx, top + 23 * d);
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      fitted(doc, f.value, slot - 3 * d, 11 * d);
      doc.pdf.text(f.value, fx, top + 29 * d);
    });
  }

  doc.y = top + height + 4 * d;
  return photoBox;
}

/**
 * Draw a section heading in this template's manner.
 *
 * The document's own `sectionTitle` is one style; a template that only ever
 * used it would differ from the next only by its colours.
 */
export function drawSectionTitle(
  doc: PdfDocument,
  template: ReportCardTemplate,
  label: string,
  density = 1,
): void {
  const mm = (v: number) => v * density;
  const text = label.toUpperCase();

  if (template.sectionStyle === "band") {
    const height = mm(6.4);
    doc.ensureSpace(height + mm(3));
    doc.pdf.setFillColor(...doc.theme.accent);
    doc.pdf.rect(doc.x, doc.y, doc.width, height, "F");
    const fg = readableOn(doc.theme.accent);
    doc.pdf.setFont(template.headingFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.sectionTitle * 0.85);
    doc.pdf.setTextColor(fg[0], fg[1], fg[2]);
    doc.pdf.text(text, doc.x + mm(2.5), doc.y + height * 0.7);
    doc.y += height + mm(2.5);
    return;
  }

  if (template.sectionStyle === "sideRules") {
    doc.ensureSpace(mm(10));
    doc.advance(mm(2));
    doc.pdf.setFont(template.headingFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.sectionTitle * 0.9);
    doc.pdf.setTextColor(...doc.theme.accent);
    const width = doc.measure(text, {
      size: doc.theme.size.sectionTitle * 0.9,
      style: "bold",
      font: template.headingFont,
    });
    const centre = doc.x + doc.width / 2;
    const gap = mm(3);
    doc.pdf.text(text, centre, doc.y + mm(3), { align: "center" });
    doc.pdf.setDrawColor(...doc.theme.accent);
    doc.pdf.setLineWidth(0.4);
    const ruleY = doc.y + mm(2.2);
    doc.pdf.line(doc.x, ruleY, centre - width / 2 - gap, ruleY);
    doc.pdf.line(centre + width / 2 + gap, ruleY, doc.x + doc.width, ruleY);
    doc.y += mm(6);
    return;
  }

  if (template.sectionStyle === "plain") {
    doc.ensureSpace(mm(9));
    doc.advance(mm(2));
    doc.pdf.setFont(template.headingFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.sectionTitle * 0.8);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    // Letter-spaced, the way a small heading wants to be set.
    doc.pdf.text(text.split("").join(" "), doc.x, doc.y + mm(3));
    doc.y += mm(5.5);
    return;
  }

  doc.sectionTitle(label);
}

/**
 * The place the school stamps the sheet.
 *
 * An empty ring labelled for a seal, never a drawn crest: the app has no
 * authority to print a school's stamp, only to leave room for it.
 */
export function drawSeal(doc: PdfDocument, centreX: number, centreY: number, radius: number): void {
  doc.pdf.setDrawColor(...tint(doc.theme.accent, 0.35));
  doc.pdf.setLineWidth(0.5);
  doc.pdf.circle(centreX, centreY, radius, "S");
  doc.pdf.setLineWidth(0.2);
  doc.pdf.circle(centreX, centreY, radius - 1.2, "S");
  doc.pdf.setFont(doc.theme.bodyFont, "normal");
  doc.pdf.setFontSize(doc.theme.size.caption * 0.9);
  doc.pdf.setTextColor(...doc.theme.inkFaint);
  doc.pdf.text("SCHOOL", centreX, centreY - 0.6, { align: "center" });
  doc.pdf.text("SEAL", centreX, centreY + 2.8, { align: "center" });
}

/** The border this template draws around the sheet, once per page. */
export function drawPageFrame(doc: PdfDocument, template: ReportCardTemplate): void {
  const { width, height, margins } = doc.geo;
  const accent: Rgb = doc.theme.accent;
  const left = margins.left / 2;
  const top = margins.top / 2;
  const w = width - margins.left;
  const h = height - margins.top;

  if (template.pageFrame === "topBand") {
    doc.pdf.setFillColor(...accent);
    doc.pdf.rect(0, 0, width, 4, "F");
  } else if (template.pageFrame === "hairline") {
    doc.pdf.setDrawColor(...doc.theme.rule);
    doc.pdf.setLineWidth(0.3);
    doc.pdf.rect(left, top, w, h, "S");
  } else if (template.pageFrame === "double") {
    doc.pdf.setDrawColor(...accent);
    doc.pdf.setLineWidth(0.8);
    doc.pdf.rect(left, top, w, h, "S");
    doc.pdf.setLineWidth(0.25);
    doc.pdf.rect(left + 1.6, top + 1.6, w - 3.2, h - 3.2, "S");
  }

  if (template.ornament === "corners") {
    // Short rules across each corner of the border — the printed flourish of a
    // certificate, drawn in the school's own colour rather than clip art.
    const inset = template.pageFrame === "double" ? 3.4 : 1.8;
    const arm = 9;
    doc.pdf.setDrawColor(...accent);
    doc.pdf.setLineWidth(0.5);
    const corners: Array<[number, number, number, number]> = [
      [left + inset, top + inset, 1, 1],
      [left + w - inset, top + inset, -1, 1],
      [left + inset, top + h - inset, 1, -1],
      [left + w - inset, top + h - inset, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      doc.pdf.line(cx, cy, cx + arm * dx, cy);
      doc.pdf.line(cx, cy, cx, cy + arm * dy);
    }
  }
}
