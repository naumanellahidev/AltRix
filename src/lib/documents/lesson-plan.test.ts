import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SchoolBrand } from "./brand";
import { buildLessonPlan } from "./lesson-plan";

const brand: SchoolBrand = {
  id: "s1", slug: "c", name: "Crescent Model School", address: "12 Mall Road, Lahore", phone: "042-111-222",
  email: null, website: null, motto: null, logoUrl: null, logo: null, accent: [15, 76, 129], accentHex: "#0f4c81", logoProblem: null,
};

const plan = {
  title: "Photosynthesis: how plants make food",
  subject: "Science",
  classLabel: "Grade 7 — Blue",
  curriculum: "Cambridge Secondary",
  gradeLevel: "Grade 7",
  durationMinutes: 45,
  blooms: ["Understand", "Apply"],
  date: "2026-09-22",
  objectives: ["Describe the inputs and outputs of photosynthesis in a word equation.", "Explain why leaves are adapted to capture light, with two examples."],
  priorKnowledge: ["Plant cell structure", "What energy is"],
  materials: ["Pondweed", "Lamp", "Test tubes"],
  schedule: Array.from({ length: 7 }, (_, i) => ({
    timeRange: `${i * 6}-${i * 6 + 6} min`,
    phase: ["Starter", "Explain", "Demonstrate", "Practice", "Check", "Extend", "Plenary"][i],
    teacherAction: "Asks the class what a plant needs to grow, records answers on the board, and introduces the word equation with a worked example.",
    studentAction: "Discuss in pairs, then write the equation in their books and label the inputs and outputs.",
  })),
  differentiation: { advanced: "Balance the symbol equation.", struggling: "Fill-in-the-gap equation card.", ell: "Key word glossary with pictures." },
  homework: "Draw and label a leaf cross-section.",
  slides: [{ slideNumber: 1, title: "What do plants need?", bulletPoints: ["Light", "Water", "Carbon dioxide"], visualSuggestion: "Photo of a sunlit leaf", speakerNotes: "Ask before revealing." }],
};

describe("lesson plan", () => {
  it("builds a letterhead plan named after the class, subject, topic and date", async () => {
    const { doc, fileName, warnings } = await buildLessonPlan(plan, { brand });
    expect(fileName).toMatch(/^Grade 7 — Blue - Science - Photosynthesis.+ - Lesson Plan - 22 Sept 2026\.pdf$/);
    expect(fileName).not.toContain(":");
    expect(warnings).toEqual([]);
    if (process.env.LP_OUT) writeFileSync(process.env.LP_OUT, new Uint8Array(doc.arrayBuffer()));
  });

  it("says when there is nothing in the plan yet", async () => {
    const { warnings } = await buildLessonPlan({ title: "Draft" }, { brand });
    expect(warnings.join(" ")).toMatch(/no objectives or schedule/);
  });
});
