/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import OwnersPage from "@/app/(dashboard)/owners/page";
import PeoplePage from "@/app/(dashboard)/people/page";
import StaffPage from "@/app/(dashboard)/staff/page";
import TenantsPage from "@/app/(dashboard)/tenants/page";
import VendorsPage from "@/app/(dashboard)/vendors/page";
import { PeopleScreen } from "@/features/people/components/people-screen";
import { DEFAULT_PEOPLE_PAGE_SIZE, parsePeopleSearchParams } from "@/features/people/people.filters";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import type {
  PeoplePagination,
  PeopleSummary,
  PeopleViewQuery,
  PersonRoleValue,
} from "@/features/people/people.types";

const navigation = vi.hoisted(() => ({
  pathname: "/people",
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));
const personFormSubmission = vi.hoisted(() => ({
  role: "tenant" as PersonRoleValue,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
  }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("@/features/people/components/people-module-page", () => ({
  PeopleModulePage: ({
    config,
  }: {
    config: { role?: string; title: string };
  }) => (
    <div data-role={config.role ?? "all"} data-testid="people-module-page">
      {config.title}
    </div>
  ),
}));

vi.mock("@/features/people/components/person-form", () => ({
  PersonForm: ({
    onSuccess,
    roleContext,
  }: {
    onSuccess?: (
      message: string,
      personId?: string,
      roles?: PersonRoleValue[],
    ) => void;
    roleContext?: PersonRoleValue;
  }) => (
    <button
      onClick={() =>
        onSuccess?.(
          `${roleContext ?? "person"} added.`,
          "11111111-1111-4111-8111-111111111111",
          [roleContext ?? personFormSubmission.role],
        )
      }
      type="button"
    >
      Complete person create
    </button>
  ),
}));

vi.mock("@/lib/auth/context", () => ({
  requireSuperAdminContext: async () => ({ organizationId: "organization-1" }),
}));

const defaultViewQuery: PeopleViewQuery = {
  archiveState: "active",
  page: 1,
  pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
  personId: null,
  query: "",
  role: "all",
  sort: "name_asc",
  status: "all",
};

const people = [
  makePerson("person-1", "Alice Tenant", "tenant"),
  makePerson("person-2", "Nora Owner", "owner"),
];

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: () => undefined },
    scrollIntoView: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
});

