import { describe, expect, it, vi } from "vitest";
import { getMaintenanceScreenData } from "@/features/maintenance/data/maintenance";
import type {
  MaintenanceActor,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getMaintenanceScreenData reference loading", () => {
  it("loads people only for visible cases and executable member identities", async () => {
    const supabase = createMaintenanceSupabaseStub();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getMaintenanceScreenData(
      "org-1",
      makeViewQuery(),
      { role: "admin" },
    );

    expect(
      supabase.inCalls.find(
        (call) => call.table === "people" && call.column === "id",
      )?.values,
    ).toEqual(["visible-assignee", "visible-vendor", "member-option"]);
    expect(result.cases[0]).toMatchObject({
      assigneeLabel: "Former Assignee",
      vendorLabel: "Former Vendor (historical/inactive)",
    });
    expect(result.staffOptions).toEqual([
      {
        branchId: "branch-visible",
        id: "member-option",
        label: "Active Member",
      },
    ]);
    expect(result.vendorOptions).toEqual([
      { id: "active-vendor", label: "Active Vendor" },
    ]);
    expect(result.summary).toMatchObject({ total: 2 });
    expect(result.summary.propertyStats).toContainEqual(
      expect.objectContaining({
        open: 1,
        propertyId: "property-off-page",
        propertyLabel: "P2 - Off-page Property",
      }),
    );
    expect(result.summary.unitStats).toContainEqual(
      expect.objectContaining({
        open: 1,
        unitId: "unit-off-page",
        unitLabel: "Unit A2",
      }),
    );
  });

  it("batches required executable member people and role references", async () => {
    const supabase = createMaintenanceSupabaseStub({ memberIdentityCount: 205 });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getMaintenanceScreenData(
      "org-1",
      makeViewQuery(),
      { role: "admin" },
    );

    const peopleIdCalls = supabase.inCalls.filter(
      (call) => call.table === "people" && call.column === "id",
    );
    const staffRoleCalls = supabase.inCalls.filter(
      (call) => call.table === "person_roles" && call.column === "person_id",
    );
    expect(peopleIdCalls).toHaveLength(3);
    expect(staffRoleCalls).toHaveLength(3);
    expect(peopleIdCalls.every((call) => call.values.length <= 100)).toBe(true);
    expect(staffRoleCalls.every((call) => call.values.length <= 100)).toBe(true);
    expect(result.staffOptions).toHaveLength(205);
  });

  it.each([
    {
      actor: { role: "admin" } as MaintenanceActor,
      excludedColumns: ["assignee_person_id", "branch_id"],
      expectedFilter: undefined,
    },
    {
      actor: { branchId: "branch-visible", role: "manager" } as MaintenanceActor,
      excludedColumns: ["assignee_person_id"],
      expectedFilter: ["branch_id", "branch-visible"] as const,
    },
    {
      actor: { personId: "visible-assignee", role: "member" } as MaintenanceActor,
      excludedColumns: ["branch_id"],
      expectedFilter: ["assignee_person_id", "visible-assignee"] as const,
    },
  ])("preserves $actor.role task scoping", async ({ actor, excludedColumns, expectedFilter }) => {
    const supabase = createMaintenanceSupabaseStub();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getMaintenanceScreenData("org-1", makeViewQuery(), actor);

    const taskFilters = supabase.eqCalls.filter((call) => call.table === "tasks");
    expect(taskFilters).toHaveLength(2);
    if (expectedFilter) {
      expect(taskFilters.every((call) =>
        call.filters.some(
          ([column, value]) =>
            column === expectedFilter[0] && value === expectedFilter[1],
        ),
      )).toBe(true);
    }
    for (const column of excludedColumns) {
      expect(taskFilters.every((call) =>
        call.filters.every(([filterColumn]) => filterColumn !== column),
      )).toBe(true);
    }
    if (actor.role === "member") {
      expect(result.summary.propertyStats).toContainEqual(
        expect.objectContaining({
          propertyId: "property-off-page",
          propertyLabel: "P2 - Off-page Property",
        }),
      );
      expect(result.summary.unitStats).toContainEqual(
        expect.objectContaining({
          unitId: "unit-off-page",
          unitLabel: "Unit A2",
        }),
      );
      expect(result).toMatchObject({
        branchOptions: [],
        propertyOptions: [],
        staffOptions: [],
        unitOptions: [],
        vendorOptions: [],
      });
    }
  });
});

function makeViewQuery(): MaintenanceViewQuery {
  return {
    archiveState: "active",
    month: "2026-07",
    page: 1,
    pageSize: 1,
    priority: "all",
    propertyId: "all",
    query: "",
    review: "all",
    scope: "all",
    sort: "created_desc",
    status: "all",
    taskId: "all",
    unitId: "all",
    view: "inbox",
  };
}

const visibleTask = makeTask({
  assignee_person_id: "visible-assignee",
  branch_id: "branch-visible",
  id: "task-visible",
  property_id: "property-visible",
  tenant_request_id: "request-visible",
  unit_id: "unit-visible",
  vendor_person_id: "visible-vendor",
});

const offPageTask = makeTask({
  assignee_person_id: "visible-assignee",
  branch_id: "branch-off-page",
  id: "task-off-page",
  property_id: "property-off-page",
  tenant_request_id: "request-off-page",
  unit_id: "unit-off-page",
  vendor_person_id: "off-page-vendor",
});

