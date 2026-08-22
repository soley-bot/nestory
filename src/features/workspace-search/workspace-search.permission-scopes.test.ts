import { describe, expect, it } from "vitest";

import {
  getWorkspaceSearchActions,
  getWorkspaceSearchScopes,
} from "@/features/workspace-search/workspace-search.scopes";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

describe("permission-first workspace search visibility", () => {
  it("derives record scopes from permission group presence", () => {
    expect(scopes("properties.view")).toEqual(["properties", "units"]);
    expect(scopes("people.view")).toEqual(["people"]);
    expect(scopes("leases.view")).toEqual(["leases"]);
    expect(scopes("maintenance.view")).toEqual(["tasks"]);
    expect(scopes("finance.view")).toEqual([]);
  });

  it("derives actions from exact permission keys without Settings leakage", () => {
    expect(actions("maintenance.view", "maintenance.complete")).toEqual([
      "/maintenance",
      "/tasks",
    ]);
    expect(actions("maintenance.view", "maintenance.review")).toEqual([
      "/maintenance",
      "/work-orders",
      "/inspections",
      "/recurring-tasks",
    ]);
    expect(actions("finance.view", "finance.submit_expenses")).toEqual([
      "/finance",
      "/bills-expenses",
      "/balances",
    ]);
    expect(actions("finance.view", "finance.publish")).toEqual([
      "/finance",
      "/balances",
      "/reports",
    ]);
    expect(actions("properties.view")).not.toContain("/settings/access");
  });

  it("keeps Super Admin organization-wide scopes and actions", () => {
    const authority = {
      isSuperAdmin: true,
      permissionKeys: new Set<PermissionKey>(),
    };
    expect(getWorkspaceSearchScopes(authority)).toEqual([
      "properties",
      "units",
      "people",
      "leases",
      "tasks",
      "documents",
    ]);
    expect(getWorkspaceSearchActions(authority).map(({ href }) => href)).toContain(
      "/settings/access",
    );
  });
});

function scopes(...permissionKeys: PermissionKey[]) {
  return getWorkspaceSearchScopes({
    isSuperAdmin: false,
    permissionKeys: new Set(permissionKeys),
  });
}

function actions(...permissionKeys: PermissionKey[]) {
  return getWorkspaceSearchActions({
    isSuperAdmin: false,
    permissionKeys: new Set(permissionKeys),
  }).map(({ href }) => href);
}
