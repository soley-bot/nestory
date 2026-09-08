/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
}));

import OwnerAccountsError from "./error";

describe("OwnerAccountsError", () => {
  it("keeps failures recoverable without exposing database details", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("private database failure"), {
      digest: "owner-account-digest",
    });

    render(<OwnerAccountsError error={error} retry={retry} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Owner accounts could not be loaded",
    );
    expect(screen.getByRole("alert").textContent).not.toContain(
      "private database failure",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(mocks.captureException).toHaveBeenCalledWith(error, {
      tags: {
        boundary: "owner-accounts",
        has_digest: "true",
      },
    });
  });
});
