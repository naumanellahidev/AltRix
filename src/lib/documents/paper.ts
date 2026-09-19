/**
 * Paper geometry.
 *
 * Every measurement in this document system is in millimetres, because paper is
 * in millimetres and because the alternative — pixels at an assumed DPI — is
 * what produced documents that looked right on screen and wrong on paper.
 *
 * The old exporter rendered full-bleed with zero margins. Almost no office
 * printer can print to the edge of a sheet: it scales the page down to fit its
 * own hardware margin, or it clips. Either way the document that came out was
 * not the document that was designed. So margins here are real, and the inner
 * edge is wider to survive a staple or a punch.
 */

export type PageSize = "a4" | "letter" | "legal" | "a5";
export type Orientation = "portrait" | "landscape";

/** Trim sizes in millimetres, portrait. */
const TRIM: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  a5: { width: 148, height: 210 },
};

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  /** Extra width on the bound edge, for staples and punched holes. */
  left: number;
}

/**
 * Default margins.
 *
 * 18mm at the sides is generous enough to survive a hole punch (which eats
 * about 12mm) and narrow enough not to waste the sheet. The bottom is deeper
 * than the top because the footer lives there.
 */
export const DEFAULT_MARGINS: Margins = { top: 16, right: 16, bottom: 20, left: 18 };

/** Tight margins for dense documents such as a mark sheet or a datesheet. */
export const COMPACT_MARGINS: Margins = { top: 12, right: 12, bottom: 16, left: 14 };

export interface PaperGeometry {
  size: PageSize;
  orientation: Orientation;
  /** Full sheet, millimetres. */
  width: number;
  height: number;
  margins: Margins;
  /** The printable box inside the margins. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  /** Baseline for the footer rule. */
  footerY: number;
}

export function geometry(
  size: PageSize = "a4",
  orientation: Orientation = "portrait",
  margins: Margins = DEFAULT_MARGINS,
): PaperGeometry {
  const trim = TRIM[size] ?? TRIM.a4;
  const width = orientation === "landscape" ? trim.height : trim.width;
  const height = orientation === "landscape" ? trim.width : trim.height;

  return {
    size,
    orientation,
    width,
    height,
    margins,
    contentX: margins.left,
    contentY: margins.top,
    contentWidth: width - margins.left - margins.right,
    contentHeight: height - margins.top - margins.bottom,
    footerY: height - margins.bottom + 6,
  };
}

/** Points per millimetre, for the places jsPDF still thinks in points. */
export const MM_PER_PT = 0.352777778;

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export function mmToPt(mm: number): number {
  return mm / MM_PER_PT;
}
