import type { PermissionKey } from "@/lib/auth/permission-catalog";

export const WORKSPACE_ROLES = [
  "super_admin",
  "finance_manager",
  "finance_member",
  "operations_manager",
  "operations_member",
] as const;

export const CURRENT_WORKSPACE_ROLE_KINDS = ["super_admin", "custom"] as const;

export type WorkspaceRoleKind = (typeof CURRENT_WORKSPACE_ROLE_KINDS)[number];

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type WorkspaceCapabilities = {
  canConfigureLeases: boolean;
  canCorrectFinance: boolean;
  canExecuteOperations: boolean;
  canLockFinancialMonth: boolean;
  canManageAccess: boolean;
  canManageOperations: boolean;
  canManageFinanceOperations: boolean;
  canManagePettyCash: boolean;
  canManageReconciliationSources: boolean;
  canOperateFinance: boolean;
  canCloseOwnerMonth: boolean;
  canInspectOwnerCloseReadiness: boolean;
  canPublishOwnerStatement: boolean;
  canReadFinance: boolean;
  canReadFinanceReports: boolean;
  canRecoverHistoricalRent: boolean;
  canReadOwnerBalanceAuthority: boolean;
  canReopenOwnerMonth: boolean;
  canRequestOwnerOpeningBalanceCorrection: boolean;
  canReviewExpense: boolean;
  canReviewOwnerOpeningBalance: boolean;
  canReverseExpense: boolean;
  canRetryCurrentRent: boolean;
  canSubmitExpense: boolean;
  canSubmitOwnerOpeningBalance: boolean;
  canUnlockFinancialMonth: boolean;
};

type PermissionAuthority = {
  isSuperAdmin: boolean;
  permissionKeys: ReadonlySet<PermissionKey>;
};

const CAPABILITIES_BY_ROLE: Record<WorkspaceRole, WorkspaceCapabilities> = {
  super_admin: {
    canConfigureLeases: true,
    canCorrectFinance: true,
    canExecuteOperations: true,
    canLockFinancialMonth: true,
    canManageAccess: true,
    canManageFinanceOperations: true,
    canManagePettyCash: true,
    canManageReconciliationSources: true,
    canManageOperations: true,
    canOperateFinance: true,
    canCloseOwnerMonth: true,
    canInspectOwnerCloseReadiness: true,
    canPublishOwnerStatement: true,
    canReadFinance: true,
    canReadFinanceReports: true,
    canRecoverHistoricalRent: true,
    canReadOwnerBalanceAuthority: true,
    canReopenOwnerMonth: true,
    canRequestOwnerOpeningBalanceCorrection: true,
    canReviewExpense: true,
    canReviewOwnerOpeningBalance: true,
    canReverseExpense: true,
    canRetryCurrentRent: true,
    canSubmitExpense: true,
    canSubmitOwnerOpeningBalance: true,
    canUnlockFinancialMonth: true,
  },
  finance_manager: {
    canConfigureLeases: true,
    canCorrectFinance: true,
    canExecuteOperations: false,
    canLockFinancialMonth: true,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManagePettyCash: true,
    canManageReconciliationSources: false,
    canManageOperations: false,
    canOperateFinance: true,
    canCloseOwnerMonth: true,
    canInspectOwnerCloseReadiness: true,
    canPublishOwnerStatement: true,
    canReadFinance: true,
    canReadFinanceReports: true,
    canRecoverHistoricalRent: false,
    canReadOwnerBalanceAuthority: true,
    canReopenOwnerMonth: false,
    canRequestOwnerOpeningBalanceCorrection: true,
    canReviewExpense: true,
    canReviewOwnerOpeningBalance: true,
    canReverseExpense: false,
    canRetryCurrentRent: true,
    canSubmitExpense: false,
    canSubmitOwnerOpeningBalance: false,
    canUnlockFinancialMonth: false,
  },
  finance_member: {
    canConfigureLeases: false,
    canCorrectFinance: false,
    canExecuteOperations: false,
    canLockFinancialMonth: false,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManagePettyCash: false,
    canManageReconciliationSources: false,
    canManageOperations: false,
    canOperateFinance: false,
    canCloseOwnerMonth: false,
    canInspectOwnerCloseReadiness: true,
    canPublishOwnerStatement: false,
    canReadFinance: true,
    canReadFinanceReports: false,
    canRecoverHistoricalRent: false,
    canReadOwnerBalanceAuthority: true,
    canReopenOwnerMonth: false,
    canRequestOwnerOpeningBalanceCorrection: true,
    canReviewExpense: false,
    canReviewOwnerOpeningBalance: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: true,
    canSubmitOwnerOpeningBalance: true,
    canUnlockFinancialMonth: false,
  },
  operations_manager: {
    canConfigureLeases: false,
    canCorrectFinance: false,
    canExecuteOperations: true,
    canLockFinancialMonth: false,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManagePettyCash: false,
    canManageReconciliationSources: false,
    canManageOperations: true,
    canOperateFinance: false,
    canCloseOwnerMonth: false,
    canInspectOwnerCloseReadiness: false,
    canPublishOwnerStatement: false,
    canReadFinance: false,
    canReadFinanceReports: false,
    canRecoverHistoricalRent: false,
    canReadOwnerBalanceAuthority: false,
    canReopenOwnerMonth: false,
    canRequestOwnerOpeningBalanceCorrection: false,
    canReviewExpense: false,
    canReviewOwnerOpeningBalance: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: false,
    canSubmitOwnerOpeningBalance: false,
    canUnlockFinancialMonth: false,
  },
  operations_member: {
    canConfigureLeases: false,
    canCorrectFinance: false,
    canExecuteOperations: true,
    canLockFinancialMonth: false,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManagePettyCash: false,
    canManageReconciliationSources: false,
    canManageOperations: false,
    canOperateFinance: false,
    canCloseOwnerMonth: false,
    canInspectOwnerCloseReadiness: false,
    canPublishOwnerStatement: false,
    canReadFinance: false,
    canReadFinanceReports: false,
    canRecoverHistoricalRent: false,
    canReadOwnerBalanceAuthority: false,
    canReopenOwnerMonth: false,
    canRequestOwnerOpeningBalanceCorrection: false,
    canReviewExpense: false,
    canReviewOwnerOpeningBalance: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: false,
    canSubmitOwnerOpeningBalance: false,
    canUnlockFinancialMonth: false,
  },
};

