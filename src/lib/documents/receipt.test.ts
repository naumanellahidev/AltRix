import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildReceipt } from "./receipt";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "The Crescent Model Higher Secondary School and College", address: "12 Mall Road, Lahore",
  phone: "042-111-222", email: "accounts@crescent.edu.pk", website: null, motto: null, logoUrl: null, logo: null,
  accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const input = {
  receiptNumber: "RCP-2026-00931",
  payerName: "Ayesha Khan",
  payerType: "Student",
  payerDetail: "Grade 7 Blue · Roll 17",
  payerContact: "0300-1234567",
  paidAt: "2026-09-18T10:42:00Z",
  method: "Bank Transfer",
  transactionReference: "MZN-88213",
  invoiceNumber: "CMS-2026-000412",
  invoicePeriod: "September 2026",
  amount: "3000.00",
  invoiceTotal: "4950.30",
  invoicePaidToDate: "3000.00",
  receivedBy: "Accounts Office",
};

describe("receipt", () => {
  it("builds an A5 receipt named after the payer and receipt number", async () => {
    const { doc, fileName, warnings } = await buildReceipt(input, { brand });
    expect(fileName).toBe("Ayesha Khan - Payment Receipt - RCP-2026-00931.pdf");
    expect(warnings).toEqual([]);
    expect(Math.round(doc.geo.width)).toBe(148);
    if (process.env.RECEIPT_OUT) writeFileSync(process.env.RECEIPT_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("marks a reprint as a duplicate in its file name", async () => {
    const { fileName } = await buildReceipt({ ...input, duplicate: true }, { brand });
    expect(fileName).toContain("DUPLICATE");
  });

  it("says when the balance cannot be shown rather than inventing one", async () => {
    const { warnings } = await buildReceipt({ ...input, invoiceTotal: null, invoicePaidToDate: null }, { brand });
    expect(warnings[0]).toMatch(/balance is not shown/);
  });
});
