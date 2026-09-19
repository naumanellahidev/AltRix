import { describe, expect, it } from "vitest";

import { appendVoucherPage, generateVoucherPdf, type VoucherCopyData } from "./fee-voucher-pdf";
import { lateFeeTerms, voucherStatusFor } from "./voucher-data";

function voucher(overrides: Partial<VoucherCopyData> = {}): VoucherCopyData {
  return {
    invoiceNumber: "CMS-2026-000412",
    issueDate: "2026-09-01",
    dueDate: "2026-09-10",
    periodLabel: "September 2026",
    school: { name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222" },
    student: { name: "Ayesha Khan", rollNumber: "17", className: "Grade 7", sectionName: "Blue" },
    items: [
      { label: "Tuition Fee", amount: "1650.10" },
      { label: "Transport", amount: "1650.10" },
      { label: "Lab Charges", amount: "1650.10" },
    ],
    subtotal: "4950.30",
    baseDiscount: "0",
    meritDiscount: "0",
    siblingDiscount: "0",
    total: "4950.30",
    currency: "PKR",
    bank: { bankName: "Meezan Bank", accountNumber: "0101-0012345678" },
    ...overrides,
  };
}

/** The raw PDF. Object dictionaries such as /Subtype are never compressed. */
function rawOf(data: VoucherCopyData): string {
  return generateVoucherPdf(data).output();
}

describe("fee voucher", () => {
  it("is a real PDF with three copies on one landscape sheet", () => {
    const doc = generateVoucherPdf(voucher());
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("carries document metadata a file manager can show", () => {
    const raw = generateVoucherPdf(voucher()).output();
    expect(raw).toContain("Fee Voucher CMS-2026-000412");
  });

  it("adds a page per voucher when printing a class", () => {
    const doc = generateVoucherPdf(voucher());
    appendVoucherPage(doc, voucher({ invoiceNumber: "CMS-2026-000413" }));
    appendVoucherPage(doc, voucher({ invoiceNumber: "CMS-2026-000414" }));
    expect(doc.getNumberOfPages()).toBe(3);
  });

  it("does not throw on a plan with far more fee heads than fit", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ label: `Charge ${i + 1}`, amount: "100.00" }));
    expect(() => generateVoucherPdf(voucher({ items, subtotal: "6000.00", total: "6000.00" }))).not.toThrow();
  });

  it("accepts the amounts as the server's exact decimal strings", () => {
    expect(() => generateVoucherPdf(voucher())).not.toThrow();
  });

  it("still accepts plain numbers from older callers", () => {
    expect(() =>
      generateVoucherPdf(voucher({ items: [{ label: "Tuition", amount: 5000 }], subtotal: 5000, total: 5000 })),
    ).not.toThrow();
  });

  it("draws with no logo, a missing logo, or an undecodable one", () => {
    expect(() => generateVoucherPdf(voucher({ school: { name: "No Logo School" } }))).not.toThrow();
    expect(() =>
      generateVoucherPdf(voucher({ school: { name: "Bad Logo", logoUrl: "data:image/png;base64,not-an-image" } })),
    ).not.toThrow();
  });

  it("draws every optional section together without throwing", () => {
    expect(() =>
      generateVoucherPdf(
        voucher({
          baseDiscount: "250.00",
          meritDiscount: "100.00",
          meritReason: "Merit ≥90% → 5%",
          siblingDiscount: "150.00",
          total: "4450.30",
          paidAmount: "1000.00",
          lateFee: "500",
          lateFeeAfter: "2026-09-15",
          status: "partial",
          notes: "Bring the student copy on the first day of term.",
        }),
      ),
    ).not.toThrow();
  });

  it("can omit the QR code", () => {
    expect(() => generateVoucherPdf(voucher({ qrValue: false }))).not.toThrow();
  });

  it("uses no embedded image for the QR code — it is vector", () => {
    const raw = rawOf(voucher({ school: { name: "Vector School" } }));
    expect(raw).not.toContain("/Subtype /Image");
  });
});

describe("voucher data", () => {
  it("applies grace days to the late-fee date", () => {
    expect(lateFeeTerms({ lateFee: { amount: "500", graceDays: 5 } }, "2026-09-10")).toEqual({
      lateFee: "500",
      lateFeeAfter: "2026-09-15",
    });
  });

  it("crosses a month boundary without a timezone off-by-one", () => {
    expect(lateFeeTerms({ lateFee: { amount: "500", graceDays: 3 } }, "2026-09-29").lateFeeAfter).toBe("2026-10-02");
  });

  it("prints no late fee for a school without a policy", () => {
    expect(lateFeeTerms({ lateFee: null }, "2026-09-10")).toEqual({ lateFee: null, lateFeeAfter: null });
  });

  it("stamps a reprint with the invoice's real standing", () => {
    expect(voucherStatusFor("paid")).toBe("paid");
    expect(voucherStatusFor("partially_paid")).toBe("partial");
    expect(voucherStatusFor("cancelled")).toBe("cancelled");
    expect(voucherStatusFor("pending", "2000-01-01")).toBe("overdue");
    expect(voucherStatusFor("pending", "2999-01-01")).toBeNull();
  });
});
