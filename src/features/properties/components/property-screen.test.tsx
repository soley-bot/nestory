/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  installMatchMedia(1440);
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
  it("uses the Overview top context and keeps the primary action with workspace tools", () => {
    const pageTools = document.createElement("div");
    pageTools.id = "workspace-page-tools";
    document.body.append(pageTools);

    const { container } = renderProperties();

    const breadcrumb = within(pageTools).getByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(within(breadcrumb).getByRole("link", { name: "Properties" })).toBeTruthy();
    expect(within(breadcrumb).getByText("2 records")).toBeTruthy();

    const toolbar = container.querySelector<HTMLElement>(
      '[data-slot="workspace-toolbar"]',
    );
    expect(toolbar).not.toBeNull();
    expect(within(toolbar!).getByRole("button", { name: "Add property" })).toBeTruthy();
  });

  it("uses the shared dense workspace, quick view, double-click navigation, and URL-backed sorting", async () => {
    const { container } = renderProperties();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");

    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      within(rows[0]!).getByRole("link", { name: "Home Residence" }).getAttribute("href"),
    ).toBe("/properties/property-1");

    fireEvent.click(rows[1]!);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Riverside House quick view" }),
      ).toBeTruthy();
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));
    fireEvent.doubleClick(rows[1]!);
    expect(navigation.push).toHaveBeenLastCalledWith("/properties/property-2");

    fireEvent.click(screen.getByRole("button", { name: "Sort properties by net" }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/properties?sort=net_desc",
      { scroll: false },
    );

    expect(screen.queryByText(/select a row/i)).toBeNull();
    expect(screen.queryByText(/double-click/i)).toBeNull();
  });

  it.each([1440, 1024, 390])(
    "keeps the property list inspector-free at %ipx",
    (width) => {
    installMatchMedia(width);
    renderProperties();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    },
  );

  it("opens card records directly without preview state", () => {
    installMatchMedia(1024);
    const { container } = renderProperties();
    const cards = Array.from(container.querySelectorAll("article"));
    fireEvent.click(
      within(cards[1]!).getByRole("button", { name: "Open Riverside House" }),
    );

    expect(navigation.push).toHaveBeenLastCalledWith("/properties/property-2");
    expect(screen.queryByText("Preview")).toBeNull();
  });

  it("supports Enter and Space for table-row quick views", () => {
    renderProperties();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    rows[1]!.focus();
    fireEvent.keyDown(rows[1]!, { key: "Enter" });
    expect(
      screen.getByRole("dialog", { name: "Riverside House quick view" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));

    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: " " });
    expect(
      screen.getByRole("dialog", { name: "Home Residence quick view" }),
    ).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
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

  it("does not open an action=create drawer when create is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderProperties({ canCreate: false, properties: [] });

    expect(screen.queryByRole("dialog", { name: "Add property" })).toBeNull();
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
