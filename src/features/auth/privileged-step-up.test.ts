import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminRpc,
  getClaims,
  getUser,
  resendSend,
  requireWorkspaceContext,
} = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  resendSend: vi.fn(),
  requireWorkspaceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ requireWorkspaceContext }));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: adminRpc }),
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: () => ({ auth: { getClaims, getUser } }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import {
  getPrivilegedEmailStepUpStatus,
  requestPrivilegedEmailStepUpAction,
  verifyPrivilegedEmailStepUpAction,
} from "@/features/auth/privileged-step-up";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const sessionId = "30000000-0000-4000-8000-000000000001";
const challengeId = "40000000-0000-4000-8000-000000000001";

describe("privileged email step-up actions", () => {
  beforeEach(() => {
    adminRpc.mockReset();
    getClaims.mockReset();
    getUser.mockReset();
    resendSend.mockReset();
    requireWorkspaceContext.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NESTORY_EMAIL_FROM = "Nestory Security <security@example.com>";
    process.env.PRIVILEGED_STEP_UP_HMAC_SECRET = "x".repeat(48);

    requireWorkspaceContext.mockResolvedValue({
      organizationId,
      organizationName: "Harbor Homes",
      userId,
    });
    getClaims.mockResolvedValue({
      data: { claims: { session_id: sessionId, sub: userId } },
      error: null,
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          email: "admin@example.com",
          email_confirmed_at: "2026-08-25T00:00:00.000Z",
          id: userId,
        },
      },
      error: null,
    });
  });

  it("prepares a hashed challenge, sends through Resend, and marks delivery", async () => {
    adminRpc
      .mockResolvedValueOnce({
        data: [{ challenge_id: challengeId }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    resendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });

    const result = await requestPrivilegedEmailStepUpAction({}, new FormData());

    expect(result).toMatchObject({ challengeId, status: "success" });
    expect(adminRpc).toHaveBeenNthCalledWith(
      1,
      "prepare_privileged_email_step_up",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      }),
    );
    const prepareArgs = adminRpc.mock.calls[0][1];
    expect(prepareArgs.p_code_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(prepareArgs.p_email_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(prepareArgs)).not.toContain("admin@example.com");
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Nestory Security <security@example.com>",
        subject: "Your Nestory privileged verification code",
        to: "admin@example.com",
      }),
      { idempotencyKey: `nestory-privileged-step-up-${challengeId}` },
    );
    expect(adminRpc).toHaveBeenNthCalledWith(
      2,
      "mark_privileged_email_step_up_sent",
      { p_challenge_id: challengeId },
    );
  });

  it("records failed delivery and returns no provider detail", async () => {
    adminRpc
      .mockResolvedValueOnce({
        data: [{ challenge_id: challengeId }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    resendSend.mockResolvedValue({
      data: null,
      error: { message: "provider credential rejected" },
    });

    const result = await requestPrivilegedEmailStepUpAction({}, new FormData());

    expect(result).toEqual({
      message: "We could not complete email verification. Try again.",
      status: "error",
    });
    expect(adminRpc).toHaveBeenLastCalledWith(
      "mark_privileged_email_step_up_failed",
      { p_challenge_id: challengeId },
    );
    expect(result.message).not.toContain("provider");
  });

  it("verifies only against server-derived user, organization, and session", async () => {
    adminRpc.mockResolvedValue({ data: true, error: null });
    const formData = new FormData();
    formData.set("challengeId", challengeId);
    formData.set("code", "12345678");
    formData.set("organizationId", "attacker-org");
    formData.set("userId", "attacker-user");

    const result = await verifyPrivilegedEmailStepUpAction({}, formData);

    expect(result).toMatchObject({ status: "success" });
    expect(adminRpc).toHaveBeenCalledWith(
      "verify_privileged_email_step_up",
      expect.objectContaining({
        p_challenge_id: challengeId,
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      }),
    );
    expect(adminRpc.mock.calls[0][1].p_email_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(adminRpc.mock.calls[0][1])).not.toContain(
      "admin@example.com",
    );
    expect(adminRpc.mock.calls[0][1]).not.toEqual(
      expect.objectContaining({ p_organization_id: "attacker-org" }),
    );
  });

  it("uses the same generic response for wrong, expired, or exhausted codes", async () => {
    adminRpc.mockResolvedValue({ data: false, error: null });
    const formData = new FormData();
    formData.set("challengeId", challengeId);
    formData.set("code", "12345678");

    await expect(
      verifyPrivilegedEmailStepUpAction({}, formData),
    ).resolves.toEqual({
      message: "We could not complete email verification. Try again.",
      status: "error",
    });
  });

  it("reports status with the current confirmed Auth email", async () => {
    adminRpc.mockResolvedValue({
      data: {
        canRequestAt: null,
        enforcementEnabled: false,
        required: true,
        verifiedUntil: null,
      },
      error: null,
    });

    await expect(getPrivilegedEmailStepUpStatus()).resolves.toEqual({
      canRequestAt: null,
      email: "admin@example.com",
      enforcementEnabled: false,
      required: true,
      verifiedUntil: null,
    });
    expect(requireWorkspaceContext).toHaveBeenCalledOnce();
  });

  it("ignores caller-supplied organization authority for status reads", async () => {
    adminRpc.mockResolvedValue({
      data: {
        canRequestAt: null,
        enforcementEnabled: false,
        required: true,
        verifiedUntil: null,
      },
      error: null,
    });

    const caller = getPrivilegedEmailStepUpStatus as unknown as (
      context: {
        organizationId: string;
        organizationName: string;
        userId: string;
      },
    ) => ReturnType<typeof getPrivilegedEmailStepUpStatus>;
    await caller({
      organizationId: "90000000-0000-4000-8000-000000000009",
      organizationName: "Foreign workspace",
      userId,
    });

    expect(requireWorkspaceContext).toHaveBeenCalledOnce();
    expect(adminRpc).toHaveBeenCalledWith(
      "get_privileged_email_step_up_status",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_session_id: sessionId,
        p_user_id: userId,
      }),
    );
  });
});
