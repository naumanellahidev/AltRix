/**
 * The document itself.
 *
 * Every official document the app produces is drawn through this class, and the
 * reason is the thing the old exporter got wrong: it rendered the page to a
 * JPEG and put the JPEG in a PDF. Text became pixels — blurry on paper, not
 * selectable, not searchable, not accessible, and a fee voucher came out at
 * two megabytes. Its own progress message said "Generating vector PDF" while it
 * did this.
 *
 * Here text is text. It is drawn with the PDF's own type, so it stays sharp at
 * any zoom and on any printer, a parent can copy the invoice number out of it,
 * and a school can search a folder of five hundred report cards for a name.
 *
 * The other thing this owns is page mechanics, which nothing owned before:
 * where a page breaks, that a table repeats its header when it does, that every
 * page says which one it is out of how many, and that nothing lands in the
 * margin a printer cannot reach.
 */
import jsPDF from "jspdf";

import {
  DEFAULT_MARGINS,
  Margins,
  Orientation,
  PageSize,
  PaperGeometry,
  geometry,
} from "./paper";
import { documentFileName } from "./format";
import { applyLoadedUnicodeFont, ensureUnicodeFontLoaded, installTextSafety, isRightToLeft, unsupportedText } from "./fonts";
import {
  DEFAULT_THEME,
  DocumentTheme,
  Rgb,
  readableOn,
  themeFor,
} from "./theme";

export type Watermark = "none" | "draft" | "copy" | "original" | "duplicate" | "void" | "paid" | "overdue" | "cancelled";

export interface DocumentSchool {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  /** A data: URI, or a URL that has already been signed. See loadImage(). */
  logoUrl?: string | null;
  motto?: string | null;
  registrationNumber?: string | null;
}

export interface DocumentOptions {
  title: string;
  /** Shown under the title: "Term 2, 2026" or "Invoice INV-2026-0412". */
  subtitle?: string | null;
  school: DocumentSchool;
  size?: PageSize;
  orientation?: Orientation;
  margins?: Margins;
  /** The school's brand colour, in any form parseColor understands. */
  accent?: string | null;
  theme?: Partial<DocumentTheme>;
  /** Printed in the footer and used for the filename. */
  reference?: string | null;
  watermark?: Watermark;
  /** Defaults to now. Pass the real issue date for a reprint. */
  issuedAt?: Date | null;
  /** Free text in the footer, e.g. "This is a computer-generated document." */
  footerNote?: string | null;
  /** Suppress the letterhead on continuation pages. Default true. */
  repeatLetterheadOnEveryPage?: boolean;
  /**
   * Compress content streams. Default true — it roughly halves file size.
   * Turn off only to inspect the raw PDF, as the tests do.
   */
  compress?: boolean;
  locale?: string;
}

export interface TextOptions {
  size?: number;
  color?: Rgb;
  font?: string;
  style?: "normal" | "bold" | "italic" | "bolditalic";
  align?: "left" | "center" | "right";
  /** Multiplier on the font size. */
  lineHeight?: number;
  /** Defaults to the content width from the current x. */
  maxWidth?: number;
  /** Space to add after the block, in mm. */
  spaceAfter?: number;
}

const LINE_HEIGHT = 1.35;

/** How far below the top margin the body starts once a letterhead is drawn. */
const LETTERHEAD_HEIGHT = 30;

export class PdfDocument {
  readonly pdf: jsPDF;
  readonly geo: PaperGeometry;
  readonly theme: DocumentTheme;
  /** The current document's options; replaced by beginDocument(). */
  options: DocumentOptions;

  /** Current vertical position, millimetres from the top of the sheet. */
  private cursor: number;
  private pageCount = 1;
  /** Deferred so "Page X of Y" can be written once Y is known. */
  private readonly footerQueue: Array<{ page: number; group: number }> = [];
  /**
   * One entry per document in this file. A payroll run or a class set is many
   * documents in one PDF: each keeps its own reference and its own
   * "Page 1 of 2", so a stack printed from it separates cleanly.
   */
  private readonly groups: Array<{ reference: string | null; footerNote: string | null }> = [];

