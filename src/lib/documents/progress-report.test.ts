import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { averagePercent, buildProgressReports, workPercent } from "./progress-report";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const student = (name: string) => ({
  id: name,
  name,
  work: [
    { title: "Fractions worksheet", marks: "17.5", maxMarks: "20", grade: "A" },
    { title: "Algebra quiz", marks: 2, maxMarks: 3, grade: "B" },
    { title: "Geometry project", marks: null, maxMarks: 50, grade: null },
  ],
  attendance: { present: 41, absent: 2, late: 3, total: 46 },
});

describe("progress reports", () => {
  it("never scores an unmarked piece of work as zero", () => {
    expect(workPercent({ title: "x", marks: null, maxMarks: 50 })).toBeNull();
    expect(workPercent({ title: "x", marks: 10, maxMarks: null })).toBeNull();
    expect(averagePercent(student("a").work)).toBe("77.1"); // (87.5 + 66.7) / 2
  });

  it("puts a whole class in one PDF, one report each", async () => {
    const { doc, fileName, warnings } = await buildProgressReports(
      [student("Ayesha Khan"), student("Bilal Ahmed")],
      { classLabel: "Grade 7 — Blue", teacherName: "Sara Malik" },
      { brand },
    );
    expect(fileName).toMatch(/^Grade 7 — Blue - Progress Reports - /);
    expect(doc.pages).toBe(2);
    expect(warnings).toEqual([]);
    if (process.env.PR_OUT) writeFileSync(process.env.PR_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("names a single report after the student", async () => {
    const { fileName } = await buildProgressReports([student("Ayesha Khan")], { classLabel: "Grade 7 — Blue" }, { brand });
    expect(fileName).toBe("Ayesha Khan - Progress Report - Grade 7 — Blue.pdf");
  });
});
