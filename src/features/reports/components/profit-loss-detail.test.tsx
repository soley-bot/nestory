// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfitLossDetail } from "./profit-loss-detail";
import type { UnitProfitLossLine } from "../reports.types";
afterEach(cleanup);
const line: UnitProfitLossLine = { amountCents: BigInt(6500), category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-09-09", description: "Roof repair", direction: "expense", id: "repair", property: "Property One", reportingGroup: "expenses", unit: "Property-level" };
describe("Reference P&L account table", () => {
  it("keeps signed totals visible while account details and sections collapse independently", async () => {
    const user = userEvent.setup();
    render(<ProfitLossDetail lines={[line, { ...line, id: "correction", type: "Correction", description: "Repair correction", amountCents: -BigInt(1500) }]} funding={{ contributionCents: BigInt(2000), remainingBalanceCents: BigInt(4000) }} />);
    const account = screen.getByRole("button", { name: "Operating expenses: Repairs" });
    expect(within(account.closest("tr")!).getByText("USD 50.00")).toBeTruthy();
    expect(screen.getByRole("row", { name: "Net operating income -USD 50.00" })).toBeTruthy();
    expect(screen.getByRole("row", { name: "Net income USD 10.00" })).toBeTruthy();
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
    expect(screen.getByRole("row", { name: "Net income USD 10.00" })).toBeTruthy();
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
