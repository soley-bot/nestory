import type { createSupabaseServerClient } from "@/lib/db/server";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "../reports.types";
import { buildProfitLossFunding, type FundingCashRow, type FundingActivityRow } from "./profit-loss-funding";

export async function loadProfitLossFunding({ supabase, organizationId, financeContext, propertyIds, viewQuery, period }: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; organizationId: string;
  financeContext: ScopedFinanceContext; propertyIds: string[]; viewQuery: ReportsViewQuery; period: { start: string; end: string };
}) {
  const unit = financeContext.units.find(unit => unit.id === viewQuery.unitId);
  const ids = propertyIds.filter(id => viewQuery.unitId === "all" || id === unit?.property_id);
  const cash: FundingCashRow[] = [];
  const activity: FundingActivityRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    const results = await Promise.all(ids.slice(offset, offset + 4).map(async propertyId => {
      const contributions: FundingCashRow[] = [];
      let loaded = 0;
      let expected: number | undefined;
      do {
        const result = await supabase.from("owner_cash_events").select("id, property_id, unit_id, event_date, amount", { count: "exact" })
          .eq("organization_id", organizationId).eq("property_id", propertyId).eq("currency", "USD")
          .eq("event_type", "owner_contribution").gte("event_date", period.start).lte("event_date", period.end)
          .order("id").range(loaded, loaded + 499);
        if (result.error || result.count == null || result.count > 5000 || (expected !== undefined && expected !== result.count)) {
          throw new Error("Unable to load complete P&L owner contributions. Narrow the property scope and try again.");
        }
        expected = result.count;
        const rows = result.data ?? [];
        contributions.push(...rows);
        loaded += rows.length;
        if (loaded === expected) break;
        if (!rows.length || loaded > expected) throw new Error("Incomplete P&L owner contributions.");
      } while (true);
      // The view owns the cumulative balance. Read its last row before the month
      // in the exact reverse of its window order, not a truncated history sum.
      const opening = await supabase.from("property_account_entries")
        .select("property_id, unit_id, event_date, category, balance_effect:running_balance, source_type, source_id")
        .eq("organization_id", organizationId).eq("property_id", propertyId).lt("event_date", period.start)
        .order("event_date", { ascending: false }).order("created_at", { ascending: false })
        .order("source_type", { ascending: false }).order("source_id", { ascending: false }).range(0, 0);
      if (opening.error || (opening.data?.length ?? 0) > 1) throw new Error("Unable to load P&L remaining balance.");
      return { contributions, opening: (opening.data ?? []) as FundingActivityRow[] };
    }));
    for (const result of results) {
      cash.push(...result.contributions);
      activity.push(...result.opening);
    }
  }
  return buildProfitLossFunding({ propertyIds: ids, unitId: viewQuery.unitId, units: financeContext.units, monthStart: period.start, cash, activity });
}
