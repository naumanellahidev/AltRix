import { useCallback } from "react";

import type { ExportRow } from "@/lib/report-export";

type PeriodRow = {
  id: string;
  label: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
};

type EntryRow = {
  id: string;
  day_of_week: number;
  period_id: string;
  subject_name: string;
  teacher_user_id: string | null;
  room: string | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeLabel(v: string | null) {
  if (!v) return "";
  return String(v).slice(0, 5);
}

/**
 * The timetable as export rows, in day and period order.
 *
 * The old export sorted after the fact by looking each row back up by day and
 * subject, which put periods out of order whenever a subject was taught twice
 * in a day. Entries are ordered first, then mapped.
 */
export function useTimetableExport(
  periods: PeriodRow[],
  entries: EntryRow[],
  teacherLabelByUserId: Map<string, string>,
  sectionLabel: string,
) {
  const rows = useCallback((): ExportRow[] => {
    const periodById = new Map(periods.map((p) => [p.id, p]));
    // Monday first, as a school week is read; Sunday last.
    const dayRank = (d: number) => (d === 0 ? 7 : d);
    return [...entries]
      .sort(
        (a, b) =>
          dayRank(a.day_of_week) - dayRank(b.day_of_week) ||
          (periodById.get(a.period_id)?.sort_order ?? 0) - (periodById.get(b.period_id)?.sort_order ?? 0),
      )
      .map((e) => {
        const period = periodById.get(e.period_id);
        return {
          Day: DAYS[e.day_of_week] ?? String(e.day_of_week),
          Period: period?.label ?? "",
          Start: timeLabel(period?.start_time ?? null),
          End: timeLabel(period?.end_time ?? null),
          Subject: e.subject_name,
          Teacher: e.teacher_user_id ? teacherLabelByUserId.get(e.teacher_user_id) ?? "" : "",
          Room: e.room ?? "",
        };
      });
  }, [periods, entries, teacherLabelByUserId]);

  return { rows, title: "Class Timetable", subtitle: sectionLabel };
}
