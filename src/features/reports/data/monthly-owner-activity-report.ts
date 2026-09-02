import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import { formatMoney } from "@/lib/money/format";
import { getReportMonthRange } from "@/features/reports/reports.filters";
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
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
}): Promise<TrustedReport> {
  const supabase = await createSupabaseServerClient();
  const period = getReportMonthRange(viewQuery.month);
  let propertiesQuery = supabase
    .from("properties")
    .select("id, code, name")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (viewQuery.propertyId !== "all") {
    propertiesQuery = propertiesQuery.eq("id", viewQuery.propertyId);
  }

  const propertiesResult = await propertiesQuery.order("code");
  if (propertiesResult.error) {
    throw new Error(
      `Could not load owner activity properties: ${propertiesResult.error.message}`,
    );
  }

  const properties = (propertiesResult.data ?? []) as Property[];
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

  const [entriesResult, ownersResult] = await Promise.all([
    supabase
      .from("property_account_entries")
      .select(
        "property_id, event_date, category, label, amount, balance_effect, source_type, source_id",
      )
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .gte("event_date", period.start)
      .lte("event_date", period.end),
    supabase
      .from("property_owners")
      .select("property_id, person_id")
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds)
      .eq("is_primary", true)
      .is("archived_at", null)
      .or(`started_on.is.null,started_on.lte.${period.end}`)
      .or(`ended_on.is.null,ended_on.gte.${period.end}`),
  ]);

  if (entriesResult.error) {
    throw new Error(
      `Could not load owner activity entries: ${entriesResult.error.message}`,
    );
  }
  if (ownersResult.error) {
    throw new Error(
      `Could not load owner activity owners: ${ownersResult.error.message}`,
    );
  }

  const personIds = [
    ...new Set((ownersResult.data ?? []).map(({ person_id }) => person_id)),
  ];
  const peopleResult =
    personIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("people")
          .select("id, display_name")
          .eq("organization_id", organizationId)
          .in("id", personIds)
          .is("archived_at", null);

  if (peopleResult.error) {
    throw new Error(
      `Could not load owner activity names: ${peopleResult.error.message}`,
    );
  }

  const peopleById = new Map(
    (peopleResult.data ?? []).map((person) => [person.id, person.display_name]),
  );
  const ownerAssignments = new Map<string, OwnerAssignment>(
    (ownersResult.data ?? []).map((owner) => [
      owner.property_id,
      {
        name: peopleById.get(owner.person_id) ?? "Owner needed",
        personId: owner.person_id,
      },
    ]),
  );

  return buildMonthlyOwnerActivityReport({
    entries: (entriesResult.data ?? []) as AccountEntry[],
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
    const netChange = rent - fees - costs - withdrawals;
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
          managementFees: formatMoney(fees, "USD"),
          netChange: formatMoney(netChange, "USD"),
          owner: owner?.name ?? "Owner needed",
          property: propertyLabel,
          propertyCosts: formatMoney(costs, "USD"),
          rent: formatMoney(rent, "USD"),
          withdrawals: formatMoney(withdrawals, "USD"),
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
      { align: "right", key: "netChange", label: "Net change" },
    ],
    description:
      "Recorded owner-account activity for the selected property and month.",
    emptyDescription:
      "Record rent, a property cost, a management fee, or a withdrawal to see it here.",
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
    ],
    title: "Owner activity",
    totalsTraceLabel: `Totals trace to ${visibleEntries.length} property account ${visibleEntries.length === 1 ? "entry" : "entries"}.`,
  };
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
        ? sum + Number(entry.amount ?? 0)
        : sum,
    0,
  );
}

function metric(
  label: string,
  value: number,
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
    value: formatMoney(value, "USD"),
  };
}

function activityFilter(category: string | null) {
  if (category === "rent_income") return "rent";
  if (category === "withdrawal") return "owner_cash";
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
  const effect = Number(entry.balance_effect ?? 0);
  const direction =
    effect < 0 ? "decrease" : effect > 0 ? "increase" : "no change";
  const date = entry.event_date
    ? formatDate(entry.event_date)
    : "Date unavailable";
  return `${date} · ${formatMoney(Math.abs(effect), "USD")} ${direction}`;
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
