/**
 * The platform's own billing identity — the name, contact and bank account
 * printed on the invoices and receipts the platform issues to schools.
 *
 * The settings screen used to pre-fill the bank fields with an invented bank,
 * account number and IBAN, and billing printed those on every receipt until
 * someone overwrote them. A school paying from that receipt would have sent
 * money to an account that does not exist. The invented values are now only
 * placeholders, and any copy of them already saved is read as "not set".
 */
export interface PlatformBrandSettings {
  brandName: string;
  supportEmail: string;
  supportUrl: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  logoBase64: string;
}

export const PLATFORM_BRAND_KEY = "altrix_global_brand_settings";

/** Example values, for placeholders only — never printed. */
export const PLATFORM_BRAND_EXAMPLES: PlatformBrandSettings = {
  brandName: "ALTRIX PLATFORM SOLUTIONS",
  supportEmail: "billing@altrix.com",
  supportUrl: "support.altrix.com",
  bankName: "Altrix International Trust Bank",
  accountTitle: "Altrix Platform Solutions Ltd.",
  accountNumber: "1045-9856-0248-12",
  iban: "PK85AITB0000104598560248",
  logoBase64: "",
};

const EMPTY: PlatformBrandSettings = {
  brandName: "",
  supportEmail: "",
  supportUrl: "",
  bankName: "",
  accountTitle: "",
  accountNumber: "",
  iban: "",
  logoBase64: "",
};

/** Fields whose example value must never be taken for the real one. */
const NEVER_REAL: Array<keyof PlatformBrandSettings> = [
  "supportEmail",
  "supportUrl",
  "bankName",
  "accountTitle",
  "accountNumber",
  "iban",
];

export function sanitizePlatformBrand(raw: Partial<PlatformBrandSettings> | null | undefined): PlatformBrandSettings {
  const out: PlatformBrandSettings = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as Array<keyof PlatformBrandSettings>) {
    const value = typeof raw?.[key] === "string" ? String(raw[key]).trim() : "";
    out[key] = NEVER_REAL.includes(key) && value === PLATFORM_BRAND_EXAMPLES[key] ? "" : value;
  }
  return out;
}

export function loadPlatformBrand(): PlatformBrandSettings {
  try {
    const saved = localStorage.getItem(PLATFORM_BRAND_KEY);
    return sanitizePlatformBrand(saved ? JSON.parse(saved) : null);
  } catch {
    return { ...EMPTY };
  }
}

/** True when enough bank details are set for a school to pay into. */
export function hasBankDetails(b: PlatformBrandSettings): boolean {
  return Boolean(b.accountTitle && (b.iban || b.accountNumber));
}
