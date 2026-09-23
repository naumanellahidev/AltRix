/**
 * Bringing a paper register into the app.
 *
 * A school joining AltRix has its students in a ledger, not in a database.
 * Typing four hundred children in one at a time is why a school gives up on
 * the first afternoon, so this takes the spreadsheet they already keep — or
 * the template below, which is the same thing with the columns named — and
 * turns it into students, enrolments and guardians.
 *
 * The rules it works by, all of which exist because getting them wrong is
 * worse than not importing at all:
 *
 *   - **Nothing is guessed.** A date it cannot read is reported as a problem
 *     on that row, not silently replaced with today. A class name that does
 *     not match one of the school's classes is a problem, not a new class
 *     invented on the school's behalf.
 *   - **A blank cell stays blank.** An empty blood group is an empty blood
 *     group, never "unknown" and never a made-up value.
 *   - **Every row is checked before any row is written**, and the office sees
 *     exactly what will happen before it happens.
 *   - **Duplicates are found twice over**: against the rest of the file, and
 *     against the students the school already has.
 *
 * The parsing here is deliberately separate from the screen, so it can be
 * tested against the spreadsheets real schools actually send.
 */
import { buildSpreadsheet } from "@/lib/documents/spreadsheet";
import { triggerDownload } from "@/lib/documents/deliver";

/** A column of the import template. */
export interface ImportColumn {
  /** The heading as it appears in the sheet. */
  header: string;
  /** The field it fills on the student. */
  field: string;
  required?: boolean;
  /** Shown in the template's notes row, so nobody has to guess the format. */
  hint: string;
  width?: number;
}

/**
 * The template.
 *
 * Kept to what a paper register actually holds. Anything a school has not
 * written down should be left blank rather than invented to fill a column.
 */
export const IMPORT_COLUMNS: ImportColumn[] = [
  { header: "First name", field: "first_name", required: true, hint: "Required", width: 18 },
  { header: "Last name", field: "last_name", hint: "Leave blank if the register has only one name", width: 18 },
  { header: "Class", field: "class_name", required: true, hint: "Must match a class you have already created", width: 14 },
  { header: "Section", field: "section_name", hint: "Leave blank if the class has only one section", width: 12 },
  { header: "Roll number", field: "roll_number", hint: "As written in the register", width: 12 },
  { header: "Registration number", field: "registration_number", hint: "The school's own admission number", width: 18 },
  { header: "Date of birth", field: "date_of_birth", hint: "DD/MM/YYYY or YYYY-MM-DD", width: 14 },
  { header: "Gender", field: "gender", hint: "male / female / other — or leave blank", width: 10 },
  { header: "Admission date", field: "admission_date", hint: "DD/MM/YYYY — when the child joined", width: 14 },
  { header: "Guardian name", field: "parent_name", hint: "Father, mother or guardian", width: 20 },
  { header: "Guardian phone", field: "parent_phone", hint: "03xx-xxxxxxx", width: 16 },
  { header: "Guardian email", field: "parent_email", hint: "Needed for the parent portal login", width: 24 },
  { header: "Address", field: "address", hint: "", width: 28 },
  { header: "City", field: "city", hint: "", width: 14 },
  { header: "Area", field: "area", hint: "", width: 14 },
  { header: "Student phone", field: "student_phone", hint: "", width: 16 },
  { header: "Blood group", field: "blood_group", hint: "A+, O-, … — leave blank if not recorded", width: 12 },
  { header: "Emergency contact", field: "emergency_contact", hint: "Name and number", width: 22 },
  { header: "Medical notes", field: "medical_notes", hint: "Allergies, conditions the school must know", width: 28 },
  { header: "Notes", field: "notes", hint: "", width: 24 },
];

export type RawRow = Record<string, string>;

/** One row, once it has been read and checked. */
export interface ImportRow {
  /** 1-based row number in the sheet, so a problem can be pointed at. */
  line: number;
  values: Record<string, string | null>;
  classSectionId: string | null;
  className: string;
  sectionName: string | null;
}

export type ProblemLevel = "error" | "warning";

export interface RowProblem {
  line: number;
  column: string;
  level: ProblemLevel;
  /** What is wrong, in words the office can act on. */
  message: string;
}

export interface SchoolStructure {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string; class_id: string }>;
  /** Registration numbers already in use, to catch a re-import. */
  existingRegistrations?: string[];
  /** "first last|dob" for students already on the roll. */
  existingIdentities?: string[];
}

export interface ValidationResult {
  ready: ImportRow[];
  problems: RowProblem[];
  /** Rows that will be skipped because something on them is an error. */
  blockedLines: number[];
}

const norm = (v: unknown): string => String(v ?? "").trim();
const lower = (v: unknown): string => norm(v).toLowerCase();

/**
 * A date from a spreadsheet, or null.
 *
 * Schools write dates every way there is. What this will not do is pick one
 * when the answer is genuinely ambiguous in a way that changes the child's
 * age — it reads day-first, which is how dates are written in Pakistan, and
 * anything that cannot be read that way is reported rather than coerced.
 */
