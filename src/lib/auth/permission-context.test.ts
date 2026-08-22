import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "@/lib/auth/permission-catalog";
import {
  buildWorkspacePermissionContext,
  getPermissionGroupPresence,
  hasPermission,
  type ResolvedWorkspacePermissionInput,
} from "@/lib/auth/permission-context";

const BASE_CUSTOM_INPUT = {
  branch: { id: "branch-a", status: "active" },
  customRole: {
    id: "role-a",
    name: "Property coordinator",
    permissionKeys: ["properties.view", "properties.write"],
    status: "active",
  },
  ordinaryAccessActive: true,
  organizationId: "organization-a",
  roleKind: "custom",
  userId: "user-a",
} as const satisfies ResolvedWorkspacePermissionInput;

describe("workspace permission context", () => {
  it("gives protected Super Admin every permission without branch or custom-role scope", () => {
    const result = buildWorkspacePermissionContext({
      branch: null,
      customRole: null,
      ordinaryAccessActive: false,
      organizationId: "organization-a",
      roleKind: "super_admin",
      userId: "user-a",
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected a permission context");

    expect(result.context).toEqual({
      isSuperAdmin: true,
      organizationId: "organization-a",
      permissionKeys: new Set(PERMISSION_KEYS),
      roleKind: "super_admin",
      roleName: "Super Admin",
      userId: "user-a",
    });
    expect(result.context).not.toHaveProperty("branchId");
    expect(result.context).not.toHaveProperty("roleId");
    expect(hasPermission(result.context, "maintenance.review")).toBe(true);
    expect(hasPermission(result.context, "maintenance.delete")).toBe(false);
  });

  it("builds an active custom-role context with exactly its normalized permissions", () => {
    const result = buildWorkspacePermissionContext(BASE_CUSTOM_INPUT);

    expect(result).toEqual({
      context: {
        branchId: "branch-a",
        isSuperAdmin: false,
        organizationId: "organization-a",
        permissionKeys: new Set(["properties.view", "properties.write"]),
        roleId: "role-a",
        roleKind: "custom",
        roleName: "Property coordinator",
        userId: "user-a",
      },
      ok: true,
    });
    if (!result.ok) throw new Error("expected a permission context");

    expect(hasPermission(result.context, "properties.write")).toBe(true);
    expect(hasPermission(result.context, "people.view")).toBe(false);
    expect(hasPermission(result.context, "properties.archive")).toBe(false);
  });

  it("contains custom access while ordinary activation is closed", () => {
    expect(
      buildWorkspacePermissionContext({
        ...BASE_CUSTOM_INPUT,
        ordinaryAccessActive: false,
      }),
    ).toEqual({ context: null, ok: false, reason: "ordinary_access_inactive" });
  });

  it.each([
    ["missing", null, "role_missing"],
    [
      "missing ID",
      { ...BASE_CUSTOM_INPUT.customRole, id: null },
      "role_missing",
    ],
    [
      "missing name",
      { ...BASE_CUSTOM_INPUT.customRole, name: "  " },
      "role_missing",
    ],
    [
      "archived",
      { ...BASE_CUSTOM_INPUT.customRole, status: "archived" },
      "role_inactive",
    ],
    [
      "empty",
      { ...BASE_CUSTOM_INPUT.customRole, permissionKeys: [] },
      "role_empty",
    ],
  ] as const)("denies a %s custom role", (_label, customRole, reason) => {
    expect(
      buildWorkspacePermissionContext({ ...BASE_CUSTOM_INPUT, customRole }),
    ).toEqual({ context: null, ok: false, reason });
  });

  it.each([
    ["missing", null, "branch_missing"],
    ["missing ID", { id: "", status: "active" }, "branch_missing"],
    ["inactive", { id: "branch-a", status: "archived" }, "branch_inactive"],
  ] as const)("denies a %s branch", (_label, branch, reason) => {
    expect(
      buildWorkspacePermissionContext({ ...BASE_CUSTOM_INPUT, branch }),
    ).toEqual({ context: null, ok: false, reason });
  });

  it("fails closed when a resolved custom role contains an unknown permission key", () => {
    expect(
      buildWorkspacePermissionContext({
        ...BASE_CUSTOM_INPUT,
        customRole: {
          ...BASE_CUSTOM_INPUT.customRole,
          permissionKeys: ["properties.view", "properties.delete"],
        },
      }),
    ).toEqual({ context: null, ok: false, reason: "unknown_permission" });
  });

  it("adds only the required group View permission during normalization", () => {
    const result = buildWorkspacePermissionContext({
      ...BASE_CUSTOM_INPUT,
      customRole: {
        ...BASE_CUSTOM_INPUT.customRole,
        permissionKeys: ["maintenance.complete"],
      },
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected a permission context");

    expect([...result.context.permissionKeys]).toEqual([
      "maintenance.view",
      "maintenance.complete",
    ]);
    expect(hasPermission(result.context, "maintenance.review")).toBe(false);
  });

  it("reports stable group keys only for privacy-safe observability", () => {
    const result = buildWorkspacePermissionContext({
      ...BASE_CUSTOM_INPUT,
      customRole: {
        ...BASE_CUSTOM_INPUT.customRole,
        name: "Owner-created private role name",
        permissionKeys: ["finance.view", "people.archive"],
      },
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected a permission context");

    expect(getPermissionGroupPresence(result.context)).toEqual([
      "people",
      "finance",
    ]);
    expect(getPermissionGroupPresence(result.context)).not.toContain(
      result.context.roleName,
    );
  });
});