beforeEach(() => {
  navigation.pathname = "/people";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.searchParams = new URLSearchParams();
  personFormSubmission.role = "tenant";
  installMatchMedia(1440);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("People route family redesign contract", () => {
  it("submits search with Enter without a separate button and keeps register context", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams("role=owner&archiveState=all&sort=updated_desc&pageSize=50&page=3");
    renderPeople({ viewQuery: parsePeopleSearchParams(Object.fromEntries(navigation.searchParams)) });
    expect(screen.queryByRole("button", { name: "Search people" })).toBeNull();
    const input = screen.getByRole("textbox", { name: "Search people" });

    await user.type(input, "River");
    await user.keyboard("{Enter}");

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    const href = navigation.replace.mock.calls[0][0] as string;
    expect(Object.fromEntries(new URL(href, "https://nestory.test").searchParams)).toEqual({
      role: "owner", archiveState: "all", sort: "updated_desc", pageSize: "50", query: "River",
    });
    await act(() => new Promise(resolve => window.setTimeout(resolve, 600)));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it("still debounces search while leaving the input responsive", async () => {
    vi.useFakeTimers();
    renderPeople();
    const input = screen.getByRole("textbox", { name: "Search people" });
    fireEvent.change(input, { target: { value: "River" } });
    await act(() => vi.advanceTimersByTimeAsync(499));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("River");
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(navigation.replace).toHaveBeenLastCalledWith("/people?query=River", { scroll: false });
  });

  it("waits for composition to finish before applying search", async () => {
    vi.useFakeTimers();
    renderPeople();
    const input = screen.getByRole("textbox", { name: "Search people" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "River" } });
    fireEvent.submit(input.closest("form")!);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(navigation.replace).toHaveBeenLastCalledWith("/people?query=River", { scroll: false });
  });

  it("clears search without dropping actual filters, sorting, or row count", async () => {
    vi.useFakeTimers();
    const params = { query: "River", status: "missing_contact", archiveState: "all", sort: "updated_desc", pageSize: "50", page: "3" };
    navigation.searchParams = new URLSearchParams(params);
    renderPeople({ viewQuery: parsePeopleSearchParams(params) });
    fireEvent.click(screen.getByRole("button", { name: "Clear search people" }));
    await act(() => vi.advanceTimersByTimeAsync(500));
    const href = navigation.replace.mock.calls.at(-1)![0] as string;
    expect(Object.fromEntries(new URL(href, "https://nestory.test").searchParams)).toEqual({
      status: "missing_contact", archiveState: "all", sort: "updated_desc", pageSize: "50",
    });
    expect((screen.getByRole("textbox", { name: "Search people" }) as HTMLInputElement).value).toBe("");
  });

  it("counts actual narrowing without counting sort or row size", () => {
    const params = { query: "River", status: "missing_contact", archiveState: "all", sort: "updated_desc", pageSize: "50" };
    navigation.searchParams = new URLSearchParams(params);
    renderPeople({ viewQuery: parsePeopleSearchParams(params) });
    expect(screen.getByRole("button", { name: /^Filters/ }).textContent).toBe("Filters2");
    expect(screen.getByRole("link", { name: "Reset people filters" }).getAttribute("href")).toBe("/people?pageSize=50");
  });

  it.each([false, true])("keeps sort reset inside Filters and a truthful empty state (empty: %s)", async empty => {
    const user = userEvent.setup();
    const params = { sort: "updated_desc", pageSize: "50", page: "3" };
    navigation.searchParams = new URLSearchParams(params);
    renderPeople({ people: empty ? [] : people, viewQuery: parsePeopleSearchParams(params) });
    expect(screen.getByRole("button", { name: /^Filters$/ }).textContent).toBe("Filters");
    expect(screen.queryByRole("link", { name: "Reset people filters" })).toBeNull();
    expect(screen.queryByText("No matching people")).toBeNull();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    if (empty) expect(screen.getByText("No people yet").closest("section")?.getAttribute("data-kind")).toBe("empty");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Sort people" }).textContent).toBe("Recently updated");
    expect(screen.getByRole("combobox", { name: "Rows per page" }).textContent).toBe("50");
    expect(screen.getByRole("link", { name: /^Reset$/ }).getAttribute("href")).toBe("/people?pageSize=50");
  });

  it.each(["Next", "Alice Tenant"])("cancels draft search before delayed %s link navigation", async name => {
    vi.useFakeTimers();
    renderPeople({ pagination: { from: 1, to: 10, page: 1, pageSize: 10, totalCount: 30, totalPages: 3 } });
    const input = screen.getByRole("textbox", { name: "Search people" });
    fireEvent.change(input, { target: { value: "Never apply" } });
    const link = screen.getAllByRole("link", { name })[0];
    link.addEventListener("click", event => event.preventDefault());
    fireEvent.click(link);
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("keeps the current draft when opening a person in another tab", async () => {
    vi.useFakeTimers();
    renderPeople();
    const input = screen.getByRole("textbox", { name: "Search people" });
    fireEvent.change(input, { target: { value: "River" } });
    const link = screen.getAllByRole("link", { name: "Alice Tenant" })[0];
    link.addEventListener("click", event => event.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(navigation.replace).toHaveBeenLastCalledWith("/people?query=River", { scroll: false });
  });
  it("routes every People alias through the same workspace with the correct initial lens", async () => {
    const routes = [
      [PeoplePage({ searchParams: Promise.resolve({}) }), "all", "People"],
      [OwnersPage({ searchParams: Promise.resolve({}) }), "owner", "Owners"],
      [StaffPage({ searchParams: Promise.resolve({}) }), "staff", "Staff"],
      [TenantsPage({ searchParams: Promise.resolve({}) }), "tenant", "Tenants"],
      [VendorsPage({ searchParams: Promise.resolve({}) }), "vendor", "Vendors"],
    ] as const;

    for (const [route, role, title] of routes) {
      const result = render(route);
      const workspace = screen.getByTestId("people-module-page");
      expect(workspace.getAttribute("data-role")).toBe(role);
      expect(workspace.textContent).toBe(title);
      result.unmount();
    }
  });

  it("keeps the directory table-first without duplicating sidebar role navigation", async () => {
    const user = userEvent.setup();
    const { container } = renderPeople();

    expect(
      container.querySelector('[data-slot="workspace-page"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="workspace-split-view"]'),
    ).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "People" }),
    ).not.toBeNull();
    expect(screen.queryByRole("region", { name: "People summary" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Directory overview/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "People views" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Cards" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Table" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.queryByLabelText("Filter by role")).toBeNull();

    expect(
      screen.getByRole("region", { name: "People table" }),
    ).not.toBeNull();
    const table = screen.getByRole("table");
    const tableFrame = container.querySelector<HTMLElement>(
      '[data-slot="people-table-frame"]',
    );
    const listSurface = container.querySelector<HTMLElement>(
      '[data-slot="people-list-surface"]',
    );
    expect(listSurface).not.toBeNull();
    expect(listSurface?.className).not.toContain("rounded-lg");
    expect(listSurface?.className.split(" ")).not.toContain("border");
    expect(listSurface?.className).toContain("bg-background");
    expect(
      within(listSurface!).getByRole("textbox", { name: "Search people" }),
    ).not.toBeNull();
    expect(tableFrame).not.toBeNull();
    expect(tableFrame?.className).toContain("workspace-gutter-x");
    expect(tableFrame?.className).not.toContain("rounded-lg");
    expect(tableFrame?.className.split(" ")).not.toContain("border");
    expect(table.className).toContain("text-sm");
    expect(table.className).toContain("table-fixed");
    expect(table.className).toContain("min-w-[900px]");
    expect(table.className).not.toContain("max-w-");
    expect(table.querySelectorAll("colgroup col")).toHaveLength(6);
    expect(table.querySelector("thead")?.className).toContain("text-xs");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.every((row) => row.getAttribute("aria-selected") === null),
    ).toBe(true);
    expect(
      within(rows[0]!)
        .getByRole("link", { name: "Alice Tenant" })
        .getAttribute("href"),
    ).toBe("/people/person-1");
    expect(within(rows[0]!).getByText("Tenant")).not.toBeNull();
    expect(within(rows[0]!).getByText("Active")).not.toBeNull();
    expect(within(rows[0]!).getByText("1 active lease")).not.toBeNull();

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("preserves role and search parameters in pagination links", () => {
    navigation.searchParams = new URLSearchParams(
      "role=owner&query=Alice+Tenant&pageSize=50&page=2",
    );
    renderPeople({
      pagination: {
        from: 51,
        page: 2,
        pageSize: 50,
        to: 100,
        totalCount: 150,
        totalPages: 3,
      },
    });

    expect(
      screen.getByRole("link", { name: "Previous" }).getAttribute("href"),
    ).toBe("/people?role=owner&query=Alice+Tenant&pageSize=50");
    expect(
      screen.getByRole("link", { name: "Next" }).getAttribute("href"),
    ).toBe("/people?role=owner&query=Alice+Tenant&pageSize=50&page=3");
  });

  it.each([25, 50, 100])("selects %i rows and resets the page while preserving the view", async (pageSize) => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams(
      "role=owner&query=Demo&archiveState=all&page=7",
    );
    renderPeople({
      viewQuery: { ...defaultViewQuery, role: "owner", query: "Demo", archiveState: "all", page: 7 },
    });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: String(pageSize) }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      `/people?role=owner&query=Demo&archiveState=all&pageSize=${pageSize}`,
      { scroll: false },
    );
  });

  it("returns to 10 rows without a redundant page-size parameter or stale page", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams(
      "role=owner&query=Demo&pageSize=50&page=3",
    );
    renderPeople({
      viewQuery: { ...defaultViewQuery, role: "owner", query: "Demo", pageSize: 50, page: 3 },
    });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Rows per page" }));
    await user.click(screen.getByRole("option", { name: "10" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/people?role=owner&query=Demo", { scroll: false },
    );
  });

  it("resets the page for a status filter and keeps the chosen larger page size", async () => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams("role=owner&pageSize=25&page=4");
    renderPeople({
      viewQuery: { ...defaultViewQuery, role: "owner", pageSize: 25, page: 4 },
    });

    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await user.click(screen.getByRole("option", { name: "Missing contact" }));

    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/people?role=owner&pageSize=25&status=missing_contact", { scroll: false },
    );
  });

  it.each([1024, 390])(
    "uses direct record links instead of preview drawers at %ipx",
    (width) => {
      installMatchMedia(width);
      renderPeople();
      expect(
        screen
          .getAllByRole("link", { name: "Open record" })[0]
          ?.getAttribute("href"),
      ).toBe("/people/person-1");
      expect(screen.queryByText("Preview")).toBeNull();
      expect(screen.queryByRole("complementary")).toBeNull();
    },
  );

  it("distinguishes filtered and true empty states and hides unauthorized creation", () => {
    const filtered = renderPeople({
      people: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen
      .getByText("No matching people")
      .closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(
      within(filteredState!)
        .getByRole("link", { name: "Clear filters" })
        .getAttribute("href"),
    ).toBe("/people");
    filtered.unmount();

    renderPeople({ canCreate: false, people: [] });
    expect(screen.getByText("No people yet")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "People summary" })).toBeNull();
    expect(
      document.querySelector('[data-empty-state-icon="true"]')?.className,
    ).toContain("size-14");
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
  });

  it.each([25, 50, 100])("keeps the true empty state and add action with %i rows selected", async pageSize => {
    const user = userEvent.setup();
    navigation.searchParams = new URLSearchParams(`pageSize=${pageSize}`);
    renderPeople({
      people: [],
      viewQuery: { ...defaultViewQuery, pageSize },
      pagination: { from: 0, page: 1, pageSize, to: 0, totalCount: 0, totalPages: 1 },
    });

    const emptyState = screen.getByText("No people yet").closest("section")!;
    expect(emptyState.getAttribute("data-kind")).toBe("empty");
    expect(screen.queryByText("No matching people")).toBeNull();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reset people filters" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Filters$/ }).textContent).toBe("Filters");

    await user.click(within(emptyState).getByRole("button", { name: "Add person" }));
    expect(screen.getByRole("dialog", { name: "Add person" })).not.toBeNull();
  });

  it.each([
    { filters: { query: "missing" }, queryString: "query=missing", badge: "Filters" },
    { filters: { status: "missing_contact" }, queryString: "status=missing_contact", badge: "Filters1" },
    { filters: { archiveState: "archived" }, queryString: "archiveState=archived", badge: "Filters1" },
  ] as const)("recognizes $queryString without counting the selected row size", ({ filters, queryString, badge }) => {
    navigation.searchParams = new URLSearchParams(`pageSize=50&${queryString}`);
    renderPeople({ people: [], viewQuery: { ...defaultViewQuery, pageSize: 50, ...filters } });

    const filteredState = screen.getByText("No matching people").closest("section")!;
    expect(filteredState.getAttribute("data-kind")).toBe("filtered");
    expect(screen.queryByText("No people yet")).toBeNull();
    expect(within(filteredState).queryByRole("button", { name: "Add person" })).toBeNull();
    expect(within(filteredState).getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/people?pageSize=50");
    expect(screen.getByRole("link", { name: "Reset people filters" }).getAttribute("href")).toBe("/people?pageSize=50");
    expect(screen.getByRole("button", { name: /^Filters/ }).textContent).toBe(badge);
  });

  it.each([10, 25, 50, 100])("preserves %i rows across every filter reset while clearing page and selection", async pageSize => {
    const user = userEvent.setup();
    const params = {
      pageSize: String(pageSize), page: "7", query: "missing", status: "missing_contact",
      archiveState: "archived", sort: "updated_desc", role: "owner",
      personId: "11111111-1111-4111-8111-111111111111",
    };
    navigation.searchParams = new URLSearchParams(params);
    renderPeople({ people: [], viewQuery: parsePeopleSearchParams(params) });
    const expectedHref = pageSize === 10 ? "/people" : `/people?pageSize=${pageSize}`;

    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe(expectedHref);
    expect(screen.getByRole("link", { name: "Reset people filters" }).getAttribute("href")).toBe(expectedHref);
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("link", { name: /^Reset$/ }).getAttribute("href")).toBe(expectedHref);
    expect(screen.getByRole("combobox", { name: "Rows per page" }).textContent).toBe(String(pageSize));

    const resetParams = Object.fromEntries(new URL(expectedHref, "https://nestory.test").searchParams);
    expect(parsePeopleSearchParams(resetParams)).toEqual({ ...defaultViewQuery, pageSize });
  });

  it.each([
    ["/tenants", "tenant"],
    ["/owners", "owner"],
    ["/vendors", "vendor"],
    ["/staff", "staff"],
  ] as const)("keeps the %s role register when clearing filters", (pathname, lockedRole) => {
    navigation.pathname = pathname;
    navigation.searchParams = new URLSearchParams("pageSize=50&query=missing&role=owner&page=3");
    renderPeople({ people: [], lockedRole, viewQuery: { ...defaultViewQuery, role: lockedRole, pageSize: 50, page: 3, query: "missing" } });

    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe(`${pathname}?pageSize=50`);
    expect(screen.getByRole("link", { name: "Reset people filters" }).getAttribute("href")).toBe(`${pathname}?pageSize=50`);
  });

  it("uses the validated row count instead of retaining an invalid URL value on reset", () => {
    const params = { pageSize: "999", query: "missing", page: "4" };
    navigation.searchParams = new URLSearchParams(params);
    renderPeople({ people: [], viewQuery: parsePeopleSearchParams(params) });

    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/people");
    expect(screen.getByRole("link", { name: "Reset people filters" }).getAttribute("href")).toBe("/people");
  });

  it("does not open action=create when creation is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderPeople({ canCreate: false, people: [] });

    expect(screen.queryByRole("dialog", { name: "Add person" })).toBeNull();
  });

  it("opens role creation without repeating a flavor description", () => {
    renderPeople({ lockedRole: "tenant", people: [] });

    fireEvent.click(screen.getAllByRole("button", { name: "Add tenant" })[0]!);

    const dialog = screen.getByRole("dialog", { name: "Add tenant" });
    expect(
      within(dialog).queryByText(
        "Create a tenant record for leases, occupancy, and follow-up.",
      ),
    ).toBeNull();
  });

  it("keeps role registers focused on contact and operating context", () => {
    renderPeople({ lockedRole: "tenant" });

    const table = screen.getByRole("table");
    expect(
      within(table).queryByRole("columnheader", { name: "Next" }),
    ).toBeNull();
    expect(within(table).queryByText("Review linked work")).toBeNull();
  });

  it.each([
    [
      "owner",
      "Create property",
      "/properties?action=create&ownerPersonId=11111111-1111-4111-8111-111111111111",
    ],
    [
      "tenant",
      "Create lease",
      "/leases?action=create&tenantPersonId=11111111-1111-4111-8111-111111111111",
    ],
    [
      "staff",
      "Grant Workspace Access",
      "/settings/access?personId=11111111-1111-4111-8111-111111111111",
    ],
  ] as const)(
    "shows a transient %s creation handoff without pushing the workspace",
    (role, actionLabel, href) => {
      vi.useFakeTimers();
      const rendered = renderPeople({
        lockedRole: role,
        people: [],
      });

      fireEvent.click(
        screen.getAllByRole("button", { name: `Add ${role}` })[0]!,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Complete person create" }),
      );

      const feedback = document.querySelector<HTMLElement>(
        '[data-slot="transient-feedback"]',
      )!;
      expect(feedback.getAttribute("data-slot")).toBe("transient-feedback");
      expect(feedback.className).toContain("fixed");
      expect(
        within(feedback)
          .getByRole("link", { name: actionLabel })
          .getAttribute("href"),
      ).toBe(href);

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(
        document.querySelector('[data-slot="transient-feedback"]'),
      ).not.toBeNull();

      fireEvent.click(
        within(feedback).getByRole("button", {
          name: "Dismiss notification",
        }),
      );
      expect(
        document.querySelector('[data-slot="transient-feedback"]'),
      ).toBeNull();

      rendered.unmount();
      vi.useRealTimers();
    },
  );

  it.each([
    ["owner", "Create property"],
    ["tenant", "Create lease"],
    ["staff", "Grant Workspace Access"],
  ] as const)(
    "offers the %s handoff when the role is selected from All People",
    (role, actionLabel) => {
      personFormSubmission.role = role;
      renderPeople({ people: [] });

      fireEvent.click(
        screen.getAllByRole("button", { name: "Add person" })[0]!,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Complete person create" }),
      );

      expect(screen.getByRole("link", { name: actionLabel })).not.toBeNull();
    },
  );

  it("uses truthful staff operating context in the table", () => {
    const staffWithNotes = {
      ...makePerson("staff-1", "Sokha Staff", "staff"),
      notes: "Coordinates maintenance dispatch",
    };
    const staffWithoutContext = {
      ...makePerson("staff-2", "Maly Staff", "staff"),
      notes: null,
    };
    renderPeople({
      lockedRole: "staff",
      people: [staffWithNotes, staffWithoutContext],
    });

    const table = screen.getByRole("table");
    expect(within(table).getByText("Operating context")).not.toBeNull();
    expect(
      within(table).getByText("Coordinates maintenance dispatch"),
    ).not.toBeNull();
    expect(within(table).getByText("No operating context")).not.toBeNull();
    expect(screen.queryByText("Team context")).toBeNull();
  });

  it("shows all Workspace Access states and safe focus actions in the staff table", () => {
    const staff = [
      makePerson("staff-none", "No Access Staff", "staff"),
      makePerson("staff-pending", "Pending Staff", "staff"),
      makePerson("staff-failed", "Failed Staff", "staff"),
      makePerson("staff-expired", "Expired Staff", "staff"),
      makePerson("staff-active", "Active Staff", "staff"),
    ];
    const accessByPersonId: Record<string, OrganizationPersonAccessStatus> = {
      "staff-active": {
        branchId: "branch-1",
        email: "active@example.com",
        membershipId: "membership-1",
        primaryAction: "manage_access",
        role: "operations_manager",
        scopeLabel: "Central Office",
        state: "active_workspace_access",
      },
      "staff-expired": {
        branchId: null,
        email: "expired@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        invitationId: "invitation-expired",
        lastSentAt: "2026-07-19T00:00:00.000Z",
        primaryAction: "review_invitation",
        role: "operations_member",
        scopeLabel: "All branches",
        state: "expired",
      },
      "staff-failed": {
        branchId: null,
        email: "failed@example.com",
        expiresAt: "2026-07-30T00:00:00.000Z",
        invitationId: "invitation-failed",
        lastSentAt: null,
        primaryAction: "retry_invitation",
        role: "operations_member",
        scopeLabel: "All branches",
        state: "delivery_failed",
      },
      "staff-none": {
        primaryAction: "grant_access",
        state: "no_access",
      },
      "staff-pending": {
        branchId: null,
        email: "pending@example.com",
        expiresAt: "2026-07-30T00:00:00.000Z",
        invitationId: "invitation-pending",
        lastSentAt: "2026-07-22T00:00:00.000Z",
        primaryAction: "review_invitation",
        role: "super_admin",
        scopeLabel: "All branches",
        state: "invitation_pending",
      },
    };

    renderPeople({ accessByPersonId, lockedRole: "staff", people: staff });

    const table = screen.getByRole("table");
    expect(within(table).getByText("Workspace Access")).not.toBeNull();
    const expectations = [
      [
        "No Access Staff",
        "No access",
        "Grant workspace access",
        "/settings/access?personId=staff-none",
      ],
      [
        "Pending Staff",
        "Pending invitation",
        "Review invitation",
        "/settings/access?personId=staff-pending&invitationId=invitation-pending",
      ],
      [
        "Failed Staff",
        "Invitation failed",
        "Review and resend",
        "/settings/access?personId=staff-failed&invitationId=invitation-failed",
      ],
      [
        "Expired Staff",
        "Invitation expired",
        "Review invitation",
        "/settings/access?personId=staff-expired&invitationId=invitation-expired",
      ],
      [
        "Active Staff",
        "Active access",
        "Manage workspace access",
        "/settings/access?personId=staff-active&memberId=membership-1",
      ],
    ] as const;

    for (const [name, stateLabel, actionLabel, href] of expectations) {
      const row = within(table).getByRole("link", { name }).closest("tr");
      expect(row).not.toBeNull();
      expect(within(row!).getByText(stateLabel)).not.toBeNull();
      expect(
        within(row!)
          .getByRole("link", { name: `${actionLabel} for ${name}` })
          .getAttribute("href"),
      ).toBe(href);
    }
    expect(within(table).getByText(/Last sent/)).not.toBeNull();
    expect(
      within(table).getByText(/^pending@example\.com \/ Last sent/),
    ).not.toBeNull();
    expect(
      within(table).getByText(/^failed@example\.com \/ Delivery/),
    ).not.toBeNull();
    expect(within(table).getByText(/Central Office/)).not.toBeNull();
  });

  it("does not infer no-access or offer actions for missing, inactive, or archived Staff status", () => {
    const missing = makePerson(
      "staff-missing",
      "Missing Status Staff",
      "staff",
    );
    const inactive = {
      ...makePerson("staff-inactive", "Inactive Staff", "staff"),
      roles: [{ role: "staff" as const, status: "inactive" as const }],
    };
    const archived = {
      ...makePerson("staff-archived", "Archived Staff", "staff"),
      isArchived: true,
    };

    renderPeople({
      lockedRole: "staff",
      people: [missing, inactive, archived],
    });

    const table = screen.getByRole("table");
    for (const name of [
      "Missing Status Staff",
      "Inactive Staff",
      "Archived Staff",
    ]) {
      const row = within(table).getByRole("link", { name }).closest("tr");
      expect(
        within(row!).getByText("Workspace access unavailable"),
      ).not.toBeNull();
      expect(
        within(row!).queryByRole("link", { name: /workspace access/i }),
      ).toBeNull();
    }
  });
});

