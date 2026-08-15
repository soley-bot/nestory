import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { detailSpy, getLeasesScreenData, requireFinanceContext } = vi.hoisted(() => ({
    detailSpy: vi.fn(),
    getLeasesScreenData: vi.fn(),
    requireFinanceContext: vi.fn(),
  }));

vi.mock("@/lib/auth/context", () => ({ requireFinanceContext }));
vi.mock("@/features/leases/data/leases", () => ({ getLeasesScreenData }));
vi.mock("@/features/leases/components/lease-detail-screen", () => ({
  LeaseDetailScreen: (props: Record<string, unknown>) => {
    detailSpy(props);
    return <div>Lease detail route</div>;
  },
}));

import LeaseDetailPage from "@/app/(dashboard)/leases/[leaseId]/page";

describe("lease detail route", () => {
  const leaseId = "00000000-0000-4000-8000-000000000006";

  beforeEach(() => {
    detailSpy.mockReset();
    getLeasesScreenData.mockReset();
    requireFinanceContext.mockReset();
    requireFinanceContext.mockResolvedValue({
      capabilities: { canConfigureLeases: true },
      organizationId: "organization-1",
    });
    getLeasesScreenData.mockResolvedValue({
      leases: [{ id: leaseId }],
      propertyOptions: [{ id: "property-1" }],
      tenantOptions: [{ id: "tenant-1" }],
      unitOptions: [{ id: "unit-1" }],
    });
  });

  it("loads one lease and preserves the selected operating-record section", async () => {
    const html = renderToStaticMarkup(
      await LeaseDetailPage({
        params: Promise.resolve({ leaseId }),
        searchParams: Promise.resolve({ section: "files" }),
      }),
    );

    expect(html).toContain("Lease detail route");
    expect(getLeasesScreenData).toHaveBeenCalledWith(
      "organization-1",
      expect.objectContaining({
        archiveState: "all",
        leaseId,
      }),
    );
    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canConfigure: true,
        activeSection: "files",
        lease: { id: leaseId },
        propertyOptions: [{ id: "property-1" }],
        tenantOptions: [{ id: "tenant-1" }],
        unitOptions: [{ id: "unit-1" }],
      }),
    );
  });

  it("returns not found when the lease is unavailable", async () => {
    getLeasesScreenData.mockResolvedValue({ leases: [] });

    const html = renderToStaticMarkup(
      await LeaseDetailPage({
        params: Promise.resolve({ leaseId }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Lease not found");
    expect(html).toContain("Back to leases");
  });
});
