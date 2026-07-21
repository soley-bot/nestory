import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, headers, redirect, resetPasswordForEmail, signOut, updateUser } =
  vi.hoisted(() => ({
    getUser: vi.fn(),
    headers: vi.fn(),
    redirect: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
  }));

vi.mock("next/headers", () => ({ headers }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser, resetPasswordForEmail, signOut, updateUser },
  }),
}));

import {
  requestPasswordRecoveryAction,
  updatePasswordAction,
} from "@/features/auth/actions";

describe("password recovery actions", () => {
  beforeEach(() => {
    getUser.mockReset();
    headers.mockReset();
    redirect.mockReset();
    resetPasswordForEmail.mockReset();
    signOut.mockReset();
    updateUser.mockReset();
    headers.mockResolvedValue(new Headers({ origin: "http://localhost:3000" }));
  });

  it("returns the same neutral response when the recovery provider rejects an email", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: new Error("not found") });
    const formData = new FormData();
    formData.set("email", "missing@example.com");

    const result = await requestPasswordRecoveryAction({}, formData);

    expect(resetPasswordForEmail).toHaveBeenCalledWith("missing@example.com", {
      redirectTo:
        "http://localhost:3000/auth/confirm?next=%2Fupdate-password",
    });
    expect(result).toEqual({
      message: "If that account exists, a password reset link has been sent.",
      status: "success",
    });
  });

  it("requires an authenticated recovery session before updating a password", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("password", "correct-horse-battery");
    formData.set("passwordConfirm", "correct-horse-battery");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({
      message: "Open a fresh password recovery link and try again.",
      status: "error",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, clears the recovery session, and returns to login", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    const formData = new FormData();
    formData.set("password", "correct-horse-battery");
    formData.set("passwordConfirm", "correct-horse-battery");

    await expect(updatePasswordAction({}, formData)).rejects.toThrow(
      "redirect:/login?password=updated",
    );
    expect(updateUser).toHaveBeenCalledWith({
      password: "correct-horse-battery",
    });
    expect(signOut).toHaveBeenCalledOnce();
  });
});
