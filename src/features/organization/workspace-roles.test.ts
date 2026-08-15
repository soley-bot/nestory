import { describe, expect, it } from "vitest";

import { WORKSPACE_ROLE_OPTIONS, workspaceRoleSchema } from "./workspace-roles";

describe("workspace roles", () => {
  it("keeps validation and visible role choices in one authoritative order", () => {
    expect(WORKSPACE_ROLE_OPTIONS).toEqual([
      { label: "Super Admin", value: "super_admin" },
      { label: "Finance Manager", value: "finance_manager" },
      { label: "Finance Member", value: "finance_member" },
      { label: "Operations Manager", value: "operations_manager" },
      { label: "Operations Member", value: "operations_member" },
    ]);

    for (const option of WORKSPACE_ROLE_OPTIONS) {
      expect(workspaceRoleSchema.parse(option.value)).toBe(option.value);
    }
    expect(workspaceRoleSchema.safeParse("legacy_admin").success).toBe(false);
  });
});
