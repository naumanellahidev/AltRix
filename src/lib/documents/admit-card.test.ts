import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildDatesheetPDF } from "@/pages/tenant/modules/components/datesheetPdf";

import type { SchoolBrand } from "./brand";
import { buildAdmitCards } from "./admit-card";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const papers = [
  { exam_date: "2026-10-05", start_time: "09:00:00", duration_minutes: 180, subject: "English", room: "Hall A" },
  { exam_date: "2026-10-06", start_time: "09:00:00", duration_minutes: 180, subject: "Mathematics", room: "Hall A" },
  { exam_date: "2026-10-07", start_time: "13:30:00", duration_minutes: 120, subject: "Urdu", room: "Hall B" },
];

const meta = {
  examName: "Mid-Term Examination 2026",
  sectionLabel: "Grade 7 — Blue",
  verifyUrl: (id: string) => `https://example.edu/crescent/verify-ticket/e1/${id}`,
  rules: [
    "1. Candidates must report to the examination room at least 15 minutes before the start time, and will not be admitted more than thirty minutes after the paper begins, whatever the reason given for the delay.",
    "2. Mobile phones and smartwatches are not allowed in the hall.",
  ],
};

describe("admit cards", () => {
  it("makes one card per student, each its own document, named after the section and exam", async () => {
    const students = [
      { id: "a", name: "Ayesha Khan", code: "CMS-0417", rollNumber: "17" },
      { id: "b", name: "Bilal Ahmed", code: null, rollNumber: "18" },
    ];
    const { doc, fileName, warnings } = await buildAdmitCards(students, papers, meta, { brand });
    expect(doc.documentCount).toBe(2);
    expect(fileName).toBe("Grade 7 — Blue - Admit Cards - Mid-Term Examination 2026.pdf");
    expect(warnings.join(" ")).toMatch(/no photo on file/);
    if (process.env.ADMIT_OUT) writeFileSync(process.env.ADMIT_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("refuses to make cards with no papers or no students", async () => {
    await expect(buildAdmitCards([], papers, meta, { brand })).rejects.toThrow(/no students/);
    await expect(buildAdmitCards([{ id: "a", name: "A" }], [], meta, { brand })).rejects.toThrow(/no papers/);
  });
});

describe("datesheet", () => {
  it("builds a datesheet with paper QR codes", async () => {
    const pdf = await buildDatesheetPDF(
      [
        { id: "p1", subject_id: "s1", class_section_id: "c1", exam_date: "2026-10-05", start_time: "09:00:00", duration_minutes: 180, max_marks: 100, passing_marks: 33, room: "Hall A", invigilator_user_id: null },
        { id: "p2", subject_id: "s2", class_section_id: "c1", exam_date: null, start_time: null, duration_minutes: null, max_marks: 75, passing_marks: null, room: null, invigilator_user_id: null },
      ],
      { schoolName: "Crescent Model School", examName: "Mid-Term Examination 2026", sectionLabel: "Grade 7 — Blue" },
      { fields: ["date", "start", "duration", "subject", "room", "max"], includePaperQR: true },
      { subjects: new Map([["s1", "English"], ["s2", "Mathematics"]]), sections: new Map([["c1", "Grade 7 — Blue"]]), staff: new Map() },
    );
    expect(pdf.getNumberOfPages()).toBe(1);
    if (process.env.DATESHEET_OUT) writeFileSync(process.env.DATESHEET_OUT, new Uint8Array(pdf.output("arraybuffer")));
  });
});
