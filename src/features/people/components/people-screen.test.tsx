/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OwnersPage from "@/app/(dashboard)/owners/page";
import PeoplePage from "@/app/(dashboard)/people/page";
import StaffPage from "@/app/(dashboard)/staff/page";
import TenantsPage from "@/app/(dashboard)/tenants/page";
import VendorsPage from "@/app/(dashboard)/vendors/page";
import { PeopleScreen } from "@/features/people/components/people-screen";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import { getPeopleInsights } from "@/features/people/people.insights";
import type {
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
  PeopleModulePage: ({ config }: { config: { role?: string; title: string } }) => (
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
  requireAdminContext: async () => ({ organizationId: "organization-1" }),
}));

const defaultViewQuery: PeopleViewQuery = {
  archiveState: "active",
  page: 1,
  pageSize: 50,
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
  vi.unstubAllGlobals();
});

describe("People route family redesign contract", () => {
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

  it("keeps the list workspace clean and reveals directory insight on demand", async () => {
    const user = userEvent.setup();
    const { container } = renderPeople();

    expect(container.querySelector('[data-slot="workspace-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="workspace-split-view"]')).toBeNull();
    const summary = screen.getByRole("region", { name: "People summary" });
    const overviewTrigger = within(summary).getByRole("button", {
      name: "Directory overview: 2 people, all clear",
    });
    expect(screen.queryByRole("dialog", { name: "People overview" })).toBeNull();
    await user.click(overviewTrigger);
    const overview = screen.getByRole("dialog", { name: "People overview" });
    expect(within(overview).getByRole("link", { name: "Reports" }).getAttribute("href")).toBe("/reports/people-readiness");
    expect(within(overview).getByText("Needs attention")).not.toBeNull();

    const lenses = screen.getByRole("navigation", { name: "People views" });
    expect(within(lenses).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "All",
      "Owners",
      "Staff",
      "Tenants",
      "Vendors",
      "Workspace Access",
    ]);
    expect(
      within(lenses)
        .getByRole("link", { name: "Workspace Access" })
        .getAttribute("href"),
    ).toBe("/users-roles");
    expect(within(lenses).getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");

    const table = screen.getByRole("table");
    expect(table.className).toContain("text-[13px]");
    expect(table.querySelector("thead")?.className).toContain("text-[11px]");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.every((row) => row.getAttribute("aria-selected") === null)).toBe(true);
    expect(
      within(rows[0]!).getByRole("link", { name: "Alice Tenant" }).getAttribute("href"),
    ).toBe("/people/person-1");
    expect(within(rows[0]!).getByText("Tenant")).not.toBeNull();
    expect(within(rows[0]!).getByText("Active")).not.toBeNull();
    expect(within(rows[0]!).getByText("1 active lease")).not.toBeNull();

    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it.each([
    ["/people", undefined, "All"],
    ["/owners", "owner", "Owners"],
    ["/staff", "staff", "Staff"],
    ["/tenants", "tenant", "Tenants"],
    ["/vendors", "vendor", "Vendors"],
  ] as const)(
    "marks exactly one local lens current for %s",
    (pathname, lockedRole, activeLabel) => {
      navigation.pathname = pathname;
      renderPeople({ lockedRole });

      const lenses = screen.getByRole("navigation", { name: "People views" });
      expect(within(lenses).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
      expect(within(lenses).getByRole("link", { name: activeLabel }).getAttribute("aria-current")).toBe("page");
    },
  );

  it.each([1024, 390])("uses direct record links instead of preview drawers at %ipx", (width) => {
    installMatchMedia(width);
    renderPeople();
    expect(screen.getAllByRole("link", { name: "Open record" })[0]?.getAttribute("href")).toBe("/people/person-1");
    expect(screen.queryByText("Preview")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("distinguishes filtered and true empty states and hides unauthorized creation", () => {
    const filtered = renderPeople({
      people: [],
      viewQuery: { ...defaultViewQuery, query: "missing" },
    });
    const filteredState = screen.getByText("No matching people").closest("section");
    expect(filteredState?.getAttribute("data-kind")).toBe("filtered");
    expect(within(filteredState!).getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/people");
    filtered.unmount();

    renderPeople({ canCreate: false, people: [] });
    expect(screen.getByText("No people yet")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "People summary" })).toBeNull();
    expect(document.querySelector('[data-empty-state-icon="true"]')?.className).toContain("size-14");
    expect(screen.queryByRole("button", { name: "Add person" })).toBeNull();
  });

  it("does not open action=create when creation is unauthorized", () => {
    navigation.searchParams = new URLSearchParams("action=create");
    renderPeople({ canCreate: false, people: [] });

    expect(screen.queryByRole("dialog", { name: "Add person" })).toBeNull();
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
      "/users-roles?personId=11111111-1111-4111-8111-111111111111",
    ],
  ] as const)(
    "shows a transient %s creation handoff without pushing the workspace",
    (role, actionLabel, href) => {
      vi.useFakeTimers();
      const rendered = renderPeople({
        lockedRole: role,
        people: [],
      });

      fireEvent.click(screen.getAllByRole("button", { name: `Add ${role}` })[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Complete person create" }));

      const feedback = document.querySelector<HTMLElement>(
        '[data-slot="transient-feedback"]',
      )!;
      expect(feedback.getAttribute("data-slot")).toBe("transient-feedback");
      expect(feedback.className).toContain("fixed");
      expect(within(feedback).getByRole("link", { name: actionLabel }).getAttribute("href")).toBe(
        href,
      );

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

      fireEvent.click(screen.getAllByRole("button", { name: "Add person" })[0]!);
      fireEvent.click(screen.getByRole("button", { name: "Complete person create" }));

      expect(screen.getByRole("link", { name: actionLabel })).not.toBeNull();
    },
  );

  it("uses truthful staff operating context in the table and cards", () => {
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
    expect(within(table).getByText("Coordinates maintenance dispatch")).not.toBeNull();
    expect(within(table).getByText("No operating context")).not.toBeNull();
    expect(screen.queryByText("Team context")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    const cards = screen.getAllByRole("article");
    expect(within(cards[0]!).getByText("Operating context")).not.toBeNull();
    expect(
      within(cards[0]!).getByText("Coordinates maintenance dispatch"),
    ).not.toBeNull();
    expect(within(cards[1]!).getByText("No operating context")).not.toBeNull();
  });

  it("shows all Workspace Access states and safe focus actions in staff table and cards", () => {
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
        role: "manager",
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
        role: "member",
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
        role: "member",
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
        role: "admin",
        scopeLabel: "All branches",
        state: "invitation_pending",
      },
    };

    renderPeople({ accessByPersonId, lockedRole: "staff", people: staff });

    const table = screen.getByRole("table");
    expect(within(table).getByText("Workspace Access")).not.toBeNull();
    const expectations = [
      ["No Access Staff", "No access", "Grant workspace access", "/users-roles?personId=staff-none"],
      ["Pending Staff", "Pending invitation", "Review invitation", "/users-roles?personId=staff-pending&invitationId=invitation-pending"],
      ["Failed Staff", "Invitation failed", "Review and resend", "/users-roles?personId=staff-failed&invitationId=invitation-failed"],
      ["Expired Staff", "Invitation expired", "Review invitation", "/users-roles?personId=staff-expired&invitationId=invitation-expired"],
      ["Active Staff", "Active access", "Manage workspace access", "/users-roles?personId=staff-active&memberId=membership-1"],
    ] as const;

    for (const [name, stateLabel, actionLabel, href] of expectations) {
      const row = within(table).getByRole("link", { name }).closest("tr");
      expect(row).not.toBeNull();
      expect(within(row!).getByText(stateLabel)).not.toBeNull();
      expect(
        within(row!).getByRole("link", { name: `${actionLabel} for ${name}` }).getAttribute("href"),
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

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    for (const [name, stateLabel, actionLabel, href] of expectations) {
      const card = screen
        .getAllByRole("article")
        .find((item) => within(item).queryByRole("link", { name }));
      expect(card).toBeDefined();
      expect(within(card!).getByText(stateLabel)).not.toBeNull();
      expect(
        within(card!).getByRole("link", { name: `${actionLabel} for ${name}` }).getAttribute("href"),
      ).toBe(href);
    }
  });

  it("does not infer no-access or offer actions for missing, inactive, or archived Staff status", () => {
    const missing = makePerson("staff-missing", "Missing Status Staff", "staff");
    const inactive = {
      ...makePerson("staff-inactive", "Inactive Staff", "staff"),
      roles: [{ role: "staff" as const, status: "inactive" as const }],
    };
    const archived = {
      ...makePerson("staff-archived", "Archived Staff", "staff"),
      isArchived: true,
    };

    renderPeople({ lockedRole: "staff", people: [missing, inactive, archived] });

    const table = screen.getByRole("table");
    for (const name of ["Missing Status Staff", "Inactive Staff", "Archived Staff"]) {
      const row = within(table).getByRole("link", { name }).closest("tr");
      expect(within(row!).getByText("Workspace access unavailable")).not.toBeNull();
      expect(within(row!).queryByRole("link", { name: /workspace access/i })).toBeNull();
    }

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    const missingCard = screen
      .getAllByRole("article")
      .find((card) => within(card).queryByRole("link", { name: "Missing Status Staff" }));
    expect(within(missingCard!).getByText("Workspace access unavailable")).not.toBeNull();
    expect(
      within(missingCard!).queryByRole("link", { name: /workspace access/i }),
    ).toBeNull();
  });
});

function renderPeople({
  accessByPersonId,
  canCreate = true,
  lockedRole,
  people: nextPeople = people,
  viewQuery = defaultViewQuery,
}: {
  accessByPersonId?: Record<string, OrganizationPersonAccessStatus>;
  canCreate?: boolean;
  lockedRole?: PersonRoleValue;
  people?: PeopleSummary[];
  viewQuery?: PeopleViewQuery;
} = {}) {
  return render(
    <PeopleScreen
      accessByPersonId={accessByPersonId}
      addButtonLabel={lockedRole ? `Add ${lockedRole}` : "Add person"}
      canCreate={canCreate}
      createRole={lockedRole}
      insights={getPeopleInsights(nextPeople, nextPeople.length)}
      lockedRole={lockedRole}
      pagination={{
        from: nextPeople.length > 0 ? 1 : 0,
        page: 1,
        pageSize: 50,
        to: nextPeople.length,
        totalCount: nextPeople.length,
        totalPages: nextPeople.length > 0 ? 1 : 0,
      }}
      people={nextPeople}
      viewQuery={viewQuery}
    />,
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
