import { createSupabaseServerClient } from "@/lib/db/server";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import {
  formatLeaseStatus,
  formatUnitStatus,
  getUnitStatusTone,
  selectCurrentLease,
} from "@/features/units/data/unit-summary";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import type {
  OccupancyReport,
  OccupancyReportRow,
  ReportPropertyOption,
  ReportUnitOption,
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";
import { formatDate } from "@/lib/dates/format";
import {
  formatMoney,
  formatMoneyDisplay,
  type CurrencyCode,
} from "@/lib/money/format";

const propertySelect = "id, code, name";
const occupancyUnitSelect =
  "id, property_id, unit_number, floor, size_sqm, status, current_rent_amount, current_rent_currency";
const occupancyLeaseSelect =
  "id, unit_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency";
const maxScreenReportRows = 75;
const maxScreenSourceLinks = 5;

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

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

type ReportBaseData = {
  propertiesById: Map<string, PropertyRow>;
  propertyOptions: ReportPropertyOption[];
  supabase: SupabaseServerClient;
  unitOptions: ReportUnitOption[];
};

type OccupancyReportData = Pick<
  ReportsScreenData,
  "propertyOptions" | "viewQuery"
> & {
  occupancyReport: OccupancyReport;
};

export async function getReportsScreenData(
  organizationId: string,
  viewQuery: ReportsViewQuery,
): Promise<ReportsScreenData> {
  const { propertyOptions, unitOptions } =
    await getReportBaseData(organizationId);
  const trustedReport = await getTrustedReport({
    organizationId,
    viewQuery,
  });

  return {
    ownerOptions: trustedReport.ownerOptions ?? [],
    propertyOptions,
    trustedReport: prepareTrustedReportForScreen(trustedReport),
    unitOptions,
    viewQuery,
  };
}

export function prepareTrustedReportForScreen(
  report: TrustedReport,
  options: { financeSafeRecords?: boolean } = {},
): TrustedReport {
  const prepared = options.financeSafeRecords
    ? makeReportRecordsFinanceSafe(report)
    : report;
  return trimTrustedReportForScreen(prepared);
}

function makeReportRecordsFinanceSafe(report: TrustedReport): TrustedReport {
  return {
    ...report,
    rows: report.rows.map((row) => ({
      ...row,
      href: toFinanceSafeRecordHref(row.href),
      sourceLinks: row.sourceLinks.map((source) => ({
        ...source,
        href: toFinanceSafeRecordHref(source.href),
      })),
    })),
  };
}

function toFinanceSafeRecordHref(href?: string) {
  if (!href) return undefined;

  if (/^\/properties\/[^/?]+\/account(?:\?[^#]*)?$/.test(href)) {
    return href;
  }

  const propertyMatch = href.match(/^\/properties\/([^/?]+)(?:[/?]|$)/);
  if (propertyMatch) {
    return `/properties/${propertyMatch[1]}/account`;
  }

  const allowedPrefixes = [
    "/balances",
    "/bills-expenses",
    "/finance",
    "/leases",
    "/ledger",
    "/petty-cash",
    "/rent-income",
    "/reports",
  ];
  return allowedPrefixes.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}?`) || href.startsWith(`${prefix}/`),
  )
    ? href
    : undefined;
}

function trimTrustedReportForScreen(report: TrustedReport): TrustedReport {
  return {
    ...report,
    rows: report.rows.slice(0, maxScreenReportRows).map((row) => ({
      ...row,
      sourceLinks:
        report.kind === "monthly-owner-activity"
          ? row.sourceLinks
          : row.sourceLinks.slice(0, maxScreenSourceLinks),
    })),
    totalRowCount: report.rows.length,
  };
}

export async function getOccupancyReportData(
  organizationId: string,
  viewQuery: ReportsViewQuery,
): Promise<OccupancyReportData> {
  const { propertiesById, propertyOptions, supabase } =
    await getReportBaseData(organizationId);

  return {
    occupancyReport: await getOccupancyReport({
      organizationId,
      propertiesById,
      supabase,
      viewQuery,
    }),
    propertyOptions,
    viewQuery,
  };
}

async function getReportBaseData(
  organizationId: string,
): Promise<ReportBaseData> {
  const supabase = await createSupabaseServerClient();
  const propertiesResult = await supabase
    .from("properties")
    .select(propertySelect)
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (propertiesResult.error) {
    throw new Error(
      `Could not load report properties: ${propertiesResult.error.message}`,
    );
  }

  const properties = propertiesResult.data ?? [];
  const propertyOptions = toPropertyOptions(properties);
  const propertiesById = indexById(properties);
  const propertyIds = properties.map(({ id }) => id);
  const unitsResult =
    propertyIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("units")
          .select("id, property_id, unit_number")
          .eq("organization_id", organizationId)
          .in("property_id", propertyIds)
          .is("archived_at", null)
          .order("unit_number", { ascending: true });

  if (unitsResult.error) {
    throw new Error(
      `Could not load report unit options: ${unitsResult.error.message}`,
    );
  }

  const unitOptions = (unitsResult.data ?? []).map((unit) => {
    const property = propertiesById.get(unit.property_id);
    return {
      id: unit.id,
      label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}`,
      propertyId: unit.property_id,
    };
  });

  return { propertiesById, propertyOptions, supabase, unitOptions };
}

async function getOccupancyReport({
  organizationId,
  propertiesById,
  supabase,
  viewQuery,
}: {
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
    .from("current_leases")
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
    throw new Error(
      `Could not load report units: ${unitsResult.error.message}`,
    );
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

function toOccupancyReportRow({
  activeLease,
  property,
  unit,
}: {
  activeLease?: OccupancyLeaseRow;
  property?: PropertyRow;
  unit: OccupancyUnitRow;
}): OccupancyReportRow {
  const statusValue = normalizeUnitStatus(unit.status);
  const rentAmount =
    unit.current_rent_amount ?? activeLease?.monthly_rent_amount;
  const rentCurrency =
    unit.current_rent_currency ?? activeLease?.monthly_rent_currency;
  const rentDisplay =
    rentAmount !== undefined && rentCurrency
      ? formatMoneyDisplay(rentAmount, rentCurrency)
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
    typeLabel:
      unit.size_sqm === null ? "-" : `${formatNumber(unit.size_sqm)} sqm`,
    unitNumber: unit.unit_number,
  };
}

function getOccupancyRemark(
  statusValue: OccupancyReportRow["statusValue"],
  activeLease?: OccupancyLeaseRow,
) {
  if (statusValue === "vacant") {
    return activeLease ? "Active lease recorded" : "Available";
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

function normalizeUnitStatus(
  status: string,
): OccupancyReportRow["statusValue"] {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

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

function toPropertyOptions(properties: PropertyRow[]): ReportPropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: formatPropertyOptionLabel(property),
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
