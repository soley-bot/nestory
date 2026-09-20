// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("../transaction-delete-actions", () => ({ deleteTransactionAction: mocks.action }));
import { TransactionDeleteDialog } from "./transaction-delete-dialog";
const entry = { kind: "distribution" as const, id: "source", propertyId: "property", date: "2026-08-31", amount: 454.4, label: "Owner distribution" };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("delete transaction confirmation", () => {
  it("hides controls without permission", () => {
    render(<TransactionDeleteDialog open canDelete={false} entry={entry} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows date and amount and cancels without writing", async () => {
    const close = vi.fn(); const user = userEvent.setup();
    render(<TransactionDeleteDialog open canDelete entry={entry} onOpenChange={close} />);
    expect(screen.getByText("31 Aug 2026")).toBeTruthy(); expect(screen.getByText("USD 454.40")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete transaction" }).hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByLabelText("Reason for deletion"), "Duplicate transaction");
    expect(mocks.action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" })); expect(close).toHaveBeenCalledWith(false);
    expect(mocks.action).not.toHaveBeenCalled();
  });
  it("retains readable server rejection without closing", async () => {
    mocks.action.mockResolvedValue({ status: "error", message: "This money is used by another transaction." });
    const close = vi.fn(); const user = userEvent.setup();
    render(<TransactionDeleteDialog open canDelete entry={entry} onOpenChange={close} />);
    await user.type(screen.getByLabelText("Reason for deletion"), "Duplicate transaction");
    await user.click(screen.getByRole("button", { name: "Delete transaction" }));
    expect((await screen.findByRole("alert")).textContent).toContain("used by another");
    expect(mocks.action).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
  });
});
