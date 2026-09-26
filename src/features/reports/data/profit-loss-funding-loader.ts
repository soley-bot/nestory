import type { createSupabaseServerClient } from "@/lib/db/server";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "../reports.types";
import { buildProfitLossFunding, type FundingCashRow, type FundingActivityRow } from "./profit-loss-funding";

type ReportClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
// Bound per-request history work; never return a silently truncated unit total.
const MAX_UNIT_OPENING_ROWS = 10000;

async function loadUnitOpeningActivity(supabase: ReportClient, organizationId: string, propertyId: string, monthStart: string) {
  const activity: FundingActivityRow[] = [];
  let expected: number | undefined;
  do {
    const result = await supabase.from("property_account_entries")
      .select("property_id, unit_id, event_date, category, balance_effect, source_type, source_id", { count: "exact" })
      .eq("organization_id", organizationId).eq("property_id", propertyId).lt("event_date", monthStart)
      .order("event_date").order("created_at").order("source_type").order("source_id")
      .range(activity.length, activity.length + 499);
    if (result.error || result.count == null || (expected !== undefined && expected !== result.count)) {
      throw new Error("Unable to load complete unit opening activity.");
    }
    expected = result.count;
    if (expected > MAX_UNIT_OPENING_ROWS) throw new Error("Unit opening activity exceeds the 10,000-row report limit. Select all units to use the property balance.");
    const rows = (result.data ?? []) as FundingActivityRow[];
    // The account view predates contribution unit attribution. Resolve each
    // contribution from its authoritative source, including signed reversals.
    const contributionIds = rows.filter(row => row.source_type === "owner_contribution").map(row => row.source_id);
    if (contributionIds.length) {
      const sources = await supabase.from("owner_cash_events").select("id, unit_id, reversal_of_id")
        .eq("organization_id", organizationId).eq("property_id", propertyId).eq("currency", "USD")
        .eq("event_type", "owner_contribution").in("id", contributionIds);
      if (sources.error || sources.data?.length !== contributionIds.length) throw new Error("Unable to resolve unit contribution activity.");
      const sourcesById = new Map(sources.data.map(source => [source.id, source]));
      for (const row of rows) if (row.source_type === "owner_contribution") {
        const source = sourcesById.get(row.source_id);
        if (!source) throw new Error("Unable to resolve unit contribution activity.");
        row.unit_id = source.unit_id;
        row.reversal_of_id = source.reversal_of_id;
      }
    }
    activity.push(...rows);
    if (activity.length === expected) return activity;
    if (!rows.length || activity.length > expected) throw new Error("Incomplete unit opening activity.");
  } while (true);
}

export async function loadProfitLossFunding({ supabase, organizationId, financeContext, propertyIds, viewQuery, period }: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; organizationId: string;
  financeContext: ScopedFinanceContext; propertyIds: string[]; viewQuery: ReportsViewQuery; period: { start: string; end: string };
}) {
  const unit = financeContext.units.find(unit => unit.id === viewQuery.unitId);
  const ids = propertyIds.filter(id => viewQuery.unitId === "all" || id === unit?.property_id);
  const needsUnitActivity = viewQuery.unitId !== "all" && financeContext.units.filter(unit => ids.includes(unit.property_id)).length > 1;
  const cash: FundingCashRow[] = [];
  const activity: FundingActivityRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 4) {
    const results = await Promise.all(ids.slice(offset, offset + 4).map(async propertyId => {
      const contributions: FundingCashRow[] = [];
      let loaded = 0;
      let expected: number | undefined;
      do {
        const result = await supabase.from("owner_cash_events").select("id, property_id, unit_id, event_date, amount, reversal_of_id", { count: "exact" })
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
      if (needsUnitActivity) return { contributions, opening: await loadUnitOpeningActivity(supabase, organizationId, propertyId, period.start) };
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
  return buildProfitLossFunding({ propertyIds: ids, unitId: viewQuery.unitId, units: financeContext.units, monthStart: period.start, cash, activity, activityScope: needsUnitActivity ? "unit" : "property" });
}
