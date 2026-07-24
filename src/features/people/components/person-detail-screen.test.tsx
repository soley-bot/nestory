/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("uses the linked-record detail rhythm without repeating identity", () => {
    render(<PersonDetailScreen person={person} />);

    expect(screen.getByRole("heading", { level: 1, name: "Dara Tenant" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Dara Tenant" })).toBeNull();
    expect(screen.getByText("Active", { selector: "span" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Review relationship" }).getAttribute("href"),
    ).toBe("/leases?leaseId=lease-1");
    expect(screen.getByRole("link", { name: "Tenants" }).getAttribute("href")).toBe(
      "/tenants",
    );

    const navigation = screen.getByRole("navigation", {
      name: "Person record sections",
    });
    expect(within(navigation).getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(navigation).getByRole("tab", { name: "Links" }));
    expect(within(navigation).getByRole("tab", { name: "Links" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Linked records" })).toBeTruthy();
  });

  it("gives an unknown person ID a safe recovery path", () => {
    render(<PersonNotFound />);

    expect(screen.getByRole("heading", { name: "Person not found" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to people" }).getAttribute("href")).toBe(
      "/people",
    );
  });

  it("keeps role checkboxes available when editing a single-role person", () => {
    render(<PersonDetailScreen person={person} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByRole("checkbox", { name: "Tenant" }).getAttribute("data-state"),
    ).toBe("checked");
    expect(
      screen.getByRole("checkbox", { name: "Owner" }).getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      screen.getByRole("checkbox", { name: "Vendor" }).getAttribute("data-state"),
    ).toBe("unchecked");
    expect(
      screen.getByRole("checkbox", { name: "Staff" }).getAttribute("data-state"),
    ).toBe("unchecked");
  });

  it.each([
    [
      { primaryAction: "grant_access", state: "no_access" },
      "No access",
      "Grant workspace access",
      "/users-roles?personId=person-1",
    ],
    [
      {
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
      "Pending invitation",
      "Review invitation",
      "/users-roles?personId=person-1&invitationId=invitation-pending",
    ],
    [
      {
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
      "Invitation failed",
      "Review and resend",
      "/users-roles?personId=person-1&invitationId=invitation-failed",
    ],
    [
      {
        branchId: null,
        email: "expired@example.com",
        expiresAt: "2026-07-20T00:00:00.000Z",
        invitationId: "invitation-expired",
        lastSentAt: null,
        primaryAction: "review_invitation",
        role: "member",
        scopeLabel: "All branches",
        state: "expired",
      },
      "Invitation expired",
      "Review invitation",
      "/users-roles?personId=person-1&invitationId=invitation-expired",
    ],
    [
      {
        branchId: "branch-1",
        email: "active@example.com",
        membershipId: "membership-1",
        primaryAction: "manage_access",
        role: "manager",
        scopeLabel: "Central Office",
        state: "active_workspace_access",
      },
      "Active access",
      "Manage workspace access",
      "/users-roles?personId=person-1&memberId=membership-1",
    ],
  ] as Array<[OrganizationPersonAccessStatus, string, string, string]>) (
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
      render(<PersonDetailScreen accessStatus={accessStatus} person={staffPerson} />);

      expect(screen.getByRole("heading", { name: "Workspace Access" })).toBeTruthy();
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
      { ...person, roles: [{ role: "staff" as const, status: "inactive" as const }] },
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

    expect(screen.queryByRole("heading", { name: "Workspace Access" })).toBeNull();
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
