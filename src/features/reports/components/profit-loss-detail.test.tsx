// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfitLossDetail } from "./profit-loss-detail";
import { paginateTrustedReportForScreen } from "../data/report-screen-pagination";
import { parseReportSearchParams } from "../reports.filters";
import type { TrustedReport, UnitProfitLossLine } from "../reports.types";
afterEach(cleanup);
const line: UnitProfitLossLine = { amountCents: BigInt(6500), category: "Repairs", categoryCode: "repairs", categoryId: null, currency: "USD", date: "2026-09-09", description: "Roof repair", direction: "expense", id: "repair", property: "Property One", reportingGroup: "expenses", unit: "Property-level" };
describe("Reference P&L account table", () => {
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
  it("expands only the server page while retaining full account totals and source return navigation", async () => {
    const user = userEvent.setup();
    const viewQuery = parseReportSearchParams({ report: "unit-profit-loss", month: "2026-10", detailPage: "400" });
    const report = paginateTrustedReportForScreen({
      kind: "unit-profit-loss", rows: [],
      unitProfitLossLines: Array.from({ length: 10_000 }, (_, index) => ({ ...line, id: `${index}`, description: `Repair ${index + 1}`, sourceHref: `/bills-expenses?sourceId=${index + 1}` })),
    } as unknown as TrustedReport, viewQuery);
    const returnTo = "/reports/unit-profit-loss?month=2026-10&detailPage=400";
    render(<ProfitLossDetail lines={report.unitProfitLossLines!} screenPage={report.unitProfitLossScreen} viewQuery={viewQuery} returnTo={returnTo} />);
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Repair 10000")).toBeTruthy();
    expect(screen.queryByText("Repair 1")).toBeNull();
    expect(within(screen.getByRole("table", { name: "Repairs transactions" })).getAllByRole("row")).toHaveLength(26);
    expect(screen.getAllByText("Page 400 of 400")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Previous" })[0]?.getAttribute("href")).toContain("detailPage=399");
    expect(screen.getAllByRole("button", { name: "Next" })[0]?.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("row", { name: "Net operating income -USD 650,000.00" })).toBeTruthy();
    const source = new URL(screen.getByRole("link", { name: "Open transaction: Repair 10000" }).getAttribute("href")!, "https://nestory.invalid");
    expect(source.searchParams.get("returnTo")).toBe(returnTo);
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });
});
