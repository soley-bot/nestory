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
  canExecuteOperations: boolean;
  canManageAccess: boolean;
  canManageOperations: boolean;
  canManageFinanceOperations: boolean;
  canReadFinance: boolean;
  canReviewExpense: boolean;
  canReverseExpense: boolean;
  canSubmitExpense: boolean;
};

const CAPABILITIES_BY_ROLE: Record<WorkspaceRole, WorkspaceCapabilities> = {
  super_admin: {
    canConfigureLeases: true,
    canExecuteOperations: true,
    canManageAccess: true,
    canManageFinanceOperations: true,
    canManageOperations: true,
    canReadFinance: true,
    canReviewExpense: true,
    canReverseExpense: true,
    canSubmitExpense: true,
  },
  finance_manager: {
    canConfigureLeases: false,
    canExecuteOperations: false,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManageOperations: false,
    canReadFinance: true,
    canReviewExpense: true,
    canReverseExpense: false,
    canSubmitExpense: false,
  },
  finance_member: {
    canConfigureLeases: false,
    canExecuteOperations: false,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManageOperations: false,
    canReadFinance: true,
    canReviewExpense: false,
    canReverseExpense: false,
    canSubmitExpense: true,
  },
  operations_manager: {
    canConfigureLeases: false,
    canExecuteOperations: true,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManageOperations: true,
    canReadFinance: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canSubmitExpense: false,
  },
  operations_member: {
    canConfigureLeases: false,
    canExecuteOperations: true,
    canManageAccess: false,
    canManageFinanceOperations: false,
    canManageOperations: false,
    canReadFinance: false,
    canReviewExpense: false,
    canReverseExpense: false,
    canSubmitExpense: false,
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
