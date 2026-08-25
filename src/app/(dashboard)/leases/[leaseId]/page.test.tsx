import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  detailSpy,
  getLeasePaymentResolutionData,
  getLeasesScreenData,
  requirePermission,
} = vi.hoisted(() => ({
    detailSpy: vi.fn(),
    getLeasePaymentResolutionData: vi.fn(),
    getLeasesScreenData: vi.fn(),
    requirePermission: vi.fn(),
  }));

vi.mock("@/lib/auth/context", () => ({ requirePermission }));
vi.mock("@/features/finance-operations/data/finance-operations", () => ({
  getLeasePaymentResolutionData,
}));
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
  const invoiceId = "00000000-0000-4000-8000-000000000007";

  beforeEach(() => {
    detailSpy.mockReset();
    getLeasePaymentResolutionData.mockReset();
    getLeasesScreenData.mockReset();
    requirePermission.mockReset();
    requirePermission.mockResolvedValue({
      organizationId: "organization-1",
      permissionKeys: new Set([
        "leases.view",
        "leases.activate",
        "leases.archive",
        "leases.change_terms",
        "leases.close",
        "leases.prepare",
        "finance.record_payments",
        "finance.view",
      ]),
    });
    getLeasePaymentResolutionData.mockResolvedValue(paymentResolution());
    getLeasesScreenData.mockResolvedValue({
      leases: [{ id: leaseId, isArchived: false }],
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
        activeSection: "files",
        lease: { id: leaseId, isArchived: false },
        propertyOptions: [{ id: "property-1" }],
        tenantOptions: [{ id: "tenant-1" }],
        unitOptions: [{ id: "unit-1" }],
        permissions: {
          canActivate: true,
          canArchive: true,
          canChangeTerms: true,
          canClose: true,
          canPrepare: true,
        },
      }),
    );
  });

  it("loads one focused invoice only for the exact payment action", async () => {
    await renderPage({ action: "record-payment", invoiceId });

    expect(getLeasePaymentResolutionData).toHaveBeenCalledWith({
      invoiceId,
      leaseId,
      organizationId: "organization-1",
    });
    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canRecordPayments: true,
        canViewFinance: true,
        paymentResolution: expect.objectContaining({
          invoice: expect.objectContaining({ id: invoiceId, leaseId }),
        }),
        routeNotice: undefined,
      }),
    );
  });

  it.each([
    ["missing", null],
    [
      "cross-Lease",
      paymentResolution({
        invoice: invoice({ leaseId: "00000000-0000-4000-8000-000000000099" }),
      }),
    ],
  ])("keeps the normal record when the focused invoice is %s", async (_, result) => {
    getLeasePaymentResolutionData.mockResolvedValue(result);

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentResolution: undefined,
        routeNotice: {
          message: "That invoice is no longer available for this Lease.",
        },
      }),
    );
  });

  it.each([
    ["paid", { paymentStatus: "paid" as const }],
    ["zero-balance", { balanceDue: 0 }],
  ])("keeps the normal record when the focused invoice is %s", async (_, overrides) => {
    getLeasePaymentResolutionData.mockResolvedValue(
      paymentResolution({
        invoice: invoice({
          ...overrides,
          settlements: [
            {
              amount: 258,
              date: "2026-08-25",
              id: "payment-1",
              isReversed: false,
              receipt: {
                artifactId: "receipt-1",
                href: "/api/finance/documents/receipt-1",
                publicationStatus: "published",
                publishedAt: "2026-08-25T08:00:00.000Z",
              },
              receiptNumber: "RCT-1",
              reference: null,
              reversalReason: null,
              route: "through_ips",
            },
          ],
        }),
      }),
    );

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentResolution: undefined,
        routeNotice: {
          href: "/api/finance/documents/receipt-1",
          linkLabel: "Download receipt",
          message: "This invoice is already paid.",
        },
      }),
    );
  });

  it("keeps the normal record when the focused invoice is voided", async () => {
    getLeasePaymentResolutionData.mockResolvedValue(
      paymentResolution({ invoice: invoice({ paymentStatus: "voided" }) }),
    );

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentResolution: undefined,
        routeNotice: {
          message: "This invoice is voided and cannot receive a payment.",
        },
      }),
    );
  });

  it("returns direct owner collection to Finance with Lease context", async () => {
    getLeasePaymentResolutionData.mockResolvedValue(
      paymentResolution({
        invoice: invoice({ collectionRoute: "direct_to_owner" }),
      }),
    );

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentResolution: undefined,
        routeNotice: {
          href: `/rent-income?leaseId=${leaseId}`,
          linkLabel: "Open Finance",
          message: "Confirm owner collection in Finance.",
        },
      }),
    );
  });

  it("does not expose the Finance destination without finance.view", async () => {
    allowPermissions(["leases.view", "finance.record_payments"]);
    getLeasePaymentResolutionData.mockResolvedValue(
      paymentResolution({
        invoice: invoice({ collectionRoute: "direct_to_owner" }),
      }),
    );

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canViewFinance: false,
        routeNotice: {
          message: "Confirm owner collection in Finance.",
        },
      }),
    );
  });

  it("keeps the normal record when the Lease is archived", async () => {
    getLeasesScreenData.mockResolvedValue({
      leases: [{ id: leaseId, isArchived: true }],
      propertyOptions: [],
      tenantOptions: [],
      unitOptions: [],
    });

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentResolution: undefined,
        routeNotice: {
          message: "Archived Leases cannot receive a new payment.",
        },
      }),
    );
  });

  it("shows eligible payment context read-only without payment authority", async () => {
    allowPermissions(["leases.view", "finance.view"]);

    await renderPage({ action: "record-payment", invoiceId });

    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canRecordPayments: false,
        canViewFinance: true,
        paymentResolution: expect.objectContaining({
          invoice: expect.objectContaining({ id: invoiceId }),
        }),
      }),
    );
  });

  it("does not load focused data without the exact action query", async () => {
    await renderPage({ action: "view", invoiceId, section: "rent" });

    expect(getLeasePaymentResolutionData).not.toHaveBeenCalled();
    expect(detailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        activeSection: "rent",
        paymentResolution: undefined,
        routeNotice: undefined,
      }),
    );
  });

  it.each([
    ["missing", { action: "record-payment" }],
    [
      "malformed",
      { action: "record-payment", invoiceId: "not-a-database-id" },
    ],
    [
      "array-valued malformed first ID",
      {
        action: ["record-payment", "owner-payment"],
        invoiceId: ["not-a-database-id", invoiceId],
      },
    ],
  ])(
    "returns the normal Lease with an unavailable notice for an exact payment action with a %s invoice ID",
    async (_, searchParams) => {
      await renderPage(searchParams);

      expect(getLeasePaymentResolutionData).not.toHaveBeenCalled();
      expect(detailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentResolution: undefined,
          routeNotice: {
            message: "That invoice is no longer available for this Lease.",
          },
        }),
      );
    },
  );

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

