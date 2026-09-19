/**
 * What the PDF's type can actually draw.
 *
 * The fourteen fonts built into every PDF reader — Helvetica, Times, Courier and
 * their variants — cover the WinAnsi character set: Latin letters, digits,
 * common punctuation and a handful of symbols. Hand them anything else and the
 * reader draws a wrong glyph or an empty box. That is what happened to
 * "Merit ≥90% → 5%" on fee vouchers, and it is what happens to a student's
 * name written in Urdu — in a product whose users are in Pakistan.
 *
 * This module fixes it for every generator at once, by wrapping the drawing
 * calls on the document itself:
 *
 *  - Text the built-in fonts can draw is drawn as before.
 *  - Symbols with a faithful plain equivalent are rewritten (≥ to >=, → to ->).
 *  - Text in another script — Urdu above all — is drawn in Noto Naskh Arabic,
 *    which the app ships, joined and ordered right-to-left by the PDF engine.
 *  - If that font cannot be loaded, the text that could not be drawn is
 *    recorded so the caller can report it, instead of shipping boxes.
 */
import type jsPDF from "jspdf";

/** Symbols the built-in fonts lack, and what to print instead. */
const REPLACEMENTS: Record<string, string> = {
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "↑": "^",
  "↓": "v",
  "✓": "(yes)",
  "✔": "(yes)",
  "✗": "(no)",
  "✘": "(no)",
  "★": "*",
  "☆": "*",
  "●": "\u2022",
  "○": "o",
  "▪": "\u2022",
  "■": "\u2022",
  "□": "[ ]",
  "₨": "Rs.",
  "₹": "Rs.",
  "\u2212": "-",
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2015": "\u2014",
  "\u2032": "'",
  "\u2033": '"',
  "\u00a0": " ",
  "\u200b": "",
  "\u200c": "",
  "\u200d": "",
  "\ufeff": "",
};

/** Characters beyond Latin-1 that WinAnsi still includes. */
const WIN_ANSI_EXTRA = new Set(
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d" +
    "\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178",
);

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code === 0x0a || code === 0x09 || code === 0x0d) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_EXTRA.has(char);
}

/** True if a string contains characters the built-in fonts cannot draw. */
export function needsUnicodeFont(text: string): boolean {
  for (const char of text) {
    if (!isWinAnsi(char) && !(char in REPLACEMENTS)) return true;
  }
  return false;
}

const STRONG_RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const STRONG_LTR = /[A-Za-z\u00C0-\u024F]/;

/**
 * Whether a line reads right to left: its first letter is Urdu, Arabic or
 * Hebrew. Digits and punctuation carry no direction and are skipped.
 */
export function isRightToLeft(text: string): boolean {
  for (const char of text) {
    if (STRONG_RTL.test(char)) return true;
    if (STRONG_LTR.test(char)) return false;
  }
  return false;
}

/** True for Arabic-script text: Urdu, Arabic, Persian, Sindhi, Pashto. */
export function isArabicScript(text: string): boolean {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(text);
}

/**
 * Make a string drawable in a built-in font.
 *
 * Symbols with a faithful equivalent are replaced. Anything else is replaced
 * with "?" and reported through `onUnsupported`.
 */
export function toWinAnsi(text: string, onUnsupported?: (text: string) => void): string {
  let out = "";
  let lost = false;
  for (const char of text) {
    if (isWinAnsi(char)) out += char;
    else if (char in REPLACEMENTS) out += REPLACEMENTS[char];
    else {
      out += "?";
      lost = true;
    }
  }
  if (lost) onUnsupported?.(text);
  return out;
}

// ─── Per-document state ──────────────────────────────────────────────────────

interface FontState {
  /** Registered Unicode font family, or null if none is available. */
  unicodeFont: string | null;
  hasBold: boolean;
  /** Text that had to be degraded, for the generation's warnings. */
  unsupported: Set<string>;
}

const STATE = new WeakMap<jsPDF, FontState>();

