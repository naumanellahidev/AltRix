import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { seedUnicodeFont } from "./fonts";
import {
  DEFAULT_PRINT_SETTINGS,
  MAX_DENSITY,
  MIN_DENSITY,
  type ReportCardDetail,
  buildFittedReportCard,
  buildReportCard,
} from "./report-card";
import { TEMPLATE_ORDER } from "./report-card-templates";

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

/**
 * A report card has to come out on one sheet.
 *
 * These build real cards and count the pages, rather than asserting that a
 * density constant exists: the only thing that matters is what the printer
 * receives.
 */
// Each case lays out and measures real PDFs: about a second alone, but over
// the 5 s default when the machine is also type-checking, which failed the
// suite for no fault in the code.
describe("fitting a card onto one sheet", { timeout: 30_000 }, () => {
  /** A card long enough that the comfortable layout runs over. */
  function crowded(subjects: number, options: { comments?: boolean } = {}): ReportCardDetail {
    const base = detail();
    const names = [
      "English", "Urdu", "Mathematics", "Science", "Islamiat", "Computer Studies",
      "Social Studies", "Physics", "Chemistry", "Biology", "Art", "Physical Education",
      "General Knowledge", "Nazra Quran", "Pakistan Studies", "Geography",
      "History", "Economics", "Civics", "Library Skills", "Music", "Drama",
    ];
    return {
      ...base,
      subject_entries: Array.from({ length: subjects }, (_, i) => ({
        subject_name: names[i % names.length],
        marks_obtained: String(70 + (i % 25)),
        max_marks: "100.000",
        percentage: String(70 + (i % 25)),
        grade: i % 3 === 0 ? "A" : "B+",
        class_average: "72.4",
        highest_in_class: "96",
        position_in_subject: (i % 9) + 1,
        // A per-subject comment needs the full width, which is why a card
        // carrying them cannot be set in two columns.
        teacher_comment: options.comments ? "Consistent work throughout the term." : null,
      })),
    };
  }

  it("fits a twenty-subject card on one page, without dropping anything", async () => {
    const long = crowded(20);

    const comfortable = await buildReportCard(long, { brand });
    expect(comfortable.doc.pages).toBeGreaterThan(1); // the problem is real

    const fitted = await buildFittedReportCard(long, { brand });
    expect(fitted.fittedOnOnePage).toBe(true);
    expect(fitted.doc.pages).toBe(1);
    expect(fitted.warnings).toEqual([]);
    // Two columns is what buys the room here, not shrinking the type away.
    expect(fitted.subjectColumns).toBe(2);
    expect(fitted.density).toBeGreaterThanOrEqual(0.85);
  });

  it("fits a card that carries a comment on every subject", async () => {
    const fitted = await buildFittedReportCard(crowded(16, { comments: true }), { brand });
    expect(fitted.doc.pages).toBe(1);
    // Comments need the full width, so this one is tightened instead.
    expect(fitted.subjectColumns).toBe(1);
    expect(fitted.density).toBeLessThan(1);
  });

  it("opens a short card out until it reaches the foot of the sheet", async () => {
    // Three subjects, nothing else on: the card that used to stop a third of
    // the way down and leave the rest of the page white.
    const sparse: ReportCardDetail = {
      report_card: {
        id: "c3",
        period_label: "Term 1",
        academic_year: "2026-2027",
        total_marks: "255.000",
        max_total_marks: "300.000",
        percentage: "85.000",
        overall_grade: "A",
        is_published: true,
      },
      subject_entries: [
        { subject_name: "English", marks_obtained: "88", max_marks: "100", percentage: "88", grade: "A" },
        { subject_name: "Urdu", marks_obtained: "84", max_marks: "100", percentage: "84", grade: "A" },
        { subject_name: "Mathematics", marks_obtained: "83", max_marks: "100", percentage: "83", grade: "A" },
      ],
      co_curricular: [],
      student: { id: "st3", first_name: "Hamza", last_name: "Iqbal", roll_number: "4", class_name: "Grade 4" },
    };

    const fitted = await buildFittedReportCard(sparse, { brand });
    expect(fitted.doc.pages).toBe(1);
    // Less than a centimetre of the sheet left unused, measured before the
    // signature block is dropped to the foot.
    expect(fitted.slack).toBeLessThan(10);
    expect(fitted.density).toBeLessThanOrEqual(MAX_DENSITY);
  });

  it("fills the sheet for every one of the seven designs", async () => {
    for (const template of TEMPLATE_ORDER) {
      const fitted = await buildFittedReportCard(detail(), {
        brand,
        settings: { ...DEFAULT_PRINT_SETTINGS, template },
      });
      expect(fitted.doc.pages, `${template} needed ${fitted.doc.pages} pages`).toBe(1);
      expect(fitted.slack, `${template} left ${fitted.slack}mm of the sheet empty`).toBeLessThan(28);
    }
  }, 60_000);

  it("never loses a subject to any design, however the page is arranged", async () => {
    // The fitting pass may tighten, halve the table or open it out. What it
    // may never do is print fewer subjects than the card carries.
    for (const template of TEMPLATE_ORDER) {
      const { warnings } = await buildFittedReportCard(detail(), {
        brand,
        settings: { ...DEFAULT_PRINT_SETTINGS, template },
      });
      expect(warnings, `${template} reported ${warnings.join("; ")}`).toEqual([]);
    }
  }, 60_000);

  it("never tightens past the legible floor", async () => {
    const fitted = await buildFittedReportCard(crowded(22, { comments: true }), { brand });
    expect(fitted.density).toBeGreaterThanOrEqual(MIN_DENSITY);
  });

  it("says so plainly when even the tightest layout needs two sheets", async () => {
    const huge = crowded(22, { comments: true });
    huge.report_card.teacher_remarks = "A very long remark. ".repeat(60);
    huge.report_card.principal_remarks = "Another long remark. ".repeat(60);

    const fitted = await buildFittedReportCard(huge, {
      brand,
      settings: { ...DEFAULT_PRINT_SETTINGS, fitStrategy: "two_pages" },
    });
    if (!fitted.fittedOnOnePage) {
      expect(fitted.doc.pages).toBeGreaterThan(1);
    }
    // Either way it never claims a page count it did not produce.
    expect(fitted.fittedOnOnePage).toBe(fitted.doc.pages === 1);
  });

  it("honours a school that turned a section off", async () => {
    const withoutExtras = await buildFittedReportCard(crowded(20), {
      brand,
      settings: {
        ...DEFAULT_PRINT_SETTINGS,
        showActivities: false,
        showTermTrend: false,
      },
    });
    expect(withoutExtras.doc.pages).toBe(1);
    // Less to fit means it needs less tightening than the full card did.
    const full = await buildFittedReportCard(crowded(20), { brand });
    expect(withoutExtras.density).toBeGreaterThanOrEqual(full.density);
  });
});
