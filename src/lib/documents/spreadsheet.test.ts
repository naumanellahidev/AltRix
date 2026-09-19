import { beforeAll, describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { documentFileName } from "./format";
import { buildCsv, buildSpreadsheet, humanize, inferColumns } from "./spreadsheet";

const brand: SchoolBrand = {
  id: "s1",
  slug: "crescent",
  name: "Crescent Model School",
  address: "12 Mall Road, Lahore",
  phone: "042-111-222",
  email: null,
  website: null,
  motto: null,
  logoUrl: null,
  logo: null,
  accent: [15, 76, 129],
  accentHex: "#0f4c81",
  logoProblem: null,
};

/** jsdom's Blob has no arrayBuffer(); read it the way a browser without it would. */
function bytesOf(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function readBack(blob: Blob) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(await bytesOf(blob));
  return wb;
}

// The first import of exceljs is slow in the test runner.
beforeAll(async () => {
  await import("exceljs");
}, 120_000);

const defaulters = [
  { student_name: "Ayesha Khan", class: "Grade 7", total_due: "4950.30", days_overdue: 12, due_date: "2026-09-10" },
  { student_name: "عائشہ خان", class: "Grade 8", total_due: "1250.00", days_overdue: 3, due_date: "2026-09-15" },
  { student_name: "Bilal Ahmed", class: "Grade 7", total_due: null, days_overdue: 0, due_date: null },
];

describe("column inference", () => {
  it("names columns the way a person would", () => {
    expect(humanize("student_name")).toBe("Student Name");
    expect(humanize("createdAt")).toBe("Created At");
    expect(humanize("guardian_cnic")).toBe("Guardian CNIC");
  });

  it("types money, counts and dates from the data", () => {
    const types = Object.fromEntries(inferColumns(defaulters).map((c) => [c.key, c.type]));
    expect(types).toMatchObject({
      student_name: "text",
      total_due: "money",
      days_overdue: "integer",
      due_date: "date",
    });
  });

  it("does not mistake a head count for money", () => {
    const [col] = inferColumns([{ total_students: 40 }, { total_students: 35 }]);
    expect(col.type).toBe("integer");
  });

  it("keeps phone numbers and codes as text so leading zeros survive", () => {
    const [col] = inferColumns([{ parent_phone: "03001234567" }]);
    expect(col.type).toBe("text");
  });
});

describe("branded workbook", () => {
  it("is a real xlsx carrying the school's letterhead", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["Fee Defaulters", "September 2026"],
      sheets: [
        {
          name: "Defaulters",
          title: "Fee Defaulters",
          subtitle: "September 2026",
          filters: [{ label: "Campus", value: "Main" }],
          columns: inferColumns(defaulters),
          rows: defaulters,
        },
      ],
    });
    expect(result.blob.type).toContain("spreadsheetml");
    const wb = await readBack(result.blob);
    const ws = wb.getWorksheet("Defaulters")!;
    expect(ws.getCell("A1").value).toBe("Crescent Model School");
    expect(ws.getCell("A2").value).toBe("Fee Defaulters");
    expect(String(ws.getCell("A3").value)).toContain("September 2026");
    expect(wb.creator).toBe("Crescent Model School");
  });

  it("writes amounts as numbers Excel can sum, and leaves absent amounts blank", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["Fee Defaulters"],
      sheets: [{ name: "D", title: "Fee Defaulters", columns: inferColumns(defaulters), rows: defaulters }],
    });
    const ws = (await readBack(result.blob)).worksheets[0];
    let header = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === "Student Name") header = n;
    });
    expect(header).toBeGreaterThan(0);
    const amount = ws.getRow(header + 1).getCell(3);
    expect(amount.value).toBe(4950.3);
    expect(amount.numFmt).toContain("#,##0.00");
    expect(ws.getRow(header + 3).getCell(3).value).toBeNull();
    expect(ws.getRow(header).getCell(3).value).toBe("Total Due (Rs.)");
  });

  it("totals money with a live formula, not a typed-in figure", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["x"],
      sheets: [{ name: "D", title: "T", columns: inferColumns(defaulters), rows: defaulters }],
    });
    const ws = (await readBack(result.blob)).worksheets[0];
    let formula: string | undefined;
    ws.eachRow((row) => {
      const v = row.getCell(3).value as { formula?: string } | null;
      if (v && typeof v === "object" && v.formula) formula = v.formula;
    });
    expect(formula).toMatch(/^SUM\(C\d+:C\d+\)$/);
  });

  it("freezes the header, adds a filter and repeats the header on printed pages", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["x"],
      sheets: [{ name: "D", title: "T", columns: inferColumns(defaulters), rows: defaulters }],
    });
    const ws = (await readBack(result.blob)).worksheets[0];
    expect(ws.views[0]).toMatchObject({ state: "frozen" });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.pageSetup.printTitlesRow).toMatch(/^\d+:\d+$/);
    expect(ws.headerFooter.oddFooter).toContain("Page &P of &N");
  });

  it("aligns Urdu right-to-left", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["x"],
      sheets: [{ name: "D", title: "T", columns: inferColumns(defaulters), rows: defaulters }],
    });
    const ws = (await readBack(result.blob)).worksheets[0];
    let urdu: { alignment?: { readingOrder?: string; horizontal?: string } } | undefined;
    ws.eachRow((row) => {
      if (row.getCell(1).value === "عائشہ خان") urdu = row.getCell(1) as never;
    });
    expect(urdu?.alignment).toMatchObject({ readingOrder: "rtl", horizontal: "right" });
  });

  it("says so when there is nothing to report", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["x"],
      sheets: [{ name: "D", title: "T", columns: [{ header: "Name", key: "n" }], rows: [], emptyMessage: "No defaulters this month." }],
    });
    const ws = (await readBack(result.blob)).worksheets[0];
    let found = false;
    ws.eachRow((row) => row.eachCell((c) => { if (c.value === "No defaulters this month.") found = true; }));
    expect(found).toBe(true);
  });

  it("names the file after what it contains", async () => {
    const result = await buildSpreadsheet({
      brand,
      fileNameParts: ["Fee Defaulters", "Grade 7", "September 2026"],
      sheets: [{ name: "D", title: "T", columns: inferColumns(defaulters), rows: defaulters }],
    });
    expect(result.fileName).toMatch(/^Fee Defaulters - Grade 7 - September 2026 - Crescent Model School - .+\.xlsx$/);
  });
});

describe("csv", () => {
  it("starts with a byte-order mark so Excel reads Urdu correctly", () => {
    const csv = buildCsv(defaulters);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("عائشہ خان");
  });

  it("neutralises cells that Excel would run as formulas", () => {
    const csv = buildCsv([{ name: "=HYPERLINK(\"http://evil\")", note: "@SUM(1)", amount: "-250" }]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM(1)");
    // A negative number is data, not a formula.
    expect(csv).toContain(",-250");
  });
});

describe("file names", () => {
  it("builds a readable name from the data it describes", () => {
    expect(documentFileName(["Ayesha Khan", "Report Card", "Term 2 2026"], "pdf")).toBe(
      "Ayesha Khan - Report Card - Term 2 2026.pdf",
    );
  });

  it("drops characters file systems refuse and skips empty parts", () => {
    expect(documentFileName(["Grade 7/B", null, "", "Fees: Sept?"], ".xlsx")).toBe("Grade 7 B - Fees Sept.xlsx");
  });

  it("keeps Urdu names intact", () => {
    expect(documentFileName(["عائشہ خان", "Report Card"], "pdf")).toBe("عائشہ خان - Report Card.pdf");
  });
});
