import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getFinanceOperationsData, requireFinanceContext, screenSpy } = vi.hoisted(
  () => ({
    getFinanceOperationsData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
  }),
);

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData,
}));
vi.mock(
  "@/features/finance-operations/components/finance-operations-screen",
  () => ({
    FinanceOperationsScreen: (props: Record<string, unknown>) => {
      screenSpy(props);
      return <div>Finance route</div>;
    },
  }),
);

import FinancePage from "@/app/(dashboard)/finance/page";
import BillsExpensesPage from "@/app/(dashboard)/bills-expenses/page";
import RentIncomePage from "@/app/(dashboard)/rent-income/page";

describe("finance routes", () => {
  beforeEach(() => {
    getFinanceOperationsData.mockReset();
    requireFinanceContext.mockReset();
    screenSpy.mockReset();
    getFinanceOperationsData.mockResolvedValue({
      rentGenerationExceptions: [],
      tenantInvoices: [],
    });
  });

  it.each([
    ["finance_manager", FinancePage, "work", true, false, true, true],
    ["finance_member", RentIncomePage, "rent", false, true, false, false],
    ["finance_member", BillsExpensesPage, "expenses", false, true, false, false],
  ] as const)(
    "admits %s through Finance context with explicit capabilities",
    async (
      role,
      page,
      view,
      canReviewExpense,
      canSubmitExpense,
      canOperateFinance,
      canRetryCurrentRent,
    ) => {
      requireFinanceContext.mockResolvedValue({
        capabilities: {
          canConfigureLeases: false,
          canCorrectFinance: false,
          canManageFinanceOperations: false,
          canOperateFinance,
          canReadFinanceReports: role === "finance_manager",
          canReviewExpense,
          canReverseExpense: false,
          canRetryCurrentRent,
          canSubmitExpense,
        },
        organizationId: "organization-1",
        organizationName: "Nestory Test",
        role,
      });

      const html = renderToStaticMarkup(await page());

      expect(html).toContain("Finance route");
      expect(requireFinanceContext).toHaveBeenCalledOnce();
      expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1");
      expect(screenSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          canConfigureRent: false,
          canCorrectFinance: false,
          canRecordOwnerCash: canOperateFinance,
          canRecordPayments: canOperateFinance,
          canReadFinanceReports: role === "finance_manager",
          canRecoverRent: false,
          canReviewExpense,
          canReverseExpense: false,
          canRetryCurrentRent,
          canSubmitExpense,
          view,
        }),
      );
    },
  );

  it("passes Super Admin rent recovery authority explicitly", async () => {
    requireFinanceContext.mockResolvedValue({
      capabilities: {
        canConfigureLeases: true,
        canCorrectFinance: true,
        canManageFinanceOperations: true,
        canOperateFinance: true,
        canReadFinanceReports: true,
        canReviewExpense: true,
        canReverseExpense: true,
        canRetryCurrentRent: true,
        canSubmitExpense: true,
      },
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "super_admin",
    });

    renderToStaticMarkup(await FinancePage());

    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canConfigureRent: true,
        canCorrectFinance: true,
        canRecordOwnerCash: true,
        canRecordPayments: true,
        canReadFinanceReports: true,
        canRecoverRent: true,
        canReviewExpense: true,
        canReverseExpense: true,
        canRetryCurrentRent: true,
        canSubmitExpense: true,
      }),
    );
  });
});
