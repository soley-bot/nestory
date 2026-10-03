import { describe, expect, it } from "vitest";
import { workflowReturnHref } from "./workflow-return";

describe("workflow return context", () => {
  it.each(["/\\", "/\\["])("rejects malformed direct and nested origins without throwing: %s", value => {
    expect(workflowReturnHref(value)).toBeUndefined();
    expect(workflowReturnHref(`/rent-income?${new URLSearchParams({ returnTo: value })}`)).toBe("/rent-income");
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/properties/../login", "/login", "javascript:alert(1)", "/rent-income\n", "/rent-income#bad", "/rent-income?" + "q=" + "x".repeat(2000)])("rejects unsafe or unsupported origins %s", value => {
    expect(workflowReturnHref(value)).toBeUndefined();
  });
  it("preserves the move-in section when returning to a unit", () => {
    expect(workflowReturnHref("/units/unit-1?section=lease")).toBe("/units/unit-1?section=lease");
  });
  it("preserves scope and filter context but removes action payload and arbitrary customer fields", () => {
    expect(workflowReturnHref("/units/unit-1/finance?view=rent&q=Alice&status=unpaid&page=2&action=record-payment&invoiceId=invoice-1&email=private"))
      .toBe("/units/unit-1/finance?view=rent&q=Alice&status=unpaid&page=2");
  });
  it("preserves the existing validated report return chain", () => {
    const report = "/reports/unit-profit-loss?month=2026-09&propertyId=p&unitId=u";
    const origin = `/rent-income?${new URLSearchParams({ q: "Alice", returnTo: report })}`;
    expect(workflowReturnHref(origin)).toBe(origin);
    expect(workflowReturnHref(`/rent-income?${new URLSearchParams({ returnTo: "//evil.test" })}`)).toBe("/rent-income");
  });
});
