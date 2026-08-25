// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  FinanceOption,
  LeasePaymentResolutionData,
  TenantInvoiceSummary,
} from "@/features/finance-operations/finance-operations.types";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";
import type { LeaseSummary } from "@/features/leases/lease.types";

const actionMocks = vi.hoisted(() => ({
  confirmOwnerCollectionAction: vi.fn(),
  recordTenantInvoicePaymentAction: vi.fn(),
}));

vi.mock("@/features/finance-operations/actions", () => actionMocks);
vi.mock("@/lib/dates/business-date", () => ({
  getBusinessDateValue: () => "2026-08-25",
}));

import { LeasePaymentResolutionView } from "./lease-payment-resolution-view";

afterEach(() => {
  cleanup();
  actionMocks.confirmOwnerCollectionAction.mockReset();
  actionMocks.recordTenantInvoicePaymentAction.mockReset();
});

describe("LeasePaymentResolutionView", () => {
  it("renders one guided IPS payment resolution", () => {
    const { container } = renderResolution();

    expect(
      screen.getByRole("heading", { name: "Resolve outstanding rent" }),
    ).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Payment resolution progress" }),
    ).toHaveTextContent(
      "Invoice reviewedCompleteRecord paymentCurrentReceipt createdNext",
    );
    expect(
      screen.getByRole("heading", { name: "Payment to record" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Lease context" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Recent activity" }),
    ).toBeVisible();
    expect(screen.queryByText("Recent evidence")).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Deposit to" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Record USD 258.00 payment" }),
    ).toBeVisible();
    expect(
      container.querySelectorAll(
        '[data-slot="button"][data-variant="default"]',
      ),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) =>
        heading.textContent,
      ),
    ).toEqual([
      "Resolve outstanding rent",
      "Payment to record",
      "Lease context",
      "Recent activity",
      "Upcoming",
    ]);
  });

  it.each([
    [258, 258, "USD 258.00", "Received"],
    [258, 100, "USD 258.00", "USD 100.00 received"],
    [258, 0, "USD 258.00", "Not received"],
  ])(
    "shows the deposit obligation and receipt state for %s due and %s received",
    (amount, receivedAmount, expectedAmount, expectedState) => {
      renderResolution({ lease: leaseWithDeposit(amount, receivedAmount) });

      const context = screen.getByRole("complementary", {
        name: "Lease context",
      });
      expect(within(context).getByText(expectedAmount)).toBeVisible();
      expect(within(context).getByText(expectedState)).toBeVisible();
    },
  );

  it("says No deposit required without a received badge", () => {
    const lease = leaseFixture({
      depositLabel: "No deposit required",
      deposits: [],
    });

    renderResolution({ lease });

    const context = screen.getByRole("complementary", {
      name: "Lease context",
    });
    expect(within(context).getByText("No deposit required")).toBeVisible();
    expect(within(context).queryByText("Received")).not.toBeInTheDocument();
  });

  it("prioritizes authoritative upcoming sources and shows at most three", () => {
    const lease = leaseFixture({
      activationSchedule: {
        activationDate: "2026-09-03",
        failureMessage: null,
        id: "activation-1",
        status: "pending",
      },
      formValues: {
        ...leaseFixture().formValues,
        leaseEndDate: "2027-06-30",
      },
      terms: [
        {
          datesLabel: "01 Oct 2026 - 30 Jun 2027",
          dueLabel: "Due monthly",
          endDate: "2027-06-30",
          id: "term-upcoming",
          paymentFrequency: "monthly",
          paymentFrequencyLabel: "Monthly",
          rentAmount: 900,
          rentCurrency: "USD",
          rentDisplay: { primary: "USD 900.00" },
          rentDueDay: 5,
          rentLabel: "USD 900.00",
          startDate: "2026-10-01",
          status: "upcoming",
          statusLabel: "Upcoming",
        },
      ],
    });

    renderResolution({
      lease,
      resolution: resolutionFixture({ nextInvoiceDueDate: "2026-09-01" }),
    });

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    expect(
      within(upcoming)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "01 Sept 2026Next invoice due",
      "03 Sept 2026Lease activation",
      "01 Oct 2026Scheduled Lease term",
    ]);
    expect(within(upcoming).queryByText("Lease ends")).not.toBeInTheDocument();
  });

  it("falls back from server projection to already-owned Lease dates", () => {
    const lease = leaseFixture({
      activationSchedule: {
        activationDate: "2026-09-03",
        failureMessage: null,
        id: "activation-1",
        status: "pending",
      },
      terms: [
        {
          ...leaseFixture().terms[0],
          id: "term-upcoming",
          startDate: "2026-10-01",
          status: "upcoming",
        },
      ],
    });

    renderResolution({
      lease,
      resolution: resolutionFixture({ nextInvoiceDueDate: null }),
    });

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    expect(
      within(upcoming)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "03 Sept 2026Lease activation",
      "01 Oct 2026Scheduled Lease term",
      "30 Jun 2027Lease ends",
    ]);
  });

  it("omits Upcoming when every legitimate date is absent or past", () => {
    const baseLease = leaseFixture();
    const lease = leaseFixture({
      activationSchedule: undefined,
      formValues: { ...baseLease.formValues, leaseEndDate: "2026-08-24" },
      terms: baseLease.terms.map((term) => ({ ...term, status: "active" })),
    });

    renderResolution({
      lease,
      resolution: resolutionFixture({ nextInvoiceDueDate: "2026-08-01" }),
    });

    expect(
      screen.queryByRole("heading", { name: "Upcoming" }),
    ).not.toBeInTheDocument();
  });

  it("shows at most three newest de-duplicated recent activity rows", () => {
    const lease = leaseFixture({
      activity: [
        activity("activity-2", "Tenant contacted", "2026-08-22T08:00:00Z", {
          href: "/timeline/activity-2",
        }),
        activity("invoice-1", "Duplicate invoice", "2026-08-25T08:00:00Z"),
        activity("activity-3", "Older change", "2026-08-21T08:00:00Z"),
        activity("activity-1", "Lease reviewed", "2026-08-23T08:00:00Z", {
          href: "/timeline/activity-1",
        }),
      ],
    });

    renderResolution({
      lease,
      resolution: resolutionFixture({
        invoice: invoiceFixture({
          issueDate: "2026-08-24",
          pdf: {
            artifactId: "artifact-1",
            href: "/api/finance/documents/invoice-1",
            publicationStatus: "published",
            publishedAt: "2026-08-24T09:00:00Z",
          },
        }),
      }),
    });

    const recent = screen.getByRole("region", { name: "Recent activity" });
    expect(
      within(recent)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([
      "24 Aug 2026Invoice issuedINV-202608-001View",
      "23 Aug 2026Lease reviewedLease recordView",
      "22 Aug 2026Tenant contactedLease recordView",
    ]);
    expect(recent).not.toHaveTextContent("Duplicate invoice");
    expect(recent).not.toHaveTextContent("Older change");
    expect(
      within(recent).getByRole("link", { name: "View INV-202608-001" }),
    ).toHaveAttribute("href", "/api/finance/documents/invoice-1");
    expect(
      within(recent).getByRole("link", { name: "View Lease reviewed" }),
    ).toHaveAttribute("href", "/timeline/activity-1");
  });

  it("does not invent a Finance destination for href-less Lease activity", () => {
    const lease = leaseFixture({
      activity: [
        activity("activity-1", "Tenant contacted", "2026-08-25T08:00:00Z"),
      ],
    });

    renderResolution({ lease });

    const recent = screen.getByRole("region", { name: "Recent activity" });
    const row = within(recent).getByText("Tenant contacted").closest("li");
    expect(row).not.toBeNull();
    expect(within(row!).queryByRole("link")).toBeNull();
  });

  it("shows read-only invoice context when payment authority is absent", () => {
    renderResolution({ canRecordPayments: false, canViewFinance: true });

    expect(
      screen.queryByRole("button", { name: /Record .* payment/ }),
    ).toBeNull();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByText("Payment recording is not available.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open in Finance" })).toHaveAttribute(
      "href",
      "/rent-income?leaseId=lease-1",
    );
  });

  it("does not render a dead-end submit action without a receiving account", () => {
    renderResolution({ reconciliationSources: [] });

    expect(
      screen.queryByRole("button", { name: /Record .* payment/ }),
    ).toBeNull();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByText("No receiving account is available.")).toBeVisible();
  });

  it("keeps both quiet return paths on the full Lease href", () => {
    renderResolution({ returnHref: "/leases/lease-1?from=queue" });

    expect(
      screen.getByRole("link", { name: "Payment is not received" }),
    ).toHaveAttribute("href", "/leases/lease-1?from=queue");
    expect(
      screen.getByRole("link", { name: "Open full lease record" }),
    ).toHaveAttribute("href", "/leases/lease-1?from=queue");
  });
});

