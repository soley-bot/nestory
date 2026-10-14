import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthWeakPasswordError } from "@supabase/supabase-js";

const {
  adminRpc,
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
    adminRpc: vi.fn(),
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
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: adminRpc }),
}));
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
    adminRpc.mockReset();
    cookieDelete.mockReset();
    cookieGet.mockReset();
    getUser.mockReset();
    redirect.mockReset();
    resetPasswordForEmail.mockReset();
    signOut.mockReset();
    updateUser.mockReset();
    verifyRecoveryMarker.mockReset();
    adminRpc.mockResolvedValue({ error: null });
    cookieGet.mockReturnValue({ value: "signed-recovery-marker" });
    verifyRecoveryMarker.mockReturnValue(true);
  });

  it("returns the same neutral response when the recovery provider rejects an email", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: new Error("not found") });
    const formData = new FormData();
    formData.set("email", "missing@example.com");

    const result = await requestPasswordRecoveryAction({}, formData);

    expect(resetPasswordForEmail).toHaveBeenCalledWith("missing@example.com");
    expect(result).toEqual({
      message: "If that account exists, a password reset link has been sent.",
      status: "success",
    });
  });

  it("requires an authenticated recovery session before updating a password", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("password", "CorrectHorse9Battery");
    formData.set("passwordConfirm", "CorrectHorse9Battery");

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
    formData.set("password", "CorrectHorse9Battery");
    formData.set("passwordConfirm", "CorrectHorse9Battery");

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

  it.each(["Abcdefg1", "CorrectHorse9Battery"])("accepts the new password, clears recovery, and returns to login: %s", async (password) => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    const formData = new FormData();
    formData.set("password", password);
    formData.set("passwordConfirm", password);

    await expect(updatePasswordAction({}, formData)).rejects.toThrow(
      "redirect:/login?password=updated",
    );
    expect(updateUser).toHaveBeenCalledWith({
      password,
    });
    expect(adminRpc).toHaveBeenCalledWith(
      "record_auth_password_credential_proof",
      {
        p_auth_user_id: "user-1",
        p_proof_method: "password_recovery",
      },
    );
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      adminRpc.mock.invocationCallOrder[0],
    );
    expect(cookieDelete).toHaveBeenCalledWith("nestory_recovery");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rejects seven-character recovery passwords before changing credentials", async () => {
    const tooShortPassword = "A" + "b".repeat(5) + "1";
    expect(tooShortPassword).toHaveLength(7);
    const formData = new FormData();
    formData.set("password", tooShortPassword);
    formData.set("passwordConfirm", tooShortPassword);

    await expect(updatePasswordAction({}, formData)).resolves.toMatchObject({
      status: "error",
      fieldErrors: {
        password: ["Use at least 8 characters with lowercase, uppercase, and a number. Symbols are optional."],
      },
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(adminRpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not establish credential proof when recovery password update fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    updateUser.mockResolvedValue({ error: new Error("password rejected") });
    const formData = new FormData();
    formData.set("password", "CorrectHorse9Battery");
    formData.set("passwordConfirm", "CorrectHorse9Battery");

    await expect(updatePasswordAction({}, formData)).resolves.toEqual({
      message: "We could not update the password. Request a new recovery link.",
      status: "error",
    });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "length rejection",
      error: new AuthWeakPasswordError("CorrectHorse9Battery private@example.invalid provider-token-canary", 422, ["length"]),
      message: "Use at least 8 characters with lowercase, uppercase, and a number. Symbols are optional.",
    },
    {
      label: "leaked password rejection",
      error: new AuthWeakPasswordError("CorrectHorse9Battery private@example.invalid provider-token-canary", 422, ["pwned"]),
      message: "This password has appeared in a data breach. Choose a different password that you have not used elsewhere.",
    },
    {
      label: "unknown provider failure",
      error: Object.assign(new Error("weak_password pwned CorrectHorse9Battery private@example.invalid provider-token-canary"), { code: "unexpected_failure" }),
      message: "We could not update the password. Request a new recovery link.",
    },
  ])("returns safe instructions and preserves recovery after $label", async ({ error, message }) => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    updateUser.mockResolvedValue({ error });
    const formData = new FormData();
    formData.set("password", "CorrectHorse9Battery");
    formData.set("passwordConfirm", "CorrectHorse9Battery");

    const result = await updatePasswordAction({}, formData);

    expect(result).toEqual({ message, status: "error" });
    for (const privateDetail of ["CorrectHorse9Battery", "private@example.invalid", "provider-token-canary"]) {
      expect(JSON.stringify(result)).not.toContain(privateDetail);
    }
    expect(adminRpc).not.toHaveBeenCalled();
    expect(cookieDelete).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
