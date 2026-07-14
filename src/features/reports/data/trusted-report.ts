import { createSupabaseServerClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
} from "@/lib/money/format";
import { getReportMonthRange } from "@/features/reports/reports.filters";
import { getOwnerStatementReport } from "@/features/reports/data/owner-statement-report";
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
  { label: "Rent Roll", value: "rent-roll" },
  { label: "Unit Performance", value: "unit-performance" },
  { label: "Property Performance", value: "property-performance" },
  { label: "Owner Statement", value: "owner-statement" },
  { label: "Income & Expense", value: "income-expense" },
  { label: "Lease Expiry", value: "lease-expiry" },
  { label: "Vacancy & Lease Risk", value: "vacancy-risk" },
  { label: "Maintenance Cost", value: "maintenance-cost" },
  { label: "Record Readiness", value: "missing-data" },
];

const reportLeaseSelect =
  "id, property_id, unit_id, tenant_name, primary_tenant_person_id, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const maxReportSourceRows = 5_000;
const reportSourceRangeEnd = maxReportSourceRows - 1;

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
  primary_tenant_person_id?: string | null;
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

type MaintenanceTaskRow = {
  actual_cost_amount: number | null;
  actual_cost_currency: CurrencyCode | null;
  category: string;
  cost_estimate_amount: number | null;
  cost_estimate_currency: CurrencyCode | null;
  created_at: string;
  due_date: string | null;
  due_time: string | null;
  id: string;
  ledger_entry_id: string | null;
  priority: string;
  property_id: string;
  recurrence_frequency: string;
  status: string;
  timeline_event_id: string | null;
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
  documents: DocumentRow[];
  generatedAt?: string;
  ledgerEntries: LedgerRow[];
  leases: LeaseRow[];
  maintenanceTasks: MaintenanceTaskRow[];
  owners: OwnerRow[];
  people: PersonRow[];
  periodEnd: string;
  periodStart: string;
  properties: PropertyRow[];
  timelineEvents: TimelineRow[];
  units: UnitRow[];
  viewQuery: ReportsViewQuery;
};

