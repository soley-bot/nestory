/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardError from "./error";

const { captureException, isUnrecognizedActionError } = vi.hoisted(() => ({
  captureException: vi.fn(),
  isUnrecognizedActionError: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("next/navigation", () => ({
  unstable_isUnrecognizedActionError: isUnrecognizedActionError,
}));

describe("DashboardError", () => {
  beforeEach(() => {
    captureException.mockClear();
    isUnrecognizedActionError.mockReset();
    isUnrecognizedActionError.mockReturnValue(false);
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports the failure and preserves the retry action", async () => {
    const error = Object.assign(new Error("dashboard exploded"), {
      digest: "dashboard-digest",
    });
    const reset = vi.fn();

    render(<DashboardError error={error} reset={reset} />);

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: {
        boundary: "dashboard",
        has_digest: "true",
        has_stack: "true",
      },
    });
    screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("offers an explicit hard reload without reporting expected deployment skew", () => {
    const error = new Error("stale deployment action");
    const reset = vi.fn();
    const historyGo = vi.spyOn(window.history, "go").mockImplementation(() => {});
    isUnrecognizedActionError.mockImplementation(
      (candidate) => candidate === error,
    );

    render(<DashboardError error={error} reset={reset} />);

    expect(captureException).not.toHaveBeenCalled();
    expect(historyGo).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Reload current version" }).click();

    expect(historyGo).toHaveBeenCalledWith(0);
    expect(reset).not.toHaveBeenCalled();
  });
});