  constructor(options: DocumentOptions) {
    this.options = options;
    this.geo = geometry(
      options.size ?? "a4",
      options.orientation ?? "portrait",
      options.margins ?? DEFAULT_MARGINS,
    );
    this.theme = {
      ...themeFor(options.accent ?? null),
      ...(options.theme ?? {}),
    };

    this.pdf = new jsPDF({
      orientation: this.geo.orientation,
      unit: "mm",
      format: this.geo.size,
      compress: options.compress ?? true,
    });

    // Every text call on this document now draws Urdu in the shipped Unicode
    // font (when loaded) and never silently prints boxes.
    installTextSafety(this.pdf);
    applyLoadedUnicodeFont(this.pdf);

    this.pdf.setProperties({
      title: options.subtitle ? `${options.title} — ${options.subtitle}` : options.title,
      subject: options.title,
      author: options.school.name,
      creator: options.school.name,
      keywords: [options.title, options.reference ?? "", options.school.name]
        .filter(Boolean)
        .join(", "),
    });

    this.cursor = this.geo.contentY;
    this.groups.push({ reference: options.reference ?? null, footerNote: options.footerNote ?? null });
    this.drawLetterhead();
    this.footerQueue.push({ page: 1, group: 0 });
  }

  // ─── Position ──────────────────────────────────────────────────────────────

  get y(): number {
    return this.cursor;
  }

  set y(value: number) {
    this.cursor = value;
  }

  get x(): number {
    return this.geo.contentX;
  }

  get width(): number {
    return this.geo.contentWidth;
  }

  /** The last y a body element may occupy before it would enter the footer. */
  get bottomLimit(): number {
    return this.geo.height - this.geo.margins.bottom;
  }

  get remaining(): number {
    return this.bottomLimit - this.cursor;
  }

  get pages(): number {
    return this.pageCount;
  }

  /** Move down. Negative values move up. */
  advance(mm: number): this {
    this.cursor += mm;
    return this;
  }

  /**
   * Guarantee `needed` millimetres of room, starting a page if there is not.
   * Returns true if a new page was started, so a caller can redraw a table head.
   */
  ensureSpace(needed: number): boolean {
    if (this.cursor + needed <= this.bottomLimit) return false;
    this.addPage();
    return true;
  }

  addPage(): this {
    this.pdf.addPage(this.geo.size, this.geo.orientation);
    this.pageCount += 1;
    this.footerQueue.push({ page: this.pageCount, group: this.groups.length - 1 });
    this.cursor = this.geo.contentY;
    if (this.options.repeatLetterheadOnEveryPage !== false) {
      this.drawContinuationHead();
    }
    return this;
  }

  /**
   * Start the next document in the same file, on a fresh page with its own
   * letterhead, reference and page numbering — one payslip per employee, one
   * report card per child, all in a single printable PDF.
   */
  beginDocument(next: Partial<Pick<DocumentOptions, "subtitle" | "reference" | "footerNote" | "watermark" | "title">>): this {
    this.options = { ...this.options, ...next };
    this.pdf.addPage(this.geo.size, this.geo.orientation);
    this.pageCount += 1;
    this.groups.push({ reference: this.options.reference ?? null, footerNote: this.options.footerNote ?? null });
    this.footerQueue.push({ page: this.pageCount, group: this.groups.length - 1 });
    this.cursor = this.geo.contentY;
    this.drawLetterhead();
    return this;
  }

  /** How many documents this file holds. */
  get documentCount(): number {
    return this.groups.length;
  }

  // ─── Text ──────────────────────────────────────────────────────────────────

  private applyText(opts: TextOptions): number {
    const size = opts.size ?? this.theme.size.body;
    this.pdf.setFont(opts.font ?? this.theme.bodyFont, opts.style ?? "normal");
    this.pdf.setFontSize(size);
    const color = opts.color ?? this.theme.ink;
    this.pdf.setTextColor(color[0], color[1], color[2]);
    return size;
  }

  /** Measure a string at the given style, in millimetres. */
  measure(text: string, opts: TextOptions = {}): number {
    this.applyText(opts);
    return this.pdf.getTextWidth(text);
  }

  /** Wrap a string to `maxWidth`, returning the lines. */
  wrap(text: string, maxWidth: number, opts: TextOptions = {}): string[] {
    this.applyText(opts);
    return this.pdf.splitTextToSize(String(text ?? ""), maxWidth) as string[];
  }

