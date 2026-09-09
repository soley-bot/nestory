/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransientFeedback } from "@/components/ui/transient-feedback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TransientFeedback", () => {
  it.each(["pointer", "keyboard"])("keeps feedback available during %s interaction", (input) => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<TransientFeedback message="Document uploaded." onDismiss={onDismiss} />);
    const notice = screen.getByRole("status");
    const close = screen.getByRole("button", { name: "Dismiss notification" });
    act(() => vi.advanceTimersByTime(4_000));
    if (input === "pointer") fireEvent.mouseEnter(notice);
    else fireEvent.focus(close);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onDismiss).not.toHaveBeenCalled();
    if (input === "pointer") fireEvent.mouseLeave(notice);
    else fireEvent.blur(close, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(4_500));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps a follow-up action until explicitly dismissed", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<TransientFeedback action={{ href: "/people/1", label: "View person" }} message="Person added." onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "View person" }).getAttribute("href")).toBe("/people/1");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

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
