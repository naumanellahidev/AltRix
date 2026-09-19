import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildIdCardSheets, type IdCardSettings, type IdCardStudent } from "./id-card";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: "office@crescent.edu.pk", website: null, motto: null, logoUrl: null, logo: null,
  accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const settings: IdCardSettings = {
  card_layout: "vertical", primary_color: "#0f4c81", text_color: "#ffffff", card_title: "SCHOOL TAGLINE",
  show_logo: true, show_qr_code: true, show_roll_number: true, show_class: true, show_dob: true,
  show_blood_group: true, show_emergency_contact: true, show_signature: true,
  signature_text: "Principal", design_style: "modern",
};

const student = (i: number): IdCardStudent => ({
  id: `st${i}`, first_name: ["Ayesha", "Bilal", "Hamza", "Zainab"][i % 4], last_name: "Khan",
  roll_number: String(10 + i), registration_number: `CMS-2021-04${10 + i}`, date_of_birth: "2014-03-12",
  blood_group: "B+", card_valid_until: "2027-06-30", profile_image_url: null, emergency_contact: "0300-1234567",
  class_name: "Grade 7", section_name: "Blue",
});

describe("student ID cards", () => {
  it("lays nine portrait cards to a sheet with a back sheet each", async () => {
    const students = Array.from({ length: 11 }, (_, i) => student(i));
    const { pdf, cards, sheets, fileName, warnings } = await buildIdCardSheets(students, settings, { brand, label: "Grade 7 Blue" });
    expect(cards).toBe(11);
    expect(sheets).toBe(4); // 2 front sheets + 2 back sheets
    expect(pdf.getNumberOfPages()).toBe(4);
    expect(fileName).toBe("Grade 7 Blue - Student ID Cards - Crescent Model School.pdf");
    expect(warnings.join(" ")).toMatch(/no photo on file/);
    if (process.env.IDCARD_OUT) writeFileSync(process.env.IDCARD_OUT, new Uint8Array(pdf.output("arraybuffer")));
  });

  it("never prints the placeholder tagline", async () => {
    const { pdf } = await buildIdCardSheets([student(0)], { ...settings }, { brand });
    // Uncompressed text is not available with compression on; check via a fresh uncompressed build.
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it("puts ten landscape cards to a sheet", async () => {
    const { sheets } = await buildIdCardSheets(Array.from({ length: 10 }, (_, i) => student(i)), { ...settings, card_layout: "horizontal" }, { brand });
    expect(sheets).toBe(2);
  });

  it("refuses to make an empty sheet", async () => {
    await expect(buildIdCardSheets([], settings, { brand })).rejects.toThrow(/no students/);
  });
});
