import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEOPLE_ARCHIVE_STATE,
  DEFAULT_PEOPLE_PAGE_SIZE,
  DEFAULT_PEOPLE_SORT,
  parsePeopleSearchParams,
} from "@/features/people/people.filters";
import { personMatchesStatusFilter } from "@/features/people/data/people";
import type { PeopleSummary } from "@/features/people/people.types";

describe("parsePeopleSearchParams", () => {
  it("normalizes default people filters", () => {
    expect(parsePeopleSearchParams({})).toEqual({
      archiveState: DEFAULT_PEOPLE_ARCHIVE_STATE,
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
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
        query: "  tenant owner vendor  ",
        role: "tenant",
        status: "missing_contact",
        sort: "updated_desc",
      }),
    ).toEqual({
      archiveState: "all",
      page: 3,
      pageSize: 100,
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
        role: "manager",
        sort: "random",
        status: "draft",
      }),
    ).toMatchObject({
      page: 1,
      pageSize: DEFAULT_PEOPLE_PAGE_SIZE,
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

function buildPersonSummary(
  overrides: Partial<PeopleSummary> = {},
): PeopleSummary {
  return {
    contact: { email: null, label: "No contact", phone: null },
    displayName: "Dara Person",
    formValues: {
      displayName: "Dara Person",
      partyType: "individual",
      roles: [],
    },
    hasUsefulContact: false,
    id: "person-1",
    isArchived: false,
    linked: {
      activeLeaseCount: 0,
      ownerPropertyCount: 0,
    },
    partyType: "individual",
    partyTypeLabel: "Individual",
    roles: [],
    roleLabel: "No role",
    statusLabel: "No role",
    statusTone: "warning",
    updatedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}
