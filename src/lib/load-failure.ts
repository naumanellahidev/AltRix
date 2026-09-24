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
/**
 * Background work: warmed caches, prefetches, polls.
 *
 * A failure there is not something the user asked for and cannot act on, so
 * it belongs in the console rather than across the screen. Counted rather
 * than a boolean, so two overlapping background runs do not un-suppress each
 * other when the first one finishes.
 */
const recentlyReported = new Map<string, number>();
const REPEAT_WINDOW_MS = 5000;

let backgroundDepth = 0;

export function beginBackgroundLoads(): void {
  backgroundDepth += 1;
}

export function endBackgroundLoads(): void {
  backgroundDepth = Math.max(0, backgroundDepth - 1);
}

export async function duringBackgroundLoads<T>(run: () => Promise<T>): Promise<T> {
  beginBackgroundLoads();
  try {
    return await run();
  } finally {
    endBackgroundLoads();
  }
}

/** True while a background warm-up is in flight. */
export function isBackgroundLoad(): boolean {
  return backgroundDepth > 0;
}

/** The status, when the failure came from an HTTP response. */
function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status
    ?? (error as { status?: number })?.status;
  return typeof status === "number" ? status : null;
}

export function reportLoadFailure(what: string, error: unknown): void {
  if (backgroundDepth > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[background load failed] ${what}:`, error);
    return;
  }

  // Being rate limited is one condition, not one per table. Saying it once
  // is the whole message; twelve toasts naming twelve tables is noise on top
  // of a problem the user cannot do anything about anyway.
  if (statusOf(error) === 429) {
    const now = Date.now();
    const last = recentlyReported.get("__rate_limited__");
    if (last && now - last < 15000) return;
    recentlyReported.set("__rate_limited__", now);
    // eslint-disable-next-line no-console
    console.warn(`[rate limited] while loading ${what}`);
    toast.error("The app is asking the server for too much at once. Give it a moment.", {
      duration: 6000,
    });
    return;
  }

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
