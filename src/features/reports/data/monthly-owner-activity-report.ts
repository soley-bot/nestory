import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import { parseExactMoneyToCents } from "@/features/finance/data/property-cash-events.money";
import { formatProfitLossAmount } from "./profit-loss-funding";
import { compareReportKeys, readReportSource, readReportSourceBatches } from "./report-source-completeness";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import {
  loadScopedFinanceContext,
  type ScopedFinanceContext,
} from "@/features/finance-operations/data/scoped-finance-context";
import type {
  ReportsViewQuery,
  TraceableReportMetric,
  TrustedReport,
} from "@/features/reports/reports.types";

type AccountEntry = {
  amount: number | string | null;
  balance_effect: number | string | null;
  category: string | null;
  event_date: string | null;
  label: string | null;
  property_id: string | null;
  source_id: string | null;
  source_type: string | null;
};

type OwnerAssignment = {
  name: string;
  personId: string;
};

type Property = {
  code: string;
  id: string;
  name: string;
};

export async function getMonthlyOwnerActivityReport({
  financeContext: suppliedFinanceContext,
  organizationId,
  supabase: suppliedSupabase,
  viewQuery,
}: {
  financeContext?: ScopedFinanceContext;
  organizationId: string;
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  viewQuery: ReportsViewQuery;
}): Promise<TrustedReport> {
  const supabase = suppliedSupabase ?? (await createSupabaseServerClient());
  const period = getReportMonthRange(viewQuery.month);
  const financeContext =
    suppliedFinanceContext ??
    (await loadScopedFinanceContext(
      supabase,
      organizationId,
      viewQuery.propertyId === "all" ? undefined : viewQuery.propertyId,
    ));
  const properties = financeContext.properties
    .filter(
      (property) =>
        property.archived_at === null &&
        (viewQuery.propertyId === "all" || property.id === viewQuery.propertyId),
    )
    .map(({ code, id, name }) => ({ code, id, name }));
  const propertyIds = properties.map(({ id }) => id);
  if (propertyIds.length === 0) {
    return buildMonthlyOwnerActivityReport({
      entries: [],
      ownerAssignments: new Map(),
      period,
      properties,
      viewQuery,
    });
  }

  const entries = await readReportSourceBatches("owner activity entries", propertyIds,
    ids => readReportSource("owner activity entries", (from, to) => supabase
      .from("property_account_entries")
      .select("organization_id, property_id, event_date, category, label, amount, balance_effect, source_type, source_id", { count: "exact" })
      .eq("organization_id", organizationId).in("property_id", ids)
      .gte("event_date", period.start).lte("event_date", period.end)
      .order("property_id").order("source_type").order("source_id").range(from, to),
    row => {
      if (row.organization_id !== organizationId || !row.property_id || !ids.includes(row.property_id)
        || !row.event_date || row.event_date < period.start || row.event_date > period.end) {
        throw new Error("Owner activity source escaped the requested scope.");
      }
      return accountEntryIdentity(row);
    }, (previous, current) => compareReportKeys(accountEntryIdentity(previous), accountEntryIdentity(current))),
    accountEntryIdentity);
  const peopleById = new Map(
    financeContext.people
      .filter((person) => person.archived_at === null)
      .map((person) => [person.id, person.display_name]),
  );
  const ownerAssignments = new Map<string, OwnerAssignment>(
    financeContext.owner_assignments
      .filter(
        (owner) =>
          owner.archived_at === null &&
          owner.is_primary &&
          propertyIds.includes(owner.property_id) &&
          (owner.started_on === null || owner.started_on <= period.end) &&
          (owner.ended_on === null || owner.ended_on >= period.end),
      )
      .map((owner) => [
        owner.property_id,
        {
          name: peopleById.get(owner.person_id) ?? "Owner needed",
          personId: owner.person_id,
        },
      ]),
  );

  return buildMonthlyOwnerActivityReport({
    entries,
    ownerAssignments,
    period,
    properties,
    viewQuery,
  });
}

