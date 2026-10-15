import { describe, expect, it, vi } from "vitest";
import { loadRentInvoicePage } from "./rent-invoice-page";
import { parseRentInvoiceQuery, RentPropertyUnavailableError } from "../rent-invoice-query";

export const invoiceRow = (id = "invoice-1") => ({
  id, organization_id: "organization-1", property_id: "property-1", unit_id: "unit-1", lease_id: "lease-1",
  invoice_number: id, issue_date: "2026-08-01", due_date: "2026-08-05", billing_period_start: "2026-08-01", billing_period_end: "2026-08-31",
  collection_route: "through_ips", recipient_label: "Tenant", occupant_labels: ["Occupant"], currency: "USD",
  total_amount: 10.25, balance_due: 10.25, paid_through_ips: 0, collected_by_owner: 0, payment_status: "unpaid",
});
export const invoicePage = () => ({
  invoices: Array.from({ length: 50 }, (_, index) => invoiceRow(`invoice-${index}`)),
  selectedInvoice: invoiceRow("report-invoice"),
  pagination: { from: 51, to: 100, page: 2, pageSize: 50, totalCount: 1251, totalPages: 26 },
  totalVisibleCount: 1251, totalsByCurrency: [{ currency: "USD", collected: 0, outstanding: 12822.75 }],
  propertyOptions: [{ id: "property-1", label: "Home" }, { id: "property-2", label: "Other home" }],
});

describe("rent invoice page", () => {
  it.each(["bad", "------------------------------------", ["all", "00000000-0000-4000-8000-000000000030"]].map(property => ({ property })))("rejects an invalid or ambiguous property selector before querying: $property", ({ property }) => {
    expect(() => parseRentInvoiceQuery({ property })).toThrow("This property is unavailable for your current access.");
  });

  it("bounds a bookmarked search to the same 500 characters shown in the filter", () => {
    expect(parseRentInvoiceQuery({ q: "  " + "a".repeat(501) + "  " }).query).toBe("a".repeat(500));
    expect(parseRentInvoiceQuery({ q: "a".repeat(500) }).query).toBe("a".repeat(500));
    expect(parseRentInvoiceQuery({ q: "a".repeat(499) + "\u{1f3e0}" }).query).toBe("a".repeat(499));
  });

  it("normalizes valid uppercase UUID bookmarks without discarding their scope", () => {
    expect(parseRentInvoiceQuery({ property: "019ED022-93F8-7F10-9896-BD6FEE371BB0" }).propertyId).toBe("019ed022-93f8-7f10-9896-bd6fee371bb0");
  });

  it("uses the first repeated search value just like the displayed URL filter", () => {
    expect(parseRentInvoiceQuery({ q: [" Morgan ", "ignored"] }).query).toBe("Morgan");
    expect(parseRentInvoiceQuery({ q: ["a".repeat(501), "ignored"] }).query).toBe("a".repeat(500));
  });

  it("treats property access revoked after preflight as unavailable without retrying unscoped", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "Not authorized" } });
    await expect(loadRentInvoicePage({ rpc } as never, "organization-1", "property-1", parseRentInvoiceQuery({}))).rejects.toBeInstanceOf(RentPropertyUnavailableError);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_property_id).toBe("property-1");
  });

  it("loads one bounded page with full totals and a separately selected report invoice", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: invoicePage(), error: null });
    const result = await loadRentInvoicePage({ rpc } as never, "organization-1", "property-1", {
      ...parseRentInvoiceQuery({ page: "2", q: "Morgan 7FD2", status: "open", overdueDays: "7", sort: "due_asc" }),
      unitId: "unit-1", leaseId: "lease-1", selectedInvoiceId: "report-invoice",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_rent_invoice_page", {
      p_organization_id: "organization-1", p_property_id: "property-1", p_unit_id: "unit-1", p_lease_id: "lease-1", p_selected_invoice_id: "report-invoice",
      p_query: "Morgan 7FD2", p_status: "open", p_due: "all", p_overdue_days: 7, p_sort: "due_asc", p_page: 2, p_page_size: 50,
    });
    expect(result.invoices).toHaveLength(50);
    expect(result.selectedInvoice?.id).toBe("report-invoice");
    expect(result.page.pagination.totalCount).toBe(1251);
    expect(result.page.totalsByCurrency[0].outstanding).toBe(12822.75);
  });

  it("fails closed on page errors, then retries a fresh read successfully", async () => {
    const data = { ...invoicePage(), selectedInvoice: null };
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "timeout" } }).mockResolvedValueOnce({ data, error: null });
    const query = parseRentInvoiceQuery({ page: "2" });
    await expect(loadRentInvoicePage({ rpc } as never, "organization-1", "property-1", query)).rejects.toThrow("timeout");
    await expect(loadRentInvoicePage({ rpc } as never, "organization-1", "property-1", query)).resolves.toHaveProperty("invoices.length", 50);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["organization", "property", "duplicate", "truncated", "currency"])("rejects %s corruption instead of showing authoritative totals", async (kind) => {
    const data = { ...invoicePage(), selectedInvoice: null };
    if (kind === "organization") data.invoices[0].organization_id = "another-organization";
    if (kind === "property") data.invoices[0].property_id = "another-property";
    if (kind === "duplicate") data.invoices[1].id = data.invoices[0].id;
    if (kind === "truncated") data.invoices.pop();
    if (kind === "currency") data.invoices[0].currency = "KHR";
    await expect(loadRentInvoicePage({ rpc: vi.fn().mockResolvedValue({ data, error: null }) } as never, "organization-1", "property-1", parseRentInvoiceQuery({ page: "2" }))).rejects.toThrow(/page response/);
  });

  it("normalizes ambiguous and unbounded URL filters before querying", () => {
    expect(parseRentInvoiceQuery({ page: "Infinity", status: ["open", "paid"], sort: "bad", property: "all" })).toMatchObject({ page: 1, status: "all", sort: "default", propertyId: undefined });
    expect(parseRentInvoiceQuery({ page: "9999999999" }).page).toBe(2147483647);
  });
});
