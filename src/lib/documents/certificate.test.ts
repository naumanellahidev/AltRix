import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { type CertificateDetail, buildCertificate, certificateWording } from "./certificate";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const detail = (overrides: Partial<CertificateDetail["certificate"]> = {}, student: Partial<NonNullable<CertificateDetail["student"]>> = {}): CertificateDetail => ({
  certificate: {
    id: "c1", certificate_type: "transfer_certificate", certificate_number: "TC-2026-000017-A3F2",
    issue_date: "2026-09-18", remarks: "All dues cleared. Leaving on transfer of parent's employment.",
    qr_verification_code: "q-abc", status: "valid", ...overrides,
  },
  title: "School Leaving Certificate",
  student: {
    first_name: "Ayesha", last_name: "Khan", roll_number: "17", registration_number: "CMS-2021-0417",
    date_of_birth: "2014-03-12", gender: "female", admission_date: "2021-04-05", status: "left",
    class_name: "Grade 7", section_name: "Blue", ...student,
  },
});

describe("certificates", () => {
  it("builds the wording from recorded facts", () => {
    const text = certificateWording(detail(), "Crescent Model School").join(" ");
    expect(text).toContain("Ayesha Khan, Registration No. CMS-2021-0417,");
    expect(text).toContain("admitted on 05 Apr 2021");
    expect(text).toContain("Her date of birth");
    expect(text).toContain("All dues cleared");
  });

  it("leaves out a sentence whose facts are missing instead of printing a blank", () => {
    const text = certificateWording(detail({}, { date_of_birth: null, admission_date: null, gender: null }), "S").join(" ");
    expect(text).not.toMatch(/date of birth/);
    expect(text).not.toMatch(/admitted on/);
    expect(text).not.toMatch(/undefined|null/);
  });

  it("builds a landscape certificate named after the student and number", async () => {
    const { pdf, fileName, warnings } = await buildCertificate(detail(), { brand, signatory: { name: "Dr. Sara Malik", title: "Principal" } });
    expect(fileName).toBe("Ayesha Khan - School Leaving Certificate - TC-2026-000017-A3F2.pdf");
    expect(warnings).toEqual([]);
    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(297);
    if (process.env.CERT_OUT) writeFileSync(process.env.CERT_OUT, new Uint8Array(pdf.output("arraybuffer")));
  });

  it("prints a revoked certificate as VOID and says so", async () => {
    const { warnings } = await buildCertificate(detail({ status: "revoked" }), { brand });
    expect(warnings.join(" ")).toMatch(/revoked/);
  });

  it("refuses to print a certificate with no student record", async () => {
    await expect(buildCertificate({ ...detail(), student: null }, { brand })).rejects.toThrow(/student's record/);
  });
});
