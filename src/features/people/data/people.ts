import {
  toRecentChange,
  type ActivityLogSnapshot,
} from "@/features/activity/recent-changes";
import type { LinkedDocument } from "@/features/documents/document.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  DEFAULT_PEOPLE_SORT,
  parsePeopleSearchParams,
} from "@/features/people/people.filters";
import type {
  PeopleArchiveState,
  PeopleBadgeTone,
  PeopleContactSummary,
  PeopleDetailHrefs,
  PeopleLeaseLink,
  PeopleLinkedRecords,
  PeopleNextAction,
  PeoplePagination,
  PeoplePropertyLink,
  PeopleRecordCounts,
  PeopleRiskIndicator,
  PeopleScreenData,
  PeopleSummary,
  PeopleVendorLink,
  PeopleViewQuery,
  PersonPartyType,
  PersonRoleStatus,
  PersonRoleSummary,
  PersonRoleValue,
} from "@/features/people/people.types";
import { formatPartyType, formatRole } from "@/features/people/people.labels";

const peopleSelect =
  "id, display_name, legal_name, party_type, primary_email, primary_phone, tax_identifier, notes, archived_at, updated_at, created_at";
const roleSelect = "id, person_id, role, status, archived_at";
const contactSelect =
  "id, person_id, contact_name, contact_type, email, phone, is_primary, archived_at";
const leasePartySelect =
  "id, person_id, lease_id, party_role, is_primary, ended_on, archived_at";
const leaseSelect =
  "id, property_id, unit_id, tenant_name, status, lease_start_date, lease_end_date, archived_at";
const propertyOwnerSelect =
  "id, person_id, property_id, ownership_label, is_primary, ended_on, archived_at";
const vendorProfileSelect =
  "id, person_id, service_category, service_area, preferred, status, archived_at";
const propertySelect = "id, code, name";
const unitSelect = "id, property_id, unit_number";
const documentSelect =
  "id, category, file_name, mime_type, size_bytes, uploaded_at, storage_path, property_id, unit_id, lease_id";
const activitySelect =
  "id, entity_type, entity_id, action, previous_values, new_values, created_at";

type UnknownRecord = Record<string, unknown>;
type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;
type PeopleQueryResult = {
  count?: number | null;
  data: unknown;
  error: { message: string } | null;
};

type PersonRow = {
  archivedAt: string | null;
  createdAt: string;
  displayName: string;
  id: string;
  legalName: string | null;
  notes: string | null;
  partyType: PersonPartyType;
  primaryEmail: string | null;
  primaryPhone: string | null;
  taxIdentifier: string | null;
  updatedAt: string;
};

type RoleRow = {
  archivedAt: string | null;
  id: string;
  personId: string;
  role: PersonRoleValue;
  status: PersonRoleStatus;
};

type ContactRow = {
  archivedAt: string | null;
  contactName: string | null;
  contactType: string | null;
  email: string | null;
  id: string;
  isPrimary: boolean;
  personId: string;
  phone: string | null;
};

type LeasePartyRow = {
  archivedAt: string | null;
  endedOn: string | null;
  id: string;
  isPrimary: boolean;
  leaseId: string;
  partyRole: string;
  personId: string;
};

type LeaseRow = {
  archivedAt: string | null;
  endDate: string;
  id: string;
  propertyId: string;
  startDate: string;
  status: string;
  tenantName: string;
  unitId: string | null;
};

type PropertyOwnerRow = {
  archivedAt: string | null;
  endedOn: string | null;
  id: string;
  isPrimary: boolean;
  ownershipLabel: string | null;
  personId: string;
  propertyId: string;
};

type VendorProfileRow = {
  archivedAt: string | null;
  id: string;
  personId: string;
  preferred: boolean;
  serviceArea: string | null;
  serviceCategory: string | null;
  status: string;
};

type PropertyRow = {
  code: string;
  id: string;
  name: string;
};

type UnitRow = {
  id: string;
  propertyId: string;
  unitNumber: string;
};

type DocumentRow = LinkedDocument & {
  leaseId: string | null;
  propertyId: string | null;
  storagePath: string;
  unitId: string | null;
};

type PeopleSummaryLoadResult = {
  documentsById: Map<string, DocumentRow>;
  summaries: PeopleSummary[];
};

type PeopleDataTable =
  | "documents"
  | "lease_parties"
  | "leases"
  | "people"
  | "person_contacts"
  | "person_roles"
  | "properties"
  | "property_owners"
  | "units"
  | "vendor_profiles";

type PeopleIdPrefilter = {
  excludeIds: Set<string>;
  includeIds: Set<string> | null;
  requireMissingPrimaryContact: boolean;
};

type PeopleIdQueryResult =
  { kind: "ready"; ids: Set<string> } | { kind: "unsupported" };

type PagedPeopleRowsResult = {
  people: PersonRow[];
  totalCount: number;
};

export async function getPeopleScreenData(
  organizationId: string,
  viewQuery: PeopleViewQuery = parsePeopleSearchParams({}),
): Promise<PeopleScreenData> {
  const supabase = await createSupabaseServerClient();

  if (canUsePagedPeopleBaseQuery(viewQuery)) {
    return getPagedPeopleScreenData({
      organizationId,
      supabase,
      viewQuery,
    });
  }

  if (canUseBoundedPeopleSearchQuery(viewQuery)) {
    return getQueryFilteredPeopleScreenData({
      organizationId,
      supabase,
      viewQuery,
    });
  }

  return getCompletePeopleScreenData({
    organizationId,
    supabase,
    viewQuery,
  });
}

export function canUsePagedPeopleBaseQuery(viewQuery: PeopleViewQuery) {
  return (
    Boolean(viewQuery.personId) ||
    (viewQuery.query.trim().length === 0 &&
      canUsePeopleBaseSort(viewQuery.sort))
  );
}

function canUseBoundedPeopleSearchQuery(viewQuery: PeopleViewQuery) {
  return (
    viewQuery.query.trim().length > 0 && canUsePeopleBaseSort(viewQuery.sort)
  );
}

function canUsePeopleBaseSort(sort: PeopleViewQuery["sort"]) {
  return sort === "name_asc" || sort === "updated_desc";
}

async function getPagedPeopleScreenData({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PeopleScreenData> {
  const idFilterResult = await getPeopleIdPrefilter({
    organizationId,
    supabase,
    viewQuery,
  });

  let rowsResult = await getPagedPeopleRows({
    idFilter: idFilterResult,
    organizationId,
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    supabase,
    viewQuery,
  });

  let pagination = buildPeoplePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: rowsResult.totalCount,
  });

  if (pagination.page !== viewQuery.page && rowsResult.totalCount > 0) {
    rowsResult = await getPagedPeopleRows({
      idFilter: idFilterResult,
      organizationId,
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      supabase,
      viewQuery,
    });

    pagination = buildPeoplePagination({
      page: pagination.page,
      pageSize: viewQuery.pageSize,
      totalCount: rowsResult.totalCount,
    });
  }

  const { documentsById, summaries } = await loadPeopleSummariesForRows({
    organizationId,
    people: rowsResult.people,
    supabase,
  });
  const summariesById = indexById(summaries);
  const pagePeople = rowsResult.people.flatMap((person) => {
    const summary = summariesById.get(person.id);

    return summary ? [summary] : [];
  });

  return {
    pagination,
    people: await addSignedDocumentUrlsToPeople(
      pagePeople,
      documentsById,
      supabase,
    ),
  };
}

async function getQueryFilteredPeopleScreenData({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PeopleScreenData> {
  const [idFilterResult, queryIdsResult] = await Promise.all([
    getPeopleIdPrefilter({ organizationId, supabase, viewQuery }),
    getPeopleIdsMatchingQuery({ organizationId, supabase, viewQuery }),
  ]);

  if (queryIdsResult.kind === "unsupported") {
    return getCompletePeopleScreenData({
      organizationId,
      supabase,
      viewQuery,
    });
  }

  const idFilter = mergePeopleIdPrefilters(idFilterResult, {
    excludeIds: new Set<string>(),
    includeIds: queryIdsResult.ids,
    requireMissingPrimaryContact: false,
  });

  if (idFilter.includeIds?.size === 0) {
    return {
      pagination: buildPeoplePagination({
        page: viewQuery.page,
        pageSize: viewQuery.pageSize,
        totalCount: 0,
      }),
      people: [],
    };
  }

  const rowsResult = await getPeopleRowsForFilter({
    idFilter,
    organizationId,
    supabase,
    viewQuery,
  });

  const filteredPeople = await filterPeopleRowsByQuery({
    organizationId,
    people: rowsResult.people,
    supabase,
    viewQuery,
  });
  const sortedPeople = sortPersonRows(filteredPeople, viewQuery.sort);
  const pagination = buildPeoplePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedPeople.length,
  });
  const pagePeopleRows = getPeoplePageRows(sortedPeople, pagination);
  const { documentsById, summaries } = await loadPeopleSummariesForRows({
    organizationId,
    people: pagePeopleRows,
    supabase,
  });
  const summariesById = indexById(summaries);
  const pagePeople = pagePeopleRows.flatMap((person) => {
    const summary = summariesById.get(person.id);

    return summary ? [summary] : [];
  });

  return {
    pagination,
    people: await addSignedDocumentUrlsToPeople(
      pagePeople,
      documentsById,
      supabase,
    ),
  };
}

