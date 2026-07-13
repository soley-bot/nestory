import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentOrganizationSlug,
  getWorkspaceMembershipForUser,
  redirect,
  requireUser,
} = vi.hoisted(() => ({
  getCurrentOrganizationSlug: vi.fn(),
  getWorkspaceMembershipForUser: vi.fn(),
  redirect: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({
  getCurrentOrganizationSlug,
  getWorkspaceMembershipForUser,
  requireUser,
}));
vi.mock("@/features/auth/actions", () => ({ signOutAction: vi.fn() }));

import SetupPage from "@/app/setup/page";

describe("SetupPage", () => {
  beforeEach(() => {
    getCurrentOrganizationSlug.mockReset();
    getWorkspaceMembershipForUser.mockReset();
    redirect.mockReset();
    requireUser.mockReset();
  });

  it("routes any existing workspace member through the role-aware entry", async () => {
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    requireUser.mockResolvedValue({ id: "user-1" });
    getCurrentOrganizationSlug.mockResolvedValue(null);
    getWorkspaceMembershipForUser.mockResolvedValue({ role: "manager" });

    await expect(SetupPage()).rejects.toThrow("redirect:/workspace");

    expect(redirect).toHaveBeenCalledWith("/workspace");
  });
});