  /**
   * Draw a paragraph, wrapping and paginating as needed.
   *
   * Returns the height consumed. A block that does not fit on the remaining
   * page is not split mid-line: it moves whole to the next page unless it is
   * taller than a page, in which case it flows.
   */
  text(value: string | null | undefined, opts: TextOptions = {}): this {
    const content = value == null ? "" : String(value);
    if (!content) {
      if (opts.spaceAfter) this.advance(opts.spaceAfter);
      return this;
    }

    const size = this.applyText(opts);
    const lineHeightMm = (size * (opts.lineHeight ?? LINE_HEIGHT)) * 0.352777778;
    const maxWidth = opts.maxWidth ?? this.width;
    const lines = this.pdf.splitTextToSize(content, maxWidth) as string[];

    for (const line of lines) {
      // An Urdu line sits against the right margin unless the caller chose.
      const align = opts.align ?? (isRightToLeft(line) ? "right" : "left");
      const anchorX =
        align === "center" ? this.x + maxWidth / 2 : align === "right" ? this.x + maxWidth : this.x;
      this.ensureSpace(lineHeightMm);
      this.applyText(opts);
      // jsPDF positions text on its baseline; offset so `cursor` behaves as the
      // top of the line box, which is what every caller expects.
      this.pdf.text(line, anchorX, this.cursor + lineHeightMm * 0.76, { align });
      this.cursor += lineHeightMm;
    }

    if (opts.spaceAfter) this.advance(opts.spaceAfter);
    return this;
  }

  /** A section heading with a rule under it. */
  sectionTitle(label: string): this {
    this.ensureSpace(12);
    this.advance(2);
    this.text(label.toUpperCase(), {
      size: this.theme.size.sectionTitle,
      style: "bold",
      font: this.theme.headingFont,
      color: this.theme.accent,
    });
    this.rule({ color: this.theme.accent, thickness: 0.5 });
    this.advance(2.5);
    return this;
  }

  rule(opts: { color?: Rgb; thickness?: number; width?: number; inset?: number } = {}): this {
    const color = opts.color ?? this.theme.rule;
    this.pdf.setDrawColor(color[0], color[1], color[2]);
    this.pdf.setLineWidth(opts.thickness ?? 0.2);
    const inset = opts.inset ?? 0;
    const w = opts.width ?? this.width - inset * 2;
    this.pdf.line(this.x + inset, this.cursor, this.x + inset + w, this.cursor);
    this.cursor += 1.2;
    return this;
  }

  /**
   * A block of labelled facts — student name, roll number, class — laid out in
   * columns that stay aligned across every document in the set.
   */
  fields(
    entries: Array<{ label: string; value: string | null | undefined }>,
    columns = 2,
    options: { width?: number; x?: number } = {},
  ): this {
    const present = entries.filter((e) => e.value != null && String(e.value).trim() !== "");
    if (!present.length) return this;

    const colWidth = (options.width ?? this.width) / columns;
    const rowHeight = 7.6;
    const rows = Math.ceil(present.length / columns);

    this.ensureSpace(rows * rowHeight);

    present.forEach((entry, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellX = (options.x ?? this.x) + col * colWidth;
      const cellY = this.cursor + row * rowHeight;

      this.pdf.setFont(this.theme.bodyFont, "normal");
      this.pdf.setFontSize(this.theme.size.caption);
      this.pdf.setTextColor(...this.theme.inkMuted);
      this.pdf.text(entry.label.toUpperCase(), cellX, cellY + 2.6);

      this.pdf.setFont(this.theme.bodyFont, "bold");
      this.pdf.setFontSize(this.theme.size.body);
      this.pdf.setTextColor(...this.theme.ink);
      const value = this.pdf.splitTextToSize(String(entry.value), colWidth - 4)[0] as string;
      this.pdf.text(value, cellX, cellY + 6.4);
    });

    this.cursor += rows * rowHeight + 2;
    return this;
  }

  // ─── Letterhead and furniture ──────────────────────────────────────────────

