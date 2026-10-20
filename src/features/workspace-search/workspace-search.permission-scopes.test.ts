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
      "/maintenance-timeline",
    ]);
    expect(actions("maintenance.view", "maintenance.review")).toEqual([
      "/maintenance",
      "/work-orders",
      "/inspections",
      "/recurring-tasks",
      "/maintenance-timeline",
    ]);
    expect(actions("finance.view", "finance.submit_expenses")).toEqual([
      "/finance",
      "/bills-expenses",
      "/balances",
      "/financial-timeline",
    ]);
    expect(actions("finance.view", "finance.publish")).toEqual([
      "/finance",
      "/balances",
      "/reports",
      "/financial-timeline",
    ]);
    expect(actions("properties.view")).not.toContain("/settings/access");
  });

  it("matches Records route gates without widening entity-search scopes", () => {
    expect(actions("properties.view")).toEqual(["/properties", "/units", "/property-timeline", "/documents"]);
    expect(actions("maintenance.view")).toEqual(["/maintenance", "/maintenance-timeline"]);
    expect(actions("finance.view")).toEqual(["/finance", "/balances", "/financial-timeline"]);
    const combined = actions("properties.view", "maintenance.view", "finance.view");
    expect(combined.filter(path => path.includes("timeline") || path === "/documents")).toEqual([
      "/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents",
    ]);
    expect(combined).not.toContain("/timeline");
    expect(combined).not.toContain("/import");
    expect(scopes("properties.view")).not.toContain("documents");
    expect(actions()).toEqual([]);
    for (const path of ["/property-timeline", "/maintenance-timeline", "/financial-timeline", "/documents"]) {
      expect(actions("people.view", "leases.view")).not.toContain(path);
    }
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
