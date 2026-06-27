export type PeopleBadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type PeopleArchiveState = "active" | "archived" | "all";

export type PeopleDisplayMode = "table" | "cards";

export type PersonPartyType = "individual" | "company";

export type PersonRoleValue = "tenant" | "owner" | "vendor";

export type PersonRoleStatus = "active" | "inactive";

export type PeopleRoleFilter = PersonRoleValue | "all";

export type PeopleStatusFilter =
  | "active"
  | "inactive"
  | "no_role"
  | "missing_contact"
  | "all";

export type PeopleSortKey =
  | "name_asc"
  | "role_asc"
  | "linked_desc"
  | "updated_desc";

export type PeopleFormValues = {
  displayName: string;
  legalName?: string | null;
  notes?: string | null;
  partyType: PersonPartyType;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  roles: PersonRoleValue[];
  taxIdentifier?: string | null;
};

export type PersonRoleSummary = {
  role: PersonRoleValue;
  status: PersonRoleStatus;
};

export type PeopleContactSummary = {
  email?: string | null;
  label: string;
  phone?: string | null;
};

export type PeopleLeaseLink = {
  endDate: string;
  id: string;
  label: string;
  propertyLabel: string;
  startDate: string;
  status: string;
  unitLabel: string;
};

export type PeoplePropertyLink = {
  id: string;
  label: string;
  ownershipLabel: string;
};

export type PeopleVendorLink = {
  id: string;
  label: string;
  preferred: boolean;
  status: string;
};

export type PeopleLinkedRecords = {
  activeLeaseCount: number;
  activeLease?: PeopleLeaseLink;
  ownerPropertyCount: number;
  ownerProperty?: PeoplePropertyLink;
  vendorProfile?: PeopleVendorLink;
};

export type PeoplePagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type PeopleViewQuery = {
  archiveState: PeopleArchiveState;
  page: number;
  pageSize: number;
  query: string;
  role: PeopleRoleFilter;
  sort: PeopleSortKey;
  status: PeopleStatusFilter;
};

export type PeopleSummary = {
  contact: PeopleContactSummary;
  displayName: string;
  formValues: PeopleFormValues;
  hasUsefulContact: boolean;
  id: string;
  isArchived: boolean;
  legalName?: string | null;
  linked: PeopleLinkedRecords;
  notes?: string | null;
  partyType: PersonPartyType;
  partyTypeLabel: string;
  roles: PersonRoleSummary[];
  roleLabel: string;
  statusLabel: string;
  statusTone: PeopleBadgeTone;
  updatedAt: string;
};

export type PeopleScreenData = {
  pagination: PeoplePagination;
  people: PeopleSummary[];
  schemaNotice?: string;
};
