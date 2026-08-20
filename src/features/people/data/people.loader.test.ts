import { describe, expect, it, vi } from "vitest";
import { getPeopleScreenData } from "@/features/people/data/people";
import { parsePeopleSearchParams } from "@/features/people/people.filters";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getPeopleScreenData", () => {
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
