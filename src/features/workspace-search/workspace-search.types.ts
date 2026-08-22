import type { PermissionKey } from "@/lib/auth/permission-catalog";

export const WORKSPACE_SEARCH_RESULT_LIMIT = 20;
export const WORKSPACE_SEARCH_MIN_QUERY_LENGTH = 2;

export type WorkspaceSearchResultKind =
  | "property"
  | "unit"
  | "person"
  | "lease"
  | "maintenance"
  | "task"
  | "document"
  | "action";

export type WorkspaceSearchResult = {
  href: string;
  id: string;
  kind: WorkspaceSearchResultKind;
  label: string;
  meta?: string;
};

export type WorkspaceSearchContext = {
  branchId?: string;
  isSuperAdmin: boolean;
  organizationId: string;
  permissionKeys: ReadonlySet<PermissionKey>;
  personId?: string;
};