function renderResolution({
  canRecordPayments = true,
  canViewFinance = true,
  lease = leaseFixture(),
  reconciliationSources = [sourceFixture()],
  resolution = resolutionFixture(),
  returnHref = "/leases/lease-1",
}: {
  canRecordPayments?: boolean;
  canViewFinance?: boolean;
  lease?: LeaseSummary;
  reconciliationSources?: FinanceOption[];
  resolution?: LeasePaymentResolutionData;
  returnHref?: string;
} = {}) {
  return render(
    <LeasePaymentResolutionView
      canRecordPayments={canRecordPayments}
      canViewFinance={canViewFinance}
      lease={lease}
      onPaymentSuccess={vi.fn()}
      onReceiptResult={vi.fn()}
      resolution={{ ...resolution, reconciliationSources }}
      returnHref={returnHref}
    />,
  );
}

function resolutionFixture(
  overrides: Partial<LeasePaymentResolutionData> = {},
): LeasePaymentResolutionData {
  return {
    invoice: invoiceFixture(),
    nextInvoiceDueDate: "2026-09-01",
    reconciliationSources: [sourceFixture()],
    ...overrides,
  };
}

function invoiceFixture(
  overrides: Partial<TenantInvoiceSummary> = {},
): TenantInvoiceSummary {
  return {
    balanceDue: 258,
    billingPeriodStart: "2026-08-01",
    collectedByOwner: 0,
    collectionRoute: "through_ips",
    dueDate: "2026-08-05",
    generationSource: "scheduled",
    id: "invoice-1",
    invoiceNumber: "INV-202608-001",
    isProrated: false,
    issueDate: "2026-08-24",
    leaseId: "lease-1",
    lines: [
      {
        amount: 258,
        balanceDue: 258,
        id: "line-rent",
        label: "August rent",
        lineType: "rent",
      },
    ],
    occupantLabels: ["Dara Tenant"],
    paidThroughIps: 0,
    paymentStatus: "unpaid",
    pdf: {
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    },
    propertyId: "property-1",
    propertyLabel: "HOME — Riverside Home",
    publicationSnapshot: null,
    recipientLabel: "Dara Tenant",
    settlements: [],
    totalAmount: 258,
    unitId: "unit-1",
    unitLabel: "HOME — Unit 01",
    ...overrides,
  };
}

