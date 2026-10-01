import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { buildMaintenanceSavedViewHref } from "@/features/maintenance/maintenance.hrefs";
import type { MaintenanceActor } from "@/features/maintenance/maintenance.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createPortfolioSearch } from "@/lib/search/portfolio";
import { loadPortfolioSearch } from "@/lib/search/portfolio.server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/search/portfolio.server", () => ({ loadPortfolioSearch: vi.fn() }));

const propertyId = "10000000-0000-4000-8000-000000000001";
const unitId = "20000000-0000-4000-8000-000000000001";
const actor: MaintenanceActor = {
  branchId: "branch-1", dataScope: "assigned", personId: "person-1", workflowMode: "assigned",
};
const scopedParams = {
  month: "2026-06", pageSize: "10", priority: "high", propertyId, query: "leak", unitId, view: "list",
};
const queueCounts = { completed: 11, open: 29, overdue: 12, readyForReview: 8, total: 43, upcoming: 17 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  vi.mocked(loadPortfolioSearch).mockResolvedValue(createPortfolioSearch([], []));
});
afterEach(() => vi.useRealTimers());

describe("Maintenance filtering and queue destinations", () => {
  it.each([
    ["all", 43, 5, 3],
    ["open", 29, 3, 9],
    ["completed", 11, 2, 1],
  ] as const)("loads %s records with exact counts and a complete last page", async (review, total, page, lastPageSize) => {
    const fixture = installFixture();
    const result = await load({ review, page: String(page) });
    expect(result.pagination).toMatchObject({ page, totalCount: total, totalPages: page, to: total });
    expect(result.cases).toHaveLength(lastPageSize);
    expect(result.summary.total).toBe(total);
    if (review === "completed") expect(result.cases.every(row => row.status === "completed")).toBe(true);
    if (review === "open") expect(result.cases.every(row => row.isOpen)).toBe(true);
    expect(fixture.reads.filter(read => read.table === "tasks").every(read =>
      read.filters.includes("organization_id=org-1") && read.filters.includes("assignee_person_id=person-1") &&
      read.filters.includes("branch_id=branch-1"),
    )).toBe(true);
  });

  it("returns Completed records for the status selector and a status-only deep link", async () => {
    installFixture();
    for (const params of [{ review: "all", status: "completed" }, { status: "completed" }]) {
      const result = await load(params);
      expect(result.pagination.totalCount).toBe(11);
      expect(result.cases).toHaveLength(10);
      expect(result.cases.every(row => row.status === "completed")).toBe(true);
    }
  });

  it("counts each queue's destination while keeping the displayed summary filtered", async () => {
    installFixture();
    const source = { ...scopedParams, review: "all", status: "completed", page: "2", sort: "cost_desc" };
    const result = await load(source, true);
    expect(result.summary.total).toBe(11);
    expect(result.queueCounts).toEqual(queueCounts);
    for (const [review, key] of [
      ["all", "total"], ["open", "open"], ["completed", "completed"],
      ["overdue", "overdue"], ["upcoming", "upcoming"], ["review_completion", "readyForReview"],
    ] as const) {
      const href = buildMaintenanceSavedViewHref("/maintenance", new URLSearchParams(source), review);
      const params = new URL(href, "https://fixture.test").searchParams;
      const destination = await load(Object.fromEntries(params));
      expect(destination.pagination.totalCount).toBe(queueCounts[key]);
      expect(params.has("status")).toBe(false);
      expect(params.has("page")).toBe(false);
      expect(params.has("pageSize")).toBe(false);
      for (const name of ["propertyId", "unitId", "priority", "query", "month"] as const) {
        expect(params.get(name)).toBe(source[name]);
      }
    }
  });

  it("keeps zero matches empty and clamps an out-of-range page", async () => {
    installFixture();
    const result = await load({ query: "no-match", page: "99", review: "all" }, true);
    expect(result.cases).toEqual([]);
    expect(result.pagination).toMatchObject({ page: 1, from: 0, to: 0, totalCount: 0, totalPages: 1 });
    expect(result.summary.total).toBe(0);
    expect(result.queueCounts).toEqual({ completed: 0, open: 0, overdue: 0, readyForReview: 0, total: 0, upcoming: 0 });
  });

  it("clamps a stale Completed page to its populated last page", async () => {
    installFixture();
    const result = await load({ review: "completed", page: "99" }, true);
    expect(result.pagination).toMatchObject({ page: 2, from: 11, to: 11, totalCount: 11, totalPages: 2 });
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.status).toBe("completed");
    expect(result.queueCounts).toEqual(queueCounts);
  });

  it.each(["all", "archived"])("retains the %s archive scope in queue destinations", async (archiveState) => {
    installFixture();
    const source = { ...scopedParams, archiveState, review: "completed" };
    const result = await load(source, true);
    const href = buildMaintenanceSavedViewHref("/maintenance", new URLSearchParams(source), "all");
    const destination = await load(Object.fromEntries(new URL(href, "https://fixture.test").searchParams));
    expect(result.queueCounts?.total).toBe(archiveState === "all" ? 44 : 1);
    expect(destination.pagination.totalCount).toBe(result.queueCounts?.total);
  });

  it("counts the destination scope when leaving a focused record", async () => {
    const taskId = "30000000-0000-4000-8000-000000000001";
    installFixture([task(taskId, "pending", null, { property_id: "other-property" })]);
    const source = { ...scopedParams, taskId, review: "all" };
    const result = await load(source, true);
    expect(result.cases.map(row => row.id)).toEqual([taskId]);
    expect(result.summary.total).toBe(1);
    expect(result.queueCounts).toEqual(queueCounts);
    const href = buildMaintenanceSavedViewHref("/maintenance", new URLSearchParams(source), "all");
    const destination = await load(Object.fromEntries(new URL(href, "https://fixture.test").searchParams));
    expect(destination.pagination.totalCount).toBe(result.queueCounts?.total);
  });

  it("matches the Upcoming destination at both date boundaries", async () => {
    installFixture([
      task("at-window-end", "blocked", "2026-06-22"), task("outside-window", "pending", "2026-06-23"),
      task("no-date", "pending", null), task("completed-today", "completed", "2026-06-15"),
      task("cancelled-today", "cancelled", "2026-06-15"),
    ]);
    const result = await load({ review: "upcoming" }, true);
    expect(result.pagination.totalCount).toBe(18);
    expect(result.queueCounts?.upcoming).toBe(18);
  });

  it("reuses an unfiltered summary and skips queue reads on surfaces that do not request them", async () => {
    for (const [review, include] of [["all", true], ["completed", false]] as const) {
      const fixture = installFixture();
      const result = await load({ review }, include);
      expect(fixture.reads.filter(read => read.table === "tasks")).toHaveLength(2);
      expect(result.queueCounts).toEqual(include ? queueCounts : undefined);
    }
  });

  it("loads only count and search fields for the broader queue scope", async () => {
    const fixture = installFixture();
    await load({ review: "completed" }, true);
    const taskReads = fixture.reads.filter(read => read.table === "tasks");
    expect(taskReads).toHaveLength(3);
    expect(taskReads.filter(read => !read.projection.includes("actual_cost_amount")).map(read => read.projection)).toEqual([
      "id, status, due_date, title, description, category, priority, property_id, unit_id",
    ]);
  });

  it.each([
    [{ ...actor, dataScope: "assigned" }, 43],
    [{ ...actor, dataScope: "branch", workflowMode: "coordinator" }, 44],
    [{ dataScope: "organization", workflowMode: "coordinator" }, 45],
  ] as const)("keeps queue counts inside the reader's authority (%s)", async (reader, total) => {
    installFixture();
    const result = await load({ review: "all" }, true, reader);
    expect(result.pagination.totalCount).toBe(total);
    expect(result.queueCounts?.total).toBe(total);
    expect(result.cases.some(row => row.id === "other-organization")).toBe(false);
  });

  it("counts beyond the summary batch and returns only the selected page", async () => {
    const extra = Array.from({ length: 1025 }, (_, index) => task("extra-" + index, "pending", "2026-06-14"));
    const fixture = installFixture(extra);
    const result = await load({ review: "completed" }, true);
    expect(result.cases).toHaveLength(10);
    expect(result.summary.total).toBe(11);
    expect(result.queueCounts).toMatchObject({ total: 1068, open: 1054, completed: 11 });
    expect(fixture.reads.some(read => read.table === "tasks" && read.from === 1000)).toBe(true);
  });

  it("keeps counts and rows consistent for an oversized owner search", async () => {
    installFixture();
    vi.mocked(loadPortfolioSearch).mockResolvedValue(createPortfolioSearch(Array.from({ length: 420 }, (_, index) => ({
      id: index ? "10000000-0000-4000-8000-" + String(index + 1).padStart(12, "0") : propertyId,
      code: "P" + index, name: "Property", ownerNames: ["Shared Owner"],
    })), []));
    const result = await load({ query: "shared", review: "open", page: "3" }, true);
    expect(result.pagination).toMatchObject({ page: 3, totalCount: 30, to: 30 });
    expect(result.cases).toHaveLength(10);
    expect(result.queueCounts).toEqual({ ...queueCounts, open: 30, total: 44 });
  });
});

