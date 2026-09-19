import { describe, expect, it } from "vitest";

import {
  ABSENT,
  createDocument,
  date,
  describe as describeResult,
  drawSummary,
  drawTable,
  failed,
  geometry,
  marks,
  money,
  name,
  outOf,
  parseColor,
  percent,
  readableOn,
  roundDecimalString,
  amountInWords,
  amountInWordsFor,
  atLeastZero,
  percentOf,
  subtract,
  sum,
  succeeded,
  themeFor,
} from "./index";

const school = { name: "Crescent Model School", address: "12 Mall Road, Lahore" };

// Uncompressed so the tests can read the text back out of the raw PDF.
const base = { school, compress: false } as const;

// ─── Money: never through a float ────────────────────────────────────────────

describe("money", () => {
  it("formats the exact decimal the server sent", () => {
    expect(money("4950.30", { currency: "PKR" })).toBe("PKR 4,950.30");
  });

  it("does not show the float artefact the old code printed", () => {
    // 1650.10 * 3 in binary floating point is 4950.299999999999.
    expect(money(1650.1 * 3)).not.toContain("299999");
    expect(money("4950.299999999999")).toBe("4,950.30");
  });

  it("rounds half away from zero, as a till does", () => {
    expect(money("10.005")).toBe("10.01");
    expect(money("10.004")).toBe("10.00");
    expect(money("-10.005")).toBe("-10.01");
  });

  it("carries through a run of nines without a float", () => {
    expect(roundDecimalString("999.995", 2)).toBe("1000.00");
    expect(money("999999.995")).toBe("1,000,000.00");
  });

  it("handles amounts larger than a float can hold exactly", () => {
    expect(money("12345678901234567.89")).toBe("12,345,678,901,234,567.89");
  });

  it("prints absence as absence, never as zero", () => {
    expect(money(null)).toBe(ABSENT);
    expect(money(undefined)).toBe(ABSENT);
    expect(money("")).toBe(ABSENT);
    expect(money("not a number")).toBe(ABSENT);
  });

  it("still prints a real zero as zero", () => {
    expect(money("0")).toBe("0.00");
    expect(money(0)).toBe("0.00");
  });

  it("accepts server strings that already carry separators", () => {
    expect(money("1,250.5")).toBe("1,250.50");
  });
});

// ─── Marks: a missing mark is not a zero ─────────────────────────────────────

describe("marks and percentages", () => {
  it("drops empty trailing zeros from the stored scale", () => {
    expect(marks("85.000")).toBe("85");
    expect(marks("85.500")).toBe("85.5");
  });

  it("keeps an absent mark absent", () => {
    expect(marks(null)).toBe(ABSENT);
    expect(percent(undefined)).toBe(ABSENT);
  });

  it("refuses to half-print a ratio", () => {
    expect(outOf("38", "50")).toBe("38 / 50");
    expect(outOf("38", null)).toBe(ABSENT);
    expect(outOf(null, "50")).toBe(ABSENT);
  });

  it("lands exactly on a grade boundary", () => {
    expect(percent("80.000")).toBe("80%");
  });
});

describe("dates and names", () => {
  it("does not turn a missing date into today", () => {
    expect(date(null)).toBe(ABSENT);
    expect(date("not a date")).toBe(ABSENT);
  });

  it("formats a real date", () => {
    expect(date("2026-03-12T00:00:00Z")).toMatch(/12 Mar 2026/);
  });

  it("joins names without double spaces", () => {
    expect(name("Ayesha", null, "Khan")).toBe("Ayesha Khan");
    expect(name(null, "  ")).toBe(ABSENT);
  });
});

// ─── Theme ───────────────────────────────────────────────────────────────────

describe("theme", () => {
  it("reads every branding format the app stores", () => {
    expect(parseColor("#0f4c81")).toEqual([15, 76, 129]);
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("rgb(15, 76, 129)")).toEqual([15, 76, 129]);
    expect(parseColor("210 90% 40%")).not.toBeNull();
    expect(parseColor("nonsense")).toBeNull();
  });

  it("falls back rather than failing on unusable branding", () => {
    expect(themeFor("nonsense").accent).toEqual(themeFor(null).accent);
  });

  it("keeps header text readable on a pale brand colour", () => {
    expect(readableOn([250, 230, 120])).toEqual([17, 24, 39]);
    expect(readableOn([15, 76, 129])).toEqual([255, 255, 255]);
  });
});

