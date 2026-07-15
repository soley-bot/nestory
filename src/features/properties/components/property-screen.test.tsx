/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyScreen } from "@/features/properties/components/property-screen";
import { buildPropertySummary } from "@/features/properties/data/property-summary";
import type { PropertyViewQuery } from "@/features/properties/property.types";

const navigation = vi.hoisted(() => ({
  pathname: "/properties",
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

const defaultViewQuery: PropertyViewQuery = {
  archiveState: "active",
  netStatus: "all",
  ownerStatus: "all",
  page: 1,
  pageSize: 50,
  query: "",
  review: "all",
  sort: "code_asc",
  status: "all",
};

const properties = [
  makeProperty("property-1", "HOME", "Home Residence"),
  makeProperty("property-2", "RIVER", "Riverside House"),
];

beforeEach(() => {
  navigation.pathname = "/properties";
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

describe("PropertyScreen redesign contract", () => {
  it("uses the shared dense workspace, one selected row, direct links, and URL-backed sorting", () => {
    const { container } = renderProperties();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    expect(
      within(rows[0]!).getByRole("link", { name: "Home Residence" }).getAttribute("href"),
    ).toBe("/properties/property-1");

    fireEvent.click(rows[1]!);
    expect(rows.filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("complementary", { name: "Riverside House inspector" }),
    ).not.toBeNull();

    const inspector = screen.getByRole("complementary", {
      name: "Riverside House inspector",
    });
    expect(inspector.className).toContain("max-w-[320px]");

    fireEvent.click(screen.getByRole("button", { name: "Sort properties by net" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/properties?sort=net_desc",
      { scroll: false },
    );

    expect(screen.queryByText(/select a row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it("uses the inspector drawer below the compact-desktop breakpoint", () => {
    installMatchMedia(false);
    renderProperties();

    expect(screen.queryByRole("dialog")).toBeNull();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    fireEvent.click(rows[0]!);

    expect(
      screen.getByRole("dialog", { name: "Home Residence inspector" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("complementary", { name: "Home Residence inspector" }),
    ).toBeNull();
  });

  it("offers Clear filters for a filtered empty result", () => {
    renderProperties({
      properties: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });

    const emptyState = screen.getByText("No matching properties").closest("section");
    expect(emptyState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(emptyState!).getByRole("link", { name: "Clear filters" }).getAttribute(
        "href",
      ),
    ).toBe("/properties");
  });

  it("shows create actions only when the caller is authorized", () => {
    const authorized = renderProperties({ canCreate: true, properties: [] });
    expect(screen.getAllByRole("button", { name: "Add property" }).length).toBeGreaterThan(0);
    authorized.unmount();

    renderProperties({ canCreate: false, properties: [] });
    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
  });
});

function renderProperties({
  canCreate = true,
  properties: nextProperties = properties,
  viewQuery = defaultViewQuery,
}: {
  canCreate?: boolean;
  properties?: typeof properties;
  viewQuery?: PropertyViewQuery;
} = {}) {
  return render(
    <PropertyScreen
      canCreate={canCreate}
      ownerOptions={[]}
      pagination={{
        from: nextProperties.length > 0 ? 1 : 0,
        page: 1,
        pageSize: 50,
        to: nextProperties.length,
        totalCount: nextProperties.length,
        totalPages: nextProperties.length > 0 ? 1 : 0,
      }}
      properties={nextProperties}
      viewQuery={viewQuery}
    />,
  );
}

function makeProperty(id: string, code: string, name: string) {
  return buildPropertySummary({
    activeOwner: { label: "Nora Owner", personId: `owner-${id}` },
    hasActiveOwnerLink: true,
    ledgerEntries: [{ amount: 1200, currency: "USD", direction: "income" }],
    property: {
      address: "1 Main Street",
      code,
      id,
      name,
      owner: "Nora Owner",
      property_type: "Apartment",
      status: "active",
    },
    units: [{ status: "occupied" }],
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
