import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessByPersonId } from "@/features/organization/data";
import { getPeopleScreenData } from "@/features/people/data/people";
import { getPeopleReadinessReport } from "@/features/people/data/people-readiness";
import type { PeopleSummary } from "@/features/people/people.types";

vi.mock("@/features/organization/data", () => ({
  getAccessByPersonId: vi.fn(),
}));

vi.mock("@/features/people/data/people", () => ({
  getPeopleScreenData: vi.fn(),
}));

describe("getPeopleReadinessReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads every organization-scoped row instead of truncating at the old 100-row window", async () => {
    const people = Array.from({ length: 101 }, (_, index) =>
      staffPerson(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    );
    vi.mocked(getPeopleScreenData)
      .mockResolvedValueOnce({
        pagination: {
          from: 1,
          page: 1,
          pageSize: 100,
          to: 100,
          totalCount: 101,
          totalPages: 2,
        },
        people: people.slice(0, 100),
      })
      .mockResolvedValueOnce({
        pagination: {
          from: 101,
          page: 2,
          pageSize: 100,
          to: 101,
          totalCount: 101,
          totalPages: 2,
        },
        people: people.slice(100),
      });
    vi.mocked(getAccessByPersonId).mockResolvedValue(
      Object.fromEntries(
        people.map((person) => [
          person.id,
          { primaryAction: "grant_access", state: "no_access" },
        ]),
      ),
    );

    const report = await getPeopleReadinessReport({
      archiveState: "active",
      organizationId: "organization-1",
      view: "staff",
    });

    expect(report.rows.map((row) => row.id)).toEqual(
      people.map((person) => person.id),
    );
    expect(report.totalRowCount).toBe(101);
    expect(getPeopleScreenData).toHaveBeenNthCalledWith(
      1,
      "organization-1",
      expect.objectContaining({
        archiveState: "active",
        page: 1,
        pageSize: 100,
        role: "staff",
      }),
    );
    expect(getPeopleScreenData).toHaveBeenNthCalledWith(
      2,
      "organization-1",
      expect.objectContaining({
        archiveState: "active",
        page: 2,
        pageSize: 100,
        role: "staff",
      }),
    );
    expect(getAccessByPersonId).toHaveBeenCalledWith(
      "organization-1",
      people.map((person) => person.id),
    );
  });

  it("preserves archived scope at the authoritative organization loader", async () => {
    const archivedOwner = staffPerson(
      "00000000-0000-4000-8000-000000000201",
    );
    archivedOwner.isArchived = true;
    archivedOwner.roles = [{ role: "owner", status: "active" }];
    archivedOwner.formValues.roles = ["owner"];
    archivedOwner.roleLabel = "Owner";

    vi.mocked(getPeopleScreenData).mockResolvedValueOnce({
      pagination: {
        from: 1,
        page: 1,
        pageSize: 100,
        to: 1,
        totalCount: 1,
        totalPages: 1,
      },
      people: [archivedOwner],
    });
    vi.mocked(getAccessByPersonId).mockResolvedValue({});

    const report = await getPeopleReadinessReport({
      archiveState: "archived",
      organizationId: "organization-archived",
      view: "owner",
    });

    expect(getPeopleScreenData).toHaveBeenCalledWith(
      "organization-archived",
      expect.objectContaining({
        archiveState: "archived",
        role: "owner",
      }),
    );
    expect(getAccessByPersonId).toHaveBeenCalledWith(
      "organization-archived",
      [],
    );
    expect(report.rows.map((row) => row.id)).toEqual([archivedOwner.id]);
    expect(report.rows[0]?.cells.readiness).toBe("Archived");
  });
});

function staffPerson(id: string): PeopleSummary {
  return {
    activity: [],
    contact: {
      email: `${id}@example.com`,
      label: `${id}@example.com`,
      phone: null,
    },
    displayName: `Staff ${id}`,
    documents: [],
    formValues: {
      displayName: `Staff ${id}`,
      partyType: "individual",
      roles: ["staff"],
    },
    hasUsefulContact: true,
    hrefs: {
      addLease: `/leases?action=create&tenantPersonId=${id}`,
      addTimelineEvent: "/timeline?action=create",
      documents: "/documents",
      ledger: "/ledger",
      leases: "/leases",
      people: `/people/${id}`,
      timeline: "/timeline",
    },
    id,
    isArchived: false,
    linked: {
      activeLeaseCount: 0,
      activeLeases: [],
      ownerProperties: [],
      ownerPropertyCount: 0,
    },
    nextAction: {
      description: "Review staff profile.",
      href: `/people/${id}`,
      label: "Review staff profile",
      tone: "neutral",
    },
    partyType: "individual",
    partyTypeLabel: "Individual",
    recordCounts: {
      activity: 0,
      documents: 0,
      leases: 0,
      properties: 0,
      vendors: 0,
    },
    riskIndicators: [],
    roleLabel: "Staff",
    roles: [{ role: "staff", status: "active" }],
    statusLabel: "Active",
    statusTone: "success",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}
