import { describe, expect, it } from "vitest";

import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { getWorkspaceCapabilitiesFromPermissions } from "@/lib/auth/capabilities";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permission-catalog";
import { buildWorkspacePermissionContext, hasPermission } from "@/lib/auth/permission-context";

function resolve(keys: PermissionKey[], branchId = "branch-a") {
  const result = buildWorkspacePermissionContext({
    branch: { id: branchId, status: "active" },
    customRole: { id: "synthetic-role", name: "Synthetic restricted role", permissionKeys: keys, status: "active" },
    ordinaryAccessActive: true,
    organizationId: "synthetic-company-a",
    roleKind: "custom",
    userId: "synthetic-user",
  });
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}

describe("restricted custom-role permission gaps", () => {
  it.each(PERMISSION_KEYS)("%s never grants unrelated operations", (key) => {
    const context = resolve([key]);
    for (const permission of PERMISSION_KEYS) {
      expect(hasPermission(context, permission)).toBe(
        permission === key || permission === `${key.split(".")[0]}.view`,
      );
    }
    expect(context.isSuperAdmin).toBe(false);
    expect(context.branchId).toBe("branch-a");
    expect(getWorkspaceCapabilitiesFromPermissions(context).canManageAccess).toBe(false);
  });

  it.each(["branch-a", "branch-b"])("all custom permissions still resolve only %s", (branch) => {
    const context = resolve([...PERMISSION_KEYS], branch);
    expect(context.branchId).toBe(branch);
    expect(context.organizationId).toBe("synthetic-company-a");
    const capabilities = getMaintenanceCapabilities(context);
    expect(capabilities.canCreateCase).toBe(true);
    expect(capabilities.canReviewCompletion).toBe(true);
    expect(capabilities.canExecuteAssignedCase).toBe(true);
    expect(capabilities.canUploadMaintenanceEvidence).toBe(false);
    expect(capabilities.canArchiveCase).toBe(false);
  });

  it("finance viewing and payment recording do not grant publication or report export", () => {
    const context = resolve(["finance.view", "finance.record_payments"]);
    const capabilities = getWorkspaceCapabilitiesFromPermissions(context);
    expect(capabilities.canReadFinance).toBe(true);
    expect(capabilities.canOperateFinance).toBe(true);
    expect(capabilities.canReadFinanceReports).toBe(false);
    expect(capabilities.canPublishOwnerStatement).toBe(false);
    expect(hasPermission(context, "leases.change_terms")).toBe(false);
  });

  it("publication currently bundles report reading and official statement publication", () => {
    const capabilities = getWorkspaceCapabilitiesFromPermissions(resolve(["finance.publish"]));
    expect(capabilities.canReadFinanceReports).toBe(true);
    expect(capabilities.canPublishOwnerStatement).toBe(true);
    expect(capabilities.canCorrectFinance).toBe(false);
    expect(capabilities.canOperateFinance).toBe(false);
  });

  it("lease term authority does not imply finance payment or correction permission", () => {
    const context = resolve(["leases.change_terms"]);
    expect(hasPermission(context, "leases.view")).toBe(true);
    expect(hasPermission(context, "finance.record_payments")).toBe(false);
    expect(hasPermission(context, "finance.correct_records")).toBe(false);
  });

  it("proposed granular keys remain rejected until approved and implemented", () => {
    const context = resolve([...PERMISSION_KEYS]);
    for (const key of ["maintenance.evidence", "maintenance.archive", "leases.record_deposits", "leases.reverse_deposits", "finance.reports_view", "finance.export"]) {
      expect(hasPermission(context, key)).toBe(false);
    }
  });
});
