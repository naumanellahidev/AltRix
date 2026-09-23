/**
 * Importing a paper register.
 *
 * The thing that matters here is not that a good file imports — it is what
 * happens to a bad one. A school's first act in the app is handing it four
 * hundred children; a guessed date of birth, an invented class or a silently
 * dropped row is a mistake that lives in the records for years.
 */
import { describe, expect, it } from "vitest";

import {
  IMPORT_COLUMNS,
  parseGender,
  parseSheetDate,
  validateRows,
  type RawRow,
  type SchoolStructure,
} from "./bulk-import";

const school: SchoolStructure = {
  classes: [
    { id: "c1", name: "Grade 4" },
    { id: "c2", name: "Grade 5" },
    { id: "c3", name: "Nursery" },
  ],
  sections: [
    { id: "s1", name: "Blue", class_id: "c1" },
    { id: "s2", name: "Green", class_id: "c1" },
    { id: "s3", name: "A", class_id: "c2" },
  ],
};

function row(over: Partial<Record<string, string>> = {}): RawRow {
  return {
    "First name": "Ayesha",
    "Last name": "Khan",
    Class: "Grade 5",
    Section: "A",
    "Date of birth": "12/03/2014",
    "Guardian phone": "0300-1234567",
    ...over,
  } as RawRow;
}

describe("reading a date out of a school's spreadsheet", () => {
  it("reads the way dates are written in Pakistan", () => {
    expect(parseSheetDate("12/03/2014").date).toBe("2014-03-12");
    expect(parseSheetDate("1-2-2015").date).toBe("2015-02-01");
    expect(parseSheetDate("07.09.2016").date).toBe("2016-09-07");
  });

  it("reads ISO, which is unambiguous", () => {
    expect(parseSheetDate("2014-03-12").date).toBe("2014-03-12");
  });

  it("takes a real date cell as it is", () => {
    expect(parseSheetDate(new Date(Date.UTC(2014, 2, 12))).date).toBe("2014-03-12");
  });

  it("treats a two-digit year as this century", () => {
    expect(parseSheetDate("12/03/14").date).toBe("2014-03-12");
  });

  it("leaves a blank cell blank rather than filling it in", () => {
    expect(parseSheetDate("")).toEqual({ date: null, problem: null });
    expect(parseSheetDate(null)).toEqual({ date: null, problem: null });
  });

  it("refuses a date it cannot read instead of guessing one", () => {
    const out = parseSheetDate("last March");
    expect(out.date).toBeNull();
    expect(out.problem).toContain("DD/MM/YYYY");
  });

  it("refuses a day that does not exist rather than rolling it forward", () => {
    // new Date(2015, 1, 31) is 3 March. A child born on "31/02/2015" has a
    // typo in their record, not a birthday in March.
    expect(parseSheetDate("31/02/2015").date).toBeNull();
    expect(parseSheetDate("32/01/2015").date).toBeNull();
    expect(parseSheetDate("12/13/2015").date).toBeNull();
  });

  it("refuses a date outside the range a child's can be in", () => {
    expect(parseSheetDate("12/03/1820").date).toBeNull();
    const nextYear = new Date().getFullYear() + 1;
    expect(parseSheetDate(`12/03/${nextYear}`).date).toBeNull();
  });
});

describe("reading a gender", () => {
  it("accepts what registers actually contain", () => {
    expect(parseGender("M").gender).toBe("male");
    expect(parseGender("female").gender).toBe("female");
    expect(parseGender("Boy").gender).toBe("male");
  });

  it("leaves it blank when the register does not say", () => {
    expect(parseGender("")).toEqual({ gender: null, problem: null });
  });

  it("never infers it from anything else", () => {
    const out = parseGender("Mrs");
    expect(out.gender).toBeNull();
    expect(out.problem).toContain("male, female or other");
  });
});

