import { describe, expect, it } from "vitest";

import {
  normalizeWorkspaceSearchQuery,
  rankWorkspaceSearchResults,
  searchWorkspace,
  searchWorkspaceWithStatus,
} from "@/features/workspace-search/data/workspace-search";
import type { PermissionKey } from "@/lib/auth/permission-catalog";
import type { WorkspaceSearchResult } from "@/features/workspace-search/workspace-search.types";

type TableName =
  "property_owners" | "current_leases" | "documents" | "people" | "properties" | "tasks" | "units";

type RecordedFilter = {
  column: string;
  operator: "eq" | "ilike" | "is" | "in";
  value: unknown;
};

type RecordedOrder = {
  ascending: boolean;
  column: string;
};

type RecordedQuery = {
  filters: RecordedFilter[];
  limit?: number;
  range?: [number, number];
  orders: RecordedOrder[];
  selectedColumns: string[];
  table: TableName;
};

function createSearchClient(
  rows: Partial<Record<TableName, Record<string, unknown>[]>>,
  failedTables: TableName[] = [],
) {
  const queries: RecordedQuery[] = [];

  return {
    client: {
      from(table: TableName) {
        const query: RecordedQuery = {
          filters: [],
          orders: [],
          selectedColumns: [],
          table,
        };
        queries.push(query);

        const builder = {
          range(from: number, to: number) { query.range = [from, to]; return builder; },
          or(value: string) { query.filters.push({ column: "or", operator: "in", value }); return builder; },
          filter(column: string, _operator: string, value: string) {
            return builder.eq(column, value);
          },
          in(column: string, value: string[]) {
            query.filters.push({ column, operator: "in", value });
            return builder;
          },
          eq(column: string, value: string) {
            query.filters.push({ column, operator: "eq", value });
            return builder;
          },
          ilike(column: string, value: string) {
            query.filters.push({ column, operator: "ilike", value });
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
          then<TResult1 = { data: Record<string, unknown>[]; error: null }>(
            onfulfilled?:
              | ((value: {
                  data: Record<string, unknown>[];
                  error: null;
                }) => TResult1)
              | null,
          ) {
            const filteredRows = (rows[table] ?? [])
              .filter((row) =>
                query.filters.every((filter) => {
                  if (filter.column === "or") {
                    const conditions = [...String(filter.value).matchAll(/(property_id|unit_id)\.in\.\(([^)]*)\)/g)];
                    return conditions.some(([, column, ids]) => ids.split(",").map(id => JSON.parse(id)).includes(row[column]));
                  }
                  if (filter.operator === "ilike") {
                    return matchesIlike(
                      row[filter.column],
                      String(filter.value),
                    );
                  }
                  if (filter.operator === "in")
                    return (filter.value as unknown[]).includes(
                      row[filter.column],
                    );

                  return row[filter.column] === filter.value;
                }),
              )
              .toSorted((first, second) =>
                compareRecordedRows(first, second, query.orders),
              );
            const value = {
              data: filteredRows
                .slice(query.range?.[0] ?? 0, query.range ? query.range[1] + 1 : query.limit)
                .map((row) =>
                  selectRecordedColumns(row, query.selectedColumns),
                ),
              error: failedTables.includes(table)
                ? { message: "Simulated failure" }
                : null,
            };

            return Promise.resolve(
              onfulfilled ? onfulfilled(value as never) : value,
            );
          },
        };

        return builder;
      },
    },
    queries,
  };
}

function compareRecordedRows(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  orders: RecordedOrder[],
) {
  for (const order of orders) {
    const firstValue = first[order.column];
    const secondValue = second[order.column];

    if (firstValue === secondValue) continue;
    if (firstValue === null || firstValue === undefined) return 1;
    if (secondValue === null || secondValue === undefined) return -1;

    const comparison = String(firstValue).localeCompare(String(secondValue));
    if (comparison !== 0) return order.ascending ? comparison : -comparison;
  }

  return 0;
}

