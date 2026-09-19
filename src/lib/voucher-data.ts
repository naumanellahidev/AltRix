/**
 * Everything a fee voucher needs to know about the school, loaded once.
 *
 * The staff voucher screen and the parent portal each assembled this on their
 * own, with three queries one after another, and each got a slightly different
 * answer — the parent's copy had no late-fee line, the staff copy read a late
 * fee from a column nothing ever writes. This is the single source for both.
 */
import { api } from "@/lib/api";
import { isPositive } from "@/lib/documents/decimal";
import type { VoucherBankDetails, VoucherCopyData, VoucherStatus } from "@/lib/fee-voucher-pdf";

export interface SchoolVoucherMeta {
  school: {
    id?: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    motto: string | null;
    logo_url: string | null;
  } | null;
  branding: { h: number; s: number; l: number };
  bank: VoucherBankDetails | null;
  footerNote: string | null;
  currency: string | null;
  /** The school's late-payment policy, when it has one. */
  lateFee: { amount: string; graceDays: number } | null;
}

const DEFAULT_BRANDING = { h: 210, s: 100, l: 50 };

/** Load the school's voucher settings. The three reads run together. */
export async function loadSchoolVoucherMeta(schoolId: string): Promise<SchoolVoucherMeta> {
  const [schoolRes, brandingRes, settingsRes] = await Promise.all([
    api.from("schools").select("id,name,address,phone,email,website,motto,logo_url").eq("id", schoolId).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any)
      .from("school_branding")
      .select("accent_hue,accent_saturation,accent_lightness")
      .eq("school_id", schoolId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any)
      .from("fee_settings")
      .select(
        "bank_name,bank_account_title,bank_account_number,bank_iban,bank_branch,bank_swift," +
          "voucher_footer_note,currency,late_fee_enabled,late_fee_amount,late_fee_grace_days",
      )
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  // The school row is the one read the voucher cannot do without.
  if (schoolRes.error) {
    throw new Error(`the school's details could not be loaded: ${schoolRes.error.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const school = schoolRes.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branding = brandingRes.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRes.data as any;

  const lateEnabled = settings?.late_fee_enabled === true && isPositive(settings?.late_fee_amount);

  return {
    school: school
      ? {
          id: school.id,
          name: school.name ?? "School",
          address: school.address ?? null,
          phone: school.phone ?? null,
          email: school.email ?? null,
          website: school.website ?? null,
          motto: school.motto ?? null,
          logo_url: school.logo_url ?? null,
        }
      : null,
    branding: branding
      ? {
          h: Number(branding.accent_hue ?? DEFAULT_BRANDING.h),
          s: Number(branding.accent_saturation ?? DEFAULT_BRANDING.s),
          l: Number(branding.accent_lightness ?? DEFAULT_BRANDING.l),
        }
      : DEFAULT_BRANDING,
    bank: settings
      ? {
          bankName: settings.bank_name ?? null,
          accountTitle: settings.bank_account_title ?? null,
          accountNumber: settings.bank_account_number ?? null,
          iban: settings.bank_iban ?? null,
          branch: settings.bank_branch ?? null,
          swift: settings.bank_swift ?? null,
        }
      : null,
    footerNote: settings?.voucher_footer_note ?? null,
    currency: settings?.currency ?? null,
    lateFee: lateEnabled
      ? { amount: String(settings.late_fee_amount), graceDays: Number(settings.late_fee_grace_days ?? 0) || 0 }
      : null,
  };
}

/** Add days to a YYYY-MM-DD date without a timezone shifting it by one. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * The late-payment line for a voucher: how much, and from when.
 *
 * Grace days push the date out — a school with a five-day grace period charges
 * from the sixth day, and the voucher says so rather than printing the due date.
 */
export function lateFeeTerms(
  meta: Pick<SchoolVoucherMeta, "lateFee">,
  dueDate: string | null | undefined,
): Pick<VoucherCopyData, "lateFee" | "lateFeeAfter"> {
  if (!meta.lateFee || !dueDate) return { lateFee: null, lateFeeAfter: null };
  return {
    lateFee: meta.lateFee.amount,
    lateFeeAfter: meta.lateFee.graceDays > 0 ? addDays(dueDate, meta.lateFee.graceDays) : dueDate,
  };
}

/** Map an invoice's stored status to the stamp a reprint carries. */
export function voucherStatusFor(status: string | null | undefined, dueDate?: string | null): VoucherStatus | null {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return "paid";
    case "partial":
    case "partially_paid":
      return "partial";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "void":
    case "waived":
      return "void";
    case "overdue":
      return "overdue";
    case "pending":
    case "unpaid":
    case "":
      if (dueDate && dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10)) return "overdue";
      return null;
    default:
      return null;
  }
}
