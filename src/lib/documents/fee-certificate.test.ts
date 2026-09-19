import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildFeeCertificate, fiscalYearRange } from "./fee-certificate";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const payments = Array.from({ length: 12 }, (_, i) => ({
  date: `${i < 6 ? 2025 : 2026}-${String(((i + 6) % 12) + 1).padStart(2, "0")}-05`,
  amount: "12500.50",
  method: i % 3 === 0 ? "jazzcash" : "bank",
  ref: i % 3 === 0 ? `JC${100200 + i}` : null,
  invoice_number: `CMS-2025-${String(400 + i).padStart(6, "0")}`,
  period: "Monthly tuition",
}));

const cert = {
  certificate_number: "FTC-202526-A3F2C1",
  fiscal_year: "2025-2026",
  total_fees_paid: "150006.00",
  school_ntn: "1234567-8",
  payment_details: payments,
  generated_at: "2026-07-03T09:00:00Z",
};
const student = { name: "Ayesha Khan", className: "Grade 7 — Blue", studentCode: "CMS-2021-0417" };

describe("fee certificate", () => {
  it("reads a fiscal year as 1 July to 30 June", () => {
    expect(fiscalYearRange("2025-2026")).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(fiscalYearRange("2025-2027")).toBeNull();
  });

  it("lists every payment and totals them exactly", async () => {
    const { doc, fileName, warnings } = await buildFeeCertificate(cert, student, { brand });
    expect(fileName).toBe("Ayesha Khan - Fee Certificate - FY 2025-2026.pdf");
    expect(warnings).toEqual([]);
    if (process.env.FC_OUT) writeFileSync(process.env.FC_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("says when the payments listed do not match the total", async () => {
    const { warnings } = await buildFeeCertificate({ ...cert, total_fees_paid: "1.00" }, student, { brand });
    expect(warnings.join(" ")).toMatch(/do not add up/);
  });

  it("says plainly when nothing was paid, rather than certifying a blank", async () => {
    const { warnings } = await buildFeeCertificate({ ...cert, total_fees_paid: 0, payment_details: [] }, student, { brand });
    expect(warnings.join(" ")).toMatch(/no payments/);
  });
});
