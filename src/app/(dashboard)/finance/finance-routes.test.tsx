import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFinanceOperationsData,
  requireFinanceContext,
  screenSpy,
  scopeFinanceOperationsData,
  getUnitDetail,
} = vi.hoisted(() => ({
    getFinanceOperationsData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
    scopeFinanceOperationsData: vi.fn((data) => data),
    getUnitDetail: vi.fn(),
  }));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData,
  scopeFinanceOperationsData,
}));
vi.mock("@/features/units/data/units", () => ({ getUnitDetail }));
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
import PropertyFinancePage from "@/app/(dashboard)/properties/[propertyId]/finance/page";
import UnitFinancePage from "@/app/(dashboard)/units/[unitId]/finance/page";

describe("finance routes", () => {
  it.each([
    [[], false],
    [["people.view"], false],
    [["people.write"], false],
    [["people.view", "people.write"], true],
  ] as const)("gates the expense vendor-create link with People access (%j)", async (permissions, canCreateVendor) => {
    requireFinanceContext.mockResolvedValue({
      capabilities: {}, organizationId: "organization-1", organizationName: "IPS",
      permissionKeys: new Set(permissions),
    });
    renderToStaticMarkup(await BillsExpensesPage());
    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({ canCreateVendor }));
  });
  beforeEach(() => {
    getFinanceOperationsData.mockReset();
    requireFinanceContext.mockReset();
    screenSpy.mockReset();
    getFinanceOperationsData.mockResolvedValue({
      rentGenerationExceptions: [],
      tenantInvoices: [],
    });
  });

  it.each([false, true])("delegates property record navigation for scoped finance only when readable (%s)", async (canViewPropertyRecords) => {
    requireFinanceContext.mockResolvedValue({ capabilities: {}, organizationId: "organization-1", organizationName: "IPS",
      permissionKeys: new Set(["finance.view", "leases.view", ...(canViewPropertyRecords ? ["properties.view"] : [])]),
    });
    getFinanceOperationsData.mockResolvedValue({ propertyOptions: [{ id: "property-1", label: "Riverside" }], tenantInvoices: [], rentGenerationExceptions: [] });
    getUnitDetail.mockResolvedValue({ propertyId: "property-1", propertyName: "Riverside", unitNumber: "2A" });
    renderToStaticMarkup(await PropertyFinancePage({ params: Promise.resolve({ propertyId: "property-1" }) }));
    renderToStaticMarkup(await UnitFinancePage({ params: Promise.resolve({ unitId: "unit-1" }) }));
    expect(screenSpy).toHaveBeenCalledTimes(2);
    for (const [props] of screenSpy.mock.calls) expect(props).toMatchObject({ canViewPropertyRecords });
  });

  it.each([
    ["custom", RentIncomePage, "rent", false, true, false, false],
    ["custom", BillsExpensesPage, "expenses", false, true, false, false],
  ] as const)(
    "keeps %s domain routes behind explicit capabilities",
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
          canReadFinanceReports: false,
          canRecoverHistoricalRent: false,
          canReviewExpense,
          canReverseExpense: false,
          canRetryCurrentRent,
          canSubmitExpense,
        },
        organizationId: "organization-1",
        organizationName: "Nestory Test",
        permissionKeys: new Set(["finance.view", "finance.submit_expenses"]),
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
          canReadFinanceReports: false,
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
        canRecoverHistoricalRent: true,
        canReviewExpense: true,
        canReverseExpense: true,
        canRetryCurrentRent: true,
        canSubmitExpense: true,
      },
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      permissionKeys: new Set([
        "finance.view",
        "finance.record_payments",
        "leases.change_terms",
        "leases.view",
      ]),
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
        canViewLeases: true,
      }),
    );
  });

  it("opens the paid-cost entry drawer from the workspace create intent", async () => {
    requireFinanceContext.mockResolvedValue({
      capabilities: {
        canConfigureLeases: false,
        canCorrectFinance: false,
        canManageFinanceOperations: false,
        canOperateFinance: false,
        canReadFinanceReports: false,
        canReviewExpense: false,
        canReverseExpense: false,
        canRetryCurrentRent: false,
        canSubmitExpense: true,
      },
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      permissionKeys: new Set(["finance.view", "finance.submit_expenses"]),
      role: "custom",
    });

    renderToStaticMarkup(
      await BillsExpensesPage({
        searchParams: Promise.resolve({ action: "create" }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialExpenseIntent: "owner" }),
    );
  });

  it("opens the recoverable-cost drawer from an explicit route intent", async () => {
    requireFinanceContext.mockResolvedValue({
      capabilities: {
        canCorrectFinance: false,
        canOperateFinance: false,
        canReadFinanceReports: false,
        canRecoverHistoricalRent: false,
        canReviewExpense: false,
        canReverseExpense: false,
        canRetryCurrentRent: false,
        canSubmitExpense: true,
      },
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      permissionKeys: new Set(["finance.view", "finance.submit_expenses"]),
      role: "custom",
    });

    renderToStaticMarkup(
      await BillsExpensesPage({
        searchParams: Promise.resolve({ action: "record-recoverable-cost" }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialExpenseIntent: "tenant" }),
    );
  });
});
