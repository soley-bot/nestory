/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaseScreen } from "@/features/leases/components/lease-screen";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";
import type {
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

const navigation = vi.hoisted(() => ({
  pathname: "/leases",
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const leaseActions = vi.hoisted(() => ({
  createLeaseAction: vi.fn(),
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
  createLeaseAction: leaseActions.createLeaseAction,
  recordCurrentLeaseOccupancyEvidenceAction: async () => ({}),
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
  leaseActions.createLeaseAction.mockReset();
  leaseActions.createLeaseAction.mockResolvedValue({});
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
  it("gives status more register width than rent", () => {
    renderLeases();

    const columns = Array.from(
      screen.getByRole("table").querySelectorAll("col"),
      (column) => column.className,
    );

    expect(columns).toEqual([
      "w-[18%]",
      "w-[24%]",
      "w-[24%]",
      "w-[10%]",
      "w-[24%]",
    ]);
  });

  it("keeps deposit attention beside the status badge on desktop", () => {
    const lease = makeLease("lease-1", "Alice Tenant", "Unit 2A");
    lease.deposits[0]!.statusLabel = "Partially Returned";

    renderLeases({ leases: [lease] });

    const statusCell = screen
      .getAllByRole("row")[1]!
      .querySelectorAll("td")[4]!;
    const attention = within(statusCell).getByText(
      "Partially Returned deposit",
    );

    expect(attention.parentElement?.className).toContain("items-center");
    expect(attention.className).toContain("truncate");
    expect(attention.className).not.toContain("mt-1");
  });

  it("aligns the register surface with the page gutter on desktop", () => {
    const { container } = renderLeases();

    const registerGutter = container.querySelector<HTMLElement>(
      '[data-slot="lease-register-gutter"]',
    );
    const registerSurface = container.querySelector<HTMLElement>(
      '[data-slot="lease-register-surface"]',
    );

    expect(registerGutter).not.toBeNull();
    expect(registerGutter!.className).toContain("workspace-gutter-x");
    expect(registerSurface).not.toBeNull();
    expect(registerSurface!.className).toContain("border");
    expect(registerSurface!.className).toContain("rounded-md");
    expect(registerSurface!.className).toContain("overflow-hidden");
    expect(registerSurface!.contains(screen.getByRole("table"))).toBe(true);
    expect(
      registerSurface!.contains(
        screen.getByText(
          (_content, element) =>
            element?.tagName === "P" &&
            element.textContent?.includes("Showing") === true,
        ),
      ),
    ).toBe(true);
  });

  it("keeps the global Lease register secondary and read-only for creation", () => {
    const { container } = renderLeases();

    expect(
      container.querySelector('[data-slot="workspace-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="workspace-split-view"]'),
    ).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Leases" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(
      screen.getByText("Create leases from a Property or Unit record."),
    ).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Lease summary" })).toBeNull();
    expect(screen.queryByText("This page")).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate rent" })).toBeNull();
    expect(screen.queryByText(/rent is generated automatically/i)).toBeNull();
    expect(
      screen.getByRole("toolbar", { name: "Workspace tools" }),
    ).not.toBeNull();

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
          element?.tagName === "P" &&
          element.textContent?.includes("Showing") === true,
      )
      .closest("div");
    expect(pagination?.classList.contains("border-t")).toBe(true);
    expect(pagination?.classList.contains("border")).toBe(false);
    expect(pagination?.classList.contains("border-t-0")).toBe(false);
    expect(pagination?.classList.contains("rounded-b-md")).toBe(false);
    expect(pagination?.classList.contains("-mt-px")).toBe(false);
    const table = screen.getByRole("table");
    expect(table.className).toContain("text-sm");
    expect(table.querySelector("thead")?.className).toContain("text-xs");
    expect(within(table).getByText("Term")).not.toBeNull();
    expect(within(table).queryByText("Deposit")).toBeNull();

    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.filter((row) => row.getAttribute("aria-selected") === "true"),
    ).toHaveLength(0);
    expect(
      within(rows[0]!)
        .getByRole("link", { name: "Alice Tenant" })
        .getAttribute("href"),
    ).toBe("/leases/lease-1");
    // Term is one cell now, not stacked start/end lines.
    expect(rows[0]!.textContent).toContain(leases[0]!.startDateLabel);
    expect(rows[0]!.textContent).toContain(leases[0]!.endDateLabel);
    expect(within(rows[0]!).queryByText("Active deposit")).toBeNull();
    expect(within(rows[0]!).getByText("Riverside House")).not.toBeNull();
    expect(within(rows[0]!).getByText("Unit 2A")).not.toBeNull();

    fireEvent.click(rows[0]!);
    const firstQuickView = screen.getByRole("dialog", {
      name: "Alice Tenant lease quick view",
    });
    expect(
      within(firstQuickView).getByText(
        (_, element) => element?.textContent === "Riverside House / Unit 2A",
      ),
    ).not.toBeNull();
    expect(
      within(firstQuickView).getByText("USD 1,200.00 held"),
    ).not.toBeNull();
    expect(
      within(firstQuickView)
        .getByRole("link", { name: "Open lease record" })
        .getAttribute("href"),
    ).toBe("/leases/lease-1");
    expect(within(firstQuickView).queryByText("Event type")).toBeNull();
    expect(
      within(firstQuickView).queryByRole("heading", {
        name: "Schedule future rent",
      }),
    ).toBeNull();
    expect(
      within(firstQuickView).queryByRole("region", {
        name: "Occupancy evidence",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));

    fireEvent.click(rows[1]!);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    const secondQuickView = screen.getByRole("dialog", {
      name: "Ben Tenant lease quick view",
    });
    expect(secondQuickView).not.toBeNull();
    expect(
      within(secondQuickView)
        .getByRole("link", { name: "Open lease record" })
        .getAttribute("href"),
    ).toBe("/leases/lease-2");
    expect(screen.queryByText(/select a lease row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it("keeps search visible and discloses the seven advanced filters on demand", async () => {
    const user = userEvent.setup();
    renderLeases();

    expect(
      screen.getByRole("textbox", { name: "Search leases" }),
    ).not.toBeNull();
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
    expect(
      screen.queryByRole("link", { name: "Reset lease filters" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByText("Filter leases")).not.toBeNull();
    for (const name of advancedFilterNames) {
      expect(screen.getByRole("combobox", { name })).not.toBeNull();
    }
    expect(
      screen.queryByRole("link", { name: "Reset lease filters" }),
    ).toBeNull();
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

  it.each([1024, 390])(
    "uses one responsive quick-view dialog at %ipx and returns focus",
    async (width) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderLeases();
      const preview = screen.getByRole("button", {
        name: "Preview lease for Alice Tenant",
      });

      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(preview);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(
        screen.getByRole("dialog", { name: "Alice Tenant lease quick view" }),
      ).not.toBeNull();

      await user.click(
        screen.getByRole("button", { name: "Close quick view" }),
      );
      expect(document.activeElement).toBe(preview);
    },
  );

  it("redirects stale global create intents to the Property workspace", () => {
    navigation.searchParams = new URLSearchParams(
      "action=create&propertyId=property-1&unitId=unit-1",
    );

    renderLeases();

    expect(navigation.replace).toHaveBeenCalledWith(
      "/properties?notice=choose-lease-context",
      { scroll: false },
    );
    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("links the inspector next action and related Property and Unit destinations", () => {
    const lease = makeLease("lease-1", "Alice Tenant", "Unit 2A");
    renderLeases({ leases: [lease] });

    fireEvent.click(screen.getAllByRole("row")[1]!);
    const quickView = screen.getByRole("dialog", {
      name: "Alice Tenant lease quick view",
    });

    expect(
      within(quickView)
        .getByRole("link", { name: lease.nextAction.label })
        .getAttribute("href"),
    ).toBe(lease.nextAction.href);
    expect(
      within(quickView)
        .getByRole("link", { name: "Riverside House" })
        .getAttribute("href"),
    ).toBe("/properties/property-1");
    expect(
      within(quickView)
        .getByRole("link", { name: "Unit 2A" })
        .getAttribute("href"),
    ).toBe("/units/unit-1");
    expect(
      within(quickView).getAllByRole("link", { name: "Open lease record" }),
    ).toHaveLength(1);
  });

  it("keeps occupancy repair out of the register quick view", () => {
    const lease = makeLease("lease-1", "Alice Tenant", "Unit 2A");
    lease.occupancies = [
      {
        actualLabel: "Not recorded",
        datesLabel: "Not recorded",
        evidenceLabel: "Accepted",
        evidenceState: "accepted",
        id: "occupancy-1",
        residentLabel: "Resident evidence missing",
        scheduledLabel: "Not recorded",
        statusLabel: "Occupied",
        unitHref: "/units/unit-1",
        unitLabel: "Unit 2A",
      },
    ];
    renderLeases({ leases: [lease] });

    fireEvent.click(screen.getAllByRole("row")[1]!);
    const quickView = screen.getByRole("dialog", {
      name: "Alice Tenant lease quick view",
    });
    expect(
      within(quickView).queryByRole("button", {
        name: "Record occupancy evidence",
      }),
    ).toBeNull();
    expect(
      within(quickView).queryByText("Resident evidence missing"),
    ).toBeNull();
  });

  it("distinguishes filtered and true empty states and hides unauthorized actions", () => {
    const filtered = renderLeases({
      leases: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen
      .getByText("No matching leases")
      .closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState!)
        .getByRole("link", { name: "Clear filters" })
        .getAttribute("href"),
    ).toBe("/leases");
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
    expect(
      within(quickView).queryByRole("button", { name: "Record event" }),
    ).toBeNull();
    expect(
      within(quickView).queryByRole("button", { name: "Schedule future term" }),
    ).toBeNull();
    expect(
      within(quickView).queryByRole("button", {
        name: /edit|archive|restore|record|schedule/i,
      }),
    ).toBeNull();
    expect(
      within(quickView)
        .getByRole("link", { name: "Open lease record" })
        .getAttribute("href"),
    ).toBe("/leases/lease-1");
    const financeRow = screen.getAllByRole("row")[1]!;
    expect(
      within(financeRow).queryByRole("link", { name: "Unit 2A" }),
    ).toBeNull();
    expect(
      within(financeRow)
        .getByRole("link", { name: "Riverside House" })
        .getAttribute("href"),
    ).toBe("/properties/property-1");
    expect(within(quickView).getAllByRole("link")).toHaveLength(4);
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
  propertyOptions,
  unitOptions,
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
  propertyOptions?: { id: string; label: string }[];
  unitOptions?: LeaseUnitOption[];
  viewQuery?: LeaseViewQuery;
} = {}) {
  return render(
    <LeaseScreen
      canConfigure={canConfigure}
      leases={nextLeases}
      pagination={
        pagination ?? {
          from: nextLeases.length > 0 ? 1 : 0,
          page: 1,
          pageSize: 50,
          to: nextLeases.length,
          totalCount: nextLeases.length,
          totalPages: nextLeases.length > 0 ? 1 : 0,
        }
      }
      propertyOptions={
        propertyOptions ?? [{ id: "property-1", label: "Riverside House" }]
      }
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
      unitOptions={
        unitOptions ?? [
          { id: "unit-1", label: "Unit 2A", propertyId: "property-1" },
          { id: "unit-2", label: "Unit 3B", propertyId: "property-1" },
        ]
      }
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
