// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PropertyFinancePosition, TenantInvoiceSummary } from "../finance-operations.types";
import { getRentInvoiceView, RentInvoiceFilterBar } from "./rent-invoice-filters";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: "q=old&status=open&property=property-a" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/rent-income",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.params),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
it("searches while typing and clears only the search while keeping rent filters", async () => {
  vi.useFakeTimers();
  render(<RentInvoiceFilterBar invoices={[]} resultCount={0} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Search rent invoices" }), { target: { value: "tenant 101" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(navigation.replace).toHaveBeenLastCalledWith("/rent-income?q=tenant+101&status=open&property=property-a", { scroll: false });
  fireEvent.click(screen.getByRole("button", { name: "Clear search rent invoices" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(navigation.replace).toHaveBeenLastCalledWith("/rent-income?status=open&property=property-a", { scroll: false });
});

it("finds rent by a secondary owner and compact unit code without including a sibling unit", () => {
  const first = {id: "i1", propertyId: "p1", propertyLabel: "PM-1 · North", unitLabel: "BELLAVITA #7F-D2", invoiceNumber: "RENT-1", recipientLabel: "Tenant", occupantLabels: [], paymentStatus: "unpaid", dueDate: "2026-09-01"} as unknown as TenantInvoiceSummary;
  const second = {...first, id: "i2", unitLabel: "BELLAVITA #8F-D2"};
  const positions = [{propertyId: "p1", propertyLabel: "PM-1 · North", ownerLabel: "Primary Owner", ownerSearchLabels: ["Primary Owner", "Alex Morgan"]}] as PropertyFinancePosition[];
  const view = getRentInvoiceView([first, second], new URLSearchParams({q: "MORGAN 7FD2"}), "2026-09-27", positions);
  expect(view.filteredInvoices.map(invoice => invoice.id)).toEqual(["i1"]);
});

it("resets the page for rapid search and clear actions while retaining report return context", async () => {
  vi.useFakeTimers();
  navigation.params = "page=8&status=open&returnTo=%2Freports%2Frent";
  const view = render(<RentInvoiceFilterBar invoices={[]} resultCount={1251} totalCount={1551} properties={[{ id: "property-a", label: "House A" }]} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Search rent invoices" }), { target: { value: "Morgan" } });
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(navigation.replace).toHaveBeenLastCalledWith("/rent-income?status=open&returnTo=%2Freports%2Frent&q=Morgan", { scroll: false });
  view.rerender(<RentInvoiceFilterBar invoices={[]} resultCount={1251} totalCount={1551} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(navigation.replace).toHaveBeenLastCalledWith("/rent-income?returnTo=%2Freports%2Frent", { scroll: false });
  navigation.params = "q=old&status=open&property=property-a";
});
