import { describe, expect, it } from "vitest";

import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

describe("getMaintenanceCapabilities", () => {
  it("keeps organization-wide archive and evidence authority Super-Admin-only", () => {
    expect(
      getMaintenanceCapabilities({
        isSuperAdmin: true,
        permissionKeys: new Set<PermissionKey>(),
      }),
    ).toEqual({
      canArchiveCase: true,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canRecordActualCost: true,
      canReviewCompletion: true,
      canSubmitMaintenanceCost: true,
      canUploadMaintenanceEvidence: true,
    });
  });

  it("derives coordinator behavior only from create-and-assign and review", () => {
    expect(capabilities("maintenance.create_assign")).toMatchObject({
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canRecordActualCost: true,
      canReviewCompletion: false,
      canSubmitMaintenanceCost: false,
    });
    expect(capabilities("maintenance.review")).toMatchObject({
      canAssignCase: false,
      canCreateCase: false,
      canExecuteAssignedCase: false,
      canManageCaseState: false,
      canReviewCompletion: true,
      canSubmitMaintenanceCost: true,
    });
  });

  it("limits complete authority to assigned execution", () => {
    expect(capabilities("maintenance.complete")).toEqual({
      canArchiveCase: false,
      canAssignCase: false,
      canCreateCase: false,
      canEditCaseStructure: false,
      canExecuteAssignedCase: true,
      canManageCaseState: false,
      canRecordActualCost: false,
      canReviewCompletion: false,
      canSubmitMaintenanceCost: false,
      canUploadMaintenanceEvidence: false,
    });
  });

  it("does not turn view-only access into mutation authority", () => {
    expect(capabilities("maintenance.view")).toEqual({
      canArchiveCase: false,
      canAssignCase: false,
      canCreateCase: false,
      canEditCaseStructure: false,
      canExecuteAssignedCase: false,
      canManageCaseState: false,
      canRecordActualCost: false,
      canReviewCompletion: false,
      canSubmitMaintenanceCost: false,
      canUploadMaintenanceEvidence: false,
    });
  });
});

function capabilities(...permissionKeys: PermissionKey[]) {
  return getMaintenanceCapabilities({
    isSuperAdmin: false,
    permissionKeys: new Set(permissionKeys),
  });
}
