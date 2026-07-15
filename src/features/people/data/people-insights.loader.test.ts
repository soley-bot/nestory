import { describe, expect, it, vi } from "vitest";
import { getPeopleInsightsData } from "@/features/people/data/people-insights";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getPeopleInsightsData", () => {
  it("computes a safe exact DTO across every active organization record", async () => {
    const rows = makeRows(205);
    const supabase = createInsightsClient(rows);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const insights = await getPeopleInsightsData("org-1");

    expect(insights).toMatchObject({
      totalCount: 205,
      visibleCount: 205,
    });
    expect(findMetric(insights, "People")?.value).toBe("205");
    expect(findMetric(insights, "Tenants")?.value).toBe("101/101");
    expect(findMetric(insights, "Owners")?.value).toBe("50/50");
    expect(findMetric(insights, "Vendors")?.value).toBe("30/30");
    expect(findRelationship(insights, "Staff readiness")).toMatchObject({
      count: 20,
      readyCount: 20,
    });
    expect(findQueue(insights, "missing-contact")?.count).toBe(1);
    expect(findQueue(insights, "missing-role")?.count).toBe(4);
    expect(findQueue(insights, "missing-evidence")?.count).toBe(205);
    expect(findQueue(insights, "vendor-review")?.count).toBe(0);

    const peopleQueries = supabase.queries.filter(
      (query) => query.table === "people",
    );
    expect(peopleQueries).toHaveLength(2);
    expect(
      peopleQueries.every(
        (query) => query.limit !== undefined && query.limit <= 200,
      ),
    ).toBe(true);
    expect(
      supabase.queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "organization_id" &&
            filter.operator === "eq" &&
            filter.value === "org-1",
        ),
      ),
    ).toBe(true);

    const allowedColumns: Record<TableName, string[]> = {
      documents: ["id", "lease_id", "property_id", "unit_id"],
      lease_parties: [
        "id",
        "person_id",
        "lease_id",
        "ended_on",
        "archived_at",
      ],
      leases: [
        "id",
        "property_id",
        "unit_id",
        "status",
        "archived_at",
      ],
      people: ["id", "primary_email", "primary_phone"],
      person_contacts: ["id", "person_id", "email", "phone"],
      person_roles: ["id", "person_id", "role"],
      property_owners: [
        "id",
        "person_id",
        "property_id",
        "ended_on",
        "archived_at",
      ],
      vendor_profiles: ["id", "person_id", "archived_at"],
    };

    expect(supabase.queries).not.toHaveLength(0);
    for (const query of supabase.queries) {
      expect(query.selectedColumns).toEqual(allowedColumns[query.table]);
      expect(query.orders).toEqual([{ ascending: true, column: "id" }]);
      expect(query.limit).toBeLessThanOrEqual(200);
    }
    expect(supabase.storageFrom).not.toHaveBeenCalled();

    const serialized = JSON.stringify(insights);
    expect(serialized).not.toContain("person-");
    const keys = collectKeys(insights);
    for (const prohibitedKey of [
      "people",
      "taxIdentifier",
      "activity",
      "documents",
      "signedUrl",
      "storagePath",
      "formValues",
      "recordCounts",
      "reportLimit",
    ]) {
      expect(keys).not.toContain(prohibitedKey);
    }
  });

  it("fails safely when any aggregate source cannot be read", async () => {
    const supabase = createInsightsClient(makeRows(2), {
      failTable: "person_roles",
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    await expect(getPeopleInsightsData("org-1")).rejects.toThrow(
      "Could not load people insights from person_roles: denied",
    );
  });
});

type TableName =
  | "documents"
  | "lease_parties"
  | "leases"
  | "people"
  | "person_contacts"
  | "person_roles"
  | "property_owners"
  | "vendor_profiles";

type RecordedFilter = {
  column: string;
  operator: "eq" | "gt" | "is";
  value: unknown;
};

type RecordedQuery = {
  filters: RecordedFilter[];
  limit?: number;
  orders: Array<{ ascending: boolean; column: string }>;
  selectedColumns: string[];
  table: TableName;
};

