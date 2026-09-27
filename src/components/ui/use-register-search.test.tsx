// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRegisterSearch } from "./use-register-search";

function Harness({
  applied = "",
  apply,
}: {
  applied?: string;
  apply: (query: string) => void;
}) {
  const search = useRegisterSearch(applied, apply);
  return (
    <form onSubmit={search.onSubmit}>
      <input
        aria-label="Search"
        value={search.query}
        onChange={(event) => search.onQueryChange(event.target.value)}
        onCompositionStart={() => search.onCompositionChange(true)}
        onCompositionEnd={() => search.onCompositionChange(false)}
      />
      <button>Search</button>
      <button type="button" onClick={search.cancelPending}>Open suggestion</button>
    </form>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("register live search", () => {
  it("retains newer text when the newer response arrives first and restores its URL", async () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const view = render(<Harness apply={apply} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "River" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Riverside" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    view.rerender(<Harness applied="Riverside" apply={apply} />);
    view.rerender(<Harness applied="River" apply={apply} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Riverside");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apply).toHaveBeenLastCalledWith("Riverside");
    expect(apply).toHaveBeenCalledTimes(3);
    view.rerender(<Harness applied="Riverside" apply={apply} />);
    view.rerender(<Harness applied="" apply={apply} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  });
  it("cancels a pending search when a suggestion opens a record", async () => {
    vi.useFakeTimers(); const apply = vi.fn(); render(<Harness apply={apply} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Riverside" } });
    fireEvent.click(screen.getByRole("button", { name: "Open suggestion" }));
    await act(() => vi.advanceTimersByTimeAsync(600)); expect(apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "River" } });
    await act(() => vi.advanceTimersByTimeAsync(500)); expect(apply).toHaveBeenCalledWith("River");
  });
  it("debounces typing and submits immediately on Enter without a duplicate", async () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    render(<Harness apply={apply} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Riverside" },
    });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(apply).toHaveBeenCalledWith("Riverside");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it("keeps newer typing when an earlier request arrives, and follows external navigation", async () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const view = render(<Harness apply={apply} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "River" },
    });
    await act(() => vi.advanceTimersByTimeAsync(500));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Riverside" },
    });
    view.rerender(<Harness applied="River" apply={apply} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Riverside",
    );
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apply).toHaveBeenLastCalledWith("Riverside");
    view.rerender(<Harness applied="Other" apply={apply} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Other",
    );
  });
  it("waits for composition to end, then searches and clears", async () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const view = render(<Harness apply={apply} />);
    fireEvent.compositionStart(screen.getByRole("textbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "សុខ" } });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.compositionEnd(screen.getByRole("textbox"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apply).toHaveBeenCalledWith("សុខ");
    view.rerender(<Harness applied="សុខ" apply={apply} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(apply).toHaveBeenLastCalledWith("");
  });
});
