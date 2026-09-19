/**
 * Exact money arithmetic in the browser.
 *
 * The backend stores money as NUMERIC and does its sums in Decimal. The
 * frontend was redoing those sums with JavaScript numbers — `Number(amount)`,
 * `subtotal * pct / 100`, `Math.round(x) / 100` — which are binary floats. Three
 * instalments of 1650.10 add up to 4950.299999999999 in a float, and a voucher
 * preview that rounds that differently from the server shows a parent one total
 * and the bank another.
 *
 * Everything here works in integer minor units (paisa, cents) held as BigInt,
 * so every addition is exact and rounding happens once, deliberately, half away
 * from zero — the rule a till uses and the rule the database's ROUND() uses.
 */
import { type Numeric, roundDecimalString } from "./format";

/** Minor units per major unit at the default scale of two places. */
const SCALE = 2;

/** Parse an amount into integer minor units. Absent or invalid → null. */
export function toMinor(value: Numeric, places = SCALE): bigint | null {
  const rounded = roundDecimalString(value, places);
  if (rounded === null) return null;
  const negative = rounded.startsWith("-");
  const [whole, fraction = ""] = (negative ? rounded.slice(1) : rounded).split(".");
  const digits = `${whole}${fraction.padEnd(places, "0")}`.replace(/^0+(?=\d)/, "");
  const minor = BigInt(digits || "0");
  return negative ? -minor : minor;
}

/** Back to a decimal string at the given scale, suitable for money(). */
export function fromMinor(minor: bigint, places = SCALE): string {
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(places + 1, "0");
  const whole = abs.slice(0, abs.length - places);
  const fraction = abs.slice(abs.length - places);
  return `${negative ? "-" : ""}${whole}${places ? `.${fraction}` : ""}`;
}

/** Sum amounts exactly. Absent values count as nothing, not as an error. */
export function sum(values: Numeric[], places = SCALE): string {
  let total = 0n;
  for (const value of values) {
    const minor = toMinor(value, places);
    if (minor !== null) total += minor;
  }
  return fromMinor(total, places);
}

/** a - b, exactly. */
export function subtract(a: Numeric, b: Numeric, places = SCALE): string {
  return fromMinor((toMinor(a, places) ?? 0n) - (toMinor(b, places) ?? 0n), places);
}

/** The larger of an amount and zero — a total can be reduced to nothing, not below. */
export function atLeastZero(value: Numeric, places = SCALE): string {
  const minor = toMinor(value, places) ?? 0n;
  return fromMinor(minor < 0n ? 0n : minor, places);
}

/**
 * `pct` percent of `amount`, rounded half away from zero to the money scale.
 *
 * Mirrors ROUND(amount * pct / 100.0, 2) in the voucher RPC, so a preview and
 * the invoice the server then creates agree to the paisa.
 */
export function percentOf(amount: Numeric, pct: Numeric, places = SCALE): string {
  const base = toMinor(amount, places);
  // Percentages carry up to four decimal places (12.5%, 33.3333%).
  const rate = toMinor(pct, 4);
  if (base === null || rate === null) return fromMinor(0n, places);

  // base (minor units) * rate (1e-4 of a percent) / (100 * 1e4)
  const numerator = base * rate;
  const denominator = 1_000_000n;
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  let quotient = abs / denominator;
  if ((abs % denominator) * 2n >= denominator) quotient += 1n;
  return fromMinor(negative ? -quotient : quotient, places);
}

export function isZero(value: Numeric, places = SCALE): boolean {
  return (toMinor(value, places) ?? 0n) === 0n;
}

export function isPositive(value: Numeric, places = SCALE): boolean {
  return (toMinor(value, places) ?? 0n) > 0n;
}

export function compare(a: Numeric, b: Numeric, places = SCALE): -1 | 0 | 1 {
  const x = toMinor(a, places) ?? 0n;
  const y = toMinor(b, places) ?? 0n;
  return x < y ? -1 : x > y ? 1 : 0;
}

// ─── Amount in words ─────────────────────────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens}-${ones}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Whole-number words in the lakh/crore system used on Pakistani vouchers. */
function southAsianWords(value: bigint): string {
  if (value === 0n) return "Zero";
  const groups: Array<[bigint, string]> = [
    [10_000_000n, "Crore"],
    [100_000n, "Lakh"],
    [1_000n, "Thousand"],
  ];
  const parts: string[] = [];
  let rest = value;
  for (const [unit, label] of groups) {
    if (rest >= unit) {
      const count = rest / unit;
      rest %= unit;
      // Beyond 99 crore the count itself needs words — recurse.
      parts.push(`${count >= 100n ? southAsianWords(count) : belowHundred(Number(count))} ${label}`);
    }
  }
  if (rest) parts.push(belowThousand(Number(rest)));
  return parts.join(" ");
}

