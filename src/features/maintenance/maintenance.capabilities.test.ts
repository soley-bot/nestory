import { describe, expect, it } from "vitest";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";

describe("getMaintenanceCapabilities", () => {
  it("gives admins operational cost capture and official finance posting", () => {
    expect(getMaintenanceCapabilities("admin")).toEqual({
      canArchiveCase: true,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canPostMaintenanceCost: true,
      canRecordActualCost: true,
      canReviewCompletion: true,
    });
  });

  it("lets managers record actual cost without posting official finance effects", () => {
    expect(getMaintenanceCapabilities("manager")).toEqual({
      canArchiveCase: false,
      canAssignCase: true,
      canCreateCase: true,
      canEditCaseStructure: true,
      canExecuteAssignedCase: false,
      canManageCaseState: true,
      canPostMaintenanceCost: false,
      canRecordActualCost: true,
      canReviewCompletion: true,
    });
  });

  it("limits members to execution of their assigned work", () => {
    expect(getMaintenanceCapabilities("member")).toEqual({
      canArchiveCase: false,
      canAssignCase: false,
      canCreateCase: false,
      canEditCaseStructure: false,
      canExecuteAssignedCase: true,
      canManageCaseState: false,
      canPostMaintenanceCost: false,
      canRecordActualCost: false,
      canReviewCompletion: false,
    });
  });
});
