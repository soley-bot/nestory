// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfitLossDetail } from "./profit-loss-detail";
import type { UnitProfitLossLine } from "../reports.types";
afterEach(cleanup);
const line: UnitProfitLossLine = { amountCents: BigInt(6500), category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-09-09", description: "Roof repair", direction: "expense", id: "repair", property: "Property One", reportingGroup: "expenses", unit: "Property-level" };
describe("Reference P&L account table", () => {
  it("shows the opening, signed activity and closing balance even when accrual profit differs", () => {
    render(<ProfitLossDetail lines={[line]} funding={{
      remainingBalanceCents: BigInt(0), contributionCents: BigInt(61538),
      accountPeriod: { start: "2026-10-01", end: "2026-10-31", closingBalanceCents: BigInt(110038) },
    }} />);
    const rows = within(screen.getByRole("rowgroup", { name: "Owner funding and account activity" })).getAllByRole("row");
    expect(rows.slice(1).map(row => within(row).getAllByRole("cell").map(cell => cell.textContent))).toEqual([
      ["Opening balance, 01 Oct 2026", "USD 0.00"], ["Owner funding contributions", "USD 615.38"],
      ["Collections, costs and payouts", "USD 485.00"], ["Closing balance, 31 Oct 2026", "USD 1,100.38"],
    ]);
    expect(screen.getByRole("row", { name: "Net operating income -USD 65.00" })).toBeTruthy();
  });
  it("opens the source expense with the exact report filters", async () => {
    const user = userEvent.setup();
    const returnTo = "/reports/unit-profit-loss?month=2026-09&propertyId=p&unitId=u";
    render(<ProfitLossDetail lines={[{ ...line, sourceHref: "/bills-expenses?sourceType=owner_invoice_line&sourceId=source" }]} returnTo={returnTo} />);
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    const href = new URL(screen.getByRole("link", { name: "Open transaction: Roof repair" }).getAttribute("href")!, "https://nestory.invalid");
    expect(href.pathname).toBe("/bills-expenses");
    expect(href.searchParams.get("sourceId")).toBe("source");
    expect(href.searchParams.get("returnTo")).toBe(returnTo);
  });
  it("keeps signed totals visible while account details and sections collapse independently", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={[line, { ...line, id: "correction", type: "Correction", description: "Repair correction", amountCents: -BigInt(1500) }]} funding={{ contributionCents: BigInt(2000), remainingBalanceCents: BigInt(4000) }} />);
    const account = screen.getByRole("button", { name: "Operating expenses: Repairs" });
    expect(within(account.closest("tr")!).getByText("USD 50.00")).toBeTruthy();
    expect(screen.getByRole("row", { name: "Net operating income -USD 50.00" })).toBeTruthy();
    expect(screen.queryByRole("row", { name: "Net income USD 10.00" })).toBeNull();
    expect(screen.getByRole("row", { name: "Owner funding contributions USD 20.00" })).toBeTruthy();
    expect(screen.queryByText("Roof repair")).toBeNull();
    await user.click(account);
    expect(screen.getByText("Repair correction")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "-USD 15.00" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Operating expenses" }));
    expect(screen.queryByRole("table", { name: "Repairs transactions" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("table", { name: "Repairs transactions" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Repair correction")).toBeNull();
    expect(screen.queryByRole("button", { name: "Operating expenses: Repairs" })).toBeNull();
    expect(screen.getByRole("button", { name: "Income" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Operating expenses" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("row", { name: "Net income USD 10.00" })).toBeNull();
    expect(screen.getByRole("row", { name: "Owner funding contributions USD 20.00" })).toBeTruthy();
  });
  it("expands every transaction in the report flow without paging or nested scroll regions", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={Array.from({ length: 58 }, (_, index) => ({ ...line, id: `${index}`, description: `Repair ${index + 1}` }))} />);
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Repair 58")).toBeTruthy();
    expect(within(screen.getByRole("table", { name: "Repairs transactions" })).getAllByRole("row")).toHaveLength(59);
    expect(screen.queryByRole("button", { name: "Next transactions" })).toBeNull();
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });
});
