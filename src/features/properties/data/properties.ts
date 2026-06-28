import { createSupabaseServerClient } from "@/lib/db/server";
import { toRecentChange } from "@/features/activity/recent-changes";
import {
  buildPropertySummary,
  type PropertyRecord,
  type PropertySummary,
} from "@/features/properties/data/property-summary";
import {
  buildPropertyDetail,
  type PropertyDetailDocumentRecord,
  type PropertyDetailLedgerRecord,
  type PropertyDetailMaintenanceRecord,
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

const propertySelect =
  "id, name, code, property_type, owner, address, status, acquisition_date, notes, archived_at";

type PropertySummaryOptions = {
  archiveState?: PropertyArchiveState;
  includeArchived?: boolean;
  ownerStatus?: PropertyOwnerStatusFilter;
  status?: PropertyStatusValue | "all";
};

type PagedPropertyRowsResult = {
  properties: PropertyRecord[];
  totalCount: number;
};

export async function getPropertySummaries(
  organizationId: string,
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
    .select(propertySelect)
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

  return loadPropertySummariesForRows({
    activeOwnerLinks: activeOwnerLinks ?? undefined,
    organizationId,
    properties: propertyRows,
    supabase,
  });
}

async function loadPropertySummariesForRows({
  activeOwnerLinks,
  organizationId,
  properties,
  supabase,
}: {
  activeOwnerLinks?: ReadonlyMap<string, ActiveOwnerLink>;
  organizationId: string;
  properties: PropertyRecord[];
  supabase: SupabaseServerClient;
}) {
  const propertyIds = new Set(properties.map((property) => property.id));

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

  return properties.map((property): PropertySummary => {
    const units = unitsByProperty.get(property.id) ?? [];
    const ledgerEntries = ledgerByProperty.get(property.id) ?? [];

    return buildPropertySummary({
      activeOwner: ownerLinks.get(property.id),
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
  viewQuery: PropertyViewQuery = parsePropertySearchParams({}),
) {
  if (canUsePagedPropertyBaseQuery(viewQuery)) {
    return getPagedPropertiesScreenData({
      organizationId,
      viewQuery,
    });
  }

  return getCompletePropertiesScreenData({
    organizationId,
    viewQuery,
  });
}

function canUsePagedPropertyBaseQuery(viewQuery: PropertyViewQuery) {
  return (
    viewQuery.query.trim().length === 0 &&
    viewQuery.netStatus === "all" &&
    (viewQuery.sort === "code_asc" ||
      viewQuery.sort === "name_asc" ||
      viewQuery.sort === "status_asc")
  );
}

async function getPagedPropertiesScreenData({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: PropertyViewQuery;
}) {
  const supabase = await createSupabaseServerClient();
  const activeOwnerLinks =
    viewQuery.ownerStatus === "missing"
      ? await getActiveOwnerLinks(organizationId)
      : undefined;
  let rowsResult = await getPagedPropertyRows({
    activeOwnerLinks,
    organizationId,
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    supabase,
    viewQuery,
  });
  let pagination = buildPropertyPagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: rowsResult.totalCount,
  });

  if (pagination.page !== viewQuery.page && rowsResult.totalCount > 0) {
    rowsResult = await getPagedPropertyRows({
      activeOwnerLinks,
      organizationId,
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      supabase,
      viewQuery,
    });
    pagination = buildPropertyPagination({
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      totalCount: rowsResult.totalCount,
    });
  }

  return {
    pagination,
    properties: await loadPropertySummariesForRows({
      activeOwnerLinks,
      organizationId,
      properties: rowsResult.properties,
      supabase,
    }),
  };
}

async function getPagedPropertyRows({
  activeOwnerLinks,
  organizationId,
  page,
  pageSize,
  supabase,
  viewQuery,
}: {
  activeOwnerLinks?: ReadonlyMap<string, ActiveOwnerLink>;
  organizationId: string;
  page: number;
  pageSize: number;
  supabase: SupabaseServerClient;
  viewQuery: PropertyViewQuery;
}): Promise<PagedPropertyRowsResult> {
  const range = getRange(page, pageSize);
  const result = applyPropertyBaseSort(
    applyPropertyBaseFilters(
      supabase
        .from("properties")
        .select(propertySelect, { count: "exact" })
        .eq("organization_id", organizationId),
      viewQuery,
      activeOwnerLinks,
    ),
    viewQuery.sort,
  ).range(range.from, range.to);
  const rowsResult = await result;

  if (rowsResult.error) {
    throw new Error(`Could not load properties: ${rowsResult.error.message}`);
  }

  const properties = rowsResult.data ?? [];

  return {
    properties,
    totalCount:
      typeof rowsResult.count === "number" ? rowsResult.count : properties.length,
  };
}

function applyPropertyBaseFilters(
  query: ReturnType<SupabaseServerClient["from"]>,
  viewQuery: PropertyViewQuery,
  activeOwnerLinks?: ReadonlyMap<string, ActiveOwnerLink>,
) {
  let filteredQuery = query;

  if (viewQuery.archiveState === "active") {
    filteredQuery = filteredQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    filteredQuery = filteredQuery.not("archived_at", "is", null);
  }

  if (viewQuery.status !== "all") {
    filteredQuery = filteredQuery.in(
      "status",
      getStoredPropertyStatusValues(viewQuery.status),
    );
  }

  if (activeOwnerLinks && activeOwnerLinks.size > 0) {
    filteredQuery = filteredQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(new Set(activeOwnerLinks.keys())),
    );
  }

  return filteredQuery;
}

function applyPropertyBaseSort(
  query: ReturnType<typeof applyPropertyBaseFilters>,
  sort: PropertyViewQuery["sort"],
) {
  if (sort === "name_asc") {
    return query.order("name", { ascending: true }).order("code", {
      ascending: true,
    });
  }

  if (sort === "status_asc") {
    return query.order("status", { ascending: true }).order("code", {
      ascending: true,
    });
  }

  return query.order("code", { ascending: true });
}

async function getCompletePropertiesScreenData({
  organizationId,
  viewQuery,
}: {
  organizationId: string;
  viewQuery: PropertyViewQuery;
}) {
  const properties = await getPropertySummaries(organizationId, {
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
) {
  const properties = await getPropertySummaries(organizationId);
  return properties.find((property) => property.id === propertyId) ?? null;
}

export async function getPropertyDetail(
  organizationId: string,
  propertyId: string,
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
    maintenanceResult,
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
        "id, unit_id, lease_id, ledger_entry_id, task_id, timeline_event_id, category, file_name, storage_path, mime_type, size_bytes, uploaded_at",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(detailRecordLimit),
    supabase
      .from("tasks")
      .select(
        "id, unit_id, title, category, priority, status, due_date, due_time, actual_cost_amount, actual_cost_currency",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50),
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

  if (maintenanceResult.error) {
    throw new Error(
      `Could not load property maintenance cases: ${maintenanceResult.error.message}`,
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
  const maintenanceCases =
    (maintenanceResult.data ?? []) as PropertyDetailMaintenanceRecord[];

  return buildPropertyDetail({
    activeLeases: activeLeasesResult.data ?? [],
    activeOwner: activeOwner
      ? {
          label: activeOwner.person_name,
          personId: activeOwner.person_id,
        }
      : null,
    activity: (activityResult.data ?? []).map(toRecentChange),
    documents,
    ledgerEntries,
    maintenanceCases,
    ownerHistory,
    property: propertyResult.data,
    recentLedgerEntries: ledgerEntries.slice(0, detailRecordLimit),
    recentTimelineEvents: timelineResult.data ?? [],
    recordCounts: {
      activeLeases: activeLeasesResult.count ?? activeLeasesResult.data?.length ?? 0,
      documents: documentsResult.count ?? documents.length,
      ledgerEntries: ledgerResult.count ?? ledgerEntries.length,
      maintenanceCases: maintenanceResult.count ?? maintenanceCases.length,
      openMaintenanceCases: maintenanceCases.filter(isOpenMaintenanceTask).length,
      overdueMaintenanceCases:
        maintenanceCases.filter(isOverdueMaintenanceTask).length,
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

function getRange(page: number, pageSize: number) {
  const from = (Math.max(page, 1) - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
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

function isOpenMaintenanceTask(task: PropertyDetailMaintenanceRecord) {
  return task.status !== "completed" && task.status !== "cancelled";
}

function isOverdueMaintenanceTask(task: PropertyDetailMaintenanceRecord) {
  return (
    isOpenMaintenanceTask(task) &&
    Boolean(task.due_date) &&
    task.due_date! < new Date().toISOString().slice(0, 10)
  );
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
}