export function parseSheetDate(value: unknown): { date: string | null; problem: string | null } {
  const raw = norm(value);
  if (!raw) return { date: null, problem: null };

  // Excel hands back a real Date for a real date cell.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { date: value.toISOString().slice(0, 10), problem: null };
  }

  // ISO, which is unambiguous.
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return buildDate(Number(y), Number(m), Number(d), raw);
  }

  // Day-first, with any of the usual separators.
  const dmy = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return buildDate(year, Number(m), Number(d), raw);
  }

  return { date: null, problem: `"${raw}" is not a date this can read — write it as DD/MM/YYYY` };
}

function buildDate(y: number, m: number, d: number, raw: string) {
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { date: null, problem: `"${raw}" is not a real date` };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 February rather than rolling it into March.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { date: null, problem: `"${raw}" is not a real date` };
  }
  if (y < 1900 || date.getTime() > Date.now() + 86400000) {
    return { date: null, problem: `"${raw}" is outside the range a birth or admission date can be in` };
  }
  return { date: date.toISOString().slice(0, 10), problem: null };
}

/** male / female / other, or null. Never a guess from a name. */
export function parseGender(value: unknown): { gender: string | null; problem: string | null } {
  const raw = lower(value);
  if (!raw) return { gender: null, problem: null };
  if (["m", "male", "boy", "b"].includes(raw)) return { gender: "male", problem: null };
  if (["f", "female", "girl", "g"].includes(raw)) return { gender: "female", problem: null };
  if (["o", "other"].includes(raw)) return { gender: "other", problem: null };
  return { gender: null, problem: `"${norm(value)}" is not a gender this recognises — use male, female or other` };
}

/**
 * Check every row against the school's own classes and its existing roll.
 *
 * Nothing is written here. The caller shows the result and only then decides.
 */
export function validateRows(rows: RawRow[], structure: SchoolStructure): ValidationResult {
  const problems: RowProblem[] = [];
  const ready: ImportRow[] = [];
  const blocked = new Set<number>();

  const byClass = new Map(structure.classes.map((c) => [lower(c.name), c]));
  const existingRegs = new Set((structure.existingRegistrations ?? []).map(lower));
  const existingIdentities = new Set((structure.existingIdentities ?? []).map(lower));

  const seenRegs = new Map<string, number>();
  const seenIdentities = new Map<string, number>();

  rows.forEach((raw, index) => {
    // +2: one for the header row, one because spreadsheets count from 1.
    const line = index + 2;
    const add = (column: string, level: ProblemLevel, message: string) => {
      problems.push({ line, column, level, message });
      if (level === "error") blocked.add(line);
    };

    const values: Record<string, string | null> = {};
    for (const column of IMPORT_COLUMNS) {
      values[column.field] = norm(raw[column.header]) || null;
    }

    if (!values.first_name) add("First name", "error", "A first name is required");

    // ── The class and section have to be ones the school actually has ──────
    const className = norm(raw["Class"]);
    let classSectionId: string | null = null;
    let sectionName: string | null = norm(raw["Section"]) || null;

    if (!className) {
      add("Class", "error", "A class is required — create the class first, then import into it");
    } else {
      const cls = byClass.get(lower(className));
      if (!cls) {
        add(
          "Class",
          "error",
          `There is no class called "${className}" — create it under Academic first; nothing is created automatically`,
        );
      } else {
        const inClass = structure.sections.filter((s) => s.class_id === cls.id);
        if (sectionName) {
          const match = inClass.find((s) => lower(s.name) === lower(sectionName!));
          if (!match) {
            add("Section", "error", `"${className}" has no section called "${sectionName}"`);
          } else {
            classSectionId = match.id;
            sectionName = match.name;
          }
        } else if (inClass.length === 1) {
          classSectionId = inClass[0].id;
          sectionName = inClass[0].name;
        } else if (inClass.length === 0) {
          add("Section", "error", `"${className}" has no sections yet — add one before importing into it`);
        } else {
          add(
            "Section",
            "error",
            `"${className}" has ${inClass.length} sections, so the section has to be named on this row`,
          );
        }
      }
    }

    // ── Dates ──────────────────────────────────────────────────────────────
    const dob = parseSheetDate(raw["Date of birth"]);
    if (dob.problem) add("Date of birth", "error", dob.problem);
    values.date_of_birth = dob.date;

    const adm = parseSheetDate(raw["Admission date"]);
    if (adm.problem) add("Admission date", "error", adm.problem);
    values.admission_date = adm.date;

    // ── Gender ─────────────────────────────────────────────────────────────
    const gender = parseGender(raw["Gender"]);
    if (gender.problem) add("Gender", "error", gender.problem);
    values.gender = gender.gender;

    // ── Contact details, checked but never corrected ───────────────────────
    const email = values.parent_email;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      add("Guardian email", "error", `"${email}" is not an email address`);
    }
    if (!values.parent_phone && !values.parent_email) {
      add(
        "Guardian phone",
        "warning",
        "No way to reach a guardian — the family will not be able to use the parent portal",
      );
    }

    // ── Duplicates, inside the file and against the roll ───────────────────
    const reg = values.registration_number;
    if (reg) {
      const key = lower(reg);
      if (seenRegs.has(key)) {
        add("Registration number", "error", `The same registration number is on row ${seenRegs.get(key)}`);
      } else {
        seenRegs.set(key, line);
      }
      if (existingRegs.has(key)) {
        add("Registration number", "error", `A student with registration number ${reg} is already on the roll`);
      }
    }

    const identity = lower(`${values.first_name ?? ""} ${values.last_name ?? ""}|${values.date_of_birth ?? ""}`);
    if (values.first_name && values.date_of_birth) {
      if (seenIdentities.has(identity)) {
        add("First name", "warning", `The same name and date of birth is on row ${seenIdentities.get(identity)}`);
      } else {
        seenIdentities.set(identity, line);
      }
      if (existingIdentities.has(identity)) {
        add("First name", "warning", "A student with this name and date of birth is already on the roll");
      }
    }

    if (!blocked.has(line)) {
      ready.push({
        line,
        values,
        classSectionId,
        className,
        sectionName,
      });
    }
  });

  return { ready, problems, blockedLines: [...blocked].sort((a, b) => a - b) };
}

