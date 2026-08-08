import { describe, expect, it } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";

describe("getMaintenanceCapabilities", () => {
  it("gives admins operational cost capture and official finance posting", () => {
    expect(getMaintenanceCapabilities("super_admin")).toEqual({
      canArchiveCase: true,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canPostMaintenanceCost: true,
      canRecordActualCost: true,
      canReviewCompletion: true,
      canUploadMaintenanceEvidence: true,
    });
  });

  it("lets managers record actual cost without posting official finance effects", () => {
    expect(getMaintenanceCapabilities("operations_manager")).toEqual({
      canArchiveCase: false,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canPostMaintenanceCost: false,
      canRecordActualCost: true,
      canReviewCompletion: true,
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
      canPostMaintenanceCost: false,
      canRecordActualCost: false,
      canReviewCompletion: false,
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
        canPostMaintenanceCost: false,
        canRecordActualCost: false,
        canReviewCompletion: false,
        canUploadMaintenanceEvidence: false,
      });
    },
  );
});