export function buildMonthlyOwnerActivityReport({
  entries,
  ownerAssignments,
  period,
  properties,
  viewQuery,
}: {
  entries: AccountEntry[];
  ownerAssignments: Map<string, OwnerAssignment>;
  period: { end: string; start: string };
  properties: Property[];
  viewQuery: ReportsViewQuery;
}): TrustedReport {
  const entriesByProperty = new Map<string, AccountEntry[]>();
  for (const entry of entries) {
    if (!entry.property_id) continue;
    const propertyEntries = entriesByProperty.get(entry.property_id) ?? [];
    propertyEntries.push(entry);
    entriesByProperty.set(entry.property_id, propertyEntries);
  }

  const ownerOptions = [
    ...new Map(
      [...ownerAssignments.values()].map((owner) => [owner.personId, owner]),
    ).values(),
  ]
    .map((owner) => ({ id: owner.personId, label: owner.name }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const visibleProperties = properties.filter((property) => {
    if (viewQuery.ownerPersonId === "all") return true;
    return (
      ownerAssignments.get(property.id)?.personId === viewQuery.ownerPersonId
    );
  });
  const visiblePropertyIds = new Set(
    visibleProperties.map((property) => property.id),
  );
  const visibleEntries = entries.filter(
    (entry) => entry.property_id && visiblePropertyIds.has(entry.property_id),
  );

  const rows = visibleProperties.flatMap((property) => {
    const propertyEntries = entriesByProperty.get(property.id) ?? [];
    if (propertyEntries.length === 0) return [];
    const rent = categoryTotal(propertyEntries, "rent_income");
    const fees = categoryTotal(propertyEntries, "management_fee_expense");
    const costs = categoryTotal(propertyEntries, [
      "owner_expense",
      "owner_expense_reversal",
    ]);
    const withdrawals = categoryTotal(propertyEntries, "withdrawal");
    const ownerFunding = categoryTotal(propertyEntries, "owner_contribution");
    const netChange = balanceEffectTotal(propertyEntries);
    const propertyLabel = formatPropertyOptionLabel(property);
    const owner = ownerAssignments.get(property.id);
    const sourceLinks = [...propertyEntries]
      .sort(compareAccountEntries)
      .map((entry, index) => ({
        detail: sourceDetail(entry),
        href: buildPropertyAccountHref({
          activity: activityFilter(entry.category),
          month: viewQuery.month,
          ownerPersonId: owner?.personId,
          propertyId: property.id,
        }),
        id: `${entry.source_type ?? "property_account_entry"}:${entry.source_id ?? index}`,
        label: entry.label?.trim() || categoryLabel(entry.category),
        recordType: "property-account-entry" as const,
      }));

    return [
      {
        cells: {
          managementFees: formatProfitLossAmount(fees),
          netChange: formatProfitLossAmount(netChange),
          ownerFunding: formatProfitLossAmount(ownerFunding),
          owner: owner?.name ?? "Owner needed",
          property: propertyLabel,
          propertyCosts: formatProfitLossAmount(costs),
          rent: formatProfitLossAmount(rent),
          withdrawals: formatProfitLossAmount(withdrawals),
        },
        href: buildPropertyAccountHref({
          activity: "all",
          month: viewQuery.month,
          ownerPersonId: owner?.personId,
          propertyId: property.id,
        }),
        id: `monthly-owner-activity:${property.id}:${viewQuery.month}`,
        ownerPersonId: owner?.personId,
        propertyId: property.id,
        sourceCount: propertyEntries.length,
        sourceLinks,
        sourceSummary: `${propertyEntries.length} source ${propertyEntries.length === 1 ? "record" : "records"}`,
        title: propertyLabel,
      },
    ];
  });

  const totalRent = categoryTotal(visibleEntries, "rent_income");
  const totalFees = categoryTotal(visibleEntries, "management_fee_expense");
  const totalCosts = categoryTotal(visibleEntries, [
    "owner_expense",
    "owner_expense_reversal",
  ]);
  const totalWithdrawals = categoryTotal(visibleEntries, "withdrawal");
  const scopeProperty =
    viewQuery.propertyId === "all"
      ? null
      : properties.find(({ id }) => id === viewQuery.propertyId);

  return {
    columns: [
      { key: "property", label: "Property" },
      { key: "owner", label: "Owner" },
      { align: "right", key: "rent", label: "Rent" },
      { align: "right", key: "managementFees", label: "Management fee" },
      { align: "right", key: "propertyCosts", label: "Property costs" },
      { align: "right", key: "withdrawals", label: "Owner distributions" },
      { align: "right", key: "ownerFunding", label: "Owner funding" },
      { align: "right", key: "netChange", label: "Net change" },
    ],
    description:
      "Recorded owner-account activity for the selected property and month.",
    emptyDescription:
      "Record rent, a property cost, a management fee, owner funding, or a distribution to see it here.",
    emptyTitle: "No owner activity this month",
    exportFilenameBase: "monthly-owner-activity",
    generatedAt: new Date().toISOString(),
    kind: "monthly-owner-activity",
    ownerOptions,
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows,
    scopeLabel: getScopeLabel({
      ownerOptions,
      property: scopeProperty,
      viewQuery,
    }),
    summary: [
      metric("Rent", totalRent, visibleEntries, "rent_income"),
      metric(
        "Management fee",
        totalFees,
        visibleEntries,
        "management_fee_expense",
      ),
      metric("Property costs", totalCosts, visibleEntries, [
        "owner_expense",
        "owner_expense_reversal",
      ]),
      metric(
        "Owner distributions",
        totalWithdrawals,
        visibleEntries,
        "withdrawal",
      ),
      metric("Owner funding", categoryTotal(visibleEntries, "owner_contribution"), visibleEntries, "owner_contribution"),
      {
        label: "Net change",
        value: formatProfitLossAmount(balanceEffectTotal(visibleEntries)),
        sourceCount: visibleEntries.length,
        detail: "Signed account movement including owner funding and distributions",
      },
    ],
    title: "Owner activity",
    totalsTraceLabel: `Totals trace to ${visibleEntries.length} property account ${visibleEntries.length === 1 ? "entry" : "entries"}.`,
  };
}

function balanceEffectTotal(entries: AccountEntry[]) {
  return entries.reduce((total, entry) => total + parseExactMoneyToCents(entry.balance_effect ?? 0), BigInt(0));
}

function categoryTotal(
  entries: AccountEntry[],
  category: string | readonly string[],
) {
  const categories = new Set(
    typeof category === "string" ? [category] : category,
  );
  return entries.reduce(
    (sum, entry) =>
      entry.category && categories.has(entry.category)
        ? sum + parseExactMoneyToCents(entry.amount ?? 0)
        : sum,
    BigInt(0),
  );
}

function metric(
  label: string,
  value: bigint,
  entries: AccountEntry[],
  category: string | readonly string[],
): TraceableReportMetric {
  const categories = new Set(
    typeof category === "string" ? [category] : category,
  );
  const sourceCount = entries.filter(
    (entry) => entry.category && categories.has(entry.category),
  ).length;
  return {
    detail: `${sourceCount} recorded ${sourceCount === 1 ? "entry" : "entries"}`,
    label,
    sourceCount,
    value: formatProfitLossAmount(value),
  };
}

function activityFilter(category: string | null) {
  if (category === "rent_income") return "rent";
  if (category === "withdrawal" || category === "owner_contribution") return "owner_cash";
  if (category === "owner_expense_reversal") return "corrections";
  return "costs";
}

function buildPropertyAccountHref({
  activity,
  month,
  ownerPersonId,
  propertyId,
}: {
  activity: string;
  month: string;
  ownerPersonId?: string;
  propertyId: string;
}) {
  const params = new URLSearchParams({ activity, month });
  if (ownerPersonId) params.set("ownerPersonId", ownerPersonId);
  return `/properties/${encodeURIComponent(propertyId)}/account?${params.toString()}`;
}

function categoryLabel(category: string | null) {
  if (category === "rent_income") return "Rent";
  if (category === "management_fee_expense") return "Management fee";
  if (category === "owner_expense") return "Property cost";
  if (category === "owner_expense_reversal") return "Expense reversal";
  if (category === "withdrawal") return "Owner distribution";
  if (category === "owner_contribution") return "Owner funding";
  return "Owner account entry";
}

function compareAccountEntries(left: AccountEntry, right: AccountEntry) {
  return (
    (left.event_date ?? "").localeCompare(right.event_date ?? "") ||
    (left.source_type ?? "").localeCompare(right.source_type ?? "") ||
    (left.source_id ?? "").localeCompare(right.source_id ?? "")
  );
}

function sourceDetail(entry: AccountEntry) {
  const effect = parseExactMoneyToCents(entry.balance_effect ?? 0);
  const direction =
    effect < 0 ? "decrease" : effect > 0 ? "increase" : "no change";
  const date = entry.event_date
    ? formatDate(entry.event_date)
    : "Date unavailable";
  return `${date} · ${formatProfitLossAmount(effect < BigInt(0) ? -effect : effect)} ${direction}`;
}

function accountEntryIdentity(entry: Pick<AccountEntry, "property_id" | "source_type" | "source_id">) {
  if (!entry.property_id || !entry.source_type || !entry.source_id) throw new Error("Owner activity source identity is missing.");
  return `${entry.property_id}:${entry.source_type}:${entry.source_id}`;
}

function getScopeLabel({
  ownerOptions,
  property,
  viewQuery,
}: {
  ownerOptions: Array<{ id: string; label: string }>;
  property?: Property | null;
  viewQuery: ReportsViewQuery;
}) {
  const propertyLabel = property
    ? formatPropertyOptionLabel(property)
    : "All properties";
  if (viewQuery.ownerPersonId === "all") return propertyLabel;
  const ownerLabel =
    ownerOptions.find(({ id }) => id === viewQuery.ownerPersonId)?.label ??
    "Selected owner";
  return `${ownerLabel} · ${propertyLabel}`;
}
