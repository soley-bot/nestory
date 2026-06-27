import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import {
  convertMoney,
  formatMoney,
  formatMoneyDisplay,
  normalizeCurrencyDisplaySettings,
  type CurrencyCode,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import type {
  ReportKind,
  ReportSourceLink,
  ReportStatusFilter,
  ReportsViewQuery,
  TraceableReportMetric,
  TrustedReport,
  TrustedReportColumn,
  TrustedReportRow,
} from "@/features/reports/reports.types";

export const REPORT_OPTIONS: Array<{ label: string; value: ReportKind }> = [
  { label: "Rent roll", value: "rent-roll" },
  { label: "Unit performance", value: "unit-performance" },
  { label: "Property performance", value: "property-performance" },
  { label: "Owner statement", value: "owner-statement" },
  { label: "Income / expense", value: "income-expense" },
  { label: "Lease expiry", value: "lease-expiry" },
  { label: "Vacancy / risk", value: "vacancy-risk" },
  { label: "Maintenance cost", value: "maintenance-cost" },
  { label: "Missing data", value: "missing-data" },
];

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type PropertyRow = {
  code: string;
  id: string;
  name: string;
  owner: string | null;
  property_type: string;
  status: string;
};

type UnitRow = {
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
};

type LeaseRow = {
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: CurrencyCode;
  primary_tenant_person_id: string | null;
  property_id: string;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

type LedgerRow = {
  amount: number;
  category: string;
  currency: CurrencyCode;
  description: string | null;
  direction: string;
  id: string;
  property_id: string;
  transaction_date: string;
  unit_id: string | null;
};

type TimelineRow = {
  cost_amount: number | null;
  cost_currency: CurrencyCode | null;
  description: string | null;
  event_date: string;
  event_type: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  property_id: string;
  title: string;
  unit_id: string | null;
};

type DocumentRow = {
  file_name: string;
  id: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  property_id: string | null;
  timeline_event_id: string | null;
  unit_id: string | null;
};

type OwnerRow = {
  id: string;
  ownership_label: string | null;
  ownership_percent: number | null;
  person_id: string;
  property_id: string;
};

type PersonRow = {
  display_name: string;
  id: string;
};

type TrustedReportInput = {
  currencySettings: CurrencyDisplaySettings;
  documents: DocumentRow[];
  generatedAt?: string;
  ledgerEntries: LedgerRow[];
  leases: LeaseRow[];
  owners: OwnerRow[];
  people: PersonRow[];
  periodEnd: string;
  periodStart: string;
  properties: PropertyRow[];
  timelineEvents: TimelineRow[];
  units: UnitRow[];
  viewQuery: ReportsViewQuery;
};

type ReportContext = TrustedReportInput & {
  activeLeaseByUnitId: Map<string, LeaseRow>;
  documentsByLeaseId: Map<string, DocumentRow[]>;
  documentsByLedgerId: Map<string, DocumentRow[]>;
  documentsByPropertyId: Map<string, DocumentRow[]>;
  documentsByTimelineId: Map<string, DocumentRow[]>;
  documentsByUnitId: Map<string, DocumentRow[]>;
  generatedAt: string;
  ledgerByPropertyId: Map<string, LedgerRow[]>;
  ledgerByUnitId: Map<string, LedgerRow[]>;
  ownersByPropertyId: Map<string, OwnerRow>;
  peopleById: Map<string, PersonRow>;
  periodLabel: string;
  propertiesById: Map<string, PropertyRow>;
  scopeLabel: string;
  timelineByPropertyId: Map<string, TimelineRow[]>;
  timelineByUnitId: Map<string, TimelineRow[]>;
  unitsById: Map<string, UnitRow>;
  unitsByPropertyId: Map<string, UnitRow[]>;
};

const activeLeaseStatuses = new Set(["active", "notice_given"]);
const repairEventTypes = new Set(["Maintenance", "Repair", "Renovation"]);

export async function getTrustedReport({
  currencySettings,
  organizationId,
  viewQuery,
}: {
  currencySettings: CurrencyDisplaySettings;
  organizationId: string;
  viewQuery: ReportsViewQuery;
}): Promise<TrustedReport> {
  const supabase = await createSupabaseServerClient();
  const period = getReportMonthRange(viewQuery.month);
  const properties = await loadReportProperties(supabase, organizationId, viewQuery);
  const propertyIds = properties.map((property) => property.id);

  if (propertyIds.length === 0) {
    return buildTrustedReport({
      currencySettings,
      documents: [],
      ledgerEntries: [],
      leases: [],
      owners: [],
      people: [],
      periodEnd: period.end,
      periodStart: period.start,
      properties,
      timelineEvents: [],
      units: [],
      viewQuery,
    });
  }

  const [units, leases, ledgerEntries, timelineEvents, documents, owners] =
    await Promise.all([
      loadReportUnits(supabase, organizationId, propertyIds),
      loadReportLeases(supabase, organizationId, propertyIds),
      loadReportLedger(supabase, organizationId, propertyIds, period),
      loadReportTimeline(supabase, organizationId, propertyIds, period),
      loadReportDocuments(supabase, organizationId),
      loadReportOwners(supabase, organizationId, propertyIds),
    ]);
  const people = await loadReportPeople(
    supabase,
    organizationId,
    new Set(owners.map((owner) => owner.person_id)),
  );

  return buildTrustedReport({
    currencySettings,
    documents,
    ledgerEntries,
    leases,
    owners,
    people,
    periodEnd: period.end,
    periodStart: period.start,
    properties,
    timelineEvents,
    units,
    viewQuery,
  });
}

export function buildTrustedReport(input: TrustedReportInput): TrustedReport {
  const context = buildReportContext(input);

  if (context.viewQuery.report === "unit-performance") {
    return buildUnitPerformanceReport(context);
  }

  if (context.viewQuery.report === "property-performance") {
    return buildPropertyPerformanceReport(context);
  }

  if (context.viewQuery.report === "owner-statement") {
    return buildOwnerStatementReport(context);
  }

  if (context.viewQuery.report === "income-expense") {
    return buildIncomeExpenseReport(context);
  }

  if (context.viewQuery.report === "lease-expiry") {
    return buildLeaseExpiryReport(context);
  }

  if (context.viewQuery.report === "vacancy-risk") {
    return buildVacancyRiskReport(context);
  }

  if (context.viewQuery.report === "maintenance-cost") {
    return buildMaintenanceCostReport(context);
  }

  if (context.viewQuery.report === "missing-data") {
    return buildMissingDataReport(context);
  }

  return buildRentRollReport(context);
}

function buildRentRollReport(context: ReportContext): TrustedReport {
  const rows = getStatusFilteredUnits(context.units, context.viewQuery.status).map(
    (unit) => {
      const property = context.propertiesById.get(unit.property_id);
      const lease = context.activeLeaseByUnitId.get(unit.id);
      const rent = getUnitRent(unit, lease);
      const documents = context.documentsByUnitId.get(unit.id) ?? [];
      const sources = compactSources([
        property && propertySource(property),
        unitSource(unit),
        lease && leaseSource(lease),
        ...documents.slice(0, 2).map(documentSource),
      ]);

      return reportRow({
        cells: {
          documents: String(documents.length),
          leaseEnd: lease ? formatDate(lease.lease_end_date) : "No active lease",
          property: propertyLabel(property),
          rent: rent ? formatMoney(rent.amount, rent.currency) : "No rent",
          status: formatStatus(unit.status),
          tenant: lease?.tenant_name ?? "No active lease",
          unit: unitLabel(unit),
        },
        href: `/units/${unit.id}`,
        id: unit.id,
        sources,
        title: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        tone: getRentRollTone(unit, lease),
      });
    },
  );
  const rentUsd = rows.reduce((total, row) => {
    const unit = context.unitsById.get(row.id);
    const lease = unit ? context.activeLeaseByUnitId.get(unit.id) : undefined;
    const rent = unit ? getUnitRent(unit, lease) : undefined;
    return total + (rent ? toUsd(rent.amount, rent.currency, context) : 0);
  }, 0);

  return baseReport(context, {
    columns: [
      column("property", "Property"),
      column("unit", "Unit"),
      column("status", "Status"),
      column("tenant", "Tenant"),
      column("leaseEnd", "Lease end"),
      column("rent", "Rent", "right"),
      column("documents", "Docs", "right"),
    ],
    description:
      "Current unit rent roll built from active units, active leases, unit rent fields, and attached document counts.",
    emptyDescription: "Add units or adjust the property/status filters.",
    emptyTitle: "No units match this rent roll",
    exportFilenameBase: "rent-roll",
    kind: "rent-roll",
    rows,
    summary: [
      metric("Units", String(rows.length), "Unit rows in this report", rows.length),
      metric(
        "Occupied",
        String(rows.filter((row) => row.cells.status === "Occupied").length),
        "Rows whose unit status is occupied",
        rows.length,
      ),
      metric(
        "Monthly rent",
        moneyFromUsd(rentUsd, context),
        "Sum of unit current rent, falling back to active lease rent",
        rows.length,
      ),
      metric(
        "Linked leases",
        String([...context.activeLeaseByUnitId.keys()].length),
        "Active lease rows linked to visible units",
        context.activeLeaseByUnitId.size,
      ),
    ],
    title: "Rent Roll",
    totalsTraceLabel: `Totals trace to ${rows.length} unit rows plus active lease rows where present.`,
  });
}

function buildUnitPerformanceReport(context: ReportContext): TrustedReport {
  const rows = context.units.map((unit) => {
    const property = context.propertiesById.get(unit.property_id);
    const ledger = context.ledgerByUnitId.get(unit.id) ?? [];
    const timeline = context.timelineByUnitId.get(unit.id) ?? [];
    const documents = context.documentsByUnitId.get(unit.id) ?? [];
    const incomeUsd = sumLedgerUsd(ledger.filter(isIncome), context);
    const expenseUsd = sumLedgerUsd(ledger.filter(isExpense), context, true);
    const maintenanceUsd =
      sumLedgerUsd(ledger.filter(isMaintenanceLedger), context, true) +
      sumTimelineCostUsd(timeline.filter(isMaintenanceTimeline), context);
    const noiUsd = incomeUsd - expenseUsd;
    const sources = compactSources([
      property && propertySource(property),
      unitSource(unit),
      ...ledger.map(ledgerSource),
      ...timeline.map(timelineSource),
      ...documents.slice(0, 2).map(documentSource),
    ]);

    return reportRow({
      cells: {
        documents: String(documents.length),
        expenses: moneyFromUsd(expenseUsd, context),
        income: moneyFromUsd(incomeUsd, context),
        maintenance: moneyFromUsd(maintenanceUsd, context),
        noi: moneyFromUsd(noiUsd, context),
        property: propertyLabel(property),
        unit: unitLabel(unit),
      },
      href: `/units/${unit.id}`,
      id: unit.id,
      sources,
      title: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
      tone: noiUsd < 0 ? "danger" : incomeUsd > 0 ? "success" : "warning",
    });
  });
  const incomeUsd = sumLedgerUsd(context.ledgerEntries.filter(isIncome), context);
  const expenseUsd = sumLedgerUsd(
    context.ledgerEntries.filter(isExpense),
    context,
    true,
  );

  return baseReport(context, {
    columns: moneyColumns(["property", "unit", "income", "expenses", "noi", "maintenance", "documents"]),
    description:
      "Unit-level income, expenses, NOI, maintenance costs, and evidence counts for the selected month.",
    emptyDescription: "Add units or ledger entries for the selected period.",
    emptyTitle: "No unit performance rows",
    exportFilenameBase: "unit-performance",
    kind: "unit-performance",
    rows,
    summary: financialSummary(context, incomeUsd, expenseUsd, rows.length),
    title: "Unit Performance",
    totalsTraceLabel: `Financial totals trace to ${context.ledgerEntries.length} ledger rows in ${context.periodLabel}.`,
  });
}

function buildPropertyPerformanceReport(context: ReportContext): TrustedReport {
  const rows = context.properties.map((property) => {
    const units = context.unitsByPropertyId.get(property.id) ?? [];
    const ledger = context.ledgerByPropertyId.get(property.id) ?? [];
    const timeline = context.timelineByPropertyId.get(property.id) ?? [];
    const incomeUsd = sumLedgerUsd(ledger.filter(isIncome), context);
    const expenseUsd = sumLedgerUsd(ledger.filter(isExpense), context, true);
    const maintenanceUsd =
      sumLedgerUsd(ledger.filter(isMaintenanceLedger), context, true) +
      sumTimelineCostUsd(timeline.filter(isMaintenanceTimeline), context);
    const occupancy =
      units.length === 0
        ? "No units"
        : `${units.filter((unit) => normalizeUnitStatus(unit.status) === "occupied").length}/${units.length}`;
    const riskCount = units.filter((unit) => {
      const lease = context.activeLeaseByUnitId.get(unit.id);

      return !lease || !getUnitRent(unit, lease);
    }).length;

    return reportRow({
      cells: {
        expenses: moneyFromUsd(expenseUsd, context),
        income: moneyFromUsd(incomeUsd, context),
        maintenance: moneyFromUsd(maintenanceUsd, context),
        noi: moneyFromUsd(incomeUsd - expenseUsd, context),
        occupancy,
        property: propertyLabel(property),
        risk: String(riskCount),
      },
      href: `/properties/${property.id}`,
      id: property.id,
      sources: compactSources([
        propertySource(property),
        ...units.map(unitSource),
        ...ledger.map(ledgerSource),
        ...timeline.map(timelineSource),
      ]),
      title: propertyLabel(property),
      tone: incomeUsd - expenseUsd < 0 || riskCount > 0 ? "warning" : "success",
    });
  });
  const incomeUsd = sumLedgerUsd(context.ledgerEntries.filter(isIncome), context);
  const expenseUsd = sumLedgerUsd(
    context.ledgerEntries.filter(isExpense),
    context,
    true,
  );

  return baseReport(context, {
    columns: moneyColumns(["property", "occupancy", "income", "expenses", "noi", "maintenance", "risk"]),
    description:
      "Property-level occupancy, income, expenses, NOI, maintenance, and missing operating-record risks.",
    emptyDescription: "Add active properties or adjust the property filter.",
    emptyTitle: "No property performance rows",
    exportFilenameBase: "property-performance",
    kind: "property-performance",
    rows,
    summary: financialSummary(context, incomeUsd, expenseUsd, rows.length),
    title: "Property Performance",
    totalsTraceLabel: `Totals trace to ${context.ledgerEntries.length} ledger rows and ${context.units.length} unit rows.`,
  });
}

function buildOwnerStatementReport(context: ReportContext): TrustedReport {
  const rows = context.properties.map((property) => {
    const owner = context.ownersByPropertyId.get(property.id);
    const person = owner ? context.peopleById.get(owner.person_id) : undefined;
    const ledger = context.ledgerByPropertyId.get(property.id) ?? [];
    const incomeUsd = sumLedgerUsd(ledger.filter(isIncome), context);
    const expenseUsd = sumLedgerUsd(ledger.filter(isExpense), context, true);
    const ownerName = person?.display_name ?? property.owner ?? "Missing owner";

    return reportRow({
      cells: {
        expenses: moneyFromUsd(expenseUsd, context),
        income: moneyFromUsd(incomeUsd, context),
        net: moneyFromUsd(incomeUsd - expenseUsd, context),
        owner: ownerName,
        ownership: owner?.ownership_percent
          ? `${owner.ownership_percent}%`
          : owner?.ownership_label ?? "Primary owner",
        property: propertyLabel(property),
      },
      href: `/properties/${property.id}`,
      id: property.id,
      sources: compactSources([
        propertySource(property),
        owner && ownerSource(owner, ownerName),
        ...ledger.map(ledgerSource),
      ]),
      title: `${ownerName} / ${property.code}`,
      tone: owner ? "neutral" : "warning",
    });
  });
  const incomeUsd = sumLedgerUsd(context.ledgerEntries.filter(isIncome), context);
  const expenseUsd = sumLedgerUsd(
    context.ledgerEntries.filter(isExpense),
    context,
    true,
  );

  return baseReport(context, {
    columns: moneyColumns(["owner", "property", "ownership", "income", "expenses", "net"]),
    description:
      "Owner-facing statement rows grouped by property owner links and period ledger activity.",
    emptyDescription: "Add property owners or ledger rows for the selected period.",
    emptyTitle: "No owner statement rows",
    exportFilenameBase: "owner-statement",
    kind: "owner-statement",
    rows,
    summary: financialSummary(context, incomeUsd, expenseUsd, rows.length),
    title: "Owner Statement",
    totalsTraceLabel: `Statement totals trace to ${context.ledgerEntries.length} ledger rows and ${context.owners.length} owner links.`,
  });
}

function buildIncomeExpenseReport(context: ReportContext): TrustedReport {
  const rows = context.ledgerEntries
    .toSorted((first, second) => first.transaction_date.localeCompare(second.transaction_date))
    .map((entry) => {
      const property = context.propertiesById.get(entry.property_id);
      const unit = entry.unit_id ? context.unitsById.get(entry.unit_id) : undefined;

      return reportRow({
        cells: {
          amount: formatMoney(entry.amount, entry.currency),
          category: normalizeCategory(entry.category),
          date: formatDate(entry.transaction_date),
          description: entry.description ?? "-",
          direction: isExpense(entry) ? "Expense" : "Income",
          property: propertyLabel(property),
          unit: unit ? unitLabel(unit) : "Property-level",
        },
        href: `/ledger?archiveState=all&entryId=${entry.id}`,
        id: entry.id,
        sources: compactSources([
          property && propertySource(property),
          unit && unitSource(unit),
          ledgerSource(entry),
        ]),
        title: `${formatDate(entry.transaction_date)} / ${normalizeCategory(entry.category)}`,
        tone: isExpense(entry) ? "warning" : "success",
      });
    });
  const incomeUsd = sumLedgerUsd(context.ledgerEntries.filter(isIncome), context);
  const expenseUsd = sumLedgerUsd(
    context.ledgerEntries.filter(isExpense),
    context,
    true,
  );

  return baseReport(context, {
    columns: [
      column("date", "Date"),
      column("direction", "Type"),
      column("category", "Category"),
      column("property", "Property"),
      column("unit", "Unit"),
      column("amount", "Amount", "right"),
      column("description", "Description"),
    ],
    description: "Ledger income and expense rows for the selected accounting month.",
    emptyDescription: "Add ledger entries or choose another accounting month.",
    emptyTitle: "No ledger rows in this period",
    exportFilenameBase: "income-expense",
    kind: "income-expense",
    rows,
    summary: financialSummary(context, incomeUsd, expenseUsd, rows.length),
    title: "Income / Expense",
    totalsTraceLabel: `Totals trace directly to ${rows.length} ledger rows.`,
  });
}

function buildLeaseExpiryReport(context: ReportContext): TrustedReport {
  const rows = context.leases
    .filter(
      (lease) =>
        lease.lease_end_date >= context.periodStart &&
        lease.lease_end_date <= context.periodEnd,
    )
    .toSorted((first, second) => first.lease_end_date.localeCompare(second.lease_end_date))
    .map((lease) => {
      const property = context.propertiesById.get(lease.property_id);
      const unit = lease.unit_id ? context.unitsById.get(lease.unit_id) : undefined;
      const daysToEnd = diffDays(context.periodStart, lease.lease_end_date);

      return reportRow({
        cells: {
          endDate: formatDate(lease.lease_end_date),
          property: propertyLabel(property),
          rent: formatMoney(lease.monthly_rent_amount, lease.monthly_rent_currency),
          status: formatStatus(lease.status),
          tenant: lease.tenant_name,
          unit: unit ? unitLabel(unit) : "No unit assigned",
          window: `${daysToEnd} days from period start`,
        },
        href: `/leases?archiveState=all&leaseId=${lease.id}`,
        id: lease.id,
        sources: compactSources([
          property && propertySource(property),
          unit && unitSource(unit),
          leaseSource(lease),
        ]),
        title: `${lease.tenant_name} / ${formatDate(lease.lease_end_date)}`,
        tone: activeLeaseStatuses.has(normalizeValue(lease.status)) ? "warning" : "neutral",
      });
    });

  return baseReport(context, {
    columns: [
      column("endDate", "Lease end"),
      column("tenant", "Tenant"),
      column("property", "Property"),
      column("unit", "Unit"),
      column("status", "Status"),
      column("rent", "Rent", "right"),
      column("window", "Runway"),
    ],
    description: "Lease rows whose end date falls inside the selected month.",
    emptyDescription: "Choose another month or add lease end dates.",
    emptyTitle: "No leases expire in this period",
    exportFilenameBase: "lease-expiry",
    kind: "lease-expiry",
    rows,
    summary: [
      metric("Expiring leases", String(rows.length), "Lease rows ending in period", rows.length),
      metric(
        "Active/notice",
        String(rows.filter((row) => row.tone === "warning").length),
        "Expiring leases still active or in notice",
        rows.length,
      ),
      metric("Period", context.periodLabel, "Lease end-date window", rows.length),
      metric("Properties", String(context.properties.length), "Properties in scope", context.properties.length),
    ],
    title: "Lease Expiry",
    totalsTraceLabel: `Expiry counts trace directly to ${rows.length} lease rows.`,
  });
}

function buildVacancyRiskReport(context: ReportContext): TrustedReport {
  const rows = getStatusFilteredUnits(context.units, context.viewQuery.status)
    .map((unit) => {
      const property = context.propertiesById.get(unit.property_id);
      const lease = context.activeLeaseByUnitId.get(unit.id);
      const documents = context.documentsByUnitId.get(unit.id) ?? [];
      const risks = getUnitRisks(unit, lease, documents);

      if (risks.length === 0) {
        return null;
      }

      return reportRow({
        cells: {
          documents: String(documents.length),
          property: propertyLabel(property),
          rent: getUnitRent(unit, lease)
            ? formatMoney(
                getUnitRent(unit, lease)?.amount ?? 0,
                getUnitRent(unit, lease)?.currency ?? "USD",
              )
            : "Missing",
          risk: risks.join("; "),
          status: formatStatus(unit.status),
          unit: unitLabel(unit),
        },
        href: `/units/${unit.id}`,
        id: unit.id,
        sources: compactSources([
          property && propertySource(property),
          unitSource(unit),
          lease && leaseSource(lease),
          ...documents.slice(0, 2).map(documentSource),
        ]),
        title: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
        tone: risks.some((risk) => risk.includes("missing")) ? "danger" : "warning",
      });
    })
    .filter((row): row is TrustedReportRow => Boolean(row));

  return baseReport(context, {
    columns: [
      column("property", "Property"),
      column("unit", "Unit"),
      column("status", "Status"),
      column("rent", "Rent", "right"),
      column("documents", "Docs", "right"),
      column("risk", "Risk"),
    ],
    description:
      "Units where status, active lease, rent, or evidence suggests vacancy or reporting risk.",
    emptyDescription: "No vacancy or missing-record risk matched the current filters.",
    emptyTitle: "No vacancy or risk rows",
    exportFilenameBase: "vacancy-risk",
    kind: "vacancy-risk",
    rows,
    summary: [
      metric("Risk rows", String(rows.length), "Units with at least one risk", rows.length),
      metric(
        "Vacant",
        String(rows.filter((row) => row.cells.status === "Vacant").length),
        "Risk rows with vacant unit status",
        rows.length,
      ),
      metric(
        "Missing lease",
        String(rows.filter((row) => row.cells.risk.includes("lease")).length),
        "Rows where current lease is missing or mismatched",
        rows.length,
      ),
      metric(
        "Missing evidence",
        String(rows.filter((row) => row.cells.documents === "0").length),
        "Rows with no unit-linked documents",
        rows.length,
      ),
    ],
    title: "Vacancy / Risk",
    totalsTraceLabel: `Risk counts trace to ${rows.length} unit rows and their lease/document links.`,
  });
}

function buildMaintenanceCostReport(context: ReportContext): TrustedReport {
  const ledgerRows = context.ledgerEntries.filter(isMaintenanceLedger).map((entry) => {
    const property = context.propertiesById.get(entry.property_id);
    const unit = entry.unit_id ? context.unitsById.get(entry.unit_id) : undefined;

    return reportRow({
      cells: {
        amount: formatMoney(entry.amount, entry.currency),
        date: formatDate(entry.transaction_date),
        property: propertyLabel(property),
        source: "Ledger",
        summary: `${normalizeCategory(entry.category)} / ${entry.description ?? "-"}`,
        unit: unit ? unitLabel(unit) : "Property-level",
      },
      href: `/ledger?archiveState=all&entryId=${entry.id}`,
      id: `ledger-${entry.id}`,
      sources: compactSources([
        property && propertySource(property),
        unit && unitSource(unit),
        ledgerSource(entry),
      ]),
      title: normalizeCategory(entry.category),
      tone: "warning",
    });
  });
  const timelineRows = context.timelineEvents
    .filter(isMaintenanceTimeline)
    .map((event) => {
      const property = context.propertiesById.get(event.property_id);
      const unit = event.unit_id ? context.unitsById.get(event.unit_id) : undefined;

      return reportRow({
        cells: {
          amount:
            event.cost_amount !== null && event.cost_currency
              ? formatMoney(event.cost_amount, event.cost_currency)
              : "No cost recorded",
          date: formatDate(event.event_date),
          property: propertyLabel(property),
          source: "Timeline",
          summary: `${event.event_type} / ${event.title}`,
          unit: unit ? unitLabel(unit) : "Property-level",
        },
        href: `/timeline?archiveState=all&eventId=${event.id}`,
        id: `timeline-${event.id}`,
        sources: compactSources([
          property && propertySource(property),
          unit && unitSource(unit),
          timelineSource(event),
        ]),
        title: event.title,
        tone: event.cost_amount === null ? "warning" : "neutral",
      });
    });
  const rows = [...ledgerRows, ...timelineRows].toSorted((first, second) =>
    first.cells.date.localeCompare(second.cells.date),
  );
  const totalUsd =
    sumLedgerUsd(context.ledgerEntries.filter(isMaintenanceLedger), context, true) +
    sumTimelineCostUsd(context.timelineEvents.filter(isMaintenanceTimeline), context);

  return baseReport(context, {
    columns: [
      column("date", "Date"),
      column("source", "Source"),
      column("property", "Property"),
      column("unit", "Unit"),
      column("summary", "Maintenance record"),
      column("amount", "Amount", "right"),
    ],
    description:
      "Maintenance cost report from maintenance/repair ledger categories and costed maintenance timeline events.",
    emptyDescription: "No maintenance ledger or timeline cost rows exist for this period.",
    emptyTitle: "No maintenance costs",
    exportFilenameBase: "maintenance-cost",
    kind: "maintenance-cost",
    rows,
    summary: [
      metric("Cost rows", String(rows.length), "Ledger plus timeline maintenance rows", rows.length),
      metric("Total cost", moneyFromUsd(totalUsd, context), "Sum of maintenance ledger and timeline costs", rows.length),
      metric("Ledger rows", String(ledgerRows.length), "Maintenance ledger source rows", ledgerRows.length),
      metric("Timeline rows", String(timelineRows.length), "Maintenance timeline source rows", timelineRows.length),
    ],
    title: "Maintenance Cost",
    totalsTraceLabel: `Maintenance total traces to ${ledgerRows.length} ledger rows and ${timelineRows.length} timeline rows.`,
  });
}

function buildMissingDataReport(context: ReportContext): TrustedReport {
  const rows: TrustedReportRow[] = [];

  for (const property of context.properties) {
    const owner = context.ownersByPropertyId.get(property.id);
    if (!owner && !property.owner) {
      rows.push(missingDataRow({
        issue: "Missing owner link",
        nextAction: "Open the property and attach a current owner.",
        record: propertyLabel(property),
        rowId: `property-owner-${property.id}`,
        source: propertySource(property),
      }));
    }
  }

  for (const unit of context.units) {
    const lease = context.activeLeaseByUnitId.get(unit.id);
    const rent = getUnitRent(unit, lease);
    const documents = context.documentsByUnitId.get(unit.id) ?? [];

    if (!rent) {
      rows.push(missingDataRow({
        issue: "Missing rent",
        nextAction: "Add unit rent or a current lease rent.",
        record: unitLabel(unit),
        rowId: `unit-rent-${unit.id}`,
        source: unitSource(unit),
      }));
    }

    if (normalizeUnitStatus(unit.status) === "occupied" && !lease) {
      rows.push(missingDataRow({
        issue: "Occupied without active lease",
        nextAction: "Create or link the active lease.",
        record: unitLabel(unit),
        rowId: `unit-lease-${unit.id}`,
        source: unitSource(unit),
      }));
    }

    if (documents.length === 0) {
      rows.push(missingDataRow({
        issue: "Missing unit evidence",
        nextAction: "Attach lease, inspection, handover, or repair evidence.",
        record: unitLabel(unit),
        rowId: `unit-docs-${unit.id}`,
        source: unitSource(unit),
      }));
    }
  }

  for (const lease of context.leases.filter(isActiveLease)) {
    if (!lease.primary_tenant_person_id) {
      rows.push(missingDataRow({
        href: `/leases?archiveState=all&leaseId=${lease.id}`,
        issue: "Lease tenant not linked to People",
        nextAction: "Attach the durable tenant/person record.",
        record: lease.tenant_name,
        rowId: `lease-person-${lease.id}`,
        source: leaseSource(lease),
      }));
    }
  }

  return baseReport(context, {
    columns: [
      column("issue", "Issue"),
      column("record", "Record"),
      column("nextAction", "Next action"),
    ],
    description:
      "Operational cleanup queue for missing owners, rent, active leases, tenant links, and evidence.",
    emptyDescription: "The current scope has the basic links needed for reporting.",
    emptyTitle: "No missing data found",
    exportFilenameBase: "missing-data",
    kind: "missing-data",
    rows,
    summary: [
      metric("Issues", String(rows.length), "Missing data rows", rows.length),
      metric(
        "Owner gaps",
        String(rows.filter((row) => row.cells.issue.includes("owner")).length),
        "Properties missing owner links",
        rows.length,
      ),
      metric(
        "Lease gaps",
        String(rows.filter((row) => row.cells.issue.includes("lease") || row.cells.issue.includes("tenant")).length),
        "Lease or tenant-link gaps",
        rows.length,
      ),
      metric(
        "Evidence gaps",
        String(rows.filter((row) => row.cells.issue.includes("evidence")).length),
        "Records missing documents",
        rows.length,
      ),
    ],
    title: "Missing Data",
    totalsTraceLabel: `Missing-data rows trace to property, unit, and lease source records.`,
  });
}

function missingDataRow({
  href,
  issue,
  nextAction,
  record,
  rowId,
  source,
}: {
  href?: string;
  issue: string;
  nextAction: string;
  record: string;
  rowId: string;
  source: ReportSourceLink;
}) {
  return reportRow({
    cells: { issue, nextAction, record },
    href: href ?? source.href,
    id: rowId,
    sources: [source],
    title: issue,
    tone: "warning",
  });
}

function buildReportContext(input: TrustedReportInput): ReportContext {
  const propertiesById = indexById(input.properties);
  const unitsById = indexById(input.units);
  const activeLeaseByUnitId = new Map<string, LeaseRow>();

  for (const lease of input.leases.filter(isActiveLease).toSorted(compareLeaseStartDesc)) {
    if (lease.unit_id && !activeLeaseByUnitId.has(lease.unit_id)) {
      activeLeaseByUnitId.set(lease.unit_id, lease);
    }
  }

  return {
    ...input,
    activeLeaseByUnitId,
    documentsByLeaseId: groupByNullable(input.documents, "lease_id"),
    documentsByLedgerId: groupByNullable(input.documents, "ledger_entry_id"),
    documentsByPropertyId: groupByNullable(input.documents, "property_id"),
    documentsByTimelineId: groupByNullable(input.documents, "timeline_event_id"),
    documentsByUnitId: groupByNullable(input.documents, "unit_id"),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ledgerByPropertyId: groupBy(input.ledgerEntries, "property_id"),
    ledgerByUnitId: groupByNullable(input.ledgerEntries, "unit_id"),
    ownersByPropertyId: indexPrimaryOwners(input.owners),
    peopleById: indexById(input.people),
    periodLabel: `${formatDate(input.periodStart)} - ${formatDate(input.periodEnd)}`,
    propertiesById,
    scopeLabel: getScopeLabel(input.viewQuery.propertyId, propertiesById),
    timelineByPropertyId: groupBy(input.timelineEvents, "property_id"),
    timelineByUnitId: groupByNullable(input.timelineEvents, "unit_id"),
    unitsById,
    unitsByPropertyId: groupBy(input.units, "property_id"),
  };
}

function baseReport(
  context: ReportContext,
  report: Omit<TrustedReport, "generatedAt" | "periodLabel" | "scopeLabel">,
): TrustedReport {
  return {
    ...report,
    generatedAt: context.generatedAt,
    periodLabel: context.periodLabel,
    scopeLabel: context.scopeLabel,
  };
}

function reportRow({
  cells,
  href,
  id,
  sources,
  title,
  tone,
}: {
  cells: Record<string, string>;
  href?: string;
  id: string;
  sources: ReportSourceLink[];
  title: string;
  tone?: TrustedReportRow["tone"];
}): TrustedReportRow {
  return {
    cells,
    href,
    id,
    sourceLinks: sources,
    sourceSummary:
      sources.length === 1 ? "1 source row" : `${sources.length} source rows`,
    title,
    tone,
  };
}

function financialSummary(
  context: ReportContext,
  incomeUsd: number,
  expenseUsd: number,
  rowCount: number,
): TraceableReportMetric[] {
  const incomeSourceCount = context.ledgerEntries.filter(isIncome).length;
  const expenseSourceCount = context.ledgerEntries.filter(isExpense).length;
  const ledgerSourceCount = incomeSourceCount + expenseSourceCount;

  return [
    metric(
      "Income",
      moneyFromUsd(incomeUsd, context),
      "Income ledger rows in period",
      incomeSourceCount,
    ),
    metric(
      "Expenses",
      moneyFromUsd(expenseUsd, context),
      "Expense ledger rows in period",
      expenseSourceCount,
    ),
    metric(
      "NOI",
      moneyFromUsd(incomeUsd - expenseUsd, context),
      "Income less expenses",
      ledgerSourceCount,
    ),
    metric("Rows", String(rowCount), "Visible report rows", rowCount),
  ];
}

function metric(
  label: string,
  value: string,
  detail: string,
  sourceCount: number,
): TraceableReportMetric {
  return { detail, label, sourceCount, value };
}

function column(
  key: string,
  label: string,
  align: TrustedReportColumn["align"] = "left",
): TrustedReportColumn {
  return { align, key, label };
}

function moneyColumns(keys: string[]) {
  return keys.map((key) =>
    column(
      key,
      {
        documents: "Docs",
        expenses: "Expenses",
        income: "Income",
        maintenance: "Maintenance",
        net: "Net",
        noi: "NOI",
        occupancy: "Occupancy",
        owner: "Owner",
        ownership: "Ownership",
        property: "Property",
        risk: "Risk",
        unit: "Unit",
      }[key] ?? key,
      ["documents", "expenses", "income", "maintenance", "net", "noi", "risk"].includes(key)
        ? "right"
        : "left",
    ),
  );
}

function propertySource(property: PropertyRow): ReportSourceLink {
  return {
    href: `/properties/${property.id}`,
    id: property.id,
    label: property.code,
    recordType: "property",
  };
}

function unitSource(unit: UnitRow): ReportSourceLink {
  return {
    href: `/units/${unit.id}`,
    id: unit.id,
    label: `Unit ${unit.unit_number}`,
    recordType: "unit",
  };
}

function leaseSource(lease: LeaseRow): ReportSourceLink {
  return {
    href: `/leases?archiveState=all&leaseId=${lease.id}`,
    id: lease.id,
    label: `Lease ${lease.tenant_name}`,
    recordType: "lease",
  };
}

function ledgerSource(entry: LedgerRow): ReportSourceLink {
  return {
    href: `/ledger?archiveState=all&entryId=${entry.id}`,
    id: entry.id,
    label: normalizeCategory(entry.category),
    recordType: "ledger",
  };
}

function timelineSource(event: TimelineRow): ReportSourceLink {
  return {
    href: `/timeline?archiveState=all&eventId=${event.id}`,
    id: event.id,
    label: event.title,
    recordType: "timeline",
  };
}

function documentSource(document: DocumentRow): ReportSourceLink {
  return {
    href: "/documents",
    id: document.id,
    label: document.file_name,
    recordType: "document",
  };
}

function ownerSource(owner: OwnerRow, label: string): ReportSourceLink {
  return {
    href: `/people?archiveState=all&personId=${owner.person_id}`,
    id: owner.id,
    label,
    recordType: "owner",
  };
}

function compactSources(
  sources: Array<ReportSourceLink | false | null | undefined>,
) {
  const seen = new Set<string>();
  const compacted: ReportSourceLink[] = [];

  for (const source of sources) {
    if (!source) {
      continue;
    }

    const key = `${source.recordType}:${source.id}`;
    if (!seen.has(key)) {
      compacted.push(source);
      seen.add(key);
    }
  }

  return compacted;
}

function getUnitRisks(unit: UnitRow, lease: LeaseRow | undefined, docs: DocumentRow[]) {
  const risks: string[] = [];
  const status = normalizeUnitStatus(unit.status);

  if (status === "vacant") {
    risks.push("Vacant");
  }

  if (status === "occupied" && !lease) {
    risks.push("Occupied but active lease missing");
  } else if (!lease && status !== "inactive") {
    risks.push("Active lease missing");
  }

  if (!getUnitRent(unit, lease)) {
    risks.push("Rent missing");
  }

  if (docs.length === 0) {
    risks.push("Evidence missing");
  }

  return risks;
}

function getRentRollTone(unit: UnitRow, lease?: LeaseRow): TrustedReportRow["tone"] {
  if (normalizeUnitStatus(unit.status) === "occupied" && !lease) {
    return "danger";
  }

  if (!getUnitRent(unit, lease)) {
    return "warning";
  }

  return normalizeUnitStatus(unit.status) === "occupied" ? "success" : "neutral";
}

function getUnitRent(unit: UnitRow, lease?: LeaseRow) {
  if (unit.current_rent_amount !== null && unit.current_rent_currency) {
    return { amount: unit.current_rent_amount, currency: unit.current_rent_currency };
  }

  if (lease) {
    return {
      amount: lease.monthly_rent_amount,
      currency: lease.monthly_rent_currency,
    };
  }

  return null;
}

function getStatusFilteredUnits(units: UnitRow[], status: ReportStatusFilter) {
  return units
    .filter((unit) => status === "all" || normalizeUnitStatus(unit.status) === status)
    .toSorted(compareUnits);
}

function normalizeUnitStatus(status: string) {
  const normalized = normalizeValue(status);

  if (
    normalized === "occupied" ||
    normalized === "reserved" ||
    normalized === "maintenance" ||
    normalized === "inactive"
  ) {
    return normalized;
  }

  return "vacant";
}

function formatStatus(value: string) {
  return normalizeValue(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeCategory(category: string) {
  const normalized = category.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  return normalized
    ? normalized
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ")
    : "Uncategorized";
}

function unitLabel(unit: UnitRow) {
  return `Unit ${unit.unit_number}${unit.floor ? ` / Floor ${unit.floor}` : ""}`;
}

function propertyLabel(property?: PropertyRow) {
  return property ? `${property.code} - ${property.name}` : "Unknown property";
}

function isIncome(entry: LedgerRow) {
  return entry.direction !== "expense";
}

function isExpense(entry: LedgerRow) {
  return entry.direction === "expense";
}

function isMaintenanceLedger(entry: LedgerRow) {
  const value = `${entry.category} ${entry.description ?? ""}`.toLowerCase();

  return (
    value.includes("maintenance") ||
    value.includes("repair") ||
    value.includes("renovation") ||
    value.includes("service")
  );
}

function isMaintenanceTimeline(event: TimelineRow) {
  const value = `${event.event_type} ${event.title} ${event.description ?? ""}`.toLowerCase();

  return (
    repairEventTypes.has(event.event_type) ||
    value.includes("maintenance") ||
    value.includes("repair") ||
    value.includes("renovation")
  );
}

function isActiveLease(lease: LeaseRow) {
  return activeLeaseStatuses.has(normalizeValue(lease.status));
}

function compareLeaseStartDesc(first: LeaseRow, second: LeaseRow) {
  return second.lease_start_date.localeCompare(first.lease_start_date);
}

function compareUnits(first: UnitRow, second: UnitRow) {
  return (
    compareStrings(first.property_id, second.property_id) ||
    compareStrings(first.unit_number, second.unit_number)
  );
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sumLedgerUsd(
  entries: LedgerRow[],
  context: Pick<ReportContext, "currencySettings">,
  absolute = false,
) {
  return entries.reduce((total, entry) => {
    const amount = toUsd(entry.amount, entry.currency, context);
    const signedAmount = absolute ? Math.abs(amount) : isExpense(entry) ? -amount : amount;

    return total + signedAmount;
  }, 0);
}

function sumTimelineCostUsd(
  events: TimelineRow[],
  context: Pick<ReportContext, "currencySettings">,
) {
  return events.reduce((total, event) => {
    if (event.cost_amount === null || !event.cost_currency) {
      return total;
    }

    return total + Math.abs(toUsd(event.cost_amount, event.cost_currency, context));
  }, 0);
}

function toUsd(
  amount: number,
  currency: CurrencyCode,
  context: Pick<ReportContext, "currencySettings">,
) {
  return convertMoney(
    amount,
    currency,
    "USD",
    normalizeCurrencyDisplaySettings(context.currencySettings).khrPerUsd,
  );
}

function moneyFromUsd(
  amount: number,
  context: Pick<ReportContext, "currencySettings">,
) {
  return formatMoneyDisplay(amount, "USD", context.currencySettings).primary;
}

function diffDays(start: string, end: string) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);

  return Math.round((endMs - startMs) / 86_400_000);
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function indexPrimaryOwners(rows: OwnerRow[]) {
  const owners = new Map<string, OwnerRow>();

  for (const owner of rows) {
    if (!owners.has(owner.property_id)) {
      owners.set(owner.property_id, owner);
    }
  }

  return owners;
}

function groupBy<T, K extends keyof T & string>(rows: T[], key: K) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string") {
      continue;
    }

    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }

  return grouped;
}

function groupByNullable<T, K extends keyof T & string>(rows: T[], key: K) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    const group = grouped.get(value) ?? [];
    group.push(row);
    grouped.set(value, group);
  }

  return grouped;
}

