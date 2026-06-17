import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyDisplaySettings } from "@/lib/money/format";
import {
  buildPropertySummary,
  type PropertySummary,
} from "@/features/properties/data/property-summary";
import { buildPropertyDetail } from "@/features/properties/data/property-detail";
import {
  DEFAULT_PROPERTY_SORT,
  parsePropertySearchParams,
} from "@/features/properties/property.filters";
import type {
  PropertyPagination,
  PropertyViewQuery,
} from "@/features/properties/property.types";

export type { PropertySummary } from "@/features/properties/data/property-summary";
export type { PropertyDetail } from "@/features/properties/data/property-detail";

type PropertySummaryOptions = {
  includeArchived?: boolean;
};

export async function getPropertySummaries(
  organizationId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
  options: PropertySummaryOptions = {},
) {
  const supabase = await createSupabaseServerClient();

  let propertiesQuery = supabase
    .from("properties")
    .select(
      "id, name, code, property_type, owner, address, status, acquisition_date, notes, archived_at",
    )
    .eq("organization_id", organizationId)
    .order("code", { ascending: true });

  if (!options.includeArchived) {
    propertiesQuery = propertiesQuery.is("archived_at", null);
  }

  const [propertiesResult, unitsResult, ledgerResult] = await Promise.all([
    propertiesQuery,
    supabase
      .from("units")
      .select("property_id, status")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
    supabase
      .from("ledger_entries")
      .select("property_id, direction, amount, currency")
      .eq("organization_id", organizationId)
      .is("archived_at", null),
  ]);

  if (propertiesResult.error) {
    throw new Error(`Could not load properties: ${propertiesResult.error.message}`);
  }

  if (unitsResult.error) {
    throw new Error(`Could not load property units: ${unitsResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load ledger totals: ${ledgerResult.error.message}`);
  }

  const unitsByProperty = groupByProperty(unitsResult.data ?? []);
  const ledgerByProperty = groupByProperty(ledgerResult.data ?? []);

  return (propertiesResult.data ?? []).map((property): PropertySummary => {
    const units = unitsByProperty.get(property.id) ?? [];
    const ledgerEntries = ledgerByProperty.get(property.id) ?? [];

    return buildPropertySummary({
      currencySettings,
      ledgerEntries,
      property,
      units,
    });
  });
}

export async function getPropertiesScreenData(
  organizationId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
  viewQuery: PropertyViewQuery = parsePropertySearchParams({}),
) {
  const properties = await getPropertySummaries(organizationId, currencySettings, {
    includeArchived: true,
  });
  const filteredProperties = filterPropertySummaries(properties, viewQuery);
  const sortedProperties = sortPropertySummaries(
    filteredProperties,
    viewQuery.sort,
  );
  const pagination = buildPropertyPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedProperties.length,
  });

  return {
    pagination,
    properties: getPropertyPageSummaries(sortedProperties, pagination),
  };
}

export async function getPropertySummary(
  organizationId: string,
  propertyId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  const properties = await getPropertySummaries(organizationId, currencySettings);
  return properties.find((property) => property.id === propertyId) ?? null;
}

export async function getPropertyDetail(
  organizationId: string,
  propertyId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
) {
  const supabase = await createSupabaseServerClient();

  const [propertyResult, unitsResult, ledgerResult] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, code, property_type, owner, address, status, archived_at")
      .eq("organization_id", organizationId)
      .eq("id", propertyId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("units")
      .select(
        "id, unit_number, floor, status, current_rent_amount, current_rent_currency, archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("unit_number", { ascending: true }),
    supabase
      .from("ledger_entries")
      .select("property_id, direction, amount, currency")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null),
  ]);

  if (propertyResult.error) {
    throw new Error(`Could not load property: ${propertyResult.error.message}`);
  }

  if (!propertyResult.data) {
    return null;
  }

  if (unitsResult.error) {
    throw new Error(`Could not load property units: ${unitsResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load property ledger: ${ledgerResult.error.message}`);
  }

  return buildPropertyDetail({
    currencySettings,
    ledgerEntries: ledgerResult.data ?? [],
    property: propertyResult.data,
    units: unitsResult.data ?? [],
  });
}

function groupByProperty<T extends { property_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const group = grouped.get(row.property_id) ?? [];
    group.push(row);
    grouped.set(row.property_id, group);
  }

  return grouped;
}

function filterPropertySummaries(
  properties: PropertySummary[],
  viewQuery: PropertyViewQuery,
) {
  const tokens = viewQuery.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return properties.filter((property) => {
    const matchesArchiveState =
      viewQuery.archiveState === "all" ||
      (viewQuery.archiveState === "archived"
        ? property.isArchived
        : !property.isArchived);
    const matchesStatus =
      viewQuery.status === "all" || property.formValues.status === viewQuery.status;
    const haystack = [
      property.name,
      property.code,
      property.type,
      property.owner,
      property.address,
      property.status,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return matchesArchiveState && matchesStatus && matchesQuery;
  });
}

function sortPropertySummaries(
  properties: PropertySummary[],
  sort = DEFAULT_PROPERTY_SORT,
) {
  return [...properties].sort((first, second) => {
    if (sort === "name_asc") {
      return compareStrings(first.name, second.name);
    }

    if (sort === "status_asc") {
      return (
        compareStrings(first.status, second.status) ||
        compareStrings(first.code, second.code)
      );
    }

    if (sort === "net_desc") {
      return (
        second.netIncomeUsd - first.netIncomeUsd ||
        compareStrings(first.code, second.code)
      );
    }

    return compareStrings(first.code, second.code);
  });
}

function buildPropertyPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): PropertyPagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const from = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = totalCount === 0 ? 0 : Math.min(safePage * pageSize, totalCount);

  return {
    from,
    page: safePage,
    pageSize,
    to,
    totalCount,
    totalPages,
  };
}

function getPropertyPageSummaries(
  properties: PropertySummary[],
  pagination: PropertyPagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return properties.slice(start, pagination.to);
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