// ─── Paper ───────────────────────────────────────────────────────────────────

describe("paper", () => {
  it("never lays out to the edge of the sheet", () => {
    const g = geometry("a4", "portrait");
    expect(g.margins.left).toBeGreaterThanOrEqual(12);
    expect(g.contentX).toBeGreaterThan(0);
    expect(g.contentWidth).toBeLessThan(g.width);
  });

  it("swaps dimensions for landscape", () => {
    const g = geometry("a4", "landscape");
    expect(g.width).toBe(297);
    expect(g.height).toBe(210);
  });
});

// ─── Documents ───────────────────────────────────────────────────────────────

describe("document", () => {
  it("produces a real, non-empty PDF", () => {
    const doc = createDocument({ ...base, title: "Fee Voucher", reference: "INV-1" });
    doc.text("Hello");
    const bytes = new Uint8Array(doc.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(500);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("keeps text as text rather than an image", () => {
    const doc = createDocument({ ...base, title: "Receipt" });
    doc.text("Ayesha Khan paid in full");
    const raw = new TextDecoder("latin1").decode(doc.arrayBuffer());
    expect(raw).not.toContain("/Subtype /Image");
  });

  it("stamps 'Page X of Y' on every page once Y is known", () => {
    const doc = createDocument({ ...base, title: "Register" });
    for (let i = 0; i < 200; i += 1) doc.text(`Row ${i}`);
    expect(doc.pages).toBeGreaterThan(1);
    const pdf = doc.finish().pdf;
    const total = doc.pages;
    const raw = pdf.output();
    for (let p = 1; p <= total; p += 1) {
      expect(raw).toContain(`Page ${p} of ${total}`);
    }
  });

  it("stamps the footer once even when finished repeatedly", () => {
    const doc = createDocument({ ...base, title: "Receipt" });
    doc.text("x");
    doc.finish();
    doc.finish();
    const raw = doc.pdf.output();
    expect(raw.split("Page 1 of 1").length - 1).toBe(1);
  });

  it("names the file from the title and reference", () => {
    const doc = createDocument({ ...base, title: "Fee Voucher", reference: "INV-2026-0412" });
    expect(doc.filename()).toBe("Fee Voucher - INV-2026-0412 - Crescent Model School.pdf");
  });

  it("never draws below the footer line", () => {
    const doc = createDocument({ ...base, title: "Long" });
    for (let i = 0; i < 400; i += 1) {
      doc.text(`Line ${i}`);
      expect(doc.y).toBeLessThanOrEqual(doc.bottomLimit + 0.001);
    }
  });
});

describe("table", () => {
  type Line = { label: string; amount: string };
  const columns = [
    { header: "Description", width: 3, value: (r: Line) => r.label },
    { header: "Amount", width: 1, align: "right" as const, value: (r: Line) => money(r.amount) },
  ];

  it("repeats its header on every page it spans", () => {
    const doc = createDocument({ ...base, title: "Ledger" });
    const rows = Array.from({ length: 180 }, (_, i) => ({ label: `Entry ${i}`, amount: "100.00" }));
    drawTable(doc, { columns, rows });
    expect(doc.pages).toBeGreaterThan(1);

    const raw = doc.finish().pdf.output();
    const headers = raw.split("(Description)").length - 1;
    expect(headers).toBe(doc.pages);
  });

  it("writes its headings in white bold on the school colour", () => {
    // Fitting a heading measured it, and measuring reset the pen to the body
    // ink, so headings came out dark on the dark band and not bold.
    const doc = createDocument({ ...base, title: "Ledger" });
    drawTable(doc, { columns, rows: [{ label: "Tuition", amount: "100" }] });
    const raw = doc.finish().pdf.output();
    const before = raw.slice(0, raw.indexOf("(Description) Tj"));
    const block = before.slice(before.lastIndexOf("BT"));
    expect(block).toMatch(/\/F2 /);
    expect(block).toMatch(/(^|\s)(1\.? g|1\.? 1\.? 1\.? rg)\s/);
  });

  it("never lets a row cross the bottom margin", () => {
    const doc = createDocument({ ...base, title: "Ledger" });
    let breached = false;
    const rows = Array.from({ length: 180 }, (_, i) => ({ label: `Entry ${i}`, amount: "1" }));
    drawTable(doc, {
      columns,
      rows,
      onPageBreak: (d) => {
        if (d.y > d.bottomLimit) breached = true;
      },
    });
    expect(breached).toBe(false);
    expect(doc.y).toBeLessThanOrEqual(doc.bottomLimit + 2.001);
  });

  it("says so when there is nothing to show, instead of drawing an empty grid", () => {
    const doc = createDocument({ ...base, title: "Ledger" });
    const drawn = drawTable(doc, { columns, rows: [], emptyMessage: "No payments recorded." });
    expect(drawn).toBe(0);
    expect(doc.finish().pdf.output()).toContain("No payments recorded.");
  });

  it("draws a summary without throwing", () => {
    const doc = createDocument({ ...base, title: "Invoice" });
    drawSummary(doc, [
      { label: "Subtotal", value: money("5000") },
      { label: "Total", value: money("4500"), emphasis: true },
    ]);
    expect(doc.finish().pdf.output()).toContain("4,500.00");
  });
});

// ─── Delivery: no success that was not observed ──────────────────────────────

describe("results", () => {
  it("reports a failure as a failure", () => {
    const outcome = describeResult(failed(new Error("logo could not be loaded")));
    expect(outcome.tone).toBe("error");
    expect(outcome.message).toContain("logo could not be loaded");
  });

  it("does not call a result with warnings a clean success", () => {
    const outcome = describeResult(
      succeeded("voucher.pdf", [{ subject: "voucher", message: "school logo missing" }]),
    );
    expect(outcome.tone).toBe("warning");
    expect(outcome.message).toContain("school logo missing");
  });

  it("reports a clean success plainly", () => {
    expect(describeResult(succeeded("voucher.pdf"))).toEqual({
      tone: "success",
      message: "Downloaded voucher.pdf",
    });
  });
});

// ─── Exact arithmetic ────────────────────────────────────────────────────────

describe("decimal arithmetic", () => {
  it("adds instalments exactly, where a float does not", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum(["1650.10", "1650.10", "1650.10"])).toBe("4950.30");
    expect(sum(["0.1", "0.2"])).toBe("0.30");
  });

  it("treats absent amounts as nothing, not as an error", () => {
    expect(sum(["100", null, undefined, ""])).toBe("100.00");
  });

  it("computes a percentage the way the voucher RPC's ROUND() does", () => {
    // ROUND(5000 * 12.5 / 100.0, 2) = 625.00
    expect(percentOf("5000", "12.5")).toBe("625.00");
    // ROUND(3333.33 * 15 / 100.0, 2) = 500.00 (499.9995 rounds half up)
    expect(percentOf("3333.33", "15")).toBe("500.00");
    expect(percentOf("1000", "33.3333")).toBe("333.33");
  });

  it("never lets a discount push a total below zero", () => {
    expect(atLeastZero(subtract("500", "800"))).toBe("0.00");
    expect(subtract("500", "800")).toBe("-300.00");
  });
});

describe("amount in words", () => {
  it("writes rupees in the lakh/crore system used on Pakistani vouchers", () => {
    expect(amountInWords("4950.30")).toBe(
      "Rupees Four Thousand Nine Hundred Fifty and Thirty Paisa Only",
    );
    expect(amountInWords("125000")).toBe("Rupees One Lakh Twenty-Five Thousand Only");
    expect(amountInWords("23456789")).toBe(
      "Rupees Two Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Only",
    );
  });

  it("uses millions for currencies that do", () => {
    expect(amountInWordsFor("1250000", "USD")).toBe("Dollars One Million Two Hundred Fifty Thousand Only");
  });

  it("writes nothing for an absent amount rather than 'Zero'", () => {
    expect(amountInWords(null)).toBe("");
    expect(amountInWords("0")).toBe("Rupees Zero Only");
  });
});

describe("exact percentages and means", () => {
  it("computes a mark's percentage without floating point", async () => {
    const { ratioPercent, mean } = await import("./decimal");
    expect(ratioPercent("17.5", "20")).toBe("87.5");
    expect(ratioPercent("1", "3")).toBe("33.3");
    expect(ratioPercent("2", "3")).toBe("66.7");
    expect(ratioPercent("0", "50")).toBe("0.0");
    expect(ratioPercent(null, "50")).toBeNull();
    expect(ratioPercent("10", "0")).toBeNull();
    expect(mean(["87.5", "66.7", "0.0"])).toBe("51.4");
    expect(mean([])).toBeNull();
    expect(mean(["0.1", "0.2"], 2)).toBe("0.15");
  });
});
