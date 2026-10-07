/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthActionState } from "@/features/auth/actions";

const actions = vi.hoisted(() => ({
  loginAction: vi.fn(),
  requestPasswordRecoveryAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  acceptInvitationAction: vi.fn(),
}));

vi.mock("@/features/auth/actions", () => actions);
vi.mock("@/features/auth/invitation-acceptance", () => actions);

import { LoginForm } from "./login-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { UpdatePasswordForm } from "./update-password-form";
import { AcceptInvitationForm } from "./accept-invitation-form";

type AuthFormCase = {
  name: string;
  render: () => ReactElement;
  action: typeof actions.loginAction;
  fields: Record<string, string>;
  invalid: string;
  submit: string;
  loading: string;
  hidden?: [string, string];
};

const cases: AuthFormCase[] = [
  { name: "sign in", render: () => <LoginForm nextPath="/account" />, action: actions.loginAction,
    fields: { email: "fixture@example.invalid", password: "synthetic-password" }, invalid: "email",
    submit: "Sign in", loading: "Signing in...", hidden: ["next", "/account"] },
  { name: "password recovery", render: () => <ForgotPasswordForm />, action: actions.requestPasswordRecoveryAction,
    fields: { email: "fixture@example.invalid" }, invalid: "email",
    submit: "Send reset link", loading: "Sending..." },
  { name: "password update", render: () => <UpdatePasswordForm />, action: actions.updatePasswordAction,
    fields: { password: "synthetic-password", passwordConfirm: "different-password" }, invalid: "passwordConfirm",
    submit: "Update password", loading: "Updating..." },
  { name: "invitation acceptance", render: () => <AcceptInvitationForm invitationId="fixture-invitation" passwordRequired />, action: actions.acceptInvitationAction,
    fields: { password: "synthetic-password", passwordConfirm: "different-password" }, invalid: "passwordConfirm",
    submit: "Accept invitation", loading: "Accepting...", hidden: ["invitationId", "fixture-invitation"] },
];

function fill(fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    fireEvent.change(document.querySelector(`input[name="${name}"]`)!, { target: { value } });
  }
}

beforeEach(() => Object.values(actions).forEach((action) => action.mockReset()));
afterEach(cleanup);

describe.each(cases)("$name retry", (example) => {
  it("keeps submitted values and focuses the first invalid field", async () => {
    example.action.mockResolvedValue({ status: "error", fieldErrors: { [example.invalid]: ["Check this field."] } });
    const { container } = render(example.render());
    fill(example.fields);
    fireEvent.submit(container.querySelector("form")!);
    await screen.findByText("Check this field.");
    for (const [name, value] of Object.entries(example.fields)) {
      expect((container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value).toBe(value);
    }
    const invalid = container.querySelector(`input[name="${example.invalid}"]`)!;
    await waitFor(() => expect(document.activeElement).toBe(invalid));
    expect(invalid.getAttribute("aria-invalid")).toBe("true");
    expect(invalid.getAttribute("aria-describedby")).toContain(screen.getByText("Check this field.").id);
  });

  it("blocks duplicate submissions, announces loading, and permits a retry after failure", async () => {
    let finish!: (state: AuthActionState) => void;
    example.action.mockImplementationOnce(() => new Promise<AuthActionState>((resolve) => { finish = resolve; }));
    const { container } = render(example.render());
    fill(example.fields);
    const form = container.querySelector("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(example.action).toHaveBeenCalledTimes(1);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: example.loading }) as HTMLButtonElement).disabled).toBe(true);
    for (const name of Object.keys(example.fields)) {
      expect((form.elements.namedItem(name) as HTMLInputElement).readOnly).toBe(true);
    }
    const submitted = example.action.mock.calls[0][1] as FormData;
    for (const [name, value] of Object.entries(example.fields)) expect(submitted.get(name)).toBe(value);
    if (example.hidden) expect(submitted.get(example.hidden[0])).toBe(example.hidden[1]);

    await act(async () => finish({ status: "error", message: "Please try again." }));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(form.getAttribute("aria-busy")).toBe("false");
    example.action.mockResolvedValueOnce({ status: "error", message: "Still unavailable." });
    fireEvent.submit(form);
    await screen.findByText("Still unavailable.");
    expect(example.action).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("button", { name: example.submit }) as HTMLButtonElement).disabled).toBe(false);
  });
});

it("focuses recovery confirmation and keeps the entered email visible", async () => {
  actions.requestPasswordRecoveryAction.mockResolvedValue({ status: "success", message: "If that account exists, a password reset link has been sent." });
  const { container } = render(<ForgotPasswordForm />);
  fill({ email: "fixture@example.invalid" });
  fireEvent.submit(container.querySelector("form")!);
  const confirmation = await screen.findByRole("status");
  await waitFor(() => expect(document.activeElement).toBe(confirmation));
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("fixture@example.invalid");
});

it("accepts an invitation without adding password fields when a password is not required", async () => {
  actions.acceptInvitationAction.mockResolvedValue({ status: "error", message: "Invitation unavailable." });
  const { container } = render(<AcceptInvitationForm invitationId="fixture-invitation" passwordRequired={false} />);
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText("Invitation unavailable.");
  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect((actions.acceptInvitationAction.mock.calls[0][1] as FormData).get("invitationId")).toBe("fixture-invitation");
  expect(container.textContent).not.toContain("fixture-invitation");
});
