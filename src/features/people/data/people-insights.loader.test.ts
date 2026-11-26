import { describe, expect, it, vi } from "vitest";
import { getPeopleAttentionData } from "@/features/people/data/people-insights";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getPeopleAttentionData", () => {
  it("computes a safe exact DTO across every active organization record", async () => {
    const rows = makeRows(205);
    const supabase = createInsightsClient(rows);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const insights = await getPeopleAttentionData("org-1");

    expect(Object.keys(insights)).toEqual(["attentionQueues"]);
    expect(findQueue(insights, "missing-contact")?.count).toBe(1);
    expect(findQueue(insights, "missing-role")?.count).toBe(4);
    expect(findQueue(insights, "vendor-review")?.count).toBe(0);
    expect(findQueue(insights, "missing-evidence")).toBeUndefined();

    const peopleQueries = supabase.queries.filter(
      (query) => query.table === "people",
    );
    expect(peopleQueries).toHaveLength(2);
    expect(
      peopleQueries.every(
        (query) => query.range !== undefined && query.range[1] - query.range[0] < 200,
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

    const allowedColumns: Partial<Record<TableName, string[]>> = {
      people: ["id", "primary_email", "primary_phone"],
      person_contacts: ["id", "person_id", "email", "phone"],
      person_roles: ["id", "person_id", "role"],
      vendor_profiles: ["id", "person_id"],
    };
    expect([...new Set(supabase.queries.map(query => query.table))].sort())
      .toEqual(Object.keys(allowedColumns).sort());

    expect(supabase.queries).not.toHaveLength(0);
    for (const query of supabase.queries) {
      expect(query.selectedColumns).toEqual(allowedColumns[query.table]);
      expect(query.orders).toEqual([{ ascending: true, column: "id" }]);
      expect(query.count).toBe("exact");
      expect(query.range![1] - query.range![0]).toBeLessThan(200);
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

    await expect(getPeopleAttentionData("org-1")).rejects.toThrow(
      "Could not load people insights from person_roles: denied",
    );
  });
  it("continues through smaller API pages without truncating the attention counts", async () => {
    const supabase = createInsightsClient(makeRows(205), { apiCap: 25 });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);
    const insights = await getPeopleAttentionData("org-1");
    expect(findQueue(insights, "missing-contact")?.count).toBe(1);
    expect(findQueue(insights, "missing-role")?.count).toBe(4);
    expect(supabase.queries.filter(query => query.table === "people")).toHaveLength(9);
  });

  it("rejects changing source counts instead of presenting incomplete totals", async () => {
    const supabase = createInsightsClient(makeRows(205), { changingTable: "people" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);
    await expect(getPeopleAttentionData("org-1")).rejects.toThrow("row count changed");
  });

  it("does not read unused evidence or relationship sources", async () => {
    const supabase = createInsightsClient(makeRows(205), { failTable: "documents" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);
    expect((await getPeopleAttentionData("org-1")).attentionQueues).toHaveLength(3);
    expect(supabase.queries.some(query =>
      ["documents", "leases", "lease_parties", "property_owners"].includes(query.table),
    )).toBe(false);
  });

  it("preserves contact, active-role and vendor readiness rules without double counting", async () => {
    const rows = makeRows(6);
    rows.people[0].primary_email = "  ";
    rows.people[1].primary_email = null;
    rows.person_roles[2].status = "inactive";
    rows.person_roles[3].archived_at = "2026-01-01";
    rows.person_roles[4].role = "unknown";
    const common = { organization_id: "org-1", archived_at: null };
    rows.person_contacts.push(
      { ...common, id: "contact-1", person_id: "person-001", email: "contact@example.com", phone: null },
      { ...common, id: "contact-2", person_id: "person-002", email: "old@example.com", phone: null, archived_at: "2026-01-01" },
      { ...common, id: "contact-3", person_id: "person-002", email: "other@example.com", phone: null, organization_id: "org-2" },
    );
    rows.person_roles.push(
      ...makeRoleRange(1, 2, "vendor"),
      { ...makeRoleRange(2, 2, "vendor")[0], id: "duplicate-vendor-role" },
      ...makeRoleRange(998, 999, "vendor"),
    );
    rows.vendor_profiles.push(
      { ...common, id: "vendor-1", person_id: "person-001" },
      { ...common, id: "vendor-2", person_id: "person-002", archived_at: "2026-01-01" },
    );
    const supabase = createInsightsClient(rows);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);
    const insights = await getPeopleAttentionData("org-1");
    expect(findQueue(insights, "missing-contact")?.count).toBe(1);
    expect(findQueue(insights, "missing-role")?.count).toBe(3);
    expect(findQueue(insights, "vendor-review")?.count).toBe(1);
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
  count?: "exact";
  range?: [number, number];
  orders: Array<{ ascending: boolean; column: string }>;
  selectedColumns: string[];
  table: TableName;
};

function createInsightsClient(
  rowsByTable: Record<TableName, Array<Record<string, unknown>>>,
  { failTable, apiCap = Infinity, changingTable }: { failTable?: TableName; apiCap?: number; changingTable?: TableName } = {},
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
        returns: () => builder,
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
        range(from: number, to: number) {
          query.range = [from, to];
          return builder;
        },
        select(columns: string, options?: { count?: "exact" }) {
          query.count = options?.count;
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
              ? { count: null, data: null, error: { message: "denied" } }
              : {
                  count: query.count === "exact"
                    ? applyQuery(rowsByTable[table], { ...query, range: undefined, limit: undefined }).length
                      + (table === changingTable && (query.range?.[0] ?? 0) > 0 ? 1 : 0)
                    : null,
                  data: applyQuery(rowsByTable[table], query).slice(0, apiCap),
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
    .slice(query.range?.[0] ?? 0, query.range ? query.range[1] + 1 : query.limit)
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

function findQueue(
  insights: Awaited<ReturnType<typeof getPeopleAttentionData>>,
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