/** Whole-number words in the international thousand/million/billion system. */
function internationalWords(value: bigint): string {
  if (value === 0n) return "Zero";
  const labels = ["", "Thousand", "Million", "Billion", "Trillion", "Quadrillion"];
  const parts: string[] = [];
  let rest = value;
  let index = 0;
  while (rest > 0n && index < labels.length) {
    const chunk = Number(rest % 1000n);
    if (chunk) parts.unshift(`${belowThousand(chunk)}${labels[index] ? ` ${labels[index]}` : ""}`);
    rest /= 1000n;
    index += 1;
  }
  return parts.join(" ");
}

export interface AmountInWordsOptions {
  /** "Rupees" — printed before the whole part. */
  major?: string;
  /** "Paisa" — printed before the fraction. Omitted when the fraction is zero. */
  minor?: string;
  /** lakh/crore (Pakistan, India) or thousand/million. */
  system?: "south-asian" | "international";
}

/**
 * "Rupees Four Thousand Nine Hundred Fifty and Thirty Paisa Only".
 *
 * Printed on vouchers and receipts because a written amount is much harder to
 * alter than a figure, which is exactly why banks ask for it on a cheque.
 * Absent amounts return an empty string rather than "Zero": an unwritten line
 * is honest, "Rupees Zero Only" on a voucher that has not been priced is not.
 */
export function amountInWords(value: Numeric, options: AmountInWordsOptions = {}): string {
  const minorUnits = toMinor(value);
  if (minorUnits === null) return "";

  const { major = "Rupees", minor = "Paisa", system = "south-asian" } = options;
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const whole = abs / 100n;
  const fraction = Number(abs % 100n);

  const words = system === "international" ? internationalWords(whole) : southAsianWords(whole);
  const fractionWords = fraction ? ` and ${belowHundred(fraction)} ${minor}` : "";
  return `${negative ? "Minus " : ""}${major} ${words}${fractionWords} Only`;
}

/** Words suited to a currency code. */
export function amountInWordsFor(value: Numeric, currency: string | null | undefined): string {
  const code = (currency ?? "PKR").toUpperCase();
  if (code === "PKR" || code === "RS" || code === "RS.") {
    return amountInWords(value, { major: "Rupees", minor: "Paisa", system: "south-asian" });
  }
  if (code === "INR") return amountInWords(value, { major: "Rupees", minor: "Paise", system: "south-asian" });
  if (code === "USD") return amountInWords(value, { major: "Dollars", minor: "Cents", system: "international" });
  if (code === "GBP") return amountInWords(value, { major: "Pounds", minor: "Pence", system: "international" });
  if (code === "EUR") return amountInWords(value, { major: "Euros", minor: "Cents", system: "international" });
  if (code === "AED") return amountInWords(value, { major: "Dirhams", minor: "Fils", system: "international" });
  if (code === "SAR") return amountInWords(value, { major: "Riyals", minor: "Halalas", system: "international" });
  return amountInWords(value, { major: code, minor: "Cents", system: "international" });
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return negative ? -q : q;
}

/**
 * `part` as a percentage of `whole`, rounded half away from zero to `places`
 * (default one: 87.5). Null when either is absent or the whole is zero — a
 * mark out of an unknown or zero maximum has no percentage, not 0%.
 */
export function ratioPercent(part: Numeric, whole: Numeric, places = 1): string | null {
  const p = toMinor(part, 4);
  const w = toMinor(whole, 4);
  if (p === null || w === null || w === 0n) return null;
  const scale = 10n ** BigInt(places);
  return fromMinor(divideRounded(p * 100n * scale, w), places);
}

/** The mean of the values given, rounded to `places`; null for none. */
export function mean(values: Numeric[], places = 1): string | null {
  const minors = values.map((v) => toMinor(v, 4)).filter((m): m is bigint => m !== null);
  if (!minors.length) return null;
  const total = minors.reduce((a, b) => a + b, 0n);
  const scale = 10n ** BigInt(places);
  return fromMinor(divideRounded(total * scale, BigInt(minors.length) * 10_000n), places);
}
