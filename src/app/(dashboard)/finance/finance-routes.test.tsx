import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getFinanceOperationsData,
  requireFinanceContext,
  screenSpy,
  scopeFinanceOperationsData,
  getUnitDetail,
  createSupabaseServerClient,
} = vi.hoisted(() => ({
    getFinanceOperationsData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
    scopeFinanceOperationsData: vi.fn((data) => data),
    getUnitDetail: vi.fn(),
    createSupabaseServerClient: vi.fn(),
  }));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
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
  it("opens a report invoice without treating it as a first-rent workflow", async () => {
    const invoiceId = "924aa793-d037-40da-921d-eef45dcf1760";
    const lookup = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    lookup.select.mockReturnValue(lookup);
    lookup.eq.mockReturnValue(lookup);
    lookup.maybeSingle.mockResolvedValue({ data: { id: invoiceId, property_id: "property-1" }, error: null });
    createSupabaseServerClient.mockResolvedValue({ from: vi.fn().mockReturnValue(lookup) });
    requireFinanceContext.mockResolvedValue({ capabilities: {}, organizationId: "organization-1", organizationName: "Nestory", permissionKeys: new Set(["finance.view"]) });
    renderToStaticMarkup(await RentIncomePage({ searchParams: Promise.resolve({ invoiceId, leaseId: "lease-1" }) }));
    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({ initialInvoiceId: invoiceId, initialRentLeaseId: undefined }));
    expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", "property-1", { includeExpenses: false, completeTransactionHistory: true });
    expect(lookup.eq).toHaveBeenCalledWith("organization_id", "organization-1");
  });

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
    renderToStaticMarkup(await BillsExpensesPage({}));
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

  it.each(["expenses", "rent", "account", "transactions"])(
    "keeps portfolio review scoped to authenticated finance context despite a %s query",
    async view => {
      requireFinanceContext.mockResolvedValue({
        capabilities: {
          canCorrectFinance: false,
          canOperateFinance: true,
          canReadFinanceReports: true,
          canRecoverHistoricalRent: false,
          canReviewExpense: true,
          canReverseExpense: false,
          canRetryCurrentRent: true,
          canSubmitExpense: true,
        },
        isSuperAdmin: false,
        organizationId: "assigned-organization",
        organizationName: "Assigned workspace",
        permissionKeys: new Set(["finance.view", "leases.view"]),
        role: "finance_manager",
        userId: "finance-manager-1",
      });
      const positions = [{ propertyId: "assigned-property", rentIncome: 1980, ownerExpense: 500, availableWithdrawal: 1040 }];
      getFinanceOperationsData.mockResolvedValue({
        expenseSubmissions: [], positions, rentGenerationExceptions: [], tenantInvoices: [],
      });

      renderToStaticMarkup(await FinancePage({ searchParams: Promise.resolve({
        view, organizationId: "other-organization", propertyId: "other-property", action: "create",
      }) }));

      expect(requireFinanceContext).toHaveBeenCalledOnce();
      expect(getFinanceOperationsData).toHaveBeenCalledExactlyOnceWith("assigned-organization", undefined, { includeExpenses: false });
      expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({
        canApproveOwnExpense: false,
        canConfigureRent: false,
        canCorrectFinance: false,
        canManageFinanceCategories: false,
        canRecordOwnerCash: true,
        canRecordPayments: true,
        canReadFinanceReports: true,
        canRecoverRent: false,
        canReviewExpense: true,
        canReverseExpense: false,
        canRetryCurrentRent: true,
        canSubmitExpense: true,
        canViewLeases: true,
        canViewPropertyRecords: false,
        currentUserId: "finance-manager-1",
        isSuperAdmin: false,
        organizationName: "Assigned workspace",
        expenseSubmissions: [],
        positions,
        view: "work",
      }));
      expect(screenSpy.mock.calls[0][0]).not.toHaveProperty("initialExpenseIntent");
      expect(screenSpy.mock.calls[0][0]).not.toHaveProperty("scope");
    },
  );

  it.each(["Sign in required", "Finance access denied"])(
    "does not read portfolio data when the finance guard rejects: %s",
    async message => {
      requireFinanceContext.mockRejectedValue(new Error(message));

      await expect(FinancePage({ searchParams: Promise.resolve({ view: "expenses" }) })).rejects.toThrow(message);

      expect(getFinanceOperationsData).not.toHaveBeenCalled();
      expect(screenSpy).not.toHaveBeenCalled();
    },
  );

  it("uses bounded referenced activity on the owner account route", async () => {
    requireFinanceContext.mockResolvedValue({ capabilities: {}, organizationId: "organization-1", organizationName: "IPS", permissionKeys: new Set(["finance.view"]) });
    getFinanceOperationsData.mockResolvedValue({ propertyOptions: [{ id: "property-1", label: "Riverside" }] });
    renderToStaticMarkup(await PropertyFinancePage({ params: Promise.resolve({ propertyId: "property-1" }), searchParams: Promise.resolve({ view: "owner" }) }));
    expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({ accountActivityOnly: true, completeTransactionHistory: false, includeAccountSources: true }));
  });

  it.each([false, true])("uses operator cash capability on unit finance and skips expense reads for rent (%s)", async canOperateFinance => {
    requireFinanceContext.mockResolvedValue({ capabilities: { canOperateFinance }, organizationId: "organization-1", organizationName: "IPS", permissionKeys: new Set(["finance.view"]) });
    getFinanceOperationsData.mockResolvedValue({ propertyOptions: [{ id: "property-1", label: "Riverside" }] });
    getUnitDetail.mockResolvedValue({ propertyId: "property-1", propertyName: "Riverside", unitNumber: "2A" });
    renderToStaticMarkup(await UnitFinancePage({ params: Promise.resolve({ unitId: "unit-1" }), searchParams: Promise.resolve({ view: "rent" }) }));
    expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({ canRecordOwnerCash: canOperateFinance }));
    expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({ includeExpenses: false }));
    getFinanceOperationsData.mockClear();
    renderToStaticMarkup(await PropertyFinancePage({ params: Promise.resolve({ propertyId: "property-1" }), searchParams: Promise.resolve({ view: "rent" }) }));
    expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", "property-1", expect.objectContaining({ includeExpenses: false }));
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

      const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ expenseMonth: "2026-08" }) }));

      expect(html).toContain("Finance route");
      expect(requireFinanceContext).toHaveBeenCalledOnce();
      if (view === "expenses") {
        expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", undefined, { expenseMonth: "2026-08" });
        expect(screenSpy).toHaveBeenCalledWith(expect.objectContaining({ expenseMonth: "2026-08" }));
      } else if (view === "rent") {
        expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1", undefined, { includeExpenses: false });
      } else {
        expect(getFinanceOperationsData).toHaveBeenCalledWith("organization-1");
      }
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
