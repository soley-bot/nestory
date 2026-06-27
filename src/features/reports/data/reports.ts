import { createSupabaseServerClient } from "@/lib/db/server";
import {
  formatLeaseStatus,
  formatUnitStatus,
  getUnitStatusTone,
  selectCurrentLease,
} from "@/features/units/data/unit-summary";
import { getOrganizationCurrencySettings } from "@/features/settings/data/settings";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import {
  getReportMonthRange,
} from "@/features/reports/reports.filters";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ProfitLossCategoryGroup,
  ProfitLossDirectionGroup,
  ProfitLossReport,
  ProfitLossReportEntry,
  ReportPropertyOption,
  ReportsScreenData,
  ReportsViewQuery,
} from "@/features/reports/reports.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";
import { formatMoneyTotalsDisplay } from "@/lib/money/totals";

const propertySelect = "id, code, name";
const occupancyUnitSelect =
  "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency";
const occupancyLeaseSelect =
  "id, unit_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const profitLossEntrySelect =
  "id, property_id, unit_id, transaction_date, direction, category, amount, currency, description";
const profitLossUnitSelect = "id, property_id, unit_number";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type OccupancyUnitRow = {
  current_rent_amount: number | null;
  current_rent_currency: CurrencyCode | null;
  floor: string | null;
  id: string;
  property_id: string;
  size_sqm: number | null;
  status: string;
  unit_number: string;
};

type OccupancyLeaseRow = {
  id: string;
  lease_end_date: string;
  lease_start_date: string;
  monthly_rent_amount: number;
  monthly_rent_currency: CurrencyCode;
  status: string;
  tenant_name: string;
  unit_id: string | null;
};

