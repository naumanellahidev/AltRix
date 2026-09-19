/**
 * Tables that survive a page break.
 *
 * The old exporter rasterised the page and then sliced the image at fixed
 * intervals. A slice landed wherever it landed: through the middle of a row,
 * through a line of text, through a total. Page two then began with the bottom
 * halves of some letters and no column headings, so a reader could not tell
 * which number was the fee and which was the discount.
 *
 * This lays rows out one at a time and measures each before drawing it. A row
 * that does not fit moves to the next page whole, and the header is drawn again
 * above it. A row taller than a whole page — a long remarks field — is the one
 * case that must flow, and it is flowed deliberately rather than by accident.
 */
import type { PdfDocument } from "./document";
import { readableOn, type Rgb } from "./theme";

export type CellAlign = "left" | "center" | "right";

export interface Column<Row> {
  /** Column heading. Empty string for a column that needs none. */
  header: string;
  /**
   * Relative width. Columns share the content width in proportion to these,
   * so {2, 1, 1} gives the first column half the table.
   */
  width: number;
  align?: CellAlign;
  /** Headings usually align with their data; override when they should not. */
  headerAlign?: CellAlign;
  /** The cell's text. Return "" for blank — never invent a placeholder. */
  value: (row: Row, index: number) => string;
  /** Per-cell colour, for an overdue amount or a failing grade. */
  color?: (row: Row, index: number) => Rgb | undefined;
  bold?: (row: Row, index: number) => boolean;
  /** Keep the cell on one line, truncating with an ellipsis if it must. */
  noWrap?: boolean;
  /**
   * Draw something other than text in the cell — a QR code, a mark — inside
   * the box given. Called after the row's text.
   */
  drawCell?: (doc: PdfDocument, row: Row, index: number, box: { x: number; y: number; w: number; h: number }) => void;
  /** Minimum row height this column needs, in mm — for a drawn cell. */
  minHeight?: number;
}

export interface TableOptions<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Alternate row shading. Default true. */
  zebra?: boolean;
  /** Rule under every row rather than only under the header. Default true. */
  rowRules?: boolean;
  /** Shown in place of the body when there are no rows. */
  emptyMessage?: string;
  /** Rows appended after a rule: totals, balance carried forward. */
  footerRows?: Row[];
  fontSize?: number;
  /** Padding inside a cell, millimetres. */
  padding?: number;
  /** Draw the header band in the school's colour. Default true. */
  accentHeader?: boolean;
  /** Called once per drawn page, for a "continued" marker. */
  onPageBreak?: (doc: PdfDocument, pageNumber: number) => void;
}

const MM_PER_PT = 0.352777778;

interface Resolved<Row> {
  column: Column<Row>;
  x: number;
  width: number;
}

function layout<Row>(doc: PdfDocument, columns: Column<Row>[]): Resolved<Row>[] {
  const total = columns.reduce((sum, c) => sum + (c.width > 0 ? c.width : 1), 0);
  let cursor = doc.x;
  return columns.map((column) => {
    const width = (doc.width * (column.width > 0 ? column.width : 1)) / total;
    const resolved = { column, x: cursor, width };
    cursor += width;
    return resolved;
  });
}

/**
 * Shorten `text` with an ellipsis to fit `width`. Measuring resets the pen's
 * font and colour, so callers set their style after calling this.
 */
