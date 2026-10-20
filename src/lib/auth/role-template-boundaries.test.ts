import { describe, expect, it } from "vitest";
import { getWorkspaceCapabilities, getWorkspaceCapabilitiesFromPermissions } from "./capabilities";
import { buildWorkspacePermissionContext } from "./permission-context";
import { normalizePermissionSelection } from "./permission-catalog";
import { OPERATIONS_TEMPLATE, PROPERTY_FINANCE_TEMPLATE } from "./role-templates";

describe("optional role boundaries", () => {
  it("supports property, people, lease and audited finance workflows including approval", () => {
    expect(PROPERTY_FINANCE_TEMPLATE.permissions).toEqual([
      "properties.view", "properties.write", "properties.archive",
      "people.view", "people.write", "people.archive",
      "leases.view", "leases.prepare", "leases.activate", "leases.change_terms", "leases.close", "leases.archive",
      "finance.view", "finance.record_payments", "finance.submit_expenses",
      "finance.approve_expenses", "finance.post_expenses", "finance.correct_expenses", "finance.correct_records",
    ]);
    expect(getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin: false,
      permissionKeys: new Set(PROPERTY_FINANCE_TEMPLATE.permissions) })).toMatchObject({
      canPostTenantExpense: true, canCorrectExpense: true, canOperateFinance: true,
      canReviewExpense: true, canReverseExpense: true, canCorrectFinance: true,
      canReviewOwnerOpeningBalance: true, canManagePettyCash: true, canConfigureLeases: true,
      canReopenOwnerMonth: false, canUnlockFinancialMonth: false,
      canLockFinancialMonth: false, canPublishOwnerStatement: false, canManageAccess: false,
    });
  });

  it("keeps Operations out of general finance while allowing maintenance work and property context", () => {
    expect(OPERATIONS_TEMPLATE.permissions).toEqual([
      "properties.view", "maintenance.view", "maintenance.create_assign", "maintenance.complete", "maintenance.review",
    ]);
    expect(getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin: false,
      permissionKeys: new Set(OPERATIONS_TEMPLATE.permissions) })).toMatchObject({
      canManageOperations: true, canExecuteOperations: true, canReadFinance: false,
      canOperateFinance: false, canSubmitExpense: false, canConfigureLeases: false,
      canManageAccess: false,
    });
  });

  it.each([PROPERTY_FINANCE_TEMPLATE, OPERATIONS_TEMPLATE])("requires independent active branch and access for $name", template => {
    expect(normalizePermissionSelection(template.permissions)).toEqual(template.permissions);
    const input = { organizationId: "org", userId: "user", roleKind: "custom" as const,
      ordinaryAccessActive: true, branch: { id: "pp", status: "active" },
      customRole: { id: "custom", name: template.name, status: "active", permissionKeys: template.permissions } };
    expect(buildWorkspacePermissionContext(input)).toMatchObject({ ok: true, context: { branchId: "pp" } });
    expect(buildWorkspacePermissionContext({ ...input, branch: null })).toMatchObject({ ok: false });
    expect(buildWorkspacePermissionContext({ ...input, ordinaryAccessActive: false })).toMatchObject({ ok: false });
    expect(buildWorkspacePermissionContext({ ...input, branch: { id: "pp", status: "inactive" } })).toMatchObject({ ok: false });
  });

  it("leaves Super Admin and legacy Operations compatibility unchanged", () => {
    expect(getWorkspaceCapabilitiesFromPermissions({ isSuperAdmin: true, permissionKeys: new Set() }))
      .toEqual(getWorkspaceCapabilities("super_admin"));
    expect(getWorkspaceCapabilities("operations_member")).toMatchObject({ canExecuteOperations: true, canManageOperations: false });
    expect(getWorkspaceCapabilities("operations_manager")).toMatchObject({ canExecuteOperations: true, canManageOperations: true });
  });
});
