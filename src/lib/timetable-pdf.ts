/**
 * Teacher timetable printing.
 *
 * Kept under the names the teacher screen imports. Printing and downloading
 * now produce a real PDF through `src/lib/documents/timetable.ts`; download
 * used to save an HTML page.
 */
import { toast } from "sonner";

import { downloadTimetable, printTimetable, type TimetableInput } from "@/lib/documents/timetable";

export type TimetablePdfEntry = {
  day_of_week: number;
  period_id: string;
  subject_name: string | null;
  room: string | null;
  section_label: string | null;
  teacher_name?: string | null;
};

export type TimetablePeriod = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  is_break?: boolean;
};

export type TimetablePdfData = {
  teacherName: string;
  schoolName: string;
  periods: TimetablePeriod[];
  entries: TimetablePdfEntry[];
  generatedAt: string;
};

function toInput(data: TimetablePdfData): TimetableInput {
  return {
    title: "Teacher Timetable",
    subject: data.teacherName,
    periods: data.periods,
    entries: data.entries,
    cellDetail: "section",
  };
}

async function run(kind: "print" | "download", data: TimetablePdfData) {
  const id = toast.loading("Preparing timetable…");
  try {
    const result: { warnings: string[]; fileName?: string } =
      kind === "print" ? await printTimetable(toInput(data)) : await downloadTimetable(toInput(data));
    const done = kind === "print" ? "Sent to print" : `Downloaded ${result.fileName}`;
    if (result.warnings.length) toast.warning(`${done}. Note: ${result.warnings.join("; ")}`, { id, duration: 9000 });
    else if (kind === "print") toast.dismiss(id);
    else toast.success(done, { id });
  } catch (e) {
    toast.error(`The timetable could not be produced: ${e instanceof Error ? e.message : String(e)}`, { id });
  }
}

/** Print the teacher's timetable. */
export function openTimetablePdf(data: TimetablePdfData): void {
  void run("print", data);
}

/** Download the teacher's timetable as a PDF (the name is kept for callers). */
export function downloadTimetableHtml(data: TimetablePdfData): void {
  void run("download", data);
}
