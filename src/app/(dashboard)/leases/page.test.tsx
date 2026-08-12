import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLeasesScreenData, requireFinanceContext, screenSpy } = vi.hoisted(
  () => ({
    getLeasesScreenData: vi.fn(),
    requireFinanceContext: vi.fn(),
    screenSpy: vi.fn(),
  }),
);

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/leases/data/leases", () => ({ getLeasesScreenData }));
vi.mock("@/features/leases/components/lease-screen", () => ({
  LeaseScreen: (props: Record<string, unknown>) => {
    screenSpy(props);
    return <div>Lease route</div>;
  },
}));

import LeasesPage from "@/app/(dashboard)/leases/page";

describe("leases route", () => {
  beforeEach(() => {
    getLeasesScreenData.mockReset();
    requireFinanceContext.mockReset();
    screenSpy.mockReset();
    getLeasesScreenData.mockResolvedValue({
      leases: [],
      pagination: { from: 0, page: 1, pageSize: 50, to: 0, total: 0 },
      propertyOptions: [],
      tenantOptions: [],
      unitOptions: [],
    });
  });

  it.each([
    ["finance_manager", false],
    ["finance_member", false],
    ["super_admin", true],
  ] as const)("gives %s capability-correct lease access", async (role, canConfigure) => {
    requireFinanceContext.mockResolvedValue({
      capabilities: {
        canConfigureLeases: canConfigure,
        canReadFinanceReports: role !== "finance_member",
      },
      organizationId: "organization-1",
      role,
    });

    const html = renderToStaticMarkup(
      await LeasesPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Lease route");
    expect(requireFinanceContext).toHaveBeenCalledOnce();
    expect(getLeasesScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.any(Object),
    );
    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canConfigure,
        canReadFinanceReports: role !== "finance_member",
      }),
    );
  });
});
