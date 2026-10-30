import type { createSupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/types/database";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** RPCs return a scalar JSON object so PostgREST's table row cap cannot truncate it. */
export async function readPortfolioRegisterPage(
  client: Client,
  kind: "property" | "unit",
  organizationId: string,
  filters: object,
  page: number,
  pageSize: number,
) {
  const { data, error } = await client.rpc(
    kind === "property" ? "get_property_register_page" : "get_unit_register_page",
    { p_organization_id: organizationId, p_filters: filters as Json, p_page: page, p_page_size: pageSize },
  );
  if (error) throw new Error(`Could not load ${kind} register: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Could not load ${kind} register: Invalid page response.`);
  }
  const { ids, total_count: totalCount } = data;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === "string" && id.length > 0) ||
      new Set(ids).size !== ids.length || typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new Error(`Could not load ${kind} register: Invalid row count or identities.`);
  }
  const safePage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalCount / pageSize)));
  if (ids.length !== Math.min(pageSize, Math.max(0, totalCount - (safePage - 1) * pageSize))) {
    throw new Error(`Could not load ${kind} register: The returned page is incomplete. Reload and try again.`);
  }
  return { ids, totalCount };
}

export type PortfolioLedgerTotal = {
  id: string;
  property_id: string | null;
  unit_id: string | null;
  amount: number;
  currency: "USD";
  direction: string;
  category: string;
  transaction_date: string;
  entry_count: number;
};

export function trailingTwelveMonthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

/** Aggregate at source; retain currency, direction and period/category buckets for detail cards. */
export async function readPortfolioLedgerTotals(
  client: Client,
  organizationId: string,
  kind: "property" | "unit",
  ids: readonly string[],
  periodStart?: string,
): Promise<PortfolioLedgerTotal[]> {
  const uniqueIds = [...new Set(ids)];
  const rows: PortfolioLedgerTotal[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += 75) {
    const batch = uniqueIds.slice(offset, offset + 75);
    const { data, error } = await client.rpc("get_portfolio_ledger_totals", {
      p_organization_id: organizationId,
      ...(kind === "property" ? { p_property_ids: batch } : { p_unit_ids: batch }),
      ...(periodStart ? { p_period_start: periodStart } : {}),
    });
    if (error) throw new Error(`Could not load ${kind} ledger totals: ${error.message}`);
    if (!Array.isArray(data) || data.length > batch.length * 16) {
      throw new Error(`Could not load ${kind} ledger totals: Invalid aggregate response.`);
    }
    const keys = new Set<string>();
    for (const row of data) {
      if (!row || typeof row !== "object" || Array.isArray(row) || row.scope_type !== kind ||
          typeof row.scope_id !== "string" || !batch.includes(row.scope_id) ||
          typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.currency !== "USD" ||
          (row.direction !== "income" && row.direction !== "expense") || typeof row.category !== "string" ||
          typeof row.transaction_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date) ||
          typeof row.entry_count !== "number" || !Number.isSafeInteger(row.entry_count) || row.entry_count <= 0) {
        throw new Error(`Could not load ${kind} ledger totals: Invalid or out-of-scope aggregate.`);
      }
      const key = JSON.stringify([row.scope_id, row.currency, row.direction, row.category, row.transaction_date]);
      if (keys.has(key)) throw new Error(`Could not load ${kind} ledger totals: Duplicate aggregate.`);
      keys.add(key);
      rows.push({
        id: key, property_id: kind === "property" ? row.scope_id : null, unit_id: kind === "unit" ? row.scope_id : null,
        amount: row.amount, currency: row.currency, direction: row.direction, category: row.category,
        transaction_date: row.transaction_date, entry_count: row.entry_count,
      });
    }
  }
  return rows;
}
