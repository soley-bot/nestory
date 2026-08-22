import type { PermissionKey } from "@/lib/auth/permission-catalog";

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

type MaintenanceAuthority = {
  isSuperAdmin: boolean;
  permissionKeys: ReadonlySet<PermissionKey>;
};

export function getMaintenanceCapabilities({
  isSuperAdmin,
  permissionKeys,
}: MaintenanceAuthority): MaintenanceCapabilities {
  if (isSuperAdmin) {
    return {
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
    };
  }

  const canCreateAssign = permissionKeys.has("maintenance.create_assign");
  const canReview = permissionKeys.has("maintenance.review");

  return {
    canArchiveCase: false,
    canAssignCase: canCreateAssign,
    canCreateCase: canCreateAssign,
    canEditCaseStructure: canCreateAssign,
    canExecuteAssignedCase: permissionKeys.has("maintenance.complete"),
    canManageCaseState: canCreateAssign,
    canSubmitMaintenanceCost: canReview,
    canRecordActualCost: canCreateAssign,
    canReviewCompletion: canReview,
    canUploadMaintenanceEvidence: false,
  };
}
