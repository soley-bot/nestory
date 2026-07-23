import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookieDelete,
  cookieGet,
  getUser,
  redirect,
  resetPasswordForEmail,
  signOut,
  updateUser,
  verifyRecoveryMarker,
} =
  vi.hoisted(() => ({
    cookieDelete: vi.fn(),
    cookieGet: vi.fn(),
    getUser: vi.fn(),
    redirect: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    verifyRecoveryMarker: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  cookies: () => ({ delete: cookieDelete, get: cookieGet }),
}));
vi.mock("@/lib/auth/recovery-marker", () => ({
  RECOVERY_MARKER_COOKIE: "nestory_recovery",
  verifyRecoveryMarker,
}));
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
    cookieDelete.mockReset();
    cookieGet.mockReset();
    getUser.mockReset();
    redirect.mockReset();
    resetPasswordForEmail.mockReset();
    signOut.mockReset();
    updateUser.mockReset();
    verifyRecoveryMarker.mockReset();
    cookieGet.mockReturnValue({ value: "signed-recovery-marker" });
    verifyRecoveryMarker.mockReturnValue(true);
  });

  it("returns the same neutral response when the recovery provider rejects an email", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: new Error("not found") });
    const formData = new FormData();
    formData.set("email", "missing@example.com");

    const result = await requestPasswordRecoveryAction({}, formData);

    expect(resetPasswordForEmail).toHaveBeenCalledWith("missing@example.com", {
      redirectTo:
        "http://localhost:3000/auth/complete?next=%2Fupdate-password",
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

  it("rejects a normal authenticated session without a valid recovery marker", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    verifyRecoveryMarker.mockReturnValue(false);
    const formData = new FormData();
    formData.set("password", "correct-horse-battery");
    formData.set("passwordConfirm", "correct-horse-battery");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({
      message: "Open a fresh password recovery link and try again.",
      status: "error",
    });
    expect(verifyRecoveryMarker).toHaveBeenCalledWith(
      "signed-recovery-marker",
      "user-1",
    );
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
    expect(cookieDelete).toHaveBeenCalledWith("nestory_recovery");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