function getScopeLabel(propertyId: string, propertiesById: Map<string, PropertyRow>) {
  if (propertyId === "all") {
    return "All properties";
  }

  return propertyLabel(propertiesById.get(propertyId));
}

async function loadReportProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  let query = supabase
    .from("properties")
    .select("id, code, name, owner, property_type, status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("code", { ascending: true });

  if (viewQuery.propertyId !== "all") {
    query = query.eq("id", viewQuery.propertyId);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Could not load report properties: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const result = await supabase
    .from("units")
    .select(
      "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency",
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null);

  if (result.error) {
    throw new Error(`Could not load report units: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportLeases(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const result = await supabase
    .from("leases")
    .select(
      "id, property_id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency",
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .order("lease_start_date", { ascending: false });

  if (result.error) {
    throw new Error(`Could not load report leases: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportLedger(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  period: { end: string; start: string },
) {
  const result = await supabase
    .from("ledger_entries")
    .select(
      "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description",
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .gte("transaction_date", period.start)
    .lte("transaction_date", period.end)
    .order("transaction_date", { ascending: true });

  if (result.error) {
    throw new Error(`Could not load report ledger entries: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportTimeline(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  period: { end: string; start: string },
) {
  const result = await supabase
    .from("timeline_events")
    .select(
      "id, property_id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency",
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .gte("event_date", period.start)
    .lte("event_date", period.end)
    .order("event_date", { ascending: true });

  if (result.error) {
    throw new Error(`Could not load report timeline events: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportDocuments(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const result = await supabase
    .from("documents")
    .select(
      "id, property_id, unit_id, lease_id, ledger_entry_id, timeline_event_id, file_name",
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (result.error) {
    throw new Error(`Could not load report documents: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportOwners(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const result = await supabase
    .from("property_owners")
    .select("id, property_id, person_id, ownership_label, ownership_percent")
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null);

  if (result.error) {
    throw new Error(`Could not load report owners: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function loadReportPeople(
  supabase: SupabaseServerClient,
  organizationId: string,
  personIds: ReadonlySet<string>,
) {
  if (personIds.size === 0) {
    return [];
  }

  const result = await supabase
    .from("people")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", [...personIds])
    .is("archived_at", null);

  if (result.error) {
    throw new Error(`Could not load report owner people: ${result.error.message}`);
  }

  return result.data ?? [];
}
