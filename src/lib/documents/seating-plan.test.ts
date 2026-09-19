import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildSeatingPlans } from "./seating-plan";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const names = ["Ayesha Khan", "Bilal Ahmed", "Fatima Noor", "Hamza Malik", "Zainab Tariq", "Usman Ali", "Sana Iqbal", "Omer Saeed", "Maryam Aslam", "Saad Qureshi", "Hira Javed", "Ali Raza"];
const plan = {
  id: "p1",
  exam_name: "Mid-Term Examination 2026",
  room_name: "Hall A",
  rows: 4,
  cols: 5,
  exam_date: "2026-10-05",
  start_time: "09:00",
  session_label: "Paper 1 — Mathematics",
  invigilators: [{ name: "Sara Malik", role: "primary" }],
  seats: names.map((n, i) => ({
    student_id: `s${i}`,
    student_name: n,
    roll_number: String(i + 1),
    section: i % 2 ? "Grade 7 Green" : "Grade 7 Blue",
    row: Math.floor(i / 5),
    col: i % 5,
    seat: `${String.fromCharCode(65 + Math.floor(i / 5))}-${(i % 5) + 1}`,
  })),
};

describe("seating plan", () => {
  it("draws each hall with its desks and an attendance list", async () => {
    const { doc, fileName, warnings } = await buildSeatingPlans([plan, { ...plan, id: "p2", room_name: "Hall B", seats: plan.seats.slice(0, 3) }], { brand });
    expect(fileName).toBe("2 halls - Seating Plan - Mid-Term Examination 2026 - Paper 1 — Mathematics - 05 Oct 2026.pdf");
    expect(doc.pages).toBeGreaterThanOrEqual(2);
    expect(warnings).toEqual([]);
    if (process.env.SP_OUT) writeFileSync(process.env.SP_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("refuses to print nothing", async () => {
    await expect(buildSeatingPlans([], { brand })).rejects.toThrow(/no seating plan/);
  });
});