async function renderPage(
  searchParams: Record<string, string | string[] | undefined>,
) {
  return renderToStaticMarkup(
    await LeaseDetailPage({
      params: Promise.resolve({
        leaseId: "00000000-0000-4000-8000-000000000006",
      }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function allowPermissions(permissionKeys: string[]) {
  requirePermission.mockResolvedValue({
    organizationId: "organization-1",
    permissionKeys: new Set(permissionKeys),
  });
}

function paymentResolution(
  overrides: Record<string, unknown> = {},
) {
  return {
    invoice: invoice(),
    nextInvoiceDueDate: "2026-09-05",
    ownerLabel: "Sokha Vannak",
    reconciliationSources: [
      { id: "source-1", label: "BANK - Operating", propertyId: null },
    ],
    ...overrides,
  };
}

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    balanceDue: 258,
    billingPeriodStart: "2026-08-01",
    collectedByOwner: 0,
    collectionRoute: "through_ips",
    dueDate: "2026-08-05",
    generationSource: "scheduled",
    id: "00000000-0000-4000-8000-000000000007",
    invoiceNumber: "INV-202608-001",
    isProrated: false,
    issueDate: "2026-08-01",
    leaseId: "00000000-0000-4000-8000-000000000006",
    lines: [],
    occupantLabels: ["Alice Tenant"],
    paidThroughIps: 0,
    paymentStatus: "unpaid",
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    publicationSnapshot: null,
    propertyId: "property-1",
    propertyLabel: "RIVER - Riverside House",
    recipientLabel: "Alice Tenant",
    settlements: [],
    totalAmount: 258,
    unitId: "unit-1",
    unitLabel: "Unit 2A",
    ...overrides,
  };
}