async function load(
  params: Record<string, string | undefined>, includeQueueCounts = false, reader: MaintenanceActor = actor,
) {
  return getMaintenanceScreenData("org-1", parseMaintenanceSearchParams({ ...scopedParams, ...params }),
    reader, { canAssignCase: false }, { includeQueueCounts });
}

function task(id: string, status: string, dueDate: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id, organization_id: "org-1", branch_id: "branch-1", assignee_person_id: "person-1",
    property_id: propertyId, unit_id: unitId, title: "Leak repair", description: null, category: "Plumbing",
    priority: "high", status, due_date: dueDate, due_time: null, reminder_date: null, reminder_time: null,
    created_at: "2026-06-01T00:00:00.000Z", archived_at: null, tenant_request_id: "request-" + id,
    actual_cost_amount: null, actual_cost_currency: null, cost_estimate_amount: null, cost_estimate_currency: null,
    vendor_person_id: null, timeline_event_id: null, checklist: [], recurrence_frequency: "none", completed_at: null,
    ...overrides,
  };
}

type FixtureRead = { table: string; from: number; projection: string; filters: string[] };
type FixtureRow = Record<string, unknown>;

function installFixture(extra: FixtureRow[] = []) {
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => task("overdue-" + i, "pending", "2026-06-14")),
    ...Array.from({ length: 9 }, (_, i) => task("today-" + i, "scheduled", "2026-06-15")),
    ...Array.from({ length: 8 }, (_, i) => task("review-" + i, "ready_for_review", "2026-06-20")),
    ...Array.from({ length: 11 }, (_, i) => task("completed-" + i, "completed", "2026-06-14")),
    ...Array.from({ length: 3 }, (_, i) => task("cancelled-" + i, "cancelled", "2026-06-16")),
    task("other-assignee", "pending", null, { assignee_person_id: "person-2" }),
    task("other-branch", "pending", null, { branch_id: "branch-2" }),
    task("other-organization", "pending", null, { organization_id: "org-2" }),
    task("archived", "pending", null, { archived_at: "2026-06-01T00:00:00.000Z" }),
    task("other-property", "pending", null, { property_id: "other-property" }),
    task("other-unit", "pending", null, { unit_id: "other-unit" }),
    task("other-priority", "pending", null, { priority: "normal" }),
    task("other-search", "pending", null, { title: "Roof repair" }),
    ...extra,
  ];
  const reads: FixtureRead[] = [];
  const tables: Record<string, FixtureRow[]> = {
    tasks: rows,
    properties: [{ id: propertyId, organization_id: "org-1", code: "P1", name: "Property", archived_at: null }],
    units: [{ id: unitId, organization_id: "org-1", property_id: propertyId, unit_number: "1", archived_at: null }],
    organization_branches: [{ id: "branch-1", organization_id: "org-1", name: "Main", code: "B1", archived_at: null }],
    people: [{ id: "person-1", organization_id: "org-1", display_name: "Fixture Member", archived_at: null }],
  };
  const client = {
    from: (table: string) => fixtureQuery(table, tables[table] ?? [], reads),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client);
  return { reads };
}

