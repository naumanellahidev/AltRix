import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildTimetable } from "./timetable";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const periods = [
  { id: "p1", label: "Period 1", sort_order: 1, start_time: "08:00:00", end_time: "08:40:00" },
  { id: "p2", label: "Period 2", sort_order: 2, start_time: "08:40:00", end_time: "09:20:00" },
  { id: "b", label: "Lunch Break", sort_order: 3, start_time: "09:20:00", end_time: "09:50:00" },
  { id: "p3", label: "Period 3", sort_order: 4, start_time: "09:50:00", end_time: "10:30:00" },
];
const subjects = ["English", "Mathematics", "Urdu", "Science", "Islamiat"];
const entries = [1, 2, 3, 4, 5].flatMap((d) =>
  ["p1", "p2", "p3"].map((p, i) => ({
    day_of_week: d, period_id: p, subject_name: subjects[(d + i) % 5], room: `${10 + i}`, teacher_name: "Sara Malik",
  })),
);

describe("timetable", () => {
  it("builds a weekly grid named after whose it is", async () => {
    const { doc, fileName, warnings } = await buildTimetable(
      { title: "Class Timetable", subject: "Grade 7 — Blue", periods, entries, cellDetail: "teacher" }, { brand },
    );
    expect(fileName).toBe("Grade 7 — Blue - Class Timetable.pdf");
    expect(warnings).toEqual([]);
    expect(doc.pages).toBe(1);
    if (process.env.TT_OUT) writeFileSync(process.env.TT_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("prints both lessons of a clash and reports it", async () => {
    const clash = [...entries, { day_of_week: 1, period_id: "p1", subject_name: "Art", room: "20", teacher_name: "Bilal" }];
    const { warnings } = await buildTimetable({ title: "Class Timetable", subject: "G7", periods, entries: clash, cellDetail: "teacher" }, { brand });
    expect(warnings.join(" ")).toMatch(/more than one lesson/);
  });

  it("reports lessons attached to a period that no longer exists", async () => {
    const { warnings } = await buildTimetable(
      { title: "Teacher Timetable", subject: "Sara Malik", periods, entries: [{ day_of_week: 1, period_id: "gone", subject_name: "X", room: null }], cellDetail: "section" },
      { brand },
    );
    expect(warnings.join(" ")).toMatch(/could not be placed/);
  });
});