async function getCompletePeopleScreenData({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PeopleScreenData> {
  const excludedPersonIds = await getExcludedPersonIdsForStatus(
    supabase,
    organizationId,
    viewQuery.status,
  );
  let peopleQuery = supabase
    .from("people")
    .select(peopleSelect)
    .eq("organization_id", organizationId)
    .order("display_name", { ascending: true });

  if (viewQuery.archiveState === "active") {
    peopleQuery = peopleQuery.is("archived_at", null);
  } else if (viewQuery.archiveState === "archived") {
    peopleQuery = peopleQuery.not("archived_at", "is", null);
  }

  if (excludedPersonIds.size > 0) {
    peopleQuery = peopleQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(excludedPersonIds),
    );
  }

  const peopleResult = await peopleQuery;

  if (peopleResult.error) {
    throw new Error(`Could not load people: ${peopleResult.error.message}`);
  }

  const people = asRows(peopleResult.data, toPersonRow);
  const { documentsById, summaries } = await loadPeopleSummariesForRows({
    organizationId,
    people,
    supabase,
  });
  const filteredPeople = filterPeopleSummaries(
    summaries.toSorted(comparePeopleSummaries),
    viewQuery,
  );
  const sortedPeople = sortPeopleSummaries(filteredPeople, viewQuery.sort);
  const pagination = buildPeoplePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedPeople.length,
  });
  const pagePeople = getPeoplePageSummaries(sortedPeople, pagination);

  return {
    pagination,
    people: await addSignedDocumentUrlsToPeople(
      pagePeople,
      documentsById,
      supabase,
    ),
  };
}

