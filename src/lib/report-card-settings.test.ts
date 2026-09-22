/**
 * The school's print answer.
 *
 * It is asked once and then followed, so the two things that matter are that
 * a school which has never been asked is recognised as such, and that a read
 * which fails is not mistaken for one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const insert = vi.fn(async () => ({ error: null }));
const updateEq = vi.fn(async () => ({ error: null }));
const update = vi.fn(() => ({ eq: updateEq }));
const from = vi.fn(() => ({ select, insert, update }));

vi.mock("@/lib/api", () => ({ api: { from: (...args: unknown[]) => from(...(args as [])) } }));

import {
  DEFAULT_PRINT_SETTINGS,
  loadReportCardSettings,
  saveReportCardSettings,
} from "./report-card-settings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loading", () => {
  it("treats a school with no row as never asked", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const stored = await loadReportCardSettings("school-1");
    expect(stored.configured).toBe(false);
    expect(stored.settings).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it("treats a stored row with no configured_at as never asked", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "r1", fit_strategy: "landscape", template: "modern", show_photo: false, configured_at: null },
      error: null,
    });
    const stored = await loadReportCardSettings("school-1");
    expect(stored.configured).toBe(false);
    expect(stored.settings.fitStrategy).toBe("landscape");
    expect(stored.settings.showPhoto).toBe(false);
  });

  it("reads a configured school", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "r1",
        fit_strategy: "two_pages",
        template: "minimal",
        show_photo: true,
        show_attendance: false,
        show_activities: true,
        show_term_trend: false,
        show_grade_key: true,
        show_rank: true,
        configured_at: "2026-09-22T10:00:00Z",
      },
      error: null,
    });
    const stored = await loadReportCardSettings("school-1");
    expect(stored.configured).toBe(true);
    expect(stored.id).toBe("r1");
    expect(stored.settings).toEqual({
      fitStrategy: "two_pages",
      template: "minimal",
      showPhoto: true,
      showAttendance: false,
      showActivities: true,
      showTermTrend: false,
      showGradeKey: true,
      showRank: true,
    });
  });

  it("refuses to pass a failed read off as 'never asked'", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(loadReportCardSettings("school-1")).rejects.toThrow("permission denied");
  });

  it("falls back to an unknown value rather than storing nonsense", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "r1", fit_strategy: "sideways", template: "neon", configured_at: "2026-09-22T10:00:00Z" },
      error: null,
    });
    const stored = await loadReportCardSettings("school-1");
    expect(stored.settings.fitStrategy).toBe("compact");
    expect(stored.settings.template).toBe("classic");
  });
});

describe("saving", () => {
  it("marks the school as asked", async () => {
    await saveReportCardSettings("school-1", DEFAULT_PRINT_SETTINGS, { id: null });
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.school_id).toBe("school-1");
    expect(payload.configured_at).toBeTruthy();
  });

  it("updates the row a school already has rather than adding another", async () => {
    await saveReportCardSettings("school-1", DEFAULT_PRINT_SETTINGS, { id: "r1" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith("id", "r1");
  });

  it("reports a failed save instead of pretending it worked", async () => {
    updateEq.mockResolvedValueOnce({ error: { message: "read only" } });
    await expect(
      saveReportCardSettings("school-1", DEFAULT_PRINT_SETTINGS, { id: "r1" }),
    ).rejects.toThrow("read only");
  });
});
