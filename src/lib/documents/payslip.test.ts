import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildPayslips } from "./payslip";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const base = {
  employeeName: "Sara Malik",
  employeeEmail: "sara@crescent.edu.pk",
  employeeCode: "EMP-0042",
  designation: "Senior Teacher",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  paidAt: "2026-09-30",
  status: "paid",
  currency: "PKR",
  grossAmount: "95000.00",
  deductions: "4750.50",
  netAmount: "90249.50",
  baseSalary: "80000.00",
  allowances: "15000.00",
};

describe("payslips", () => {
  it("itemises earnings only when they add up to the run's gross", async () => {
    const { doc, fileName, warnings } = await buildPayslips([base], { brand });
    expect(fileName).toBe("Sara Malik - Payslip - September 2026.pdf");
    expect(warnings).toEqual([]);
    if (process.env.PAYSLIP_OUT) writeFileSync(process.env.PAYSLIP_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("puts a whole run in one file, one document per employee", async () => {
    const { doc, fileName } = await buildPayslips(
      [base, { ...base, employeeName: "Bilal Ahmed", employeeCode: "0b8d2f7e-1111-4a2b-9c3d-123456789abc", baseSalary: "70000", allowances: null }],
      { brand },
    );
    expect(doc.documentCount).toBe(2);
    expect(doc.pages).toBe(2);
    expect(fileName).toMatch(/^Payslips - September 2026 - 2 employees/);
  });

  it("reports a run whose net does not equal gross less deductions", async () => {
    const { warnings } = await buildPayslips([{ ...base, netAmount: "91000.00" }], { brand });
    expect(warnings[0]).toMatch(/net pay does not equal/);
  });

  it("refuses to produce an empty run", async () => {
    await expect(buildPayslips([], { brand })).rejects.toThrow(/no payslips/);
  });
});
