import { describe, expect, it } from "vitest";

import {
  rankWorkspaceSearchResults,
  searchWorkspace,
} from "@/features/workspace-search/data/workspace-search";
import {
  getWorkspaceSearchActions,
  getWorkspaceSearchScopes,
} from "@/features/workspace-search/workspace-search.scopes";
import type { WorkspaceSearchResult } from "@/features/workspace-search/workspace-search.types";

type TableName =
  | "documents"
  | "leases"
  | "people"
  | "properties"
  | "tasks"
  | "units";

type RecordedFilter = {
  column: string;
  operator: "eq" | "ilike" | "is";
  value: unknown;
};

type RecordedQuery = {
  filters: RecordedFilter[];
  limit?: number;
  table: TableName;
};

function createSearchClient(rows: Partial<Record<TableName, Record<string, unknown>[]>>) {
  const queries: RecordedQuery[] = [];

  return {
    client: {
      from(table: TableName) {
        const query: RecordedQuery = { filters: [], table };
        queries.push(query);

        const builder = {
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
          order() {
            return builder;
          },
          select() {
            return builder;
          },
          then<TResult1 = { data: Record<string, unknown>[]; error: null }>(
            onfulfilled?:
              | ((value: { data: Record<string, unknown>[]; error: null }) => TResult1)
              | null,
          ) {
            const filteredRows = (rows[table] ?? []).filter((row) =>
              query.filters
                .filter((filter) => filter.operator === "eq" || filter.operator === "is")
                .every((filter) => row[filter.column] === filter.value),
            );
            const value = {
              data: filteredRows.slice(0, query.limit),
              error: null,
            };

            return Promise.resolve(onfulfilled ? onfulfilled(value) : value);
          },
        };

        return builder;
      },
    },
    queries,
  };
}

describe("workspace search scopes", () => {
  it("matches the routes exposed by the role-aware shell", () => {
    expect(getWorkspaceSearchScopes("admin")).toEqual([
      "properties",
      "units",
      "people",
      "leases",
      "tasks",
      "documents",
    ]);
    expect(getWorkspaceSearchScopes("manager")).toEqual(["tasks"]);
    expect(getWorkspaceSearchScopes("member")).toEqual(["tasks"]);

    expect(getWorkspaceSearchActions("manager").map((action) => action.href)).toEqual([
      "/maintenance",
      "/tasks",
    ]);
    expect(getWorkspaceSearchActions("member").map((action) => action.href)).toEqual([
      "/tasks",
    ]);
    expect(getWorkspaceSearchActions("member")).not.toContainEqual(
      expect.objectContaining({ href: "/properties" }),
    );
  });
});

describe("searchWorkspace", () => {
  it("trims the query, requires two characters, and does not touch data for short input", async () => {
    const { client, queries } = createSearchClient({});

    await expect(
      searchWorkspace({
        client: client as never,
        context: { organizationId: "org-1", role: "admin" },
        query: "  a  ",
      }),
    ).resolves.toEqual([]);
    expect(queries).toEqual([]);
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
      leases: [
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
      context: { organizationId: "org-1", role: "admin" },
      query: "  boiler  ",
    });

    expect(new Set(queries.map((query) => query.table))).toEqual(
      new Set(["documents", "leases", "people", "properties", "tasks", "units"]),
    );
    expect(queries).not.toHaveLength(0);
    expect(queries.every((query) => query.limit !== undefined && query.limit! <= 20)).toBe(true);
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
        expect.objectContaining({ href: "/properties/property-1", kind: "property" }),
        expect.objectContaining({ href: "/units/unit-1", kind: "unit" }),
        expect.objectContaining({ href: "/people/person-1", kind: "person" }),
        expect.objectContaining({ kind: "lease", label: "Boiler Tenant" }),
        expect.objectContaining({ kind: "maintenance", label: "Boiler leak" }),
        expect.objectContaining({ kind: "document", label: "boiler-photo.jpg" }),
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
        organizationId: "org-1",
        role: "manager",
      },
      query: "pump",
    });

    expect(new Set(managerSearch.queries.map((query) => query.table))).toEqual(
      new Set(["tasks"]),
    );
    expect(
      managerSearch.queries.every((query) =>
        query.filters.some(
          (filter) => filter.column === "branch_id" && filter.value === "branch-a",
        ),
      ),
    ).toBe(true);

    const memberSearch = createSearchClient({ tasks: [] });
    await searchWorkspace({
      client: memberSearch.client as never,
      context: {
        branchId: "branch-a",
        organizationId: "org-1",
        personId: "person-1",
        role: "member",
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
            filter.column === "assignee_person_id" && filter.value === "person-1",
        ),
      ),
    ).toBe(true);
    expect(
      memberSearch.queries.every((query) =>
        query.filters.some(
          (filter) => filter.column === "branch_id" && filter.value === "branch-a",
        ),
      ),
    ).toBe(true);
  });

  it("escapes LIKE wildcards without constructing PostgREST or-filter grammar", async () => {
    const { client, queries } = createSearchClient({ properties: [] });

    await searchWorkspace({
      client: client as never,
      context: { organizationId: "org-1", role: "admin" },
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

  it("matches role-visible navigation synonyms without exposing hidden actions", async () => {
    const { client } = createSearchClient({ tasks: [] });

    await expect(
      searchWorkspace({
        client: client as never,
        context: { organizationId: "org-1", role: "manager" },
        query: "work orders",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ href: "/maintenance", kind: "action" }),
    ]);

    await expect(
      searchWorkspace({
        client: client as never,
        context: { organizationId: "org-1", role: "member" },
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
        label: index === 24 ? "Boiler" : `Boiler ${String(index).padStart(2, "0")}`,
      }),
    );

    const first = rankWorkspaceSearchResults("boiler", candidates);
    const second = rankWorkspaceSearchResults("boiler", [...candidates].reverse());

    expect(first).toHaveLength(20);
    expect(first).toEqual(second);
    expect(first[0]).toEqual(expect.objectContaining({ id: "24", label: "Boiler" }));
  });
});
