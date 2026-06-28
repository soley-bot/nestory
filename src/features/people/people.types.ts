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

export type PeopleSortKey = "name_asc" | "updated_desc";

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

import type { RecentChange } from "@/features/activity/activity.types";
import type { LinkedDocument } from "@/features/documents/document.types";

export type PeopleLeaseLink = {
  endDate: string;
  href: string;
  id: string;
  label: string;
  ledgerHref: string;
  propertyId: string;
  propertyLabel: string;
  startDate: string;
  status: string;
  timelineHref: string;
  unitId?: string | null;
  unitLabel: string;
};

export type PeoplePropertyLink = {
  href: string;
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
  activeLeases: PeopleLeaseLink[];
  ownerPropertyCount: number;
  ownerProperty?: PeoplePropertyLink;
  ownerProperties: PeoplePropertyLink[];
  vendorProfile?: PeopleVendorLink;
};

export type PeopleRecordCounts = {
  activity: number;
  documents: number;
  leases: number;
  properties: number;
  vendors: number;
};

export type PeopleRiskIndicator = {
  description: string;
  id: string;
  label: string;
  tone: PeopleBadgeTone;
};

export type PeopleDetailHrefs = {
  addLease: string;
  addTimelineEvent: string;
  documents: string;
  ledger: string;
  leases: string;
  people: string;
  timeline: string;
};

export type PeopleNextAction = {
  description: string;
  href: string;
  label: string;
  tone: PeopleBadgeTone;
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
  activity: RecentChange[];
  contact: PeopleContactSummary;
  displayName: string;
  documents: LinkedDocument[];
  formValues: PeopleFormValues;
  hasUsefulContact: boolean;
  hrefs: PeopleDetailHrefs;
  id: string;
  isArchived: boolean;
  legalName?: string | null;
  linked: PeopleLinkedRecords;
  nextAction: PeopleNextAction;
  notes?: string | null;
  partyType: PersonPartyType;
  partyTypeLabel: string;
  recordCounts: PeopleRecordCounts;
  riskIndicators: PeopleRiskIndicator[];
  roles: PersonRoleSummary[];
  roleLabel: string;
  statusLabel: string;
  statusTone: PeopleBadgeTone;
  updatedAt: string;
};

export type PeopleScreenData = {
  pagination: PeoplePagination;
  people: PeopleSummary[];
};
