/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PersonDetailScreen } from "@/features/people/components/person-detail-screen";
import PersonNotFound from "@/app/(dashboard)/people/[personId]/not-found";
import type { PeopleSummary } from "@/features/people/people.types";

afterEach(cleanup);

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
