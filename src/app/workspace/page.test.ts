import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, requireWorkspaceContext } = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));

import WorkspacePage from "@/app/workspace/page";

const originalRootDomain = process.env.APP_ROOT_DOMAIN;

describe("WorkspacePage", () => {
  beforeEach(() => {
    redirect.mockReset();
    requireWorkspaceContext.mockReset();
    delete process.env.APP_ROOT_DOMAIN;
  });

  it.each([
    ["super_admin", "/overview"],
    ["finance_manager", "/finance"],
    ["finance_member", "/finance"],
    ["operations_manager", "/maintenance"],
    ["operations_member", "/tasks"],
  ] as const)("redirects %s users to %s", async (role, expectedPath) => {
    requireWorkspaceContext.mockResolvedValue({ role });

    await WorkspacePage();

    expect(requireWorkspaceContext).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith(expectedPath);
  });

  it("enters a provisioned workspace through its company subdomain", async () => {
    process.env.APP_ROOT_DOMAIN = "nestory-kh.com";
    requireWorkspaceContext.mockResolvedValue({
      organizationSlug: "example-pm",
      role: "super_admin",
    });

    await WorkspacePage();

    expect(redirect).toHaveBeenCalledWith(
      "https://example-pm.nestory-kh.com/overview",
    );
  });
});

afterAll(() => {
  if (originalRootDomain === undefined) {
    delete process.env.APP_ROOT_DOMAIN;
  } else {
    process.env.APP_ROOT_DOMAIN = originalRootDomain;
  }
});
