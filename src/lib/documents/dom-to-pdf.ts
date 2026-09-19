/**
 * An on-screen document, exported as a real PDF.
 *
 * The exporter this replaces took a screenshot. It cloned the element, ran
 * html2canvas over it, saved the canvas as a JPEG and pasted the JPEG into a
 * PDF — then cut the JPEG into page-sized strips wherever the arithmetic said,
 * straight through table rows and lines of text. Every report card, contract
 * and staff list the app exported was a blurry picture of a document: text that
 * could not be selected or searched, files of several megabytes, and page two
 * starting with the bottom halves of letters.
 *
 * This lays the element out exactly as before, then reads the layout back and
 * redraws it with PDF primitives:
 *
 *  - Text is text. Each line is drawn where the browser placed it, in the
 *    matching weight, size and colour, so it stays sharp, selectable,
 *    searchable and small. Urdu is drawn in the shipped Unicode font.
 *  - Backgrounds and borders are filled and stroked shapes.
 *  - Charts drawn as SVG stay vector. Photos and logos — which are pictures to
 *    begin with — are embedded as the images they are.
 *  - Links stay clickable.
 *  - Pages break between lines, rows and pictures, never through them; a table
 *    that continues onto the next page repeats its header; an element can ask
 *    for a page break before it or to be kept whole.
 *  - Every page gets real margins and a "Page X of Y" footer.
 *
 * Nothing on the page is rasterised except what was already a raster.
 */
import jsPDF from "jspdf";

import { fit, loadImage } from "./assets";
import {
  applyLoadedUnicodeFont,
  ensureUnicodeFontLoaded,
  installTextSafety,
  needsUnicodeFont,
  unsupportedText,
} from "./fonts";
import { DEFAULT_MARGINS, type Margins, type Orientation, type PageSize, geometry } from "./paper";
import type { Rgb } from "./theme";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DomPdfOptions {
  filename?: string;
  /** Shown in the footer of every page and as the PDF title. */
  title?: string;
  /** Shown in the footer next to the title — a school name, for instance. */
  author?: string;
  size?: PageSize;
  orientation?: Orientation;
  margins?: Margins;
  /**
   * Width, in CSS pixels, the element is laid out at before conversion. The
   * layout is then scaled to the printable width. Defaults to the A4 width
   * the old exporter used, so existing designs keep their proportions.
   */
  layoutWidthPx?: number;
  /** Footer on every page. Default true. */
  footer?: boolean;
  /** Free text in the footer centre. Defaults to the generation time. */
  footerNote?: string;
  /** Compress content streams. Default true; off only to inspect the output. */
  compress?: boolean;
  onProgress?: (step: string) => void;
}

export interface DomPdfResult {
  pdf: jsPDF;
  pages: number;
  /** Things that did not make it into the PDF faithfully, in plain words. */
  warnings: string[];
}

/** Elements removed from the export: app chrome and controls. */
const STRIP_SELECTORS = [
  ".no-print",
  ".print\\:hidden",
  "[data-print='hide']",
  "[data-html2canvas-ignore]",
  "[data-pdf-ignore]",
  "button:not(.keep-for-pdf)",
  ".action-bar",
  ".action-bar-no-print",
  ".copilot-trigger",
  ".ai-copilot-widget",
  ".copilot-panel",
  "#copilot-root",
  ".sonner-toaster",
  "[data-radix-portal]",
  "[role='tooltip']",
];

/**
 * Build a PDF from an element. The element itself is not modified.
 *
 * Throws only if the element cannot be found or laid out; problems with
 * individual pieces — an image that will not load — are returned as warnings.
 */
export async function renderDomToPdf(
  target: HTMLElement | string,
  options: DomPdfOptions = {},
): Promise<DomPdfResult> {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) {
    throw new Error(`the element "${typeof target === "string" ? target : "node"}" to export was not found`);
  }

  const {
    size = "a4",
    orientation = "portrait",
    margins = DEFAULT_MARGINS,
    footer = true,
    onProgress,
  } = options;
  const geo = geometry(size, orientation, margins);
  const layoutWidth = options.layoutWidthPx ?? (orientation === "landscape" ? 1123 : 794);

  onProgress?.("Preparing the document…");
  const fontReady = ensureUnicodeFontLoaded();
  const { sandbox, clone } = mountClone(element, layoutWidth);
  const warnings: string[] = [];

  try {
    await waitForImages(clone);
    await document.fonts?.ready?.catch?.(() => undefined);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    onProgress?.("Reading the layout…");
    const origin = clone.getBoundingClientRect();
    const scan = await scanLayout(clone, origin, warnings);
    await fontReady;

    const pdf = new jsPDF({ orientation, unit: "mm", format: size, compress: options.compress ?? true });
    installTextSafety(pdf);
    applyLoadedUnicodeFont(pdf);
    pdf.setProperties({
      title: options.title ?? options.filename?.replace(/\.pdf$/i, "") ?? "Document",
      author: options.author ?? "",
      creator: options.author ?? "",
    });

    const scale = geo.contentWidth / layoutWidth; // mm per CSS px
    const pageHeightPx = geo.contentHeight / scale;

    onProgress?.("Laying out pages…");
    const pages = paginate(scan, pageHeightPx, Math.ceil(origin.height));

    onProgress?.("Drawing…");
    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) pdf.addPage(size, orientation);
      await drawPage(pdf, scan, pages[index], {
        scale,
        left: geo.contentX,
        top: geo.contentY,
        width: geo.contentWidth,
        height: geo.contentHeight,
      }, warnings);
    }

    if (footer) stampFooters(pdf, geo, pages.length, options);

    for (const lost of unsupportedText(pdf)) {
      warnings.push(`"${lost}" contains characters that could not be printed`);
    }

    return { pdf, pages: pages.length, warnings };
  } finally {
    sandbox.remove();
  }
}

