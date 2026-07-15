/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  installMatchMedia(true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("unit screen report links", () => {
  it("opens vacancy review units in the vacancy/risk report", () => {
    expect(getVacantUnitsReportHref("all")).toBe(
      "/reports/vacancy-risk?status=vacant",
    );
    expect(
      getVacantUnitsReportHref("8b3a08d2-0898-4de3-9495-994eaf7a08dc"),
    ).toBe(
      "/reports/vacancy-risk?status=vacant&propertyId=8b3a08d2-0898-4de3-9495-994eaf7a08dc",
    );
  });
});

describe("UnitScreen redesign contract", () => {
  it("ports the property workspace anatomy, selection, links, and URL-backed sorting", () => {
    navigation.searchParams = new URLSearchParams("status=vacant&page=2");
    const { container } = renderUnits({
      viewQuery: { ...defaultViewQuery, page: 2, status: "vacant" },
    });

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(
      within(rows[0]!).getByRole("link", { name: "Unit 1A" }).getAttribute("href"),
    ).toBe("/units/unit-1");

    fireEvent.click(rows[1]!);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("complementary", { name: "Unit 2B inspector" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sort units by rent" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/units?status=vacant&sort=rent_desc",
      { scroll: false },
    );

    expect(screen.queryByText(/select a row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it("uses the inspector drawer below the compact-desktop breakpoint", () => {
    installMatchMedia(false);
    renderUnits();

    expect(screen.queryByRole("dialog")).toBeNull();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    fireEvent.click(rows[0]!);

    expect(screen.getByRole("dialog", { name: "Unit 1A inspector" })).not.toBeNull();
    expect(
      screen.queryByRole("complementary", { name: "Unit 1A inspector" }),
    ).toBeNull();
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

function installMatchMedia(wide: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes("min-width") ? wide : !wide,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}
