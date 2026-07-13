import { describe, expect, it } from "vitest";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

describe("getWorkspaceEntryPath", () => {
  it.each([
    ["admin", "/overview"],
    ["manager", "/maintenance"],
    ["member", "/tasks"],
  ] as const)("routes %s workspaces to %s", (role, expectedPath) => {
    expect(getWorkspaceEntryPath(role)).toBe(expectedPath);
  });
});