/** Build and save. Returns the same result, after the download has started. */
export async function exportDomToPdf(
  target: HTMLElement | string,
  options: DomPdfOptions = {},
): Promise<DomPdfResult> {
  const result = await renderDomToPdf(target, options);
  const name = options.filename ?? "document.pdf";
  result.pdf.save(name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
  options.onProgress?.("Download started");
  return result;
}

// ─── Cloning ─────────────────────────────────────────────────────────────────

/**
 * The light theme's custom properties, read from the stylesheet.
 *
 * Paper is white. An export started in dark mode used to inherit the dark
 * palette through CSS variables and print pale text on dark cards; the old
 * exporter only reset the outermost element.
 */
function lightThemeVariables(): Array<[string, string]> {
  const vars: Array<[string, string]> = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style;
      const selector = (rule as CSSStyleRule).selectorText;
      if (selector && style && /(^|,)\s*:root\s*(,|$)/.test(selector)) {
        for (let i = 0; i < style.length; i += 1) {
          const name = style[i];
          if (name.startsWith("--")) vars.push([name, style.getPropertyValue(name)]);
        }
      }
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested && !(rule as CSSMediaRule).media) visit(nested);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A cross-origin stylesheet (a web font) cannot be read; it holds no
      // theme variables.
    }
  }
  return vars;
}

