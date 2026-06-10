import { describe, it, expect } from "vitest";
import { resolvePermissions } from "@/lib/permissions";
import type { EduverseRole } from "@/lib/eduverse-roles";

/**
 * Verifies that the centralized permission resolver (consumed by both
 * the sidebar and RouteGuard) correctly blocks unauthorized navigation
 * and allows only role-mapped module paths.
 */

describe("resolvePermissions / RouteGuard logic", () => {
  it("returns no allowed module paths when roles is empty (except root)", () => {
    const p = resolvePermissions([]);
    expect(p.canAccess("")).toBe(true);                  // dashboard root
    expect(p.canAccess("users")).toBe(false);
    expect(p.canAccess("finance")).toBe(false);
    expect(p.canAccess("fees-pro")).toBe(false);
    expect(p.visibleModules.length).toBe(0);
  });

  it("teacher: allows teaching modules, blocks admin/finance/CRM", () => {
    const p = resolvePermissions(["teacher"]);
    // Allowed
    for (const path of ["academic", "timetable", "attendance", "exams", "report-cards", "diary", "messages"]) {
      expect(p.canAccess(path)).toBe(true);
    }
    // Blocked
    for (const path of ["fees-pro", "finance", "admin", "schools", "crm", "users"]) {
      expect(p.canAccess(path)).toBe(false);
    }
    expect(p.actions.canManageStaff).toBe(false);
    expect(p.actions.canManageFinance).toBe(false);
  });

  it("accountant: allows finance, blocks academics governance & staff mgmt", () => {
    const p = resolvePermissions(["accountant"]);
    expect(p.canAccess("fees-pro")).toBe(true);
    expect(p.canAccess("fee-vouchers")).toBe(true);
    expect(p.canAccess("finance")).toBe(true);
    expect(p.canAccess("users")).toBe(false);
    expect(p.canAccess("academic")).toBe(false);
    expect(p.actions.canManageFinance).toBe(true);
    expect(p.actions.canManageStaff).toBe(false);
  });

  it("hr_manager: allows staff + leaves view, blocks finance/admin console", () => {
    const p = resolvePermissions(["hr_manager"]);
    expect(p.canAccess("users")).toBe(true);
    expect(p.canAccess("admin")).toBe(false);
    expect(p.canAccess("finance")).toBe(false);
    expect(p.actions.canManageStaff).toBe(true);
  });

  it("student/parent: cannot reach governance or finance back-office", () => {
    for (const role of ["student", "parent"] as EduverseRole[]) {
      const p = resolvePermissions([role]);
      expect(p.canAccess("users")).toBe(false);
      expect(p.canAccess("crm")).toBe(false);
      expect(p.canAccess("admin")).toBe(false);
      expect(p.canAccess("fees-pro")).toBe(false);
      expect(p.canAccess("finance")).toBe(false);
      // But messaging and notices are allowed
      expect(p.canAccess("messages")).toBe(true);
      expect(p.canAccess("notices")).toBe(true);
    }
  });

  it("super_admin: unlocks admin console & schools", () => {
    const p = resolvePermissions(["super_admin"]);
    expect(p.canAccess("admin")).toBe(true);
    expect(p.canAccess("schools")).toBe(true);
    expect(p.canAccess("finance")).toBe(true);
    expect(p.canAccess("users")).toBe(true);
  });

  it("principal: full governance including inherited counselor modules", () => {
    const p = resolvePermissions(["principal"]);
    expect(p.canAccess("complaints")).toBe(true);
    expect(p.canAccess("parent-notes")).toBe(true);
    expect(p.canAccess("users")).toBe(true);
    expect(p.canAccess("fees-pro")).toBe(true);
    expect(p.canAccess("leaves")).toBe(true);
    expect(p.canAccess("counseling")).toBe(true);
    expect(p.actions.canModerateComplaints).toBe(true);
  });

  it("school_owner: inherits every tenant workspace module", () => {
    const p = resolvePermissions(["school_owner"]);
    for (const path of [
      "users", "leaves", "academic", "timetable", "attendance", "exams",
      "report-cards", "diary", "fees-pro", "fee-vouchers", "finance",
      "admissions", "crm", "reports", "complaints", "parent-notes",
      "counseling", "messages", "notices", "holidays", "support",
    ]) {
      expect(p.canAccess(path)).toBe(true);
    }
  });

  it("multi-role (principal + accountant): union of permissions", () => {
    const p = resolvePermissions(["principal", "accountant"]);
    expect(p.canAccess("users")).toBe(true);
    expect(p.canAccess("finance")).toBe(true);
    expect(p.canAccess("fees-pro")).toBe(true);
    expect(p.canAccess("complaints")).toBe(true);
    expect(p.actions.canManageFinance).toBe(true);
    expect(p.actions.canModerateComplaints).toBe(true);
  });

  it("canAccess normalizes leading slashes, querystrings and sub-paths", () => {
    const p = resolvePermissions(["teacher"]);
    expect(p.canAccess("/attendance")).toBe(true);
    expect(p.canAccess("attendance?date=today")).toBe(true);
    expect(p.canAccess("attendance/123")).toBe(true);
    expect(p.canAccess("/fees-pro?x=1")).toBe(false);
  });

  it("unknown paths are blocked for every role", () => {
    for (const role of [
      "teacher", "accountant", "principal", "student", "parent", "hr_manager",
    ] as EduverseRole[]) {
      const p = resolvePermissions([role]);
      expect(p.canAccess("__hax__")).toBe(false);
      expect(p.canAccess("internal-secret-panel")).toBe(false);
    }
  });
});
