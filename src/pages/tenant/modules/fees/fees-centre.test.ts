/**
 * The Fees Centre's shape.
 *
 * Three sidebar tabs — Fees Center, Fee Configurations, Finance & Cashflow —
 * used to render the same component, and inside it three vague labels held
 * five jobs between them. These tests hold the new arrangement in place: one
 * job per tab, and every link that used to work still lands somewhere sensible.
 */
import { describe, expect, it } from "vitest";
import { LEGACY_TABS, TABS } from "./FeesCentreModule";
import { MODULE_REGISTRY } from "@/lib/module-registry";

describe("the Fees Centre tabs", () => {
  it("covers the office's work in the order it is done", () => {
    expect(TABS.map((t) => t.value)).toEqual([
      "board",
      "structure",
      "ledger",
      "billing",
      "collections",
      "defaulters",
    ]);
  });

  it("gives every tab a label and a sentence saying what it is for", () => {
    for (const tab of TABS) {
      expect(tab.label.length).toBeGreaterThan(3);
      expect(tab.hint.length).toBeGreaterThan(12);
      // "Advanced Operations" told nobody anything.
      expect(tab.label).not.toMatch(/advanced|misc|other/i);
    }
  });

  it("keeps every old deep link working", () => {
    const values = new Set<string>(TABS.map((t) => t.value));
    for (const [legacy, target] of Object.entries(LEGACY_TABS)) {
      expect(values.has(target), `${legacy} → ${target}`).toBe(true);
    }
    // The three the old module published.
    expect(LEGACY_TABS.plans).toBe("structure");
    expect(LEGACY_TABS.advanced).toBe("ledger");
    expect(LEGACY_TABS.vouchers).toBe("billing");
  });
});

describe("the finance sidebar", () => {
  it("no longer points three tabs at one component", () => {
    const fees = MODULE_REGISTRY.fees.Component;
    const config = MODULE_REGISTRY["admin-fees"].Component;
    const cashflow = MODULE_REGISTRY.finance.Component;

    expect(fees).not.toBe(config);
    expect(fees).not.toBe(cashflow);
    expect(config).not.toBe(cashflow);
  });

  it("keeps payments and expenses as screens of their own", () => {
    expect(MODULE_REGISTRY.payments.Component).toBeDefined();
    expect(MODULE_REGISTRY.expenses.Component).toBeDefined();
    expect(MODULE_REGISTRY.payments.Component).not.toBe(MODULE_REGISTRY.fees.Component);
    expect(MODULE_REGISTRY.expenses.Component).not.toBe(MODULE_REGISTRY.fees.Component);
  });
});
