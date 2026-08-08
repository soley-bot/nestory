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
    ["finance_manager", [false, false, false, true, false, true, false, false, false]],
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
});