function truncate(
  doc: PdfDocument,
  text: string,
  width: number,
  fontSize: number,
  style: "normal" | "bold" = "normal",
): string {
  if (doc.measure(text, { size: fontSize, style }) <= width) return text;
  let out = text;
  while (out.length > 1 && doc.measure(`${out}…`, { size: fontSize, style }) > width) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function anchorFor(align: CellAlign, x: number, width: number, pad: number): number {
  if (align === "center") return x + width / 2;
  if (align === "right") return x + width - pad;
  return x + pad;
}

/**
 * Draw a table. Returns the number of rows drawn, which equals `rows.length`
 * unless the table was empty.
 */
export function drawTable<Row>(doc: PdfDocument, options: TableOptions<Row>): number {
  const {
    columns,
    rows,
    zebra = true,
    rowRules = true,
    emptyMessage,
    footerRows = [],
    fontSize = doc.theme.size.small,
    padding = 2,
    accentHeader = true,
    onPageBreak,
  } = options;

  if (!columns.length) return 0;

  const cols = layout(doc, columns);
  const lineMm = fontSize * 1.3 * MM_PER_PT;
  const headerHeight = lineMm + padding * 2;

  const drawHeader = () => {
    const bg = accentHeader ? doc.theme.accent : doc.theme.accentWash;
    const fg = accentHeader ? readableOn(bg) : doc.theme.ink;

    doc.pdf.setFillColor(bg[0], bg[1], bg[2]);
    doc.pdf.rect(doc.x, doc.y, doc.width, headerHeight, "F");

    for (const { column, x, width } of cols) {
      if (!column.header) continue;
      const align = column.headerAlign ?? column.align ?? "left";
      // Fit the heading first: measuring resets the font and colour.
      const label = truncate(doc, column.header, width - padding * 2, fontSize, "bold");
      doc.pdf.setFont(doc.theme.bodyFont, "bold");
      doc.pdf.setFontSize(fontSize);
      doc.pdf.setTextColor(fg[0], fg[1], fg[2]);
      doc.pdf.text(
        label,
        anchorFor(align, x, width, padding),
        doc.y + padding + lineMm * 0.72,
        { align },
      );
    }
    doc.y += headerHeight;
  };

  /** Wrapped lines per cell, and the height the row needs. */
  const measureRow = (row: Row, index: number, emphasis = false) => {
    const cells = cols.map(({ column, width }) => {
      const raw = column.value(row, index) ?? "";
      // Measure in the weight the cell is drawn in, or bold text overruns.
      const style = emphasis || column.bold?.(row, index) === true ? "bold" : "normal";
      if (column.noWrap) {
        return [truncate(doc, String(raw), width - padding * 2, fontSize, style)];
      }
      return doc.wrap(String(raw), width - padding * 2, { size: fontSize, style });
    });
    const tallest = cells.reduce((max, lines) => Math.max(max, lines.length), 1);
    const drawn = cols.reduce((max, { column }) => Math.max(max, column.minHeight ?? 0), 0);
    return { cells, height: Math.max(tallest * lineMm + padding * 2, drawn) };
  };

  const drawRow = (
    row: Row,
    index: number,
    measured: { cells: string[][]; height: number },
    striped: boolean,
    emphasis: boolean,
  ) => {
    if (striped) {
      doc.pdf.setFillColor(249, 250, 251);
      doc.pdf.rect(doc.x, doc.y, doc.width, measured.height, "F");
    }
    if (emphasis) {
      doc.pdf.setFillColor(...doc.theme.accentWash);
      doc.pdf.rect(doc.x, doc.y, doc.width, measured.height, "F");
    }

    cols.forEach(({ column, x, width }, colIndex) => {
      const lines = measured.cells[colIndex];
      const color = column.color?.(row, index) ?? (emphasis ? doc.theme.ink : doc.theme.ink);
      const bold = emphasis || column.bold?.(row, index) === true;
      const align = column.align ?? "left";

      doc.pdf.setFont(doc.theme.bodyFont, bold ? "bold" : "normal");
      doc.pdf.setFontSize(fontSize);
      doc.pdf.setTextColor(color[0], color[1], color[2]);

      lines.forEach((line, lineIndex) => {
        doc.pdf.text(
          line,
          anchorFor(align, x, width, padding),
          doc.y + padding + lineMm * 0.72 + lineIndex * lineMm,
          { align },
        );
      });
    });

    cols.forEach(({ column, x, width }) => {
      if (column.drawCell && !emphasis) {
        column.drawCell(doc, row, index, { x, y: doc.y, w: width, h: measured.height });
      }
    });

    doc.y += measured.height;

    if (rowRules) {
      doc.pdf.setDrawColor(...doc.theme.ruleFaint);
      doc.pdf.setLineWidth(0.15);
      doc.pdf.line(doc.x, doc.y, doc.x + doc.width, doc.y);
    }
  };

  // The header and at least one row must fit together, otherwise a page ends
  // with a lone heading and the data starts overleaf.
  const firstRowHeight = rows.length ? measureRow(rows[0], 0).height : lineMm + padding * 2;
  doc.ensureSpace(headerHeight + firstRowHeight);
  drawHeader();

  if (!rows.length) {
    const message = emptyMessage ?? "No entries.";
    doc.pdf.setFont(doc.theme.bodyFont, "italic");
    doc.pdf.setFontSize(fontSize);
    doc.pdf.setTextColor(...doc.theme.inkMuted);
    doc.pdf.text(message, doc.x + doc.width / 2, doc.y + padding + lineMm * 0.72, {
      align: "center",
    });
    doc.y += lineMm + padding * 2;
    doc.pdf.setDrawColor(...doc.theme.rule);
    doc.pdf.setLineWidth(0.2);
    doc.pdf.line(doc.x, doc.y, doc.x + doc.width, doc.y);
    doc.y += 2;
    return 0;
  }

  rows.forEach((row, index) => {
    const measured = measureRow(row, index);

    // A row taller than the printable area cannot be kept whole anywhere, so
    // it is drawn where it is and allowed to flow. Anything else moves down.
    const fitsAnywhere = measured.height <= doc.geo.contentHeight - headerHeight;
    if (fitsAnywhere && doc.y + measured.height > doc.bottomLimit) {
      doc.addPage();
      onPageBreak?.(doc, doc.pages);
      drawHeader();
    }

    drawRow(row, index, measured, zebra && index % 2 === 1, false);
  });

  if (footerRows.length) {
    doc.pdf.setDrawColor(...doc.theme.accent);
    doc.pdf.setLineWidth(0.4);
    doc.pdf.line(doc.x, doc.y, doc.x + doc.width, doc.y);

    footerRows.forEach((row, index) => {
      const measured = measureRow(row, rows.length + index, true);
      if (doc.y + measured.height > doc.bottomLimit) {
        doc.addPage();
        onPageBreak?.(doc, doc.pages);
        drawHeader();
      }
      drawRow(row, rows.length + index, measured, false, true);
    });
  }

  doc.y += 2;
  return rows.length;
}

/**
 * A two-column money summary — subtotal, discounts, total — right-aligned
 * against the table above it.
 */
export function drawSummary(
  doc: PdfDocument,
  entries: Array<{ label: string; value: string; emphasis?: boolean; tone?: "danger" | "positive" }>,
  opts: { width?: number; fontSize?: number } = {},
): void {
  const width = opts.width ?? Math.min(doc.width * 0.46, 86);
  const fontSize = opts.fontSize ?? doc.theme.size.body;
  const lineMm = fontSize * 1.45 * MM_PER_PT;
  const x = doc.x + doc.width - width;

  doc.ensureSpace(entries.length * lineMm + 4);

  entries.forEach((entry) => {
    const color =
      entry.tone === "danger"
        ? doc.theme.danger
        : entry.tone === "positive"
          ? doc.theme.positive
          : entry.emphasis
            ? doc.theme.ink
            : doc.theme.inkMuted;

    if (entry.emphasis) {
      doc.pdf.setFillColor(...doc.theme.accentWash);
      doc.pdf.rect(x, doc.y, width, lineMm, "F");
    }

    doc.pdf.setFont(doc.theme.bodyFont, entry.emphasis ? "bold" : "normal");
    doc.pdf.setFontSize(fontSize);
    doc.pdf.setTextColor(color[0], color[1], color[2]);
    doc.pdf.text(entry.label, x + 2, doc.y + lineMm * 0.72);
    doc.pdf.text(entry.value, x + width - 2, doc.y + lineMm * 0.72, { align: "right" });

    doc.y += lineMm;
  });

  doc.y += 2;
}
