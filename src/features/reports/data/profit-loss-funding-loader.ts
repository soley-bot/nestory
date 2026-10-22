import type { createSupabaseServerClient } from "@/lib/db/server";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "../reports.types";
import { buildProfitLossFunding, type FundingCashRow, type FundingActivityRow } from "./profit-loss-funding";
import { assertReportSourceWithinLimit, compareReportKeys, readReportSource, readReportSourceById } from "./report-source-completeness";

type ReportClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
async function loadUnitOpeningActivity(supabase: ReportClient, organizationId: string, propertyId: string, monthStart: string) {
  const activity = await readReportSource("complete unit opening activity", (from, to) =>
    supabase.from("property_account_entries")
      .select("property_id, unit_id, event_date, category, balance_effect, source_type, source_id", { count: "exact" })
      .eq("organization_id", organizationId).eq("property_id", propertyId).lt("event_date", monthStart)
      .order("source_type").order("source_id").range(from, to),
    row => {
      if (row.property_id !== propertyId || !row.event_date || row.event_date >= monthStart || !row.source_type || !row.source_id) {
        throw new Error("Unit opening activity source escaped its scope or has no identity.");
      }
      return `${row.source_type}:${row.source_id}`;
    }, (previous, current) => compareReportKeys(`${previous.source_type}:${previous.source_id}`, `${current.source_type}:${current.source_id}`)) as FundingActivityRow[];
  // The account view predates contribution unit attribution. Resolve each
  // contribution from its authoritative source, including signed reversals.
  const contributions = activity.filter(row => row.source_type === "owner_contribution");
  for (let offset = 0; offset < contributions.length; offset += 100) {
    const batchRows = contributions.slice(offset, offset + 100);
    const batch = batchRows.map(row => row.source_id);
    const sources = await readReportSourceById("resolve unit contribution activity", (from, to) =>
      supabase.from("owner_cash_events").select("id, unit_id, reversal_of_id", { count: "exact" })
        .eq("organization_id", organizationId).eq("property_id", propertyId).eq("currency", "USD")
        .eq("event_type", "owner_contribution").in("id", batch).order("id").range(from, to));
    if (sources.length !== batch.length || sources.some(source => !batch.includes(source.id))) throw new Error("Unable to resolve unit contribution activity.");
    const sourcesById = new Map(sources.map(source => [source.id, source]));
    for (const row of batchRows) {
        const source = sourcesById.get(row.source_id);
        if (!source) throw new Error("Unable to resolve unit contribution activity.");
        row.unit_id = source.unit_id;
        row.reversal_of_id = source.reversal_of_id;
    }
  }
  return activity;
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
      const contributions = await readReportSource("complete P&L owner contributions", (from, to) =>
        supabase.from("owner_cash_events").select("id, property_id, unit_id, event_date, amount, reversal_of_id", { count: "exact" })
          .eq("organization_id", organizationId).eq("property_id", propertyId).eq("currency", "USD")
          .eq("event_type", "owner_contribution").gte("event_date", period.start).lte("event_date", period.end)
          .order("id").range(from, to), row => {
            if (row.property_id !== propertyId || row.event_date < period.start || row.event_date > period.end) throw new Error("Owner contribution escaped report scope.");
            return row.id;
          }, (previous, current) => compareReportKeys(previous.id, current.id));
      if (needsUnitActivity) return { contributions, opening: await loadUnitOpeningActivity(supabase, organizationId, propertyId, period.start) };
      // The view owns the cumulative balance. Read its last row before the month
      // in the exact reverse of its window order, not a truncated history sum.
      const opening = await supabase.from("property_account_entries")
        .select("property_id, unit_id, event_date, category, balance_effect:running_balance, source_type, source_id")
        .eq("organization_id", organizationId).eq("property_id", propertyId).lt("event_date", period.start)
        .order("event_date", { ascending: false }).order("created_at", { ascending: false })
        .order("source_type", { ascending: false }).order("source_id", { ascending: false }).range(0, 0);
      if (opening.error || !opening.data || opening.data.length > 1) throw new Error("Unable to load P&L remaining balance.");
      return { contributions, opening: (opening.data ?? []) as FundingActivityRow[] };
    }));
    for (const result of results) {
      assertReportSourceWithinLimit("P&L owner contributions", cash.length + result.contributions.length);
      assertReportSourceWithinLimit("P&L opening activity", activity.length + result.opening.length);
      cash.push(...result.contributions);
      activity.push(...result.opening);
    }
  }
  return buildProfitLossFunding({ propertyIds: ids, unitId: viewQuery.unitId, units: financeContext.units, monthStart: period.start, cash, activity, activityScope: needsUnitActivity ? "unit" : "property" });
}
