/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  financeData: vi.fn(),
  openingData: vi.fn(),
  requireFinanceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData: mocks.financeData,
}));
vi.mock("@/features/owner-balances/data/opening-balances", () => ({
  getOpeningBalanceAuthorityData: mocks.openingData,
}));
vi.mock("@/features/owner-balances/components/opening-balance-screen", () => ({
  OpeningBalanceScreen: (props: Record<string, unknown>) => (
    <div data-can-review={String(props.canReview)} data-testid="opening-authority">
      Opening authority
    </div>
  ),
}));
vi.mock(
  "@/features/finance-operations/components/finance-operations-screen",
  () => ({
    FinanceOperationsScreen: (props: { openingAuthority?: React.ReactNode }) => (
      <main>
        {props.openingAuthority}
        <section>
          <h2>Current balance projection</h2>
          <p>Operational view only. This is not an official owner statement.</p>
        </section>
      </main>
    ),
  }),
);

import BalancesPage from "./page";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";

describe("BalancesPage opening authority integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({
      capabilities: {
        canConfigureLeases: true,
        canCorrectFinance: false,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canRequestOwnerOpeningBalanceCorrection: true,
        canReviewExpense: true,
        canReviewOwnerOpeningBalance: true,
        canReverseExpense: true,
        canRetryCurrentRent: true,
        canSubmitExpense: false,
        canSubmitOwnerOpeningBalance: true,
      },
      organizationId,
      organizationName: "IPS",
      role: "super_admin",
      userId: "00000000-0000-4000-8000-000000000004",
    });
    mocks.financeData.mockResolvedValue({
      peopleOptions: [{ id: ownerId, label: "Nora Owner" }],
      propertyOptions: [{ id: propertyId, label: "Riverside / RS-01" }],
    });
    mocks.openingData.mockResolvedValue({
      effectiveDate: "2026-08-01",
      groups: [],
      readiness: [],
    });
  });

  it("loads exact search scope and makes Opening authority directly visible", async () => {
    render(
      await BalancesPage({
        searchParams: Promise.resolve({
          month: "2026-08",
          ownerPersonId: ownerId,
          propertyId,
        }),
      }),
    );

    expect(mocks.openingData).toHaveBeenCalledWith({
      currency: "USD",
      effectiveDate: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    });
    expect(screen.getByTestId("opening-authority").getAttribute("data-can-review"))
      .toBe("true");
    expect(screen.getByRole("heading", { name: "Current balance projection" }))
      .toBeTruthy();
    expect(screen.getByText(/not an official owner statement/i)).toBeTruthy();
  });

  it("fails closed on invalid filters instead of passing guessed identifiers", async () => {
    render(
      await BalancesPage({
        searchParams: Promise.resolve({
          month: "2026-13",
          ownerPersonId: "guessed-owner",
          propertyId: "guessed-property",
        }),
      }),
    );

    const scope = mocks.openingData.mock.calls[0]?.[0];
    expect(scope.propertyId).toBeUndefined();
    expect(scope.ownerPersonId).toBeUndefined();
    expect(scope.effectiveDate).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
