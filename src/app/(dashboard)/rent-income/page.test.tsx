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
    await RentIncomePage({ searchParams: Promise.resolve({ property: "property-1", page: "8", status: "paid", q: "Morgan 7FD2", sort: "due_asc" }) });
    expect(mocks.financeData).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({
      includeExpenses: false,
      rentInvoiceQuery: expect.objectContaining({ propertyId: "property-1", page: 8, status: "paid", query: "Morgan 7FD2", sort: "due_asc" }),
    }));
  });
});
