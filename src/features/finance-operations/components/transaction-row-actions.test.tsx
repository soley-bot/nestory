// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionRowActions } from "./transaction-row-actions";
import type { TransactionRow } from "../data/transaction-workspace";
vi.mock("./transaction-delete-dialog", () => ({TransactionDeleteDialog: () => null}));
afterEach(cleanup);
const row = {label:"September rent", propertyId:"property", history:false, source:{kind:"charge",invoice:{id:"invoice",leaseId:"lease",issueDate:"2026-09-01",totalAmount:500,settlements:[],lines:[{id:"line",amount:500,lineType:"rent"}]}}} as unknown as TransactionRow;
describe("issued rent action authority", () => {
  it.each([false,true])("matches lease correction authority: %s", async canCorrectIssuedRent => {
    const user=userEvent.setup();
    render(<TransactionRowActions row={row} canCorrect canViewLeases canCorrectIssuedRent={canCorrectIssuedRent} />);
    await user.click(screen.getByRole("button",{name:"Actions for September rent"}));
    expect(Boolean(screen.queryByRole("menuitem",{name:"Edit issued rent on lease"}))).toBe(canCorrectIssuedRent);
    expect(screen.getByRole("menuitem",{name:"Delete"})).toBeTruthy();
  });
});
