export const WORKSPACE_ROLES = [
  "super_admin",
  "finance_manager",
  "finance_member",
  "operations_manager",
  "operations_member",
] as const;

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

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return (
    typeof role === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(role)
  );
}