type TrustedReportSourceRequirements = {
  documents: boolean;
  ledgerEntries: boolean;
  leases: boolean;
  maintenanceTasks: boolean;
  owners: boolean;
  people: boolean;
  timelineEvents: boolean;
  units: boolean;
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
  maintenanceByPropertyId: Map<string, MaintenanceTaskRow[]>;
  maintenanceByUnitId: Map<string, MaintenanceTaskRow[]>;
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
const trustedReportSourceRequirements = {
  "income-expense": requiresReportSources("ledgerEntries", "units"),
  "lease-expiry": requiresReportSources("leases", "units"),
  "maintenance-cost": requiresReportSources(
    "ledgerEntries",
    "maintenanceTasks",
    "timelineEvents",
    "units",
  ),
  "missing-data": requiresReportSources("documents", "leases", "owners", "units"),
  "owner-statement": requiresReportSources(),
  "property-performance": requiresReportSources(
    "ledgerEntries",
    "leases",
    "timelineEvents",
    "units",
  ),
  "rent-roll": requiresReportSources("documents", "leases", "units"),
  "unit-performance": requiresReportSources(
    "documents",
    "ledgerEntries",
    "timelineEvents",
    "units",
  ),
  "vacancy-risk": requiresReportSources("documents", "leases", "units"),
} satisfies Record<ReportKind, TrustedReportSourceRequirements>;

export async function getTrustedReport({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: ReportsViewQuery;
}): Promise<TrustedReport> {
  if (viewQuery.report === "owner-statement") {
    return getOwnerStatementReport({ organizationId, viewQuery });
  }

  const supabase = await createSupabaseServerClient();
  const period = getReportMonthRange(viewQuery.month);
  const properties = await loadReportProperties(supabase, organizationId, viewQuery);
  const propertyIds = properties.map((property) => property.id);
  const sources = getTrustedReportSourceRequirements(viewQuery.report);

  if (propertyIds.length === 0) {
    return buildTrustedReport({
      documents: [],
      ledgerEntries: [],
      leases: [],
      maintenanceTasks: [],
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

  const [
    units,
    leases,
    ledgerEntries,
    maintenanceTasks,
    timelineEvents,
    documents,
    owners,
  ] =
    await Promise.all([
      sources.units
        ? loadReportUnits(supabase, organizationId, propertyIds)
        : Promise.resolve<UnitRow[]>([]),
      sources.leases
        ? loadReportLeases(supabase, organizationId, propertyIds)
        : Promise.resolve<LeaseRow[]>([]),
      sources.ledgerEntries
        ? loadReportLedger(supabase, organizationId, propertyIds, period)
        : Promise.resolve<LedgerRow[]>([]),
      sources.maintenanceTasks
        ? loadReportMaintenanceTasks(supabase, organizationId, propertyIds, period)
        : Promise.resolve<MaintenanceTaskRow[]>([]),
      sources.timelineEvents
        ? loadReportTimeline(supabase, organizationId, propertyIds, period)
        : Promise.resolve<TimelineRow[]>([]),
      sources.documents
        ? loadReportDocuments(supabase, organizationId)
        : Promise.resolve<DocumentRow[]>([]),
      sources.owners
        ? loadReportOwners(supabase, organizationId, propertyIds)
        : Promise.resolve<OwnerRow[]>([]),
    ]);
  const people = sources.people
    ? await loadReportPeople(
        supabase,
        organizationId,
        new Set(owners.map((owner) => owner.person_id)),
      )
    : [];

  return buildTrustedReport({
    documents,
    ledgerEntries,
    leases,
    maintenanceTasks,
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

export function getTrustedReportSourceRequirements(
  report: ReportKind,
): TrustedReportSourceRequirements {
  return trustedReportSourceRequirements[report];
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
    throw new Error(
      "Owner Statement must be built through the property-cash report loader",
    );
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

function requiresReportSources(
  ...enabledSources: Array<keyof TrustedReportSourceRequirements>
): TrustedReportSourceRequirements {
  return {
    documents: enabledSources.includes("documents"),
    ledgerEntries: enabledSources.includes("ledgerEntries"),
    leases: enabledSources.includes("leases"),
    maintenanceTasks: enabledSources.includes("maintenanceTasks"),
    owners: enabledSources.includes("owners"),
    people: enabledSources.includes("people"),
    timelineEvents: enabledSources.includes("timelineEvents"),
    units: enabledSources.includes("units"),
  };
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
    title: "Income & Expense",
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
    title: "Vacancy & Lease Risk",
    totalsTraceLabel: `Risk counts trace to ${rows.length} unit rows and their lease/document links.`,
  });
}

function buildMaintenanceCostReport(context: ReportContext): TrustedReport {
  const linkedLedgerIds = new Set(
    context.maintenanceTasks.flatMap((task) => task.ledger_entry_id ?? []),
  );
  const linkedTimelineIds = new Set(
    context.maintenanceTasks.flatMap((task) => task.timeline_event_id ?? []),
  );
  const taskRows = context.maintenanceTasks.map((task) => {
    const property = context.propertiesById.get(task.property_id);
    const unit = task.unit_id ? context.unitsById.get(task.unit_id) : undefined;
    const linkedLedger = task.ledger_entry_id
      ? context.ledgerEntries.find((entry) => entry.id === task.ledger_entry_id)
      : undefined;
    const linkedTimeline = task.timeline_event_id
      ? context.timelineEvents.find((event) => event.id === task.timeline_event_id)
      : undefined;
    const actualCost =
      task.actual_cost_amount !== null && task.actual_cost_currency
        ? formatMoney(task.actual_cost_amount, task.actual_cost_currency)
        : "No actual cost";
    const estimate =
      task.cost_estimate_amount !== null && task.cost_estimate_currency
        ? `Est. ${formatMoney(task.cost_estimate_amount, task.cost_estimate_currency)}`
        : "No estimate";

    return reportRow({
      cells: {
        amount: `${actualCost} / ${estimate}`,
        category: normalizeCategory(task.category),
        date: formatDate(getTaskReportDate(task)),
        property: propertyLabel(property),
        source: "Case",
        status: formatStatus(task.status),
        summary: `${formatStatus(task.priority)} / ${task.title}`,
        unit: unit ? unitLabel(unit) : "Property-level",
      },
      href: `/maintenance?archiveState=all&taskId=${task.id}`,
      id: `task-${task.id}`,
      sources: compactSources([
        property && propertySource(property),
        unit && unitSource(unit),
        maintenanceTaskSource(task),
        linkedLedger && ledgerSource(linkedLedger),
        linkedTimeline && timelineSource(linkedTimeline),
      ]),
      title: task.title,
      tone: getMaintenanceTaskTone(task, context.periodEnd),
    });
  });
  const ledgerRows = context.ledgerEntries
    .filter((entry) => isMaintenanceLedger(entry) && !linkedLedgerIds.has(entry.id))
    .map((entry) => {
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
    .filter(
      (event) => isMaintenanceTimeline(event) && !linkedTimelineIds.has(event.id),
    )
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
  const rows = [...taskRows, ...ledgerRows, ...timelineRows].toSorted((first, second) =>
    first.cells.date.localeCompare(second.cells.date),
  );
  const totalActualUsd =
    sumMaintenanceTaskActualUsd(context.maintenanceTasks) +
    sumLedgerUsd(
      context.ledgerEntries.filter(
        (entry) => isMaintenanceLedger(entry) && !linkedLedgerIds.has(entry.id),
      ),
      context,
      true,
    ) +
    sumTimelineCostUsd(
      context.timelineEvents.filter(
        (event) => isMaintenanceTimeline(event) && !linkedTimelineIds.has(event.id),
      ),
      context,
    );
  const totalEstimateUsd = sumMaintenanceTaskEstimateUsd(context.maintenanceTasks);
  const openTasks = context.maintenanceTasks.filter((task) =>
    isOpenMaintenanceTask(task.status),
  );

  return baseReport(context, {
    columns: [
      column("date", "Date"),
      column("source", "Source"),
      column("property", "Property"),
      column("unit", "Unit"),
      column("category", "Category"),
      column("status", "Status"),
      column("summary", "Maintenance record"),
      column("amount", "Amount", "right"),
    ],
    description:
      "Maintenance case report with category, status, property/unit, actual costs, estimates, and legacy ledger/timeline cost fallbacks.",
    emptyDescription: "No maintenance cases or legacy maintenance cost rows exist for this period.",
    emptyTitle: "No maintenance records",
    exportFilenameBase: "maintenance-cost",
    kind: "maintenance-cost",
    rows,
    summary: [
      metric("Cases", String(taskRows.length), "Maintenance task/case rows", taskRows.length),
      metric("Open", String(openTasks.length), "Open maintenance cases", openTasks.length),
      metric(
        "Actual cost",
        moneyFromUsd(totalActualUsd, context),
        "Actual case cost plus unlinked legacy ledger/timeline costs",
        rows.length,
      ),
      metric(
        "Estimated",
        moneyFromUsd(totalEstimateUsd, context),
        "Maintenance case cost estimates",
        taskRows.length,
      ),
    ],
    title: "Maintenance Cost",
    totalsTraceLabel: `Maintenance report traces to ${taskRows.length} cases, ${ledgerRows.length} unlinked ledger rows, and ${timelineRows.length} unlinked timeline rows.`,
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
        href: buildLeaseCreateHref(unit),
        issue: "Occupied without active lease",
        nextAction: "Create or link the active lease.",
        record: unitLabel(unit),
        rowId: `unit-lease-${unit.id}`,
        source: unitSource(unit),
      }));
    }

    if (documents.length === 0) {
      rows.push(missingDataRow({
        href: buildDocumentCreateHref(unit),
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
    title: "Record Readiness",
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
  const scopedInput = filterReportInputByUnit(input);
  const propertiesById = indexById(scopedInput.properties);
  const unitsById = indexById(scopedInput.units);
  const activeLeaseByUnitId = new Map<string, LeaseRow>();

  for (const lease of scopedInput.leases.filter(isActiveLease).toSorted(compareLeaseStartDesc)) {
    if (lease.unit_id && !activeLeaseByUnitId.has(lease.unit_id)) {
      activeLeaseByUnitId.set(lease.unit_id, lease);
    }
  }

  return {
    ...scopedInput,
    activeLeaseByUnitId,
    documentsByLeaseId: groupByNullable(scopedInput.documents, "lease_id"),
    documentsByLedgerId: groupByNullable(scopedInput.documents, "ledger_entry_id"),
    documentsByPropertyId: groupByNullable(scopedInput.documents, "property_id"),
    documentsByTimelineId: groupByNullable(scopedInput.documents, "timeline_event_id"),
    documentsByUnitId: groupByNullable(scopedInput.documents, "unit_id"),
    generatedAt: scopedInput.generatedAt ?? new Date().toISOString(),
    ledgerByPropertyId: groupBy(scopedInput.ledgerEntries, "property_id"),
    ledgerByUnitId: groupByNullable(scopedInput.ledgerEntries, "unit_id"),
    maintenanceByPropertyId: groupBy(scopedInput.maintenanceTasks, "property_id"),
    maintenanceByUnitId: groupByNullable(scopedInput.maintenanceTasks, "unit_id"),
    ownersByPropertyId: indexPrimaryOwners(scopedInput.owners),
    peopleById: indexById(scopedInput.people),
    periodLabel: `${formatDate(scopedInput.periodStart)} - ${formatDate(scopedInput.periodEnd)}`,
    propertiesById,
    scopeLabel: getScopeLabel(scopedInput.viewQuery, propertiesById, unitsById),
    timelineByPropertyId: groupBy(scopedInput.timelineEvents, "property_id"),
    timelineByUnitId: groupByNullable(scopedInput.timelineEvents, "unit_id"),
    unitsById,
    unitsByPropertyId: groupBy(scopedInput.units, "property_id"),
  };
}

function filterReportInputByUnit(input: TrustedReportInput): TrustedReportInput {
  if (input.viewQuery.unitId === "all") {
    return input;
  }

  const unitId = input.viewQuery.unitId;

  return {
    ...input,
    documents: input.documents.filter((document) => document.unit_id === unitId),
    ledgerEntries: input.ledgerEntries.filter((entry) => entry.unit_id === unitId),
    leases: input.leases.filter((lease) => lease.unit_id === unitId),
    maintenanceTasks: input.maintenanceTasks.filter((task) => task.unit_id === unitId),
    timelineEvents: input.timelineEvents.filter((event) => event.unit_id === unitId),
    units: input.units.filter((unit) => unit.id === unitId),
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
    sourceCount: sources.length,
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

function buildDocumentCreateHref(unit: UnitRow) {
  const params = new URLSearchParams({
    action: "create",
    category: "Unit",
    propertyId: unit.property_id,
    unitId: unit.id,
  });

  return `/documents?${params.toString()}`;
}

function buildLeaseCreateHref(unit: UnitRow) {
  const params = new URLSearchParams({
    action: "create",
    propertyId: unit.property_id,
    unitId: unit.id,
  });

  return `/leases?${params.toString()}`;
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

function maintenanceTaskSource(task: MaintenanceTaskRow): ReportSourceLink {
  return {
    href: `/maintenance?archiveState=all&taskId=${task.id}`,
    id: task.id,
    label: task.title,
    recordType: "maintenance",
  };
}

function documentSource(document: DocumentRow): ReportSourceLink {
  return {
    href: `/documents?archiveState=all&documentId=${document.id}`,
    id: document.id,
    label: document.file_name,
    recordType: "document",
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

function isOpenMaintenanceTask(status: string) {
  const normalized = normalizeValue(status);

  return normalized !== "completed" && normalized !== "cancelled";
}

function getMaintenanceTaskTone(
  task: MaintenanceTaskRow,
  periodEnd: string,
): TrustedReportRow["tone"] {
  if (normalizeValue(task.status) === "ready_for_review") {
    return "warning";
  }

  if (isOpenMaintenanceTask(task.status) && task.due_date && task.due_date < periodEnd) {
    return "danger";
  }

  if (normalizeValue(task.priority) === "urgent" || normalizeValue(task.priority) === "high") {
    return "warning";
  }

  if (normalizeValue(task.status) === "completed") {
    return "success";
  }

  return "neutral";
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
  _context?: unknown,
  absolute = false,
) {
  return entries.reduce((total, entry) => {
    const amount = toUsd(entry.amount, entry.currency);
    const signedAmount = absolute ? Math.abs(amount) : isExpense(entry) ? -amount : amount;

    return total + signedAmount;
  }, 0);
}

function sumTimelineCostUsd(
  events: TimelineRow[],
  _context?: unknown,
) {
  void _context;

  return events.reduce((total, event) => {
    if (event.cost_amount === null || !event.cost_currency) {
      return total;
    }

    return total + Math.abs(toUsd(event.cost_amount, event.cost_currency));
  }, 0);
}

function sumMaintenanceTaskActualUsd(tasks: MaintenanceTaskRow[]) {
  return tasks.reduce((total, task) => {
    if (task.actual_cost_amount === null || !task.actual_cost_currency) {
      return total;
    }

    return total + Math.abs(toUsd(task.actual_cost_amount, task.actual_cost_currency));
  }, 0);
}

function sumMaintenanceTaskEstimateUsd(tasks: MaintenanceTaskRow[]) {
  return tasks.reduce((total, task) => {
    if (task.cost_estimate_amount === null || !task.cost_estimate_currency) {
      return total;
    }

    return total + Math.abs(toUsd(task.cost_estimate_amount, task.cost_estimate_currency));
  }, 0);
}

function taskFallsInPeriod(
  task: MaintenanceTaskRow,
  period: { end: string; start: string },
) {
  const reportDate = getTaskReportDate(task);

  return reportDate >= period.start && reportDate <= period.end;
}

function getTaskReportDate(task: MaintenanceTaskRow) {
  return task.due_date ?? task.created_at.slice(0, 10);
}

function toUsd(
  amount: number,
  _currency: CurrencyCode,
  _context?: unknown,
) {
  void _currency;
  void _context;

  return amount;
}

function moneyFromUsd(
  amount: number,
  _context?: unknown,
) {
  void _context;

  return formatMoneyDisplay(amount, "USD").primary;
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

function getScopeLabel(
  viewQuery: ReportsViewQuery,
  propertiesById: Map<string, PropertyRow>,
  unitsById: Map<string, UnitRow>,
) {
  if (viewQuery.unitId !== "all") {
    const unit = unitsById.get(viewQuery.unitId);
    const property = unit ? propertiesById.get(unit.property_id) : undefined;

    return unit
      ? `${propertyLabel(property)} / ${unitLabel(unit)}`
      : "Selected unit";
  }

  if (viewQuery.propertyId === "all") {
    return "All properties";
  }

  return propertyLabel(propertiesById.get(viewQuery.propertyId));
}

async function loadReportProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  viewQuery: ReportsViewQuery,
) {
  let query = supabase
    .from("properties")
    .select("id, code, name, owner, property_type, status", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (viewQuery.propertyId !== "all") {
    query = query.eq("id", viewQuery.propertyId);
  }

  const result = await query
    .order("code", { ascending: true })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report properties: ${result.error.message}`);
  }

  assertCompleteReportSource("report properties", result);

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
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report units: ${result.error.message}`);
  }

  assertCompleteReportSource("report units", result);

  return result.data ?? [];
}

async function loadReportLeases(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const result = await supabase
    .from("leases")
    .select(reportLeaseSelect, { count: "exact" })
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .order("lease_start_date", { ascending: false })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report leases: ${result.error.message}`);
  }

  assertCompleteReportSource("report leases", result);

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
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .gte("transaction_date", period.start)
    .lte("transaction_date", period.end)
    .order("transaction_date", { ascending: true })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report ledger entries: ${result.error.message}`);
  }

  assertCompleteReportSource("report ledger entries", result);

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
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .gte("event_date", period.start)
    .lte("event_date", period.end)
    .order("event_date", { ascending: true })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report timeline events: ${result.error.message}`);
  }

  assertCompleteReportSource("report timeline events", result);

  return result.data ?? [];
}

async function loadReportMaintenanceTasks(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
  period: { end: string; start: string },
) {
  const periodEndExclusive = addIsoDays(period.end, 1);
  const result = await supabase
    .from("tasks")
    .select(
      "id, property_id, unit_id, title, category, priority, status, due_date, due_time, cost_estimate_amount, cost_estimate_currency, actual_cost_amount, actual_cost_currency, recurrence_frequency, ledger_entry_id, timeline_event_id, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .is("archived_at", null)
    .or(
      `and(due_date.gte.${period.start},due_date.lte.${period.end}),and(due_date.is.null,created_at.gte.${period.start}T00:00:00.000Z,created_at.lt.${periodEndExclusive}T00:00:00.000Z)`,
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(
      `Could not load report maintenance cases: ${result.error.message}`,
    );
  }

  assertCompleteReportSource("report maintenance cases", result);

  return ((result.data ?? []) as MaintenanceTaskRow[]).filter((task) =>
    taskFallsInPeriod(task, period),
  );
}

async function loadReportDocuments(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const result = await supabase
    .from("documents")
    .select(
      "id, property_id, unit_id, lease_id, ledger_entry_id, timeline_event_id, file_name",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report documents: ${result.error.message}`);
  }

  assertCompleteReportSource("report documents", result);

  return result.data ?? [];
}

async function loadReportOwners(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: string[],
) {
  const result = await supabase
    .from("property_owners")
    .select("id, property_id, person_id, ownership_label, ownership_percent", {
      count: "exact",
    })
    .eq("organization_id", organizationId)
    .in("property_id", propertyIds)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null)
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report owners: ${result.error.message}`);
  }

  assertCompleteReportSource("report owners", result);

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
    .select("id, display_name", { count: "exact" })
    .eq("organization_id", organizationId)
    .in("id", [...personIds])
    .is("archived_at", null)
    .range(0, reportSourceRangeEnd);

  if (result.error) {
    throw new Error(`Could not load report owner people: ${result.error.message}`);
  }

  assertCompleteReportSource("report owner people", result);

  return result.data ?? [];
}

function assertCompleteReportSource(
  sourceName: string,
  result: { count: number | null; data: unknown[] | null },
) {
  const loadedRows = result.data?.length ?? 0;
  const totalRows = result.count ?? loadedRows;

  if (totalRows <= loadedRows) {
    return;
  }

  throw new Error(
    `${sourceName} has ${totalRows.toLocaleString()} rows, which exceeds the ${maxReportSourceRows.toLocaleString()} row report source limit. Narrow the report scope before exporting.`,
  );
}

function addIsoDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return value.toISOString().slice(0, 10);
}
