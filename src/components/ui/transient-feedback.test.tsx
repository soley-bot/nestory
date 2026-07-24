/* @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransientFeedback } from "@/components/ui/transient-feedback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TransientFeedback", () => {
  it("does not restart an informational feedback timer when the dismiss callback changes", () => {
    vi.useFakeTimers();
    const firstDismiss = vi.fn();
    const latestDismiss = vi.fn();
    const rendered = render(
      <TransientFeedback message="Person updated." onDismiss={firstDismiss} />,
    );

    act(() => {
      vi.advanceTimersByTime(4_000);
    });

    rendered.rerender(
      <TransientFeedback message="Person updated." onDismiss={latestDismiss} />,
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(firstDismiss).not.toHaveBeenCalled();
    expect(latestDismiss).toHaveBeenCalledOnce();
  });
});
