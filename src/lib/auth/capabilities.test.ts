import { describe, expect, it } from "vitest";
import {
  getWorkspaceCapabilities,
  isWorkspaceRole,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "@/lib/auth/capabilities";

describe("workspace role capabilities", () => {
  it("accepts exactly the five product roles", () => {
    expect(WORKSPACE_ROLES).toEqual([
      "super_admin",
      "finance_manager",
      "finance_member",
      "operations_manager",
      "operations_member",
    ]);

    expect(WORKSPACE_ROLES.every(isWorkspaceRole)).toBe(true);
    expect(
      ["admin", "manager", "member", "owner", ""].map(isWorkspaceRole),
    ).toEqual([false, false, false, false, false]);
  });

  it.each<[WorkspaceRole, readonly boolean[]]>([
    ["super_admin", [true, true, true, true, true, true, true, true, true]],
    ["finance_manager", [false, true, false, true, false, true, false, false, false]],
    ["finance_member", [false, false, false, true, true, false, false, false, false]],
    ["operations_manager", [false, false, false, false, false, false, false, true, true]],
    ["operations_member", [false, false, false, false, false, false, false, false, true]],
  ])("maps %s to the database capability matrix", (role, expected) => {
    const capabilities = getWorkspaceCapabilities(role);

    expect([
      capabilities.canManageAccess,
      capabilities.canConfigureLeases,
      capabilities.canManageFinanceOperations,
      capabilities.canReadFinance,
      capabilities.canSubmitExpense,
      capabilities.canReviewExpense,
      capabilities.canReverseExpense,
      capabilities.canManageOperations,
      capabilities.canExecuteOperations,
    ]).toEqual(expected);
  });

  it.each<[WorkspaceRole, Record<string, boolean>]>([
    [
      "super_admin",
      {
        canCorrectFinance: true,
        canLockFinancialMonth: true,
        canManagePettyCash: true,
        canManageReconciliationSources: true,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canRetryCurrentRent: true,
        canUnlockFinancialMonth: true,
      },
    ],
    [
      "finance_manager",
      {
        canCorrectFinance: true,
        canLockFinancialMonth: true,
        canManagePettyCash: true,
        canManageReconciliationSources: false,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canRetryCurrentRent: true,
        canUnlockFinancialMonth: false,
      },
    ],
    [
      "finance_member",
      {
        canCorrectFinance: false,
        canLockFinancialMonth: false,
        canManagePettyCash: false,
        canManageReconciliationSources: false,
        canOperateFinance: false,
        canReadFinanceReports: false,
        canRetryCurrentRent: false,
        canUnlockFinancialMonth: false,
      },
    ],
    [
      "operations_manager",
      {
        canCorrectFinance: false,
        canLockFinancialMonth: false,
        canManagePettyCash: false,
        canManageReconciliationSources: false,
        canOperateFinance: false,
        canReadFinanceReports: false,
        canRetryCurrentRent: false,
        canUnlockFinancialMonth: false,
      },
    ],
    [
      "operations_member",
      {
        canCorrectFinance: false,
        canLockFinancialMonth: false,
        canManagePettyCash: false,
        canManageReconciliationSources: false,
        canOperateFinance: false,
        canReadFinanceReports: false,
        canRetryCurrentRent: false,
        canUnlockFinancialMonth: false,
      },
    ],
  ])("maps %s to the granular finance authority matrix", (role, expected) => {
    expect(getWorkspaceCapabilities(role)).toMatchObject(expected);
  });

  it("delegates routine Finance authority while keeping governance and exceptional recovery denied", () => {
    expect(getWorkspaceCapabilities("finance_manager")).toMatchObject({
      canCloseOwnerMonth: true,
      canConfigureLeases: true,
      canCorrectFinance: true,
      canManageAccess: false,
      canManageReconciliationSources: false,
      canPublishOwnerStatement: true,
      canReverseExpense: false,
      canReviewOwnerOpeningBalance: true,
      canSubmitExpense: false,
      canUnlockFinancialMonth: false,
    });
  });

  it.each<[WorkspaceRole, Record<string, boolean>]>([
    [
      "super_admin",
      {
        canCloseOwnerMonth: true,
        canInspectOwnerCloseReadiness: true,
        canPublishOwnerStatement: true,
        canReadOwnerBalanceAuthority: true,
        canReopenOwnerMonth: true,
        canRequestOwnerOpeningBalanceCorrection: true,
        canReviewOwnerOpeningBalance: true,
        canSubmitOwnerOpeningBalance: true,
      },
    ],
    [
      "finance_manager",
      {
        canCloseOwnerMonth: true,
        canInspectOwnerCloseReadiness: true,
        canPublishOwnerStatement: true,
        canReadOwnerBalanceAuthority: true,
        canReopenOwnerMonth: false,
        canRequestOwnerOpeningBalanceCorrection: true,
        canReviewOwnerOpeningBalance: true,
        canSubmitOwnerOpeningBalance: false,
      },
    ],
    [
      "finance_member",
      {
        canCloseOwnerMonth: false,
        canInspectOwnerCloseReadiness: true,
        canPublishOwnerStatement: false,
        canReadOwnerBalanceAuthority: true,
        canReopenOwnerMonth: false,
        canRequestOwnerOpeningBalanceCorrection: true,
        canReviewOwnerOpeningBalance: false,
        canSubmitOwnerOpeningBalance: true,
      },
    ],
    [
      "operations_manager",
      {
        canCloseOwnerMonth: false,
        canInspectOwnerCloseReadiness: false,
        canPublishOwnerStatement: false,
        canReadOwnerBalanceAuthority: false,
        canReopenOwnerMonth: false,
        canRequestOwnerOpeningBalanceCorrection: false,
        canReviewOwnerOpeningBalance: false,
        canSubmitOwnerOpeningBalance: false,
      },
    ],
    [
      "operations_member",
      {
        canCloseOwnerMonth: false,
        canInspectOwnerCloseReadiness: false,
        canPublishOwnerStatement: false,
        canReadOwnerBalanceAuthority: false,
        canReopenOwnerMonth: false,
        canRequestOwnerOpeningBalanceCorrection: false,
        canReviewOwnerOpeningBalance: false,
        canSubmitOwnerOpeningBalance: false,
      },
    ],
  ])("maps %s to the owner-balance authority matrix", (role, expected) => {
    expect(getWorkspaceCapabilities(role)).toMatchObject(expected);
  });
});
