/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/actions", () => ({
  updatePasswordAction: vi.fn(),
}));
vi.mock("@/features/auth/invitation-acceptance", () => ({
  acceptInvitationAction: vi.fn(),
}));

import { AcceptInvitationForm } from "@/features/auth/components/accept-invitation-form";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { NEW_PASSWORD_REQUIREMENT } from "@/lib/auth/password-policy";

afterEach(cleanup);

describe("password policy forms", () => {
  it.each([
    ["password recovery", () => <UpdatePasswordForm />],
    [
      "invitation acceptance",
      () => (
        <AcceptInvitationForm invitationId="invitation-id" passwordRequired />
      ),
    ],
  ])("discloses and mirrors the policy for %s", (_label, renderForm) => {
    render(renderForm());

    expect(screen.getByText(NEW_PASSWORD_REQUIREMENT)).toBeTruthy();
    for (const input of screen.getAllByLabelText(/password/i)) {
      expect(input.getAttribute("minlength")).toBe("12");
    }
  });
});
