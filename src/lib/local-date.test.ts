import { describe, expect, it } from "vitest";
import { localDay } from "./local-date";

describe("localDay", () => {
  it("gives the local calendar day, not the UTC one", () => {
    // Local midnight on the 1st: toISOString() would give the 31st in any
    // time zone east of UTC.
    expect(localDay(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(localDay(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(localDay(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("pads month and day", () => {
    expect(localDay(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("defaults to today", () => {
    const now = new Date();
    expect(localDay()).toBe(localDay(now));
  });
});