async function getPagedPeopleRows({
  idFilter,
  organizationId,
  page,
  pageSize,
  supabase,
  viewQuery,
}: {
  idFilter: PeopleIdPrefilter;
  organizationId: string;
  page: number;
  pageSize: number;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PagedPeopleRowsResult> {
  if (idFilter.includeIds?.size === 0) {
    return { people: [], totalCount: 0 };
  }

  const start = (Math.max(page, 1) - 1) * pageSize;
  const result = await applyPeopleBaseSort(
    applyPeopleIdPrefilter(
      applyPeopleArchiveFilter(
        supabase
          .from("people")
          .select(peopleSelect, { count: "exact" })
          .eq("organization_id", organizationId),
        viewQuery.archiveState,
      ),
      idFilter,
    ),
    viewQuery.sort,
    viewQuery.archiveState,
  ).range(start, start + pageSize - 1);

  if (result.error) {
    throw new Error(`Could not load people: ${result.error.message}`);
  }

  const people = asRows(result.data, toPersonRow);

  return {
    people,
    totalCount: typeof result.count === "number" ? result.count : people.length,
  };
}

async function getPeopleRowsForFilter({
  idFilter,
  organizationId,
  supabase,
  viewQuery,
}: {
  idFilter: PeopleIdPrefilter;
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PagedPeopleRowsResult> {
  if (idFilter.includeIds?.size === 0) {
    return { people: [], totalCount: 0 };
  }

  const result = await applyPeopleBaseSort(
    applyPeopleIdPrefilter(
      applyPeopleArchiveFilter(
        supabase
          .from("people")
          .select(peopleSelect, { count: "exact" })
          .eq("organization_id", organizationId),
        viewQuery.archiveState,
      ),
      idFilter,
    ),
    viewQuery.sort,
    viewQuery.archiveState,
  );

  if (result.error) {
    throw new Error(`Could not load people: ${result.error.message}`);
  }

  const people = asRows(result.data, toPersonRow);

  return {
    people,
    totalCount: typeof result.count === "number" ? result.count : people.length,
  };
}

function applyPeopleArchiveFilter(
  query: ReturnType<SupabaseServerClient["from"]>,
  archiveState: PeopleArchiveState,
) {
  if (archiveState === "active") {
    return query.is("archived_at", null);
  }

  if (archiveState === "archived") {
    return query.not("archived_at", "is", null);
  }

  return query;
}

function applyPeopleBaseSort(
  query: ReturnType<SupabaseServerClient["from"]>,
  sort: PeopleViewQuery["sort"],
  archiveState: PeopleArchiveState,
) {
  let nextQuery = query;

  if (archiveState === "all") {
    nextQuery = nextQuery.order("archived_at", {
      ascending: true,
      nullsFirst: true,
    });
  }

  if (sort === "updated_desc") {
    return nextQuery
      .order("updated_at", { ascending: false })
      .order("display_name", { ascending: true });
  }

  return nextQuery.order("display_name", { ascending: true });
}

function applyPeopleIdPrefilter(
  query: ReturnType<SupabaseServerClient["from"]>,
  idFilter: PeopleIdPrefilter,
) {
  let nextQuery = query;

  if (idFilter.includeIds) {
    nextQuery = nextQuery.in("id", [...idFilter.includeIds]);
  }

  if (idFilter.excludeIds.size > 0) {
    nextQuery = nextQuery.not(
      "id",
      "in",
      formatPostgrestInFilter(idFilter.excludeIds),
    );
  }

  if (idFilter.requireMissingPrimaryContact) {
    nextQuery = nextQuery.is("primary_email", null).is("primary_phone", null);
  }

  return nextQuery;
}

async function getPeopleIdPrefilter({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PeopleIdPrefilter> {
  let filter: PeopleIdPrefilter = {
    excludeIds: new Set<string>(),
    includeIds: null,
    requireMissingPrimaryContact: false,
  };

  if (viewQuery.personId) {
    return {
      ...filter,
      includeIds: new Set([viewQuery.personId]),
    };
  }

  if (viewQuery.role !== "all") {
    const roleIdsResult = await getPeopleIdsFromRoles({
      organizationId,
      role: viewQuery.role,
      supabase,
    });

    if (roleIdsResult.kind === "unsupported") {
      throw new Error("Unsupported people role filter.");
    }

    filter = mergePeopleIdPrefilters(filter, {
      excludeIds: new Set<string>(),
      includeIds: roleIdsResult.ids,
      requireMissingPrimaryContact: false,
    });
  }

  if (viewQuery.status === "active") {
    const activeIdsResult = await getPeopleIdsFromRoles({
      organizationId,
      status: "active",
      supabase,
    });

    if (activeIdsResult.kind === "unsupported") {
      throw new Error("Unsupported people status filter.");
    }

    filter = mergePeopleIdPrefilters(filter, {
      excludeIds: new Set<string>(),
      includeIds: activeIdsResult.ids,
      requireMissingPrimaryContact: false,
    });
  } else if (viewQuery.status === "inactive") {
    const [visibleRoleIdsResult, activeIdsResult] = await Promise.all([
      getPeopleIdsFromRoles({ organizationId, supabase }),
      getPeopleIdsFromRoles({ organizationId, status: "active", supabase }),
    ]);

    if (
      visibleRoleIdsResult.kind === "unsupported" ||
      activeIdsResult.kind === "unsupported"
    ) {
      throw new Error("Unsupported people inactive status filter.");
    }

    filter = mergePeopleIdPrefilters(filter, {
      excludeIds: new Set<string>(),
      includeIds: differenceSets(visibleRoleIdsResult.ids, activeIdsResult.ids),
      requireMissingPrimaryContact: false,
    });
  } else if (viewQuery.status === "no_role") {
    const visibleRoleIdsResult = await getPeopleIdsFromRoles({
      organizationId,
      supabase,
    });

    if (visibleRoleIdsResult.kind === "unsupported") {
      throw new Error("Unsupported people no-role filter.");
    }

    filter = mergePeopleIdPrefilters(filter, {
      excludeIds: visibleRoleIdsResult.ids,
      includeIds: null,
      requireMissingPrimaryContact: false,
    });
  } else if (viewQuery.status === "missing_contact") {
    const usefulContactIdsResult = await getPeopleIdsWithUsefulContacts(
      supabase,
      organizationId,
    );

    if (usefulContactIdsResult.kind === "unsupported") {
      throw new Error("Unsupported people missing-contact filter.");
    }

    filter = mergePeopleIdPrefilters(filter, {
      excludeIds: usefulContactIdsResult.ids,
      includeIds: null,
      requireMissingPrimaryContact: true,
    });
  }

  return filter;
}

function mergePeopleIdPrefilters(
  first: PeopleIdPrefilter,
  second: PeopleIdPrefilter,
): PeopleIdPrefilter {
  return {
    excludeIds: unionSets(first.excludeIds, second.excludeIds),
    includeIds:
      first.includeIds && second.includeIds
        ? intersectSets(first.includeIds, second.includeIds)
        : (first.includeIds ?? second.includeIds),
    requireMissingPrimaryContact:
      first.requireMissingPrimaryContact || second.requireMissingPrimaryContact,
  };
}

async function loadPeopleSummariesForRows({
  organizationId,
  people,
  supabase,
}: {
  organizationId: string;
  people: PersonRow[];
  supabase: SupabaseServerClient;
}): Promise<PeopleSummaryLoadResult> {
  const personIds = new Set(people.map((person) => person.id));
  const [roles, contacts, leaseParties, propertyOwners, vendorProfiles] =
    await Promise.all([
      getRows(supabase, "person_roles", roleSelect, organizationId, toRoleRow, {
        column: "person_id",
        values: personIds,
      }),
      getRows(
        supabase,
        "person_contacts",
        contactSelect,
        organizationId,
        toContactRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "lease_parties",
        leasePartySelect,
        organizationId,
        toLeasePartyRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "property_owners",
        propertyOwnerSelect,
        organizationId,
        toPropertyOwnerRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "vendor_profiles",
        vendorProfileSelect,
        organizationId,
        toVendorProfileRow,
        { column: "person_id", values: personIds },
      ),
    ]);
  const leaseIds = new Set(leaseParties.map((party) => party.leaseId));
  const leases = await getRows(
    supabase,
    "leases",
    leaseSelect,
    organizationId,
    toLeaseRow,
    { column: "id", values: leaseIds },
  );
  const propertyIds = new Set([
    ...leases.map((lease) => lease.propertyId),
    ...propertyOwners.map((owner) => owner.propertyId),
  ]);
  const unitIds = new Set(
    leases.flatMap((lease) => (lease.unitId ? [lease.unitId] : [])),
  );
  const [
    properties,
    units,
    leaseDocuments,
    propertyDocuments,
    unitDocuments,
    activityRows,
  ] = await Promise.all([
    getRows(
      supabase,
      "properties",
      propertySelect,
      organizationId,
      toPropertyRow,
      {
        column: "id",
        values: propertyIds,
      },
    ),
    getRows(supabase, "units", unitSelect, organizationId, toUnitRow, {
      column: "id",
      values: unitIds,
    }),
    getRows(
      supabase,
      "documents",
      documentSelect,
      organizationId,
      toDocumentRow,
      {
        column: "lease_id",
        values: leaseIds,
      },
    ),
    getRows(
      supabase,
      "documents",
      documentSelect,
      organizationId,
      toDocumentRow,
      {
        column: "property_id",
        values: propertyIds,
      },
    ),
    getRows(
      supabase,
      "documents",
      documentSelect,
      organizationId,
      toDocumentRow,
      {
        column: "unit_id",
        values: unitIds,
      },
    ),
    getPersonActivityRows(supabase, organizationId, personIds),
  ]);
  const documents = mergeDocuments(
    leaseDocuments,
    propertyDocuments,
    unitDocuments,
  );
  const documentsById = indexById(documents);

  const rolesByPerson = groupByPersonId(roles);
  const contactsByPerson = groupByPersonId(contacts);
  const leasePartiesByPerson = groupByPersonId(leaseParties);
  const propertyOwnersByPerson = groupByPersonId(propertyOwners);
  const vendorProfilesByPerson = groupByPersonId(vendorProfiles);
  const leasesById = indexById(leases);
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const activityByPerson = groupActivityByPersonId(activityRows);
  const documentsByPerson = groupDocumentsByPerson({
    documents,
    leasePartiesByPerson,
    leasesById,
    propertyOwnersByPerson,
  });
  const summaries = people.map((person) =>
    buildPeopleSummary({
      activity: activityByPerson.get(person.id) ?? [],
      contacts: contactsByPerson.get(person.id) ?? [],
      documents: documentsByPerson.get(person.id) ?? [],
      leaseParties: leasePartiesByPerson.get(person.id) ?? [],
      leasesById,
      person,
      propertyOwners: propertyOwnersByPerson.get(person.id) ?? [],
      propertiesById,
      roles: rolesByPerson.get(person.id) ?? [],
      unitsById,
      vendorProfiles: vendorProfilesByPerson.get(person.id) ?? [],
    }),
  );

  return { documentsById, summaries };
}

async function getRows<T>(
  supabase: SupabaseServerClient,
  table: PeopleDataTable,
  columns: string,
  organizationId: string,
  mapper: (row: UnknownRecord) => T | null,
  filter?: { column: string; values: ReadonlySet<string> },
) {
  if (filter && filter.values.size === 0) {
    return [];
  }

  let query = supabase
    .from(table)
    .select(columns)
    .eq("organization_id", organizationId);

  if (filter) {
    query = query.in(filter.column, [...filter.values]);
  }

  const result = await query;

  if (result.error) {
    throw new Error(`Could not load ${table}: ${result.error.message}`);
  }

  return asRows(result.data, mapper);
}

async function getPeopleIdsMatchingQuery({
  organizationId,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}): Promise<PeopleIdQueryResult> {
  const tokens = getPeopleQueryTokens(viewQuery);
  let matchingIds: Set<string> | null = null;

  for (const token of tokens) {
    const tokenResult = await getPeopleIdsMatchingQueryToken({
      organizationId,
      supabase,
      token,
    });

    if (tokenResult.kind !== "ready") {
      return tokenResult;
    }

    matchingIds = matchingIds
      ? intersectSets(matchingIds, tokenResult.ids)
      : tokenResult.ids;

    if (matchingIds.size === 0) {
      break;
    }
  }

  return { kind: "ready", ids: matchingIds ?? new Set<string>() };
}

async function getPeopleIdsMatchingQueryToken({
  organizationId,
  supabase,
  token,
}: {
  organizationId: string;
  supabase: SupabaseServerClient;
  token: string;
}): Promise<PeopleIdQueryResult> {
  const pattern = toPostgrestIlikeToken(token);

  if (!pattern) {
    return { kind: "unsupported" };
  }

  const [
    baseIdsResult,
    roleIdsResult,
    contactIdsResult,
    vendorIdsResult,
    linkedPropertyIdsResult,
    linkedUnitIdsResult,
    syntheticLabelIdsResult,
  ] = await Promise.all([
    getPeopleIdsMatchingBaseToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingRoleToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingContactToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingVendorToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingLinkedPropertyToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingLinkedUnitToken(supabase, organizationId, pattern),
    getPeopleIdsMatchingSyntheticLabelToken(supabase, organizationId, token),
  ]);
  const results = [
    baseIdsResult,
    roleIdsResult,
    contactIdsResult,
    vendorIdsResult,
    linkedPropertyIdsResult,
    linkedUnitIdsResult,
    syntheticLabelIdsResult,
  ];
  const unsupported = results.some((result) => result.kind === "unsupported");

  if (unsupported) {
    return { kind: "unsupported" };
  }

  return {
    kind: "ready",
    ids: unionSets(
      ...(results as Extract<PeopleIdQueryResult, { kind: "ready" }>[]).map(
        (result) => result.ids,
      ),
    ),
  };
}

async function getPeopleIdsMatchingBaseToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", organizationId)
    .or(
      [
        `display_name.ilike.%${pattern}%`,
        `legal_name.ilike.%${pattern}%`,
        `party_type.ilike.%${pattern}%`,
        `primary_email.ilike.%${pattern}%`,
        `primary_phone.ilike.%${pattern}%`,
        `tax_identifier.ilike.%${pattern}%`,
        `notes.ilike.%${pattern}%`,
      ].join(","),
    );

  if (result.error) {
    throw new Error(
      `Could not load people search filters: ${result.error.message}`,
    );
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toIdRow).map((row) => row.id)),
  };
}

async function getPeopleIdsMatchingRoleToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("person_roles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or(`role.ilike.%${pattern}%`);

  return readPersonIdQueryResult(result, "people role search filters");
}

async function getPeopleIdsMatchingContactToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("person_contacts")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or(
      [
        `contact_name.ilike.%${pattern}%`,
        `contact_type.ilike.%${pattern}%`,
        `email.ilike.%${pattern}%`,
        `phone.ilike.%${pattern}%`,
      ].join(","),
    );

  return readPersonIdQueryResult(result, "people contact search filters");
}

async function getPeopleIdsMatchingVendorToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("vendor_profiles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or(
      [
        `service_category.ilike.%${pattern}%`,
        `service_area.ilike.%${pattern}%`,
      ].join(","),
    );

  return readPersonIdQueryResult(result, "people vendor search filters");
}

async function getPeopleIdsMatchingLinkedPropertyToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const propertyIdsResult = await getPropertyIdsMatchingToken(
    supabase,
    organizationId,
    pattern,
  );

  if (propertyIdsResult.kind !== "ready" || propertyIdsResult.ids.size === 0) {
    return propertyIdsResult;
  }

  const [ownerIdsResult, leaseIdsResult] = await Promise.all([
    getPeopleIdsForCurrentOwnerProperties(
      supabase,
      organizationId,
      propertyIdsResult.ids,
    ),
    getPeopleIdsForActiveLeaseProperties(
      supabase,
      organizationId,
      propertyIdsResult.ids,
    ),
  ]);

  if (ownerIdsResult.kind !== "ready") {
    return ownerIdsResult;
  }

  if (leaseIdsResult.kind !== "ready") {
    return leaseIdsResult;
  }

  return {
    kind: "ready",
    ids: unionSets(ownerIdsResult.ids, leaseIdsResult.ids),
  };
}

async function getPeopleIdsMatchingLinkedUnitToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const unitIdsResult = await getUnitIdsMatchingToken(
    supabase,
    organizationId,
    pattern,
  );

  if (unitIdsResult.kind !== "ready" || unitIdsResult.ids.size === 0) {
    return unitIdsResult;
  }

  return getPeopleIdsForActiveLeaseUnits(
    supabase,
    organizationId,
    unitIdsResult.ids,
  );
}

async function getPeopleIdsMatchingSyntheticLabelToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  token: string,
): Promise<PeopleIdQueryResult> {
  const results = await Promise.all([
    tokenMatchesSyntheticLabel(token, "No role")
      ? getPeopleIdsWithoutVisibleRoles(supabase, organizationId)
      : readyPeopleIdSet(),
    tokenMatchesSyntheticLabel(token, "No contact")
      ? getPeopleIdsWithoutUsefulContacts(supabase, organizationId)
      : readyPeopleIdSet(),
    tokenMatchesSyntheticLabel(token, "Vendor profile")
      ? getPeopleIdsForVisibleVendorProfiles(supabase, organizationId)
      : readyPeopleIdSet(),
    tokenMatchesSyntheticLabel(token, "No unit")
      ? getPeopleIdsForActiveLeasesWithoutUnits(supabase, organizationId)
      : readyPeopleIdSet(),
  ]);
  const unsupported = results.some((result) => result.kind === "unsupported");

  if (unsupported) {
    return { kind: "unsupported" };
  }

  return {
    kind: "ready",
    ids: unionSets(
      ...(results as Extract<PeopleIdQueryResult, { kind: "ready" }>[]).map(
        (result) => result.ids,
      ),
    ),
  };
}

async function getPeopleIdsWithoutVisibleRoles(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const [allPeopleIdsResult, visibleRoleIdsResult] = await Promise.all([
    getAllPeopleIds(supabase, organizationId),
    getPeopleIdsFromRoles({ organizationId, supabase }),
  ]);

  if (allPeopleIdsResult.kind !== "ready") {
    return allPeopleIdsResult;
  }

  if (visibleRoleIdsResult.kind !== "ready") {
    return visibleRoleIdsResult;
  }

  return {
    kind: "ready",
    ids: differenceSets(allPeopleIdsResult.ids, visibleRoleIdsResult.ids),
  };
}

async function getPeopleIdsWithoutUsefulContacts(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const [missingPrimaryIdsResult, usefulContactIdsResult] = await Promise.all([
    getPeopleIdsWithoutPrimaryContact(supabase, organizationId),
    getPeopleIdsWithUsefulContacts(supabase, organizationId),
  ]);

  if (missingPrimaryIdsResult.kind !== "ready") {
    return missingPrimaryIdsResult;
  }

  if (usefulContactIdsResult.kind !== "ready") {
    return usefulContactIdsResult;
  }

  return {
    kind: "ready",
    ids: differenceSets(
      missingPrimaryIdsResult.ids,
      usefulContactIdsResult.ids,
    ),
  };
}

async function getAllPeopleIds(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", organizationId);

  if (result.error) {
    throw new Error(
      `Could not load people id filters: ${result.error.message}`,
    );
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toIdRow).map((row) => row.id)),
  };
}

async function getPeopleIdsWithoutPrimaryContact(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", organizationId)
    .is("primary_email", null)
    .is("primary_phone", null);

  if (result.error) {
    throw new Error(
      `Could not load people contact filters: ${result.error.message}`,
    );
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toIdRow).map((row) => row.id)),
  };
}

async function getPeopleIdsForVisibleVendorProfiles(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("vendor_profiles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  return readPersonIdQueryResult(result, "people vendor profile filters");
}

async function getPeopleIdsForActiveLeasesWithoutUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("leases")
    .select("id, status, archived_at")
    .eq("organization_id", organizationId)
    .is("unit_id", null);

  if (result.error) {
    throw new Error(
      `Could not load people no-unit lease filters: ${result.error.message}`,
    );
  }

  return getPeopleIdsForActiveLeaseIds(
    supabase,
    organizationId,
    new Set(
      asRows(result.data, toLeaseSearchRow)
        .filter(isActiveLeaseSearchRow)
        .map((lease) => lease.id),
    ),
  );
}

async function getPropertyIdsMatchingToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", organizationId)
    .or([`code.ilike.%${pattern}%`, `name.ilike.%${pattern}%`].join(","));

  if (result.error) {
    throw new Error(
      `Could not load people property search filters: ${result.error.message}`,
    );
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toIdRow).map((row) => row.id)),
  };
}

async function getUnitIdsMatchingToken(
  supabase: SupabaseServerClient,
  organizationId: string,
  pattern: string,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("units")
    .select("id")
    .eq("organization_id", organizationId)
    .or(`unit_number.ilike.%${pattern}%`);

  if (result.error) {
    throw new Error(
      `Could not load people unit search filters: ${result.error.message}`,
    );
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toIdRow).map((row) => row.id)),
  };
}

async function getPeopleIdsForCurrentOwnerProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: ReadonlySet<string>,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("property_owners")
    .select("person_id")
    .eq("organization_id", organizationId)
    .in("property_id", [...propertyIds])
    .is("archived_at", null)
    .is("ended_on", null);

  return readPersonIdQueryResult(
    result,
    "people owner property search filters",
  );
}

async function getPeopleIdsForActiveLeaseProperties(
  supabase: SupabaseServerClient,
  organizationId: string,
  propertyIds: ReadonlySet<string>,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("leases")
    .select("id, status, archived_at")
    .eq("organization_id", organizationId)
    .in("property_id", [...propertyIds]);

  if (result.error) {
    throw new Error(
      `Could not load people lease property search filters: ${result.error.message}`,
    );
  }

  return getPeopleIdsForActiveLeaseIds(
    supabase,
    organizationId,
    new Set(
      asRows(result.data, toLeaseSearchRow)
        .filter(isActiveLeaseSearchRow)
        .map((lease) => lease.id),
    ),
  );
}

async function getPeopleIdsForActiveLeaseUnits(
  supabase: SupabaseServerClient,
  organizationId: string,
  unitIds: ReadonlySet<string>,
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("leases")
    .select("id, status, archived_at")
    .eq("organization_id", organizationId)
    .in("unit_id", [...unitIds]);

  if (result.error) {
    throw new Error(
      `Could not load people lease unit search filters: ${result.error.message}`,
    );
  }

  return getPeopleIdsForActiveLeaseIds(
    supabase,
    organizationId,
    new Set(
      asRows(result.data, toLeaseSearchRow)
        .filter(isActiveLeaseSearchRow)
        .map((lease) => lease.id),
    ),
  );
}

async function getPeopleIdsForActiveLeaseIds(
  supabase: SupabaseServerClient,
  organizationId: string,
  leaseIds: ReadonlySet<string>,
): Promise<PeopleIdQueryResult> {
  if (leaseIds.size === 0) {
    return { kind: "ready", ids: new Set<string>() };
  }

  const result = await supabase
    .from("lease_parties")
    .select("person_id")
    .eq("organization_id", organizationId)
    .in("lease_id", [...leaseIds])
    .is("archived_at", null)
    .is("ended_on", null);

  return readPersonIdQueryResult(result, "people lease party search filters");
}

function readPersonIdQueryResult(
  result: PeopleQueryResult,
  label: string,
): PeopleIdQueryResult {
  if (result.error) {
    throw new Error(`Could not load ${label}: ${result.error.message}`);
  }

  return {
    kind: "ready",
    ids: new Set(asRows(result.data, toPersonIdRow).map((row) => row.personId)),
  };
}

async function filterPeopleRowsByQuery({
  organizationId,
  people,
  supabase,
  viewQuery,
}: {
  organizationId: string;
  people: PersonRow[];
  supabase: SupabaseServerClient;
  viewQuery: PeopleViewQuery;
}) {
  const tokens = getPeopleQueryTokens(viewQuery);

  if (people.length === 0 || tokens.length === 0) {
    return people;
  }

  const personIds = new Set(people.map((person) => person.id));
  const [roles, contacts, leaseParties, propertyOwners, vendorProfiles] =
    await Promise.all([
      getRows(supabase, "person_roles", roleSelect, organizationId, toRoleRow, {
        column: "person_id",
        values: personIds,
      }),
      getRows(
        supabase,
        "person_contacts",
        contactSelect,
        organizationId,
        toContactRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "lease_parties",
        leasePartySelect,
        organizationId,
        toLeasePartyRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "property_owners",
        propertyOwnerSelect,
        organizationId,
        toPropertyOwnerRow,
        { column: "person_id", values: personIds },
      ),
      getRows(
        supabase,
        "vendor_profiles",
        vendorProfileSelect,
        organizationId,
        toVendorProfileRow,
        { column: "person_id", values: personIds },
      ),
    ]);
  const leaseIds = new Set(leaseParties.map((party) => party.leaseId));
  const leases = await getRows(
    supabase,
    "leases",
    leaseSelect,
    organizationId,
    toLeaseRow,
    { column: "id", values: leaseIds },
  );
  const propertyIds = new Set([
    ...leases.map((lease) => lease.propertyId),
    ...propertyOwners.map((owner) => owner.propertyId),
  ]);
  const unitIds = new Set(
    leases.flatMap((lease) => (lease.unitId ? [lease.unitId] : [])),
  );
  const [properties, units] = await Promise.all([
    getRows(
      supabase,
      "properties",
      propertySelect,
      organizationId,
      toPropertyRow,
      { column: "id", values: propertyIds },
    ),
    getRows(supabase, "units", unitSelect, organizationId, toUnitRow, {
      column: "id",
      values: unitIds,
    }),
  ]);
  const rolesByPerson = groupByPersonId(roles);
  const contactsByPerson = groupByPersonId(contacts);
  const leasePartiesByPerson = groupByPersonId(leaseParties);
  const propertyOwnersByPerson = groupByPersonId(propertyOwners);
  const vendorProfilesByPerson = groupByPersonId(vendorProfiles);
  const leasesById = indexById(leases);
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);

  return people.filter((person) =>
    personMatchesQueryTokens({
      contacts: contactsByPerson.get(person.id) ?? [],
      leaseParties: leasePartiesByPerson.get(person.id) ?? [],
      leasesById,
      person,
      propertyOwners: propertyOwnersByPerson.get(person.id) ?? [],
      propertiesById,
      roles: rolesByPerson.get(person.id) ?? [],
      tokens,
      unitsById,
      vendorProfiles: vendorProfilesByPerson.get(person.id) ?? [],
    }),
  );
}

