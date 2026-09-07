import { describe, expect, it } from "vitest";
import { reportReturnHref, withReportReturn } from "./report-return";
describe("report correction return scope", () => {
  it("preserves the originating live report through account and ownership correction returns", () => {
    const report = "/reports/monthly-owner-activity?month=2026-08&propertyId=p&ownerPersonId=o";
    const account = withReportReturn("/balances?month=2026-08&propertyId=p&ownerPersonId=o&view=statements", reportReturnHref(report));
    const correction = new URL(withReportReturn("/properties/p#property-ownership", account), "https://nestory.invalid");
    const returnedAccount = reportReturnHref(correction.searchParams.get("returnTo"));
    expect(returnedAccount).toBe(account);
    const accountUrl = new URL(returnedAccount!, "https://nestory.invalid");
    expect(accountUrl.searchParams.get("month")).toBe("2026-08");
    expect(accountUrl.searchParams.get("view")).toBe("statements");
    expect(reportReturnHref(accountUrl.searchParams.get("returnTo"))).toBe(report);
  });
  it("keeps exact report filters through a property correction", () => {
    const original = "/balances?month=2026-08&propertyId=p&ownerPersonId=o&view=statements";
    const target = new URL(withReportReturn("/properties/p#property-ownership", original), "https://nestory.invalid");
    expect(target.pathname).toBe("/properties/p"); expect(target.hash).toBe("#property-ownership");
    expect(reportReturnHref(target.searchParams.get("returnTo"))).toBe(original);
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/login", "javascript:alert(1)", ["/balances"]])("rejects an unsafe return target %s", value => {
    expect(reportReturnHref(value)).toBeUndefined();
  });
});
