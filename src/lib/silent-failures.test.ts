/**
 * Nothing fails in silence.
 *
 * The single most common defect across the whole shell was a screen drawing an
 * empty table over a request that never succeeded. `const { data = [] } =
 * useQuery(...)` and `const { data } = await api.from(...)` both throw the
 * error half away, and there are well over a hundred of them; a permissions
 * error and a school with no records then look exactly alike. It is how a
 * report card endpoint answered 500 for every card in the database without
 * anyone noticing.
 *
 * Fixing the call sites one at a time is worth doing where a screen deserves
 * a proper inline state, and the bigger ones now have one. The *guarantee*
 * lives in two places instead: the query cache, and the data layer. These
 * tests are here so neither can be quietly removed again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "..", "..", rel), "utf8");

const app = read("src/App.tsx");
const api = read("src/lib/api.ts");
const loadFailure = read("src/lib/load-failure.ts");

describe("every failed query is reported", () => {
  it("the query client has an error handler on its cache", () => {
    // Without a QueryCache the onError has nowhere to live, and every
    // useQuery in the app goes back to failing quietly.
    expect(app).toContain("new QueryCache(");
    expect(app).toMatch(/onError:\s*\(error,\s*query\)/);
    expect(app).toContain("reportLoadFailure(");
  });

  it("names what failed from the query's own key", () => {
    // Keys in this app read ["ledger_payments", schoolId, …], so the first
    // element is the closest thing to a name the user would recognise.
    expect(app).toContain("query.queryKey[0]");
  });

  it("lets a query opt out when a failure really is not worth a word", () => {
    expect(app).toContain("query.meta?.silent");
  });
});

describe("every failed read through the data layer is reported", () => {
  it("reports a select that came back with an error", () => {
    expect(api).toContain("reportLoadFailure(");
    expect(api).toMatch(/res\.error && this\.context\.action === 'select'/);
  });

  it("does not report a .single() that simply matched nothing", () => {
    // "Row not found" is a normal answer the caller handles, not a failure
    // to interrupt anyone with.
    expect(api).toContain("res.error.message !== 'Row not found'");
  });

  it("leaves writes alone, which report through their own toast", () => {
    // The guard is on 'select'; a mutation already tells the user what
    // happened and queues itself when offline.
    const guard = api.slice(api.indexOf("reportLoadFailure(") - 400, api.indexOf("reportLoadFailure(") + 120);
    expect(guard).toContain("=== 'select'");
  });
});

describe("the reporter itself", () => {
  it("says the same thing once, not once per query on the screen", () => {
    // A tab that loads eight things must not stack eight identical toasts
    // when the network drops.
    expect(loadFailure).toContain("REPEAT_WINDOW_MS");
    expect(loadFailure).toContain("recentlyReported");
  });

  it("uses the reason the layer below gave, not a generic message", () => {
    expect(loadFailure).toContain("response?.data?.detail");
    expect(loadFailure).toContain("failureReason");
  });
});