function renderPeople({
  accessByPersonId,
  canCreate = true,
  lockedRole,
  pagination,
  people: nextPeople = people,
  viewQuery = defaultViewQuery,
}: {
  accessByPersonId?: Record<string, OrganizationPersonAccessStatus>;
  canCreate?: boolean;
  lockedRole?: PersonRoleValue;
  pagination?: PeoplePagination;
  people?: PeopleSummary[];
  viewQuery?: PeopleViewQuery;
} = {}) {
  return render(
    getPeopleScreen({
      accessByPersonId,
      canCreate,
      lockedRole,
      pagination,
      people: nextPeople,
      viewQuery,
    }),
  );
}

function getPeopleScreen({
  accessByPersonId,
  canCreate = true,
  lockedRole,
  pagination,
  people: nextPeople = people,
  viewQuery = defaultViewQuery,
}: {
  accessByPersonId?: Record<string, OrganizationPersonAccessStatus>;
  canCreate?: boolean;
  lockedRole?: PersonRoleValue;
  pagination?: PeoplePagination;
  people?: PeopleSummary[];
  viewQuery?: PeopleViewQuery;
} = {}) {
  return (
    <PeopleScreen
      accessByPersonId={accessByPersonId}
      addButtonLabel={lockedRole ? `Add ${lockedRole}` : "Add person"}
      canCreate={canCreate}
      createRole={lockedRole}
      lockedRole={lockedRole}
      pagination={
        pagination ?? {
          from: nextPeople.length > 0 ? 1 : 0,
          page: 1,
          pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
          to: nextPeople.length,
          totalCount: nextPeople.length,
          totalPages: nextPeople.length > 0 ? 1 : 0,
        }
      }
      people={nextPeople}
      viewQuery={viewQuery}
    />
  );
}

