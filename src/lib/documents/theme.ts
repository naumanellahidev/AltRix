/**
 * How a document looks.
 *
 * Fifteen generators each invented their own header, their own greys and their
 * own idea of how big a heading should be, so nothing a school printed looked
 * like anything else it printed. This is the single answer to those questions.
 *
 * The school's own accent colour is the only thing that varies between tenants.
 * Everything else — the type scale, the rules, the greys — stays fixed, because
 * a document set is recognisable by its consistency and not by its colours.
 */

export type Rgb = [number, number, number];

export interface DocumentTheme {
  /** The school's colour, used for rules, headings and table headers. */
  accent: Rgb;
  /** A wash of the accent, for zebra striping and header fills. */
  accentWash: Rgb;
  ink: Rgb;
  inkMuted: Rgb;
  inkFaint: Rgb;
  rule: Rgb;
  ruleFaint: Rgb;
  paper: Rgb;
  /** Reserved for amounts owed, overdue notices and failure marks. */
  danger: Rgb;
  positive: Rgb;
  /** Serif for headings, sans for data. */
  headingFont: string;
  bodyFont: string;
  /** Type scale, in points. */
  size: {
    docTitle: number;
    sectionTitle: number;
    heading: number;
    body: number;
    small: number;
    caption: number;
  };
}

const INK: Rgb = [17, 24, 39];
const INK_MUTED: Rgb = [71, 85, 105];
const INK_FAINT: Rgb = [148, 163, 184];

export const DEFAULT_THEME: DocumentTheme = {
  accent: [15, 76, 129],
  accentWash: [237, 243, 248],
  ink: INK,
  inkMuted: INK_MUTED,
  inkFaint: INK_FAINT,
  rule: [203, 213, 225],
  ruleFaint: [229, 231, 235],
  paper: [255, 255, 255],
  danger: [153, 27, 27],
  positive: [22, 101, 52],
  headingFont: "times",
  bodyFont: "helvetica",
  size: {
    docTitle: 19,
    sectionTitle: 12,
    heading: 10.5,
    body: 9.5,
    small: 8.5,
    caption: 7.5,
  },
};

/** Convert an HSL triple — how the app stores branding — to RGB. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Parse `#1f2937`, `rgb(31, 41, 55)` or `210 90% 40%`. Returns null if it cannot. */
export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const raw = value.trim();

  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(raw);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  // The app stores branding as bare HSL components, the shape a CSS variable
  // takes: "210 90% 40%".
  const hsl = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(raw);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));

  return null;
}

/** Mix a colour towards white. `amount` 0 leaves it, 1 makes it white. */
export function tint(color: Rgb, amount: number): Rgb {
  const a = Math.min(1, Math.max(0, amount));
  return [
    Math.round(color[0] + (255 - color[0]) * a),
    Math.round(color[1] + (255 - color[1]) * a),
    Math.round(color[2] + (255 - color[2]) * a),
  ];
}

/**
 * Black or white, whichever stays readable on the given background.
 *
 * A school whose brand colour is pale yellow was printing white text on it.
 */
export function readableOn(background: Rgb): Rgb {
  const [r, g, b] = background.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? [17, 24, 39] : [255, 255, 255];
}

/** Build a theme from whatever branding the school has set. */
export function themeFor(accent?: string | null, overrides: Partial<DocumentTheme> = {}): DocumentTheme {
  const parsed = parseColor(accent);
  const base = parsed ?? DEFAULT_THEME.accent;
  return {
    ...DEFAULT_THEME,
    accent: base,
    accentWash: tint(base, 0.92),
    ...overrides,
  };
}

/**
 * The type scale, tightened by a factor.
 *
 * A report card has to come out on one sheet. When a long subject list will
 * not fit, the builder retries at a smaller density rather than dropping a
 * subject — a mark that is not printed is a mark the family never sees. The
 * floor is held by the caller; below roughly 0.7 a printed page stops being
 * comfortably readable.
 */
export function scaledSizes(factor: number, base: DocumentTheme["size"] = DEFAULT_THEME.size): DocumentTheme["size"] {
  const round = (v: number) => Math.round(v * factor * 10) / 10;
  return {
    docTitle: round(base.docTitle),
    sectionTitle: round(base.sectionTitle),
    heading: round(base.heading),
    body: round(base.body),
    small: round(base.small),
    caption: round(base.caption),
  };
}
