import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { parseTimelineSearchParams } from "@/features/timeline/timeline.filters";
import type { Database } from "@/types/database";

const server = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: server.create }));

const ids = {
  busy: "11111111-1111-4111-8111-111111111111",
  quiet: "22222222-2222-4222-8222-222222222222",
  inaccessible: "33333333-3333-4333-8333-333333333333",
  empty: "66666666-6666-4666-8666-666666666666",
  property: "44444444-4444-4444-8444-444444444444",
};
type Row = Record<string, unknown>;
const requests: Array<{ url: URL; method: string }> = [];
let tables: Record<string, Row[]>;
const changeId = (index: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
let historyError = false;
let omitHistoryCount = false;
let truncateHistoryPage = false;

function activity(entityId: string, index: number, createdAt: string): Row {
  return { id: changeId(index), organization_id: "org-1", entity_type: "timeline_event", entity_id: entityId, action: "updated", previous_values: { title: "Before" }, new_values: { title: "After" }, created_at: createdAt };
}
function event(id: string): Row {
  return { id, organization_id: "org-1", property_id: ids.property, unit_id: null, lease_id: null, ledger_entry_id: null, event_date: "2026-07-20", event_type: "General Note", title: "Synthetic event", description: "", cost_amount: null, cost_currency: null, created_by: null, archived_at: null };
}

beforeEach(() => {
  requests.length = 0;
  historyError = false;
  omitHistoryCount = false;
  truncateHistoryPage = false;
  tables = {
    timeline_events: [event(ids.busy), event(ids.quiet), event(ids.empty)],
    properties: [{ id: ids.property, organization_id: "org-1", name: "Synthetic property", code: "TEST", archived_at: null }],
    activity_logs: [
      ...Array.from({ length: 130 }, (_, index) => activity(ids.busy, index, "2026-07-20T12:00:00Z")),
      activity(ids.quiet, 1000, "2026-07-19T12:00:00Z"),
      activity(ids.quiet, 1001, "2026-07-18T12:00:00Z"),
      { ...activity(ids.quiet, 2000, "2026-07-21T12:00:00Z"), organization_id: "org-2" },
    ],
  };
  // Exercise the installed Supabase query builder with a synthetic HTTP transport.
  // Unreturned events represent rows excluded by existing access policy; no hosted
  // project, credentials, service role or actual network requests are involved.
  server.create.mockResolvedValue(createClient<Database>("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      const table = url.pathname.split("/").at(-1)!;
      const selectedHistory = table === "activity_logs" && url.searchParams.has("entity_id");
      if (selectedHistory && historyError) return new Response(JSON.stringify({ message: "Synthetic read denied", code: "42501" }), { status: 403 });
      let rows = tables[table] ?? [];
      for (const [column, filter] of url.searchParams) {
        if (["select", "order", "offset", "limit"].includes(column)) continue;
        if (column === "or") {
          const match = filter.match(/^\(created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([^()]+)\)\)$/);
          if (!match || match[1] !== match[2]) throw new Error(`Unexpected cursor filter: ${filter}`);
          const timestamp = Date.parse(match[1]);
          rows = rows.filter(row => Date.parse(String(row.created_at)) < timestamp || (Date.parse(String(row.created_at)) === timestamp && String(row.id) < match[3]));
          continue;
        }
        if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[column]) === filter.slice(3));
        else if (filter === "is.null") rows = rows.filter(row => row[column] == null);
        else if (filter.startsWith("in.(")) {
          const values = filter.slice(4, -1).split(",");
          rows = rows.filter(row => values.includes(String(row[column])));
        } else throw new Error(`Unsupported fixture filter: ${column}=${filter}`);
      }
      const order = (url.searchParams.get("order") ?? "").split(",").filter(Boolean);
      rows = [...rows].sort((left, right) => {
        for (const clause of order) {
          const [column, direction] = clause.split(".");
          const comparison = String(left[column]).localeCompare(String(right[column]));
          if (comparison) return direction === "desc" ? -comparison : comparison;
        }
        return 0;
      });
      const count = rows.length;
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? count);
      rows = rows.slice(offset, offset + limit);
      if (selectedHistory && method !== "HEAD" && truncateHistoryPage) rows = rows.slice(0, 1);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!(selectedHistory && omitHistoryCount)) headers["Content-Range"] = `0-${Math.max(count - 1, 0)}/${count}`;
      return new Response(method === "HEAD" ? null : JSON.stringify(rows), { status: 200, headers });
    } },
  }));
});

