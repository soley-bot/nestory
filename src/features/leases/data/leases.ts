import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyDisplaySettings } from "@/lib/money/format";
import {
  DEFAULT_LEASE_SORT,
  parseLeaseSearchParams,
} from "@/features/leases/lease.filters";
import {
  buildLeaseSummary,
  type LeasePropertyRow,
  type LeaseRow,
  type LeaseUnitRow,
} from "@/features/leases/data/lease-summary";
import type {
  LeasePagination,
  LeasePropertyOption,
  LeaseSummary,
  LeaseUnitOption,
  LeaseViewQuery,
} from "@/features/leases/lease.types";

const leaseSelect =
  "id, property_id, unit_id, tenant_name, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency, deposit_amount, deposit_currency, status, archived_at";
const propertySelect = "id, code, name, archived_at";
const unitSelect = "id, property_id, unit_number, floor, status, archived_at";

export async function getLeasesScreenData(
  organizationId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
  viewQuery: LeaseViewQuery = parseLeaseSearchParams({}),
) {
  const supabase = await createSupabaseServerClient();
  const [leasesResult, propertiesResult, unitsResult] = await Promise.all([
    supabase
      .from("leases")
      .select(leaseSelect)
      .eq("organization_id", organizationId)
      .order("lease_start_date", { ascending: false }),
    supabase
      .from("properties")
      .select(propertySelect)
      .eq("organization_id", organizationId)
      .order("code", { ascending: true }),
    supabase
      .from("units")
      .select(unitSelect)
      .eq("organization_id", organizationId)
      .order("unit_number", { ascending: true }),
  ]);

  if (leasesResult.error) {
    throw new Error(`Could not load leases: ${leasesResult.error.message}`);
  }

  if (propertiesResult.error) {
    throw new Error(
      `Could not load lease properties: ${propertiesResult.error.message}`,
    );
  }

  if (unitsResult.error) {
    throw new Error(`Could not load lease units: ${unitsResult.error.message}`);
  }

  const properties = (propertiesResult.data ?? []) as Array<
    LeasePropertyRow & { archived_at: string | null }
  >;
  const units = (unitsResult.data ?? []) as Array<
    LeaseUnitRow & { archived_at: string | null }
  >;
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const leases = ((leasesResult.data ?? []) as LeaseRow[])
    .map((lease) =>
      buildLeaseSummary({
        currencySettings,
        lease,
        property: propertiesById.get(lease.property_id),
        unit: lease.unit_id ? unitsById.get(lease.unit_id) : undefined,
      }),
    )
    .toSorted(compareLeaseSummaries);
  const filteredLeases = filterLeaseSummaries(leases, viewQuery);
  const sortedLeases = sortLeaseSummaries(filteredLeases, viewQuery.sort);
  const pagination = buildLeasePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedLeases.length,
  });

  return {
    leases: getLeasePageSummaries(sortedLeases, pagination),
    pagination,
    propertyOptions: toPropertyOptions(properties),
    unitOptions: toUnitOptions(units, propertiesById),
  };
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function toPropertyOptions(
  properties: Array<LeasePropertyRow & { archived_at?: string | null }>,
): LeasePropertyOption[] {
  return properties.map((property) => ({
    id: property.id,
    label: `${property.code} - ${property.name}${
      property.archived_at ? " (archived)" : ""
    }`,
  }));
}

function toUnitOptions(
  units: Array<LeaseUnitRow & { archived_at?: string | null }>,
  propertiesById: Map<string, LeasePropertyRow>,
): LeaseUnitOption[] {
  return units.map((unit) => {
    const property = propertiesById.get(unit.property_id);
    const propertyCode = property?.code ?? "Property";

    return {
      id: unit.id,
      label: `${propertyCode} / Unit ${unit.unit_number}${
        unit.archived_at ? " (archived)" : ""
      }`,
      propertyId: unit.property_id,
    };
  });
}

function compareLeaseSummaries(first: LeaseSummary, second: LeaseSummary) {
  return (
    Number(first.isArchived) - Number(second.isArchived) ||
    second.formValues.leaseStartDate.localeCompare(first.formValues.leaseStartDate) ||
    compareStrings(first.tenantName, second.tenantName)
  );
}

function filterLeaseSummaries(
  leases: LeaseSummary[],
  viewQuery: LeaseViewQuery,
) {
  const tokens = viewQuery.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return leases.filter((lease) => {
    const matchesArchiveState =
      viewQuery.archiveState === "all" ||
      (viewQuery.archiveState === "archived"
        ? lease.isArchived
        : !lease.isArchived);
    const matchesProperty =
      viewQuery.propertyId === "all" || lease.propertyId === viewQuery.propertyId;
    const matchesStatus =
      viewQuery.status === "all" || lease.statusValue === viewQuery.status;
    const haystack = [
      lease.tenantName,
      lease.propertyCode,
      lease.propertyName,
      lease.unitLabel,
      lease.termLabel,
      lease.rentLabel,
      lease.depositLabel,
      lease.statusLabel,
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return (
      matchesArchiveState && matchesProperty && matchesStatus && matchesQuery
    );
  });
}

function sortLeaseSummaries(
  leases: LeaseSummary[],
  sort: LeaseViewQuery["sort"] = DEFAULT_LEASE_SORT,
) {
  return [...leases].sort((first, second) => {
    if (sort === "end_asc") {
      return (
        first.formValues.leaseEndDate.localeCompare(second.formValues.leaseEndDate) ||
        compareStrings(first.tenantName, second.tenantName)
      );
    }

    if (sort === "tenant_asc") {
      return (
        compareStrings(first.tenantName, second.tenantName) ||
        second.formValues.leaseStartDate.localeCompare(first.formValues.leaseStartDate)
      );
    }

    if (sort === "rent_desc") {
      return (
        second.rentUsd - first.rentUsd ||
        compareStrings(first.tenantName, second.tenantName)
      );
    }

    return compareLeaseSummaries(first, second);
  });
}

function buildLeasePagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): LeasePagination {
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

function getLeasePageSummaries(
  leases: LeaseSummary[],
  pagination: LeasePagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return leases.slice(start, pagination.to);
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