async function getPersonActivityRows(
  supabase: SupabaseServerClient,
  organizationId: string,
  personIds: ReadonlySet<string>,
) {
  if (personIds.size === 0) {
    return [];
  }

  const result = await supabase
    .from("activity_logs")
    .select(activitySelect)
    .eq("organization_id", organizationId)
    .eq("entity_type", "person")
    .in("entity_id", [...personIds])
    .order("created_at", { ascending: false })
    .limit(120);

  if (result.error) {
    throw new Error(`Could not load people activity: ${result.error.message}`);
  }

  return asRows(result.data, toActivityLogRow);
}

async function addSignedDocumentUrls(
  documents: DocumentRow[],
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<DocumentRow[]> {
  return Promise.all(
    documents.map(async (document) => {
      const { data } = await supabase.storage
        .from("nestory-documents")
        .createSignedUrl(document.storagePath, 60 * 5);

      return {
        ...document,
        url: data?.signedUrl,
      };
    }),
  );
}

async function addSignedDocumentUrlsToPeople(
  people: PeopleSummary[],
  documentsById: Map<string, DocumentRow>,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const visibleDocuments = mergeDocuments(
    people.flatMap((person) =>
      person.documents.flatMap((document) => {
        const row = documentsById.get(document.id);

        return row ? [row] : [];
      }),
    ),
  );

  if (visibleDocuments.length === 0) {
    return people;
  }

  const signedDocuments = await addSignedDocumentUrls(
    visibleDocuments,
    supabase,
  );
  const signedDocumentsById = indexById(signedDocuments);

  return people.map((person) => ({
    ...person,
    documents: person.documents.map(
      (document) => signedDocumentsById.get(document.id) ?? document,
    ),
  }));
}

function mergeDocuments(...groups: DocumentRow[][]) {
  const byId = new Map<string, DocumentRow>();

  for (const group of groups) {
    for (const document of group) {
      byId.set(document.id, document);
    }
  }

  return sortDocuments([...byId.values()]);
}

function groupActivityByPersonId(rows: ActivityLogSnapshot[]) {
  const grouped = new Map<string, ReturnType<typeof toRecentChange>[]>();

  for (const row of rows) {
    const group = grouped.get(row.entity_id) ?? [];
    group.push(toRecentChange(row));
    grouped.set(row.entity_id, group);
  }

  return grouped;
}

function groupDocumentsByPerson({
  documents,
  leasePartiesByPerson,
  leasesById,
  propertyOwnersByPerson,
}: {
  documents: DocumentRow[];
  leasePartiesByPerson: Map<string, LeasePartyRow[]>;
  leasesById: Map<string, LeaseRow>;
  propertyOwnersByPerson: Map<string, PropertyOwnerRow[]>;
}) {
  const grouped = new Map<string, LinkedDocument[]>();
  const documentsByLeaseId = groupDocumentsByContext(documents, "leaseId");
  const documentsByPropertyId = groupDocumentsByContext(
    documents,
    "propertyId",
  );
  const documentsByUnitId = groupDocumentsByContext(documents, "unitId");

  for (const personId of new Set([
    ...leasePartiesByPerson.keys(),
    ...propertyOwnersByPerson.keys(),
  ])) {
    const leaseParties = leasePartiesByPerson.get(personId) ?? [];
    const propertyOwners = propertyOwnersByPerson.get(personId) ?? [];
    const leaseIds = new Set(leaseParties.map((party) => party.leaseId));
    const leases = leaseParties
      .map((party) => leasesById.get(party.leaseId))
      .filter((lease): lease is LeaseRow => Boolean(lease));
    const propertyIds = new Set([
      ...propertyOwners.map((owner) => owner.propertyId),
      ...leases.map((lease) => lease.propertyId),
    ]);
    const unitIds = new Set(
      leases.flatMap((lease) => (lease.unitId ? [lease.unitId] : [])),
    );
    const personDocuments = new Map<string, DocumentRow>();

    addDocumentsForIds(personDocuments, leaseIds, documentsByLeaseId);
    addDocumentsForIds(personDocuments, propertyIds, documentsByPropertyId);
    addDocumentsForIds(personDocuments, unitIds, documentsByUnitId);

    const sortedPersonDocuments = sortDocuments([...personDocuments.values()]);

    if (sortedPersonDocuments.length > 0) {
      grouped.set(personId, sortedPersonDocuments);
    }
  }

  return grouped;
}

function groupDocumentsByContext(
  documents: DocumentRow[],
  key: "leaseId" | "propertyId" | "unitId",
) {
  const grouped = new Map<string, DocumentRow[]>();

  for (const document of documents) {
    const contextId = document[key];

    if (!contextId) {
      continue;
    }

    const group = grouped.get(contextId) ?? [];
    group.push(document);
    grouped.set(contextId, group);
  }

  return grouped;
}

function addDocumentsForIds(
  target: Map<string, DocumentRow>,
  ids: ReadonlySet<string>,
  documentsByContext: Map<string, DocumentRow[]>,
) {
  for (const id of ids) {
    for (const document of documentsByContext.get(id) ?? []) {
      target.set(document.id, document);
    }
  }
}

function sortDocuments(documents: DocumentRow[]) {
  return documents.toSorted(
    (first, second) =>
      Date.parse(second.uploadedAt) - Date.parse(first.uploadedAt) ||
      compareStrings(first.fileName, second.fileName),
  );
}

export function buildPeopleSummary({
  activity,
  contacts,
  documents,
  leaseParties,
  leasesById,
  person,
  propertyOwners,
  propertiesById,
  roles,
  unitsById,
  vendorProfiles,
}: {
  activity?: ReturnType<typeof toRecentChange>[];
  contacts: ContactRow[];
  documents?: LinkedDocument[];
  leaseParties: LeasePartyRow[];
  leasesById: Map<string, LeaseRow>;
  person: PersonRow;
  propertyOwners: PropertyOwnerRow[];
  propertiesById: Map<string, PropertyRow>;
  roles: RoleRow[];
  unitsById: Map<string, UnitRow>;
  vendorProfiles: VendorProfileRow[];
}): PeopleSummary {
  const visibleRoles = roles
    .filter((role) => !role.archivedAt)
    .map((role): PersonRoleSummary => ({
      role: role.role,
      status: role.status,
    }))
    .toSorted(compareRoles);
  const activeRoleCount = visibleRoles.filter(
    (role) => role.status === "active",
  ).length;
  const status = getPeopleStatus({
    activeRoleCount,
    isArchived: Boolean(person.archivedAt),
    roleCount: visibleRoles.length,
  });
  const linked = getLinkedRecords({
    leaseParties,
    leasesById,
    propertyOwners,
    propertiesById,
    unitsById,
    vendorProfiles,
  });
  const detailHrefs = buildPeopleDetailHrefs(person, linked);
  const recordCounts: PeopleRecordCounts = {
    activity: activity?.length ?? 0,
    documents: documents?.length ?? 0,
    leases: linked.activeLeaseCount,
    properties: linked.ownerPropertyCount,
    vendors: linked.vendorProfile ? 1 : 0,
  };
  const riskIndicators = buildPeopleRiskIndicators({
    hasUsefulContact: hasUsefulPersonContact(person, contacts),
    isArchived: Boolean(person.archivedAt),
    linked,
    recordCounts,
    roles: visibleRoles,
  });

  return {
    activity: activity ?? [],
    contact: getPrimaryContact(person, contacts),
    displayName: person.displayName,
    documents: documents ?? [],
    formValues: {
      displayName: person.displayName,
      legalName: person.legalName,
      notes: person.notes,
      partyType: person.partyType,
      primaryEmail: person.primaryEmail,
      primaryPhone: person.primaryPhone,
      roles: visibleRoles
        .filter((role) => role.status === "active")
        .map((role) => role.role),
      taxIdentifier: person.taxIdentifier,
    },
    hasUsefulContact: hasUsefulPersonContact(person, contacts),
    hrefs: detailHrefs,
    id: person.id,
    isArchived: Boolean(person.archivedAt),
    legalName: person.legalName,
    linked,
    nextAction: buildPeopleNextAction({
      detailHrefs,
      hasUsefulContact: hasUsefulPersonContact(person, contacts),
      isArchived: Boolean(person.archivedAt),
      linked,
      recordCounts,
      roles: visibleRoles,
    }),
    notes: person.notes,
    partyType: person.partyType,
    partyTypeLabel: formatPartyType(person.partyType),
    recordCounts,
    riskIndicators,
    roles: visibleRoles,
    roleLabel:
      visibleRoles.length > 0
        ? visibleRoles.map((role) => formatRole(role.role)).join(", ")
        : "No role",
    statusLabel: status.label,
    statusTone: status.tone,
    updatedAt: person.updatedAt,
  };
}

function getPrimaryContact(
  person: PersonRow,
  contacts: ContactRow[],
): PeopleContactSummary {
  const primary = contacts
    .filter((contact) => !contact.archivedAt)
    .toSorted(
      (first, second) => Number(second.isPrimary) - Number(first.isPrimary),
    )
    .at(0);
  const email = person.primaryEmail ?? primary?.email ?? null;
  const phone = person.primaryPhone ?? primary?.phone ?? null;
  const label = [email, phone].filter(Boolean).join(" / ");

  if (label) {
    return { email, label, phone };
  }

  if (primary?.contactName) {
    return {
      email,
      label: primary.contactType
        ? `${primary.contactName} / ${primary.contactType}`
        : primary.contactName,
      phone,
    };
  }

  return { email: null, label: "No contact", phone: null };
}

function getLinkedRecords({
  leaseParties,
  leasesById,
  propertyOwners,
  propertiesById,
  unitsById,
  vendorProfiles,
}: {
  leaseParties: LeasePartyRow[];
  leasesById: Map<string, LeaseRow>;
  propertyOwners: PropertyOwnerRow[];
  propertiesById: Map<string, PropertyRow>;
  unitsById: Map<string, UnitRow>;
  vendorProfiles: VendorProfileRow[];
}): PeopleLinkedRecords {
  const activeLeaseLinks = leaseParties
    .filter((party) => !party.archivedAt && !party.endedOn)
    .map((party) => leasesById.get(party.leaseId))
    .filter(isActiveLease)
    .map((lease) => buildLeaseLink(lease, propertiesById, unitsById));
  const activeOwnerLinks = propertyOwners
    .filter((owner) => !owner.archivedAt && !owner.endedOn)
    .map((owner) => buildPropertyLink(owner, propertiesById))
    .filter((property): property is PeoplePropertyLink => Boolean(property));
  const vendorProfile = vendorProfiles
    .filter((profile) => !profile.archivedAt)
    .map(buildVendorLink)
    .at(0);

  return {
    activeLease: activeLeaseLinks.at(0),
    activeLeaseCount: activeLeaseLinks.length,
    activeLeases: activeLeaseLinks,
    ownerProperty: activeOwnerLinks.at(0),
    ownerPropertyCount: activeOwnerLinks.length,
    ownerProperties: activeOwnerLinks,
    vendorProfile,
  };
}

function buildLeaseLink(
  lease: LeaseRow,
  propertiesById: Map<string, PropertyRow>,
  unitsById: Map<string, UnitRow>,
): PeopleLeaseLink {
  const property = propertiesById.get(lease.propertyId);
  const unit = lease.unitId ? unitsById.get(lease.unitId) : undefined;
  const propertyId = lease.propertyId;
  const unitId = lease.unitId ?? undefined;

  return {
    endDate: lease.endDate,
    href: buildHref("/leases", {
      archiveState: "all",
      leaseId: lease.id,
      query: lease.tenantName,
    }),
    id: lease.id,
    label: `${formatDate(lease.startDate)} - ${formatDate(lease.endDate)}`,
    ledgerHref: buildHref("/ledger", {
      propertyId,
      query: lease.tenantName,
      unitId,
    }),
    propertyId,
    propertyLabel: property
      ? `${property.code} / ${property.name}`
      : "Property not linked",
    startDate: lease.startDate,
    status: lease.status,
    timelineHref: buildHref("/timeline", {
      archiveState: "all",
      propertyId,
      query: lease.tenantName,
      unitId,
    }),
    unitId: lease.unitId,
    unitLabel: unit ? `Unit ${unit.unitNumber}` : "No unit",
  };
}

function buildPropertyLink(
  owner: PropertyOwnerRow,
  propertiesById: Map<string, PropertyRow>,
) {
  const property = propertiesById.get(owner.propertyId);

  if (!property) {
    return null;
  }

  return {
    href: `/properties/${property.id}`,
    id: property.id,
    label: `${property.code} / ${property.name}`,
    ownershipLabel:
      owner.ownershipLabel ?? (owner.isPrimary ? "Primary" : "Owner"),
  };
}

function buildVendorLink(profile: VendorProfileRow): PeopleVendorLink {
  return {
    id: profile.id,
    label:
      [profile.serviceCategory, profile.serviceArea]
        .filter(Boolean)
        .join(" / ") || "Vendor profile",
    preferred: profile.preferred,
    status: profile.status,
  };
}

function buildPeopleDetailHrefs(
  person: PersonRow,
  linked: PeopleLinkedRecords,
): PeopleDetailHrefs {
  const activeLease = linked.activeLease;
  const ownerProperty = linked.ownerProperty;
  const timelineContext = activeLease
    ? {
        propertyId: activeLease.propertyId,
        unitId: activeLease.unitId ?? undefined,
      }
    : ownerProperty
      ? { propertyId: ownerProperty.id, unitId: undefined }
      : {};

  return {
    addLease: buildHref("/leases", {
      action: "create",
      tenantPersonId: person.id,
    }),
    addTimelineEvent: buildHref("/timeline", {
      action: "create",
      propertyId: timelineContext.propertyId,
      query: person.displayName,
      unitId: timelineContext.unitId,
    }),
    documents: buildHref("/documents", {
      query: person.displayName,
    }),
    ledger: buildHref("/ledger", {
      query: person.displayName,
    }),
    leases: buildHref("/leases", {
      archiveState: "all",
      query: person.displayName,
    }),
    people: buildHref("/people", {
      archiveState: "all",
      personId: person.id,
      query: person.displayName,
    }),
    timeline: buildHref("/timeline", {
      archiveState: "all",
      query: person.displayName,
    }),
  };
}

function buildPeopleRiskIndicators({
  hasUsefulContact,
  isArchived,
  linked,
  recordCounts,
  roles,
}: {
  hasUsefulContact: boolean;
  isArchived: boolean;
  linked: PeopleLinkedRecords;
  recordCounts: PeopleRecordCounts;
  roles: PersonRoleSummary[];
}): PeopleRiskIndicator[] {
  const hasRole = roles.some((role) => role.status === "active");
  const hasLinkedRecord =
    linked.activeLeaseCount > 0 ||
    linked.ownerPropertyCount > 0 ||
    Boolean(linked.vendorProfile);

  return [
    {
      description: isArchived
        ? "Archived people stay available for audit and linked history."
        : "This person is visible in normal operational views.",
      id: "status",
      label: isArchived ? "Archived" : "Active directory record",
      tone: isArchived ? "warning" : "success",
    },
    {
      description: hasRole
        ? "At least one active tenant, owner, or vendor role is assigned."
        : "No active role is assigned, so workflows cannot classify this person yet.",
      id: "role",
      label: hasRole ? "Role assigned" : "Role missing",
      tone: hasRole ? "success" : "warning",
    },
    {
      description: hasUsefulContact
        ? "A usable email or phone is available for follow-up."
        : "Add an email or phone before relying on this record for follow-up.",
      id: "contact",
      label: hasUsefulContact ? "Contact ready" : "Contact missing",
      tone: hasUsefulContact ? "success" : "warning",
    },
    {
      description: hasLinkedRecord
        ? "This person is connected to lease, ownership, or vendor context."
        : "No lease, ownership, or vendor record is connected yet.",
      id: "links",
      label: hasLinkedRecord ? "Operational links" : "No linked records",
      tone: hasLinkedRecord ? "success" : "warning",
    },
    {
      description:
        recordCounts.documents > 0
          ? "Related lease, property, or unit documents are attached."
          : "No related lease, property, or unit documents are attached yet.",
      id: "documents",
      label:
        recordCounts.documents > 0 ? "Evidence attached" : "Evidence missing",
      tone: recordCounts.documents > 0 ? "success" : "warning",
    },
  ];
}

function buildPeopleNextAction({
  detailHrefs,
  hasUsefulContact,
  isArchived,
  linked,
  recordCounts,
  roles,
}: {
  detailHrefs: PeopleDetailHrefs;
  hasUsefulContact: boolean;
  isArchived: boolean;
  linked: PeopleLinkedRecords;
  recordCounts: PeopleRecordCounts;
  roles: PersonRoleSummary[];
}): PeopleNextAction {
  const hasActiveRole = roles.some((role) => role.status === "active");

  if (isArchived) {
    return {
      description: "Restore this record before using it in new workflows.",
      href: detailHrefs.people,
      label: "Review archive state",
      tone: "warning",
    };
  }

  if (!hasActiveRole) {
    return {
      description:
        "Assign tenant, owner, or vendor before linking work to this person.",
      href: detailHrefs.people,
      label: "Assign role",
      tone: "warning",
    };
  }

  if (!hasUsefulContact) {
    return {
      description:
        "Add email or phone so follow-up and billing context are usable.",
      href: detailHrefs.people,
      label: "Add contact",
      tone: "warning",
    };
  }

  if (
    linked.activeLeaseCount === 0 &&
    linked.ownerPropertyCount === 0 &&
    !linked.vendorProfile
  ) {
    return {
      description:
        "Connect this person to a lease, owner record, or vendor profile.",
      href: detailHrefs.addLease,
      label: "Link record",
      tone: "accent",
    };
  }

  if (recordCounts.documents === 0) {
    return {
      description: "Attach agreement, ID, ownership, or vendor evidence.",
      href: detailHrefs.documents,
      label: "Attach evidence",
      tone: "warning",
    };
  }

  return {
    description: "Review linked lease, property, timeline, and ledger context.",
    href: detailHrefs.leases,
    label: "Review linked work",
    tone: "neutral",
  };
}

export function filterPeopleSummaries(
  people: PeopleSummary[],
  viewQuery: PeopleViewQuery,
) {
  const tokens = viewQuery.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return people.filter((person) => {
    const matchesArchiveState = matchesArchive(person, viewQuery.archiveState);
    const matchesRole =
      viewQuery.role === "all" ||
      person.roles.some((role) => role.role === viewQuery.role);
    const matchesStatus = personMatchesStatusFilter(person, viewQuery.status);
    const haystack = [
      person.displayName,
      person.legalName ?? "",
      person.partyTypeLabel,
      person.roleLabel,
      person.contact.label,
      person.linked.activeLease?.propertyLabel ?? "",
      person.linked.activeLease?.unitLabel ?? "",
      person.linked.ownerProperty?.label ?? "",
      person.linked.vendorProfile?.label ?? "",
      person.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = tokens.every((token) => haystack.includes(token));

    return matchesArchiveState && matchesRole && matchesStatus && matchesQuery;
  });
}

function matchesArchive(
  person: PeopleSummary,
  archiveState: PeopleArchiveState,
) {
  if (archiveState === "all") {
    return true;
  }

  return archiveState === "archived" ? person.isArchived : !person.isArchived;
}

export function personMatchesStatusFilter(
  person: PeopleSummary,
  status: PeopleViewQuery["status"],
) {
  if (status === "all") {
    return true;
  }

  if (status === "no_role") {
    return person.roles.length === 0;
  }

  if (status === "missing_contact") {
    return !person.hasUsefulContact;
  }

  if (status === "active") {
    return person.roles.some((role) => role.status === "active");
  }

  return (
    person.roles.length > 0 &&
    person.roles.every((role) => role.status === "inactive")
  );
}

function personMatchesQueryTokens({
  contacts,
  leaseParties,
  leasesById,
  person,
  propertyOwners,
  propertiesById,
  roles,
  tokens,
  unitsById,
  vendorProfiles,
}: {
  contacts: ContactRow[];
  leaseParties: LeasePartyRow[];
  leasesById: Map<string, LeaseRow>;
  person: PersonRow;
  propertyOwners: PropertyOwnerRow[];
  propertiesById: Map<string, PropertyRow>;
  roles: RoleRow[];
  tokens: string[];
  unitsById: Map<string, UnitRow>;
  vendorProfiles: VendorProfileRow[];
}) {
  const visibleRoles = roles
    .filter((role) => !role.archivedAt)
    .map((role): PersonRoleSummary => ({
      role: role.role,
      status: role.status,
    }))
    .toSorted(compareRoles);
  const linked = getLinkedRecords({
    leaseParties,
    leasesById,
    propertyOwners,
    propertiesById,
    unitsById,
    vendorProfiles,
  });
  const roleLabel =
    visibleRoles.length > 0
      ? visibleRoles.map((role) => formatRole(role.role)).join(", ")
      : "No role";
  const haystack = [
    person.displayName,
    person.legalName ?? "",
    formatPartyType(person.partyType),
    roleLabel,
    getPrimaryContact(person, contacts).label,
    linked.activeLease?.propertyLabel ?? "",
    linked.activeLease?.unitLabel ?? "",
    linked.ownerProperty?.label ?? "",
    linked.vendorProfile?.label ?? "",
    person.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

async function getExcludedPersonIdsForStatus(
  supabase: SupabaseServerClient,
  organizationId: string,
  status: PeopleViewQuery["status"],
) {
  if (status === "missing_contact") {
    return new Set<string>();
  }

  if (status === "no_role") {
    return getPeopleIdsWithVisibleRoles(supabase, organizationId);
  }

  return new Set<string>();
}

async function getPeopleIdsWithVisibleRoles(
  supabase: SupabaseServerClient,
  organizationId: string,
) {
  const result = await getPeopleIdsFromRoles({ organizationId, supabase });

  if (result.kind !== "ready") {
    return new Set<string>();
  }

  return result.ids;
}

async function getPeopleIdsFromRoles({
  organizationId,
  role,
  status,
  supabase,
}: {
  organizationId: string;
  role?: PersonRoleValue;
  status?: PersonRoleStatus;
  supabase: SupabaseServerClient;
}): Promise<PeopleIdQueryResult> {
  let query = supabase
    .from("person_roles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (role) {
    query = query.eq("role", role);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const result = await query;

  return readPersonIdQueryResult(result, "people role filters");
}

async function getPeopleIdsWithUsefulContacts(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<PeopleIdQueryResult> {
  const [emailResult, phoneResult] = await Promise.all([
    getPeopleIdsFromContactValue(supabase, organizationId, "email"),
    getPeopleIdsFromContactValue(supabase, organizationId, "phone"),
  ]);

  if (emailResult.kind !== "ready") {
    return emailResult;
  }

  if (phoneResult.kind !== "ready") {
    return phoneResult;
  }

  return {
    kind: "ready",
    ids: unionSets(emailResult.ids, phoneResult.ids),
  };
}

async function getPeopleIdsFromContactValue(
  supabase: SupabaseServerClient,
  organizationId: string,
  column: "email" | "phone",
): Promise<PeopleIdQueryResult> {
  const result = await supabase
    .from("person_contacts")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not(column, "is", null);

  return readPersonIdQueryResult(result, "people contact filters");
}

function hasUsefulPersonContact(person: PersonRow, contacts: ContactRow[]) {
  return (
    hasUsefulContactValue(person.primaryEmail) ||
    hasUsefulContactValue(person.primaryPhone) ||
    contacts.some(
      (contact) =>
        !contact.archivedAt &&
        (hasUsefulContactValue(contact.email) ||
          hasUsefulContactValue(contact.phone)),
    )
  );
}

function hasUsefulContactValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function sortPeopleSummaries(
  people: PeopleSummary[],
  sort = DEFAULT_PEOPLE_SORT,
) {
  return [...people].sort((first, second) => {
    if (sort === "updated_desc") {
      return (
        Date.parse(second.updatedAt) - Date.parse(first.updatedAt) ||
        comparePeopleSummaries(first, second)
      );
    }

    return comparePeopleSummaries(first, second);
  });
}

function sortPersonRows(people: PersonRow[], sort = DEFAULT_PEOPLE_SORT) {
  return [...people].sort((first, second) => {
    if (sort === "updated_desc") {
      return (
        Date.parse(second.updatedAt) - Date.parse(first.updatedAt) ||
        comparePersonRows(first, second)
      );
    }

    return comparePersonRows(first, second);
  });
}

function buildPeoplePagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): PeoplePagination {
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

function getPeoplePageSummaries(
  people: PeopleSummary[],
  pagination: PeoplePagination,
) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return people.slice(start, pagination.to);
}

function getPeoplePageRows(people: PersonRow[], pagination: PeoplePagination) {
  const start = pagination.totalCount === 0 ? 0 : pagination.from - 1;

  return people.slice(start, pagination.to);
}

function getPeopleStatus({
  activeRoleCount,
  isArchived,
  roleCount,
}: {
  activeRoleCount: number;
  isArchived: boolean;
  roleCount: number;
}): { label: string; tone: PeopleBadgeTone } {
  if (isArchived) {
    return { label: "Archived", tone: "warning" };
  }

  if (activeRoleCount > 0) {
    return { label: "Active", tone: "success" };
  }

  if (roleCount > 0) {
    return { label: "Inactive", tone: "neutral" };
  }

  return { label: "No role", tone: "warning" };
}

function isActiveLease(lease: LeaseRow | undefined): lease is LeaseRow {
  if (!lease || lease.archivedAt) {
    return false;
  }

  return !["cancelled", "canceled", "ended", "terminated"].includes(
    lease.status.toLowerCase(),
  );
}

function comparePeopleSummaries(first: PeopleSummary, second: PeopleSummary) {
  return (
    Number(first.isArchived) - Number(second.isArchived) ||
    compareStrings(first.displayName, second.displayName)
  );
}

function comparePersonRows(first: PersonRow, second: PersonRow) {
  return (
    Number(Boolean(first.archivedAt)) - Number(Boolean(second.archivedAt)) ||
    compareStrings(first.displayName, second.displayName)
  );
}

function compareRoles(first: PersonRoleSummary, second: PersonRoleSummary) {
  return (
    compareStrings(first.role, second.role) ||
    compareStrings(first.status, second.status)
  );
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function groupByPersonId<T extends { personId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const group = grouped.get(row.personId) ?? [];
    group.push(row);
    grouped.set(row.personId, group);
  }

  return grouped;
}

function indexById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function asRows<T>(
  data: unknown,
  mapper: (row: UnknownRecord) => T | null,
): T[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const rows: T[] = [];

  for (const item of data) {
    if (!isRecord(item)) {
      continue;
    }

    const row = mapper(item);

    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

function toPersonRow(row: UnknownRecord): PersonRow | null {
  const id = readString(row, "id");
  const displayName = readString(row, "display_name");

  if (!id || !displayName) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    createdAt: readString(row, "created_at"),
    displayName,
    id,
    legalName: readNullableString(row, "legal_name"),
    notes: readNullableString(row, "notes"),
    partyType: readPartyType(row, "party_type"),
    primaryEmail: readNullableString(row, "primary_email"),
    primaryPhone: readNullableString(row, "primary_phone"),
    taxIdentifier: readNullableString(row, "tax_identifier"),
    updatedAt: readString(row, "updated_at") || readString(row, "created_at"),
  };
}

function toRoleRow(row: UnknownRecord): RoleRow | null {
  const id = readString(row, "id");
  const personId = readString(row, "person_id");
  const role = readRole(row, "role");

  if (!id || !personId || !role) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    id,
    personId,
    role,
    status: readRoleStatus(row, "status"),
  };
}

function toContactRow(row: UnknownRecord): ContactRow | null {
  const id = readString(row, "id");
  const personId = readString(row, "person_id");

  if (!id || !personId) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    contactName: readNullableString(row, "contact_name"),
    contactType: readNullableString(row, "contact_type"),
    email: readNullableString(row, "email"),
    id,
    isPrimary: readBoolean(row, "is_primary"),
    personId,
    phone: readNullableString(row, "phone"),
  };
}

function toLeasePartyRow(row: UnknownRecord): LeasePartyRow | null {
  const id = readString(row, "id");
  const leaseId = readString(row, "lease_id");
  const personId = readString(row, "person_id");

  if (!id || !leaseId || !personId) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    endedOn: readNullableString(row, "ended_on"),
    id,
    isPrimary: readBoolean(row, "is_primary"),
    leaseId,
    partyRole: readString(row, "party_role"),
    personId,
  };
}

function toLeaseRow(row: UnknownRecord): LeaseRow | null {
  const id = readString(row, "id");
  const propertyId = readString(row, "property_id");
  const startDate = readString(row, "lease_start_date");
  const endDate = readString(row, "lease_end_date");

  if (!id || !propertyId || !startDate || !endDate) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    endDate,
    id,
    propertyId,
    startDate,
    status: readString(row, "status"),
    tenantName: readString(row, "tenant_name"),
    unitId: readNullableString(row, "unit_id"),
  };
}

function toPropertyOwnerRow(row: UnknownRecord): PropertyOwnerRow | null {
  const id = readString(row, "id");
  const personId = readString(row, "person_id");
  const propertyId = readString(row, "property_id");

  if (!id || !personId || !propertyId) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    endedOn: readNullableString(row, "ended_on"),
    id,
    isPrimary: readBoolean(row, "is_primary"),
    ownershipLabel: readNullableString(row, "ownership_label"),
    personId,
    propertyId,
  };
}

function toVendorProfileRow(row: UnknownRecord): VendorProfileRow | null {
  const id = readString(row, "id");
  const personId = readString(row, "person_id");

  if (!id || !personId) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    id,
    personId,
    preferred: readBoolean(row, "preferred"),
    serviceArea: readNullableString(row, "service_area"),
    serviceCategory: readNullableString(row, "service_category"),
    status: readString(row, "status") || "active",
  };
}

