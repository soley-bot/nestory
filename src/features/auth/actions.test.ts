import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirect,
  signInWithPassword,
} = vi.hoisted(() => ({
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { signInWithPassword },
  }),
}));

import { loginAction } from "@/features/auth/actions";

describe("auth actions workspace entry", () => {
  beforeEach(() => {
    redirect.mockReset();
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
  });
});
