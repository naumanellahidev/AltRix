/**
 * Turning values into the strings a document prints.
 *
 * The rule that governs all of it: absent is not zero. A subject with no mark
 * recorded is not a subject the student scored 0 in, an invoice with no payment
 * recorded is not an invoice paid in full, and a missing date is not today.
 * Every formatter here renders absence as an em dash and never invents a value
 * to fill a cell.
 *
 * Money arrives from the API as a string, because the backend stores it as
 * NUMERIC and serialises it exactly. Parsing it into a JavaScript number to
 * format it would undo that — 1650.10 three times over is 4950.299999999999 —
 * so amounts are formatted from the decimal string directly.
 */

/** What a document prints where there is no value. */
export const ABSENT = "—";

export type Numeric = string | number | null | undefined;

function isAbsent(value: Numeric): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  return false;
}

/**
 * Split a decimal string into sign, integer and fraction without going through
 * a float. Returns null if the input is not a number.
 */
function decimalParts(value: Numeric): { sign: string; whole: string; fraction: string } | null {
  if (isAbsent(value)) return null;
  const raw = String(value).trim().replace(/,/g, "");
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match || (!match[2] && !match[3])) return null;
  return {
    sign: match[1] === "-" ? "-" : "",
    whole: match[2] || "0",
    fraction: match[3] || "",
  };
}

function groupThousands(whole: string, separator: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Round a decimal string to `places`, half away from zero, as a till does. */
export function roundDecimalString(value: Numeric, places: number): string | null {
  const parts = decimalParts(value);
  if (!parts) return null;
  if (parts.fraction.length <= places) {
    return `${parts.sign}${parts.whole}.${parts.fraction.padEnd(places, "0")}`;
  }

  const keep = parts.fraction.slice(0, places);
  const nextDigit = Number(parts.fraction[places]);
  let digits = `${parts.whole}${keep}`;
  if (nextDigit >= 5) {
    // Increment the digit string by one, carrying by hand so no float is
    // involved at any point.
    const carried = digits.split("");
    let i = carried.length - 1;
    while (i >= 0) {
      if (carried[i] === "9") {
        carried[i] = "0";
        i -= 1;
      } else {
        carried[i] = String(Number(carried[i]) + 1);
        break;
      }
    }
    digits = (i < 0 ? "1" : "") + carried.join("");
  }

  const whole = places === 0 ? digits : digits.slice(0, digits.length - places) || "0";
  const fraction = places === 0 ? "" : digits.slice(digits.length - places);
  return `${parts.sign}${whole}${places ? `.${fraction}` : ""}`;
}

export interface MoneyOptions {
  /** "PKR", "Rs.", "£". Omitted entirely when not given. */
  currency?: string | null;
  /** Default 2 — the scale money is stored at. */
  places?: number;
  separator?: string;
  /** What to print when the amount is absent. Default ABSENT. */
  absent?: string;
  /** Show a plus sign on positive values, for a statement of adjustments. */
  signed?: boolean;
}

/** Format an amount for print, from its exact decimal string. */
export function money(value: Numeric, options: MoneyOptions = {}): string {
  const { currency = null, places = 2, separator = ",", absent = ABSENT, signed = false } = options;

  const rounded = roundDecimalString(value, places);
  if (rounded === null) return absent;

  const negative = rounded.startsWith("-");
  const bare = negative ? rounded.slice(1) : rounded;
  const [whole, fraction] = bare.split(".");

  const grouped = groupThousands(whole, separator);
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  const sign = negative ? "-" : signed ? "+" : "";
  return currency ? `${sign}${currency} ${body}` : `${sign}${body}`;
}

/** Marks, stored at three decimal places but printed without empty zeros. */
export function marks(value: Numeric, options: { places?: number; absent?: string } = {}): string {
  const { places = 2, absent = ABSENT } = options;
  const rounded = roundDecimalString(value, places);
  if (rounded === null) return absent;
  // 85.000 prints as 85; 85.500 as 85.5.
  return rounded.replace(/\.?0+$/, "") || "0";
}

/** A percentage. Absent stays absent — it is not 0%. */
export function percent(value: Numeric, options: { places?: number; absent?: string } = {}): string {
  const { places = 1, absent = ABSENT } = options;
  const rounded = roundDecimalString(value, places);
  if (rounded === null) return absent;
  return `${rounded.replace(/\.?0+$/, "") || "0"}%`;
}

/**
 * A ratio as "38 / 50". Either side missing makes the whole thing absent,
 * because "38 / —" invites the reader to guess the denominator.
 */
export function outOf(obtained: Numeric, total: Numeric, absent = ABSENT): string {
  if (isAbsent(obtained) || isAbsent(total)) return absent;
  return `${marks(obtained)} / ${marks(total)}`;
}

export type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // A bare "2026-09-10" is a calendar date. new Date() reads it as midnight
  // UTC, which west of Greenwich is the evening before — an exam printed a
  // day early. Build it as a local date instead.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A date for a document: "12 Mar 2026". */
export function date(value: DateInput, locale = "en-GB", absent = ABSENT): string {
  const parsed = toDate(value);
  if (!parsed) return absent;
  return parsed.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

/** A date and time, for a footer or an audit line. */
export function dateTime(value: DateInput, locale = "en-GB", absent = ABSENT): string {
  const parsed = toDate(value);
  if (!parsed) return absent;
  return parsed.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A plain string, trimmed, with absence made explicit. */
export function text(value: string | null | undefined, absent = ABSENT): string {
  const trimmed = value == null ? "" : String(value).trim();
  return trimmed === "" ? absent : trimmed;
}

/** Join name parts, skipping the missing ones without leaving double spaces. */
export function name(...parts: Array<string | null | undefined>): string {
  const joined = parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" ");
  return joined || ABSENT;
}

/** A filename-safe slug. */
export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/**
 * A file name built from what the file is about.
 *
 * "Ayesha Khan - Report Card - Term 2 2026.pdf" rather than
 * "report-2026-09-19-10-22-11.pdf": the person who downloads it, and whoever
 * it is forwarded to on WhatsApp, can tell what it is without opening it.
 *
 * Parts that are empty are skipped. Characters Windows and Android refuse in a
 * file name are removed; every script is kept, so an Urdu name stays Urdu.
 */
export function documentFileName(parts: Array<string | null | undefined>, extension: string): string {
  const clean = parts
    .map((p) =>
      String(p ?? "")
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const base = (clean.join(" - ") || "Document").slice(0, 150).replace(/[ .]+$/, "");
  const ext = extension.replace(/^\./, "");
  return `${base}.${ext}`;
}

/** Today as "19 Sep 2026", for file names and subtitles. */
export function todayLabel(locale = "en-GB"): string {
  return new Date().toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
