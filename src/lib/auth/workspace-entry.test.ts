import { describe, expect, it } from "vitest";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

describe("getWorkspaceEntryPath", () => {
  it.each([
    ["super_admin", "/overview"],
    ["finance_manager", "/finance"],
    ["finance_member", "/finance"],
    ["operations_manager", "/maintenance"],
    ["operations_member", "/tasks"],
  ] as const)("routes %s workspaces to %s", (role, expectedPath) => {
    expect(getWorkspaceEntryPath(role)).toBe(expectedPath);
  });
});
