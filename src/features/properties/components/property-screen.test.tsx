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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const peopleActions = vi.hoisted(() => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
}));

vi.mock("@/features/people/actions", () => ({
  createPersonAction: peopleActions.createPerson,
  updatePersonAction: peopleActions.updatePerson,
}));

import { PropertyScreen } from "@/features/properties/components/property-screen";
import { PropertyForm } from "@/features/properties/components/property-form";
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
  peopleActions.createPerson.mockReset();
  peopleActions.createPerson.mockResolvedValue({
    displayName: "New Owner",
    message: "Person added.",
    personId: "33333333-3333-4333-8333-333333333333",
    roles: ["owner"],
    status: "success",
  });
  peopleActions.updatePerson.mockReset();
  navigation.pathname = "/properties";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(() => "blob:property-photo") },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

afterEach(() => {
  cleanup();
  document.querySelectorAll("#workspace-page-tools").forEach((node) => node.remove());
  delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("PropertyScreen redesign contract", () => {
  it("preserves ownership facts for the same owner and defaults a replacement owner to full ownership", () => {
    const currentOwnerId = "11111111-1111-4111-8111-111111111111";
    const replacementOwnerId = "22222222-2222-4222-8222-222222222222";
    const property = makeProperty("property-edit", "EDIT", "Edit property");
    property.formValues.ownerPersonId = currentOwnerId;

    render(
      <PropertyForm
        mode="edit"
        onClose={vi.fn()}
        ownerOptions={[
          { archived: false, description: "Current", id: currentOwnerId, label: "Current Owner", roles: ["owner"] },
          { archived: false, description: "Replacement", id: replacementOwnerId, label: "Replacement Owner", roles: ["owner"] },
        ]}
        property={property}
      />,
    );

    const start = document.querySelector<HTMLInputElement>('input[name="ownerStartedOn"]')!;
    const share = screen.getByRole("textbox", { name: /Ownership share/ }) as HTMLInputElement;
    expect(start.value).toBe("2026-01-01");
    expect(share.value).toBe("100.000");

    fireEvent.focus(screen.getByRole("combobox", { name: "Property owner" }));
    fireEvent.click(screen.getByRole("option", { name: /Replacement Owner/ }));

    const replacementStart = document.querySelector<HTMLInputElement>('input[name="ownerStartedOn"]')!;
    const replacementShare = screen.getByRole("textbox", { name: /Ownership share/ }) as HTMLInputElement;
    expect(replacementStart.value).toBe("");
    expect(replacementShare.value).toBe("100");
    expect(replacementStart.required).toBe(true);
    expect(replacementShare.required).toBe(true);
  });

  it("keeps ownership share blank without an owner and explains the full-ownership default", async () => {
    const user = userEvent.setup();

    render(
      <PropertyForm
        mode="create"
        onClose={vi.fn()}
        ownerOptions={[]}
      />,
    );

    const share = screen.getByRole("textbox", { name: /Ownership share/ }) as HTMLInputElement;
    expect(share.value).toBe("");
    expect(share.required).toBe(false);

    await user.hover(screen.getByRole("button", { name: "About ownership share" }));
    expect(
      await screen.findByText(
        "Use 100% for a sole owner. Reduce the share when the property has multiple owners.",
      ),
    ).toBeTruthy();
  });

  it("shows ownership values with a percent suffix without changing the numeric form value", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";

    render(
      <PropertyForm
        initialValues={{ ownerPersonId: ownerId }}
        mode="create"
        onClose={vi.fn()}
        ownerOptions={[
          {
            archived: false,
            description: "Owner",
            id: ownerId,
            label: "Current Owner",
            roles: ["owner"],
          },
        ]}
      />,
    );

    const ownershipField = screen.getByRole("group", {
      name: /Ownership share/,
    });
    const share = within(ownershipField).getByRole("textbox") as HTMLInputElement;

    expect(within(ownershipField).getByText("%", { selector: "span" })).toBeTruthy();
    expect(share.value).toBe("100");
  });

  it("fits an uploaded property photo inside a stable preview frame", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PropertyForm mode="create" onClose={vi.fn()} ownerOptions={[]} />,
    );
    const fileInput = container.querySelector<HTMLInputElement>(
      'input[name="photo"]',
    )!;

    await user.upload(
      fileInput,
      new File(["photo"], "property.jpg", { type: "image/jpeg" }),
    );

    const frame = container.querySelector<HTMLElement>(
      '[data-slot="property-photo-preview-frame"]',
    );
    const image = frame?.querySelector("img");

    expect(frame).not.toBeNull();
    expect(frame?.className).toContain("h-56");
    expect(image?.className).toContain("object-contain");
    expect(image?.className).not.toContain("object-cover");
  });
  it("keeps one page title in the content header without a shell breadcrumb", () => {
    const pageTools = document.createElement("div");
    pageTools.id = "workspace-page-tools";
    document.body.append(pageTools);

    const { container } = renderProperties();

    expect(
      screen.getAllByRole("heading", { level: 1, name: "Properties" }),
    ).toHaveLength(1);

    expect(within(pageTools).queryByRole("heading", { name: "Properties" })).toBeNull();
    expect(within(pageTools).queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(within(pageTools).queryByText("2 records")).toBeNull();

    const headerActions = container.querySelector<HTMLElement>(
      '[data-slot="page-header-actions"]',
    );
    expect(headerActions).not.toBeNull();
    expect(
      within(headerActions!).getByRole("button", { name: "Add property" }),
    ).toBeTruthy();
    expect(within(headerActions!).queryByRole("link", { name: "Set up property" })).toBeNull();
  });

  it("keeps search visible and discloses the existing advanced filters", () => {
    renderProperties();

    expect(screen.getByRole("textbox", { name: "Search properties" })).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Filter by status" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByRole("heading", { name: "Filter properties" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by owner link" }),
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Rows per page" })).toBeTruthy();
  });

  it("groups the property tools and register in one bordered data surface", () => {
    const { container } = renderProperties();
    const surface = container.querySelector<HTMLElement>(
      '[data-slot="property-list-surface"]',
    );
    const frame = container.querySelector<HTMLElement>(
      '[data-slot="register-table-frame"]',
    );
    const toolbar = container.querySelector<HTMLElement>(
      '[data-slot="property-list-toolbar"]',
    );

    expect(surface).not.toBeNull();
    expect(surface!.className).not.toMatch(/(?:^|\s)rounded-lg(?:\s|$)/);
    expect(surface!.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(toolbar).not.toBeNull();
    expect(toolbar!.className).toContain("workspace-gutter-x");
    expect(
      within(surface!).getByRole("textbox", { name: "Search properties" }),
    ).toBeTruthy();
    expect(frame).not.toBeNull();
    expect(frame!.className).toContain("workspace-gutter-x");
    expect(frame!.className).not.toMatch(/(?:^|\s)rounded(?:-|\s|$)/);
    expect(frame!.className).not.toMatch(/(?:^|\s)border(?:-|\s|$)/);
    expect(within(frame!).getByRole("table")).toBeTruthy();

    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("uses one predictable row action, opens details only from preview, and preserves URL-backed sorting", async () => {
    const { container } = renderProperties();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).not.toBeNull();

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-sm");
    expect(table.querySelector("thead")?.className).toContain("text-xs");

    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]!).queryByRole("link", { name: "Home Residence" })).toBeNull();

    fireEvent.click(rows[1]!);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Riverside House quick view" }),
      ).toBeTruthy();
    });
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("complementary")).toBeNull();

    const quickView = screen.getByRole("dialog", {
      name: "Riverside House quick view",
    });
    expect(
      within(quickView).getByRole("link", { name: "Open Riverside House" }).getAttribute(
        "href",
      ),
    ).toBe("/properties/property-2");

    fireEvent.click(screen.getByRole("button", { name: "Close quick view" }));
    fireEvent.doubleClick(rows[1]!);
    expect(navigation.push).not.toHaveBeenCalled();

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

  it("opens card quick views instead of bypassing preview", () => {
    installMatchMedia(1024);
    renderProperties();

    fireEvent.click(screen.getByRole("button", { name: "Preview Riverside House" }));

    expect(
      screen.getByRole("dialog", { name: "Riverside House quick view" }),
    ).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
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
    const pageTools = document.createElement("div");
    pageTools.id = "workspace-page-tools";
    document.body.append(pageTools);

    const authorized = renderProperties({ canCreate: true, properties: [] });
    expect(screen.getAllByRole("button", { name: "Add property" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Set up property" })).toBeTruthy();
    authorized.unmount();

    renderProperties({ canCreate: false, properties: [] });
    expect(screen.queryByRole("button", { name: "Add property" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Set up property" })).toBeNull();
  });

  it("omits pagination controls when every property fits on one page", () => {
    renderProperties();

    expect(screen.queryByText(/Showing 1-2 of 2/)).toBeNull();
    expect(screen.queryByText("Page 1 of 1")).toBeNull();
  });

  it("centers the Open column like Status", () => {
    renderProperties();

    const table = screen.getByRole("table");
    const openHeader = within(table).getByRole("columnheader", { name: "Open" });
    const openCell = within(table).getAllByRole("row")[1]!.children[4];

    expect(openHeader.className).toContain("text-center");
    expect(openCell.className).toContain("text-center");
  });

  it("keeps the create form concise without redundant helper copy", () => {
    renderProperties();

    fireEvent.click(screen.getByRole("button", { name: "Add property" }));

    const drawer = screen.getByRole("dialog", { name: "Add property" });
    const drawerHeader = drawer.querySelector<HTMLElement>(
      '[data-slot="drawer-header"]',
    );
    const actionBar = screen.getByTestId("draft-action-bar");
    expect(drawer.style.width).toBe("720px");
    expect(drawer.style.maxWidth).toBe("92vw");
    expect(drawerHeader?.className.split(" ")).not.toContain("border-b");
    expect(actionBar.className.split(" ")).not.toContain("border-t");
    expect(
      screen.queryByText(
        "Create a property record that can hold property-level history or child units.",
      ),
    ).toBeNull();
    expect(screen.queryByText("Linked record effects")).toBeNull();
    expect(
      screen.queryByText(
        "Optional. Upload a cover or identification image for the Photos tab.",
      ),
    ).toBeNull();
    expect(screen.queryByPlaceholderText("Central Residence")).toBeNull();
    expect(screen.queryByPlaceholderText("CTR")).toBeNull();
    expect(screen.queryByPlaceholderText("Serviced apartment")).toBeNull();
    expect(screen.queryByPlaceholderText("Internal operating notes")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Property Information" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Property Owner & Location" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Identity" })).toBeNull();
    expect(screen.queryByText("Ownership and location")).toBeNull();
    expect(screen.getByRole("button", { name: "Create owner" }).className).toContain(
      "text-primary",
    );
    expect(screen.queryByRole("link", { name: "Create owner" })).toBeNull();
  });

  it("creates and selects an owner without leaving the property draft", async () => {
    const user = userEvent.setup();
    renderProperties();

    await user.click(screen.getByRole("button", { name: "Add property" }));
    const propertyDrawer = screen.getByRole("dialog", { name: "Add property" });
    await user.type(
      within(propertyDrawer).getByRole("textbox", { name: /Property name/ }),
      "Draft Property",
    );

    await user.click(
      within(propertyDrawer).getByRole("button", { name: "Create owner" }),
    );
    const ownerDialog = screen.getByRole("dialog", { name: "Create owner" });
    await user.click(
      within(ownerDialog).getByRole("combobox", { name: /Party type/ }),
    );
    await user.click(screen.getByRole("option", { name: "Company" }));
    expect(
      within(ownerDialog).getByRole("combobox", { name: /Party type/ })
        .textContent,
    ).toContain("Company");
    await user.type(
      within(ownerDialog).getByRole("textbox", { name: /Owner name/ }),
      "New Owner",
    );
    await user.click(
      within(ownerDialog).getByRole("button", { name: "Add owner" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create owner" })).toBeNull();
    });
    expect(screen.getByDisplayValue("Draft Property")).toBeTruthy();
    expect(within(propertyDrawer).getByText("New Owner")).toBeTruthy();
    expect(
      propertyDrawer.querySelector<HTMLInputElement>(
        'input[name="ownerPersonId"]',
      )?.value,
    ).toBe("33333333-3333-4333-8333-333333333333");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("does not open an action=create drawer when create is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderProperties({ canCreate: false, properties: [] });

    expect(screen.queryByRole("dialog", { name: "Add property" })).toBeNull();
  });

  it("prefills a trusted Owner handoff and removes the consumed query intent", () => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    navigation.searchParams = new URLSearchParams(
      `action=create&ownerPersonId=${ownerId}`,
    );
    renderProperties({
      ownerOptions: [
        {
          archived: false,
          description: "Owner · owner@example.com",
          id: ownerId,
          label: "Nora Owner",
          roles: ["owner"],
        },
      ],
    });

    const ownerField = screen.getByRole("group", { name: "Property owner" });
    expect(within(ownerField).getByText("Nora Owner")).toBeTruthy();
    expect(
      ownerField.querySelector<HTMLInputElement>('input[name="ownerPersonId"]')
        ?.value,
    ).toBe(ownerId);
    expect(navigation.replace).toHaveBeenCalledWith("/properties", {
      scroll: false,
    });
    const startInput = document.querySelector<HTMLInputElement>(
      'input[name="ownerStartedOn"]',
    );
    const shareInput = screen.getByRole("textbox", {
      name: /^Ownership share/,
    });
    expect(startInput?.value).toBe("");
    expect(startInput?.required).toBe(true);
    expect(shareInput.getAttribute("required")).not.toBeNull();
    expect(shareInput.getAttribute("value")).toBe("100");
  });
});

function renderProperties({
  canCreate = true,
  ownerOptions = [],
  properties: nextProperties = properties,
  viewQuery = defaultViewQuery,
}: {
  canCreate?: boolean;
  ownerOptions?: React.ComponentProps<typeof PropertyScreen>["ownerOptions"];
  properties?: typeof properties;
  viewQuery?: PropertyViewQuery;
} = {}) {
  return render(
    <PropertyScreen
      canCreate={canCreate}
      ownerOptions={ownerOptions}
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
    activeOwner: {
      label: "Nora Owner",
      ownershipPercent: "100.000",
      personId: `owner-${id}`,
      startedOn: "2026-01-01",
    },
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
