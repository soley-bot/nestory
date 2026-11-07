import { createSupabaseServerClient } from "@/lib/db/server";
import { withFinancialReadContext } from "@/lib/finance/financial-write-context.server";
import { formatPropertyOptionLabel } from "@/lib/entity-option-labels";
import { getTrustedReport } from "@/features/reports/data/trusted-report";
import {
  loadScopedFinanceContext,
  type ScopedFinanceContext,
} from "@/features/finance-operations/data/scoped-finance-context";
import type {
  ReportsScreenData,
  ReportsViewQuery,
  TrustedReport,
} from "@/features/reports/reports.types";

const maxScreenReportRows = 75;
const maxScreenSourceLinks = 5;

export async function getReportsScreenData(
  organizationId: string,
  viewQuery: ReportsViewQuery,
  { financeSafeRecords = false } = {},
): Promise<ReportsScreenData> {
  // The selector/source context belongs to the same read as report totals.
  // Checking only inside getTrustedReport would accept a context loaded before
  // a committed backdate, ownership edit, or financial reset.
  const read = () => loadReportsScreenData(organizationId, viewQuery, financeSafeRecords);
  return viewQuery.report === "people-readiness"
    ? read()
    : withFinancialReadContext(organizationId, async (context) => {
      const data = await read();
      return { ...data, trustedReport: { ...data.trustedReport, financialGeneration: context.generation } };
    });
}

async function loadReportsScreenData(
  organizationId: string,
  viewQuery: ReportsViewQuery,
  financeSafeRecords: boolean,
): Promise<ReportsScreenData> {
  const supabase = await createSupabaseServerClient();
  const financeContext = await loadScopedFinanceContext(
    supabase,
    organizationId,
    viewQuery.propertyId === "all" ? undefined : viewQuery.propertyId,
  );
  const { propertyOptions, unitOptions } = getReportSelectorData(financeContext, ["transactions", "management-fees", "rent-collections"].includes(viewQuery.report), viewQuery.report === "unit-profit-loss");
  const choosingUnits = viewQuery.report === "unit-profit-loss" && viewQuery.unitId === "all" && !viewQuery.scopeInvalid
    && (viewQuery.propertyId === "all" || propertyOptions.some(property => property.id === viewQuery.propertyId));
  // The landing screen selects independent reports. It needs no combined
  // transaction payload or totals; each chosen unit is verified on preview/export.
  const trustedReport: TrustedReport = choosingUnits ? {
    kind: "unit-profit-loss", title: "Unit profit & loss", columns: [], rows: [], summary: [],
    description: "Choose units to generate separate reports.", emptyTitle: "Choose units", emptyDescription: "",
    exportFilenameBase: "unit-profit-loss", generatedAt: new Date().toISOString(), periodLabel: viewQuery.month,
    scopeLabel: propertyOptions.find(property => property.id === viewQuery.propertyId)?.label ?? "All properties", totalsTraceLabel: "",
  } : await getTrustedReport({
    financeContext,
    organizationId,
    supabase,
    viewQuery,
  });

  return {
    ownerOptions: trustedReport.ownerOptions ?? [],
    propertyOptions,
    trustedReport: prepareTrustedReportForScreen(trustedReport, { financeSafeRecords }),
    unitOptions,
    viewQuery,
  };
}

function getReportSelectorData(financeContext: ScopedFinanceContext, includeArchived = false, includeArchivedUnits = false) {
  const properties = financeContext.properties.filter(
    (property) => includeArchived || property.archived_at === null,
  ).toSorted((first, second) => first.name.localeCompare(second.name));
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const propertyOptions = properties.map((property) => ({
    id: property.id,
    label: `${formatPropertyOptionLabel(property)}${property.archived_at ? " (archived)" : ""}`,
  }));
  const unitOptions = financeContext.units
    .filter(
      (unit) =>
        (includeArchived || includeArchivedUnits || unit.archived_at === null) && propertiesById.has(unit.property_id),
    )
    .map((unit) => {
      const property = propertiesById.get(unit.property_id);
      return {
        id: unit.id,
        label: `${property?.code ?? "Unknown"} / Unit ${unit.unit_number}${unit.archived_at ? " (archived)" : ""}`,
        propertyId: unit.property_id,
      };
    });

  return { propertyOptions, unitOptions };
}

export function prepareTrustedReportForScreen(
  report: TrustedReport,
  options: { financeSafeRecords?: boolean } = {},
): TrustedReport {
  const preview = trimTrustedReportForScreen(report);
  return options.financeSafeRecords ? makeReportRecordsFinanceSafe(preview) : preview;
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
  if (["transactions", "management-fees", "rent-roll", "rent-collections"].includes(report.kind)) {
    return { ...report, totalRowCount: report.rows.filter((row) => !row.isGroup).length };
  }
  return {
    ...report,
    rows: (report.kind === "unit-profit-loss" ? report.rows : report.rows.slice(0, maxScreenReportRows)).map((row) => ({
      ...row,
      sourceLinks:
        report.kind === "monthly-owner-activity"
          ? row.sourceLinks
          : row.sourceLinks.slice(0, maxScreenSourceLinks),
    })),
    totalRowCount: report.rows.length,
  };
}
