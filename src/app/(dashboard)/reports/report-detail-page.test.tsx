import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReportsScreenData: vi.fn(),
  reportScreen: vi.fn(),
  requireFinanceReportContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceReportContext: mocks.requireFinanceReportContext,
}));
vi.mock("@/features/reports/data/reports", () => ({
  getReportsScreenData: mocks.getReportsScreenData,
}));
vi.mock("@/features/reports/components/reports-screen", () => ({
  ReportBuilderScreen: (props: Record<string, unknown>) => {
    mocks.reportScreen(props);
    return <div>Operational report detail</div>;
  },
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import ReportBuilderPage from "@/app/(dashboard)/reports/[reportKind]/page";

describe("ReportBuilderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceReportContext.mockResolvedValue({
      organizationId: "organization-1",
      organizationName: "IPS",
      role: "finance_manager",
    });
    mocks.getReportsScreenData.mockResolvedValue({ rows: [] });
  });

  it("loads an existing operational report with Finance report authority", async () => {
    const html = renderToStaticMarkup(await ReportBuilderPage({
      params: Promise.resolve({ reportKind: "unit-profit-loss" }),
      searchParams: Promise.resolve({ month: "2026-08" }),
    }));

    expect(html).toContain("Operational report detail");
    expect(mocks.requireFinanceReportContext).toHaveBeenCalledOnce();
    expect(mocks.getReportsScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.objectContaining({ report: "unit-profit-loss" }),
    );
  });
});