function stateOf(pdf: jsPDF): FontState {
  let state = STATE.get(pdf);
  if (!state) {
    state = { unicodeFont: null, hasBold: false, unsupported: new Set() };
    STATE.set(pdf, state);
  }
  return state;
}

function joined(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(" ");
  return "";
}

/**
 * Route every text call on this document through the character check.
 *
 * Installed once per document, so the document class, the table renderer and a
 * bespoke generator calling jsPDF directly all get the same behaviour without
 * each having to remember.
 */
export function installTextSafety(pdf: jsPDF): void {
  const marker = pdf as unknown as { __altrixTextSafety?: boolean };
  if (marker.__altrixTextSafety) return;
  marker.__altrixTextSafety = true;
  const state = stateOf(pdf);

  /**
   * Run `draw` with the Unicode font selected if the text needs it and one is
   * registered, otherwise with the text rewritten for the built-in fonts.
   */
  const withRightFont = <T>(value: unknown, draw: (v: unknown) => T): T => {
    const text = joined(value);
    const needs = text !== "" && needsUnicodeFont(text);

    if (needs && state.unicodeFont) {
      const current = pdf.getFont();
      const size = pdf.getFontSize();
      const bold = /bold/i.test(current.fontStyle ?? "");
      pdf.setFont(state.unicodeFont, bold && state.hasBold ? "bold" : "normal");
      pdf.setFontSize(size);
      try {
        return draw(value);
      } finally {
        pdf.setFont(current.fontName, current.fontStyle);
        pdf.setFontSize(size);
      }
    }

    const clean = (v: unknown): unknown => {
      if (typeof v === "string") return toWinAnsi(v, (lost) => state.unsupported.add(lost));
      if (Array.isArray(v)) return v.map(clean);
      return v;
    };
    return draw(clean(value));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = pdf as any;

  const text = api.text.bind(pdf);
  api.text = (value: unknown, ...rest: unknown[]) => withRightFont(value, (v) => text(v, ...rest));

  // Measurement must use the same font as drawing, or a wrapped Urdu name
  // breaks its lines in the wrong places.
  const split = api.splitTextToSize.bind(pdf);
  api.splitTextToSize = (value: string, maxWidth: number, options?: unknown) =>
    withRightFont(value, (v) => split(v, maxWidth, options));

  const width = api.getTextWidth.bind(pdf);
  api.getTextWidth = (value: string) => withRightFont(value, (v) => width(v));
}

/** Text that could not be drawn faithfully in this document. */
export function unsupportedText(pdf: jsPDF): string[] {
  return [...(STATE.get(pdf)?.unsupported ?? [])];
}

// ─── Unicode fonts ───────────────────────────────────────────────────────────

export interface UnicodeFontSource {
  /** Family name to register the font under. */
  name: string;
  /** TrueType (.ttf). WOFF and WOFF2 will not load. */
  regularUrl: string;
  boldUrl?: string;
}

/**
 * The font the app ships for Urdu and other scripts.
 *
 * Served from the app's own origin (public/fonts), never a CDN, so documents
 * render the same offline and on a school's own network.
 */
export const DEFAULT_UNICODE_FONT: UnicodeFontSource = {
  name: "NotoNaskhArabic",
  regularUrl: "/fonts/NotoNaskhArabic-Regular.ttf",
  boldUrl: "/fonts/NotoNaskhArabic-Bold.ttf",
};

const FONT_CACHE = new Map<string, Promise<string>>();
/** Font data that has finished loading, for synchronous registration. */
const LOADED = new Map<string, string>();

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked: spreading a 200KB array into fromCharCode overflows the stack.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fetchFont(url: string): Promise<string> {
  let pending = FONT_CACHE.get(url);
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      const data = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
      LOADED.set(url, data);
      return data;
    });
    FONT_CACHE.set(url, pending);
    // A failed fetch must not be cached, or one network blip disables Urdu
    // for the rest of the session.
    pending.catch(() => FONT_CACHE.delete(url));
  }
  return pending;
}