function createInsightsClient(
  rowsByTable: Record<TableName, Array<Record<string, unknown>>>,
  { failTable }: { failTable?: TableName } = {},
) {
  const queries: RecordedQuery[] = [];
  const storageFrom = vi.fn();

  const client = {
    from(table: TableName) {
      const query: RecordedQuery = {
        filters: [],
        orders: [],
        selectedColumns: [],
        table,
      };
      queries.push(query);

      const builder = {
        eq(column: string, value: unknown) {
          query.filters.push({ column, operator: "eq", value });
          return builder;
        },
        gt(column: string, value: unknown) {
          query.filters.push({ column, operator: "gt", value });
          return builder;
        },
        is(column: string, value: null) {
          query.filters.push({ column, operator: "is", value });
          return builder;
        },
        limit(value: number) {
          query.limit = value;
          return builder;
        },
        order(column: string, options: { ascending?: boolean } = {}) {
          query.orders.push({
            ascending: options.ascending ?? true,
            column,
          });
          return builder;
        },
        select(columns: string) {
          query.selectedColumns = columns
            .split(",")
            .map((column) => column.trim());
          return builder;
        },
        then<TResult1 = {
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>(
          onfulfilled?:
            | ((value: {
                data: Array<Record<string, unknown>> | null;
                error: { message: string } | null;
              }) => TResult1)
            | null,
        ) {
          const value =
            table === failTable
              ? { data: null, error: { message: "denied" } }
              : {
                  data: applyQuery(rowsByTable[table], query),
                  error: null,
                };

          return Promise.resolve(onfulfilled ? onfulfilled(value) : value);
        },
      };

      return builder;
    },
    storage: { from: storageFrom },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;

  return { client, queries, storageFrom };
}

function applyQuery(
  rows: Array<Record<string, unknown>>,
  query: RecordedQuery,
) {
  return rows
    .filter((row) =>
      query.filters.every((filter) => {
        if (filter.operator === "gt") {
          return String(row[filter.column]) > String(filter.value);
        }

        return row[filter.column] === filter.value;
      }),
    )
    .toSorted((first, second) =>
      String(first.id).localeCompare(String(second.id)),
    )
    .slice(0, query.limit)
    .map((row) =>
      Object.fromEntries(
        query.selectedColumns.map((column) => [column, row[column]]),
      ),
    );
}

function makeRows(count: number): Record<TableName, Array<Record<string, unknown>>> {
  const people: Array<Record<string, unknown>> = Array.from(
    { length: count },
    (_, index) => {
      const ordinal = index + 1;

      return {
        archived_at: null,
        id: getPersonId(ordinal),
        organization_id: "org-1",
        primary_email: ordinal === 205 ? null : `${ordinal}@example.com`,
        primary_phone: null,
      };
    },
  );
  people.push({
    archived_at: "2026-01-01T00:00:00.000Z",
    id: "person-998",
    organization_id: "org-1",
    primary_email: null,
    primary_phone: null,
  });
  people.push({
    archived_at: null,
    id: "person-999",
    organization_id: "org-2",
    primary_email: null,
    primary_phone: null,
  });

  const personRoles = [
    ...makeRoleRange(1, Math.min(101, count), "tenant"),
    ...makeRoleRange(102, Math.min(151, count), "owner"),
    ...makeRoleRange(152, Math.min(181, count), "vendor"),
    ...makeRoleRange(182, Math.min(201, count), "staff"),
  ];
  const tenantCount = Math.min(101, count);
  const ownerEnd = Math.min(151, count);
  const vendorEnd = Math.min(181, count);

  return {
    documents: [],
    lease_parties: Array.from({ length: tenantCount }, (_, index) => ({
      archived_at: null,
      ended_on: null,
      id: `lease-party-${pad(index + 1)}`,
      lease_id: `lease-${pad(index + 1)}`,
      organization_id: "org-1",
      person_id: getPersonId(index + 1),
    })),
    leases: Array.from({ length: tenantCount }, (_, index) => ({
      archived_at: null,
      id: `lease-${pad(index + 1)}`,
      organization_id: "org-1",
      property_id: `property-${pad(index + 1)}`,
      status: "active",
      unit_id: `unit-${pad(index + 1)}`,
    })),
    people,
    person_contacts: [],
    person_roles: personRoles,
    property_owners: ownerEnd >= 102
      ? Array.from({ length: ownerEnd - 101 }, (_, index) => ({
          archived_at: null,
          ended_on: null,
          id: `owner-${pad(index + 102)}`,
          organization_id: "org-1",
          person_id: getPersonId(index + 102),
          property_id: `owner-property-${pad(index + 102)}`,
        }))
      : [],
    vendor_profiles: vendorEnd >= 152
      ? Array.from({ length: vendorEnd - 151 }, (_, index) => ({
          archived_at: null,
          id: `vendor-${pad(index + 152)}`,
          organization_id: "org-1",
          person_id: getPersonId(index + 152),
        }))
      : [],
  };
}

function makeRoleRange(
  start: number,
  end: number,
  role: string,
) {
  if (end < start) {
    return [];
  }

  return Array.from({ length: end - start + 1 }, (_, index) => {
    const ordinal = start + index;

    return {
      archived_at: null,
      id: `role-${role}-${pad(ordinal)}`,
      organization_id: "org-1",
      person_id: getPersonId(ordinal),
      role,
      status: "active",
    };
  });
}

function getPersonId(ordinal: number) {
  return `person-${pad(ordinal)}`;
}

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function findMetric(
  insights: Awaited<ReturnType<typeof getPeopleInsightsData>>,
  label: string,
) {
  return insights.metrics.find((metric) => metric.label === label);
}

function findRelationship(
  insights: Awaited<ReturnType<typeof getPeopleInsightsData>>,
  label: string,
) {
  return insights.relationshipStats.find((stat) => stat.label === label);
}

function findQueue(
  insights: Awaited<ReturnType<typeof getPeopleInsightsData>>,
  id: string,
) {
  return insights.attentionQueues.find((queue) => queue.id === id);
}

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...collectKeys(child),
  ]);
}
