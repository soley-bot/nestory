// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountEntryActions } from "./account-entry-actions";
import type { PropertyAccountEntry } from "../finance-operations.types";

vi.mock("@/features/owner-balances/components/owner-transaction-correction-dialog", () => ({ OwnerTransactionCorrectionDialog: ({ open, entry }: { open: boolean; entry: { id: string } }) => open ? <div role="dialog" aria-label="Correction">{entry.id}</div> : null }));
vi.mock("./transaction-delete-dialog", () => ({ TransactionDeleteDialog: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Delete transaction" /> : null }));
afterEach(cleanup);
const entry: PropertyAccountEntry = { id: "projection-id", amount: 50, category: "withdrawal", createdAt: "2026-09-01", date: "2026-09-01", label: "Owner distribution", note: "Bank transfer", propertyId: "property-1", runningBalance: 300, sourceType: "property_withdrawal", source: { kind: "distribution", id: "actual-withdrawal", reference: "REF-1" } };

describe("account transaction menu", () => {
  it("opens from the keyboard and displays readable details without source identifiers", async () => {
    const user = userEvent.setup();
    render(<AccountEntryActions entry={entry} propertyLabel="Riverside" canCorrectFinance={false} />);
    await user.tab(); await user.keyboard("{Enter}");
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Transaction details" })).toBeTruthy();
    expect(screen.getByText("USD 50.00")).toBeTruthy();
    expect(screen.queryByText("actual-withdrawal")).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    expect(screen.getByRole("menuitem", { name: "View transaction" })).toBeTruthy();
  });
  it("uses authoritative correction identity", async () => {
    const user = userEvent.setup();
    render(<AccountEntryActions entry={entry} propertyLabel="Riverside" canCorrectFinance />);
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Correction" }).textContent).toBe("actual-withdrawal");
  });
  it.each([undefined, { ...entry.source!, blockedReason: "This transaction has been reversed." }, { ...entry.source!, blockedReason: "This transaction belongs to a closed period." }])("keeps unavailable and historical transactions read-only", async (source) => {
    const user = userEvent.setup();
    render(<AccountEntryActions entry={{ ...entry, source }} propertyLabel="Riverside" canCorrectFinance />);
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "View transaction" })).toBeTruthy();
  });
  it("opens the provided source workflow", async () => {
    const user = userEvent.setup(); const onSelect = vi.fn();
    render(<AccountEntryActions entry={{ ...entry, source: { kind: "expense", id: "submission-1", reference: null } }} propertyLabel="Riverside" canCorrectFinance sourceAction={{ label: "Open expense transaction", onSelect }} />);
    await user.click(screen.getByRole("button", { name: /Actions for/ }));
    await user.click(screen.getByRole("menuitem", { name: "Open expense transaction" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
