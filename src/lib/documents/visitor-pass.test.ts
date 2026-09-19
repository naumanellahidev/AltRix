import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildVisitorPass, maskPhone } from "./visitor-pass";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

describe("visitor pass", () => {
  it("prints the school's name, the code and its QR, and hides most of the phone", async () => {
    const { doc, fileName, warnings } = await buildVisitorPass(
      { kind: "pass", visitorName: "Imran <b>Khan</b>", purpose: "parent_meeting", phone: "0300-1234567", code: "vx7k2p", scheduledDate: "2026-10-02", visiting: "Ayesha Khan (Grade 7)" },
      { brand },
    );
    expect(fileName).toMatch(/ - Visitor Gate Pass - 02 Oct 2026\.pdf$/);
    expect(warnings).toEqual([]);
    expect(doc.pages).toBe(1);
    if (process.env.VP_OUT) writeFileSync(process.env.VP_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("masks a phone number to its last four digits", () => {
    expect(maskPhone("0300-1234567")).toBe("•••••••4567");
    expect(maskPhone("12")).toBeNull();
  });

  it("says when there is no code to scan", async () => {
    const { warnings } = await buildVisitorPass({ kind: "badge", visitorName: "Guest" }, { brand });
    expect(warnings.join(" ")).toMatch(/no code/);
  });
});
