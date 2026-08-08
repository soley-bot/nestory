import { describe, expect, it } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";

describe("getMaintenanceCapabilities", () => {
  it("gives Super Admin operational cost capture and Finance handoff", () => {
    expect(getMaintenanceCapabilities("super_admin")).toEqual({
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

  it("lets Operations Managers record and submit actual cost", () => {
    expect(getMaintenanceCapabilities("operations_manager")).toEqual({
      canArchiveCase: false,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canRecordActualCost: true,
      canReviewCompletion: true,
      canSubmitMaintenanceCost: true,
      canUploadMaintenanceEvidence: false,
    });
  });

  it("limits members to execution of their assigned work", () => {
    expect(getMaintenanceCapabilities("operations_member")).toEqual({
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

  it.each(["finance_manager", "finance_member"] as const)(
    "does not grant %s an operations capability",
    (role) => {
      expect(getMaintenanceCapabilities(role)).toEqual({
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
    },
  );
});
