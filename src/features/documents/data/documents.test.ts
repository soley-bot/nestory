import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentsScreenData } from "@/features/documents/data/documents";
import type { Database } from "@/types/database";

const server = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: server.create }));

const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  event: "22222222-2222-4222-8222-222222222222",
  property: "33333333-3333-4333-8333-333333333333",
};
type Row = Record<string, unknown>;
const requests: URL[] = [];
let tables: Record<string, Row[]>;

beforeEach(() => {
  requests.length = 0;
  tables = {
    properties: [{
      id: ids.property,
      organization_id: "org-1",
      code: "TEST",
      name: "Synthetic property",
      archived_at: null,
    }],
    documents: [{
      id: ids.document,
      organization_id: "org-1",
      archived_at: null,
      category: "General",
      content_sha256: null,
      file_name: "synthetic-note.pdf",
      lease_id: null,
      ledger_entry_id: null,
      mime_type: "application/pdf",
      property_id: ids.property,
      size_bytes: 123,
      storage_path: "synthetic/note.pdf",
      task_id: null,
      timeline_event_id: ids.event,
      unit_id: null,
      uploaded_at: "2026-10-20T00:00:00Z",
    }],
    timeline_events: [{
      id: ids.event,
      organization_id: "org-1",
      title: "Synthetic property note",
      event_type: "General Note",
      lease_id: null,
      ledger_entry_id: null,
    }],
  };

  // Exercise the installed query builder through a synthetic HTTP transport.
  // Missing rows stand for records excluded by the existing access policy.
  server.create.mockResolvedValue(createClient<Database>(
    "https://synthetic.invalid",
    "synthetic-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          requests.push(url);
          const table = url.pathname.split("/").at(-1)!;
          let rows = tables[table] ?? [];
          for (const [column, filter] of url.searchParams) {
            if (["select", "order", "offset", "limit"].includes(column)) continue;
            if (filter.startsWith("eq.")) {
              rows = rows.filter((row) => String(row[column]) === filter.slice(3));
            } else if (filter === "is.null") {
              rows = rows.filter((row) => row[column] == null);
            } else if (filter.startsWith("in.(")) {
              const values = filter.slice(4, -1).split(",");
              rows = rows.filter((row) => values.includes(String(row[column])));
            } else {
              throw new Error(`Unsupported fixture filter: ${column}=${filter}`);
            }
          }
          const count = rows.length;
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = Number(url.searchParams.get("limit") ?? count);
          return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `0-${Math.max(count - 1, 0)}/${count}`,
            },
          });
        },
      },
    },
  ));
});

function expectScopedReads() {
  expect(requests.length).toBeGreaterThan(0);
  for (const url of requests) {
    expect(url.searchParams.get("organization_id")).toBe("eq.org-1");
  }
  const eventRequest = requests.find((url) => url.pathname.endsWith("/timeline_events"));
  expect(eventRequest?.searchParams.get("id")).toBe(`in.(${ids.event})`);
}

describe("Document timeline navigation", () => {
  it("links an authorized event through the scoped property timeline", async () => {
    const data = await getDocumentsScreenData("org-1");
    const document = data.documents[0];
    const href = `/property-timeline?archiveState=all&eventId=${ids.event}`;

    expect(data.documents).toHaveLength(1);
    expect(document.hrefs.timeline).toBe(href);
    expect(document.linkedRecords.filter((record) => record.type === "Timeline")).toEqual([{
      href,
      label: "Synthetic property note",
      type: "Timeline",
    }]);
    expect(document.linkedRecords.some((record) => record.href.startsWith("/timeline"))).toBe(false);
    expectScopedReads();
  });

  it.each(["not returned", "another organization"])(
    "omits timeline links when the event is %s",
    async (visibility) => {
      tables.timeline_events = visibility === "not returned"
        ? []
        : tables.timeline_events.map((event) => ({ ...event, organization_id: "org-2" }));

      const data = await getDocumentsScreenData("org-1");
      const document = data.documents[0];

      expect(data.documents).toHaveLength(1);
      expect(document.hrefs.timeline).toBeUndefined();
      expect(document.linkedRecords.some((record) => record.type === "Timeline")).toBe(false);
      expect(document.linkedRecords.some((record) => record.href.startsWith("/timeline"))).toBe(false);
      expectScopedReads();
    },
  );
});
