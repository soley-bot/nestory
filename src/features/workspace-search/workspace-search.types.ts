import type { WorkspaceRole } from "@/lib/auth/context";

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
  organizationId: string;
  personId?: string;
  role: WorkspaceRole;
};