describe("checking a register before any of it is written", () => {
  it("accepts a complete row", () => {
    const { ready, problems, blockedLines } = validateRows([row()], school);
    expect(problems.filter((p) => p.level === "error")).toEqual([]);
    expect(blockedLines).toEqual([]);
    expect(ready).toHaveLength(1);
    expect(ready[0].classSectionId).toBe("s3");
    expect(ready[0].values.date_of_birth).toBe("2014-03-12");
  });

  it("points at the row a problem is on", () => {
    const { problems } = validateRows([row(), row({ "First name": "" })], school);
    const error = problems.find((p) => p.level === "error");
    // Header is row 1, so the second student is row 3.
    expect(error?.line).toBe(3);
    expect(error?.column).toBe("First name");
  });

  it("will not invent a class the school has not created", () => {
    const { problems, ready } = validateRows([row({ Class: "Grade 9" })], school);
    expect(ready).toEqual([]);
    expect(problems[0].message).toContain("no class called");
    expect(problems[0].message).toContain("nothing is created automatically");
  });

  it("will not invent a section either", () => {
    const { problems, ready } = validateRows([row({ Class: "Grade 4", Section: "Red" })], school);
    expect(ready).toEqual([]);
    expect(problems.some((p) => p.message.includes("no section called"))).toBe(true);
  });

  it("places a child without naming a section when the class has only one", () => {
    const { ready, problems } = validateRows([row({ Class: "Grade 5", Section: "" })], school);
    expect(problems.filter((p) => p.level === "error")).toEqual([]);
    expect(ready[0].classSectionId).toBe("s3");
    expect(ready[0].sectionName).toBe("A");
  });

  it("asks which section when the class has more than one", () => {
    const { ready, problems } = validateRows([row({ Class: "Grade 4", Section: "" })], school);
    expect(ready).toEqual([]);
    expect(problems.some((p) => p.message.includes("2 sections"))).toBe(true);
  });

  it("says so when a class has no sections at all", () => {
    const { problems } = validateRows([row({ Class: "Nursery", Section: "" })], school);
    expect(problems.some((p) => p.message.includes("no sections yet"))).toBe(true);
  });

  it("matches a class and section however the school capitalised them", () => {
    const { ready, problems } = validateRows([row({ Class: "grade 4", Section: "blue" })], school);
    expect(problems.filter((p) => p.level === "error")).toEqual([]);
    expect(ready[0].classSectionId).toBe("s1");
    // The school's own spelling is what gets stored, not the typist's.
    expect(ready[0].sectionName).toBe("Blue");
  });

  it("holds back only the rows that are wrong", () => {
    const rows = [row(), row({ "First name": "", "Last name": "Ali" }), row({ "Last name": "Bibi" })];
    const { ready, blockedLines } = validateRows(rows, school);
    expect(blockedLines).toEqual([3]);
    expect(ready.map((r) => r.line)).toEqual([2, 4]);
  });

  it("catches the same registration number twice in one file", () => {
    const rows = [row({ "Registration number": "REG-1" }), row({ "Registration number": "reg-1" })];
    const { problems, blockedLines } = validateRows(rows, school);
    expect(problems.some((p) => p.message.includes("is on row 2"))).toBe(true);
    expect(blockedLines).toEqual([3]);
  });

  it("catches a registration number the school is already using", () => {
    const { problems, ready } = validateRows([row({ "Registration number": "REG-9" })], {
      ...school,
      existingRegistrations: ["reg-9"],
    });
    expect(ready).toEqual([]);
    expect(problems.some((p) => p.message.includes("already on the roll"))).toBe(true);
  });

  it("warns about a child who looks like one already enrolled, without blocking", () => {
    // Two children can share a name and a birthday. It is worth a second look,
    // not a refusal.
    const { ready, problems } = validateRows([row()], {
      ...school,
      existingIdentities: ["ayesha khan|2014-03-12"],
    });
    expect(ready).toHaveLength(1);
    expect(problems.some((p) => p.level === "warning" && p.message.includes("already on the roll"))).toBe(true);
  });

  it("warns when there is no way to reach a guardian", () => {
    const { ready, problems } = validateRows([row({ "Guardian phone": "", "Guardian email": "" })], school);
    // Still imported: a school with a paper register often has no numbers.
    expect(ready).toHaveLength(1);
    expect(problems.some((p) => p.level === "warning" && p.column === "Guardian phone")).toBe(true);
  });

  it("refuses an email that is not one", () => {
    const { problems, ready } = validateRows([row({ "Guardian email": "not-an-email" })], school);
    expect(ready).toEqual([]);
    expect(problems.some((p) => p.message.includes("is not an email address"))).toBe(true);
  });

  it("keeps a blank cell blank rather than filling it with a placeholder", () => {
    const { ready } = validateRows([row({ "Blood group": "", "Medical notes": "" })], school);
    expect(ready[0].values.blood_group).toBeNull();
    expect(ready[0].values.medical_notes).toBeNull();
  });

  it("carries every column of the template through", () => {
    const filled: RawRow = Object.fromEntries(
      IMPORT_COLUMNS.map((c) => [c.header, c.header === "Class" ? "Grade 5" : c.header === "Section" ? "A" : "x"]),
    ) as RawRow;
    filled["Date of birth"] = "12/03/2014";
    filled["Admission date"] = "01/04/2024";
    filled["Gender"] = "female";
    filled["Guardian email"] = "parent@example.com";

    const { ready, problems } = validateRows([filled], school);
    expect(problems.filter((p) => p.level === "error")).toEqual([]);
    for (const column of IMPORT_COLUMNS) {
      expect(ready[0].values, `${column.header} was dropped`).toHaveProperty(column.field);
    }
    expect(ready[0].values.admission_date).toBe("2024-04-01");
  });

  it("imports nothing from an empty file", () => {
    expect(validateRows([], school)).toEqual({ ready: [], problems: [], blockedLines: [] });
  });
});