  private drawLetterhead(): void {
    const { school, title, subtitle } = this.options;
    const g = this.geo;

    // A band of the school's colour along the top edge. Full bleed is fine for
    // a decorative rule — if a printer clips 3mm of it, nothing is lost.
    this.pdf.setFillColor(...this.theme.accent);
    this.pdf.rect(0, 0, g.width, 3.5, "F");

    let textX = g.contentX;
    const logo = this.logoData;
    if (logo) {
      try {
        this.pdf.addImage(logo.data, logo.format, g.contentX, g.margins.top + 1, 18, 18);
        textX = g.contentX + 22;
      } catch {
        // A logo that will not decode must not take the document with it. The
        // letterhead simply starts at the margin instead.
        textX = g.contentX;
      }
    }

    // Measure the title block first: the school's name and contact line must
    // stop short of it, or a long name runs underneath the title on a narrow
    // page such as an A5 receipt.
    this.pdf.setFont(this.theme.headingFont, "bold");
    this.pdf.setFontSize(this.theme.size.docTitle);
    const titleWidth = this.pdf.getTextWidth(title);
    this.pdf.setFont(this.theme.bodyFont, "normal");
    this.pdf.setFontSize(this.theme.size.small);
    const subtitleWidth = subtitle ? this.pdf.getTextWidth(subtitle) : 0;
    const available = g.contentWidth - (textX - g.contentX) - Math.max(titleWidth, subtitleWidth) - 6;

    // The name shrinks to fit, down to 11pt, then wraps onto a second line.
    this.pdf.setFont(this.theme.headingFont, "bold");
    this.pdf.setTextColor(...this.theme.ink);
    let nameSize = 15;
    this.pdf.setFontSize(nameSize);
    while (nameSize > 11 && this.pdf.getTextWidth(school.name) > available) {
      nameSize -= 0.5;
      this.pdf.setFontSize(nameSize);
    }
    const nameLines = (this.pdf.splitTextToSize(school.name, Math.max(available, 30)) as string[]).slice(0, 2);
    nameLines.forEach((line, i) => this.pdf.text(line, textX, g.margins.top + 6.5 + i * nameSize * 0.42));
    const nameBottom = g.margins.top + 6.5 + (nameLines.length - 1) * nameSize * 0.42;

    const contact = [school.address, school.phone, school.email, school.website]
      .filter((v) => v && String(v).trim())
      .join("  ·  ");
    if (contact) {
      this.pdf.setFont(this.theme.bodyFont, "normal");
      this.pdf.setFontSize(this.theme.size.caption);
      this.pdf.setTextColor(...this.theme.inkMuted);
      const line = this.pdf.splitTextToSize(contact, Math.max(available, 30))[0] as string;
      this.pdf.text(line, textX, nameBottom + 4.5);
    }

    // Document title, right-aligned against the school block.
    this.pdf.setFont(this.theme.headingFont, "bold");
    this.pdf.setFontSize(this.theme.size.docTitle);
    this.pdf.setTextColor(...this.theme.accent);
    this.pdf.text(title, g.contentX + g.contentWidth, g.margins.top + 7, { align: "right" });

    if (subtitle) {
      this.pdf.setFont(this.theme.bodyFont, "normal");
      this.pdf.setFontSize(this.theme.size.small);
      this.pdf.setTextColor(...this.theme.inkMuted);
      this.pdf.text(subtitle, g.contentX + g.contentWidth, g.margins.top + 12, { align: "right" });
    }

    const ruleY = g.margins.top + LETTERHEAD_HEIGHT - 12;
    this.pdf.setDrawColor(...this.theme.accent);
    this.pdf.setLineWidth(0.6);
    this.pdf.line(g.contentX, ruleY, g.contentX + g.contentWidth, ruleY);

    this.cursor = ruleY + 6;
    this.drawWatermark();
  }

  /** A slimmer head for continuation pages, so page two is still identifiable. */
  private drawContinuationHead(): void {
    const g = this.geo;
    this.pdf.setFillColor(...this.theme.accent);
    this.pdf.rect(0, 0, g.width, 2, "F");

    this.pdf.setFont(this.theme.bodyFont, "bold");
    this.pdf.setFontSize(this.theme.size.small);
    this.pdf.setTextColor(...this.theme.inkMuted);
    this.pdf.text(this.options.school.name, g.contentX, g.margins.top + 1);

    this.pdf.setFont(this.theme.bodyFont, "normal");
    this.pdf.text(
      this.options.subtitle
        ? `${this.options.title} — ${this.options.subtitle}`
        : this.options.title,
      g.contentX + g.contentWidth,
      g.margins.top + 1,
      { align: "right" },
    );

    this.pdf.setDrawColor(...this.theme.ruleFaint);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(g.contentX, g.margins.top + 3.2, g.contentX + g.contentWidth, g.margins.top + 3.2);

    this.cursor = g.margins.top + 8;
    this.drawWatermark();
  }

