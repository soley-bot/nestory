import { describe, expect, it } from "vitest";
import { financeReturnHref, financeTabHref, propertyFinanceReturnLinks } from "./finance-tab-route";

describe("finance tab route", () => {
  it("preserves allowed property register filters without propagating actions", () => {
    const links = propertyFinanceReturnLinks("property-1", "/properties?query=Central&page=2&status=active&action=delete&email=private");
    const origin = "/properties?query=Central&page=2&status=active";
    expect(links.propertiesHref).toBe(origin);
    expect(new URL(links.propertyHref, "https://nestory.invalid").searchParams.get("returnTo")).toBe(origin);
    expect(new URL(links.transactionsHref, "https://nestory.invalid").searchParams.get("returnTo")).toBe(origin);
  });

  it.each([undefined, "https://evil.test", "//evil.test", "/\\evil.test"])("drops unsafe property return context %s", (origin) => {
    expect(propertyFinanceReturnLinks("property-1", origin)).toEqual({
      propertiesHref: "/properties", propertyHref: "/properties/property-1", transactionsHref: "/properties/property-1/finance",
    });
  });

  it("does not relabel a report or lease origin as the property register", () => {
    for (const origin of ["/reports/rent-collections?month=2026-10", "/leases/lease-1?section=rent"]) {
      const links = propertyFinanceReturnLinks("property-1", origin);
      expect(links.propertiesHref).toBe("/properties");
      expect(new URL(links.transactionsHref, "https://nestory.invalid").searchParams.get("returnTo")).toBe(origin);
    }
  });
  it("keeps one safe upstream lease origin and strips nested action payloads", () => {
    const origin = "/units/unit-1?section=lease&action=delete&email=private";
    const href = financeReturnHref(`/leases/lease-1?${new URLSearchParams({ section: "rent", returnTo: origin, action: "activate" })}`)!;
    const url = new URL(href, "https://nestory.invalid");
    expect(url.searchParams.get("section")).toBe("rent");
    expect(url.searchParams.get("returnTo")).toBe("/units/unit-1?section=lease");
    expect(url.searchParams.has("action")).toBe(false);
    expect(financeReturnHref(`/leases/lease-1?${new URLSearchParams({ section: "rent", returnTo: "//evil.test" })}`))
      .toBe("/leases/lease-1?section=rent");
  });
  it.each(["rent", "expenses", "account", "transactions"])("preserves a safe lease return on the %s tab", (view) => {
    const href = financeTabHref("/units/unit-1/finance", view, "expenseMonth=2026-09", new URLSearchParams({ returnTo: "/leases/lease-1?section=rent&action=activate&email=private" }).toString());
    expect(new URL(href, "https://nestory.invalid").searchParams.get("returnTo")).toBe("/leases/lease-1?section=rent");
  });
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