describe("Timeline event history completeness", () => {
  it("reproduces the shared preview cap crowding out a quiet event", async () => {
    const data = await getTimelineScreenData("org-1");
    expect(data.events.find(row => row.id === ids.busy)!.activity).toHaveLength(120);
    expect(data.events.find(row => row.id === ids.quiet)!.activity).toHaveLength(0);
  });

  it("loads a quiet event independently of 130 newer changes on another event", async () => {
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "1" }));
    expect(data.events[0].activity.map(change => change.id)).toEqual([changeId(1000), changeId(1001)]);
    expect(data.events[0].activityPagination).toMatchObject({ page: 1, totalCount: 2, totalPages: 1 });
    expect(data.events[0].activity[0].target).toMatchObject({ focusMode: "exact", href: `/timeline?archiveState=all&eventId=${ids.quiet}` });
    for (const request of requests.filter(request => request.url.pathname.endsWith("activity_logs") && request.url.searchParams.has("entity_id"))) {
      expect(request.url.searchParams.get("organization_id")).toBe("eq.org-1");
      expect(request.url.searchParams.get("entity_type")).toBe("eq.timeline_event");
      expect(request.url.searchParams.get("entity_id")).toBe(`eq.${ids.quiet}`);
    }
  });

  it("makes every busy-event change reachable across stable ordered pages", async () => {
    const pages = [];
    let historyBefore: string | undefined;
    for (const historyPage of ["1", "2", "3"]) {
      const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.busy, historyPage, historyBefore }));
      pages.push(data.events[0]);
      historyBefore = data.events[0].activityPagination?.olderCursor;
    }
    expect(pages.map(page => page.activity.length)).toEqual([50, 50, 30]);
    const loaded = pages.flatMap(page => page.activity.map(change => change.id));
    expect(new Set(loaded).size).toBe(130);
    expect(loaded.at(-1)).toBe(changeId(0));
    expect(pages[0].recordCounts.activity).toBe(130);
    expect(pages[2].activityPagination).toMatchObject({ page: 3, from: 101, to: 130, totalCount: 130, totalPages: 3 });
    expect(requests.some(request => request.url.searchParams.get("order") === "created_at.desc,id.desc")).toBe(true);
  });

  it("does not omit or duplicate original entries when inserts arrive between pages, including timestamp ties", async () => {
    const originals = tables.activity_logs.filter(row => row.entity_id === ids.busy).map(row => row.id);
    const loaded: string[] = [];
    let historyBefore: string | undefined;
    for (const page of [1, 2, 3]) {
      const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.busy, historyPage: String(page), historyBefore }));
      loaded.push(...data.events[0].activity.map(row => row.id));
      historyBefore = data.events[0].activityPagination?.olderCursor;
      if (page === 1) tables.activity_logs.push(activity(ids.busy, 3000, "2026-07-21T12:00:00Z"), activity(ids.busy, 3001, "2026-07-20T12:00:00Z"));
    }
    expect(loaded).toHaveLength(130);
    expect(new Set(loaded)).toEqual(new Set(originals));
    expect(historyBefore).toBeUndefined();
    expect(requests.filter(request => request.url.searchParams.has("entity_id")).every(request => !request.url.searchParams.has("offset"))).toBe(true);
    const refreshed = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.busy, historyPage: "1" }));
    expect(refreshed.events[0].activity.slice(0, 2).map(row => row.id)).toEqual([changeId(3000), changeId(3001)]);
    expect(refreshed.events[0].recordCounts.activity).toBe(132);
  });

  it("rejects malformed cursor literals before building a database filter", async () => {
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "2", historyBefore: "2026-07-20T12:00:00Z|bad),id.gt.0" }));
    expect(data.events[0].activity).toHaveLength(2);
    expect(requests.every(request => !request.url.searchParams.has("or"))).toBe(true);
  });

  it("clamps stale and huge history page requests before querying a row range", async () => {
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "999999" }));
    expect(data.events[0].activity).toHaveLength(2);
    expect(data.events[0].activityPagination?.page).toBe(1);
    expect(requests.filter(request => request.url.pathname.endsWith("activity_logs")).every(request => Number(request.url.searchParams.get("offset") ?? 0) === 0)).toBe(true);
  });

  it("does not read history for an event absent from the authorized event result", async () => {
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.inaccessible, historyPage: "1" }));
    expect(data.events).toEqual([]);
    expect(requests.filter(request => request.url.pathname.endsWith("activity_logs") && request.url.searchParams.has("entity_id"))).toEqual([]);
  });

  it("fails explicitly rather than presenting query failure as empty history", async () => {
    historyError = true;
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "1" }));
    expect(data.events[0]).toMatchObject({ activity: [], activityError: "Event history could not be loaded. Try again." });
    expect(data.events[0].activityPagination).toBeUndefined();
  });

  it("does not claim completeness if the requested exact count is unavailable", async () => {
    omitHistoryCount = true;
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "1" }));
    expect(data.events[0].activityError).toBe("Event history could not be loaded. Try again.");
    expect(data.events[0].activityPagination).toBeUndefined();
  });
  it("marks unexpectedly short pages as an error instead of a complete result", async () => {
    truncateHistoryPage = true;
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "1" }));
    expect(data.events[0].activityError).toBe("Event history could not be loaded. Try again.");
    expect(data.events[0].activityPagination).toBeUndefined();
    expect(data.events[0].activity).toEqual([]);
  });  it("distinguishes a counted empty event from an unavailable history page", async () => {
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.empty, historyPage: "1" }));
    expect(data.events[0].activity).toEqual([]);
    expect(data.events[0].activityError).toBeUndefined();
    expect(data.events[0].activityPagination).toMatchObject({ from: 0, to: 0, totalCount: 0 });
    expect(requests.filter(request => request.url.pathname.endsWith("activity_logs") && request.url.searchParams.get("entity_id") === `eq.${ids.empty}`).map(request => request.method)).toEqual(["HEAD"]);
  });

  it("preserves maintenance route scope before attempting event history reads", async () => {
    // The fixture event is General Note, outside maintenance's existing event types.
    const data = await getTimelineScreenData("org-1", parseTimelineSearchParams({ eventId: ids.quiet, historyPage: "1" }), { scope: "maintenance" });
    expect(data.events).toEqual([]);
    expect(requests.filter(request => request.url.pathname.endsWith("activity_logs") && request.url.searchParams.has("entity_id"))).toEqual([]);
  });});
