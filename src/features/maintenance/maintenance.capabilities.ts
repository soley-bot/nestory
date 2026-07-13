import type { WorkspaceRole } from "@/lib/auth/context";

export type MaintenanceCapabilities = {
  canArchiveCase: boolean;
  canAssignCase: boolean;
  canCreateCase: boolean;
  canEditCaseStructure: boolean;
  canExecuteAssignedCase: boolean;
  canManageCaseState: boolean;
  canPostMaintenanceCost: boolean;
  canRecordActualCost: boolean;
  canReviewCompletion: boolean;
};

const CAPABILITIES_BY_ROLE: Record<WorkspaceRole, MaintenanceCapabilities> = {
  admin: {
    canArchiveCase: true,
    canAssignCase: true,
    canCreateCase: true,
    canEditCaseStructure: true,
    canExecuteAssignedCase: false,
    canManageCaseState: true,
    canPostMaintenanceCost: true,
    canRecordActualCost: true,
    canReviewCompletion: true,
  },
  manager: {
    canArchiveCase: false,
    canAssignCase: true,
    canCreateCase: true,
    canEditCaseStructure: true,
    canExecuteAssignedCase: false,
    canManageCaseState: true,
    canPostMaintenanceCost: false,
    canRecordActualCost: true,
    canReviewCompletion: true,
  },
  member: {
    canArchiveCase: false,
    canAssignCase: false,
    canCreateCase: false,
    canEditCaseStructure: false,
    canExecuteAssignedCase: true,
    canManageCaseState: false,
    canPostMaintenanceCost: false,
    canRecordActualCost: false,
    canReviewCompletion: false,
  },
};

export function getMaintenanceCapabilities(
  role: WorkspaceRole,
): MaintenanceCapabilities {
  return CAPABILITIES_BY_ROLE[role];
}
