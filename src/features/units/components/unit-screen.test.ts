/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVacantUnitsReportHref,
  UnitScreen,
} from "@/features/units/components/unit-screen";
import { buildUnitSummary } from "@/features/units/data/unit-summary";
import type { UnitViewQuery } from "@/features/units/unit.types";

const navigation = vi.hoisted(() => ({
  pathname: "/units",
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

const defaultViewQuery: UnitViewQuery = {
  archiveState: "active",
  leaseStatus: "all",
  occupancy: "all",
  page: 1,
  pageSize: 50,
  propertyId: "all",
  query: "",
  sort: "property_asc",
  status: "all",
};

const units = [
  makeUnit("unit-1", "1A", "property-1", "HOME", "Home Residence"),
  makeUnit("unit-2", "2B", "property-2", "RIVER", "Riverside House"),
];

beforeEach(() => {
  navigation.pathname = "/units";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
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
});

describe("unit screen report links", () => {
  it("opens vacancy review in the filtered Units workspace", () => {
    expect(getVacantUnitsReportHref("all")).toBe(
      "/units?occupancy=unoccupied",
    );
    expect(
      getVacantUnitsReportHref("8b3a08d2-0898-4de3-9495-994eaf7a08dc"),
    ).toBe(
      "/units?occupancy=unoccupied&propertyId=8b3a08d2-0898-4de3-9495-994eaf7a08dc",
    );
  });
});

describe("UnitScreen redesign contract", () => {
  it("renders one page heading and places the primary action in the header", () => {
    const { container } = renderUnits();

    expect(
      screen.getAllByRole("heading", { level: 1, name: "Units" }),
    ).toHaveLength(1);

    const headerActions = container.querySelector<HTMLElement>(
      '[data-slot="page-header-actions"]',
    );
    expect(headerActions).not.toBeNull();
    expect(
      within(headerActions!).getByRole("button", { name: "Add unit" }),
    ).toBeTruthy();
  });

  it("keeps search visible and discloses the existing unit filters", () => {
    renderUnits();

    expect(screen.getByRole("textbox", { name: "Search units" })).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Filter by property" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByRole("heading", { name: "Filter units" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by property" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by occupancy" }),
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeTruthy();
  });

  it("exposes a control for every filter that narrows the register", () => {
    renderUnits({
      viewQuery: {
        ...defaultViewQuery,
        leaseStatus: "missing",
        status: "maintenance",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));

    expect(
      screen.getByRole("combobox", { name: "Filter by operational state" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by lease link" }),
    ).toBeTruthy();
  });

  it("counts only filters that narrow the register, not sort or page size", () => {
    renderUnits({
      viewQuery: { ...defaultViewQuery, pageSize: 25, sort: "rent_desc" },
    });

    expect(
      screen.queryByRole("button", { name: /^Filters\s*\d/ }),
    ).toBeNull();
  });

  it("uses an unframed desktop register while retaining the semantic table", () => {
    const { container } = renderUnits();
    const frame = container.querySelector<HTMLElement>(
      '[data-slot="register-table-frame"]',
    );

    expect(frame).not.toBeNull();
    expect(frame!.className).not.toMatch(/(?:^|\s)rounded(?:-|\s|$)/);
    expect(frame!.className).not.toMatch(/(?:^|\s)border(?:-|\s|$)/);
    expect(frame!.className).not.toMatch(/(?:^|\s)(?:p|px|py)-/);
    expect(within(frame!).getByRole("table")).toBeTruthy();

    const pagination = screen.getByText(/Showing/).parentElement;
    expect(pagination).not.toBeNull();
    expect(pagination!.className.split(" ")).not.toContain("rounded-b-md");
    expect(pagination!.className.split(" ")).not.toContain("border");
    expect(pagination!.className.split(" ")).not.toContain("border-t-0");
  });

  it("opens the unit record from its row and preserves URL-backed sorting", () => {
    navigation.searchParams = new URLSearchParams("status=vacant&page=2");
    const { container } = renderUnits({
      viewQuery: { ...defaultViewQuery, page: 2, status: "vacant" },
    });

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-sm");
    expect(table.querySelector("thead")?.className).toContain("text-xs");

    const rows = within(table).getAllByRole("row").slice(1);

    fireEvent.click(rows[1]!);
    expect(navigation.push).toHaveBeenCalledWith("/units/unit-2");
    expect(screen.queryByRole("dialog", { name: /quick view/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sort units by rent" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?status=vacant&sort=rent_desc",
      { scroll: false },
    );

    expect(screen.queryByText(/select a row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it.each([1024, 390])(
    "opens the unit record directly after card selection at %ipx",
    async (width) => {
    installMatchMedia(width);
    const user = userEvent.setup();
    renderUnits();

    await user.click(screen.getByRole("button", { name: "Open unit 1A" }));

    expect(navigation.push).toHaveBeenCalledWith("/units/unit-1");
    expect(screen.queryByRole("dialog", { name: /quick view/i })).toBeNull();
    },
  );

  it("opens unit cards with Enter and Space", async () => {
    installMatchMedia(1024);
    const user = userEvent.setup();
    renderUnits();
    const firstUnit = screen.getByRole("button", { name: "Open unit 1A" });
    const secondUnit = screen.getByRole("button", { name: "Open unit 2B" });

    secondUnit.focus();
    await user.keyboard("{Enter}");
    expect(navigation.push).toHaveBeenCalledWith("/units/unit-2");

    firstUnit.focus();
    await user.keyboard(" ");
    expect(navigation.push).toHaveBeenCalledWith("/units/unit-1");
  });

  it("opens table rows with Enter and Space", () => {
    renderUnits();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(navigation.push).toHaveBeenCalledWith("/units/unit-2");

    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(navigation.push).toHaveBeenCalledWith("/units/unit-1");
  });

  it("offers Clear filters for a filtered empty result", () => {
    renderUnits({
      units: [],
      viewQuery: { ...defaultViewQuery, propertyId: "property-1" },
    });

    const emptyState = screen.getByText("No matching units").closest("section");
    expect(emptyState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(emptyState!).getByRole("link", { name: "Clear filters" }).getAttribute(
        "href",
      ),
    ).toBe("/units");
  });

  it("shows create actions only when the caller is authorized", () => {
    const authorized = renderUnits({ canCreate: true, units: [] });
    expect(screen.getAllByRole("button", { name: "Add unit" }).length).toBeGreaterThan(0);
    authorized.unmount();

    renderUnits({ canCreate: false, units: [] });
    expect(screen.queryByRole("button", { name: "Add unit" })).toBeNull();
  });

  it("keeps the create workflow focused on unit fields", async () => {
    const user = userEvent.setup();
    renderUnits({ canCreate: true, units: [] });

    await user.click(screen.getAllByRole("button", { name: "Add unit" })[0]!);

    const drawer = screen.getByRole("dialog", { name: "Add unit" });
    expect(within(drawer).queryByText("Placement effects")).toBeNull();
    expect(within(drawer).queryByText("Documents and evidence")).toBeNull();
    expect(within(drawer).queryByText("Supporting file")).toBeNull();
    expect(
      within(drawer).queryByText(
        "Create a unit record under an active property.",
      ),
    ).toBeNull();
  });

  it("keeps operational-state selection concise without a readiness explainer", async () => {
    const user = userEvent.setup();
    renderUnits({ canCreate: true, units: [] });

    await user.click(screen.getAllByRole("button", { name: "Add unit" })[0]!);

    const drawer = screen.getByRole("dialog", { name: "Add unit" });
    const operationalState = within(drawer).getByRole("combobox", {
      name: /Operational state/,
    });

    expect(within(drawer).queryByText("Lease readiness")).toBeNull();
    expect(within(drawer).queryByText(/Available for leasing after save/)).toBeNull();

    await user.click(operationalState);
    await user.click(screen.getByRole("option", { name: "Maintenance" }));
    expect(within(drawer).queryByText(/Blocked from leasing/)).toBeNull();

    await user.click(operationalState);
    await user.click(screen.getByRole("option", { name: "Inactive" }));
    expect(within(drawer).queryByText(/Not available for leasing/)).toBeNull();
  });

  it("renders a compact register without duplicate lease information", () => {
    renderUnits();

    const table = screen.getByRole("table");
    expect(table.className).toContain("table-auto");
    expect(table.className).toContain("max-w-[1100px]");
    expect(table.querySelector("colgroup")).toBeNull();
    expect(within(table).getByRole("columnheader", { name: "Status" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Lease" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Tenant" })).toBeTruthy();
    expect(within(table).queryByRole("columnheader", { name: "Lease / tenant" })).toBeNull();
    const firstRow = within(table).getByRole("row", { name: "Open unit 1A" });
    expect(within(firstRow).getByText("Home Residence")).toBeTruthy();
    expect(within(firstRow).getByText("No owner")).toBeTruthy();
    expect(within(firstRow).queryByText("HOME")).toBeNull();
    expect(within(firstRow).getByText("In service")).toBeTruthy();
    expect(within(firstRow).queryByText("Available")).toBeNull();
    expect(within(firstRow).getAllByText("No lease")).toHaveLength(1);
    expect(within(firstRow).getByText("—")).toBeTruthy();
  });

  it("does not open an action=create drawer when create is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderUnits({ canCreate: false, units: [] });

    expect(screen.queryByRole("dialog", { name: "Add unit" })).toBeNull();
  });
});

function renderUnits({
  canCreate = true,
  units: nextUnits = units,
  viewQuery = defaultViewQuery,
}: {
  canCreate?: boolean;
  units?: typeof units;
  viewQuery?: UnitViewQuery;
} = {}) {
  return render(
    createElement(UnitScreen, {
      canCreate,
      pagination: {
        from: nextUnits.length > 0 ? 1 : 0,
        page: viewQuery.page,
        pageSize: 50,
        to: nextUnits.length,
        totalCount: nextUnits.length,
        totalPages: nextUnits.length > 0 ? 1 : 0,
      },
      propertyOptions: [
        { id: "property-1", label: "HOME / Home Residence" },
        { id: "property-2", label: "RIVER / Riverside House" },
      ],
      units: nextUnits,
      viewQuery,
    }),
  );
}

function makeUnit(
  id: string,
  unitNumber: string,
  propertyId: string,
  propertyCode: string,
  propertyName: string,
) {
  return buildUnitSummary({
    ledgerEntries: [
      { amount: 900, currency: "USD", direction: "income", unit_id: id },
    ],
    property: { code: propertyCode, id: propertyId, name: propertyName },
    unit: {
      archived_at: null,
      current_rent_amount: 900,
      current_rent_currency: "USD",
      floor: "1",
      id,
      property_id: propertyId,
      size_sqm: 48,
      status: "vacant",
      unit_number: unitNumber,
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