function matchesIlike(value: unknown, pattern: string) {
  if (typeof value !== "string") return false;

  let regex = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "\\" && index + 1 < pattern.length) {
      index += 1;
      regex += escapeRegex(pattern[index]);
    } else if (character === "%") {
      regex += ".*";
    } else if (character === "_") {
      regex += ".";
    } else {
      regex += escapeRegex(character);
    }
  }

  return new RegExp(`^${regex}$`, "isu").test(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectRecordedColumns(
  row: Record<string, unknown>,
  selectedColumns: string[],
) {
  return Object.fromEntries(
    selectedColumns.map((column) => column.startsWith("person:") ? ["person", row.person] : [column, row[column]]),
  );
}

describe("searchWorkspace", () => {
  it("retains direct matches and reports partial search when owner context is unavailable", async () => {
    const {client} = createSearchClient({people: [{id: "person", organization_id: "org-1", archived_at: null, display_name: "Morgan", legal_name: null}]}, ["property_owners"]);
    const result = await searchWorkspaceWithStatus({client: client as never, context: superAdminContext(), query: "Morgan"});
    expect(result.partial).toBe(true);
    expect(result.results).toContainEqual(expect.objectContaining({id: "person"}));
  });

  it("uses linked owner names and unit aliases without including sibling-unit records", async () => {
    const common = { organization_id: "org-1", archived_at: null };
    const { client } = createSearchClient({
      properties: [{ ...common, id: "p1", name: "Alex Morgan", code: "PM-0003", address: "" }],
      property_owners: [{ ...common, id: "po1", property_id: "p1", person_id: "owner1", ended_on: null, person: { display_name: "MORGAN JAMES", legal_name: null } }],
      units: [
        { ...common, id: "u1", property_id: "p1", unit_number: "BELLAVITA #7F-D2", status: "occupied" },
        { ...common, id: "u2", property_id: "p1", unit_number: "BELLAVITA #8F-D2", status: "occupied" },
      ],
      current_leases: [
        { ...common, id: "l1", property_id: "p1", unit_id: "u1", tenant_name: "Tenant One", status: "active" },
        { ...common, id: "l2", property_id: "p1", unit_id: "u2", tenant_name: "Tenant Two", status: "active" },
      ],
      tasks: [{ ...common, id: "task1", property_id: "p1", unit_id: "u1", title: "Repair tap", description: "", category: "repair", status: "pending" }],
      documents: [{ ...common, id: "doc1", property_id: "p1", unit_id: "u1", file_name: "agreement.pdf", category: "lease" }],
    });
    const results = await searchWorkspace({ client: client as never, context: superAdminContext(), query: "James 7FD2" });
    expect(results.map(row => row.id).sort()).toEqual(["doc1", "l1", "p1", "task1", "u1"]);
  });

  it("finds ended leases through a property and unit and excludes archived leases", async () => {
    const { client } = createSearchClient({
      properties: [{ id: "p1", organization_id: "org-1", archived_at: null, name: "Riverside", code: "RIV", address: "12 Lake Road" }],
      units: [{ id: "u1", organization_id: "org-1", archived_at: null, property_id: "p1", unit_number: "101", status: "vacant" }],
      current_leases: [
        { id: "l1", organization_id: "org-1", archived_at: null, property_id: "p1", unit_id: "u1", tenant_name: "Dara", status: "ended" },
        { id: "l2", organization_id: "org-1", archived_at: "2026-01-01", property_id: "p1", unit_id: "u1", tenant_name: "Dara", status: "ended" },
      ],
    });
    const results = await searchWorkspace({ client: client as never, context: superAdminContext(), query: "101 Riverside" });
    expect(results).toContainEqual(expect.objectContaining({ id: "l1", kind: "lease", meta: "RIV · Riverside · Unit 101 · Ended" }));
    expect(results).not.toContainEqual(expect.objectContaining({ id: "l2" }));
  });

  it("reserves room for other record types and signals a limited preview", async () => {
    const { client } = createSearchClient({
      properties: Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, organization_id: "org-1", archived_at: null, code: `B${index}`, name: "Boiler" })),
      people: [{ id: "person", organization_id: "org-1", archived_at: null, display_name: "Boiler", party_type: "individual" }],
    });
    const response = await searchWorkspaceWithStatus({ client: client as never, context: superAdminContext(), query: "boiler" });
    expect(response.results).toHaveLength(20);
    expect(response.results).toContainEqual(expect.objectContaining({ id: "person" }));
    expect(response.limited).toBe(true);
    expect(response.results.every((result) => result.kind !== "action")).toBe(true);
  });

  it("preserves successful categories and reports partial failure", async () => {
    const { client } = createSearchClient(
      {
        people: [
          {
            id: "person-1",
            organization_id: "org-1",
            archived_at: null,
            display_name: "Boiler Person",
            party_type: "individual",
          },
        ],
      },
      ["documents"],
    );
    const response = await searchWorkspaceWithStatus({
      client: client as never,
      context: superAdminContext(),
      query: "boiler",
    });
    expect(response.partial).toBe(true);
    expect(response.results).toContainEqual(
      expect.objectContaining({ id: "person-1" }),
    );
  });

  it("reports total failure instead of claiming there are no matches", async () => {
    const { client } = createSearchClient({}, ["people"]);
    await expect(
      searchWorkspaceWithStatus({
        client: client as never,
        context: {
          ...superAdminContext(),
          isSuperAdmin: false,
          permissionKeys: permissions("people.view"),
        },
        query: "boiler",
      }),
    ).rejects.toThrow("Search unavailable");
  });
  it("finds people by primary email and phone", async () => {
    const { client } = createSearchClient({
      people: [
        {
          id: "contact-1",
          organization_id: "org-1",
          archived_at: null,
          display_name: "Sok Dara",
          party_type: "individual",
          primary_email: "dara@example.com",
          primary_phone: "012345678",
        },
      ],
    });
    for (const query of ["dara@example.com", "012345678"]) {
      expect(
        await searchWorkspace({
          client: client as never,
          context: superAdminContext(),
          query,
        }),
      ).toContainEqual(
        expect.objectContaining({ id: "contact-1", kind: "person" }),
      );
    }
  });

  it("matches words across property and unit and identifies the property", async () => {
    const { client } = createSearchClient({
      properties: [
        {
          id: "p1",
          organization_id: "org-1",
          archived_at: null,
          name: "Riverside",
          code: "RIV",
          address: "12 Lake Road",
        },
      ],
      units: [
        {
          id: "u1",
          organization_id: "org-1",
          archived_at: null,
          property_id: "p1",
          unit_number: "101",
          status: "vacant",
        },
      ],
    });
    const results = await searchWorkspace({
      client: client as never,
      context: superAdminContext(),
      query: "101 Riverside",
    });
    expect(results).toContainEqual(
      expect.objectContaining({
        id: "u1",
        meta: expect.stringContaining("Riverside"),
      }),
    );
  });

  it("keeps an exact match ahead of many alphabetically earlier substring matches", async () => {
    const { client } = createSearchClient({
      properties: [
        ...Array.from({ length: 130 }, (_, index) => ({
          id: `p${index}`,
          organization_id: "org-1",
          archived_at: null,
          code: `A${index}`,
          name: `A Boiler ${index}`,
        })),
        {
          id: "exact",
          organization_id: "org-1",
          archived_at: null,
          code: "ZZ",
          name: "Boiler",
        },
      ],
    });
    expect(
      (
        await searchWorkspace({
          client: client as never,
          context: superAdminContext(),
          query: "boiler",
        })
      )[0].id,
    ).toBe("exact");
  });

  it("trims the query, requires two characters, and does not touch data for short input", async () => {
    const { client, queries } = createSearchClient({});

    await expect(
      searchWorkspace({
        client: client as never,
        context: superAdminContext(),
        query: "  a  ",
      }),
    ).resolves.toEqual([]);
    expect(queries).toEqual([]);
  });

  it("counts complete Unicode code points and normalizes canonically", async () => {
    const { client, queries } = createSearchClient({});

    await expect(
      searchWorkspace({
        client: client as never,
        context: superAdminContext(),
        query: "🧰",
      }),
    ).resolves.toEqual([]);
    expect(queries).toEqual([]);
    expect(normalizeWorkspaceSearchQuery("  Cafe\u0301\t records ")).toBe(
      "Café records",
    );

    const truncated = normalizeWorkspaceSearchQuery(`${"a".repeat(119)}🧰z`);
    expect(truncated).not.toBeNull();
    expect(Array.from(truncated!)).toHaveLength(120);
    expect(truncated!.endsWith("🧰")).toBe(true);
    expect(truncated!.isWellFormed()).toBe(true);
  });

  it("searches only active admin records in the authenticated organization", async () => {
    const { client, queries } = createSearchClient({
      documents: [
        {
          archived_at: null,
          category: "Maintenance",
          file_name: "boiler-photo.jpg",
          id: "document-1",
          organization_id: "org-1",
        },
      ],
      current_leases: [
        {
          archived_at: null,
          id: "lease-1",
          organization_id: "org-1",
          status: "active",
          tenant_name: "Boiler Tenant",
        },
      ],
      people: [
        {
          archived_at: null,
          display_name: "Boiler Vendor",
          id: "person-1",
          organization_id: "org-1",
          party_type: "person",
        },
      ],
      properties: [
        {
          archived_at: null,
          code: "BLR",
          id: "property-1",
          name: "Boiler House",
          organization_id: "org-1",
        },
        {
          archived_at: null,
          code: "CROSS",
          id: "property-cross-org",
          name: "Boiler Annex",
          organization_id: "org-2",
        },
        {
          archived_at: "2026-07-01T00:00:00.000Z",
          code: "OLD",
          id: "property-archived",
          name: "Boiler Archive",
          organization_id: "org-1",
        },
      ],
      tasks: [
        {
          archived_at: null,
          branch_id: "branch-a",
          category: "Plumbing",
          description: "Inspect boiler pressure",
          id: "task-1",
          organization_id: "org-1",
          status: "pending",
          title: "Boiler leak",
        },
      ],
      units: [
        {
          archived_at: null,
          id: "unit-1",
          organization_id: "org-1",
          status: "occupied",
          unit_number: "Boiler 3",
        },
      ],
    });

    const results = await searchWorkspace({
      client: client as never,
      context: superAdminContext(),
      query: "  boiler  ",
    });

    expect(new Set(queries.map((query) => query.table))).toEqual(
      new Set([
        "property_owners",
        "current_leases",
        "documents",
        "people",
        "properties",
        "tasks",
        "units",
      ]),
    );
    expect(queries).not.toHaveLength(0);
    expect(
      queries.every(
        (query) => query.range ? query.range[1] - query.range[0] < 500 : query.limit !== undefined && query.limit! <= 101,
      ),
    ).toBe(true);
    expect(
      queries.every((query) => {
        const searchedField = query.filters.find(
          (filter) => filter.operator === "ilike",
        )?.column;

        return searchedField === undefined
          ? query.orders[0]?.column === "id"
          : JSON.stringify(query.orders) ===
              JSON.stringify([
                { ascending: true, column: searchedField },
                { ascending: true, column: "id" },
              ]);
      }),
    ).toBe(true);
    expect(
      queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "organization_id" &&
            filter.operator === "eq" &&
            filter.value === "org-1",
        ),
      ),
    ).toBe(true);
    expect(
      queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "archived_at" &&
            filter.operator === "is" &&
            filter.value === null,
        ),
      ),
    ).toBe(true);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/properties/property-1",
          kind: "property",
        }),
        expect.objectContaining({ href: "/units/unit-1", kind: "unit" }),
        expect.objectContaining({ href: "/people/person-1", kind: "person" }),
        expect.objectContaining({ kind: "lease", label: "Boiler Tenant" }),
        expect.objectContaining({ kind: "maintenance", label: "Boiler leak" }),
        expect.objectContaining({
          kind: "document",
          label: "boiler-photo.jpg",
        }),
      ]),
    );
    expect(results).not.toContainEqual(
      expect.objectContaining({ id: "property-cross-org" }),
    );
    expect(results).not.toContainEqual(
      expect.objectContaining({ id: "property-archived" }),
    );
  });

  it("keeps manager and member task queries inside their RLS-equivalent scope", async () => {
    const managerSearch = createSearchClient({ tasks: [] });
    await searchWorkspace({
      client: managerSearch.client as never,
      context: {
        branchId: "branch-a",
        isSuperAdmin: false,
        organizationId: "org-1",
        permissionKeys: permissions(
          "maintenance.view",
          "maintenance.create_assign",
          "maintenance.review",
        ),
      },
      query: "pump",
    });

    expect(new Set(managerSearch.queries.map((query) => query.table))).toEqual(
      new Set(["tasks"]),
    );
    expect(
      managerSearch.queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "branch_id" && filter.value === "branch-a",
        ),
      ),
    ).toBe(true);

    const memberSearch = createSearchClient({ tasks: [] });
    await searchWorkspace({
      client: memberSearch.client as never,
      context: {
        branchId: "branch-a",
        isSuperAdmin: false,
        organizationId: "org-1",
        permissionKeys: permissions("maintenance.view", "maintenance.complete"),
        personId: "person-1",
      },
      query: "pump",
    });

    expect(new Set(memberSearch.queries.map((query) => query.table))).toEqual(
      new Set(["tasks"]),
    );
    expect(
      memberSearch.queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "assignee_person_id" &&
            filter.value === "person-1",
        ),
      ),
    ).toBe(true);
    expect(
      memberSearch.queries.every((query) =>
        query.filters.some(
          (filter) =>
            filter.column === "branch_id" && filter.value === "branch-a",
        ),
      ),
    ).toBe(true);
  });

  it("returns description-only task matches without leaking internal match text", async () => {
    const { client } = createSearchClient({
      tasks: [
        {
          archived_at: null,
          branch_id: "branch-a",
          category: "Inspection",
          description: "Inspect boiler pressure before reopening",
          id: "task-description-only",
          organization_id: "org-1",
          status: "pending",
          title: "Mechanical review",
        },
      ],
    });

    const results = await searchWorkspace({
      client: client as never,
      context: {
        branchId: "branch-a",
        isSuperAdmin: false,
        organizationId: "org-1",
        permissionKeys: permissions(
          "maintenance.view",
          "maintenance.create_assign",
        ),
      },
      query: "boiler",
    });

    expect(results).toEqual([
      {
        href: "/maintenance?archiveState=all&taskId=task-description-only",
        id: "task-description-only",
        kind: "maintenance",
        label: "Mechanical review",
        meta: "Pending · Inspection",
      },
    ]);
    expect(results[0]).not.toHaveProperty("description");
    expect(results[0]).not.toHaveProperty("searchText");
  });

  it("uses deterministic field-plus-id ordering before every bounded query", async () => {
    const propertyRows = Array.from({ length: 25 }, (_, index) => ({
      archived_at: null,
      code: "NO-MATCH",
      id: `property-${String(index).padStart(2, "0")}`,
      name: "Boiler",
      organization_id: "org-1",
    }));
    const firstSearch = createSearchClient({ properties: propertyRows });
    const secondSearch = createSearchClient({
      properties: [...propertyRows].reverse(),
    });

    const [firstResults, secondResults] = await Promise.all([
      searchWorkspace({
        client: firstSearch.client as never,
        context: superAdminContext(),
        query: "boiler",
      }),
      searchWorkspace({
        client: secondSearch.client as never,
        context: superAdminContext(),
        query: "boiler",
      }),
    ]);

    expect(firstResults).toEqual(secondResults);
    expect(firstResults).toHaveLength(20);
    expect(firstResults.map((result) => result.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `property-${String(index).padStart(2, "0")}`,
      ),
    );
    expect(
      [...firstSearch.queries, ...secondSearch.queries].every((query) => {
        const searchedField = query.filters.find(
          (filter) => filter.operator === "ilike",
        )?.column;

        return (
          (query.range ? query.range[1] - query.range[0] < 500 : query.limit === 101) &&
          (searchedField === undefined
            ? query.orders[0]?.column === "id"
            : query.orders[0]?.column === searchedField &&
              query.orders[1]?.column === "id")
        );
      }),
    ).toBe(true);
  });

  it("escapes LIKE wildcards without constructing PostgREST or-filter grammar", async () => {
    const { client, queries } = createSearchClient({ properties: [] });

    await searchWorkspace({
      client: client as never,
      context: superAdminContext(),
      query: "boi%_(),\\",
    });

    const patterns = queries.flatMap((query) =>
      query.filters
        .filter((filter) => filter.operator === "ilike")
        .map((filter) => filter.value),
    );
    expect(patterns).not.toHaveLength(0);
    expect(patterns.every((pattern) => pattern === "%boi\\%\\_(),\\\\%")).toBe(
      true,
    );
  });

  it("leaves page actions to the client so they cannot consume record slots", async () => {
    const { client } = createSearchClient({ tasks: [] });

    await expect(
      searchWorkspace({
        client: client as never,
        context: {
          branchId: "branch-a",
          isSuperAdmin: false,
          organizationId: "org-1",
          permissionKeys: permissions(
            "maintenance.view",
            "maintenance.create_assign",
          ),
        },
        query: "work orders",
      }),
    ).resolves.toEqual([]);

    await expect(
      searchWorkspace({
        client: client as never,
        context: {
          branchId: "branch-a",
          isSuperAdmin: false,
          organizationId: "org-1",
          permissionKeys: permissions(
            "maintenance.view",
            "maintenance.complete",
          ),
          personId: "person-1",
        },
        query: "properties",
      }),
    ).resolves.toEqual([]);
  });
});

describe("rankWorkspaceSearchResults", () => {
  it("uses a stable deterministic order and enforces the hard maximum of 20", () => {
    const candidates: WorkspaceSearchResult[] = Array.from(
      { length: 25 },
      (_, index) => ({
        href: `/properties/${index}`,
        id: String(index).padStart(2, "0"),
        kind: "property" as const,
        label:
          index === 24 ? "Boiler" : `Boiler ${String(index).padStart(2, "0")}`,
      }),
    );

    const first = rankWorkspaceSearchResults("boiler", candidates);
    const second = rankWorkspaceSearchResults(
      "boiler",
      [...candidates].reverse(),
    );

    expect(first).toHaveLength(20);
    expect(first).toEqual(second);
    expect(first[0]).toEqual(
      expect.objectContaining({ id: "24", label: "Boiler" }),
    );
  });
});

function permissions(...permissionKeys: PermissionKey[]) {
  return new Set(permissionKeys);
}

function superAdminContext() {
  return {
    isSuperAdmin: true,
    organizationId: "org-1",
    permissionKeys: permissions(),
  };
}
