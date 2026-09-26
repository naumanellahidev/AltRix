/**
 * The calendar day of a moment, as "YYYY-MM-DD", in the viewer's own time zone.
 *
 * `date.toISOString().slice(0, 10)` gives the day in UTC. In Pakistan
 * (UTC+5) that is the previous day for anything before 5 a.m., and for every
 * local midnight: "this month" started on the 31st of the month before, and
 * attendance, expenses and payments stamped between midnight and 5 a.m. went
 * on the day before.
 */
export function localDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
