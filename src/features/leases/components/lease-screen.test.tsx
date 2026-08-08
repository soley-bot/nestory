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
  recordLeaseDepositEventAction: async () => ({}),
  restoreLeaseAction: async () => ({}),
  reverseLeaseDepositEventAction: async () => ({}),
  scheduleFutureRentTermAction: async () => ({}),
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
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

describe("LeaseScreen redesign contract", () => {
  it("keeps the visible page identity and actions while removing page-local summary framing", () => {
    const { container } = renderLeases();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Leases" })).not.toBeNull();
    expect(
      within(container.querySelector('[data-slot="page-header-actions"]')!).getByRole(
        "button",
        { name: "Add lease" },
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Lease summary" })).toBeNull();
    expect(screen.queryByText("This page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate rent" })).toBeNull();
    expect(screen.getByText(/rent is generated automatically/i)).not.toBeNull();

    const tableFrame = container.querySelector<HTMLElement>(
      '[data-slot="register-table-frame"]',
    );
    expect(tableFrame).not.toBeNull();
    expect(tableFrame!.className).not.toContain("rounded");
    expect(tableFrame!.className).not.toContain("border");
    expect(tableFrame!.className).not.toMatch(/(?:^|\s)p[xytrbl]?-/);
    const pagination = screen
      .getByText(
        (_content, element) =>
          element?.tagName === "P" && element.textContent?.includes("Showing") === true,
      )
      .closest("div");
    expect(pagination?.classList.contains("border-t")).toBe(true);
    expect(pagination?.classList.contains("border")).toBe(false);
    expect(pagination?.classList.contains("border-t-0")).toBe(false);
    expect(pagination?.classList.contains("rounded-b-md")).toBe(false);
    expect(pagination?.classList.contains("-mt-px")).toBe(false);
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
    const firstScheduleKey = firstQuickView
      .querySelector<HTMLInputElement>('input[name="idempotencyKey"]')
      ?.value;
    expect(firstScheduleKey).toContain("lease-1");
    expect(
      within(firstQuickView).getByText("Readiness not checked"),
    ).not.toBeNull();
    expect(within(firstQuickView).getByText("USD 1,200.00 held")).not.toBeNull();
    expect(within(firstQuickView).getByText("Event type")).not.toBeNull();
    expect(within(firstQuickView).getByText("Event date")).not.toBeNull();
    expect(within(firstQuickView).getByText("Amount")).not.toBeNull();
    expect(within(firstQuickView).getByText("Reference")).not.toBeNull();
    expect(
      within(firstQuickView).getByRole("heading", {
        name: "Schedule future rent",
      }),
    ).not.toBeNull();
    expect(
      within(firstQuickView).getByRole("button", {
        name: "Schedule future term",
      }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));

    fireEvent.click(rows[1]!);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    const secondQuickView = screen.getByRole("dialog", {
      name: "Ben Tenant lease quick view",
    });
    expect(secondQuickView).not.toBeNull();
    expect(
      secondQuickView.querySelector<HTMLInputElement>(
        'input[name="idempotencyKey"]',
      )?.value,
    ).toContain("lease-2");
    expect(
      secondQuickView.querySelector<HTMLInputElement>(
        'input[name="idempotencyKey"]',
      )?.value,
    ).not.toBe(firstScheduleKey);
    expect(screen.queryByText(/select a lease row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it("keeps search visible and discloses the seven advanced filters on demand", async () => {
    const user = userEvent.setup();
    renderLeases();

    expect(screen.getByRole("textbox", { name: "Search leases" })).not.toBeNull();
    const advancedFilterNames = [
      "Filter leases by property",
      "Filter leases by unit",
      "Filter leases by status",
      "Filter leases by tenant link",
      "Filter leases by archive state",
      "Sort leases",
      "Lease rows per page",
    ];

    for (const name of advancedFilterNames) {
      expect(screen.queryByRole("combobox", { name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Reset lease filters" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByText("Filter leases")).not.toBeNull();
    for (const name of advancedFilterNames) {
      expect(screen.getByRole("combobox", { name })).not.toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Reset lease filters" })).toBeNull();
  });

  it("announces the advanced filter count, enables reset, and preserves URL serialization", async () => {
    navigation.searchParams = new URLSearchParams(
      "propertyId=property-1&page=2&leaseId=lease-1",
    );
    const user = userEvent.setup();
    renderLeases({
      viewQuery: { ...defaultViewQuery, propertyId: "property-1" },
    });

    const filters = screen.getByRole("button", { name: "Filters (1)" });
    expect(
      screen.queryByRole("combobox", { name: "Filter leases by property" }),
    ).toBeNull();

    await user.click(filters);

    const reset = screen.getByRole("link", { name: "Reset lease filters" });
    expect(reset).not.toBeNull();
    expect(reset.getAttribute("href")).toBe("/leases");

    await user.click(
      screen.getByRole("combobox", { name: "Filter leases by status" }),
    );
    await user.click(screen.getByRole("option", { name: "Active" }));

    expect(navigation.replace).toHaveBeenCalledWith(
      "/leases?propertyId=property-1&status=active",
      { scroll: false },
    );
  });

  it("renders filtered review context as inline status", () => {
    renderLeases({
      viewQuery: { ...defaultViewQuery, status: "current" },
    });

    const review = screen.getByRole("region", {
      name: "2 leases currently active or in notice",
    });
    expect(review.getAttribute("data-variant")).toBe("inline");
    expect(review.className).not.toContain("rounded");
    expect(review.className).not.toContain("border");
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
    const drawer = screen.getByRole("dialog", { name: "Edit lease" });
    expect(drawer).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Alice Tenant lease quick view" })).toBeNull();
    expect(
      (
        within(drawer).getByRole("combobox", {
          name: /Tenant/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(drawer).getByRole("combobox", {
          name: "Status",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(drawer).getByRole("combobox", {
          name: "Property",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(drawer).getByRole("combobox", {
          name: "Unit",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      drawer.querySelector<HTMLInputElement>(
        'input[name="tenantPersonId"]:not([disabled])',
      )?.value,
    ).toBe("person-1");
    expect(
      drawer.querySelector<HTMLInputElement>(
        'input[name="propertyId"]:not([disabled])',
      )?.value,
    ).toBe("property-1");
    expect(
      drawer.querySelector<HTMLInputElement>(
        'input[name="unitId"]:not([disabled])',
      )?.value,
    ).toBe("unit-1");
    expect(
      drawer.querySelector<HTMLInputElement>(
        'input[name="status"]:not([disabled])',
      )?.value,
    ).toBe("active");
    expect(
      (
        within(drawer).getByRole("textbox", {
          name: /Rent amount/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
    expect(
      within(drawer).getByText(
        /relationship, occupancy, and Lease lifecycle changes require a checked transition/i,
      ),
    ).not.toBeNull();
  });

  it("shows archived Lease restore as unavailable pending checked review", async () => {
    const user = userEvent.setup();
    renderLeases({
      leases: [makeLease("lease-archived", "Archived Tenant", "Unit 4C", true)],
      viewQuery: { ...defaultViewQuery, archiveState: "archived" },
    });

    await user.click(
      screen.getByRole("button", { name: "Preview lease for Archived Tenant" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Review restore requirements for Archived Tenant",
      }),
    );

    const drawer = screen.getByRole("dialog", { name: "Restore unavailable" });
    expect(
      within(drawer).getByText(
        /relationship, occupancy, and dependency review/i,
      ),
    ).not.toBeNull();
    expect(
      (
        within(drawer).getByRole("button", {
          name: "Restore unavailable",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("requires explicit due day, frequency, and term lifecycle in the create drawer", async () => {
    const user = userEvent.setup();
    renderLeases();

    await user.click(screen.getByRole("button", { name: "Add lease" }));

    const drawer = screen.getByRole("dialog", { name: "Add lease" });
    expect(
      within(drawer).getByRole("group", { name: /Rent due day/ }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("group", { name: /Payment frequency/ }),
    ).not.toBeNull();
    expect(
      within(drawer).getByRole("group", { name: /Term status/ }),
    ).not.toBeNull();
    expect(
      within(drawer).getByText(
        /no policy default is inferred/i,
      ),
    ).not.toBeNull();
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

    renderLeases({ canConfigure: false, leases: [] });
    expect(screen.getByText("No leases yet")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate rent" })).toBeNull();
  });

  it("keeps Finance lease inspection read-only", () => {
    renderLeases({ canConfigure: false });

    fireEvent.click(screen.getAllByRole("row")[1]!);
    const quickView = screen.getByRole("dialog", {
      name: "Alice Tenant lease quick view",
    });

    expect(within(quickView).getByText("USD 1,200.00 held")).not.toBeNull();
    expect(within(quickView).queryByRole("button", { name: "Record event" })).toBeNull();
    expect(
      within(quickView).queryByRole("button", { name: "Schedule future term" }),
    ).toBeNull();
    expect(
      within(quickView).queryByRole("button", {
        name: "Edit lease for Alice Tenant",
      }),
    ).toBeNull();
    expect(
      within(quickView).queryByRole("button", {
        name: "Archive lease for Alice Tenant",
      }),
    ).toBeNull();
    expect(within(quickView).queryByRole("link", { name: "Open rent policy" })).toBeNull();
    expect(within(quickView).queryByRole("link", { name: "Open Unit 2A" })).toBeNull();
    expect(
      within(quickView).queryByRole("link", {
        name: "Open ledger filtered to Alice Tenant",
      }),
    ).toBeNull();
  });

  it("does not open action=create when creation is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderLeases({ canConfigure: false, leases: [] });

    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("keeps authoritative totals and pagination range on a later result page", () => {
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

    expect(screen.queryByRole("region", { name: "Lease summary" })).toBeNull();
    expect(screen.queryByText("This page")).toBeNull();
    expect(screen.getAllByText("121 records")).not.toHaveLength(0);
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
  canConfigure = true,
  leases: nextLeases = leases,
  pagination,
  viewQuery = defaultViewQuery,
}: {
  canConfigure?: boolean;
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
      canConfigure={canConfigure}
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
        {
          archived: false,
          description: "Tenant · alice@example.com",
          id: "person-1",
          label: "Alice Tenant",
          roles: ["tenant"],
        },
        {
          archived: false,
          description: "Tenant · ben@example.com",
          id: "person-2",
          label: "Ben Tenant",
          roles: ["tenant"],
        },
      ]}
      unitOptions={[
        { id: "unit-1", label: "Unit 2A", propertyId: "property-1" },
        { id: "unit-2", label: "Unit 3B", propertyId: "property-1" },
      ]}
      viewQuery={viewQuery}
    />,
  );
}

function makeLease(
  id: string,
  tenantName: string,
  unitNumber: string,
  isArchived = false,
) {
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
      archived_at: isArchived ? "2026-07-20T00:00:00.000Z" : null,
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
    terms: [
      {
        archived_at: null,
        authority_kind: "authoritative",
        end_date: "2027-06-30",
        id: `${id}-term`,
        lease_id: id,
        payment_frequency: "monthly",
        rent_amount: 850,
        rent_currency: "USD",
        rent_due_day: 10,
        start_date: "2026-07-01",
        status: "active",
        term_sequence: 1,
      },
    ],
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
