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
  property_id: string | null;
  source_id: string | null;
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
      ownerNames: new Map(),
      period,
      properties,
      viewQuery,
    });
  }

  const [entriesResult, ownersResult] = await Promise.all([
    supabase
      .from("property_account_entries")
      .select("property_id, category, amount, balance_effect, source_id")
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
  const ownerNames = new Map(
    (ownersResult.data ?? []).map((owner) => [
      owner.property_id,
      peopleById.get(owner.person_id) ?? "Owner needed",
    ]),
  );

  return buildMonthlyOwnerActivityReport({
    entries: (entriesResult.data ?? []) as AccountEntry[],
    ownerNames,
    period,
    properties,
    viewQuery,
  });
}

export function buildMonthlyOwnerActivityReport({
  entries,
  ownerNames,
  period,
  properties,
  viewQuery,
}: {
  entries: AccountEntry[];
  ownerNames: Map<string, string>;
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

  const rows = properties.flatMap((property) => {
    const propertyEntries = entriesByProperty.get(property.id) ?? [];
    if (propertyEntries.length === 0) return [];
    const rent = categoryTotal(propertyEntries, "rent_income");
    const fees = categoryTotal(propertyEntries, "management_fee_expense");
    const costs = categoryTotal(propertyEntries, "owner_expense");
    const withdrawals = categoryTotal(propertyEntries, "withdrawal");
    const netChange = propertyEntries.reduce(
      (sum, entry) => sum + Number(entry.balance_effect ?? 0),
      0,
    );
    const propertyLabel = formatPropertyOptionLabel(property);

    return [
      {
        cells: {
          managementFees: formatMoney(fees, "USD"),
          netChange: formatMoney(netChange, "USD"),
          owner: ownerNames.get(property.id) ?? "Owner needed",
          property: propertyLabel,
          propertyCosts: formatMoney(costs, "USD"),
          rent: formatMoney(rent, "USD"),
          withdrawals: formatMoney(withdrawals, "USD"),
        },
        href: `/properties/${property.id}/account`,
        id: `monthly-owner-activity:${property.id}:${viewQuery.month}`,
        propertyId: property.id,
        sourceCount: propertyEntries.length,
        sourceLinks: [],
        sourceSummary: `${propertyEntries.length} property account ${propertyEntries.length === 1 ? "entry" : "entries"}`,
        title: propertyLabel,
      },
    ];
  });

  const totalRent = categoryTotal(entries, "rent_income");
  const totalFees = categoryTotal(entries, "management_fee_expense");
  const totalCosts = categoryTotal(entries, "owner_expense");
  const totalWithdrawals = categoryTotal(entries, "withdrawal");
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
    periodLabel: `${formatDate(period.start)} - ${formatDate(period.end)}`,
    rows,
    scopeLabel: scopeProperty
      ? formatPropertyOptionLabel(scopeProperty)
      : "All properties",
    summary: [
      metric("Rent", totalRent, entries, "rent_income"),
      metric("Management fee", totalFees, entries, "management_fee_expense"),
      metric("Property costs", totalCosts, entries, "owner_expense"),
      metric("Owner distributions", totalWithdrawals, entries, "withdrawal"),
    ],
    title: "Owner activity",
    totalsTraceLabel: `Totals trace to ${entries.length} property account ${entries.length === 1 ? "entry" : "entries"}.`,
  };
}

function categoryTotal(entries: AccountEntry[], category: string) {
  return entries.reduce(
    (sum, entry) =>
      entry.category === category ? sum + Number(entry.amount ?? 0) : sum,
    0,
  );
}

function metric(
  label: string,
  value: number,
  entries: AccountEntry[],
  category: string,
): TraceableReportMetric {
  const sourceCount = entries.filter((entry) => entry.category === category).length;
  return {
    detail: `${sourceCount} recorded ${sourceCount === 1 ? "entry" : "entries"}`,
    label,
    sourceCount,
    value: formatMoney(value, "USD"),
  };
}
