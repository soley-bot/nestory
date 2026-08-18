/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

  it("uses one predictable row action, opens details only from preview, and preserves URL-backed sorting", async () => {
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
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(within(rows[0]!).queryByRole("link", { name: "Unit 1A" })).toBeNull();

    fireEvent.click(rows[1]!);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Unit 2B quick view" }),
      ).toBeTruthy();
    });
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(navigation.push).not.toHaveBeenCalled();

    const quickView = screen.getByRole("dialog", { name: "Unit 2B quick view" });
    expect(
      within(quickView).getByRole("link", { name: "Open unit 2B" }).getAttribute(
        "href",
      ),
    ).toBe("/units/unit-2");

    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));
    fireEvent.doubleClick(rows[1]!);
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sort units by rent" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?status=vacant&sort=rent_desc",
      { scroll: false },
    );

    expect(screen.queryByText(/select a row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it("uses the approved operational quick-view structure without stacked detail boxes", async () => {
    const user = userEvent.setup();
    const { container } = renderUnits();

    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));

    const quickView = screen.getByRole("dialog", {
      name: "Unit 1A quick view",
    });
    expect(
      quickView.querySelectorAll('[data-slot="unit-preview-fact-card"]'),
    ).toHaveLength(3);
    expect(within(quickView).getByRole("link", { name: "Create draft lease" })).toBeTruthy();
    expect(within(quickView).getByText("Operational readiness")).toBeTruthy();
    expect(within(quickView).getByText("Lease state")).toBeTruthy();
    expect(within(quickView).getByRole("navigation", { name: "Unit records" })).toBeTruthy();
    expect(within(quickView).getByRole("link", { name: "Lease" })).toBeTruthy();
    expect(within(quickView).getByRole("link", { name: "Ledger" })).toBeTruthy();
    expect(within(quickView).getByRole("link", { name: "Maintenance" })).toBeTruthy();
    expect(within(quickView).getByRole("link", { name: "Timeline" })).toBeTruthy();
    expect(
      within(quickView).getByRole("group", { name: "Unit actions" }),
    ).toBeTruthy();
    expect(within(quickView).queryByRole("heading", { name: "At a glance" })).toBeNull();
    expect(within(quickView).queryByRole("heading", { name: "Related records" })).toBeNull();
    expect(container.querySelectorAll('[data-slot="unit-preview-detail-card"]')).toHaveLength(0);
  });

  it.each([1024, 390])(
    "uses the same quick-view dialog after card selection at %ipx",
    async (width) => {
    installMatchMedia(width);
    const user = userEvent.setup();
    renderUnits();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));

    expect(screen.getByRole("dialog", { name: "Unit 1A quick view" })).not.toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    },
  );

  it.each([
    {
      actionName: "Edit unit 1A",
      drawerName: "Edit unit",
      openMoreActions: false,
      width: 1024,
    },
    {
      actionName: "Archive unit 1A",
      drawerName: "Archive unit",
      openMoreActions: true,
      width: 1024,
    },
    {
      actionName: "Edit unit 1A",
      drawerName: "Edit unit",
      openMoreActions: false,
      width: 390,
    },
  ])(
    "replaces the quick view with one $drawerName workflow at $width px and returns focus",
    async ({ actionName, drawerName, openMoreActions, width }) => {
      installMatchMedia(width);
      const user = userEvent.setup();
      renderUnits();
      const preview = screen.getByRole("button", { name: "Preview unit 1A" });

      await user.click(preview);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);

      if (openMoreActions) {
        await user.click(
          screen.getByRole("button", { name: "More actions for unit 1A" }),
        );
      }
      await user.click(screen.getByRole("button", { name: actionName }));

      const dialogs = screen.getAllByRole("dialog");
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0]?.getAttribute("data-slot")).toBe("sheet-content");
      expect(dialogs[0]?.getAttribute("aria-modal")).toBe("true");
      expect(screen.getByRole("dialog", { name: drawerName })).not.toBeNull();
      expect(screen.queryByRole("dialog", { name: "Unit 1A quick view" })).toBeNull();

      await user.click(
        screen.getByRole("button", { name: "Close drawer" }),
      );
      expect(document.activeElement).toBe(preview);
    },
  );

  it("replaces the 1440px quick view when a mutation drawer opens", async () => {
    installMatchMedia(1440);
    const user = userEvent.setup();
    renderUnits();
    const preview = screen.getByRole("button", { name: "Preview unit 1A" });
    await user.click(preview);
    const quickView = screen.getByRole("dialog", {
      name: "Unit 1A quick view",
    });
    const edit = within(quickView).getByRole("button", {
      name: "Edit unit 1A",
    });

    await user.click(edit);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Edit unit" })).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Unit 1A quick view" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(document.activeElement).toBe(preview);
  });

  it("keeps rent out of the unit edit workflow", async () => {
    const user = userEvent.setup();
    renderUnits();

    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));
    await user.click(screen.getByRole("button", { name: "Edit unit 1A" }));

    const editDialog = screen.getByRole("dialog", { name: "Edit unit" });
    expect(
      within(editDialog).queryByRole("spinbutton", { name: "Current rent" }),
    ).toBeNull();
    expect(
      within(editDialog).queryByRole("heading", { name: "Rent" }),
    ).toBeNull();
  });

  it("makes cards preview-first, supports Enter and Space, and restores focus", async () => {
    installMatchMedia(1024);
    const user = userEvent.setup();
    renderUnits();
    const firstPreview = screen.getByRole("button", { name: "Preview unit 1A" });
    const secondPreview = screen.getByRole("button", { name: "Preview unit 2B" });

    expect(firstPreview.getAttribute("aria-pressed")).toBe("false");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("link", { name: "Unit 2B" })).toBeNull();

    secondPreview.focus();
    await user.keyboard("{Enter}");
    expect(secondPreview.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Unit 2B quick view" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close quick view" }));
    expect(document.activeElement).toBe(secondPreview);

    firstPreview.focus();
    await user.keyboard(" ");
    expect(firstPreview.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Unit 1A quick view" })).not.toBeNull();
  });

  it("supports Enter and Space for table-row selection", () => {
    renderUnits();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");

    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
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

  it("shows active-lease occupancy and operational state as read-only context", async () => {
    const user = userEvent.setup();
    const leasedUnit = buildUnitSummary({
      activeLease: {
        id: "lease-1",
        lease_end_date: "2027-01-31",
        lease_start_date: "2026-02-01",
        monthly_rent_amount: 900,
        monthly_rent_currency: "USD",
        primary_tenant_person_id: "person-1",
        status: "active",
        tenant_name: "Dara Tenant",
        unit_id: "unit-1",
      },
      ledgerEntries: [],
      property: { code: "HOME", id: "property-1", name: "Home Residence" },
      unit: {
        archived_at: null,
        current_rent_amount: 900,
        current_rent_currency: "USD",
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 48,
        status: "vacant",
        unit_number: "1A",
      },
    });
    renderUnits({ units: [leasedUnit] });

    await user.click(screen.getByRole("row", { name: "Preview unit 1A" }));
    const quickView = screen.getByRole("dialog", { name: "Unit 1A quick view" });
    expect(within(quickView).queryByText(/status conflict/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit unit 1A" }));

    const editDialog = screen.getByRole("dialog", { name: "Edit unit" });
    expect(within(editDialog).getByText("Occupancy")).toBeTruthy();
    expect(within(editDialog).getByText("Occupied")).toBeTruthy();
    const operationalState = within(editDialog).getByRole("group", {
      name: /^Operational state/,
    });
    expect(operationalState.textContent).toContain("Active");
    expect(
      within(operationalState).queryByRole("combobox"),
    ).toBeNull();
    expect(within(editDialog).queryByRole("combobox", { name: "Status" })).toBeNull();
  });

  it("renders operational readiness and Lease state separately in the register", () => {
    renderUnits();

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Operational readiness" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Lease state" })).toBeTruthy();
    const firstRow = within(table).getByRole("row", { name: "Preview unit 1A" });
    expect(within(firstRow).getByText("In service")).toBeTruthy();
    expect(within(firstRow).queryByText("Available")).toBeNull();
    expect(within(firstRow).getAllByText("No lease")).toHaveLength(2);
  });

  it("keeps one canonical vacancy handoff in the inspector", async () => {
    const user = userEvent.setup();
    const { container } = renderUnits({
      viewQuery: { ...defaultViewQuery, status: "vacant" },
    });

    const headerActions = container.querySelector<HTMLElement>(
      '[data-slot="page-header-actions"]',
    );
    expect(within(headerActions!).queryByRole("link", { name: "Fill vacancy" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));
    expect(
      within(screen.getByRole("dialog", { name: "Unit 1A quick view" })).getByRole(
        "link",
        { name: "Create draft lease" },
      ).getAttribute("href"),
    ).toBe("/leases?action=create&propertyId=property-1&source=vacancy&unitId=unit-1");
  });

  it("continues an exact draft in the inspector unless maintenance outranks it", async () => {
    const user = userEvent.setup();
    const draftLease = {
      id: "draft-lease-2",
      lease_end_date: "2027-07-31",
      lease_start_date: "2026-08-01",
      monthly_rent_amount: 900,
      monthly_rent_currency: "USD" as const,
      primary_tenant_person_id: "person-2",
      status: "draft",
      tenant_name: "Sam Draft",
      unit_id: "unit-1",
    };
    const draftUnit = buildUnitSummary({
      draftLease,
      ledgerEntries: [],
      property: { code: "HOME", id: "property-1", name: "Home Residence" },
      unit: {
        archived_at: null,
        current_rent_amount: 900,
        current_rent_currency: "USD",
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 48,
        status: "vacant",
        unit_number: "1A",
      },
    });
    const draftRender = renderUnits({ units: [draftUnit] });
    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));
    expect(
      screen.getByRole("link", { name: "Continue draft" }).getAttribute("href"),
    ).toBe("/leases/draft-lease-2");
    draftRender.unmount();

    const maintenanceUnit = buildUnitSummary({
      draftLease,
      ledgerEntries: [],
      property: { code: "HOME", id: "property-1", name: "Home Residence" },
      unit: {
        ...draftUnit.formValues,
        archived_at: null,
        current_rent_amount: 900,
        current_rent_currency: "USD",
        floor: "1",
        id: "unit-1",
        property_id: "property-1",
        size_sqm: 48,
        status: "maintenance",
        unit_number: "1A",
      },
    });
    renderUnits({ units: [maintenanceUnit] });
    await user.click(screen.getByRole("button", { name: "Preview unit 1A" }));
    expect(screen.getByRole("link", { name: "Log maintenance case" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue draft" })).toBeNull();
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
