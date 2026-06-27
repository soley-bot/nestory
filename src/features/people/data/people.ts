import { createSupabaseServerClient } from "@/lib/db/server";
import {
  DEFAULT_PEOPLE_SORT,
  parsePeopleSearchParams,
} from "@/features/people/people.filters";
import type {
  PeopleArchiveState,
  PeopleBadgeTone,
  PeopleContactSummary,
  PeopleLeaseLink,
  PeopleLinkedRecords,
  PeoplePagination,
  PeoplePropertyLink,
  PeopleScreenData,
  PeopleSummary,
  PeopleVendorLink,
  PeopleViewQuery,
  PersonPartyType,
  PersonRoleStatus,
  PersonRoleSummary,
  PersonRoleValue,
} from "@/features/people/people.types";
import {
  formatPartyType,
  formatRole,
} from "@/features/people/people.labels";
import {
  asUntypedSupabase,
  isMissingPeopleSchemaMessage,
  type UntypedSupabaseClient,
} from "@/features/people/data/untyped-supabase";

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

type UnknownRecord = Record<string, unknown>;

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

export async function getPeopleScreenData(
  organizationId: string,
  viewQuery: PeopleViewQuery = parsePeopleSearchParams({}),
): Promise<PeopleScreenData> {
  const supabase = asUntypedSupabase(await createSupabaseServerClient());
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
    if (isMissingPeopleSchemaMessage(peopleResult.error.message)) {
      return emptyPeopleData(viewQuery, "People tables are not available yet.");
    }

    throw new Error(`Could not load people: ${peopleResult.error.message}`);
  }

  const people = asRows(peopleResult.data, toPersonRow);
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
        true,
      ),
      getRows(
        supabase,
        "lease_parties",
        leasePartySelect,
        organizationId,
        toLeasePartyRow,
        { column: "person_id", values: personIds },
        true,
      ),
      getRows(
        supabase,
        "property_owners",
        propertyOwnerSelect,
        organizationId,
        toPropertyOwnerRow,
        { column: "person_id", values: personIds },
        true,
      ),
      getRows(
        supabase,
        "vendor_profiles",
        vendorProfileSelect,
        organizationId,
        toVendorProfileRow,
        { column: "person_id", values: personIds },
        true,
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
    true,
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
      {
        column: "id",
        values: propertyIds,
      },
    ),
    getRows(
      supabase,
      "units",
      unitSelect,
      organizationId,
      toUnitRow,
      {
        column: "id",
        values: unitIds,
      },
      true,
    ),
  ]);

  const rolesByPerson = groupByPersonId(roles);
  const contactsByPerson = groupByPersonId(contacts);
  const leasePartiesByPerson = groupByPersonId(leaseParties);
  const propertyOwnersByPerson = groupByPersonId(propertyOwners);
  const vendorProfilesByPerson = groupByPersonId(vendorProfiles);
  const leasesById = indexById(leases);
  const propertiesById = indexById(properties);
  const unitsById = indexById(units);
  const summaries = people
    .map((person) =>
      buildPeopleSummary({
        contacts: contactsByPerson.get(person.id) ?? [],
        leaseParties: leasePartiesByPerson.get(person.id) ?? [],
        leasesById,
        person,
        propertyOwners: propertyOwnersByPerson.get(person.id) ?? [],
        propertiesById,
        roles: rolesByPerson.get(person.id) ?? [],
        unitsById,
        vendorProfiles: vendorProfilesByPerson.get(person.id) ?? [],
      }),
    )
    .toSorted(comparePeopleSummaries);
  const filteredPeople = filterPeopleSummaries(summaries, viewQuery);
  const sortedPeople = sortPeopleSummaries(filteredPeople, viewQuery.sort);
  const pagination = buildPeoplePagination({
    page: viewQuery.page,
    pageSize: viewQuery.pageSize,
    totalCount: sortedPeople.length,
  });

  return {
    pagination,
    people: getPeoplePageSummaries(sortedPeople, pagination),
  };
}

