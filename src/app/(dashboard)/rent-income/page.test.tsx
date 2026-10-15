/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  financeData: vi.fn(),
  requireFinanceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData: mocks.financeData,
}));
vi.mock(
  "@/features/finance-operations/components/finance-operations-screen",
  () => ({
    FinanceOperationsScreen: (props: Record<string, unknown>) => (
      <div
        data-initial-billing-lease-id={String(
          props.initialBillingLeaseId ?? "",
        )}
        data-initial-rent-lease-id={String(props.initialRentLeaseId ?? "")}
        data-can-view-leases={String(props.canViewLeases ?? false)}
        data-testid="finance-operations"
      />
    ),
  }),
);

import RentIncomePage from "./page";
import { RentPropertyUnavailableError } from "@/features/finance-operations/rent-invoice-query";

afterEach(cleanup);

describe("RentIncomePage repair routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({
      capabilities: {
        canConfigureLeases: true,
        canCorrectFinance: true,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canReviewExpense: true,
        canReverseExpense: true,
        canRetryCurrentRent: true,
        canSubmitExpense: true,
      },
      organizationId: "organization-1",
      organizationName: "IPS",
      permissionKeys: new Set(["leases.change_terms", "leases.view"]),
    });
    mocks.financeData.mockResolvedValue({});
  });

  it("renders a recoverable unavailable property without loading broader totals", async () => {
    render(await RentIncomePage({ searchParams: Promise.resolve({ property: "bad", page: "8", q: "Morgan", status: "open" }) }));
    expect(screen.getByRole("alert").textContent).toBe("This property is unavailable for your current access.");
    expect(screen.getByRole("link", { name: "Clear property filter" }).getAttribute("href")).toBe("/rent-income?q=Morgan&status=open");
    expect(mocks.financeData).not.toHaveBeenCalled();
    expect(screen.queryByTestId("finance-operations")).toBeNull();
  });

  it("keeps a stale property's scope unavailable until the user clears it", async () => {
    const property = "00000000-0000-4000-8000-000000000030";
    mocks.financeData.mockRejectedValueOnce(new RentPropertyUnavailableError());
    render(await RentIncomePage({ searchParams: Promise.resolve({ property, page: "8", status: "paid" }) }));
    expect(screen.getByRole("alert").textContent).toBe("This property is unavailable for your current access.");
    expect(screen.getByRole("link", { name: "Clear property filter" }).getAttribute("href")).toBe("/rent-income?status=paid");
    expect(mocks.financeData).toHaveBeenCalledExactlyOnceWith("organization-1", property, expect.objectContaining({ rentInvoiceQuery: expect.objectContaining({ propertyId: property }) }));
    expect(screen.queryByTestId("finance-operations")).toBeNull();
  });

  it("does not convert operational read failures into empty financial results", async () => {
    mocks.financeData.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(RentIncomePage({})).rejects.toThrow("database unavailable");
  });

  it("bounds a long URL search before loading authoritative totals", async () => {
    await RentIncomePage({ searchParams: Promise.resolve({ q: "a".repeat(501) }) });
    expect(mocks.financeData).toHaveBeenCalledWith("organization-1", undefined, expect.objectContaining({ rentInvoiceQuery: expect.objectContaining({ query: "a".repeat(500) }) }));
  });

  it("passes the exact billing repair lease from the setup link", async () => {
    render(
      await RentIncomePage({
        searchParams: Promise.resolve({
          action: "billing",
          leaseId: "lease-1",
        }),
      }),
    );

    expect(
      screen
        .getByTestId("finance-operations")
        .getAttribute("data-initial-billing-lease-id"),
    ).toBe("lease-1");
    expect(
      screen
        .getByTestId("finance-operations")
        .getAttribute("data-can-view-leases"),
    ).toBe("true");
  });

  it("does not open billing for unrelated query actions", async () => {
    render(
      await RentIncomePage({
        searchParams: Promise.resolve({
          action: "payment",
          leaseId: "lease-1",
        }),
      }),
    );

    expect(
      screen
        .getByTestId("finance-operations")
        .getAttribute("data-initial-billing-lease-id"),
    ).toBe("");
  });

  it("focuses the exact lease from the rent-ready handoff without opening billing", async () => {
    render(
      await RentIncomePage({
        searchParams: Promise.resolve({ leaseId: "lease-1" }),
      }),
    );

    const screen = document.querySelector('[data-testid="finance-operations"]');
    expect(screen?.getAttribute("data-initial-rent-lease-id")).toBe("lease-1");
    expect(screen?.getAttribute("data-initial-billing-lease-id")).toBe("");
    expect(mocks.financeData).toHaveBeenCalledWith("organization-1", undefined, expect.objectContaining({ rentInvoiceQuery: expect.objectContaining({ leaseId: "lease-1" }) }));
  });

  it("passes property, paging and search to the bounded server query", async () => {
    const propertyId = "00000000-0000-4000-8000-000000000030";
    await RentIncomePage({ searchParams: Promise.resolve({ property: propertyId, page: "8", status: "paid", q: "Morgan 7FD2", sort: "due_asc" }) });
    expect(mocks.financeData).toHaveBeenCalledWith("organization-1", propertyId, expect.objectContaining({
      includeExpenses: false,
      rentInvoiceQuery: expect.objectContaining({ propertyId, page: 8, status: "paid", query: "Morgan 7FD2", sort: "due_asc" }),
    }));
  });
});
