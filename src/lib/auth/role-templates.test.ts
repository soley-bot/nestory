import { describe, expect, it } from "vitest";
import { getWorkspaceCapabilitiesFromPermissions } from "./capabilities";
import { PROPERTY_MANAGER_TEMPLATE } from "./role-templates";
import { buildWorkspacePermissionContext } from "./permission-context";

describe("Property Manager template", () => {
  it("grants routine expense operations without review, deletion or broad financial authority", () => {
    const capabilities = getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin: false,
      permissionKeys: new Set(PROPERTY_MANAGER_TEMPLATE.permissions) });
    expect(capabilities).toMatchObject({ canPostExpense: true, canPostTenantExpense: true,
      canCorrectExpense: true, canSubmitExpense: true, canOperateFinance: true,
      canReverseExpense: false, canReviewExpense: false, canCorrectFinance: false,
      canManageAccess: false, canLockFinancialMonth: false, canPublishOwnerStatement: false });
    expect(PROPERTY_MANAGER_TEMPLATE.permissions.some(p => p.endsWith(".archive"))).toBe(false);
  });

  it("requires active branch and ordinary access before the template can authorize a member", () => {
    const input = { organizationId: "org", userId: "user", roleKind: "custom" as const,
      ordinaryAccessActive: true, branch: { id: "phnom-penh", status: "active" },
      customRole: { id: "pm", name: "Property Manager", status: "active",
        permissionKeys: PROPERTY_MANAGER_TEMPLATE.permissions } };
    expect(buildWorkspacePermissionContext(input)).toMatchObject({ ok: true,
      context: { branchId: "phnom-penh", isSuperAdmin: false } });
    expect(buildWorkspacePermissionContext({ ...input, branch: null })).toMatchObject({ ok: false });
    expect(buildWorkspacePermissionContext({ ...input, ordinaryAccessActive: false })).toMatchObject({ ok: false });
  });

  it("preserves old owner authority without granting tenant posting or broadening correction-only access", () => {
    for (const isSuperAdmin of [false, true]) {
      const old = getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin, permissionKeys: new Set([
        "finance.submit_expenses", "finance.approve_expenses", "finance.correct_records",
      ]) });
      expect(old.canPostExpense).toBe(true);
      expect(old.canPostTenantExpense).toBe(false);
    }
    const narrow = getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin: false,
      permissionKeys: new Set(["finance.submit_expenses", "finance.correct_expenses"]) });
    expect(narrow).toMatchObject({ canCorrectExpense: true, canPostExpense: false,
      canReviewExpense: false, canReverseExpense: false, canCorrectFinance: false });
  });
});