async function getRows<T>(
  supabase: UntypedSupabaseClient,
  table: string,
  columns: string,
  organizationId: string,
  mapper: (row: UnknownRecord) => T | null,
  filter?: { column: string; values: ReadonlySet<string> },
  optional = false,
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
    if (optional && isMissingPeopleSchemaMessage(result.error.message)) {
      return [];
    }

    throw new Error(`Could not load ${table}: ${result.error.message}`);
  }

  return asRows(result.data, mapper);
}

function buildPeopleSummary({
  contacts,
  leaseParties,
  leasesById,
  person,
  propertyOwners,
  propertiesById,
  roles,
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

  return {
    contact: getPrimaryContact(person, contacts),
    displayName: person.displayName,
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
    id: person.id,
    isArchived: Boolean(person.archivedAt),
    legalName: person.legalName,
    linked,
    notes: person.notes,
    partyType: person.partyType,
    partyTypeLabel: formatPartyType(person.partyType),
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
    .toSorted((first, second) => Number(second.isPrimary) - Number(first.isPrimary))
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
    ownerProperty: activeOwnerLinks.at(0),
    ownerPropertyCount: activeOwnerLinks.length,
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

  return {
    endDate: lease.endDate,
    id: lease.id,
    label: `${formatDate(lease.startDate)} - ${formatDate(lease.endDate)}`,
    propertyLabel: property
      ? `${property.code} / ${property.name}`
      : "Property not linked",
    startDate: lease.startDate,
    status: lease.status,
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
    id: property.id,
    label: `${property.code} / ${property.name}`,
    ownershipLabel: owner.ownershipLabel ?? (owner.isPrimary ? "Primary" : "Owner"),
  };
}

function buildVendorLink(profile: VendorProfileRow): PeopleVendorLink {
  return {
    id: profile.id,
    label: [profile.serviceCategory, profile.serviceArea]
      .filter(Boolean)
      .join(" / ") || "Vendor profile",
    preferred: profile.preferred,
    status: profile.status,
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

function matchesArchive(person: PeopleSummary, archiveState: PeopleArchiveState) {
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

async function getExcludedPersonIdsForStatus(
  supabase: UntypedSupabaseClient,
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
  supabase: UntypedSupabaseClient,
  organizationId: string,
) {
  const result = await supabase
    .from("person_roles")
    .select("person_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);

  if (result.error) {
    if (isMissingPeopleSchemaMessage(result.error.message)) {
      return new Set<string>();
    }

    throw new Error(`Could not load people role filters: ${result.error.message}`);
  }

  return new Set(asRows(result.data, toPersonIdRow).map((row) => row.personId));
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
    if (sort === "role_asc") {
      return (
        compareStrings(first.roleLabel, second.roleLabel) ||
        comparePeopleSummaries(first, second)
      );
    }

    if (sort === "linked_desc") {
      return (
        getLinkedCount(second) - getLinkedCount(first) ||
        comparePeopleSummaries(first, second)
      );
    }

    if (sort === "updated_desc") {
      return (
        Date.parse(second.updatedAt) - Date.parse(first.updatedAt) ||
        comparePeopleSummaries(first, second)
      );
    }

    return comparePeopleSummaries(first, second);
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

function emptyPeopleData(
  viewQuery: PeopleViewQuery,
  schemaNotice?: string,
): PeopleScreenData {
  return {
    pagination: buildPeoplePagination({
      page: viewQuery.page,
      pageSize: viewQuery.pageSize,
      totalCount: 0,
    }),
    people: [],
    schemaNotice,
  };
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

function getLinkedCount(person: PeopleSummary) {
  return (
    person.linked.activeLeaseCount +
    person.linked.ownerPropertyCount +
    Number(Boolean(person.linked.vendorProfile))
  );
}

function comparePeopleSummaries(first: PeopleSummary, second: PeopleSummary) {
  return (
    Number(first.isArchived) - Number(second.isArchived) ||
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

function toPersonIdRow(row: UnknownRecord) {
  const personId = readString(row, "person_id");

  return personId ? { personId } : null;
}

function formatPostgrestInFilter(values: ReadonlySet<string>) {
  return `(${[...values].join(",")})`;
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
