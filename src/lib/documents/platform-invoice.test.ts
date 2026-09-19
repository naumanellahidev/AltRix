import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PLATFORM_BRAND_EXAMPLES, sanitizePlatformBrand } from "../platform-brand";
import { buildPlatformInvoice } from "./platform-invoice";

const inv = {
  invoiceNumber: "ALT-2026-0042",
  schoolName: "Crescent Model School",
  amount: "45000.50",
  billingDate: "2026-09-01",
  dueDate: "2026-09-15",
  status: "Unpaid" as const,
  planTier: "Premium",
  billingCycle: "monthly",
};

describe("platform invoice", () => {
  it("never treats the example bank account as a real one", () => {
    const b = sanitizePlatformBrand(PLATFORM_BRAND_EXAMPLES);
    expect(b.iban).toBe("");
    expect(b.accountNumber).toBe("");
    expect(b.bankName).toBe("");
    expect(b.brandName).toBe(PLATFORM_BRAND_EXAMPLES.brandName);
  });

  it("does not print where to pay when no real account is set", async () => {
    const { warnings } = await buildPlatformInvoice(inv, { brand: sanitizePlatformBrand(PLATFORM_BRAND_EXAMPLES) });
    expect(warnings.join(" ")).toMatch(/no bank account/);
  });

  it("is an invoice until paid and a receipt after", async () => {
    const brand = sanitizePlatformBrand({ brandName: "AltRix", accountTitle: "AltRix (Pvt) Ltd", iban: "PK36SCBL0000001123456702" });
    const unpaid = await buildPlatformInvoice(inv, { brand });
    expect(unpaid.fileName).toBe("Crescent Model School - Invoice - ALT-2026-0042.pdf");
    expect(unpaid.warnings).toEqual([]);
    if (process.env.PI_OUT) writeFileSync(process.env.PI_OUT, new Uint8Array(unpaid.doc.arrayBuffer()));
    const paid = await buildPlatformInvoice({ ...inv, status: "Paid", paidAt: "2026-09-10T10:00:00Z" }, { brand });
    expect(paid.fileName).toBe("Crescent Model School - Receipt - ALT-2026-0042.pdf");
  });
});
