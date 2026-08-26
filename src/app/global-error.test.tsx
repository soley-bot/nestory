/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("GlobalError", () => {
  beforeEach(() => captureException.mockClear());

  it("reports root failures and offers recovery", () => {
    const error = new Error("root exploded");
    error.stack = undefined;
    const reset = vi.fn();

    render(<GlobalError error={error} reset={reset} />);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        boundary: "global",
        has_digest: "false",
        has_stack: "false",
      },
    });
    expect(
      screen.getByText(/reopen the record to confirm the latest state/i),
    ).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();
  });
});
