// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getExpenseHistory } from "../expense-history";
import { ExpenseChangeHistory } from "./expense-change-history";

vi.mock("../expense-history", () => ({ getExpenseHistory: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(getExpenseHistory).mockReset();
});

describe("expense history recovery", () => {
  it("does not refresh twice when a retry resolves immediately during a double click", async () => {
    const user = userEvent.setup();
    vi.mocked(getExpenseHistory).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue([]);
    render(<ExpenseChangeHistory transactionId="expense-one" />);
    await screen.findByRole("alert");
    await user.dblClick(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("No saved changes.");
    expect(getExpenseHistory).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Refresh history" })).toBeTruthy();
  });

  it("retries a failed read once when double-clicked and keeps the transaction", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Awaited<ReturnType<typeof getExpenseHistory>>) => void;
    vi.mocked(getExpenseHistory)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<ExpenseChangeHistory transactionId="expense-one" />);
    await screen.findByRole("alert");
    await user.dblClick(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("status").textContent).toMatch(/^Loading history/);
    expect(getExpenseHistory).toHaveBeenCalledTimes(2);
    expect(getExpenseHistory).toHaveBeenLastCalledWith("expense-one");
    await act(async () => resolve([]));
    expect(screen.getByText("No saved changes.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores a stale response after switching expenses", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof getExpenseHistory>>) => void;
    vi.mocked(getExpenseHistory)
      .mockImplementationOnce(() => new Promise(done => { resolveFirst = done; }))
      .mockResolvedValueOnce([]);
    const { rerender } = render(<ExpenseChangeHistory transactionId="expense-one" />);
    rerender(<ExpenseChangeHistory transactionId="expense-two" />);
    await screen.findByText("No saved changes.");
    await act(async () => resolveFirst([{
      id: "old-change", action: "updated", actor: "Old member", actor_id: null,
      created_at: "2026-08-08T08:00:00Z", previous_values: {}, new_values: {},
    }]));
    expect(screen.queryByText(/Old member/)).toBeNull();
    expect(screen.getByText("No saved changes.")).toBeTruthy();
  });

  it("clears old failures and content while another expense loads", async () => {
    vi.mocked(getExpenseHistory).mockRejectedValueOnce(new Error("Unavailable"))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = render(<ExpenseChangeHistory transactionId="expense-one" />);
    await screen.findByRole("alert");
    rerender(<ExpenseChangeHistory transactionId="expense-two" />);
    expect(screen.queryByRole("alert")).toBeNull();
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Loading history/));
  });
});
