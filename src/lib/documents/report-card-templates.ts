/**
 * How a report card looks.
 *
 * Schools do not want "a report card"; they want *their* report card, and the
 * one a family keeps for twenty years should not look like a printout from an
 * admin panel. These are seven finished designs, each a complete look rather
 * than a colour swap: the section headings, the table, the headline figures
 * and the page frame all change together.
 *
 * Every one of them:
 *   - prints on the school's own letterhead, in the school's own colour;
 *   - survives the single-page fitting pass (density and two-column subjects);
 *   - draws in vector, so it stays sharp at any size and the text is real text.
 */
import type { PdfDocument } from "./document";
import type { Rgb } from "./theme";

export type ReportCardTemplateId =
  | "classic"
  | "modern"
  | "minimal"
  | "crest"
  | "ledger"
  | "bulletin"
  | "heritage";

export interface ReportCardTemplate {
  id: ReportCardTemplateId;
  /** Shown in the picker. */
  name: string;
  /** One line telling a principal what they are choosing. */
  description: string;

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
  };
  /** A border drawn around the whole page. */
  pageFrame: "none" | "hairline" | "double" | "topBand";
  /** Student particulars: a plain field grid, or a tinted panel. */
  particulars: "plain" | "panel";
}

export const REPORT_CARD_TEMPLATES: Record<ReportCardTemplateId, ReportCardTemplate> = {
  classic: {
    id: "classic",
    name: "Classic",
    description: "Serif headings, ruled sections, a coloured table head. The familiar school report.",
    headingFont: "times",
    sectionStyle: "rule",
    tileStyle: "filled",
    table: { accentHeader: true, zebra: true, rowRules: true, frame: false },
    pageFrame: "none",
    particulars: "plain",
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Sans-serif, airy, outlined figures and a quiet table. Reads like a well-set magazine page.",
    headingFont: "helvetica",
    sectionStyle: "plain",
    tileStyle: "outlined",
    table: { accentHeader: false, zebra: true, rowRules: false, frame: false },
    pageFrame: "none",
    particulars: "panel",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Hairlines, no fills, plenty of white space. Everything the marks need and nothing else.",
    headingFont: "helvetica",
    sectionStyle: "plain",
    tileStyle: "strip",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: false },
    pageFrame: "none",
    particulars: "plain",
  },
  crest: {
    id: "crest",
    name: "Crest",
    description: "A deep colour band across the head, small-caps section labels and a framed result table.",
    headingFont: "times",
    sectionStyle: "sideRules",
    tileStyle: "filled",
    table: { accentHeader: true, zebra: false, rowRules: true, frame: true },
    pageFrame: "topBand",
    particulars: "panel",
  },
  ledger: {
    id: "ledger",
    name: "Ledger",
    description: "The examination register look: a full grid, ruled columns, figures in one line above it.",
    headingFont: "times",
    sectionStyle: "rule",
    tileStyle: "strip",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: true },
    pageFrame: "hairline",
    particulars: "plain",
  },
  bulletin: {
    id: "bulletin",
    name: "Bulletin",
    description: "Filled section bands and bold figures — easy to read across a hall or a noticeboard.",
    headingFont: "helvetica",
    sectionStyle: "band",
    tileStyle: "filled",
    table: { accentHeader: true, zebra: true, rowRules: false, frame: false },
    pageFrame: "none",
    particulars: "panel",
  },
  heritage: {
    id: "heritage",
    name: "Heritage",
    description: "A double rule around the page and serif throughout. For a school that frames its results.",
    headingFont: "times",
    sectionStyle: "sideRules",
    tileStyle: "outlined",
    table: { accentHeader: false, zebra: false, rowRules: true, frame: true },
    pageFrame: "double",
    particulars: "plain",
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
  return REPORT_CARD_TEMPLATES[(id as ReportCardTemplateId)] ?? REPORT_CARD_TEMPLATES.classic;
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
    doc.pdf.setFont(template.headingFont, "bold");
    doc.pdf.setFontSize(doc.theme.size.sectionTitle * 0.85);
    doc.pdf.setTextColor(255, 255, 255);
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
    const width = doc.measure(text, { size: doc.theme.size.sectionTitle * 0.9, style: "bold", font: template.headingFont });
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

/** The border this template draws around the sheet, once per page. */
export function drawPageFrame(doc: PdfDocument, template: ReportCardTemplate): void {
  const { width, height, margins } = doc.geo;
  const accent: Rgb = doc.theme.accent;

  if (template.pageFrame === "topBand") {
    doc.pdf.setFillColor(...accent);
    doc.pdf.rect(0, 0, width, 4, "F");
    return;
  }
  if (template.pageFrame === "hairline") {
    doc.pdf.setDrawColor(...doc.theme.rule);
    doc.pdf.setLineWidth(0.3);
    doc.pdf.rect(margins.left / 2, margins.top / 2, width - margins.left, height - margins.top, "S");
    return;
  }
  if (template.pageFrame === "double") {
    doc.pdf.setDrawColor(...accent);
    doc.pdf.setLineWidth(0.8);
    doc.pdf.rect(margins.left / 2, margins.top / 2, width - margins.left, height - margins.top, "S");
    doc.pdf.setLineWidth(0.25);
    doc.pdf.rect(
      margins.left / 2 + 1.6,
      margins.top / 2 + 1.6,
      width - margins.left - 3.2,
      height - margins.top - 3.2,
      "S",
    );
  }
}
