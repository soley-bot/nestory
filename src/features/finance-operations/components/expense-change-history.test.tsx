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
  it("shows account names and complete reasons without exposing database identifiers", async () => {
    const oldAccount = "00000000-0000-4000-8000-000000000001";
    const newAccount = "00000000-0000-4000-8000-000000000002";
    const actor = "00000000-0000-4000-8000-000000000003";
    const reason = "The supplier corrected the reference on the original receipt. ".repeat(4);
    vi.mocked(getExpenseHistory).mockResolvedValue([{
      id: "history-entry", action: "updated", actor, actor_id: actor,
      created_at: "2026-10-03T08:00:00Z",
      previous_values: { expense: { pay_from_account_id: oldAccount, reference: "INV-2026-001" } },
      new_values: { expense: { pay_from_account_id: newAccount, reference: "INV-2026-002" }, reason },
    }]);
    const { container } = render(<ExpenseChangeHistory transactionId="expense-one" payFromAccounts={[
      { id: oldAccount, displayName: "Operating bank account" },
      { id: newAccount, displayName: "Property cash account" },
    ]} />);
    await screen.findByText("Workspace member");
    expect(container.textContent).toContain(reason);
    expect(container.textContent).toContain("Operating bank account");
    expect(container.textContent).toContain("Property cash account");
    expect(container.textContent).toContain("INV-2026-001");
    expect(container.textContent).toContain("INV-2026-002");
    for (const id of [oldAccount, newAccount, actor]) expect(container.textContent).not.toContain(id);
    expect(getExpenseHistory).toHaveBeenCalledWith("expense-one");
  });

  it("keeps an account change visible when its names are unavailable", async () => {
    const oldAccount = "00000000-0000-4000-8000-000000000001";
    const newAccount = "00000000-0000-4000-8000-000000000002";
    vi.mocked(getExpenseHistory).mockResolvedValue([{
      id: "history-entry", action: "updated", actor: "System", actor_id: null,
      created_at: "2026-10-03T08:00:00Z",
      previous_values: { expense: { pay_from_account_id: oldAccount } },
      new_values: { expense: { pay_from_account_id: newAccount } },
    }]);
    const { container } = render(<ExpenseChangeHistory transactionId="expense-one" payFromAccounts={[{ id: oldAccount, displayName: oldAccount }]} />);
    await screen.findByText("Paid-from account");
    expect(screen.getAllByText(/Account unavailable/)).toHaveLength(2);
    expect(container.textContent).not.toContain(oldAccount);
    expect(container.textContent).not.toContain(newAccount);
  });
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
