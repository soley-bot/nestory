import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, requireWorkspaceContext } = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));

import WorkspacePage from "@/app/workspace/page";

describe("WorkspacePage", () => {
  beforeEach(() => {
    redirect.mockReset();
    requireWorkspaceContext.mockReset();
  });

  it.each([
    ["admin", "/overview"],
    ["manager", "/maintenance"],
    ["member", "/tasks"],
  ] as const)("redirects %s users to %s", async (role, expectedPath) => {
    requireWorkspaceContext.mockResolvedValue({ role });

    await WorkspacePage();

    expect(redirect).toHaveBeenCalledWith(expectedPath);
  });
});
