import { describe, expect, it } from "vitest";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

describe("getWorkspaceEntryPath", () => {
  it.each([
    ["properties.view", "/properties"],
    ["people.view", "/people"],
    ["leases.view", "/leases"],
    ["finance.view", "/finance"],
    ["maintenance.create_assign", "/maintenance"],
    ["maintenance.complete", "/tasks"],
  ] as const)("routes a custom workspace with %s to %s", (permission, expectedPath) => {
    expect(
      getWorkspaceEntryPath({
        isSuperAdmin: false,
        permissionKeys: new Set([permission]),
      }),
    ).toBe(expectedPath);
  });

  it("routes Super Admin organization-wide and denies an empty ordinary workspace", () => {
    expect(
      getWorkspaceEntryPath({ isSuperAdmin: true, permissionKeys: new Set() }),
    ).toBe("/overview");
    expect(
      getWorkspaceEntryPath({ isSuperAdmin: false, permissionKeys: new Set() }),
    ).toBe("/no-access");
  });

  it("preserves Finance as the home for profiles that can also view Leases", () => {
    expect(
      getWorkspaceEntryPath({
        isSuperAdmin: false,
        permissionKeys: new Set(["leases.view", "finance.view"]),
      }),
    ).toBe("/finance");
  });
});
