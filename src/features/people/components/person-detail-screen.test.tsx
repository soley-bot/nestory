/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonDetailScreen } from "@/features/people/components/person-detail-screen";
import PersonNotFound from "@/app/(dashboard)/people/[personId]/not-found";
import type { OrganizationPersonAccessStatus } from "@/features/organization/data";
import type { PeopleSummary } from "@/features/people/people.types";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PersonDetailScreen", () => {
  it("keeps the person record focused on overview and related work", () => {
    render(<PersonDetailScreen person={person} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Dara Tenant" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Dara Tenant" }),
    ).toBeNull();
    expect(screen.getByText("Active", { selector: "span" })).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Review relationship" }),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "People" }).getAttribute("href"),
    ).toBe("/people");

    const navigation = screen.getByRole("navigation", {
      name: "Person record sections",
    });
    expect(
      within(navigation)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Overview", "Related"]);
    expect(
      within(navigation)
        .getByRole("tab", { name: "Overview" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      within(navigation).queryByRole("tab", { name: "Photos" }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole("tab", { name: "Documents" }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole("tab", { name: "Timeline" }),
    ).toBeNull();
    fireEvent.click(within(navigation).getByRole("tab", { name: "Related" }));
    expect(
      within(navigation)
        .getByRole("tab", { name: "Related" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("heading", { name: "Linked records" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Related evidence" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Recent activity" }),
    ).toBeTruthy();
  });

  it("keeps staff-only records focused on contact and workspace access", () => {
    const staffPerson: PeopleSummary = {
      ...person,
      displayName: "Mara Sovan",
      riskIndicators: [
        {
          description:
            "No related lease, property, or unit documents are attached yet.",
          id: "documents",
          label: "Evidence missing",
          tone: "warning",
        },
      ],
      roleLabel: "Staff",
      roles: [{ role: "staff", status: "active" }],
    };

    render(
      <PersonDetailScreen
        accessStatus={{ primaryAction: "grant_access", state: "no_access" }}
        person={staffPerson}
      />,
    );

    expect(
      screen.getByRole("link", { name: "People" }).getAttribute("href"),
    ).toBe("/people");
    expect(
      screen.queryByRole("navigation", { name: "Person record sections" }),
    ).toBeNull();
    expect(screen.queryByText("Evidence missing")).toBeNull();
    expect(screen.queryByText("Linked", { selector: "dt" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Workspace Access" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Grant workspace access for Mara Sovan",
      }),
    ).toBeTruthy();
  });

  it("uses uncontained tabs and mounts only the selected panel", () => {
    const { container } = render(<PersonDetailScreen person={person} />);
    const navigation = screen.getByRole("navigation", {
      name: "Person record sections",
    });

    expect(navigation.getAttribute("data-slot")).toBe("person-record-tabs");
    expect(navigation.className).not.toMatch(/(?:^|\s)rounded(?:-|\s|$)/);
    expect(navigation.className).not.toMatch(/(?:^|\s)border(?:-|\s|$)/);
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(screen.getByRole("tabpanel").id).toBe("person-overview");
    expect(
      within(navigation)
        .getByRole("tab", { name: "Overview" })
        .getAttribute("aria-controls"),
    ).toBe("person-overview");
    expect(
      within(navigation)
        .getByRole("tab", { name: "Related" })
        .getAttribute("aria-controls"),
    ).toBeNull();

    fireEvent.click(within(navigation).getByRole("tab", { name: "Related" }));

    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(screen.getByRole("tabpanel").id).toBe("person-related");
    expect(
      within(navigation)
        .getByRole("tab", { name: "Overview" })
        .getAttribute("aria-controls"),
    ).toBeNull();
    expect(
      within(navigation)
        .getByRole("tab", { name: "Related" })
        .getAttribute("aria-controls"),
    ).toBe("person-related");
  });

  it("flattens linked-record groups and rows while keeping their destinations", () => {
    const linkedPerson: PeopleSummary = {
      ...person,
      linked: {
        ...person.linked,
        activeLeases: [person.linked.activeLease!],
        ownerProperties: [
          {
            href: "/properties/property-1",
            id: "property-1",
            label: "Central Residence",
            ownershipLabel: "Primary owner",
          },
        ],
      },
    };
    const { container } = render(<PersonDetailScreen person={linkedPerson} />);

    fireEvent.click(screen.getByRole("tab", { name: "Related" }));

    const groups = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="linked-group"]'),
    );
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-slot="linked-record-row"]',
      ),
    );
    expect(groups).toHaveLength(3);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const element of [...groups, ...rows]) {
      expect(element.className).not.toMatch(/(?:^|\s)rounded(?:-|\s|$)/);
      expect(element.className).not.toMatch(/(?:^|\s)border(?:-|\s|$)/);
    }
    expect(
      screen.getByRole("link", { name: /Unit 2A/i }).getAttribute("href"),
    ).toBe("/leases?leaseId=lease-1");
    expect(
      screen
        .getByRole("link", { name: /Central Residence Primary owner/i })
        .getAttribute("href"),
    ).toBe("/properties/property-1");
  });

  it("gives an unknown person ID a safe recovery path", () => {
    render(<PersonNotFound />);

    expect(
      screen.getByRole("heading", { name: "Person not found" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to people" }).getAttribute("href"),
    ).toBe("/people");
  });

  it("keeps role checkboxes available when editing a single-role person", () => {
    render(<PersonDetailScreen person={person} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog", { name: "Edit person" });
    expect(dialog.style.width).toBe("720px");
    expect(
      screen
        .getByRole("checkbox", { name: "Tenant" })
        .getAttribute("data-state"),
    ).toBe("checked");
    expect(
      screen
        .getByRole("checkbox", { name: "Owner" })
        .getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      screen
        .getByRole("checkbox", { name: "Vendor" })
        .getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      screen
        .getByRole("checkbox", { name: "Staff" })
        .getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it("routes a blocked tenant to the lease instead of retrying an impossible archive", () => {
    render(<PersonDetailScreen person={person} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    const drawer = screen.getByRole("dialog", { name: "Archive Dara Tenant?" });
    expect(drawer.className).toContain("sm:max-w-md");
    expect(
      within(drawer).getByText(
        /open Lease roles must be ended or cancelled through a checked relationship transition first/i,
      ),
    ).toBeTruthy();
    expect(
      within(drawer)
        .getByRole("link", { name: "Open blocking lease" })
        .getAttribute("href"),
    ).toBe("/leases/lease-1");
    expect(
      within(drawer).queryByRole("button", { name: "Archive person" }),
    ).toBeNull();
  });

  it("keeps archive available when no lease relationship blocks it", () => {
    const unlinkedPerson: PeopleSummary = {
      ...person,
      linked: {
        activeLeaseCount: 0,
        activeLeases: [],
        ownerProperties: [],
        ownerPropertyCount: 0,
      },
      recordCounts: { ...person.recordCounts, leases: 0 },
    };
    render(<PersonDetailScreen person={unlinkedPerson} />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    const drawer = screen.getByRole("dialog", { name: "Archive Dara Tenant?" });
    expect(
      within(drawer).getByRole("button", { name: "Archive person" }),
    ).toBeTruthy();
    expect(
      within(drawer).queryByRole("link", { name: "Open blocking lease" }),
    ).toBeNull();
  });

  it("keeps history secondary in More", () => {
    render(<PersonDetailScreen person={person} />);

    expect(
      screen.queryByRole("link", { name: "Review relationship" }),
    ).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }));

    expect(
      screen
        .getByRole("menuitem", { name: "View history" })
        .getAttribute("href"),
    ).toBe("/timeline?query=Dara%20Tenant");
  });

  it.each([
    [
      { primaryAction: "grant_access", state: "no_access" },
      "No access",
      "Grant workspace access",
      "/settings/access?personId=person-1",
    ],
    [
      {
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
      "Pending invitation",
      "Review invitation",
      "/settings/access?personId=person-1&invitationId=invitation-pending",
    ],
    [
      {
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
      "Invitation failed",
      "Review and resend",
      "/settings/access?personId=person-1&invitationId=invitation-failed",
    ],
    [
      {
        branchId: null,
        email: "expired@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        invitationId: "invitation-expired",
        lastSentAt: null,
        primaryAction: "review_invitation",
        role: "operations_member",
        scopeLabel: "All branches",
        state: "expired",
      },
      "Invitation expired",
      "Review invitation",
      "/settings/access?personId=person-1&invitationId=invitation-expired",
    ],
    [
      {
        branchId: "branch-1",
        email: "active@example.com",
        membershipId: "membership-1",
        primaryAction: "manage_access",
        role: "operations_manager",
        scopeLabel: "Central Office",
        state: "active_workspace_access",
      },
      "Active access",
      "Manage workspace access",
      "/settings/access?personId=person-1&memberId=membership-1",
    ],
  ] as Array<[OrganizationPersonAccessStatus, string, string, string]>)(
    "shows the %s Staff access state with a safe focus action",
    (accessStatus, stateLabel, actionLabel, href) => {
      const staffPerson = {
        ...person,
        roleLabel: "Staff / Tenant",
        roles: [
          { role: "tenant" as const, status: "active" as const },
          { role: "staff" as const, status: "active" as const },
        ],
      };
      render(
        <PersonDetailScreen accessStatus={accessStatus} person={staffPerson} />,
      );

      expect(
        screen.getByRole("heading", { name: "Workspace Access" }),
      ).toBeTruthy();
      expect(
        screen.getByText(
          "Staff records describe operational people. Workspace Access controls who can sign in.",
        ),
      ).toBeTruthy();
      expect(screen.getByText(stateLabel)).toBeTruthy();
      const action = screen.getByRole("link", {
        name: `${actionLabel} for ${staffPerson.displayName}`,
      });
      expect(action.getAttribute("href")).toBe(href);
      expect(action.getAttribute("href")).not.toContain("email=");
    },
  );

  it.each([
    ["non-staff", person],
    [
      "inactive staff",
      {
        ...person,
        roles: [{ role: "staff" as const, status: "inactive" as const }],
      },
    ],
    [
      "archived staff",
      {
        ...person,
        isArchived: true,
        roles: [{ role: "staff" as const, status: "active" as const }],
      },
    ],
  ])("does not offer Workspace Access for %s records", (_label, nextPerson) => {
    render(
      <PersonDetailScreen
        accessStatus={{ primaryAction: "grant_access", state: "no_access" }}
        person={nextPerson}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Workspace Access" }),
    ).toBeNull();
  });
});

const person: PeopleSummary = {
  activity: [],
  contact: {
    email: "dara@example.com",
    label: "dara@example.com / +855 12 345 678",
    phone: "+855 12 345 678",
  },
  displayName: "Dara Tenant",
  documents: [],
  formValues: {
    displayName: "Dara Tenant",
    partyType: "individual",
    primaryEmail: "dara@example.com",
    primaryPhone: "+855 12 345 678",
    roles: ["tenant"],
  },
  hasUsefulContact: true,
  hrefs: {
    addLease: "/leases?action=create",
    addTimelineEvent: "/timeline?action=create",
    documents: "/documents?personId=person-1",
    ledger: "/ledger?query=Dara%20Tenant",
    leases: "/leases?query=Dara%20Tenant",
    people: "/people/person-1",
    timeline: "/timeline?query=Dara%20Tenant",
  },
  id: "person-1",
  isArchived: false,
  linked: {
    activeLease: {
      endDate: "2027-06-30",
      href: "/leases?leaseId=lease-1",
      id: "lease-1",
      label: "Dara Tenant lease",
      ledgerHref: "/ledger?query=Dara%20Tenant",
      propertyId: "property-1",
      propertyLabel: "Central Residence",
      startDate: "2026-07-01",
      status: "active",
      timelineHref: "/timeline?query=Dara%20Tenant",
      unitId: "unit-1",
      unitLabel: "Unit 2A",
    },
    activeLeaseCount: 1,
    activeLeases: [],
    ownerProperties: [],
    ownerPropertyCount: 0,
  },
  nextAction: {
    description: "Open the current lease relationship.",
    href: "/leases?leaseId=lease-1",
    label: "Review relationship",
    tone: "neutral",
  },
  partyType: "individual",
  partyTypeLabel: "Individual",
  recordCounts: {
    activity: 0,
    documents: 0,
    leases: 1,
    properties: 0,
    vendors: 0,
  },
  riskIndicators: [],
  roleLabel: "Tenant",
  roles: [{ role: "tenant", status: "active" }],
  statusLabel: "Active",
  statusTone: "success",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}