function fixtureQuery(table: string, rows: FixtureRow[], reads: FixtureRead[]) {
  const predicates: Array<(row: FixtureRow) => boolean> = [];
  const filters: string[] = [];
  const orders: Array<{ column: string; ascending: boolean; nullsFirst: boolean }> = [];
  let from = 0, to = Number.MAX_SAFE_INTEGER, projection = "*";
  const query = {
    select: (value: string) => { projection = value; return query; },
    eq: (column: string, value: unknown) => { filters.push(column + "=" + value); predicates.push(row => row[column] === value); return query; },
    in: (column: string, values: unknown[]) => { predicates.push(row => values.includes(row[column])); return query; },
    is: (column: string, value: unknown) => { predicates.push(row => row[column] === value); return query; },
    not: (column: string, operator: string, value: unknown) => {
      if (operator !== "is") throw new Error("Unsupported fixture operator " + operator);
      predicates.push(row => row[column] !== value); return query;
    },
    neq: (column: string, value: unknown) => { predicates.push(row => row[column] !== value); return query; },
    lt: (column: string, value: string) => { predicates.push(row => row[column] != null && String(row[column]) < value); return query; },
    lte: (column: string, value: string) => { predicates.push(row => row[column] != null && String(row[column]) <= value); return query; },
    gte: (column: string, value: string) => { predicates.push(row => row[column] != null && String(row[column]) >= value); return query; },
    or: (expression: string) => {
      const alternatives = expression.split(/,(?=[a-z_]+\.)/).map(condition => {
        const match = /^([a-z_]+)\.ilike\.(.+)$/.exec(condition);
        if (!match) throw new Error("Unsupported fixture expression " + condition);
        const pattern = String(JSON.parse(match[2])).replace(/^%|%$/g, "").toLowerCase();
        return (row: FixtureRow) => row[match[1]] != null && String(row[match[1]]).toLowerCase().includes(pattern);
      });
      predicates.push(row => alternatives.some(predicate => predicate(row))); return query;
    },
    order: (column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
      orders.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst ?? false }); return query;
    },
    range: (start: number, end: number) => { from = start; to = end; return query; },
    limit: (count: number) => { to = from + count - 1; return query; },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      reads.push({ table, from, projection, filters: [...filters] });
      const matches = rows.filter(row => predicates.every(predicate => predicate(row))).sort((a, b) => {
        for (const order of orders) {
          const first = a[order.column], second = b[order.column];
          if (first === second) continue;
          if (first == null) return order.nullsFirst ? -1 : 1;
          if (second == null) return order.nullsFirst ? 1 : -1;
          const difference = String(first).localeCompare(String(second));
          return order.ascending ? difference : -difference;
        }
        return 0;
      });
      const fields = projection.split(",").map(field => field.trim());
      const data = matches.slice(from, to + 1).map(row => projection === "*" ? row :
        Object.fromEntries(fields.map(field => [field, row[field]])));
      return Promise.resolve({ data, count: matches.length, error: null }).then(resolve, reject);
    },
  };
  return query;
}
