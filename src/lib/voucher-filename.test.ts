import { describe, expect, it } from "vitest";

import { voucherFileName } from "./fee-voucher-pdf";

describe("voucher file names", () => {
  it("names a voucher after the student, period and invoice", () => {
    expect(
      voucherFileName({ invoiceNumber: "CMS-2026-000412", periodLabel: "September 2026", student: { name: "Ayesha Khan" } }),
    ).toBe("Ayesha Khan - Fee Voucher - September 2026 - CMS-2026-000412.pdf");
  });
});
