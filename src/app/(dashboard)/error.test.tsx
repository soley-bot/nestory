/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardError from "./error";

const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("DashboardError", () => {
  beforeEach(() => captureException.mockClear());

  it("reports the failure and preserves the retry action", async () => {
    const error = new Error("dashboard exploded");
    const reset = vi.fn();

    render(<DashboardError error={error} reset={reset} />);

    expect(captureException).toHaveBeenCalledWith(error);
    screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();
  });
});