function mountClone(element: HTMLElement, widthPx: number): { sandbox: HTMLElement; clone: HTMLElement } {
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  Object.assign(sandbox.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${widthPx}px`,
    background: "#ffffff",
    color: "#0f172a",
    zIndex: "-1",
    pointerEvents: "none",
    colorScheme: "light",
  } as Partial<CSSStyleDeclaration>);
  for (const [name, value] of lightThemeVariables()) sandbox.style.setProperty(name, value);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.remove("dark");
  clone.querySelectorAll(".dark").forEach((el) => el.classList.remove("dark"));
  Object.assign(clone.style, {
    width: "100%",
    maxWidth: "100%",
    margin: "0",
    boxShadow: "none",
    transform: "none",
  } as Partial<CSSStyleDeclaration>);

  clone.querySelectorAll(STRIP_SELECTORS.join(", ")).forEach((el) => el.remove());

  // Form fields become their values: a PDF has no inputs, and an input's text
  // is not a text node the layout scan can read.
  const originals = element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select",
  );
  const copies = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input, textarea, select",
  );
  copies.forEach((field, i) => {
    const source = originals[i] ?? field;
    if (field instanceof HTMLInputElement && (field.type === "hidden" || field.type === "file")) {
      field.remove();
      return;
    }
    let value: string;
    if (source instanceof HTMLSelectElement) {
      value = source.selectedOptions[0]?.textContent ?? "";
    } else if (source instanceof HTMLInputElement && (source.type === "checkbox" || source.type === "radio")) {
      value = source.checked ? "☑" : "☐";
    } else {
      value = (source as HTMLInputElement).value || "";
    }
    const span = document.createElement("span");
    span.textContent = value;
    span.className = field.className;
    const computed = getComputedStyle(source);
    Object.assign(span.style, {
      display: field instanceof HTMLTextAreaElement ? "block" : "inline-block",
      whiteSpace: field instanceof HTMLTextAreaElement ? "pre-wrap" : "normal",
      textAlign: computed.textAlign,
      font: computed.font,
      border: "none",
      background: "transparent",
    } as Partial<CSSStyleDeclaration>);
    field.replaceWith(span);
  });

  // Canvas content does not survive cloneNode; copy the pixels across.
  const sourceCanvases = element.querySelectorAll("canvas");
  clone.querySelectorAll("canvas").forEach((canvas, i) => {
    const source = sourceCanvases[i];
    if (!source) return;
    try {
      const img = document.createElement("img");
      img.src = source.toDataURL("image/png");
      img.style.width = `${source.clientWidth || source.width}px`;
      img.style.height = `${source.clientHeight || source.height}px`;
      canvas.replaceWith(img);
    } catch {
      // A tainted canvas cannot be read; it is reported when scanned.
    }
  });

  sandbox.appendChild(clone);
  document.body.appendChild(sandbox);
  return { sandbox, clone };
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 8000);
        }),
    ),
  );
}

// ─── Colour ──────────────────────────────────────────────────────────────────

interface Rgba {
  rgb: Rgb;
  alpha: number;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clamp255(v * 255);
}

function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Parse a computed CSS colour. Returns null for transparent or unknown. */
export function parseCssColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "transparent" || v === "none" || v === "") return null;

  const num = (s: string, percentOf = 1) =>
    s.endsWith("%") ? (parseFloat(s) / 100) * percentOf : parseFloat(s);

  let m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const alpha = parts[3] !== undefined ? num(parts[3]) : 1;
    if (alpha <= 0) return null;
    return { rgb: [clamp255(num(parts[0], 255)), clamp255(num(parts[1], 255)), clamp255(num(parts[2], 255))], alpha };
  }

  m = /^oklch\(([^)]+)\)$/.exec(v);
  if (m) {
    const [L, C, H, A] = m[1].split(/[\s/]+/).filter(Boolean);
    const alpha = A !== undefined ? num(A) : 1;
    if (alpha <= 0) return null;
    const hr = (parseFloat(H) * Math.PI) / 180;
    const c = num(C, 0.4);
    return { rgb: oklabToRgb(num(L, 1), c * Math.cos(hr), c * Math.sin(hr)), alpha };
  }

  m = /^oklab\(([^)]+)\)$/.exec(v);
  if (m) {
    const [L, a, b, A] = m[1].split(/[\s/]+/).filter(Boolean);
    const alpha = A !== undefined ? num(A) : 1;
    if (alpha <= 0) return null;
    return { rgb: oklabToRgb(num(L, 1), num(a, 0.4), num(b, 0.4)), alpha };
  }

  m = /^color\(srgb\s+([^)]+)\)$/.exec(v);
  if (m) {
    const [r, g, b, , A] = m[1].split(/[\s/]+/).filter(Boolean).concat(["", ""]);
    const alpha = A ? num(A) : 1;
    if (alpha <= 0) return null;
    return { rgb: [clamp255(num(r) * 255), clamp255(num(g) * 255), clamp255(num(b) * 255)], alpha };
  }

  m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = hex.split("").map((c) => c + c).join("");
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if (alpha <= 0) return null;
    return { rgb: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)], alpha };
  }

  return null;
}

/** The first colour in a gradient: the closest a flat fill can get to it. */
function gradientFallback(backgroundImage: string): Rgba | null {
  if (!backgroundImage || backgroundImage === "none" || !backgroundImage.includes("gradient")) return null;
  const match = /(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/i.exec(backgroundImage);
  return match ? parseCssColor(match[1]) : null;
}

// ─── Layout scan ─────────────────────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type FontStyle = "normal" | "bold" | "italic" | "bolditalic";

type Item =
  | { kind: "fill"; rect: Rect; color: Rgba; radius: number; clip?: Rect }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: Rgba; width: number; dash: boolean }
  | { kind: "stroke"; rect: Rect; color: Rgba; width: number; radius: number; dash: boolean }
  | {
      kind: "text";
      rect: Rect;
      text: string;
      family: string;
      style: FontStyle;
      sizePx: number;
      color: Rgba;
      /** Justified lines are drawn word by word, so carry each word's x. */
      words?: Array<{ x: number; w: number; text: string }>;
      rtl: boolean;
    }
  | { kind: "image"; rect: Rect; element: HTMLImageElement; fit: string }
  | { kind: "svg"; rect: Rect; element: SVGSVGElement }
  | { kind: "link"; rect: Rect; url: string };

interface TableHead {
  tableTop: number;
  tableBottom: number;
  headTop: number;
  headBottom: number;
  items: Item[];
}

interface Scan {
  items: Item[];
  /** [top, bottom] spans a page must not cut through. */
  unbreakable: Array<[number, number]>;
  /** y positions an element asked to start a new page at. */
  forcedBreaks: number[];
  /** Individual text lines: even a forced cut through a tall element avoids these. */
  lineSpans: Array<[number, number]>;
  heads: TableHead[];
}

function rectOf(r: DOMRect, origin: DOMRect): Rect {
  return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
}

/**
 * The built-in PDF family closest to the element's font. Decided by the first
 * family in the stack — the one the browser actually used — so "Inter,
 * sans-serif" is sans and "Georgia, serif" is serif.
 */
function mapFamily(family: string): string {
  const first = (family.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (/mono|courier|consolas|menlo|monaco/.test(first)) return "courier";
  if (
    first === "serif" ||
    /georgia|times|garamond|playfair|merriweather|lora|cormorant|baskerville|crimson|pt serif|noto serif|dm serif|fraunces/.test(first)
  ) {
    return "times";
  }
  return "helvetica";
}

function mapStyle(weight: string, fontStyle: string): FontStyle {
  const bold = (parseInt(weight, 10) || (weight === "bold" ? 700 : 400)) >= 600;
  const italic = fontStyle === "italic" || fontStyle === "oblique";
  return bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
}

function transformText(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return text;
}

function isHidden(style: CSSStyleDeclaration): boolean {
  return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || parseFloat(style.opacity) === 0;
}

/**
 * The box text is clipped to: the nearest ancestor that hides overflow. A
 * truncated name is laid out in full by the browser and cut by that box;
 * drawing every laid-out word would print the full name across the next column.
 */
function clipBoxFor(node: Node, root: HTMLElement, origin: DOMRect): { rect: Rect; ellipsis: boolean } | null {
  let el = node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      return { rect: rectOf(el.getBoundingClientRect(), origin), ellipsis: style.textOverflow === "ellipsis" };
    }
    if (el === root) break;
    el = el.parentElement;
  }
  return null;
}

async function scanLayout(root: HTMLElement, origin: DOMRect, warnings: string[]): Promise<Scan> {
  const items: Item[] = [];
  const unbreakable: Array<[number, number]> = [];
  const lineSpans: Array<[number, number]> = [];
  const forcedBreaks: number[] = [];
  const heads: TableHead[] = [];

  const keepWhole = (r: Rect) => {
    if (r.h > 0) unbreakable.push([r.y, r.y + r.h]);
  };

  const visitElement = (el: Element, sink: Item[]) => {
    const style = getComputedStyle(el);
    if (isHidden(style)) return;

    const box = el.getBoundingClientRect();
    const rect = rectOf(box, origin);

    // Page-break requests.
    const before = style.getPropertyValue("break-before") || (style as unknown as Record<string, string>).pageBreakBefore;
    if (before === "page" || before === "always" || (el as HTMLElement).dataset?.pageBreak === "before") {
      forcedBreaks.push(rect.y);
    }
    const after = style.getPropertyValue("break-after") || (style as unknown as Record<string, string>).pageBreakAfter;
    if (after === "page" || after === "always" || (el as HTMLElement).dataset?.pageBreak === "after") {
      forcedBreaks.push(rect.y + rect.h);
    }
    const inside = style.getPropertyValue("break-inside") || (style as unknown as Record<string, string>).pageBreakInside;
    if (inside === "avoid" || (el as HTMLElement).dataset?.keepTogether !== undefined) keepWhole(rect);

    const tag = el.tagName.toLowerCase();
    if (tag === "tr" || tag === "li" || tag === "figure" || /^h[1-6]$/.test(tag)) keepWhole(rect);

    if (rect.w > 0 && rect.h > 0) {
      // Background.
      const radius = parseFloat(style.borderTopLeftRadius) || 0;
      const bg = parseCssColor(style.backgroundColor) ?? gradientFallback(style.backgroundImage);
      if (bg) sink.push({ kind: "fill", rect, color: bg, radius });

      // Borders: one uniform rectangle when all four sides match, otherwise
      // each side as its own line.
      const sides = (["Top", "Right", "Bottom", "Left"] as const).map((side) => ({
        side,
        width: parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0,
        color: parseCssColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
        style: style.getPropertyValue(`border-${side.toLowerCase()}-style`),
      }));
      const visible = sides.filter((s) => s.width > 0 && s.color && s.style !== "none" && s.style !== "hidden");
      const uniform =
        visible.length === 4 &&
        visible.every(
          (s) => s.width === visible[0].width && s.color!.rgb.join() === visible[0].color!.rgb.join() && s.style === visible[0].style,
        );
      if (uniform) {
        const w = visible[0].width;
        sink.push({
          kind: "stroke",
          rect: { x: rect.x + w / 2, y: rect.y + w / 2, w: rect.w - w, h: rect.h - w },
          color: visible[0].color!,
          width: w,
          radius,
          dash: visible[0].style === "dashed" || visible[0].style === "dotted",
        });
      } else {
        for (const s of visible) {
          const half = s.width / 2;
          const dash = s.style === "dashed" || s.style === "dotted";
          const line =
            s.side === "Top"
              ? { x1: rect.x, y1: rect.y + half, x2: rect.x + rect.w, y2: rect.y + half }
              : s.side === "Bottom"
                ? { x1: rect.x, y1: rect.y + rect.h - half, x2: rect.x + rect.w, y2: rect.y + rect.h - half }
                : s.side === "Left"
                  ? { x1: rect.x + half, y1: rect.y, x2: rect.x + half, y2: rect.y + rect.h }
                  : { x1: rect.x + rect.w - half, y1: rect.y, x2: rect.x + rect.w - half, y2: rect.y + rect.h };
          sink.push({ kind: "line", ...line, color: s.color!, width: s.width, dash });
        }
      }
    }

    if (tag === "img") {
      const img = el as HTMLImageElement;
      if (rect.w > 0 && rect.h > 0) {
        sink.push({ kind: "image", rect, element: img, fit: style.objectFit || "fill" });
        keepWhole(rect);
      }
      return;
    }
    if (tag === "svg") {
      if (rect.w > 0 && rect.h > 0) {
        sink.push({ kind: "svg", rect, element: el as SVGSVGElement });
        keepWhole(rect);
      }
      return;
    }
    if (tag === "canvas") {
      warnings.push("A chart drawn on a canvas could not be read and was left out");
      return;
    }
    if (tag === "a") {
      const href = (el as HTMLAnchorElement).href;
      if (href && /^(https?:|mailto:|tel:)/i.test(href)) sink.push({ kind: "link", rect, url: href });
    }

    // Table headers repeat on continuation pages: collect the head's items
    // separately as well as drawing them in place.
    if (tag === "thead") {
      const table = el.closest("table");
      if (table) {
        const tRect = rectOf(table.getBoundingClientRect(), origin);
        const headItems: Item[] = [];
        for (const child of Array.from(el.childNodes)) visitNode(child, headItems, style);
        sink.push(...headItems);
        heads.push({
          tableTop: tRect.y,
          tableBottom: tRect.y + tRect.h,
          headTop: rect.y,
          headBottom: rect.y + rect.h,
          items: headItems,
        });
        return;
      }
    }

    for (const child of Array.from(el.childNodes)) visitNode(child, sink, style);
  };

  const visitText = (node: Text, parentStyle: CSSStyleDeclaration, sink: Item[]) => {
    const raw = node.data;
    if (!raw || !raw.trim()) return;
    const color = parseCssColor(parentStyle.color);
    if (!color) return;

    const preserve = /^pre/.test(parentStyle.whiteSpace);
    const sizePx = parseFloat(parentStyle.fontSize) || 12;
    const family = mapFamily(parentStyle.fontFamily);
    const fontStyle = mapStyle(parentStyle.fontWeight, parentStyle.fontStyle);
    const justify = parentStyle.textAlign === "justify";
    const rtl = parentStyle.direction === "rtl";

    // Measure each word where the browser actually put it. Grouping words by
    // line reproduces the browser's wrapping exactly, whatever the font.
    const range = document.createRange();
    const tokens = preserve ? raw.split(/(\n)/) : raw.split(/(\s+)/);
    let offset = 0;
    type Word = { x: number; right: number; top: number; bottom: number; text: string };
    const words: Word[] = [];
    for (const token of tokens) {
      const start = offset;
      offset += token.length;
      if (!token || (!preserve && /^\s+$/.test(token)) || token === "\n") continue;
      range.setStart(node, start);
      range.setEnd(node, start + token.length);
      // A single word can still be split across lines by hyphenation or a
      // very narrow box: take every fragment.
      const fragments = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!fragments.length) continue;
      // A word comes back as several rectangles in two situations: split
      // across lines (hyphenation, a very narrow box), or on one line in
      // pieces (glyph runs, an ellipsis). Only the first is a real split.
      const sameLine = fragments.every((r) => Math.abs(r.top - fragments[0].top) < r.height / 2);
      if (sameLine) {
        words.push({
          x: Math.min(...fragments.map((r) => r.left)) - origin.left,
          right: Math.max(...fragments.map((r) => r.right)) - origin.left,
          top: Math.min(...fragments.map((r) => r.top)) - origin.top,
          bottom: Math.max(...fragments.map((r) => r.bottom)) - origin.top,
          text: transformText(token, parentStyle.textTransform),
        });
        continue;
      }

      // Split across lines: walk the characters and cut where the line changes.
      let pieceStart = start;
      let pieceTop: number | null = null;
      let pieceRects: DOMRect[] = [];
      const flush = (endIndex: number) => {
        if (endIndex <= pieceStart || !pieceRects.length) return;
        words.push({
          x: Math.min(...pieceRects.map((r) => r.left)) - origin.left,
          right: Math.max(...pieceRects.map((r) => r.right)) - origin.left,
          top: Math.min(...pieceRects.map((r) => r.top)) - origin.top,
          bottom: Math.max(...pieceRects.map((r) => r.bottom)) - origin.top,
          text: transformText(node.data.slice(pieceStart, endIndex), parentStyle.textTransform),
        });
      };
      for (let i = start; i < start + token.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = Array.from(range.getClientRects()).find((rc) => rc.width > 0 && rc.height > 0);
        if (!r) continue;
        if (pieceTop !== null && Math.abs(r.top - pieceTop) >= r.height / 2) {
          flush(i);
          pieceStart = i;
          pieceRects = [];
        }
        pieceTop = r.top;
        pieceRects.push(r);
      }
      flush(start + token.length);
    }
    range.detach?.();

    // Drop what the browser clips, and add the ellipsis it shows in its place.
    const clip = clipBoxFor(node, root, origin);
    if (clip) {
      const c = clip.rect;
      const kept = words.filter(
        (w) => w.right <= c.x + c.w + 0.5 && w.x >= c.x - 0.5 && w.top >= c.y - 0.5 && w.bottom <= c.y + c.h + 0.5,
      );
      const clipped = kept.length < words.length;
      words.splice(0, words.length, ...kept);
      if (clipped && clip.ellipsis && words.length) words[words.length - 1].text += "\u2026";
    }

    // Group into lines.
    const lines: Word[][] = [];
    for (const word of words) {
      const line = lines[lines.length - 1];
      const mid = (word.top + word.bottom) / 2;
      if (line && mid > line[0].top && mid < line[0].bottom) line.push(word);
      else lines.push([word]);
    }

    for (const line of lines) {
      const top = Math.min(...line.map((w) => w.top));
      const bottom = Math.max(...line.map((w) => w.bottom));
      const left = Math.min(...line.map((w) => w.x));
      const right = Math.max(...line.map((w) => w.right));
      const rect = { x: left, y: top, w: right - left, h: bottom - top };
      keepWhole(rect);
      lineSpans.push([rect.y, rect.y + rect.h]);
      const ordered = [...line].sort((a, b) => a.x - b.x);
      sink.push({
        kind: "text",
        rect,
        text: (rtl ? [...ordered].reverse() : ordered).map((w) => w.text).join(" "),
        family,
        style: fontStyle,
        sizePx,
        color,
        rtl,
        words: justify ? ordered.map((w) => ({ x: w.x, w: w.right - w.x, text: w.text })) : undefined,
      });
    }
  };

  const visitNode = (node: Node, sink: Item[], parentStyle: CSSStyleDeclaration) => {
    if (node.nodeType === Node.ELEMENT_NODE) visitElement(node as Element, sink);
    else if (node.nodeType === Node.TEXT_NODE) visitText(node as Text, parentStyle, sink);
  };

  visitElement(root, items);
  return { items, unbreakable, forcedBreaks, heads, lineSpans };
}

// ─── Pagination ──────────────────────────────────────────────────────────────

interface Page {
  top: number;
  bottom: number;
  /** A table header to repeat at the top of this page, if it starts mid-table. */
  head: TableHead | null;
}

function paginate(scan: Scan, pageHeight: number, totalHeight: number): Page[] {
  const spans = [...scan.unbreakable].sort((a, b) => a[0] - b[0]);
  const forced = [...new Set(scan.forcedBreaks.map((y) => Math.round(y)))].sort((a, b) => a - b);

  const lines = [...scan.lineSpans].sort((a, b) => a[0] - b[0]);

  /** Move y up until it is not inside any span of `within`. */
  const snapWithin = (within: Array<[number, number]>, y: number, floor: number): number => {
    let current = y;
    for (let guard = 0; guard < 500; guard += 1) {
      const straddled = within.find(([top, bottom]) => top < current - 0.5 && bottom > current + 0.5 && top > floor);
      if (!straddled) return current;
      current = straddled[0];
    }
    return current;
  };
  const snap = (y: number, floor: number) => snapWithin(spans, y, floor);

  const headAt = (y: number): TableHead | null =>
    scan.heads.find((h) => h.headBottom <= y + 0.5 && y < h.tableBottom - 1) ?? null;

  const pages: Page[] = [];
  let top = 0;
  for (let guard = 0; top < totalHeight - 1 && guard < 2000; guard += 1) {
    const head = pages.length ? headAt(top) : null;
    const headHeight = head ? head.headBottom - head.headTop : 0;
    const capacity = Math.max(pageHeight * 0.25, pageHeight - headHeight);
    const ideal = top + capacity;

    const forcedHere = forced.find((y) => y > top + 1 && y <= ideal);
    let bottom: number;
    if (forcedHere !== undefined) {
      bottom = forcedHere;
    } else if (ideal >= totalHeight) {
      bottom = totalHeight;
    } else {
      const snapped = snap(ideal, top);
      // If keeping everything whole would leave the page mostly empty — one
      // element taller than a page — cut at the ideal point instead; that
      // element is the only thing that can be split, and it is clipped cleanly.
      // Even then, never through a line of text.
      bottom = snapped > top + capacity * 0.35 ? snapped : snapWithin(lines, ideal, top + capacity * 0.35);
    }
    pages.push({ top, bottom, head });
    top = bottom;
  }
  return pages.length ? pages : [{ top: 0, bottom: totalHeight, head: null }];
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

interface Frame {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

const MM_PER_PT = 0.352777778;

function setOpacity(pdf: jsPDF, alpha: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = pdf as any;
  if (api.GState && api.setGState) api.setGState(new api.GState({ opacity: alpha, "stroke-opacity": alpha }));
}

const IMAGE_CACHE = new WeakMap<HTMLImageElement, Promise<{ data: string; format: string; width: number; height: number } | null>>();

function imageData(img: HTMLImageElement): Promise<{ data: string; format: string; width: number; height: number } | null> {
  let pending = IMAGE_CACHE.get(img);
  if (pending) return pending;
  pending = (async () => {
    const src = img.currentSrc || img.src;
    if (!src) return null;
    if (src.startsWith("data:image/")) {
      const format = /^data:image\/(png|jpe?g|webp)/i.exec(src)?.[1];
      if (format) {
        return {
          data: src,
          format: format.toLowerCase().startsWith("jp") ? "JPEG" : format.toUpperCase(),
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      }
    }
    // Same-origin or CORS-enabled images can be read through a canvas, which
    // also converts SVG and GIF sources to something the PDF can embed.
    if (img.complete && img.naturalWidth) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        return { data: canvas.toDataURL("image/png"), format: "PNG", width: img.naturalWidth, height: img.naturalHeight };
      } catch {
        // Tainted by a cross-origin source: fall through to a CORS fetch.
      }
    }
    try {
      const loaded = await loadImage(src);
      return { data: loaded.data, format: loaded.format, width: loaded.width, height: loaded.height };
    } catch {
      return null;
    }
  })();
  IMAGE_CACHE.set(img, pending);
  return pending;
}

/**
 * Stretch or narrow a run of text to the width the browser laid it out at.
 *
 * The page was laid out in the app's web font; the PDF draws it in Helvetica,
 * Times or Courier, whose letters are slightly wider or narrower. Left alone, a
 * line would overshoot its column and justified words would run into each other
 * ("acrossevery"). A small horizontal scale puts every run back in the box the
 * browser gave it. Arabic-script runs are left alone: their shaped width is not
 * what the unshaped measurement reports.
 *
 * Always returns a scale, 1 when none is needed. The PDF text-scale setting
 * outlives the text object that set it, so a run drawn without one inherits the
 * previous run's stretch — that is how "keep reading" became "keepreading".
 */
function fitWidth(pdf: jsPDF, text: string, targetMm: number): { horizontalScale: number } {
  if (!text || targetMm <= 0 || needsUnicodeFont(text)) return { horizontalScale: 1 };
  const actual = pdf.getTextWidth(text);
  if (!actual) return { horizontalScale: 1 };
  const ratio = targetMm / actual;
  if (Math.abs(ratio - 1) < 0.01) return { horizontalScale: 1 };
  return { horizontalScale: Math.min(1.25, Math.max(0.75, ratio)) };
}

async function drawItem(
  pdf: jsPDF,
  item: Item,
  map: (x: number, y: number) => [number, number],
  scale: number,
  warnings: string[],
) {
  switch (item.kind) {
    case "fill": {
      const [x, y] = map(item.rect.x, item.rect.y);
      const w = item.rect.w * scale;
      const h = item.rect.h * scale;
      if (item.color.alpha < 1) setOpacity(pdf, item.color.alpha);
      pdf.setFillColor(...item.color.rgb);
      const r = Math.min(item.radius * scale, w / 2, h / 2);
      if (r > 0.2) pdf.roundedRect(x, y, w, h, r, r, "F");
      else pdf.rect(x, y, w, h, "F");
      if (item.color.alpha < 1) setOpacity(pdf, 1);
      return;
    }
    case "stroke": {
      const [x, y] = map(item.rect.x, item.rect.y);
      const w = item.rect.w * scale;
      const h = item.rect.h * scale;
      pdf.setDrawColor(...item.color.rgb);
      pdf.setLineWidth(Math.max(0.1, item.width * scale));
      if (item.dash) pdf.setLineDashPattern([1, 1], 0);
      const r = Math.min(item.radius * scale, w / 2, h / 2);
      if (r > 0.2) pdf.roundedRect(x, y, w, h, r, r, "S");
      else pdf.rect(x, y, w, h, "S");
      if (item.dash) pdf.setLineDashPattern([], 0);
      return;
    }
    case "line": {
      const [x1, y1] = map(item.x1, item.y1);
      const [x2, y2] = map(item.x2, item.y2);
      pdf.setDrawColor(...item.color.rgb);
      pdf.setLineWidth(Math.max(0.1, item.width * scale));
      if (item.dash) pdf.setLineDashPattern([1, 1], 0);
      pdf.line(x1, y1, x2, y2);
      if (item.dash) pdf.setLineDashPattern([], 0);
      return;
    }
    case "text": {
      const sizePt = (item.sizePx * scale) / MM_PER_PT;
      pdf.setFont(item.family, item.style);
      pdf.setFontSize(sizePt);
      pdf.setTextColor(...item.color.rgb);
      if (item.color.alpha < 1) setOpacity(pdf, item.color.alpha);
      const [, midY] = map(0, item.rect.y + item.rect.h / 2);
      if (item.words) {
        for (const word of item.words) {
          const [wx] = map(word.x, 0);
          pdf.text(word.text, wx, midY, { baseline: "middle", ...fitWidth(pdf, word.text, word.w * scale) });
        }
      } else if (item.rtl) {
        const [rx] = map(item.rect.x + item.rect.w, 0);
        pdf.text(item.text, rx, midY, { baseline: "middle", align: "right", horizontalScale: 1 });
      } else {
        const [lx] = map(item.rect.x, 0);
        pdf.text(item.text, lx, midY, { baseline: "middle", ...fitWidth(pdf, item.text, item.rect.w * scale) });
      }
      if (item.color.alpha < 1) setOpacity(pdf, 1);
      return;
    }
    case "image": {
      const data = await imageData(item.element);
      if (!data) {
        warnings.push(`An image (${item.element.alt || item.element.src.slice(0, 60)}) could not be loaded and was left out`);
        return;
      }
      const [x, y] = map(item.rect.x, item.rect.y);
      const boxW = item.rect.w * scale;
      const boxH = item.rect.h * scale;
      let w = boxW;
      let h = boxH;
      if (item.fit === "contain" || item.fit === "scale-down") {
        ({ width: w, height: h } = fit({ width: data.width, height: data.height }, { width: boxW, height: boxH }));
      }
      try {
        pdf.addImage(data.data, data.format, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h, undefined, "FAST");
      } catch {
        warnings.push("An image could not be decoded and was left out");
      }
      return;
    }
    case "svg": {
      const [x, y] = map(item.rect.x, item.rect.y);
      try {
        const { svg2pdf } = await import("svg2pdf.js");
        await svg2pdf(item.element, pdf, { x, y, width: item.rect.w * scale, height: item.rect.h * scale });
      } catch {
        warnings.push("A chart could not be converted and was left out");
      }
      return;
    }
    case "link": {
      const [x, y] = map(item.rect.x, item.rect.y);
      pdf.link(x, y, item.rect.w * scale, item.rect.h * scale, { url: item.url });
      return;
    }
  }
}

function itemBounds(item: Item): [number, number] {
  if (item.kind === "line") return [Math.min(item.y1, item.y2), Math.max(item.y1, item.y2)];
  return [item.rect.y, item.rect.y + item.rect.h];
}

async function drawPage(pdf: jsPDF, scan: Scan, page: Page, frame: Frame, warnings: string[]) {
  const headHeight = page.head ? page.head.headBottom - page.head.headTop : 0;

  // Clip to the printable area so a cut element never spills into the margin.
  pdf.saveGraphicsState();
  pdf.rect(frame.left, frame.top, frame.width, frame.height, null as unknown as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).clip();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).discardPath();

  const map = (x: number, y: number): [number, number] => [
    frame.left + x * frame.scale,
    frame.top + (y - page.top + headHeight) * frame.scale,
  ];

  for (const item of scan.items) {
    const [top, bottom] = itemBounds(item);
    if (bottom <= page.top + 0.01 || top >= page.bottom - 0.01) continue;
    // A line of text belongs to exactly one page — the one holding its middle
    // — and is drawn there whole, never half here and half there.
    if (item.kind === "text") {
      const middle = (top + bottom) / 2;
      if (middle < page.top || middle >= page.bottom) continue;
    }
    await drawItem(pdf, item, map, frame.scale, warnings);
  }

  // The repeated header goes on last. Drawn first, a background that spans
  // the whole document — the card the table sits in — painted over it.
  if (page.head) {
    const headMap = (x: number, y: number): [number, number] => [
      frame.left + x * frame.scale,
      frame.top + (y - page.head!.headTop) * frame.scale,
    ];
    for (const item of page.head.items) await drawItem(pdf, item, headMap, frame.scale, warnings);
  }

  pdf.restoreGraphicsState();
}

function stampFooters(pdf: jsPDF, geo: ReturnType<typeof geometry>, total: number, options: DomPdfOptions) {
  const stamped = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const left = [options.author, options.title].filter(Boolean).join("  ·  ");
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.2);
    pdf.line(geo.contentX, geo.footerY - 3, geo.contentX + geo.contentWidth, geo.footerY - 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    // Scale reset explicitly: the footer is appended after the page's body,
    // whose last run may have left a stretch in force.
    if (left) {
      pdf.text(pdf.splitTextToSize(left, geo.contentWidth * 0.6)[0] as string, geo.contentX, geo.footerY, {
        horizontalScale: 1,
      });
    }
    pdf.text(`Page ${page} of ${total}`, geo.contentX + geo.contentWidth, geo.footerY, {
      align: "right",
      horizontalScale: 1,
    });
    pdf.setTextColor(148, 163, 184);
    pdf.text(options.footerNote ?? `Generated ${stamped}`, geo.contentX + geo.contentWidth / 2, geo.footerY + 3.6, {
      align: "center",
      horizontalScale: 1,
    });
  }
}
