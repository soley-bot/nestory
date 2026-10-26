import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTimelineScreenData } from "./timeline";
import { OPERATIONS_TEMPLATE } from "@/lib/auth/role-templates";
import { PERMISSION_KEYS } from "@/lib/auth/permission-catalog";
import type { Database } from "@/types/database";

const server = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: server.create }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({
  withFinancialReadContext: vi.fn(async (_organizationId, read) => read({ generation: 0, financial_start_date: null })),
}));

const leaseId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const timelineId = "33333333-3333-4333-8333-333333333333";
const ledgerId = "44444444-4444-4444-8444-444444444444";
const permissionKeys = new Set(OPERATIONS_TEMPLATE.permissions);
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let ignoreActivityTypeFilter: boolean;
const requests: URL[] = [];

function activity(entityType: string, entityId: string, values: Row, index = 1): Row {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`,
    organization_id: "org-1",
    entity_type: entityType,
    entity_id: entityId,
    action: "updated",
    created_at: "2026-10-20T12:00:00Z",
    previous_values: { depositAmount: 123456 },
    new_values: values,
  };
}

beforeEach(() => {
  requests.length = 0;
  ignoreActivityTypeFilter = false;
  tables = {
    activity_logs: [
      activity("lease", leaseId, { depositAmount: 987654, depositCurrency: "PRIVATE_CURRENCY" }),
      activity("ledger_entry", ledgerId, { amount: 654321, currency: "PRIVATE_CURRENCY" }, 2),
      activity("financial_month", "2026-10-01", { reason: "Private close reason" }, 3),
      { ...activity("task", taskId, { title: "Visible maintenance case" }, 4), previous_values: null },
    ],
    tasks: [{ id: taskId, organization_id: "org-1" }],
  };
  // Real query builder, synthetic HTTP transport: exercise the outgoing filters
  // and serialized server response without credentials or a hosted database.
  server.create.mockResolvedValue(createClient<Database>("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const table = url.pathname.split("/").at(-1)!;
      let rows = tables[table] ?? [];
      for (const [column, filter] of url.searchParams) {
        if (["select", "order", "offset", "limit"].includes(column)) continue;
        if (table === "activity_logs" && column === "entity_type" && ignoreActivityTypeFilter) continue;
        if (filter.startsWith("eq.")) rows = rows.filter((row) => String(row[column]) === filter.slice(3));
        else if (filter === "is.null") rows = rows.filter((row) => row[column] == null);
        else if (filter.startsWith("in.(")) {
          const values = filter.slice(4, -1).split(",");
          rows = rows.filter((row) => values.includes(String(row[column])));
        } else throw new Error(`Unexpected fixture filter: ${column}=${filter}`);
      }
      const count = rows.length;
      rows = rows.slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("limit") ?? count));
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(count - 1, 0)}/${count}` },
      });
    } },
  }));
});

describe("timeline recent activity server boundary", () => {
  it.each(["property", "global"] as const)("keeps Operations lease and financial snapshots out of the %s response", async (scope) => {
    const data = await getTimelineScreenData("org-1", undefined, { permissionKeys, scope });
    expect(data.recentChanges.map((change) => change.recordLabel)).toEqual(["Visible maintenance case"]);
    const serialized = JSON.stringify(data);
    for (const privateValue of ["987654", "123456", "654321", "PRIVATE_CURRENCY", "Private close reason", leaseId]) {
      expect(serialized).not.toContain(privateValue);
    }
    const filter = requests.find((url) => url.pathname.endsWith("activity_logs"))!.searchParams.get("entity_type");
    expect(filter).toBe("in.(timeline_event,document,task,tenant_request,property,unit)");
    expect(requests.some((url) => url.pathname.endsWith("leases") || url.pathname.endsWith("ledger_entries"))).toBe(false);
  });

  it("filters before the recent-change limit so unauthorized entries cannot crowd out allowed history", async () => {
    const visible = tables.activity_logs.at(-1)!;
    tables.activity_logs = [
      ...Array.from({ length: 6 }, (_, index) => activity("lease", leaseId, { depositAmount: 987654 }, index + 10)),
      visible,
    ];
    const data = await getTimelineScreenData("org-1", undefined, { permissionKeys, scope: "property" });
    expect(data.recentChanges.map((change) => change.recordLabel)).toEqual(["Visible maintenance case"]);
  });

  it("also filters unauthorized response rows if a transport returns them despite the query filter", async () => {
    ignoreActivityTypeFilter = true;
    const data = await getTimelineScreenData("org-1", undefined, { permissionKeys, scope: "property" });
    expect(data.recentChanges.map((change) => change.recordLabel)).toEqual(["Visible maintenance case"]);
    expect(JSON.stringify(data)).not.toContain("deposit");
    expect(JSON.stringify(data)).not.toContain("Private close reason");
  });

  it("does not request recent snapshots when caller permissions were omitted", async () => {
    const data = await getTimelineScreenData("org-1");
    expect(data.recentChanges).toEqual([]);
    expect(requests.some((url) => url.pathname.endsWith("activity_logs"))).toBe(false);
  });

  it("retains lease and finance detail for authorized and readable source records", async () => {
    tables.leases = [{ id: leaseId, organization_id: "org-1" }];
    tables.ledger_entries = [{ id: ledgerId, organization_id: "org-1" }];
    const data = await getTimelineScreenData("org-1", undefined, { permissionKeys: new Set(PERMISSION_KEYS) });
    expect(data.recentChanges).toHaveLength(4);
    expect(JSON.stringify(data)).toContain("987654");
    expect(JSON.stringify(data)).toContain("654321");
    expect(JSON.stringify(data)).toContain("Private close reason");
  });

  it("redacts both snapshots of a timeline event rejected by source-record RLS", async () => {
    tables.activity_logs = [activity("timeline_event", timelineId, {
      title: "Private lease event", depositAmount: 987654, depositCurrency: "PRIVATE_CURRENCY",
      nested: { confidential: "PRIVATE_NESTED_VALUE" },
    })];
    const data = await getTimelineScreenData("org-1", undefined, { permissionKeys, scope: "property" });
    expect(data.recentChanges).toHaveLength(1);
    expect(data.recentChanges[0]).toMatchObject({ recordLabel: "Source record unavailable", details: [], href: undefined });
    const serialized = JSON.stringify(data);
    for (const privateValue of ["987654", "123456", "PRIVATE_CURRENCY", "PRIVATE_NESTED_VALUE", "Private lease event"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});