function makePerson(
  id: string,
  displayName: string,
  role: PersonRoleValue,
): PeopleSummary {
  const isTenant = role === "tenant";
  const isOwner = role === "owner";

  return {
    activity: [],
    contact: {
      email: `${id}@example.com`,
      label: `${id}@example.com / +855 12 345 678`,
      phone: "+855 12 345 678",
    },
    displayName,
    documents: [],
    formValues: {
      displayName,
      partyType: "individual",
      primaryEmail: `${id}@example.com`,
      primaryPhone: "+855 12 345 678",
      roles: [role],
    },
    hasUsefulContact: true,
    hrefs: {
      addLease: "/leases?action=create",
      addTimelineEvent: "/timeline?action=create",
      documents: `/documents?personId=${id}`,
      ledger: `/ledger?query=${encodeURIComponent(displayName)}`,
      leases: `/leases?query=${encodeURIComponent(displayName)}`,
      people: `/people/${id}`,
      timeline: `/timeline?query=${encodeURIComponent(displayName)}`,
    },
    id,
    isArchived: false,
    linked: {
      activeLease: isTenant
        ? {
            endDate: "2027-06-30",
            href: "/leases?leaseId=lease-1",
            id: "lease-1",
            label: "Alice Tenant lease",
            ledgerHref: "/ledger?query=Alice",
            propertyId: "property-1",
            propertyLabel: "Riverside House",
            startDate: "2026-07-01",
            status: "active",
            timelineHref: "/timeline?query=Alice",
            unitId: "unit-1",
            unitLabel: "Unit 2A",
          }
        : undefined,
      activeLeaseCount: isTenant ? 1 : 0,
      activeLeases: [],
      ownerProperties: [],
      ownerProperty: isOwner
        ? {
            href: "/properties/property-1",
            id: "property-1",
            label: "Riverside House",
            ownershipLabel: "Primary owner",
          }
        : undefined,
      ownerPropertyCount: isOwner ? 1 : 0,
    },
    nextAction: {
      description: "Review the linked record.",
      href: "/people",
      label: "Review relationship",
      tone: "neutral",
    },
    partyType: "individual",
    partyTypeLabel: "Individual",
    recordCounts: {
      activity: 1,
      documents: 1,
      leases: isTenant ? 1 : 0,
      properties: isOwner ? 1 : 0,
      vendors: 0,
    },
    riskIndicators: [],
    roleLabel: role,
    roles: [{ role, status: "active" }],
    statusLabel: "Active",
    statusTone: "success",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
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