/**
 * Register already-loaded font data on a document. Synchronous, for callers
 * that have the bytes — tests, a server-side renderer, a preloaded cache.
 */
export function registerUnicodeFontData(
  pdf: jsPDF,
  name: string,
  regularBase64: string,
  boldBase64?: string | null,
): void {
  installTextSafety(pdf);
  const state = stateOf(pdf);

  pdf.addFileToVFS(`${name}-Regular.ttf`, regularBase64);
  pdf.addFont(`${name}-Regular.ttf`, name, "normal");

  if (boldBase64) {
    pdf.addFileToVFS(`${name}-Bold.ttf`, boldBase64);
    pdf.addFont(`${name}-Bold.ttf`, name, "bold");
    state.hasBold = true;
  }
  state.unicodeFont = name;
}

/**
 * Load and register the Unicode font on a document.
 *
 * Resolves true once it is usable. Resolves false — never throws — if it could
 * not be loaded; the document then falls back to the built-in fonts and any
 * text they cannot draw is reported by {@link unsupportedText}.
 */
export async function useUnicodeFont(
  pdf: jsPDF,
  source: UnicodeFontSource = DEFAULT_UNICODE_FONT,
): Promise<boolean> {
  installTextSafety(pdf);
  try {
    const [regular, bold] = await Promise.all([
      fetchFont(source.regularUrl),
      source.boldUrl ? fetchFont(source.boldUrl).catch(() => null) : Promise.resolve(null),
    ]);
    registerUnicodeFontData(pdf, source.name, regular, bold);
    return true;
  } catch {
    return false;
  }
}

/** Start loading the font early — when a document screen opens, say. */
export function preloadUnicodeFont(source: UnicodeFontSource = DEFAULT_UNICODE_FONT): void {
  fetchFont(source.regularUrl).catch(() => undefined);
  if (source.boldUrl) fetchFont(source.boldUrl).catch(() => undefined);
}

/** The Unicode font registered on this document, if any. */
export function unicodeFontOf(pdf: jsPDF): string | null {
  return STATE.get(pdf)?.unicodeFont ?? null;
}

/**
 * Load the font if it is not loaded yet. Resolves true when it is available.
 *
 * Awaited once before a synchronous generator runs; after that every document
 * can register it with {@link applyLoadedUnicodeFont} without waiting.
 */
export async function ensureUnicodeFontLoaded(source: UnicodeFontSource = DEFAULT_UNICODE_FONT): Promise<boolean> {
  try {
    await Promise.all([
      fetchFont(source.regularUrl),
      source.boldUrl ? fetchFont(source.boldUrl).catch(() => null) : Promise.resolve(null),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the Unicode font on a document if it has already been loaded.
 * Synchronous; returns false when it has not been loaded yet.
 */
export function applyLoadedUnicodeFont(pdf: jsPDF, source: UnicodeFontSource = DEFAULT_UNICODE_FONT): boolean {
  installTextSafety(pdf);
  const regular = LOADED.get(source.regularUrl);
  if (!regular) return false;
  const bold = source.boldUrl ? LOADED.get(source.boldUrl) ?? null : null;
  registerUnicodeFontData(pdf, source.name, regular, bold);
  return true;
}

/** Seed the loaded-font cache directly — used by tests and server rendering. */
export function seedUnicodeFont(
  regularBase64: string,
  boldBase64?: string | null,
  source: UnicodeFontSource = DEFAULT_UNICODE_FONT,
): void {
  LOADED.set(source.regularUrl, regularBase64);
  FONT_CACHE.set(source.regularUrl, Promise.resolve(regularBase64));
  if (boldBase64 && source.boldUrl) {
    LOADED.set(source.boldUrl, boldBase64);
    FONT_CACHE.set(source.boldUrl, Promise.resolve(boldBase64));
  }
}
