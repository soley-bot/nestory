/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  balanceData: vi.fn(),
  closeData: vi.fn(),
  openingData: vi.fn(),
  requireFinanceContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/features/owner-balances/data/owner-balances", () => ({
  getOwnerBalanceData: mocks.balanceData,
}));
vi.mock("@/features/owner-balances/data/opening-balances", () => ({
  getOpeningBalanceAuthorityData: mocks.openingData,
}));
vi.mock("@/features/owner-close/data/owner-close", () => ({
  getOwnerCloseData: mocks.closeData,
}));
vi.mock("@/features/owner-close/components/owner-close-screen", () => ({
  OwnerCloseScreen: (props: Record<string, unknown>) => (
    <div
      data-can-close={String(props.canClose)}
      data-can-reopen={String(props.canReopen)}
      data-testid="owner-close-authority"
    >
      Owner close authority
    </div>
  ),
}));
vi.mock("@/features/owner-balances/components/opening-balance-screen", () => ({
  OpeningBalanceScreen: (props: Record<string, unknown>) => (
    <div data-can-review={String(props.canReview)} data-testid="opening-authority">
      Opening authority
    </div>
  ),
}));
vi.mock("@/features/owner-balances/components/owner-balance-ledger", () => ({
  OwnerBalanceLedger: (props: {
    canAllocate?: boolean;
    canCorrect?: boolean;
    canTransfer?: boolean;
    closingAuthority?: React.ReactNode;
    openingAuthority?: React.ReactNode;
  }) => (
    <main
      data-can-allocate={String(props.canAllocate)}
      data-can-correct={String(props.canCorrect)}
      data-can-transfer={String(props.canTransfer)}
      data-testid="authoritative-ledger"
    >
      <h1>Authoritative owner balance</h1>
      {props.openingAuthority}
      {props.closingAuthority}
    </main>
  ),
}));

import BalancesPage from "./page";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";

describe("BalancesPage opening authority integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({
      capabilities: {
        canCloseOwnerMonth: true,
        canConfigureLeases: true,
        canCorrectFinance: false,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canReopenOwnerMonth: true,
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
    mocks.balanceData.mockResolvedValue({
      ownerOptions: [{ id: ownerId, label: "Nora Owner" }],
      periods: [],
      propertyOptions: [{ id: propertyId, label: "Riverside / RS-01" }],
      queue: [],
    });
    mocks.openingData.mockResolvedValue({
      effectiveDate: "2026-08-01",
      groups: [],
      readiness: [],
    });
    mocks.closeData.mockResolvedValue({
      corrections: [],
      readiness: null,
      revisions: [],
      series: null,
    });
  });

  it("loads exact authoritative scope and retires the current-primary projection", async () => {
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
    expect(mocks.balanceData).toHaveBeenCalledWith({
      currency: "USD",
      ownerPersonId: ownerId,
      periodEnd: "2026-08-01",
      periodStart: "2026-08-01",
      propertyId,
    });
    expect(mocks.closeData).toHaveBeenCalledWith({
      currency: "USD",
      monthStart: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    });
    expect(screen.getByTestId("opening-authority").getAttribute("data-can-review"))
      .toBe("true");
    expect(screen.getByRole("heading", { name: "Authoritative owner balance" }))
      .toBeTruthy();
    expect(screen.queryByText(/current balance projection/i)).toBeNull();
    expect(screen.getByTestId("authoritative-ledger").getAttribute("data-can-allocate"))
      .toBe("true");
    expect(screen.getByTestId("authoritative-ledger").getAttribute("data-can-transfer"))
      .toBe("true");
    expect(screen.getByTestId("owner-close-authority").getAttribute("data-can-close"))
      .toBe("true");
    expect(screen.getByTestId("owner-close-authority").getAttribute("data-can-reopen"))
      .toBe("true");
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

    const scope = mocks.balanceData.mock.calls[0]?.[0];
    expect(scope.propertyId).toBeUndefined();
    expect(scope.ownerPersonId).toBeUndefined();
    expect(scope.periodStart).toMatch(/^\d{4}-\d{2}-01$/);
    expect(scope.periodEnd).toBe(scope.periodStart);
  });
});
