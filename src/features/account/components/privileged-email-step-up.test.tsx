/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, requestAction, verifyAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  requestAction: vi.fn(),
  verifyAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));
vi.mock("@/features/auth/privileged-step-up", () => ({
  requestPrivilegedEmailStepUpAction: requestAction,
  verifyPrivilegedEmailStepUpAction: verifyAction,
}));

import { PrivilegedEmailStepUp } from "@/features/account/components/privileged-email-step-up";

describe("PrivilegedEmailStepUp", () => {
  beforeEach(() => {
    refresh.mockReset();
    requestAction.mockReset();
    verifyAction.mockReset();
  });
  afterEach(cleanup);

  it("refreshes the dashboard layout after the current session is verified", async () => {
    requestAction.mockResolvedValue({
      challengeId: "40000000-0000-4000-8000-000000000001",
      message: "A verification code was sent to your account email.",
      status: "success",
    });
    verifyAction.mockResolvedValue({
      message: "Privileged email verification is active for this session.",
      status: "success",
    });
    render(
      <PrivilegedEmailStepUp
        status={{
          canRequestAt: null,
          email: "operator@example.com",
          enforcementEnabled: true,
          required: true,
          verified: false,
          verifiedUntil: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Email a code" }));
    const code = await screen.findByRole("textbox", {
      name: "Eight-digit verification code",
    });
    fireEvent.change(code, { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("shows verification for the signed-in session without an expiry time", () => {
    render(
      <PrivilegedEmailStepUp
        status={{
          canRequestAt: null,
          email: "operator@example.com",
          enforcementEnabled: true,
          required: true,
          verified: true,
          verifiedUntil: null,
        }}
      />,
    );

    expect(screen.getByText("Verified for this signed-in session.")).not.toBeNull();
    expect(screen.queryByText(/15 minutes/)).toBeNull();
  });
});
