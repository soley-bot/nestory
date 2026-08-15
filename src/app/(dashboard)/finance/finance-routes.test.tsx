import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildFinanceWorkspaceData,
  financeManagerWorkspaceSpy,
  financeMemberWorkspaceSpy,
  getFinanceOperationsData,
  requireFinanceContext,
  screenSpy,
} = vi.hoisted(() => ({
    buildFinanceWorkspaceData: vi.fn(),
    financeManagerWorkspaceSpy: vi.fn(),
    financeMemberWorkspaceSpy: vi.fn(),
    getFinanceOperationsData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
  }));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getFinanceOperationsData,
}));
vi.mock("@/features/workspace-operations/finance-workspace", () => ({
  buildFinanceWorkspaceData,
}));
vi.mock(
  "@/features/workspace-operations/components/finance-workspace-screen",
  () => ({
    FinanceManagerWorkspace: (props: Record<string, unknown>) => {
      financeManagerWorkspaceSpy(props);
      return <div>Finance manager workspace</div>;
    },
    FinanceMemberWorkspace: (props: Record<string, unknown>) => {
      financeMemberWorkspaceSpy(props);
      return <div>Finance member workspace</div>;
    },
  }),
);
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
    buildFinanceWorkspaceData.mockReset();
    financeManagerWorkspaceSpy.mockReset();
    financeMemberWorkspaceSpy.mockReset();
    getFinanceOperationsData.mockResolvedValue({
      rentGenerationExceptions: [],
      tenantInvoices: [],
    });
  });

  it.each([
    ["finance_manager", "Finance manager workspace", financeManagerWorkspaceSpy],
    ["finance_member", "Finance member workspace", financeMemberWorkspaceSpy],
  ] as const)(
    "uses the %s projection as the /finance operating surface",
    async (role, expectedText, workspaceSpy) => {
      const financeData = {
        expenseSubmissions: [],
        ownerInvoices: [],
        rentGenerationExceptions: [],
        tenantInvoices: [],
      };
      const workspaceData =
        role === "finance_manager"
          ? {
              queue: [],
              role,
              totals: {
                awaitingReview: 0,
                maintenanceHandoffs: 0,
                missingEvidence: 0,
                rentExceptions: 0,
              },
            }
          : {
              primaryAction: {
                href: "/bills-expenses?action=create",
                intent: "record-paid-cost",
                label: "Record paid cost",
              },
              queue: [],
              role,
              totals: {
                approvedRecently: 0,
                awaitingReview: 0,
                rejected: 0,
              },
            };
      getFinanceOperationsData.mockResolvedValue(financeData);
      requireFinanceContext.mockResolvedValue({
        capabilities: {},
        organizationId: "organization-1",
        organizationName: "Nestory Test",
        role,
        userId: "user-1",
      });
      buildFinanceWorkspaceData.mockReturnValue(workspaceData);

      const html = renderToStaticMarkup(await FinancePage());

      expect(html).toContain(expectedText);
      expect(html).toContain(
        role === "finance_manager" ? "Review queue" : "My submissions",
      );
      expect(buildFinanceWorkspaceData).toHaveBeenCalledWith({
        data: financeData,
        role,
        userId: "user-1",
      });
      expect(workspaceSpy).toHaveBeenCalledWith({ data: workspaceData });
      expect(screenSpy).not.toHaveBeenCalled();
    },
  );

  it("keeps Finance Manager transaction work reachable from the review queue", async () => {
    const financeData = {
      expenseSubmissions: [],
      ownerInvoices: [],
      rentGenerationExceptions: [],
      tenantInvoices: [],
    };
    const capabilities = {
      canConfigureLeases: true,
      canCorrectFinance: true,
      canOperateFinance: true,
      canReadFinanceReports: true,
      canReviewExpense: true,
      canReverseExpense: false,
      canRetryCurrentRent: true,
      canSubmitExpense: false,
    };
    getFinanceOperationsData.mockResolvedValue(financeData);
    requireFinanceContext.mockResolvedValue({
      capabilities,
      organizationId: "organization-1",
      organizationName: "Nestory Test",
      role: "finance_manager",
      userId: "user-1",
    });
    buildFinanceWorkspaceData.mockReturnValue({
      queue: [],
      role: "finance_manager",
      totals: {
        awaitingReview: 0,
        maintenanceHandoffs: 0,
        missingEvidence: 0,
        rentExceptions: 0,
      },
    });

    const queueHtml = renderToStaticMarkup(await FinancePage());
    expect(queueHtml).toContain("Transactions");
    expect(queueHtml).toContain("/finance?view=transactions");

    const workHtml = renderToStaticMarkup(
      await FinancePage({
        searchParams: Promise.resolve({ view: "transactions" }),
      }),
    );
    expect(workHtml).toContain("Finance route");
    expect(screenSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canConfigureRent: true,
        canCorrectFinance: true,
        canRecordOwnerCash: true,
        canRecordPayments: true,
        canRetryCurrentRent: true,
        view: "work",
      }),
    );
  });

  it.each([
    ["finance_member", RentIncomePage, "rent", false, true, false, false],
    ["finance_member", BillsExpensesPage, "expenses", false, true, false, false],
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
      role: "finance_member",
    });

    renderToStaticMarkup(
      await BillsExpensesPage({
        searchParams: Promise.resolve({ action: "create" }),
      }),
    );

    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialExpenseIntent: true }),
    );
  });
});
