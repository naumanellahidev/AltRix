import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildInvoice } from "./invoice";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: "accounts@crescent.edu.pk", website: null, motto: null, logoUrl: null, logo: null,
  accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const input = {
  invoiceNumber: "CMS-2026-000412",
  issuedAt: "2026-09-01",
  dueDate: "2999-09-10",
  status: "partial",
  billedTo: "Ayesha Khan",
  billedToDetail: "Student · Grade 7 Blue",
  contact: "0300-1234567",
  lines: [
    { label: "Tuition fee — September", amount: "4500.00" },
    { label: "Computer lab", amount: "600.00" },
    { label: "Transport", amount: "1650.10" },
  ],
  subtotal: "6750.10",
  discount: "675.00",
  lateFee: "0",
  total: "6075.10",
  payments: [{ paidAt: "2026-09-05T11:00:00Z", method: "Bank Transfer", reference: "MZN-88213", amount: "3000.00" }],
};

describe("invoice", () => {
  it("builds an invoice from its own figures, named after who it is for", async () => {
    const { doc, fileName, warnings } = await buildInvoice(input, { brand });
    expect(fileName).toBe("Ayesha Khan - Invoice - CMS-2026-000412.pdf");
    expect(warnings).toEqual([]);
    if (process.env.INVOICE_OUT) writeFileSync(process.env.INVOICE_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("reports figures that do not add up rather than correcting them", async () => {
    const { warnings } = await buildInvoice({ ...input, total: "7000.00" }, { brand });
    expect(warnings[0]).toMatch(/do not add up/);
  });

  it("handles an invoice with no lines and no payments", async () => {
    const { warnings } = await buildInvoice({ ...input, lines: [], payments: [], subtotal: null }, { brand });
    expect(warnings).toEqual([]);
  });
});