function makeTask(overrides: Record<string, unknown>) {
  return {
    actual_cost_amount: null,
    actual_cost_currency: null,
    archived_at: null,
    assignee_person_id: null,
    blocked_reason: null,
    branch_id: null,
    category: "General",
    checklist: [],
    completed_at: null,
    cost_estimate_amount: null,
    cost_estimate_currency: null,
    created_at: "2026-07-01T00:00:00.000Z",
    description: null,
    due_date: null,
    due_time: null,
    id: "task",
    ledger_entry_id: null,
    priority: "normal",
    property_id: "property",
    recurrence_frequency: "none",
    reminder_date: null,
    reminder_time: null,
    status: "pending",
    tenant_request_id: "request",
    timeline_event_id: null,
    title: "Maintenance task",
    unit_id: null,
    vendor_person_id: null,
    ...overrides,
  };
}

type QueryCall = {
  column: string;
  table: string;
  values: unknown[];
};

type EqCall = {
  filters: Array<[string, unknown]>;
  table: string;
};

function createMaintenanceSupabaseStub({
  memberIdentityCount = 1,
}: {
  memberIdentityCount?: number;
} = {}) {
  const inCalls: QueryCall[] = [];
  const eqCalls: EqCall[] = [];
  const memberPersonIds = memberIdentityCount === 1
    ? ["member-option"]
    : Array.from(
        { length: memberIdentityCount },
        (_, index) => `member-option-${index + 1}`,
      );
  const rowsByTable: Record<string, Array<Record<string, unknown>>> = {
    activity_logs: [],
    documents: [],
    organization_branches: [
      { code: "B1", id: "branch-visible", name: "Visible Branch" },
      { code: "B2", id: "branch-off-page", name: "Off-page Branch" },
    ],
    people: [
      {
        archived_at: "2026-06-01T00:00:00.000Z",
        display_name: "Former Assignee",
        id: "visible-assignee",
        organization_id: "org-1",
      },
      {
        archived_at: "2026-06-01T00:00:00.000Z",
        display_name: "Former Vendor",
        id: "visible-vendor",
        organization_id: "org-1",
      },
      ...memberPersonIds.map((personId, index) => ({
        archived_at: null,
        display_name: memberIdentityCount === 1
          ? "Active Member"
          : `Active Member ${index + 1}`,
        id: personId,
        organization_id: "org-1",
      })),
      {
        archived_at: null,
        display_name: "Off-page Vendor",
        id: "off-page-vendor",
        organization_id: "org-1",
      },
    ],
    person_roles: memberPersonIds.map((personId) => ({
      archived_at: null,
      organization_id: "org-1",
      person_id: personId,
      role: "staff",
      status: "active",
    })),
    properties: [
      { code: "P1", id: "property-visible", name: "Visible Property" },
      { code: "P2", id: "property-off-page", name: "Off-page Property" },
    ],
    units: [
      { id: "unit-visible", property_id: "property-visible", unit_number: "A1" },
      { id: "unit-off-page", property_id: "property-off-page", unit_number: "A2" },
    ],
  };

  const client = {
    from: vi.fn((table: string) =>
      createQuery(table, rowsByTable, inCalls, eqCalls),
    ),
    rpc: vi.fn(async (name: string) => {
      if (name === "get_maintenance_execution_members") {
        return {
          data: memberPersonIds.map((personId) => ({
            branch_id: "branch-visible",
            person_id: personId,
          })),
          error: null,
        };
      }
      if (name === "get_maintenance_vendor_options") {
        return {
          data: [{ id: "active-vendor", label: "Active Vendor" }],
          error: null,
        };
      }
      return { data: [], error: null };
    }),
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn(async () => ({ data: [], error: null })),
      })),
    },
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;

  return { client, eqCalls, inCalls };
}

function createQuery(
  table: string,
  rowsByTable: Record<string, Array<Record<string, unknown>>>,
  inCalls: QueryCall[],
  eqCalls: EqCall[],
) {
  const eqFilters: Array<[string, unknown]> = [];
  const inFilters: Array<[string, unknown[]]> = [];
  let rangeEnd: number | undefined;

  const query = {
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    gte: () => query,
    in: (column: string, values: unknown[]) => {
      inFilters.push([column, values]);
      inCalls.push({ column, table, values });
      return query;
    },
    is: () => query,
    limit: () => query,
    lt: () => query,
    lte: () => query,
    neq: () => query,
    not: () => query,
    or: () => query,
    order: () => query,
    range: (_start: number, end: number) => {
      rangeEnd = end;
      return query;
    },
    select: () => query,
    then: (
      onFulfilled: (value: { count: number | null; data: unknown[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      eqCalls.push({ filters: [...eqFilters], table });
      const rows = table === "tasks"
        ? rangeEnd === 0
          ? [visibleTask]
          : [visibleTask, offPageTask]
        : applyFilters(rowsByTable[table] ?? [], eqFilters, inFilters);
      return Promise.resolve({
        count: table === "tasks" ? 2 : null,
        data: rows,
        error: null,
      }).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function applyFilters(
  rows: Array<Record<string, unknown>>,
  eqFilters: Array<[string, unknown]>,
  inFilters: Array<[string, unknown[]]>,
) {
  return rows.filter((row) =>
    eqFilters.every(([column, value]) => row[column] === undefined || row[column] === value) &&
    inFilters.every(([column, values]) => values.includes(row[column])),
  );
}