/**
 * Read the first sheet of a workbook into rows keyed by their heading.
 *
 * Headings are matched case- and space-insensitively, so a school that has
 * typed "First Name" or "first name " into its own file is not turned away.
 */
export async function readWorkbook(file: File | ArrayBuffer): Promise<{ rows: RawRow[]; unknownHeaders: string[] }> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], unknownHeaders: [] };

  const key = (v: unknown) => lower(v).replace(/\s+/g, " ");
  const known = new Map(IMPORT_COLUMNS.map((c) => [key(c.header), c.header]));

  const headerRow = sheet.getRow(1);
  const headers: Array<string | null> = [];
  const unknownHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
    const text = norm(cell.value);
    const mapped = known.get(key(text));
    headers[index] = mapped ?? null;
    if (text && !mapped) unknownHeaders.push(text);
  });

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawRow = {};
    let any = false;
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const header = headers[index];
      if (!header) return;
      // A date cell comes back as a Date; everything else as its text.
      const value = cell.value;
      const text =
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : typeof value === "object" && value && "text" in (value as any)
            ? norm((value as any).text)
            : typeof value === "object" && value && "result" in (value as any)
              ? norm((value as any).result)
              : norm(value);
      if (text) any = true;
      record[header] = text;
    });
    // A blank line in the middle of a register is not a student.
    if (any) rows.push(record);
  });

  return { rows, unknownHeaders };
}

/**
 * The template, as an .xlsx the school can fill in.
 *
 * The first sheet is the one to type into; the second explains every column,
 * because a template whose rules live in a support article is a template
 * nobody fills in correctly.
 */
export async function downloadImportTemplate(options: {
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; name: string; class_id: string }>;
}): Promise<void> {
  const classLabel = (id: string) => options.classes.find((c) => c.id === id)?.name ?? "";

  const result = await buildSpreadsheet({
    fileNameParts: ["Student import template"],
    sheets: [
      {
        name: "Students",
        title: "Student import",
        subtitle: "One row per child. Leave a cell blank rather than guessing at it.",
        columns: IMPORT_COLUMNS.map((c) => ({
          header: c.header,
          key: c.field,
          type: c.field.endsWith("_date") || c.field === "date_of_birth" ? ("date" as const) : ("text" as const),
          width: c.width,
        })),
        rows: [],
        emptyMessage: "Type the register in below this row.",
      },
      {
        name: "How to fill this in",
        title: "What each column means",
        subtitle: "Nothing is created automatically — a class or section named here must already exist.",
        columns: [
          { header: "Column", key: "header", width: 22 },
          { header: "Required", key: "required", width: 10 },
          { header: "What to write", key: "hint", width: 52 },
        ],
        rows: IMPORT_COLUMNS.map((c) => ({
          header: c.header,
          required: c.required ? "Yes" : "",
          hint: c.hint || "As it appears in your register",
        })),
      },
      {
        name: "Your classes",
        title: "Classes and sections you can import into",
        subtitle: "Copy these names exactly into the Class and Section columns.",
        columns: [
          { header: "Class", key: "class_name", width: 20 },
          { header: "Section", key: "section_name", width: 20 },
        ],
        rows: options.sections.length
          ? options.sections.map((s) => ({ class_name: classLabel(s.class_id), section_name: s.name }))
          : options.classes.map((c) => ({ class_name: c.name, section_name: "" })),
        emptyMessage: "You have not created any classes yet. Create them under Academic first.",
      },
    ],
  });

  triggerDownload(result.blob, result.fileName);
}