function toPropertyRow(row: UnknownRecord): PropertyRow | null {
  const id = readString(row, "id");
  const code = readString(row, "code");
  const name = readString(row, "name");

  return id ? { code, id, name } : null;
}

function toUnitRow(row: UnknownRecord): UnitRow | null {
  const id = readString(row, "id");
  const propertyId = readString(row, "property_id");
  const unitNumber = readString(row, "unit_number");

  return id ? { id, propertyId, unitNumber } : null;
}

function toDocumentRow(row: UnknownRecord): DocumentRow | null {
  const id = readString(row, "id");
  const fileName = readString(row, "file_name");
  const storagePath = readString(row, "storage_path");

  if (!id || !fileName || !storagePath) {
    return null;
  }

  return {
    category: readString(row, "category") || "general",
    fileName,
    id,
    leaseId: readNullableString(row, "lease_id"),
    mimeType: readString(row, "mime_type") || "application/octet-stream",
    propertyId: readNullableString(row, "property_id"),
    sizeBytes: readNumber(row, "size_bytes"),
    storagePath,
    unitId: readNullableString(row, "unit_id"),
    uploadedAt: readString(row, "uploaded_at"),
  };
}

function toActivityLogRow(row: UnknownRecord): ActivityLogSnapshot | null {
  const id = readString(row, "id");
  const entityId = readString(row, "entity_id");
  const entityType = readString(row, "entity_type");
  const action = readString(row, "action");
  const createdAt = readString(row, "created_at");

  if (!id || !entityId || !entityType || !action || !createdAt) {
    return null;
  }

  return {
    action,
    created_at: createdAt,
    entity_id: entityId,
    entity_type: entityType,
    id,
    new_values: readJson(row, "new_values"),
    previous_values: readJson(row, "previous_values"),
  };
}

