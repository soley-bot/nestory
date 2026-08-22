import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLeasesScreenData, requirePermission, screenSpy } = vi.hoisted(
  () => ({
    getLeasesScreenData: vi.fn(),
    requirePermission: vi.fn(),
    screenSpy: vi.fn(),
  }),
);

vi.mock("@/lib/auth/context", () => ({ requirePermission }));
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
    requirePermission.mockReset();
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
    ["lease preparer", true],
    ["lease reader", false],
  ] as const)("gives %s exact lease access", async (_role, canPrepare) => {
    requirePermission.mockResolvedValue({
      organizationId: "organization-1",
      permissionKeys: new Set(canPrepare ? ["leases.view", "leases.prepare"] : ["leases.view"]),
    });

    const html = renderToStaticMarkup(
      await LeasesPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Lease route");
    expect(requirePermission).toHaveBeenCalledWith("leases.view");
    expect(getLeasesScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.any(Object),
    );
    expect(screenSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canPrepare,
      }),
    );
  });
});
