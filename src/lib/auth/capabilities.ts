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
  canReadFinance: boolean;
  canReadFinanceReports: boolean;
  canReviewExpense: boolean;
  canReverseExpense: boolean;
  canRetryCurrentRent: boolean;
  canSubmitExpense: boolean;
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
    canReadFinance: true,
    canReadFinanceReports: true,
    canReviewExpense: true,
    canReverseExpense: true,
    canRetryCurrentRent: true,
    canSubmitExpense: true,
    canUnlockFinancialMonth: true,
  },
  finance_manager: {
    canConfigureLeases: false,
    canCorrectFinance: false,
    canExecuteOperations: false,
    canLockFinancialMonth: true,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManagePettyCash: true,
    canManageReconciliationSources: false,
    canManageOperations: false,
    canOperateFinance: true,
    canReadFinance: true,
    canReadFinanceReports: true,
    canReviewExpense: true,
    canReverseExpense: false,
    canRetryCurrentRent: true,
    canSubmitExpense: false,
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
    canReadFinance: true,
    canReadFinanceReports: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: true,
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
    canReadFinance: false,
    canReadFinanceReports: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: false,
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
    canReadFinance: false,
    canReadFinanceReports: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canRetryCurrentRent: false,
    canSubmitExpense: false,
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
