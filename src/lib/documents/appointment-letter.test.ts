import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { appointmentReference, appointmentTerms, buildAppointmentLetter } from "./appointment-letter";
import type { SchoolBrand } from "./brand";
import { seedUnicodeFont } from "./fonts";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: "hr@crescent.edu.pk", website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const contract = {
  contractId: "3f9a2c1b-1111-4000-8000-000000000000",
  reference: "HR-2026-0012",
  employeeName: "Ayesha Siddiqui",
  employeeEmail: "ayesha@example.com",
  contractType: "full_time",
  position: "Senior Mathematics Teacher",
  department: "Sciences",
  startDate: "2026-08-01",
  endDate: null,
  reportingTo: "Head of Sciences",
  workingHours: "Mon–Fri, 8:00 AM – 3:00 PM",
  probationMonths: 3,
  noticeDays: "30",
  salaryAmount: "85000.50",
  salaryCurrency: "PKR",
  benefits: "Medical cover for the employee and dependants.\nTransport allowance of PKR 5,000 per month.",
  terms: Array.from({ length: 6 }, (_, i) => `${i + 1}. The employee shall abide by the school's code of conduct and policies as amended from time to time, including those on safeguarding, attendance and confidentiality.`).join("\n"),
  body: "آپ کی تقرری پر مبارکباد۔",
  signatoryName: "Farhat Hashmi",
  signatoryTitle: "Principal",
  status: "active",
  issuedOn: "2026-07-20T10:00:00Z",
};

describe("appointment letter", () => {
  it("says so when Urdu text cannot be printed, instead of printing question marks silently", async () => {
    const { warnings } = await buildAppointmentLetter(contract, { brand });
    expect(warnings.join(" ")).toMatch(/could not be printed/);
  });

  describe("with the Urdu font", () => {
    beforeAll(() => {
      const font = (f: string) => readFileSync(resolve(__dirname, "../../../public/fonts", f)).toString("base64");
      seedUnicodeFont(font("NotoNaskhArabic-Regular.ttf"), font("NotoNaskhArabic-Bold.ttf"));
    });

    it("states the terms the school set, the salary to the paisa and in words", async () => {
      const { doc, fileName, warnings } = await buildAppointmentLetter(contract, { brand });
      expect(fileName).toBe("Ayesha Siddiqui - Appointment Letter - HR-2026-0012.pdf");
      expect(warnings).toEqual([]);
      if (process.env.AL_OUT) writeFileSync(process.env.AL_OUT, new Uint8Array(doc.arrayBuffer()));
    });
  });

  it("does not promise a salary that was never recorded", async () => {
    const bare = { ...contract, salaryAmount: null, probationMonths: null, reportingTo: "", endDate: null };
    const labels = appointmentTerms(bare).map(([label]) => label);
    expect(labels).not.toContain("Salary");
    expect(labels).not.toContain("Probation");
    expect(labels).not.toContain("Reporting to");
    const { warnings } = await buildAppointmentLetter(bare, { brand });
    expect(warnings.join(" ")).toMatch(/no salary is recorded/);
  });

  it("prints the salary exactly as stored, with the words", () => {
    const salary = appointmentTerms(contract).find(([label]) => label === "Salary")?.[1] ?? "";
    expect(salary).toContain("PKR 85,000.50 per month");
    expect(salary).toContain("Rupees Eighty-Five Thousand and Fifty Paisa Only");
    const fixed = appointmentTerms({ ...contract, endDate: "2027-07-31" }).find(([l]) => l === "Term")?.[1];
    expect(fixed).toBe("Until 31 Jul 2027");
  });

  it("marks a terminated contract's letter as cancelled", async () => {
    const { doc } = await buildAppointmentLetter({ ...contract, status: "terminated" }, { brand });
    expect(doc.pages).toBeGreaterThanOrEqual(1);
  });

  it("keeps the reference earlier letters were printed with", () => {
    expect(appointmentReference({ contractId: "3f9a2c1b-1111", reference: null })).toBe("HR-3F9A2C1B");
    expect(appointmentReference({ contractId: "x", reference: "  HR-2026-0003 " })).toBe("HR-2026-0003");
  });
});
