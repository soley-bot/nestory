import type { createSupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/types/database";

const SEARCH_URL_BUDGET = 4000;
type Entity = "documents" | "ledger" | "timeline" | "leases";
type DatabaseSearch = {
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  entity: Entity;
  filters: Record<string, Json | undefined>;
  sort: string;
  effectiveDate?: string;
};
const SEARCH_FIELDS: Record<Entity, readonly string[]> = {
  documents: ["id", "property_id", "unit_id", "file_name", "category"],
  ledger: ["id", "property_id", "unit_id", "category", "description", "direction"],
  timeline: ["id", "property_id", "unit_id", "title", "description", "lease_id", "ledger_entry_id"],
  leases: ["id", "property_id", "unit_id", "tenant_name", "status", "monthly_rent_amount", "deposit_amount", "monthly_rent_currency", "deposit_currency"],
};

export function needsBoundedSearch(groups: string[]) {
  return groups.reduce((size, group) => size + encodeURIComponent(group).length + 10, 0) > SEARCH_URL_BUDGET;
}

type Result = { data: unknown; error: unknown; count: number | null };

/** The normal URL path stays intact. Oversized expressions are sent in a POST
 * body to an allowlisted, RLS-preserving page reader; only its page is hydrated.
 * fetchPage must retain all base scope filters and a unique order tie-breaker.
 */
export async function readBoundedSearch<R extends Result>(
  groups: string[],
  fetchPage: (from: number, to: number, filters: string[]) => PromiseLike<R>,
  from: number,
  to: number,
  database: DatabaseSearch,
  rows: (result: R) => unknown[] = result => result.data as unknown[] ?? [],
): Promise<R> {
  if (!needsBoundedSearch(groups)) return await fetchPage(from, to, groups);
  const limit = to - from + 1;
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid register search page");
  }
  const parsed = groups.map(group => splitConditions(group).map(condition => parseCondition(database.entity, condition)));
  const { data, error } = await database.client.rpc("get_bounded_register_page", {
    p_organization_id: database.organizationId, p_entity: database.entity,
    p_groups: parsed, p_filters: database.filters, p_sort: database.sort, p_offset: from, p_limit: limit,
    ...(database.effectiveDate ? { p_effective_date: database.effectiveDate } : {}),
  });
  if (error) throw new Error(`Could not search ${database.entity}: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid register search page response");
  const { ids, total_count: count } = data;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) ||
      new Set(ids).size !== ids.length || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid register search count or identities");
  }
  const offset = Math.min(from, Math.max(0, Math.ceil(count / limit) - 1) * limit);
  if (ids.length !== Math.min(limit, count - offset)) throw new Error("The register search page is incomplete. Reload and try again.");
  if (!ids.length) return { data: [], error: null, count } as R;
  const hydrated: unknown[] = [];
  let lastResult: R | undefined;
  // Keep the hydration URL bounded too, including a 100-row requested page.
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const filters = [`id.in.(${batch.map(id => JSON.stringify(id)).join(",")})`];
    let received = 0;
    // A short response can be the API row cap, even for a selected page.
    while (received < batch.length) {
      const result = await fetchPage(received, batch.length - 1, filters);
      if (result.error) return result;
      const pageRows = rows(result);
      if (result.count !== batch.length || !pageRows.length || pageRows.length > batch.length - received || pageRows.some((row, index) =>
        !row || typeof row !== "object" || !("id" in row) || row.id !== batch[received + index])) {
        throw new Error("The register search page changed while loading. Reload and try again.");
      }
      hydrated.push(...pageRows);
      received += pageRows.length;
      lastResult = result;
    }
  }
  return { ...lastResult, data: hydrated, count } as R;
}

function splitConditions(value: string) {
  const parts: string[] = [];
  let start = 0, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth++;
    if (char === ")" && --depth < 0) throw new Error("Invalid register search expression");
    if (char === "," && depth === 0) { parts.push(value.slice(start, index)); start = index + 1; }
  }
  if (quoted || depth !== 0) throw new Error("Invalid register search expression");
  parts.push(value.slice(start));
  return parts;
}

function scalar(value: string): string {
  if (value.startsWith('"')) {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "string") throw new Error("Invalid register search scalar");
    return parsed;
  }
  if (!value || /[(),"]/.test(value)) throw new Error("Invalid register search scalar");
  return value;
}

function parseCondition(entity: Entity, expression: string) {
  const match = /^([a-z_]+)\.(in|ilike|eq|not\.is)\.([\s\S]*)$/.exec(expression);
  if (!match) throw new Error("Unsupported register search expression");
  const [, field, operator, value] = match;
  if (!SEARCH_FIELDS[entity].includes(field)) throw new Error("Unsupported register search field");
  if (operator === "in") {
    if (!value.startsWith("(") || !value.endsWith(")")) throw new Error("Invalid search ID list");
    return { field, operator, value: splitConditions(value.slice(1, -1)).map(scalar) };
  }
  if (operator === "not.is" && value === "null") return { field, operator, value: null };
  if (operator === "eq" || operator === "ilike") return { field, operator, value: scalar(value) };
  throw new Error("Unsupported register search operator");
}