  private drawWatermark(): void {
    const mark = this.options.watermark;
    if (!mark || mark === "none") return;

    const g = this.geo;
    const label = mark.toUpperCase();

    // Drawn first, under the content, and pale enough to stay readable through.
    this.pdf.saveGraphicsState();
    // @ts-expect-error -- GState is present at runtime; jsPDF's types omit it.
    this.pdf.setGState(new this.pdf.GState({ opacity: 0.08 }));
    this.pdf.setFont(this.theme.headingFont, "bold");
    this.pdf.setFontSize(76);
    this.pdf.setTextColor(...this.theme.accent);
    this.pdf.text(label, g.width / 2, g.height / 2, {
      align: "center",
      angle: 32,
      baseline: "middle",
    });
    this.pdf.restoreGraphicsState();
  }

  /**
   * A signature block that does not pretend to be signed.
   *
   * The rule is the place a person signs. Printing a name above a line with no
   * signature on it is how a document claims an authority it does not have, so
   * the name sits *below* the rule as a label for who should sign.
   */
  signatures(
    blocks: Array<{ name?: string | null; title: string; note?: string | null }>,
    options: { width?: number } = {},
  ): this {
    if (!blocks.length) return this;
    const blockWidth = (options.width ?? this.width) / blocks.length;
    this.ensureSpace(24);
    this.advance(10);

    const lineY = this.cursor;
    blocks.forEach((block, index) => {
      const centre = this.x + blockWidth * index + blockWidth / 2;
      const half = Math.min(blockWidth * 0.36, 32);

      this.pdf.setDrawColor(...this.theme.inkFaint);
      this.pdf.setLineWidth(0.25);
      this.pdf.line(centre - half, lineY, centre + half, lineY);

      this.pdf.setFont(this.theme.bodyFont, "bold");
      this.pdf.setFontSize(this.theme.size.small);
      this.pdf.setTextColor(...this.theme.ink);
      this.pdf.text(block.title, centre, lineY + 4.2, { align: "center" });

      if (block.name) {
        this.pdf.setFont(this.theme.bodyFont, "normal");
        this.pdf.setFontSize(this.theme.size.caption);
        this.pdf.setTextColor(...this.theme.inkMuted);
        this.pdf.text(block.name, centre, lineY + 8, { align: "center" });
      }
      if (block.note) {
        this.pdf.setFont(this.theme.bodyFont, "italic");
        this.pdf.setFontSize(this.theme.size.caption);
        this.pdf.setTextColor(...this.theme.inkFaint);
        this.pdf.text(block.note, centre, lineY + 11.4, { align: "center" });
      }
    });

    this.cursor = lineY + 14;
    return this;
  }

  /** A callout box, for terms, a late-fee warning or an instruction. */
  note(text: string, opts: { tone?: "neutral" | "warning" | "positive" } = {}): this {
    const tone = opts.tone ?? "neutral";
    const border =
      tone === "warning" ? this.theme.danger : tone === "positive" ? this.theme.positive : this.theme.accent;

    const lines = this.wrap(text, this.width - 10, { size: this.theme.size.small });
    const lineMm = this.theme.size.small * LINE_HEIGHT * 0.352777778;
    const height = lines.length * lineMm + 6;

    this.ensureSpace(height + 2);

    this.pdf.setFillColor(...this.theme.accentWash);
    this.pdf.rect(this.x, this.cursor, this.width, height, "F");
    this.pdf.setFillColor(...border);
    this.pdf.rect(this.x, this.cursor, 1.4, height, "F");

    this.pdf.setFont(this.theme.bodyFont, "normal");
    this.pdf.setFontSize(this.theme.size.small);
    this.pdf.setTextColor(...this.theme.ink);
    lines.forEach((line, i) => {
      this.pdf.text(line, this.x + 5, this.cursor + 4.6 + i * lineMm);
    });

    this.cursor += height + 3;
    return this;
  }

  /** Place an already-decoded image. Returns false if it could not be drawn. */
  image(
    data: string,
    format: string,
    box: { x?: number; y?: number; width: number; height: number },
  ): boolean {
    try {
      this.pdf.addImage(data, format, box.x ?? this.x, box.y ?? this.cursor, box.width, box.height);
      return true;
    } catch {
      return false;
    }
  }

