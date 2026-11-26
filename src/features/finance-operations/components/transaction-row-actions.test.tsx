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
const fee = { ...row, kind: "management_fee", label: "Management fee",
  source: { kind: "account", entry: { source: { kind: "lease", id: "lease", invoiceId } } } } as TransactionRow;
describe("issued rent action authority", () => {
  it.each([false,true])("matches lease correction authority: %s", async canCorrectIssuedRent => {
    const user=userEvent.setup();
    render(<TransactionRowActions row={row} canCorrect canViewLeases canCorrectIssuedRent={canCorrectIssuedRent} />);
    await user.click(screen.getByRole("button",{name:"Actions for September rent"}));
    expect(Boolean(screen.queryByRole("menuitem",{name:"Edit issued rent on lease"}))).toBe(canCorrectIssuedRent);
    if (canCorrectIssuedRent) expect(screen.getByRole("menuitem", { name: "Edit issued rent on lease" }).getAttribute("href")).toContain(`invoiceId=${invoiceId}`);
    expect(screen.getByRole("menuitem",{name:"Delete"})).toBeTruthy();
  });
  it("opens the management fee for the exact invoice and keeps the return path", async () => {
    render(<TransactionRowActions row={fee} canCorrect canViewLeases canCorrectIssuedRent returnTo="/rent-income" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Actions for Management fee" }));
    const href = new URL(screen.getByRole("menuitem", { name: "Correct management fee" }).getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe("/leases/lease");
    expect(Object.fromEntries(href.searchParams)).toMatchObject({ invoiceId, action: "correct-management-fee", returnTo: "/rent-income" });
  });
  it("omits the management fee action for a reader or a historical posting", () => {
    const { rerender } = render(<TransactionRowActions row={fee} canCorrect={false} canViewLeases />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<TransactionRowActions row={{ ...fee, history: true }} canCorrect canViewLeases canCorrectIssuedRent />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
