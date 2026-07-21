/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaseScreen } from "@/features/leases/components/lease-screen";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";
import type { LeaseViewQuery } from "@/features/leases/lease.types";

const navigation = vi.hoisted(() => ({
  pathname: "/leases",
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
  }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/features/leases/actions", () => ({
  archiveLeaseAction: async () => ({}),
  createLeaseAction: async () => ({}),
  generateMonthlyRentAction: async () => ({}),
  recordLeaseDepositEventAction: async () => ({}),
  restoreLeaseAction: async () => ({}),
  reverseLeaseDepositEventAction: async () => ({}),
  updateLeaseAction: async () => ({}),
}));

const defaultViewQuery: LeaseViewQuery = {
  archiveState: "active",
  endMonth: "",
  endsWithinDays: null,
  leaseId: null,
  page: 1,
  pageSize: 50,
  propertyId: "all",
  query: "",
  sort: "start_desc",
  status: "all",
  tenantStatus: "all",
  unitId: "all",
};

const leases = [
  makeLease("lease-1", "Alice Tenant", "Unit 2A"),
  makeLease("lease-2", "Ben Tenant", "Unit 3B"),
];

beforeEach(() => {
  navigation.pathname = "/leases";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LeaseScreen redesign contract", () => {
  it("uses the shared dense lifecycle workspace with deliberate quick views and direct context links", () => {
    const { container } = renderLeases();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    const summary = screen.getByRole("region", { name: "Lease summary" });
    const summaryStrip = summary.querySelector('[data-mobile-summary-strip="lease-metrics"]');
    expect(summaryStrip?.className).toContain("overflow-x-auto");
    expect(summaryStrip?.getAttribute("tabindex")).toBe("0");
    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    expect(within(table).getByText("Start / End")).not.toBeNull();
    expect(within(table).getByText("Payment / Deposit")).not.toBeNull();

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(
      within(rows[0]!).getByRole("link", { name: "Alice Tenant" }).getAttribute("href"),
    ).toContain("leaseId=lease-1");
    expect(within(rows[0]!).getByText(leases[0]!.startDateLabel)).not.toBeNull();
    expect(within(rows[0]!).getByText(leases[0]!.endDateLabel)).not.toBeNull();
    expect(within(rows[0]!).getByText("1 ledger entry")).not.toBeNull();
    expect(within(rows[0]!).getByText("Active deposit")).not.toBeNull();
    expect(within(rows[0]!).getByText("Riverside House")).not.toBeNull();
    expect(within(rows[0]!).getByText("Unit 2A")).not.toBeNull();

    fireEvent.click(rows[0]!);
    const firstQuickView = screen.getByRole("dialog", {
      name: "Alice Tenant lease quick view",
    });
    expect(within(firstQuickView).getByText("USD 1,200.00 held")).not.toBeNull();
    expect(within(firstQuickView).getByText("Event type")).not.toBeNull();
    expect(within(firstQuickView).getByText("Event date")).not.toBeNull();
    expect(within(firstQuickView).getByText("Amount")).not.toBeNull();
    expect(within(firstQuickView).getByText("Reference")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));

    fireEvent.click(rows[1]!);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("dialog", { name: "Ben Tenant lease quick view" }),
    ).not.toBeNull();
    expect(screen.queryByText(/select a lease row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it.each([1024, 390])("uses one responsive quick-view dialog at %ipx and returns focus", async (width) => {
    installMatchMedia(width);
    const user = userEvent.setup();
    renderLeases();
    const preview = screen.getByRole("button", { name: "Preview lease for Alice Tenant" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(preview);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Alice Tenant lease quick view" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    expect(document.activeElement).toBe(preview);
  });

  it("replaces the quick view with one edit drawer", async () => {
    installMatchMedia(1024);
    const user = userEvent.setup();
    renderLeases();
    const preview = screen.getByRole("button", { name: "Preview lease for Alice Tenant" });

    await user.click(preview);
    await user.click(screen.getByRole("button", { name: "Edit lease for Alice Tenant" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Edit lease" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Alice Tenant lease quick view" })).toBeNull();
  });

  it("distinguishes filtered and true empty states and hides unauthorized actions", () => {
    const filtered = renderLeases({
      leases: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen.getByText("No matching leases").closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(within(filteredState!).getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/leases");
    filtered.unmount();

    renderLeases({ canCreate: false, canGenerateRent: false, leases: [] });
    expect(screen.getByText("No leases yet")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate rent" })).toBeNull();
  });

  it("does not open action=create when creation is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderLeases({ canCreate: false, leases: [] });

    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("scopes every summary metric to this page on a later result page", () => {
    renderLeases({
      pagination: {
        from: 51,
        page: 2,
        pageSize: 50,
        to: 52,
        totalCount: 121,
        totalPages: 3,
      },
    });

    const summary = screen.getByRole("region", { name: "Lease summary" });
    expect(within(summary).getByText("This page")).not.toBeNull();
    expectLeaseMetric(summary, "Leases", "2");
    expectLeaseMetric(summary, "Current", "2");
    expectLeaseMetric(summary, "Tenant gaps", "0");
    expectLeaseMetric(summary, "Missing docs", "2");
    expect(within(summary).queryByText("121")).toBeNull();
    expect(screen.getByText("121 records")).not.toBeNull();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "Showing 51-52 of 121",
      ),
    ).not.toBeNull();
  });
});

function renderLeases({
  canCreate = true,
  canGenerateRent = true,
  leases: nextLeases = leases,
  pagination,
  viewQuery = defaultViewQuery,
}: {
  canCreate?: boolean;
  canGenerateRent?: boolean;
  leases?: typeof leases;
  pagination?: {
    from: number;
    page: number;
    pageSize: number;
    to: number;
    totalCount: number;
    totalPages: number;
  };
  viewQuery?: LeaseViewQuery;
} = {}) {
  return render(
    <LeaseScreen
      canCreate={canCreate}
      canGenerateRent={canGenerateRent}
      leases={nextLeases}
      pagination={pagination ?? {
          from: nextLeases.length > 0 ? 1 : 0,
          page: 1,
          pageSize: 50,
          to: nextLeases.length,
          totalCount: nextLeases.length,
          totalPages: nextLeases.length > 0 ? 1 : 0,
        }}
      propertyOptions={[{ id: "property-1", label: "Riverside House" }]}
      tenantOptions={[
        { id: "person-1", label: "Alice Tenant" },
        { id: "person-2", label: "Ben Tenant" },
      ]}
      unitOptions={[
        { id: "unit-1", label: "Unit 2A", propertyId: "property-1" },
        { id: "unit-2", label: "Unit 3B", propertyId: "property-1" },
      ]}
      viewQuery={viewQuery}
    />,
  );
}

function expectLeaseMetric(
  summary: HTMLElement,
  label: string,
  value: string,
) {
  const metric = within(summary).getByText(label).closest("div");

  expect(metric).not.toBeNull();
  expect(within(metric!).getByText(value)).not.toBeNull();
}

function makeLease(id: string, tenantName: string, unitNumber: string) {
  const personId = id === "lease-1" ? "person-1" : "person-2";
  const unitId = id === "lease-1" ? "unit-1" : "unit-2";

  return buildLeaseSummary({
    deposits: [
      {
        amount: 1200,
        archived_at: null,
        currency: "USD",
        deposit_type: "security",
        events: [
          {
            amount: 1200,
            currency: "USD",
            event_date: "2026-07-01",
            event_type: "received",
            id: `${id}-deposit-event`,
            reference: "RCPT-1",
            reversal_of_id: null,
          },
        ],
        id: `${id}-deposit`,
        lease_id: id,
        status: "active",
      },
    ],
    ledgerEntryCount: 1,
    lease: {
      archived_at: null,
      deposit_amount: 1200,
      deposit_currency: "USD",
      id,
      lease_end_date: "2027-06-30",
      lease_start_date: "2026-07-01",
      monthly_rent_amount: 850,
      monthly_rent_currency: "USD",
      primary_tenant_person_id: personId,
      property_id: "property-1",
      status: "active",
      tenant_name: tenantName,
      unit_id: unitId,
    },
    parties: [
      {
        archived_at: null,
        ended_on: null,
        id: `${id}-party`,
        is_primary: true,
        lease_id: id,
        party_role: "tenant",
        person_id: personId,
        person_name: tenantName,
        primary_email: `${personId}@example.com`,
        primary_phone: "+855 12 345 678",
      },
    ],
    property: { code: "RIVER", id: "property-1", name: "Riverside House" },
    unit: {
      floor: id === "lease-1" ? null : "3",
      id: unitId,
      property_id: "property-1",
      status: "occupied",
      unit_number: unitNumber.replace("Unit ", ""),
    },
  });
}

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const minWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);

      return {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: width >= minWidth,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
    }),
  });
}

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}
