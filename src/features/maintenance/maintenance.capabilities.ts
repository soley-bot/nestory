import type { WorkspaceRole } from "@/lib/auth/context";

export type MaintenanceCapabilities = {
  canArchiveCase: boolean;
  canAssignCase: boolean;
  canCreateCase: boolean;
  canEditCaseStructure: boolean;
  canExecuteAssignedCase: boolean;
  canManageCaseState: boolean;
  canSubmitMaintenanceCost: boolean;
  canRecordActualCost: boolean;
  canReviewCompletion: boolean;
  canUploadMaintenanceEvidence: boolean;
};

const CAPABILITIES_BY_ROLE: Record<WorkspaceRole, MaintenanceCapabilities> = {
  super_admin: {
    canArchiveCase: true,
    canAssignCase: true,
    canCreateCase: true,
    canEditCaseStructure: true,
    canExecuteAssignedCase: false,
    canManageCaseState: true,
    canSubmitMaintenanceCost: true,
    canRecordActualCost: true,
    canReviewCompletion: true,
    canUploadMaintenanceEvidence: true,
  },
  operations_manager: {
    canArchiveCase: false,
    canAssignCase: true,
    canCreateCase: true,
    canEditCaseStructure: true,
    canExecuteAssignedCase: false,
    canManageCaseState: true,
    canSubmitMaintenanceCost: true,
    canRecordActualCost: true,
    canReviewCompletion: true,
    canUploadMaintenanceEvidence: false,
  },
  operations_member: {
    canArchiveCase: false,
    canAssignCase: false,
    canCreateCase: false,
    canEditCaseStructure: false,
    canExecuteAssignedCase: true,
    canManageCaseState: false,
    canSubmitMaintenanceCost: false,
    canRecordActualCost: false,
    canReviewCompletion: false,
    canUploadMaintenanceEvidence: false,
  },
  finance_manager: noMaintenanceCapabilities(),
  finance_member: noMaintenanceCapabilities(),
};

function noMaintenanceCapabilities(): MaintenanceCapabilities {
  return {
    canArchiveCase: false,
    canAssignCase: false,
    canCreateCase: false,
    canEditCaseStructure: false,
    canExecuteAssignedCase: false,
    canManageCaseState: false,
    canSubmitMaintenanceCost: false,
    canRecordActualCost: false,
    canReviewCompletion: false,
    canUploadMaintenanceEvidence: false,
  };
}

export function getMaintenanceCapabilities(
  role: WorkspaceRole,
): MaintenanceCapabilities {
  return CAPABILITIES_BY_ROLE[role];
}
