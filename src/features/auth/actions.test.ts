import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminRpc,
  redirect,
  signInWithPassword,
  signOut,
} = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: adminRpc }),
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { signInWithPassword, signOut },
  }),
}));

import { loginAction, signOutAction } from "@/features/auth/actions";

describe("auth actions workspace entry", () => {
  beforeEach(() => {
    adminRpc.mockReset();
    redirect.mockReset();
    signInWithPassword.mockReset();
    signOut.mockReset().mockResolvedValue({ error: null });
  });

  it.each([
    ["/properties?status=active", "/properties?status=active"],
    ["/properties?search=A;B&view=table", "/properties?search=A%3BB&view=table"],
    ["/accept-invite?invitation=11111111-1111-4111-8111-111111111111", "/accept-invite?invitation=11111111-1111-4111-8111-111111111111"],
    ["https://evil.test", "/workspace"],
    ["/auth/confirm?token_hash=test", "/workspace"],
  ])("validates the submitted return path %s on the server", async (next, expected) => {
    redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    adminRpc.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "member@example.com");
    formData.set("password", "password123");
    formData.set("next", next);

    await expect(loginAction({}, formData)).rejects.toThrow(`redirect:${expected}`);
    expect(adminRpc).toHaveBeenCalledOnce();
  });

  it("sends successful password login through the workspace resolver", async () => {
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    adminRpc.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "member@example.com");
    formData.set("password", "password123");

    await expect(loginAction({}, formData)).rejects.toThrow(
      "redirect:/workspace",
    );

    expect(adminRpc).toHaveBeenCalledWith(
      "record_auth_password_credential_proof",
      {
        p_auth_user_id: "user-1",
        p_proof_method: "password_login",
      },
    );
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      adminRpc.mock.invocationCallOrder[0],
    );
    expect(redirect).toHaveBeenCalledWith("/workspace");
  });

  it("does not establish credential proof when password login fails", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid credentials"),
    });
    const formData = new FormData();
    formData.set("email", "member@example.com");
    formData.set("password", "wrong-password");

    await expect(loginAction({}, formData)).resolves.toEqual({
      message: "Email or password was not accepted.",
      status: "error",
    });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "/login"],
    ["//evil.test", "/login"],
    ["/accept-invite?invitation=11111111-1111-4111-8111-111111111111", "/login?next=%2Faccept-invite%3Finvitation%3D11111111-1111-4111-8111-111111111111"],
  ])("validates the destination when signing out to switch accounts", async (next, expected) => {
    redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    const formData = new FormData();
    if (next) formData.set("next", next);
    await expect(signOutAction(formData)).rejects.toThrow(`redirect:${expected}`);
    expect(signOut).toHaveBeenCalledOnce();
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0]);
  });
});
