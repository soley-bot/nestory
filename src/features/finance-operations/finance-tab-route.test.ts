import { describe, expect, it } from "vitest";
import { financeTabHref } from "./finance-tab-route";

describe("finance tab route", () => {
  it.each(["/\\", "/\\["])("drops a malformed report origin without throwing: %s", returnTo => {
    expect(financeTabHref("/properties/p/finance", "expenses", "expenseMonth=2026-09", new URLSearchParams({ returnTo }).toString()))
      .toBe("/properties/p/finance?view=expenses&expenseMonth=2026-09");
  });
  it("retains only filters supported by the destination and the fixed unit scope", () => {
    const href = financeTabHref("/units/unit-1/finance", "rent", "q=Alice&status=unpaid&sort=due&page=2&expenseMonth=2026-09&property=wrong&action=delete&email=private", "returnTo=https%3A%2F%2Fevil.test");
    expect(href).toBe("/units/unit-1/finance?view=rent&q=Alice&sort=due&status=unpaid");
  });
  it("retains the expense period without copying rent filters", () => {
    expect(financeTabHref("/properties/p/finance", "expenses", "expenseMonth=2026-09&q=Alice&status=unpaid&page=2", ""))
      .toBe("/properties/p/finance?view=expenses&expenseMonth=2026-09");
  });
  it("keeps supported report return context when promoting a unit to the property owner account", () => {
    const report = "/reports/unit-profit-loss?month=2026-09&propertyId=p&unitId=u";
    const href = financeTabHref("/properties/p/finance", "account", "q=Alice&unitId=u", new URLSearchParams({ returnTo: report }).toString());
    const url = new URL(href, "https://nestory.invalid");
    expect(url.pathname).toBe("/properties/p/finance");
    expect([...url.searchParams.keys()]).toEqual(["view", "returnTo"]);
    expect(url.searchParams.get("returnTo")).toBe(report);
  });
});
