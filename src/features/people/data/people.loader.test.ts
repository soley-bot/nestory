import { describe, expect, it, vi } from "vitest";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getPeopleScreenData", () => {
  it.each([undefined, "25", "50", "100"])("bounds the People register and linked lookups for pageSize=%s", async (pageSize) => {
    const fixture = pagedPeopleClient(61);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const result = await getPeopleScreenData(
      "org-1", parsePeopleSearchParams({ pageSize }),
    );
    const expectedSize = pageSize ? Number(pageSize) : 10;

    expect(fixture.ranges).toEqual([[0, expectedSize - 1]]);
    expect(result.people).toHaveLength(Math.min(expectedSize, 61));
    expect(result.people.some(person => person.id === "other-org-person")).toBe(false);
    expect(result.pagination).toMatchObject({
      page: 1, pageSize: expectedSize, totalCount: 61, totalPages: Math.ceil(61 / expectedSize),
    });
    expect(fixture.scopes.every(scope => scope === "org-1")).toBe(true);
    expect(fixture.personIdFilters.length).toBeGreaterThan(0);
    expect(fixture.personIdFilters.every(ids =>
      ids.length === result.people.length &&
      ids.every(id => result.people.some(person => person.id === id)),
    )).toBe(true);
  });

  it("clamps an out-of-range 10-row page and loads the last page", async () => {
    const fixture = pagedPeopleClient(23);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const result = await getPeopleScreenData(
      "org-1", parsePeopleSearchParams({ page: "9" }),
    );

    expect(fixture.ranges).toEqual([[80, 89], [20, 29]]);
    expect(result.people.map(person => person.id)).toEqual(["person-21", "person-22", "person-23"]);
    expect(result.pagination).toEqual({ from: 21, to: 23, page: 3, pageSize: 10, totalCount: 23, totalPages: 3 });
  });

  it("loads a later explicitly sized page without dropping the selection", async () => {
    const fixture = pagedPeopleClient(61);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const result = await getPeopleScreenData(
      "org-1", parsePeopleSearchParams({ page: "2", pageSize: "25" }),
    );

    expect(fixture.ranges).toEqual([[25, 49]]);
    expect(result.people[0]?.id).toBe("person-26");
    expect(result.people).toHaveLength(25);
    expect(result.pagination).toMatchObject({ from: 26, to: 50, page: 2, pageSize: 25, totalPages: 3 });
  });

  it("loads lease summaries from the authoritative current lease projection", async () => {
    const queriedRelations: string[] = [];
    const rows: Record<string, unknown[]> = {
      people: [
        {
          archived_at: null,
          created_at: "2026-08-01T00:00:00Z",
          display_name: "Soley Heng",
          id: "person-1",
          legal_name: null,
          notes: null,
          party_type: "individual",
          primary_email: null,
          primary_phone: null,
          tax_identifier: null,
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      person_roles: [],
      person_travel_documents: [
        {
          passport_expiry_date: "2031-04-30",
          passport_number: "N1234567",
          person_id: "person-1",
          visa_expiry_date: "2028-09-15",
        },
      ],
      person_contacts: [],
      lease_parties: [
        {
          archived_at: null,
          ended_on: null,
          id: "party-1",
          is_primary: true,
          lease_id: "lease-1",
          party_role: "tenant",
          person_id: "person-1",
        },
      ],
      property_owners: [],
      vendor_profiles: [],
      current_leases: [
        {
          archived_at: null,
          id: "lease-1",
          lease_end_date: "2027-07-31",
          lease_start_date: "2026-08-01",
          property_id: "property-1",
          status: "active",
          tenant_name: "Soley Heng",
          unit_id: "unit-1",
        },
      ],
      properties: [{ code: "P-001", id: "property-1", name: "Riverside" }],
      units: [{ id: "unit-1", property_id: "property-1", unit_number: "A1" }],
      documents: [],
      activity_log: [],
    };

    const client = {
      from(relation: string) {
        queriedRelations.push(relation);
        const builder = createQueryBuilder(
          relation === "leases"
            ? {
                count: null,
                data: null,
                error: { message: "column leases.tenant_name does not exist" },
              }
            : {
                count: relation === "people" ? 1 : null,
                data: rows[relation] ?? [],
                error: null,
              },
        );
        return builder;
      },
      storage: {
        from: vi.fn(() => ({ createSignedUrl: vi.fn() })),
      },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const result = await getPeopleScreenData("org-1");

    expect(queriedRelations).toContain("current_leases");
    expect(queriedRelations).not.toContain("leases");
    expect(result.people[0]?.linked.activeLeases[0]).toMatchObject({
      id: "lease-1",
      propertyId: "property-1",
    });
    expect(result.people[0]).toMatchObject({
      formValues: {
        passportExpiryDate: "2031-04-30",
        passportNumber: "N1234567",
        visaExpiryDate: "2028-09-15",
      },
      passportExpiryDate: "2031-04-30",
      passportNumber: "N1234567",
      visaExpiryDate: "2028-09-15",
    });
  });

  it("keeps the database search contract through final result matching", async () => {
    const rows: Record<string, unknown[]> = {
      people: [
        {
          archived_at: null,
          created_at: "2026-08-01T00:00:00Z",
          display_name: "Soley Heng",
          id: "person-1",
          legal_name: null,
          notes: null,
          party_type: "individual",
          primary_email: "primary@example.com",
          primary_phone: null,
          tax_identifier: "KHM-TAX-8842",
          updated_at: "2026-08-01T00:00:00Z",
        },
      ],
      person_roles: [
        {
          archived_at: null,
          id: "role-1",
          person_id: "person-1",
          role: "tenant",
          status: "active",
        },
      ],
      person_contacts: [
        {
          archived_at: null,
          contact_name: "Billing desk",
          contact_type: "billing",
          email: "billing-alt@example.com",
          id: "contact-1",
          is_primary: false,
          person_id: "person-1",
          phone: null,
        },
      ],
      lease_parties: [],
      property_owners: [],
      vendor_profiles: [],
      current_leases: [],
      properties: [],
      units: [],
      documents: [],
      activity_log: [],
    };
    const client = {
      from(relation: string) {
        return createQueryBuilder({
          count: relation === "people" ? 1 : null,
          data: rows[relation] ?? [],
          error: null,
        });
      },
      storage: {
        from: vi.fn(() => ({ createSignedUrl: vi.fn() })),
      },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const result = await getPeopleScreenData(
      "org-1",
      parsePeopleSearchParams({ query: "8842 billing-alt" }),
    );

    expect(result.people.map((person) => person.id)).toEqual(["person-1"]);
  });
});

function pagedPeopleClient(totalCount: number) {
  const ranges: number[][] = [];
  const scopes: string[] = [];
  const personIdFilters: string[][] = [];
  const rows = Array.from({ length: totalCount }, (_, index) => ({
    id: `person-${index + 1}`,
    organization_id: "org-1",
    archived_at: null,
    created_at: "2026-10-01T00:00:00Z",
    display_name: `Demo ${String(index + 1).padStart(3, "0")}`,
    legal_name: null,
    notes: null,
    party_type: "individual",
    primary_email: `demo-${index + 1}@example.invalid`,
    primary_phone: null,
    tax_identifier: null,
    updated_at: "2026-10-01T00:00:00Z",
  }));
  const otherPerson = { ...rows[0], id: "other-org-person", organization_id: "org-2" };
  const client = {
    from(relation: string) {
      let scope: string | undefined;
      let window: number[] | undefined;
      const builder = {
        eq(column: string, value: string) {
          if (column === "organization_id") {
            scope = value;
            scopes.push(value);
          }
          return builder;
        },
        in(column: string, values: string[]) {
          if (column === "person_id") personIdFilters.push(values);
          return builder;
        },
        is: () => builder,
        limit: () => builder,
        order: () => builder,
        or: () => builder,
        select: () => builder,
        range(from: number, to: number) {
          window = [from, to];
          ranges.push(window);
          return builder;
        },
        then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
          const scopedRows = relation === "people"
            ? [...rows, otherPerson].filter(person => person.organization_id === scope)
            : [];
          return Promise.resolve({
            count: relation === "people" ? scopedRows.length : null,
            data: window ? scopedRows.slice(window[0], window[1] + 1) : scopedRows,
            error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn() })) },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
  return { client, ranges, scopes, personIdFilters };
}

function createQueryBuilder(result: {
  count: number | null;
  data: unknown;
  error: { message: string } | null;
}) {
  const builder = {
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    limit: () => builder,
    order: () => builder,
    or: () => builder,
    range: () => builder,
    select: () => builder,
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}