function toPersonIdRow(row: UnknownRecord) {
  const personId = readString(row, "person_id");

  return personId ? { personId } : null;
}

function toIdRow(row: UnknownRecord) {
  const id = readString(row, "id");

  return id ? { id } : null;
}

function toLeaseSearchRow(row: UnknownRecord) {
  const id = readString(row, "id");

  if (!id) {
    return null;
  }

  return {
    archivedAt: readNullableString(row, "archived_at"),
    id,
    status: readString(row, "status"),
  };
}

function isActiveLeaseSearchRow(lease: {
  archivedAt: string | null;
  status: string;
}) {
  if (lease.archivedAt) {
    return false;
  }

  return !["cancelled", "canceled", "ended", "terminated"].includes(
    lease.status.toLowerCase(),
  );
}

function getPeopleQueryTokens(viewQuery: PeopleViewQuery) {
  return viewQuery.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function toPostgrestIlikeToken(token: string) {
  return token
    .replace(/[,%()]/g, " ")
    .trim()
    .replace(/\s+/g, "%");
}

function tokenMatchesSyntheticLabel(token: string, label: string) {
  return label.toLowerCase().includes(token);
}

function readyPeopleIdSet(ids = new Set<string>()): PeopleIdQueryResult {
  return { kind: "ready", ids };
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
}

function unionSets<T>(...sets: ReadonlySet<T>[]) {
  const union = new Set<T>();

  for (const set of sets) {
    for (const value of set) {
      union.add(value);
    }
  }

  return union;
}

function intersectSets<T>(first: ReadonlySet<T>, second: ReadonlySet<T>) {
  const intersection = new Set<T>();

  for (const value of first) {
    if (second.has(value)) {
      intersection.add(value);
    }
  }

  return intersection;
}

function differenceSets<T>(first: ReadonlySet<T>, second: ReadonlySet<T>) {
  const difference = new Set<T>();

  for (const value of first) {
    if (!second.has(value)) {
      difference.add(value);
    }
  }

  return difference;
}

function buildHref(
  pathname: string,
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function readPartyType(row: UnknownRecord, key: string): PersonPartyType {
  return readString(row, key) === "company" ? "company" : "individual";
}

function readRole(row: UnknownRecord, key: string): PersonRoleValue | null {
  const value = readString(row, key);

  if (value === "tenant" || value === "owner" || value === "vendor") {
    return value;
  }

  return null;
}

function readRoleStatus(row: UnknownRecord, key: string): PersonRoleStatus {
  return readString(row, key) === "inactive" ? "inactive" : "active";
}

function readBoolean(row: UnknownRecord, key: string) {
  return row[key] === true;
}

function readNumber(row: UnknownRecord, key: string) {
  const value = row[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function readJson(
  row: UnknownRecord,
  key: string,
): ActivityLogSnapshot["new_values"] {
  const value = row[key];

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (typeof value === "object" && value !== undefined)
  ) {
    return value as ActivityLogSnapshot["new_values"];
  }

  return null;
}

function readNullableString(row: UnknownRecord, key: string) {
  const value = row[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readString(row: UnknownRecord, key: string) {
  const value = row[key];

  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
