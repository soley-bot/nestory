import { describe, expect, it } from "vitest";
import { buildPersonSelectOptions } from "@/features/people/person-select";

describe("buildPersonSelectOptions", () => {
  it("filters by active role membership and deduplicates multi-role people", () => {
    const options = buildPersonSelectOptions({
      people: [
        {
          archived_at: null,
          display_name: "Alex Person",
          id: "person-1",
          primary_email: "alex@example.com",
          primary_phone: null,
        },
        {
          archived_at: null,
          display_name: "Vendor Only",
          id: "person-2",
          primary_email: null,
          primary_phone: "+855 12 345 678",
        },
      ],
      requestedRoles: ["owner", "tenant"],
      roles: [
        {
          archived_at: null,
          person_id: "person-1",
          role: "owner",
          status: "active",
        },
        {
          archived_at: null,
          person_id: "person-1",
          role: "tenant",
          status: "active",
        },
        {
          archived_at: null,
          person_id: "person-2",
          role: "vendor",
          status: "active",
        },
      ],
    });

    expect(options).toEqual([
      expect.objectContaining({
        description: "Owner, Tenant · alex@example.com",
        id: "person-1",
        roles: ["owner", "tenant"],
      }),
    ]);
  });

  it("excludes archived people unless historical options are requested", () => {
    const people = [
      {
        archived_at: "2026-07-01T00:00:00Z",
        display_name: "Archived Owner",
        id: "person-1",
        primary_email: null,
        primary_phone: null,
      },
    ];
    const roles = [
      {
        archived_at: null,
        person_id: "person-1",
        role: "owner",
        status: "active",
      },
    ];

    expect(
      buildPersonSelectOptions({ people, requestedRoles: ["owner"], roles }),
    ).toEqual([]);
    expect(
      buildPersonSelectOptions({
        includeArchived: true,
        people,
        requestedRoles: ["owner"],
        roles,
      }),
    ).toHaveLength(1);
  });
});