type ProfitLossEntryRow = {
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

type ProfitLossUnitRow = {
  id: string;
  property_id: string;
  unit_number: string;
};

type MoneyInput = {
  amount: number;
  currency: CurrencyCode;
  direction?: "income" | "expense";
};

export async function getReportsScreenData(
  organizationId: string,
  viewQuery: ReportsViewQuery,
): Promise<ReportsScreenData> {
  const supabase = await createSupabaseServerClient();
  const [propertiesResult, currencySettings] = await Promise.all([
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    getOrganizationCurrencySettings(organizationId),
  ]);

  if (propertiesResult.error) {
    throw new Error(
      `Could not load report properties: ${propertiesResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const propertyOptions = toPropertyOptions(properties);
  const propertiesById = indexById(properties);
  const trustedReportPromise = getTrustedReport({
    currencySettings,
    organizationId,
    viewQuery,
  });

  if (viewQuery.report === "income-expense") {
    return {
      currencySettings,
      profitLossReport: await getProfitLossReport({
        currencySettings,
        organizationId,
        propertiesById,
        propertyOptions,
        supabase,
        viewQuery,
      }),
      propertyOptions,
      trustedReport: await trustedReportPromise,
      viewQuery,
    };
  }

  if (viewQuery.report !== "vacancy-risk") {
    return {
      currencySettings,
      propertyOptions,
      trustedReport: await trustedReportPromise,
      viewQuery,
    };
  }

  return {
    currencySettings,
    occupancyReport: await getOccupancyReport({
      currencySettings,
      organizationId,
      propertiesById,
      supabase,
      viewQuery,
    }),
    propertyOptions,
    trustedReport: await trustedReportPromise,
    viewQuery,
  };
}

async function getOccupancyReport({
  currencySettings,
  organizationId,
  propertiesById,
  supabase,
  viewQuery,
}: {
  currencySettings: CurrencyDisplaySettings;
  organizationId: string;
  propertiesById: Map<string, PropertyRow>;
  supabase: SupabaseServerClient;
  viewQuery: ReportsViewQuery;
}): Promise<OccupancyReport> {
  let unitsQuery = supabase
    .from("units")
    .select(occupancyUnitSelect)
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  let leasesQuery = supabase
    .from("leases")
    .select(occupancyLeaseSelect)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not("unit_id", "is", null)
    .order("lease_start_date", { ascending: false });

  if (viewQuery.propertyId !== "all") {
    unitsQuery = unitsQuery.eq("property_id", viewQuery.propertyId);
    leasesQuery = leasesQuery.eq("property_id", viewQuery.propertyId);
  }

  const [unitsResult, leasesResult] = await Promise.all([
    unitsQuery,
    leasesQuery,
  ]);

  if (unitsResult.error) {
    throw new Error(`Could not load report units: ${unitsResult.error.message}`);
  }

  if (leasesResult.error) {
    throw new Error(
      `Could not load report leases: ${leasesResult.error.message}`,
    );
  }

  const leasesByUnitId = groupByUnitId(leasesResult.data ?? []);
  const allRows = (unitsResult.data ?? [])
    .map((unit) =>
      toOccupancyReportRow({
        activeLease: selectCurrentLease(leasesByUnitId.get(unit.id) ?? []),
        currencySettings,
        property: propertiesById.get(unit.property_id),
        unit,
      }),
    )
    .toSorted(compareOccupancyRows);
  const rows =
    viewQuery.status === "all"
      ? allRows
      : allRows.filter((row) => row.statusValue === viewQuery.status);

  return {
    generatedAt: new Date().toISOString(),
    rows,
    totals: {
      occupied: allRows.filter((row) => row.statusValue === "occupied").length,
      other: allRows.filter(
        (row) => row.statusValue !== "occupied" && row.statusValue !== "vacant",
      ).length,
      total: allRows.length,
      vacant: allRows.filter((row) => row.statusValue === "vacant").length,
      visible: rows.length,
    },
  };
}

async function getProfitLossReport({
  currencySettings,
  organizationId,
  propertiesById,
  propertyOptions,
  supabase,
  viewQuery,
}: {
  currencySettings: CurrencyDisplaySettings;
  organizationId: string;
  propertiesById: Map<string, PropertyRow>;
  propertyOptions: ReportPropertyOption[];
  supabase: SupabaseServerClient;
  viewQuery: ReportsViewQuery;
}): Promise<ProfitLossReport> {
  const period = getReportMonthRange(viewQuery.month);
  let entriesQuery = supabase
    .from("ledger_entries")
    .select(profitLossEntrySelect)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .gte("transaction_date", period.start)
    .lte("transaction_date", period.end)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (viewQuery.propertyId !== "all") {
    entriesQuery = entriesQuery.eq("property_id", viewQuery.propertyId);
  }

  const [entriesResult, unitsResult] = await Promise.all([
    entriesQuery,
    supabase
      .from("units")
      .select(profitLossUnitSelect)
      .eq("organization_id", organizationId),
  ]);

  if (entriesResult.error) {
    throw new Error(
      `Could not load profit and loss entries: ${entriesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(
      `Could not load profit and loss units: ${unitsResult.error.message}`,
    );
  }

  return buildProfitLossReport({
    currencySettings,
    entries: entriesResult.data ?? [],
    generatedAt: new Date().toISOString(),
    periodEnd: period.end,
    periodStart: period.start,
    propertiesById,
    propertyLabel: getSelectedPropertyLabel(viewQuery.propertyId, propertyOptions),
    unitsById: indexById(unitsResult.data ?? []),
  });
}

function buildProfitLossReport({
  currencySettings,
  entries,
  generatedAt,
  periodEnd,
  periodStart,
  propertiesById,
  propertyLabel,
  unitsById,
}: {
  currencySettings: CurrencyDisplaySettings;
  entries: ProfitLossEntryRow[];
  generatedAt: string;
  periodEnd: string;
  periodStart: string;
  propertiesById: Map<string, PropertyRow>;
  propertyLabel: string;
  unitsById: Map<string, ProfitLossUnitRow>;
}): ProfitLossReport {
  const reportEntries = entries.map((entry) =>
    toProfitLossReportEntry({
      currencySettings,
      entry,
      property: propertiesById.get(entry.property_id),
      unit: entry.unit_id ? unitsById.get(entry.unit_id) : undefined,
    }),
  );
  const incomeEntries = reportEntries.filter(
    (entry) => entry.direction === "income",
  );
  const expenseEntries = reportEntries.filter(
    (entry) => entry.direction === "expense",
  );
  const netInputs = toMoneyInputs(reportEntries, true);
  const netDisplay = formatMoneyTotalsDisplay(netInputs, currencySettings);

  return {
    entryCount: reportEntries.length,
    expenses: buildDirectionGroup("Expenses", expenseEntries, currencySettings),
    generatedAt,
    income: buildDirectionGroup("Income", incomeEntries, currencySettings),
    netIncomeDisplay: netDisplay,
    netOtherIncomeDisplay: formatMoneyTotalsDisplay([], currencySettings),
    netOperatingIncomeDisplay: netDisplay,
    otherExpensesDisplay: formatMoneyTotalsDisplay([], currencySettings),
    otherIncomeDisplay: formatMoneyTotalsDisplay([], currencySettings),
    periodEnd,
    periodLabel: `${formatDate(periodStart)} - ${formatDate(periodEnd)}`,
    periodStart,
    propertyLabel,
    totalExpensesDisplay: formatMoneyTotalsDisplay(
      toMoneyInputs(expenseEntries),
      currencySettings,
    ),
    totalIncomeDisplay: formatMoneyTotalsDisplay(
      toMoneyInputs(incomeEntries),
      currencySettings,
    ),
  };
}

function toOccupancyReportRow({
  activeLease,
  currencySettings,
  property,
  unit,
}: {
  activeLease?: OccupancyLeaseRow;
  currencySettings: CurrencyDisplaySettings;
  property?: PropertyRow;
  unit: OccupancyUnitRow;
}): OccupancyReportRow {
  const statusValue = normalizeUnitStatus(unit.status);
  const rentAmount = unit.current_rent_amount ?? activeLease?.monthly_rent_amount;
  const rentCurrency =
    unit.current_rent_currency ?? activeLease?.monthly_rent_currency;
  const rentDisplay =
    rentAmount !== undefined && rentCurrency
      ? formatMoneyDisplay(rentAmount, rentCurrency, currencySettings)
      : undefined;

  return {
    floorLabel: unit.floor ? `Floor ${unit.floor}` : "-",
    id: unit.id,
    inclusionLabel: "-",
    propertyCode: property?.code ?? "Unknown",
    propertyId: unit.property_id,
    propertyName: property?.name ?? "Unknown property",
    remark: getOccupancyRemark(statusValue, activeLease),
    rentAmount,
    rentCurrency,
    rentDisplay,
    rentLabel:
      rentAmount !== undefined && rentCurrency
        ? formatMoney(rentAmount, rentCurrency)
        : "-",
    sizeLabel:
      unit.size_sqm === null ? "-" : `${formatNumber(unit.size_sqm)} sqm`,
    statusLabel: formatUnitStatus(unit.status),
    statusTone: getUnitStatusTone(unit.status),
    statusValue,
    typeLabel: unit.size_sqm === null ? "-" : `${formatNumber(unit.size_sqm)} sqm`,
    unitNumber: unit.unit_number,
  };
}

function toProfitLossReportEntry({
  currencySettings,
  entry,
  property,
  unit,
}: {
  currencySettings: CurrencyDisplaySettings;
  entry: ProfitLossEntryRow;
  property?: PropertyRow;
  unit?: ProfitLossUnitRow;
}): ProfitLossReportEntry {
  const direction = entry.direction === "expense" ? "expense" : "income";
  const propertyLabel = property
    ? `${property.code} / ${property.name}`
    : "Unknown property";

  return {
    amount: entry.amount,
    amountDisplay: formatMoneyDisplay(entry.amount, entry.currency, currencySettings),
    category: normalizeCategory(entry.category),
    currency: entry.currency,
    date: entry.transaction_date,
    description: entry.description ?? "",
    direction,
    id: entry.id,
    name: unit ? `Unit ${unit.unit_number}` : "Property",
    propertyLabel,
    typeLabel: direction === "income" ? "Payment" : "Expense",
  };
}

function buildDirectionGroup(
  label: "Income" | "Expenses",
  entries: ProfitLossReportEntry[],
  currencySettings: CurrencyDisplaySettings,
): ProfitLossDirectionGroup {
  const groupsByCategory = new Map<string, ProfitLossReportEntry[]>();

  for (const entry of entries) {
    const group = groupsByCategory.get(entry.category) ?? [];
    group.push(entry);
    groupsByCategory.set(entry.category, group);
  }

  const groups: ProfitLossCategoryGroup[] = Array.from(groupsByCategory.entries())
    .sort(([firstCategory], [secondCategory]) =>
      firstCategory.localeCompare(secondCategory, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map(([category, categoryEntries]) => ({
      category,
      entries: categoryEntries,
      totalDisplay: formatMoneyTotalsDisplay(
        toMoneyInputs(categoryEntries),
        currencySettings,
      ),
    }));

  return {
    entryCount: entries.length,
    groups,
    label,
    totalDisplay: formatMoneyTotalsDisplay(toMoneyInputs(entries), currencySettings),
  };
}

function getOccupancyRemark(
  statusValue: OccupancyReportRow["statusValue"],
  activeLease?: OccupancyLeaseRow,
) {
  if (statusValue === "vacant") {
    return activeLease
      ? "Active lease recorded"
      : "Available";
  }

  if (activeLease) {
    return `${activeLease.tenant_name} / ${formatLeaseStatus(
      activeLease.status,
    )} through ${formatDate(activeLease.lease_end_date)}.`;
  }

  return "No active lease recorded.";
}

function compareOccupancyRows(
  first: OccupancyReportRow,
  second: OccupancyReportRow,
) {
  return (
    getStatusRank(first.statusValue) - getStatusRank(second.statusValue) ||
    compareStrings(first.propertyCode, second.propertyCode) ||
    compareStrings(first.propertyName, second.propertyName) ||
    compareStrings(first.unitNumber, second.unitNumber)
  );
}

function getStatusRank(status: OccupancyReportRow["statusValue"]) {
  if (status === "vacant") {
    return 0;
  }

  if (status === "occupied") {
    return 1;
  }

  if (status === "reserved") {
    return 2;
  }

  if (status === "maintenance") {
    return 3;
  }

  return 4;
}

function normalizeUnitStatus(status: string): OccupancyReportRow["statusValue"] {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");

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

function normalizeCategory(category: string) {
  const normalized = category.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return "Uncategorized";
  }

  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toMoneyInputs(
  entries: ProfitLossReportEntry[],
  includeDirection = false,
): MoneyInput[] {
  return entries.map((entry) => ({
    amount: entry.amount,
    currency: entry.currency,
    direction: includeDirection ? entry.direction : undefined,
  }));
}

function getSelectedPropertyLabel(
  propertyId: string,
  propertyOptions: ReportPropertyOption[],
) {
  if (propertyId === "all") {
    return "All properties";
  }

  return (
    propertyOptions.find((property) => property.id === propertyId)?.label ??
    "Selected property"
  );
}

function toPropertyOptions(properties: PropertyRow[]): ReportPropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}`,
  }));
}

function groupByUnitId<T extends { unit_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    if (!row.unit_id) {
      continue;
    }

    const group = grouped.get(row.unit_id) ?? [];
    group.push(row);
    grouped.set(row.unit_id, group);
  }

  return grouped;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}
