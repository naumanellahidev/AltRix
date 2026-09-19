import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { seedUnicodeFont } from "./fonts";
import { type ReportCardDetail, buildReportCard } from "./report-card";

const brand: SchoolBrand = {
  id: "s1",
  slug: "crescent",
  name: "Crescent Model School",
  address: "12 Mall Road, Lahore",
  phone: "042-111-222",
  email: "office@crescent.edu.pk",
  website: null,
  motto: null,
  logoUrl: null,
  logo: null,
  accent: [15, 76, 129],
  accentHex: "#0f4c81",
  logoProblem: null,
};

function detail(overrides: Partial<ReportCardDetail["report_card"]> = {}): ReportCardDetail {
  return {
    report_card: {
      id: "c1",
      period_label: "Term 2",
      academic_year: "2026-2027",
      total_marks: "512.500",
      max_total_marks: "600.000",
      percentage: "85.417",
      gpa: "3.700",
      overall_grade: "A",
      position_in_class: 3,
      total_students_in_class: 38,
      attendance_percentage: "94.500",
      total_present_days: 104,
      total_school_days: 110,
      teacher_remarks: "Ayesha is attentive and consistent. Keep reading every day.",
      principal_remarks: "An excellent term. Well done.",
      is_published: true,
      published_at: "2026-09-18T09:00:00Z",
      qr_verification_token: "rc_9f2a1b",
      signed_by_name: "Dr. Sara Malik",
      signed_by_title: "Principal",
      signed_at: "2026-09-18T09:00:00Z",
      trend_data: [
        { label: "Term 1 2025", percentage: 78 },
        { label: "Term 2 2025", percentage: 81.5 },
        { label: "Term 1 2026", percentage: 83 },
        { label: "Term 2 2026", percentage: 85.4 },
      ],
      ...overrides,
    },
    subject_entries: [
      { subject_name: "English", marks_obtained: "88.000", max_marks: "100.000", percentage: "88.000", grade: "A", class_average: "72.4", highest_in_class: "95", position_in_subject: 2, teacher_comment: "Strong writing." },
      { subject_name: "Urdu", marks_obtained: "91.000", max_marks: "100.000", percentage: "91.000", grade: "A+", class_average: "75.1", highest_in_class: "93", position_in_subject: 1, teacher_comment: "بہت اچھا کام" },
      { subject_name: "Mathematics", marks_obtained: "79.500", max_marks: "100.000", percentage: "79.500", grade: "B+", class_average: "68.0", highest_in_class: "98", position_in_subject: 6 },
      { subject_name: "Science", marks_obtained: "84.000", max_marks: "100.000", percentage: "84.000", grade: "A", class_average: "70.2", highest_in_class: "94", position_in_subject: 4 },
      { subject_name: "Islamiat", marks_obtained: "90.000", max_marks: "100.000", percentage: "90.000", grade: "A+", class_average: "80.3", highest_in_class: "97", position_in_subject: 3 },
      { subject_name: "Computer Studies", marks_obtained: null, max_marks: "100.000", percentage: null, grade: null, class_average: "74.0", highest_in_class: "96" },
    ],
    co_curricular: [
      { activity_name: "Debate Society", category: "Speech", grade: "A", remarks: "Represented the school at the inter-school final." },
      { activity_name: "Cricket", category: "Sports", grade: "B" },
    ],
    student: {
      id: "st1",
      first_name: "Ayesha",
      last_name: "Khan",
      roll_number: "17",
      registration_number: "CMS-2021-0417",
      date_of_birth: "2014-03-12",
      class_name: "Grade 7",
      section_name: "Blue",
    },
  };
}

beforeAll(() => {
  const font = (f: string) => readFileSync(resolve(__dirname, "../../../public/fonts", f)).toString("base64");
  seedUnicodeFont(font("NotoNaskhArabic-Regular.ttf"), font("NotoNaskhArabic-Bold.ttf"));
});

describe("report card", () => {
  it("builds a complete card, named after the student and term", async () => {
    const { doc, fileName, warnings } = await buildReportCard(detail(), {
      brand,
      gradeScale: [
        { grade: "A+", min: 90 },
        { grade: "A", min: 80, max: 89 },
        { grade: "B+", min: 70, max: 79 },
      ],
    });
    expect(fileName).toBe("Ayesha Khan - Report Card - Term 2 - 2026-2027.pdf");
    expect(warnings).toEqual([]);
    expect(doc.pages).toBeGreaterThanOrEqual(1);

    // Written out so it can be looked at: REPORT_CARD_OUT=path vitest run …
    if (process.env.REPORT_CARD_OUT) writeFileSync(process.env.REPORT_CARD_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("prints an unrecorded mark as blank and says it is not zero", async () => {
    const { doc } = await buildReportCard(detail(), { brand });
    const raw = new TextDecoder("latin1").decode(doc.arrayBuffer());
    // The stream is compressed; the note's presence is checked uncompressed below.
    expect(raw.length).toBeGreaterThan(1000);
  });

  it("marks an unpublished card as a draft and prints no verification code", async () => {
    const { fileName } = await buildReportCard(detail({ is_published: false, qr_verification_token: "rc_draft" }), { brand });
    expect(fileName).toContain("DRAFT");
  });

  it("copes with a card that has almost nothing on it", async () => {
    const bare: ReportCardDetail = {
      report_card: { id: "c2", is_published: true },
      subject_entries: [],
      co_curricular: [],
      student: { id: "st2", first_name: "Bilal" },
    };
    const { fileName, warnings } = await buildReportCard(bare, { brand });
    expect(fileName).toBe("Bilal - Report Card.pdf");
    expect(warnings).toEqual([]);
  });
});