function sourceFixture(): FinanceOption {
  return {
    id: "source-1",
    label: "BANK · Operating",
    propertyId: "property-1",
  };
}

function leaseFixture(overrides: Partial<LeaseSummary> = {}): LeaseSummary {
  const lease = buildLeaseSummary({
    deposits: [
      {
        amount: 258,
        archived_at: null,
        currency: "USD",
        deposit_type: "security",
        events: [
          {
            amount: 258,
            currency: "USD",
            event_date: "2026-07-01",
            event_type: "received",
            id: "deposit-event-1",
            reference: null,
            reversal_of_id: null,
          },
        ],
        id: "deposit-1",
        lease_id: "lease-1",
        status: "active",
      },
    ],
    lease: {
      archived_at: null,
      deposit_amount: 258,
      deposit_currency: "USD",
      id: "lease-1",
      lease_end_date: "2027-06-30",
      lease_start_date: "2026-07-01",
      monthly_rent_amount: 850,
      monthly_rent_currency: "USD",
      primary_tenant_person_id: "person-1",
      property_id: "property-1",
      status: "active",
      tenant_name: "Dara Tenant",
      unit_id: "unit-1",
    },
    property: { code: "HOME", id: "property-1", name: "Riverside Home" },
    terms: [
      {
        archived_at: null,
        end_date: "2027-06-30",
        id: "term-1",
        lease_id: "lease-1",
        payment_frequency: "monthly",
        rent_amount: 850,
        rent_currency: "USD",
        rent_due_day: 5,
        start_date: "2026-07-01",
        status: "active",
        term_sequence: 1,
      },
    ],
    unit: {
      floor: "1",
      id: "unit-1",
      property_id: "property-1",
      status: "occupied",
      unit_number: "01",
    },
  });

  return { ...lease, ...overrides };
}

function leaseWithDeposit(amount: number, receivedAmount: number) {
  const lease = leaseFixture();
  return leaseFixture({
    deposits: [
      {
        ...lease.deposits[0],
        amount,
        amountCents: amount * 100,
        amountDisplay: { primary: "USD 258.00" },
        amountLabel: "USD 258.00",
        heldBalance: receivedAmount,
        heldBalanceCents: receivedAmount * 100,
        heldBalanceDisplay: {
          primary:
            receivedAmount === 100 ? "USD 100.00" : `USD ${receivedAmount}.00`,
        },
        receivedAmount,
      },
    ],
  });
}

function activity(
  id: string,
  actionLabel: string,
  createdAt: string,
  overrides: Partial<LeaseSummary["activity"][number]> = {},
): LeaseSummary["activity"][number] {
  return {
    action: "updated",
    actionLabel,
    createdAt,
    details: [],
    entityLabel: "Lease",
    id,
    recordLabel: "Lease record",
    tone: "neutral",
    ...overrides,
  };
}
