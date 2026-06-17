export type PropertyArchiveState = "active" | "archived" | "all";

export type PropertySortKey = "code_asc" | "name_asc" | "status_asc" | "net_desc";

export type PropertyStatusValue = "active" | "under_renovation" | "inactive";

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
  propertyType: string;
  status: PropertyStatusValue;
};

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
  page: number;
  pageSize: number;
  query: string;
  sort: PropertySortKey;
  status: PropertyStatusValue | "all";
};
