import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEOPLE_ARCHIVE_STATE,
  DEFAULT_PEOPLE_PAGE_SIZE,
  DEFAULT_PEOPLE_SORT,
  parsePeopleSearchParams,
} from "@/features/people/people.filters";
import {
  buildPeopleSummary,
  canUsePagedPeopleBaseQuery,
  personMatchesStatusFilter,
} from "@/features/people/data/people";
import type { PeopleSummary } from "@/features/people/people.types";

describe("parsePeopleSearchParams", () => {
  it("normalizes default people filters", () => {
    expect(parsePeopleSearchParams({})).toEqual({
      archiveState: DEFAULT_PEOPLE_ARCHIVE_STATE,
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
      personId: null,
      query: "",
      role: "all",
      sort: DEFAULT_PEOPLE_SORT,
      status: "all",
    });
  });

  it("keeps valid filters and clamps unsafe values", () => {
    expect(
      parsePeopleSearchParams({
        archiveState: "all",
        page: "3",
        pageSize: "100",
        personId: "33333333-3333-4333-8333-333333333333",
        query: "  tenant owner vendor  ",
        role: "tenant",
        status: "missing_contact",
        sort: "updated_desc",
      }),
    ).toEqual({
      archiveState: "all",
      page: 3,
      pageSize: 100,
      personId: "33333333-3333-4333-8333-333333333333",
      query: "tenant owner vendor",
      role: "tenant",
      status: "missing_contact",
      sort: "updated_desc",
    });
  });

  it("falls back for unknown role, status, sort, and page size", () => {
    expect(
      parsePeopleSearchParams({
        page: "-1",
        pageSize: "999",
        personId: "not-a-uuid",
        role: "manager",
        sort: "random",
        status: "draft",
      }),
    ).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
      personId: null,
      role: "all",
      sort: DEFAULT_PEOPLE_SORT,
      status: "all",
    });
  });
});

describe("personMatchesStatusFilter", () => {
  it("matches people missing useful email or phone contact", () => {
    expect(
      personMatchesStatusFilter(
        buildPersonSummary({ hasUsefulContact: false }),
        "missing_contact",
      ),
    ).toBe(true);
    expect(
      personMatchesStatusFilter(
        buildPersonSummary({ hasUsefulContact: true }),
        "missing_contact",
      ),
    ).toBe(false);
  });

  it("keeps existing no-role behavior", () => {
    expect(
      personMatchesStatusFilter(buildPersonSummary({ roles: [] }), "no_role"),
    ).toBe(true);
    expect(
      personMatchesStatusFilter(
        buildPersonSummary({
          roles: [{ role: "owner", status: "active" }],
        }),
        "no_role",
      ),
    ).toBe(false);
  });
});

describe("canUsePagedPeopleBaseQuery", () => {
  it("uses the database-paged path for default people views", () => {
    expect(canUsePagedPeopleBaseQuery(parsePeopleSearchParams({}))).toBe(true);
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({ page: "3", sort: "updated_desc" }),
      ),
    ).toBe(true);
  });

  it("uses the database-paged path for role and status filters", () => {
    expect(
      canUsePagedPeopleBaseQuery(parsePeopleSearchParams({ role: "tenant" })),
    ).toBe(true);
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({ status: "missing_contact" }),
      ),
    ).toBe(true);
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({ status: "no_role" }),
      ),
    ).toBe(true);
  });

  it("keeps query views off the base-row pager", () => {
    expect(
      canUsePagedPeopleBaseQuery(parsePeopleSearchParams({ query: "central" })),
    ).toBe(false);
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({ sort: "updated_desc" }),
      ),
    ).toBe(true);
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({ archiveState: "all" }),
      ),
    ).toBe(true);
  });

  it("keeps focused person links on the database-paged path", () => {
    expect(
      canUsePagedPeopleBaseQuery(
        parsePeopleSearchParams({
          personId: "33333333-3333-4333-8333-333333333333",
          query: "central",
        }),
      ),
    ).toBe(true);
  });
});

