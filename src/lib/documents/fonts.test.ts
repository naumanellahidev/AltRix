import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import jsPDF from "jspdf";
import { beforeAll, describe, expect, it } from "vitest";

import { generateVoucherPdf } from "../fee-voucher-pdf";
import { createDocument } from "./document";
import {
  installTextSafety,
  isArabicScript,
  needsUnicodeFont,
  seedUnicodeFont,
  toWinAnsi,
  unsupportedText,
} from "./fonts";
import { drawTable } from "./table";

const URDU_NAME = "عائشہ خان";
const URDU_PARENT = "محمد ٹیپو سلطان";

function fontBase64(file: string): string {
  return readFileSync(resolve(__dirname, "../../../public/fonts", file)).toString("base64");
}

describe("character handling without a Unicode font", () => {
  it("rewrites symbols the built-in fonts lack into faithful equivalents", () => {
    expect(toWinAnsi("Merit ≥90% → 5%")).toBe("Merit >=90% -> 5%");
    expect(toWinAnsi("Rs. 5,000 − 250")).toBe("Rs. 5,000 - 250");
  });

  it("keeps everything the built-in fonts can draw", () => {
    const text = "Café — “quoted” • 5,000.00 … £ €";
    expect(toWinAnsi(text)).toBe(text);
    expect(needsUnicodeFont(text)).toBe(false);
  });

  it("recognises Urdu as needing the Unicode font", () => {
    expect(needsUnicodeFont(URDU_NAME)).toBe(true);
    expect(isArabicScript(URDU_NAME)).toBe(true);
    expect(isArabicScript("Ayesha Khan")).toBe(false);
  });

  it("reports text it could not draw instead of silently printing boxes", () => {
    const pdf = new jsPDF({ compress: false });
    installTextSafety(pdf);
    pdf.text(URDU_NAME, 10, 10);
    expect(unsupportedText(pdf)).toEqual([URDU_NAME]);
  });

  it("prints the rewritten symbol, not a broken glyph", () => {
    const pdf = new jsPDF({ compress: false });
    installTextSafety(pdf);
    pdf.text("Merit ≥90% → 5%", 10, 10);
    const raw = pdf.output();
    expect(raw).toContain("Merit >=90% -> 5%");
    expect(unsupportedText(pdf)).toEqual([]);
  });
});

describe("with the shipped Urdu font", () => {
  beforeAll(() => {
    seedUnicodeFont(fontBase64("NotoNaskhArabic-Regular.ttf"), fontBase64("NotoNaskhArabic-Bold.ttf"));
  });

  it("ships a real TrueType font", () => {
    const bytes = readFileSync(resolve(__dirname, "../../../public/fonts/NotoNaskhArabic-Regular.ttf"));
    // TrueType files start with 0x00010000.
    expect(bytes.readUInt32BE(0)).toBe(0x00010000);
    expect(bytes.length).toBeGreaterThan(100_000);
  });

  it("draws an Urdu name with nothing lost", () => {
    const doc = createDocument({ title: "Report Card", school: { name: "Crescent Model School" }, compress: false });
    doc.fields([
      { label: "Student", value: URDU_NAME },
      { label: "Father", value: URDU_PARENT },
    ]);
    doc.text(`${URDU_NAME} — Grade 7`);
    expect(doc.unprintableText).toEqual([]);
    expect(doc.finish().pdf.output()).toContain("NotoNaskhArabic");
  });

  it("switches back to the Latin font after the Urdu run", () => {
    const doc = createDocument({ title: "Receipt", school: { name: "School" }, compress: false });
    doc.text(URDU_NAME);
    expect(doc.pdf.getFont().fontName.toLowerCase()).toContain("helvetica");
  });

  it("handles Urdu inside table cells", () => {
    const doc = createDocument({ title: "Class List", school: { name: "School" }, compress: false });
    drawTable(doc, {
      columns: [
        { header: "Name", width: 2, value: (r: { name: string }) => r.name },
        { header: "نام", width: 2, align: "right", value: (r: { name: string }) => r.name },
      ],
      rows: [{ name: URDU_NAME }, { name: "Ayesha Khan" }, { name: URDU_PARENT }],
    });
    expect(doc.unprintableText).toEqual([]);
  });

  it("prints an Urdu student name on a fee voucher", () => {
    const pdf = generateVoucherPdf({
      invoiceNumber: "CMS-2026-000412",
      issueDate: "2026-09-01",
      dueDate: "2026-09-10",
      school: { name: "Crescent Model School" },
      student: { name: URDU_NAME, parentName: URDU_PARENT },
      items: [{ label: "ماہانہ فیس", amount: "5000" }],
      subtotal: "5000",
      baseDiscount: "0",
      meritDiscount: "0",
      siblingDiscount: "0",
      total: "5000",
      currency: "PKR",
    });
    expect(unsupportedText(pdf)).toEqual([]);
  });
});

describe("reading direction", () => {
  it("puts a line that starts in Urdu against the right margin", async () => {
    const { isRightToLeft } = await import("./fonts");
    expect(isRightToLeft("آپ کی تقرری پر مبارکباد۔")).toBe(true);
    expect(isRightToLeft("12 — آپ کی تقرری")).toBe(true);
    expect(isRightToLeft("Ayesha — عائشہ")).toBe(false);
    expect(isRightToLeft("2026-08-01")).toBe(false);
  });
});