export function getWorkspaceCapabilities(
  role: WorkspaceRole,
): WorkspaceCapabilities {
  return CAPABILITIES_BY_ROLE[role];
}

/**
 * Compatibility projection for existing screens that have not yet moved to
 * operation-level permission checks. The current workspace context always
 * uses this database-backed projection; legacy fixed-role maps are retained
 * only for the contained pre-transition fixtures and tests.
 */
export function getWorkspaceCapabilitiesFromPermissions(
  authority: PermissionAuthority,
): WorkspaceCapabilities {
  if (authority.isSuperAdmin) {
    return CAPABILITIES_BY_ROLE.super_admin;
  }

  const has = (permission: PermissionKey) =>
    authority.permissionKeys.has(permission);

  return {
    canConfigureLeases:
      has("leases.prepare") && has("leases.change_terms"),
    canCorrectFinance: has("finance.correct_records"),
    canExecuteOperations: has("maintenance.complete"),
    canLockFinancialMonth: has("finance.close_periods"),
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManageOperations:
      has("maintenance.create_assign") || has("maintenance.review"),
    canManagePettyCash: has("finance.approve_expenses"),
    canManageReconciliationSources: false,
    canOperateFinance: has("finance.record_payments"),
    canCloseOwnerMonth: has("finance.close_periods"),
    canInspectOwnerCloseReadiness: has("finance.view"),
    canPublishOwnerStatement: has("finance.publish"),
    canReadFinance: has("finance.view"),
    canReadFinanceReports: has("finance.publish"),
    canRecoverHistoricalRent: false,
    canReadOwnerBalanceAuthority: has("finance.view"),
    canReopenOwnerMonth: false,
    canRequestOwnerOpeningBalanceCorrection:
      has("finance.submit_expenses") || has("finance.correct_records"),
    canReviewExpense: has("finance.approve_expenses"),
    canReviewOwnerOpeningBalance: has("finance.approve_expenses"),
    canReverseExpense: false,
    canRetryCurrentRent: has("finance.record_payments"),
    canSubmitExpense: has("finance.submit_expenses"),
    canSubmitOwnerOpeningBalance: has("finance.submit_expenses"),
    canUnlockFinancialMonth: false,
  };
}

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return (
    typeof role === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(role)
  );
}

export function isWorkspaceRoleKind(role: unknown): role is WorkspaceRoleKind {
  return (
    typeof role === "string" &&
    (CURRENT_WORKSPACE_ROLE_KINDS as readonly string[]).includes(role)
  );
}
