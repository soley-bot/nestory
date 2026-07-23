export type PropertyArchiveState = "active" | "archived" | "all";

export type PropertySortKey =
  | "code_asc"
  | "name_asc"
  | "status_asc"
  | "net_asc"
  | "net_desc";

export type PropertyStatusValue = "active" | "under_renovation" | "inactive";

export type PropertyOwnerStatusFilter = "missing" | "all";

export type PropertyNetStatusFilter = "negative" | "all";

export type PropertyReviewFilter =
  | "all"
  | "missing_address"
  | "missing_photos"
  | "needs_units";

export type PropertyDisplayMode = "table" | "cards";

export type PropertyBadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type PropertyFormValues = {
  acquisitionDate?: string | null;
  address?: string | null;
  code: string;
  name: string;
  notes?: string | null;
  owner?: string | null;
  ownerPersonId?: string | null;
  propertyType: string;
  status: PropertyStatusValue;
};

export type PropertyOwnerOption = PersonSelectOption;

export type PropertyPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type PropertyViewQuery = {
  archiveState: PropertyArchiveState;
  netStatus: PropertyNetStatusFilter;
  page: number;
  pageSize: number;
  ownerStatus: PropertyOwnerStatusFilter;
  query: string;
  review: PropertyReviewFilter;
  sort: PropertySortKey;
  status: PropertyStatusValue | "all";
};
import type { PersonSelectOption } from "@/features/people/person-select";
