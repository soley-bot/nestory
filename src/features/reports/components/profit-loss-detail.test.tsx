// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfitLossDetail } from "./profit-loss-detail";
import type { UnitProfitLossLine } from "../reports.types";
afterEach(cleanup);
const line: UnitProfitLossLine = { amountCents: BigInt(6500), category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-09-09", description: "Roof repair", direction: "expense", id: "repair", property: "Property One", reportingGroup: "expenses", unit: "Property-level" };
describe("P&L transaction groups", () => {
  it("starts collapsed, includes signed corrections in subtotals, and expands or collapses all", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={[line, { ...line, id: "correction", description: "Repair correction", amountCents: -BigInt(1500) }]} />);
    expect(screen.getByRole("button", { name: /Expenses: Repairs/ }).textContent).toContain("USD 50.00");
    expect(screen.queryByText("Roof repair")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Repair correction")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "-USD 15.00" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Repair correction")).toBeNull();
  });
  it("finds corrections by their displayed transaction type", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={[line, { ...line, id: "reversal", description: "Duplicate removed", type: "Correction", amountCents: -BigInt(6500) }]} />);
    await user.type(screen.getByRole("textbox", { name: "Search transactions" }), "Correction");
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Duplicate removed")).toBeTruthy();
    expect(screen.queryByText("Roof repair")).toBeNull();
  });

  it("paginates account transactions and searches across every page", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={Array.from({length: 28}, (_, index) => ({ ...line, id: `${index}`, description: `Repair ${index + 1}` }))} />);
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(26);
    await user.click(screen.getByRole("button", { name: "Next transactions" }));
    expect(screen.getByText("Repair 28")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Search transactions" }), "Repair 28");
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Expenses: Repairs/ }).textContent).toContain("USD 65.00");
  });
});
