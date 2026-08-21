import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, requireWorkspaceContext } = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));

import SettingsPage from "@/app/(dashboard)/settings/page";

describe("SettingsPage", () => {
  beforeEach(() => {
    redirect.mockClear();
    requireWorkspaceContext.mockReset();
  });

  it.each([
    ["organization", "/settings/organization"],
    ["appearance", "/settings/appearance"],
    ["branches", "/settings/branches"],
    ["teams", "/settings/teams"],
    ["future", "/settings/organization"],
  ])("redirects legacy Super Admin section %s to %s", async (section, href) => {
    requireWorkspaceContext.mockResolvedValue({ role: "super_admin" });

    await expect(
      SettingsPage({ searchParams: Promise.resolve({ section }) }),
    ).rejects.toThrow(`redirect:${href}`);
    expect(redirect).toHaveBeenCalledWith(href);
  });

  it("sends Finance Manager without ordinary Settings to no access", async () => {
    requireWorkspaceContext.mockResolvedValue({ role: "finance_manager" });

    await expect(
      SettingsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/no-access");
  });

  it("sends roles without Settings capability to no access", async () => {
    requireWorkspaceContext.mockResolvedValue({ role: "operations_manager" });

    await expect(
      SettingsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/no-access");
  });
});
