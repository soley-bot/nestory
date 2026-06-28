import { createSupabaseServerClient } from "@/lib/db/server";
import { toRecentChange } from "@/features/activity/recent-changes";
import type { CurrencyDisplaySettings } from "@/lib/money/format";
import {
  buildPropertySummary,
  type PropertySummary,
} from "@/features/properties/data/property-summary";
import {
  buildPropertyDetail,
  type PropertyDetailDocumentRecord,
  type PropertyDetailLedgerRecord,
  type PropertyOwnerHistoryRecord,
} from "@/features/properties/data/property-detail";
import {
  DEFAULT_PROPERTY_SORT,
  parsePropertySearchParams,
} from "@/features/properties/property.filters";
import type {
  PropertyArchiveState,
  PropertyNetStatusFilter,
  PropertyOwnerOption,
  PropertyOwnerStatusFilter,
  PropertyPagination,
  PropertyStatusValue,
  PropertyViewQuery,
} from "@/features/properties/property.types";

export type { PropertySummary } from "@/features/properties/data/property-summary";
export type { PropertyDetail } from "@/features/properties/data/property-detail";

type ActiveOwnerLink = {
  label: string;
  personId: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type PropertySummaryOptions = {
  archiveState?: PropertyArchiveState;
  includeArchived?: boolean;
  ownerStatus?: PropertyOwnerStatusFilter;
  status?: PropertyStatusValue | "all";
};

export async function getPropertySummaries(
  organizationId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
  options: PropertySummaryOptions = {},
) {
  const supabase = await createSupabaseServerClient();
  const activeOwnerLinks =
    options.ownerStatus === "missing"
      ? await getActiveOwnerLinks(organizationId)
      : null;
  const archiveState =
    options.archiveState ?? (options.includeArchived ? "all" : "active");

  let propertiesQuery = supabase
    .from("properties")
    .select(
      "id, name, code, property_type, owner, address, status, acquisition_date, notes, archived_at",
    )
    .eq("organization_id", organizationId)
    .order("code", { ascending: true });

  if (archiveState === "active") {
    propertiesQuery = propertiesQuery.is("archived_at", null);
  } else if (archiveState === "archived") {
    propertiesQuery = propertiesQuery.not("archived_at", "is", null);
  }

  if (options.status && options.status !== "all") {
    propertiesQuery = propertiesQuery.in(
      "status",
      getStoredPropertyStatusValues(options.status),
    );
  }

  if (activeOwnerLinks && activeOwnerLinks.size > 0) {
    propertiesQuery = propertiesQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(new Set(activeOwnerLinks.keys())),
    );
  }

  const propertiesResult = await propertiesQuery;

  if (propertiesResult.error) {
    throw new Error(`Could not load properties: ${propertiesResult.error.message}`);
  }

  const propertyRows = propertiesResult.data ?? [];
  const propertyIds = new Set(propertyRows.map((property) => property.id));

  if (propertyIds.size === 0) {
    return [];
  }

  const ownerLinks =
    activeOwnerLinks ?? (await getActiveOwnerLinks(organizationId, propertyIds));

  const [unitsResult, ledgerResult] = await Promise.all([
    supabase
      .from("units")
      .select("property_id, status")
      .eq("organization_id", organizationId)
      .in("property_id", [...propertyIds])
      .is("archived_at", null),
    supabase
      .from("ledger_entries")
      .select("property_id, direction, amount, currency")
      .eq("organization_id", organizationId)
      .in("property_id", [...propertyIds])
      .is("archived_at", null),
  ]);

  if (unitsResult.error) {
    throw new Error(`Could not load property units: ${unitsResult.error.message}`);
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load ledger totals: ${ledgerResult.error.message}`);
  }

  const unitsByProperty = groupByProperty(unitsResult.data ?? []);
  const ledgerByProperty = groupByProperty(ledgerResult.data ?? []);

  return propertyRows.map((property): PropertySummary => {
    const units = unitsByProperty.get(property.id) ?? [];
    const ledgerEntries = ledgerByProperty.get(property.id) ?? [];

    return buildPropertySummary({
      activeOwner: ownerLinks.get(property.id),
      currencySettings,
      hasActiveOwnerLink: ownerLinks.has(property.id),
      ledgerEntries,
      property,
      units,
    });
  });
}

export async function getPropertyOwnerOptions(
  organizationId: string,
): Promise<PropertyOwnerOption[]> {
  const supabase = await createSupabaseServerClient();
  const peopleResult = await supabase
    .from("people")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("display_name", { ascending: true });

  if (peopleResult.error) {
    throw new Error(`Could not load owner options: ${peopleResult.error.message}`);
  }

  return (peopleResult.data ?? []).map((person) => ({
    id: person.id,
    label: person.display_name,
  }));
}

export async function getPropertiesScreenData(
  organizationId: string,
  currencySettings?: Partial<CurrencyDisplaySettings> | null,
  viewQuery: PropertyViewQuery = parsePropertySearchParams({}),
) {
  const properties = await getPropertySummaries(organizationId, currencySettings, {
    archiveState: viewQuery.archiveState,
    ownerStatus: viewQuery.ownerStatus,
    status: viewQuery.status,
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
  const detailRecordLimit = 8;

  const [
    propertyResult,
    unitsResult,
    ownerRowsResult,
    activeLeasesResult,
    timelineResult,
    ledgerResult,
    documentsResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, code, property_type, owner, address, status, acquisition_date, notes, archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("id", propertyId)
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
      .from("property_owners")
      .select(
        "id, person_id, ownership_label, is_primary, started_on, ended_on, archived_at",
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("started_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("leases")
      .select(
        "id, unit_id, tenant_name, status, lease_start_date, lease_end_date, monthly_rent_amount, monthly_rent_currency, archived_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .in("status", ["active", "notice_given"])
      .is("archived_at", null)
      .order("lease_end_date", { ascending: true })
      .limit(detailRecordLimit),
    supabase
      .from("timeline_events")
      .select(
        "id, unit_id, lease_id, ledger_entry_id, event_date, event_type, title, description, cost_amount, cost_currency",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("event_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("ledger_entries")
      .select(
        "id, unit_id, transaction_date, direction, category, amount, currency, description",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("documents")
      .select(
        "id, unit_id, lease_id, ledger_entry_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("activity_logs")
      .select(
        "id, entity_type, entity_id, action, previous_values, new_values, created_at",
      )
      .eq("organization_id", organizationId)
      .eq("entity_type", "property")
      .eq("entity_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(6),
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

  if (ownerRowsResult.error) {
    throw new Error(
      `Could not load property owner history: ${ownerRowsResult.error.message}`,
    );
  }

  if (activeLeasesResult.error) {
    throw new Error(
      `Could not load property leases: ${activeLeasesResult.error.message}`,
    );
  }

  if (timelineResult.error) {
    throw new Error(
      `Could not load property timeline: ${timelineResult.error.message}`,
    );
  }

  if (ledgerResult.error) {
    throw new Error(`Could not load property ledger: ${ledgerResult.error.message}`);
  }

  if (documentsResult.error) {
    throw new Error(
      `Could not load property documents: ${documentsResult.error.message}`,
    );
  }

  if (activityResult.error) {
    throw new Error(
      `Could not load property activity: ${activityResult.error.message}`,
    );
  }

  const ownerRows = ownerRowsResult.data ?? [];
  const ownerNameByPersonId = await getPeopleDisplayNames(
    organizationId,
    new Set(ownerRows.map((owner) => owner.person_id)),
  );
  const ownerHistory = ownerRows.map(
    (owner): PropertyOwnerHistoryRecord => ({
      ...owner,
      person_name: ownerNameByPersonId.get(owner.person_id) ?? "Linked owner",
    }),
  );
  const activeOwner = ownerHistory.find(
    (owner) => owner.is_primary && !owner.archived_at && !owner.ended_on,
  );
  const documents = await addSignedPropertyDocumentUrls(
    documentsResult.data ?? [],
    supabase,
  );
  const ledgerEntries = (ledgerResult.data ?? []) as PropertyDetailLedgerRecord[];

  return buildPropertyDetail({
    activeLeases: activeLeasesResult.data ?? [],
    activeOwner: activeOwner
      ? {
          label: activeOwner.person_name,
          personId: activeOwner.person_id,
        }
      : null,
    activity: (activityResult.data ?? []).map(toRecentChange),
    currencySettings,
    documents,
    ledgerEntries,
    ownerHistory,
    property: propertyResult.data,
    recentLedgerEntries: ledgerEntries.slice(0, detailRecordLimit),
    recentTimelineEvents: timelineResult.data ?? [],
    recordCounts: {
      activeLeases: activeLeasesResult.count ?? activeLeasesResult.data?.length ?? 0,
      documents: documentsResult.count ?? documents.length,
      ledgerEntries: ledgerResult.count ?? ledgerEntries.length,
      timelineEvents: timelineResult.count ?? timelineResult.data?.length ?? 0,
    },
    units: unitsResult.data ?? [],
  });
}

async function addSignedPropertyDocumentUrls(
  rows: PropertyDetailDocumentRecord[],
  supabase: SupabaseServerClient,
): Promise<PropertyDetailDocumentRecord[]> {
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(row.storage_path, 60 * 60);

      return {
        ...row,
        url: data?.signedUrl,
      };
    }),
  );
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
    const matchesOwnerStatus = propertyMatchesOwnerStatusFilter(
      property,
      viewQuery.ownerStatus,
    );
    const matchesNetStatus = propertyMatchesNetStatusFilter(
      property,
      viewQuery.netStatus,
    );
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

    return (
      matchesArchiveState &&
      matchesStatus &&
      matchesOwnerStatus &&
      matchesNetStatus &&
      matchesQuery
    );
  });
}

export function propertyMatchesOwnerStatusFilter(
  property: Pick<PropertySummary, "hasActiveOwnerLink">,
  ownerStatus: PropertyOwnerStatusFilter,
) {
  return ownerStatus === "all" || !property.hasActiveOwnerLink;
}

export function propertyMatchesNetStatusFilter(
  property: Pick<PropertySummary, "netIncomeUsd">,
  netStatus: PropertyNetStatusFilter,
) {
  return netStatus === "all" || property.netIncomeUsd < 0;
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

    if (sort === "net_asc") {
      return (
        first.netIncomeUsd - second.netIncomeUsd ||
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

async function getActiveOwnerLinks(
  organizationId: string,
  propertyIds?: ReadonlySet<string>,
) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("property_owners")
    .select("person_id, property_id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .is("archived_at", null)
    .is("ended_on", null);

  if (propertyIds) {
    if (propertyIds.size === 0) {
      return new Map<string, ActiveOwnerLink>();
    }

    query = query.in("property_id", [...propertyIds]);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Could not load property owner links: ${result.error.message}`);
  }

  const ownerRows = result.data ?? [];
  const personIds = new Set(ownerRows.map((owner) => owner.person_id));
  const labelsByPerson = await getPeopleDisplayNames(organizationId, personIds);
  const links = new Map<string, ActiveOwnerLink>();

  for (const owner of ownerRows) {
    links.set(owner.property_id, {
      label: labelsByPerson.get(owner.person_id) ?? "Linked owner",
      personId: owner.person_id,
    });
  }

  return links;
}

async function getPeopleDisplayNames(
  organizationId: string,
  personIds: ReadonlySet<string>,
) {
  if (personIds.size === 0) {
    return new Map<string, string>();
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("people")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", [...personIds]);

  if (result.error) {
    throw new Error(`Could not load owner names: ${result.error.message}`);
  }

  return new Map((result.data ?? []).map((person) => [person.id, person.display_name]));
}

function getStoredPropertyStatusValues(status: PropertyStatusValue) {
  if (status === "under_renovation") {
    return ["under_renovation", "under-renovation", "renovation"];
  }

  return [status];
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
}
