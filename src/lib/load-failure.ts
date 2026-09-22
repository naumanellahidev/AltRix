/**
 * Say when a screen could not load its data.
 *
 * A `catch { console.error(e) }` around a data load is why a tab "looks
 * basic": the request failed, the list stayed empty, and the only place that
 * said so was a console nobody has open. An empty screen and a broken screen
 * then look identical — which is how a report card endpoint answered 500 for
 * every card in the database without anyone noticing.
 *
 * This reports the failure once, in the words of whoever it happened to, and
 * keeps the detail in the console for whoever is debugging.
 */
import { toast } from "sonner";

/** The reason, out of whatever the layer below threw. */
export function failureReason(error: unknown): string {
  if (!error) return "unknown error";
  const anyError = error as {
    response?: { data?: { detail?: unknown } };
    message?: string;
    error_description?: string;
  };
  const detail = anyError?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: any) => d?.msg ?? String(d)).join(", ");
  }
  if (typeof anyError?.message === "string" && anyError.message.trim()) return anyError.message;
  if (typeof anyError?.error_description === "string") return anyError.error_description;
  if (typeof error === "string") return error;
  return "unknown error";
}

/**
 * Report that one thing on the screen could not be loaded.
 *
 * `what` names it the way the user would: "the wellbeing records", "this
 * student's attendance". The same failure is not repeated within a few
 * seconds, so a screen that loads eight things does not stack eight toasts
 * over each other when the network drops.
 */
const recentlyReported = new Map<string, number>();
const REPEAT_WINDOW_MS = 5000;

export function reportLoadFailure(what: string, error: unknown): void {
  const reason = failureReason(error);
  const key = `${what}::${reason}`;
  const now = Date.now();
  const last = recentlyReported.get(key);
  if (last && now - last < REPEAT_WINDOW_MS) return;
  recentlyReported.set(key, now);

  // eslint-disable-next-line no-console
  console.error(`[load failed] ${what}:`, error);
  toast.error(`Could not load ${what}: ${reason}`, { duration: 8000 });
}
