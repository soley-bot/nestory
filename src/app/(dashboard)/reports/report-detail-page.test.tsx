import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTrustedReport: vi.fn(),
  requireFinanceReportContext: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({
  requireFinanceReportContext: mocks.requireFinanceReportContext,
}));
vi.mock("@/features/reports/data/trusted-report", () => ({
  getTrustedReport: mocks.getTrustedReport,
}));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/finance-operations/data/scoped-finance-context", () => ({
  loadScopedFinanceContext: async () => ({ properties: [], units: [] }),
}));
vi.mock("@/lib/finance/financial-write-context.server", () => ({
  withFinancialReadContext: async (_org: string, read: (context: { generation: number }) => Promise<unknown>) =>
    read({ generation: 1 }),
}));
vi.mock("@/features/reports/components/reports-screen", () => ({
  ReportBuilderScreen: () => <div>Operational report detail</div>,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import ReportBuilderPage from "@/app/(dashboard)/reports/[reportKind]/page";

describe("ReportBuilderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceReportContext.mockResolvedValue({
      isSuperAdmin: false,
      organizationId: "organization-1",
      organizationName: "IPS",
      permissionKeys: new Set(["finance.view", "finance.publish"]),
      role: "custom",
    });
  });

  it("loads an existing operational report with Finance report authority", async () => {
    const page = await ReportBuilderPage({
      params: Promise.resolve({ reportKind: "unit-profit-loss" }),
      searchParams: Promise.resolve({ month: "2026-08" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Operational report detail");
    expect(mocks.requireFinanceReportContext).toHaveBeenCalledOnce();
    expect(page.props.viewQuery).toMatchObject({ report: "unit-profit-loss", month: "2026-08" });
    expect(page.props.trustedReport.kind).toBe("unit-profit-loss");
  });

  it.each([false, true])("preserves the full Owner activity count and role-specific links (super admin: %s)", async (isSuperAdmin) => {
    mocks.requireFinanceReportContext.mockResolvedValue({
      isSuperAdmin, organizationId: "organization-1", operationalTimezone: "UTC",
    });
    const href = "/people/owner-1";
    const rows = Array.from({ length: 76 }, (_, index) => ({
      id: String(index), href, sourceLinks: [{ href }],
    }));
    mocks.getTrustedReport.mockResolvedValue({ kind: "monthly-owner-activity", rows });

    const page = await ReportBuilderPage({
      params: Promise.resolve({ reportKind: "monthly-owner-activity" }),
      searchParams: Promise.resolve({ month: "2026-08" }),
    });

    const preview = page.props.trustedReport;
    expect(mocks.getTrustedReport).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-1",
      viewQuery: expect.objectContaining({ report: "monthly-owner-activity", month: "2026-08" }),
    }));
    expect(preview.rows).toHaveLength(75);
    expect(preview.totalRowCount).toBe(76);
    expect(preview.rows[0].href).toBe(isSuperAdmin ? href : undefined);
    expect(preview.rows[0].sourceLinks[0].href).toBe(isSuperAdmin ? href : undefined);
  });
});
