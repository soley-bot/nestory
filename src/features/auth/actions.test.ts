import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentOrganizationSlug,
  getCurrentUser,
  getWorkspaceMembershipForUser,
  redirect,
  rpc,
  signInWithPassword,
} = vi.hoisted(() => ({
  getCurrentOrganizationSlug: vi.fn(),
  getCurrentUser: vi.fn(),
  getWorkspaceMembershipForUser: vi.fn(),
  redirect: vi.fn(),
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/context", () => ({
  getCurrentOrganizationSlug,
  getCurrentUser,
  getWorkspaceMembershipForUser,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { signInWithPassword },
    rpc,
  }),
}));

import {
  loginAction,
  setupOrganizationAction,
} from "@/features/auth/actions";

describe("auth actions workspace entry", () => {
  beforeEach(() => {
    getCurrentOrganizationSlug.mockReset();
    getCurrentUser.mockReset();
    getWorkspaceMembershipForUser.mockReset();
    redirect.mockReset();
    rpc.mockReset();
    signInWithPassword.mockReset();
  });

  it("sends successful password login through the workspace resolver", async () => {
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const formData = new FormData();
    formData.set("email", "member@example.com");
    formData.set("password", "password123");

    await expect(loginAction({}, formData)).rejects.toThrow(
      "redirect:/workspace",
    );

    expect(redirect).toHaveBeenCalledWith("/workspace");
    expect(getWorkspaceMembershipForUser).not.toHaveBeenCalled();
  });

  it("sends an already-linked setup visit through the workspace resolver", async () => {
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    getCurrentOrganizationSlug.mockResolvedValue(null);
    getWorkspaceMembershipForUser.mockResolvedValue({ role: "member" });
    const formData = new FormData();
    formData.set("organizationName", "Nestory Test");
    formData.set("workspaceSlug", "nestory-test");

    await expect(setupOrganizationAction({}, formData)).rejects.toThrow(
      "redirect:/workspace",
    );

    expect(redirect).toHaveBeenCalledWith("/workspace");
  });
});
