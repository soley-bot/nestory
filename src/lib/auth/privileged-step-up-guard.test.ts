import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  createServer: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
  redirectInterrupt: Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/login;307;",
  }),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  RedirectType: { replace: "replace" },
}));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: mocks.createAdmin,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createServer,
}));

import { requirePrivilegedStepUp } from "@/lib/auth/privileged-step-up-guard";
import { isPrivilegedStepUpRequiredError } from "@/lib/auth/privileged-step-up-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";

describe("privileged step-up guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset();
    mocks.redirect.mockImplementation(() => {
      throw mocks.redirectInterrupt;
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { session_id: sessionId, sub: userId } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.createServer.mockResolvedValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    });
    mocks.createAdmin.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("proves the exact verified actor and Auth session through the service-only assertion", async () => {
    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).resolves.toEqual(expect.objectContaining({ rpc: mocks.rpc }));

    expect(mocks.rpc).toHaveBeenCalledWith(
      "assert_privileged_email_step_up_satisfied",
      {
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      },
    );
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing claims", { data: { claims: null }, error: null }],
    [
      "missing session",
      { data: { claims: { sub: userId } }, error: null },
    ],
    [
      "malformed session",
      {
        data: { claims: { session_id: "not-a-uuid", sub: userId } },
        error: null,
      },
    ],
  ])("fails closed for %s before creating service authority", async (_label, claimsResult) => {
    mocks.getClaims.mockResolvedValue(claimsResult);

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");

    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when verified user and expected server actor differ", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "20000000-0000-4000-8000-000000000099" } },
      error: null,
    });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");

    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("fails closed before service authority for a non-session getUser error", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Auth service unavailable"),
    });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");

    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the signed claims actor and expected server actor differ", async () => {
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          session_id: sessionId,
          sub: "20000000-0000-4000-8000-000000000099",
        },
      },
      error: null,
    });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");

    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ["a false assertion", { data: false, error: null }],
    ["an assertion error", { data: null, error: { message: "unavailable" } }],
  ])("fails closed on %s", async (_label, assertionResult) => {
    mocks.rpc.mockResolvedValue(assertionResult);

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");
  });

  it("redirects a still-valid JWT when getUser reports its Auth session is gone", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toBe(mocks.redirectInterrupt);

    expect(mocks.redirect).toHaveBeenCalledWith("/login", "replace");
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the database status discriminator when getUser succeeds during a session race", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "42501", message: "Status unavailable" },
      });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toBe(mocks.redirectInterrupt);

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "get_privileged_email_step_up_status",
      {
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      },
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login", "replace");
  });

  it("keeps a live unverified session on the verification-required path", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({
        data: {
          enforcementEnabled: true,
          required: true,
          verified: false,
          verifiedUntil: null,
        },
        error: null,
      });

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");

    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "get_privileged_email_step_up_status",
      {
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      },
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("normalizes a thrown assertion request to the generic fail-closed error", async () => {
    mocks.rpc.mockRejectedValue(new Error("service secret unavailable"));

    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).rejects.toThrow("Privileged email verification required");
  });

  it("preserves ordinary-member compatibility when the database assertion succeeds", async () => {
    await expect(
      requirePrivilegedStepUp({ organizationId, userId }),
    ).resolves.toEqual(expect.objectContaining({ rpc: mocks.rpc }));
  });

  it("recognizes only the exact guard error or exact database denial", () => {
    expect(
      isPrivilegedStepUpRequiredError(
        new Error("Privileged email verification required."),
      ),
    ).toBe(true);
    expect(
      isPrivilegedStepUpRequiredError({
        code: "42501",
        message: "Privileged email verification required",
      }),
    ).toBe(true);
    expect(
      isPrivilegedStepUpRequiredError({
        code: "42501",
        message: "row-level security denied the write",
      }),
    ).toBe(false);
    expect(
      isPrivilegedStepUpRequiredError({
        code: "XX000",
        message: "Privileged email verification required",
      }),
    ).toBe(false);
  });
});
