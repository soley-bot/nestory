// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionRowActions } from "./transaction-row-actions";
import type { TransactionRow } from "../data/transaction-workspace";
vi.mock("./transaction-delete-dialog", () => ({TransactionDeleteDialog: () => null}));
afterEach(cleanup);
const invoiceId = "30000000-0000-4000-8000-000000000001";
const row = { label: "September rent", propertyId: "property", history: false, source: { kind: "charge",
  invoice: { id: invoiceId, leaseId: "lease", generationSource: "lease_rules_v1", issueDate: "2026-09-01",
    totalAmount: 500, settlements: [], lines: [{ id: "line", amount: 500, lineType: "rent" }] } } } as unknown as TransactionRow;
describe("issued rent action authority", () => {
  it.each([false,true])("matches lease correction authority: %s", async canCorrectIssuedRent => {
    const user=userEvent.setup();
    render(<TransactionRowActions row={row} canCorrect canViewLeases canCorrectIssuedRent={canCorrectIssuedRent} />);
    await user.click(screen.getByRole("button",{name:"Actions for September rent"}));
    expect(Boolean(screen.queryByRole("menuitem",{name:"Edit issued rent on lease"}))).toBe(canCorrectIssuedRent);
    if (canCorrectIssuedRent) expect(screen.getByRole("menuitem", { name: "Edit issued rent on lease" }).getAttribute("href")).toContain(`invoiceId=${invoiceId}`);
    expect(screen.getByRole("menuitem",{name:"Void invoice"})).toBeTruthy();
  });
  it("takes a settled charge to its payments without offering to void the invoice", async () => {
    if (row.source.kind !== "charge") throw new Error("Expected charge fixture");
    const paid = { ...row, source: { ...row.source, invoice: { ...row.source.invoice,
      settlements: [{ isReversed: false }] } } } as TransactionRow;
    const open = vi.fn();
    render(<TransactionRowActions row={paid} canCorrect canViewLeases onReviewPayments={open} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button",{ name: "Actions for September rent" }));
    expect(screen.queryByRole("menuitem",{ name: "Void invoice" })).toBeNull();
    await user.click(screen.getByRole("menuitem",{ name: "View linked payments" }));
    expect(open).toHaveBeenCalledOnce();
  });
});