describe("buildPeopleSummary", () => {
  it("builds operational links, counts, risk, and next action context", () => {
    const summary = buildPeopleSummary({
      activity: [
        {
          action: "updated",
          actionLabel: "Updated",
          createdAt: "2026-06-18T00:00:00.000Z",
          details: [],
          entityLabel: "Person",
          href: "/people?personId=person-1",
          id: "activity-1",
          recordLabel: "Dara Person",
          tone: "neutral",
        },
      ],
      contacts: [
        {
          archivedAt: null,
          contactName: null,
          contactType: "billing",
          email: "dara@example.com",
          id: "contact-1",
          isPrimary: true,
          personId: "person-1",
          phone: null,
        },
      ],
      documents: [
        {
          category: "agreement",
          fileName: "lease.pdf",
          id: "document-1",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          uploadedAt: "2026-02-01T00:00:00.000Z",
          url: "https://example.com/lease.pdf",
        },
      ],
      leaseParties: [
        {
          archivedAt: null,
          endedOn: null,
          id: "party-1",
          isPrimary: true,
          leaseId: "lease-1",
          partyRole: "primary_tenant",
          personId: "person-1",
        },
      ],
      leasesById: new Map([
        [
          "lease-1",
          {
            archivedAt: null,
            endDate: "2027-01-31",
            id: "lease-1",
            propertyId: "property-1",
            startDate: "2026-02-01",
            status: "active",
            tenantName: "Dara Person",
            unitId: "unit-1",
          },
        ],
      ]),
      person: {
        archivedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        displayName: "Dara Person",
        id: "person-1",
        legalName: "Dara Person Legal",
        notes: "Prefers email",
        partyType: "individual",
        primaryEmail: null,
        primaryPhone: null,
        taxIdentifier: null,
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
      propertiesById: new Map([
        [
          "property-1",
          {
            code: "CR",
            id: "property-1",
            name: "Central Residence",
          },
        ],
      ]),
      propertyOwners: [
        {
          archivedAt: null,
          endedOn: null,
          id: "owner-1",
          isPrimary: true,
          ownershipLabel: "Primary",
          personId: "person-1",
          propertyId: "property-1",
        },
      ],
      roles: [
        {
          archivedAt: null,
          id: "role-1",
          personId: "person-1",
          role: "tenant",
          status: "active",
        },
      ],
      unitsById: new Map([
        [
          "unit-1",
          {
            id: "unit-1",
            propertyId: "property-1",
            unitNumber: "12A",
          },
        ],
      ]),
      vendorProfiles: [],
    });

    expect(summary.contact.label).toBe("dara@example.com");
    expect(summary.hrefs.addLease).toBe(
      "/leases?action=create&tenantPersonId=person-1",
    );
    expect(summary.hrefs.addTimelineEvent).toBe(
      "/timeline?action=create&propertyId=property-1&query=Dara+Person&unitId=unit-1",
    );
    expect(summary.linked.activeLeases[0]).toMatchObject({
      href: "/leases?archiveState=all&leaseId=lease-1&query=Dara+Person",
      ledgerHref:
        "/ledger?propertyId=property-1&query=Dara+Person&unitId=unit-1",
      propertyLabel: "CR / Central Residence",
      unitLabel: "Unit 12A",
    });
    expect(summary.linked.ownerProperties[0]).toMatchObject({
      href: "/properties/property-1",
      label: "CR / Central Residence",
    });
    expect(summary.recordCounts).toEqual({
      activity: 1,
      documents: 1,
      leases: 1,
      properties: 1,
      vendors: 0,
    });
    expect(summary.riskIndicators.map((risk) => risk.id)).toEqual([
      "status",
      "role",
      "contact",
      "links",
      "documents",
    ]);
    expect(summary.nextAction).toMatchObject({
      href: "/leases?archiveState=all&query=Dara+Person",
      label: "Review linked work",
    });
  });
});

function buildPersonSummary(
  overrides: Partial<PeopleSummary> = {},
): PeopleSummary {
  return {
    activity: [],
    contact: { email: null, label: "No contact", phone: null },
    displayName: "Dara Person",
    documents: [],
    formValues: {
      displayName: "Dara Person",
      partyType: "individual",
      roles: [],
    },
    hasUsefulContact: false,
    hrefs: {
      addLease: "/leases?action=create&tenantPersonId=person-1",
      addTimelineEvent: "/timeline?action=create&query=Dara+Person",
      documents: "/documents?query=Dara+Person",
      ledger: "/ledger?query=Dara+Person",
      leases: "/leases?archiveState=all&query=Dara+Person",
      people: "/people?archiveState=all&personId=person-1&query=Dara+Person",
      timeline: "/timeline?archiveState=all&query=Dara+Person",
    },
    id: "person-1",
    isArchived: false,
    linked: {
      activeLeaseCount: 0,
      activeLeases: [],
      ownerPropertyCount: 0,
      ownerProperties: [],
    },
    nextAction: {
      description: "Assign tenant, owner, or vendor before linking work.",
      href: "/people?personId=person-1",
      label: "Assign role",
      tone: "warning",
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
    roles: [],
    roleLabel: "No role",
    statusLabel: "No role",
    statusTone: "warning",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}
