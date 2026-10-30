import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";
import { getDocumentsScreenData } from "@/features/documents/data/documents";
import { parseDocumentSearchParams } from "@/features/documents/document.filters";
import { getLedgerScreenData } from "@/features/ledger/data/ledger";
import { parseLedgerSearchParams } from "@/features/ledger/ledger.filters";
import { getTimelineScreenData } from "@/features/timeline/data/timeline";
import { parseTimelineSearchParams } from "@/features/timeline/timeline.filters";
import { loadPortfolioSearch } from "./portfolio.server";
import { createPortfolioSearch } from "./portfolio";

const server = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: server.create }));
vi.mock("./portfolio.server", () => ({ loadPortfolioSearch: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({
  withFinancialReadContext: vi.fn(async (_organizationId, read) => read({ generation: 7, financial_start_date: "2026-01-01" })),
}));

type Row = Record<string, unknown>;
type Entity = "documents" | "ledger" | "timeline";
type Condition = { field: string; operator: string; value: string | string[] | null };
type PageRequest = { p_entity: Entity; p_organization_id: string; p_groups: Condition[][]; p_filters: Record<string, string | number | boolean | null>; p_sort: string; p_offset: number; p_limit: number };
const id = (kind: number, index: number) => `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const org = id(1, 1);
const properties = Array.from({ length: 1200 }, (_, index) => ({
  id: id(2, index), organization_id: org, code: `P${index}`, name: "Shared property", archived_at: null, ownerNames: ["Shared Owner"],
}));
const sourceTables = { documents: "documents", ledger: "ledger_entries", timeline: "timeline_events" } as const;
const sourceRows = Array.from({ length: 10000 }, (_, index) => ({
  id: id(3, index), organization_id: org, property_id: properties[index % properties.length].id,
  unit_id: null, lease_id: null, ledger_entry_id: null, timeline_event_id: null, task_id: null,
  archived_at: null, title: index % 2 ? "Roof" : "Other", description: "Synthetic record",
  category: index % 2 ? "Roof" : "Other", file_name: index % 2 ? "Roof.pdf" : "Other.pdf",
  storage_path: `synthetic/${index}`, mime_type: "application/pdf", size_bytes: 1, content_sha256: null,
  uploaded_at: "2026-10-01T00:00:00Z", event_date: "2026-10-01", event_type: "Repair", created_by: null,
  transaction_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z", direction: "income",
  amount: index + 1, currency: "USD", cost_amount: 20, cost_currency: "USD", source_type: "manual", source_id: null,
}));
const loaders = {
  documents: async (page: string, pageSize: string, query = "shared roof") => {
    const data = await getDocumentsScreenData(org, parseDocumentSearchParams({ query, page, pageSize, archiveState: "all" }));
    return { ids: data.documents.map(row => row.id), pagination: data.pagination };
  },
  ledger: async (page: string, pageSize: string, query = "shared roof") => {
    const data = await getLedgerScreenData(org, parseLedgerSearchParams({ query, page, pageSize, archiveState: "all", sort: "amount_desc", dateFrom: "2026-10-01", dateTo: "2026-10-31" }));
    return { ids: data.entries.map(row => row.id), pagination: data.pagination };
  },
  timeline: async (page: string, pageSize: string, query = "shared roof") => {
    const data = await getTimelineScreenData(org, parseTimelineSearchParams({ query, page, pageSize, archiveState: "all", dateFrom: "2026-10-01", dateTo: "2026-10-31" }), { scope: "financial" });
    return { ids: data.events.map(row => row.id), pagination: data.pagination };
  },
};

beforeEach(() => {
  server.create.mockReset();
  vi.mocked(loadPortfolioSearch).mockResolvedValue(createPortfolioSearch(properties, []));
});

describe("oversized register loader transport", () => {
  it.each(["documents", "ledger", "timeline"] as const)("loads a late %s page from 10000 rows with exact count and bounded hydration", async entity => {
    const fixture = transport(entity);
    const result = await loaders[entity]("100", "50");
    const matching = sourceRows.filter(row => row.title === "Roof");
    const expected = entity === "documents" ? matching.slice(4950) : [...matching].reverse().slice(4950);
    expect(result.ids).toEqual(expected.map(row => row.id));
    expect(result.pagination).toMatchObject({ page: 100, totalCount: 5000 });
    expect(fixture.rpc).toHaveLength(1);
    expect(fixture.rpc[0]).toMatchObject({ p_entity: entity, p_organization_id: org, p_offset: 4950, p_limit: 50,
      p_filters: { archive_state: "all" }, p_groups: [expect.any(Array), expect.any(Array)] });
    if (entity !== "documents") expect(fixture.rpc[0].p_filters).toMatchObject({ financial_start_date: "2026-01-01", date_from: "2026-10-01" });
    if (entity === "timeline") expect(fixture.rpc[0].p_filters).toMatchObject({ scope: "financial", date_to: "2026-10-31" });
    const reads = fixture.reads.filter(read => read.table === sourceTables[entity] && read.returned > 0);
    expect(reads).toHaveLength(1);
    expect(reads[0].returned).toBe(50);
    expect(reads[0].url.searchParams.getAll("or").some(value => /^\(id\.in\.\(/.test(value))).toBe(true);
    expect(reads[0].url.toString().length).toBeLessThan(4000);
  });
  it.each(["documents", "ledger", "timeline"] as const)("clamps the %s search without transferring its prefix", async entity => {
    const fixture = transport(entity);
    const result = await loaders[entity]("999", "100");
    expect(result.pagination).toMatchObject({ page: 50, totalCount: 5000 });
    expect(result.ids).toHaveLength(100);
    // Timeline reissues its existing clamped read; every hydration remains one page.
    const reads = fixture.reads.filter(read => read.table === sourceTables[entity] && read.returned > 0);
    expect(reads.every(read => read.returned <= 50 && read.url.toString().length < 4000)).toBe(true);
    expect(reads.reduce((sum, read) => sum + read.returned, 0)).toBe(entity === "timeline" ? 200 : 100);
  });
  it.each(["documents", "ledger", "timeline"] as const)("returns empty %s search without an unscoped register hydration", async entity => {
    const fixture = transport(entity);
    const result = await loaders[entity]("1", "50", "shared absent");
    expect(result.ids).toEqual([]);
    expect(result.pagination.totalCount).toBe(0);
    expect(fixture.reads.filter(read => read.table === sourceTables[entity] && read.returned > 0)).toEqual([]);
  });
});

// Model only the synthetic transport. Actual PostgreSQL grammar, constraints,
// authority, source counts and order are proved by bounded_register_search_test.sql.
function transport(entity: Entity) {
  const reads: { table: string; url: URL; returned: number }[] = [], rpc: PageRequest[] = [];
  const tables: Record<string, Row[]> = { properties, [sourceTables[entity]]: sourceRows };
  server.create.mockResolvedValue(createClient<Database>("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split("/").at(-1)!;
      if (table === "get_bounded_register_page") {
        const args = JSON.parse(String(init?.body)) as PageRequest;
        rpc.push(args);
        const alternatives = args.p_groups.map(group => group.map(compile));
        const filters = args.p_filters;
        const data = (tables[sourceTables[args.p_entity]] ?? []).filter(row => row.organization_id === args.p_organization_id &&
          (filters.archive_state === "all" || (filters.archive_state === "archived" ? row.archived_at != null : row.archived_at == null)) &&
          Object.entries(filters).every(([key, value]) => {
            if (value == null || value === "all" || value === "") return true;
            if (["id", "property_id", "unit_id", "lease_id", "task_id", "direction", "event_type"].includes(key)) return row[key] === value;
            const date = String(row[args.p_entity === "ledger" ? "transaction_date" : "event_date"]);
            if (key === "financial_start_date" || key === "date_from") return date >= String(value);
            if (key === "date_to") return date <= String(value);
            if (key === "date_before") return date < String(value);
            if (key === "min_amount") return Number(row.amount) >= Number(value);
            if (key === "scope" && value === "financial") return row.ledger_entry_id != null || row.cost_amount != null;
            return true;
          }) &&
          alternatives.every(group => group.some(matches => matches(row))));
        const order = args.p_entity === "documents" ? "uploaded_at.desc,id.asc" : args.p_entity === "ledger" ? "amount.desc,transaction_date.desc,id.asc" : "event_date.desc,id.desc";
        sortRows(data, order);
        const offset = Math.min(args.p_offset, Math.max(0, Math.ceil(data.length / args.p_limit) - 1) * args.p_limit);
        return response({ ids: data.slice(offset, offset + args.p_limit).map(row => row.id), total_count: data.length });
      }
      let data = [...tables[table] ?? []];
      for (const [field, expression] of url.searchParams) {
        if (["select", "order", "offset", "limit"].includes(field)) continue;
        if (field === "or") {
          const conditions = split(expression.slice(1, -1)).map(parse).map(compile);
          data = data.filter(row => conditions.some(matches => matches(row)));
        } else data = data.filter(compile(parse(`${field}.${expression}`)));
      }
      sortRows(data, url.searchParams.get("order") ?? "");
      const count = data.length, offset = Number(url.searchParams.get("offset") ?? 0);
      data = data.slice(offset, offset + Math.min(1000, Number(url.searchParams.get("limit") ?? 1000)));
      reads.push({ table, url, returned: data.length });
      return response(data, count);
    } },
  }));
  return { reads, rpc };
}
function response(data: unknown, count?: number) {
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", ...(count === undefined ? {} : { "Content-Range": `0-${Math.max(count - 1, 0)}/${count}` }) } });
}
function split(value: string) {
  let depth = 0, quoted = false, start = 0;
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    if (value[i] === "," && !depth) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  return [...parts, value.slice(start)];
}
function parse(expression: string): Condition {
  const match = /^([a-z_]+)\.(not\.is|is|eq|in|ilike|gte|lte|lt)\.(.*)$/.exec(expression);
  if (!match) throw Error(`Unsupported fixture condition: ${expression}`);
  const [, field, operator, raw] = match;
  const scalar = (value: string) => value.startsWith('"') ? JSON.parse(value) as string : value;
  return { field, operator, value: operator === "in" ? split(raw.slice(1, -1)).map(scalar) : raw === "null" ? null : scalar(raw) };
}
function compile({ field, operator, value }: Condition): (row: Row) => boolean {
  if (operator === "in") { const values = new Set(value as string[]); return row => values.has(String(row[field])); }
  if (operator === "is") return row => row[field] == null;
  if (operator === "not.is") return row => row[field] != null;
  if (operator === "eq") return row => String(row[field]) === value;
  if (operator === "ilike") {
    const pattern = String(value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
    const regex = new RegExp(`^${pattern}$`, "iu");
    return row => row[field] != null && regex.test(String(row[field]));
  }
  return row => operator === "gte" ? String(row[field]) >= String(value) : operator === "lte" ? String(row[field]) <= String(value) : String(row[field]) < String(value);
}
function sortRows(rows: Row[], order: string) {
  rows.sort((a, b) => {
    for (const part of order.split(",")) {
      const [field, direction] = part.split("."), left = a[field], right = b[field];
      if (left === right) continue;
      const comparison = left == null ? 1 : right == null ? -1 : typeof left === "number" && typeof right === "number"
        ? left - right : String(left).localeCompare(String(right));
      return direction === "desc" ? -comparison : comparison;
    }
    return 0;
  });
}