  private get logoData(): { data: string; format: string } | null {
    const url = this.options.school.logoUrl;
    if (!url) return null;
    const match = /^data:image\/(png|jpe?g|webp);base64,/i.exec(url);
    if (!match) return null;
    const format = match[1].toLowerCase().startsWith("jp") ? "JPEG" : match[1].toUpperCase();
    return { data: url, format };
  }

  // ─── Finishing ─────────────────────────────────────────────────────────────

  /**
   * Write the footer on every page.
   *
   * Deferred to the end because "Page 2 of 7" cannot be written before the
   * seventh page exists, and a document that says "Page 2" and nothing more
   * gives a reader no way to know a page is missing from the stack.
   */
  private stampFooters(): void {
    const g = this.geo;
    const issued = this.options.issuedAt ?? new Date();
    const locale = this.options.locale ?? "en-GB";

    const stampedOn = issued.toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Numbering runs within each document, not across the whole file.
    const perGroup = new Map<number, number[]>();
    for (const { page, group } of this.footerQueue) {
      const list = perGroup.get(group) ?? [];
      list.push(page);
      perGroup.set(group, list);
    }

    for (const [group, pages] of perGroup) {
      const meta = this.groups[group];
      pages.forEach((pageNumber, index) => {
        this.pdf.setPage(pageNumber);

        this.pdf.setDrawColor(...this.theme.ruleFaint);
        this.pdf.setLineWidth(0.2);
        this.pdf.line(g.contentX, g.footerY - 3, g.contentX + g.contentWidth, g.footerY - 3);

        this.pdf.setFont(this.theme.bodyFont, "normal");
        this.pdf.setFontSize(this.theme.size.caption);
        this.pdf.setTextColor(...this.theme.inkMuted);

        const left = [this.options.school.name, meta.reference].filter(Boolean).join("  ·  ");
        this.pdf.text(left, g.contentX, g.footerY);
        this.pdf.text(`Page ${index + 1} of ${pages.length}`, g.contentX + g.contentWidth, g.footerY, { align: "right" });

        const note = meta.footerNote ?? `Generated ${stampedOn}`;
        this.pdf.setTextColor(...this.theme.inkFaint);
        this.pdf.text(note, g.contentX + g.contentWidth / 2, g.footerY + 3.6, { align: "center" });
      });
    }
  }

  private finished = false;

  /**
   * Finish the document. After this, only output methods are valid.
   *
   * Safe to call more than once — every output method calls it, and stamping
   * the footers twice would print "Page 1 of 3" over itself in a smear.
   */
  finish(): this {
    if (this.finished) return this;
    this.stampFooters();
    this.finished = true;
    return this;
  }

  /**
   * Text that could not be printed faithfully — an Urdu name when the Urdu
   * font could not be loaded, for instance. Empty when everything printed.
   */
  get unprintableText(): string[] {
    return unsupportedText(this.pdf);
  }

  /**
   * The file name, built from what the document is: "Fee Voucher -
   * CMS-2026-000412 - Crescent Model School.pdf", never a slug or a timestamp.
   */
  filename(extension = "pdf"): string {
    return documentFileName(
      [this.options.title, this.options.reference ?? this.options.subtitle, this.options.school.name],
      extension,
    );
  }

  blob(): Blob {
    this.finish();
    return this.pdf.output("blob");
  }

  arrayBuffer(): ArrayBuffer {
    this.finish();
    return this.pdf.output("arraybuffer") as ArrayBuffer;
  }

  dataUri(): string {
    this.finish();
    return this.pdf.output("datauristring");
  }

  save(name?: string): void {
    this.finish();
    this.pdf.save(name ?? this.filename());
  }
}

/** Convenience: build, draw, and hand back the finished document. */
export function createDocument(options: DocumentOptions): PdfDocument {
  return new PdfDocument(options);
}

/**
 * Create a document with the Urdu-capable font ready.
 *
 * Prefer this whenever a document may contain names or text entered by users:
 * in this product, that is nearly every document.
 */
export async function createDocumentAsync(options: DocumentOptions): Promise<PdfDocument> {
  await ensureUnicodeFontLoaded();
  return new PdfDocument(options);
}

export { DEFAULT_THEME };
export type { DocumentTheme, Rgb };
export { readableOn };
