import {
  getWorkspaceSearchActions,
  getWorkspaceSearchScopes,
  type WorkspaceSearchScope,
} from "@/features/workspace-search/workspace-search.scopes";
import {
  WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
  WORKSPACE_SEARCH_RESULT_LIMIT,
  type WorkspaceSearchContext,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
} from "@/features/workspace-search/workspace-search.types";
import { createSupabaseServerClient } from "@/lib/db/server";

type WorkspaceSearchClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SearchWorkspaceOptions = {
  client?: WorkspaceSearchClient;
  context: WorkspaceSearchContext;
  query: string;
};

type WorkspaceSearchCandidate = {
  result: WorkspaceSearchResult;
  searchText?: string;
};

const PER_FIELD_RESULT_LIMIT = WORKSPACE_SEARCH_RESULT_LIMIT;
const MAX_QUERY_LENGTH = 120;

const KIND_ORDER: Record<WorkspaceSearchResultKind, number> = {
  action: 0,
  property: 1,
  unit: 2,
  person: 3,
  lease: 4,
  maintenance: 5,
  task: 6,
  document: 7,
};

export async function searchWorkspace({
  client,
  context,
  query,
}: SearchWorkspaceOptions): Promise<WorkspaceSearchResult[]> {
  const normalizedQuery = normalizeWorkspaceSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const supabase = client ?? (await createSupabaseServerClient());
  const pattern = buildIlikePattern(normalizedQuery);
  const recordSearches = getWorkspaceSearchScopes(context.role).map((scope) =>
    searchWorkspaceScope(scope, supabase, context, pattern),
  );
  const recordGroups = await Promise.all(recordSearches);
  const scopedActions = getWorkspaceSearchActions(context.role);
  const actions = scopedActions.map(
    (action): WorkspaceSearchCandidate => ({
      result: {
        href: action.href,
        id: action.id,
        kind: action.kind,
        label: action.label,
        meta: action.meta,
      },
      searchText: action.keywords.join(" "),
    }),
  );

  return rankWorkspaceSearchCandidates(normalizedQuery, [
    ...actions,
    ...recordGroups.flat(),
  ]);
}

export function normalizeWorkspaceSearchQuery(query: string) {
  const normalized = query
    .toWellFormed()
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ");
  const codePoints = Array.from(normalized);

  if (codePoints.length < WORKSPACE_SEARCH_MIN_QUERY_LENGTH) {
    return null;
  }

  return codePoints.slice(0, MAX_QUERY_LENGTH).join("");
}

export function rankWorkspaceSearchResults(
  query: string,
  candidates: readonly WorkspaceSearchResult[],
): WorkspaceSearchResult[] {
  return rankWorkspaceSearchCandidates(
    query,
    candidates.map((result) => ({ result })),
  );
}

function rankWorkspaceSearchCandidates(
  query: string,
  candidates: readonly WorkspaceSearchCandidate[],
): WorkspaceSearchResult[] {
  const normalizedQuery = normalizeWorkspaceSearchQuery(query)?.toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const uniqueCandidates = [
    ...new Map(
      candidates.map((candidate) => [
        getResultKey(candidate.result),
        candidate,
      ]),
    ).values(),
  ];

  return uniqueCandidates
    .map((candidate) => ({
      rank: getMatchRank(
        candidate.result,
        normalizedQuery,
        candidate.searchText,
      ),
      result: candidate.result,
    }))
    .filter(({ rank }) => rank < Number.POSITIVE_INFINITY)
    .toSorted((first, second) => {
      const rankDifference = first.rank - second.rank;

      if (rankDifference !== 0) {
        return rankDifference;
      }

      const kindDifference =
        KIND_ORDER[first.result.kind] - KIND_ORDER[second.result.kind];

      if (kindDifference !== 0) {
        return kindDifference;
      }

      const labelDifference = compareText(first.result.label, second.result.label);
      return labelDifference !== 0
        ? labelDifference
        : compareText(first.result.id, second.result.id);
    })
    .map(({ result }) => result)
    .slice(0, WORKSPACE_SEARCH_RESULT_LIMIT);
}

function searchWorkspaceScope(
  scope: WorkspaceSearchScope,
  client: WorkspaceSearchClient,
  context: WorkspaceSearchContext,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  switch (scope) {
    case "properties":
      return searchProperties(client, context.organizationId, pattern);
    case "units":
      return searchUnits(client, context.organizationId, pattern);
    case "people":
      return searchPeople(client, context.organizationId, pattern);
    case "leases":
      return searchLeases(client, context.organizationId, pattern);
    case "tasks":
      return searchTasks(client, context, pattern);
    case "documents":
      return searchDocuments(client, context.organizationId, pattern);
    default:
      return assertNever(scope);
  }
}

async function searchProperties(
  client: WorkspaceSearchClient,
  organizationId: string,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  const [nameResult, codeResult] = await Promise.all([
    client
      .from("properties")
      .select("id, organization_id, name, code")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .ilike("name", pattern)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .limit(PER_FIELD_RESULT_LIMIT),
    client
      .from("properties")
      .select("id, organization_id, name, code")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .ilike("code", pattern)
      .order("code", { ascending: true })
      .order("id", { ascending: true })
      .limit(PER_FIELD_RESULT_LIMIT),
  ]);

  assertSearchSucceeded("properties", nameResult.error, codeResult.error);

  return dedupeRows([...(nameResult.data ?? []), ...(codeResult.data ?? [])]).map(
    (property) => ({
      result: {
        href: `/properties/${property.id}`,
        id: property.id,
        kind: "property",
        label: property.name,
        meta: property.code,
      },
    }),
  );
}

async function searchUnits(
  client: WorkspaceSearchClient,
  organizationId: string,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  const result = await client
    .from("units")
    .select("id, organization_id, unit_number, status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .ilike("unit_number", pattern)
    .order("unit_number", { ascending: true })
    .order("id", { ascending: true })
    .limit(PER_FIELD_RESULT_LIMIT);

  assertSearchSucceeded("units", result.error);

  return (result.data ?? []).map((unit) => ({
    result: {
      href: `/units/${unit.id}`,
      id: unit.id,
      kind: "unit",
      label: `Unit ${unit.unit_number}`,
      meta: formatStoredLabel(unit.status),
    },
  }));
}

async function searchPeople(
  client: WorkspaceSearchClient,
  organizationId: string,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  const result = await client
    .from("people")
    .select("id, organization_id, display_name, party_type")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .ilike("display_name", pattern)
    .order("display_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(PER_FIELD_RESULT_LIMIT);

  assertSearchSucceeded("people", result.error);

  return (result.data ?? []).map((person) => ({
    result: {
      href: `/people/${person.id}`,
      id: person.id,
      kind: "person",
      label: person.display_name,
      meta: formatStoredLabel(person.party_type),
    },
  }));
}

async function searchLeases(
  client: WorkspaceSearchClient,
  organizationId: string,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  const result = await client
    .from("leases")
    .select("id, organization_id, tenant_name, status")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .ilike("tenant_name", pattern)
    .order("tenant_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(PER_FIELD_RESULT_LIMIT);

  assertSearchSucceeded("leases", result.error);

  return (result.data ?? []).map((lease) => ({
    result: {
      href: `/leases?archiveState=all&leaseId=${encodeURIComponent(lease.id)}`,
      id: lease.id,
      kind: "lease",
      label: lease.tenant_name,
      meta: formatStoredLabel(lease.status),
    },
  }));
}

async function searchTasks(
  client: WorkspaceSearchClient,
  context: WorkspaceSearchContext,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  if (context.role === "member" && !context.personId) {
    return [];
  }

  const [titleResult, descriptionResult] = await Promise.all([
    createTaskSearchQuery(client, context, "title", pattern),
    createTaskSearchQuery(client, context, "description", pattern),
  ]);

  assertSearchSucceeded("tasks", titleResult.error, descriptionResult.error);

  return dedupeRows([...(titleResult.data ?? []), ...(descriptionResult.data ?? [])]).map(
    (task) => ({
      result: {
        href: buildTaskHref(context.role, task.id),
        id: task.id,
        kind: context.role === "member" ? "task" : "maintenance",
        label: task.title,
        meta: [formatStoredLabel(task.status), formatStoredLabel(task.category)].join(
          " · ",
        ),
      },
      searchText: task.description ?? "",
    }),
  );
}

function createTaskSearchQuery(
  client: WorkspaceSearchClient,
  context: WorkspaceSearchContext,
  field: "description" | "title",
  pattern: string,
) {
  let query = client
    .from("tasks")
    .select("id, organization_id, title, description, category, status")
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .ilike(field, pattern);

  if (context.role === "manager" && context.branchId) {
    query = query.eq("branch_id", context.branchId);
  }

  if (context.role === "member") {
    query = query.eq("assignee_person_id", context.personId!);
    query = context.branchId
      ? query.eq("branch_id", context.branchId)
      : query.is("branch_id", null);
  }

  return query
    .order(field, { ascending: true })
    .order("id", { ascending: true })
    .limit(PER_FIELD_RESULT_LIMIT);
}

async function searchDocuments(
  client: WorkspaceSearchClient,
  organizationId: string,
  pattern: string,
): Promise<WorkspaceSearchCandidate[]> {
  const result = await client
    .from("documents")
    .select("id, organization_id, file_name, category")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .ilike("file_name", pattern)
    .order("file_name", { ascending: true })
    .order("id", { ascending: true })
    .limit(PER_FIELD_RESULT_LIMIT);

  assertSearchSucceeded("documents", result.error);

  return (result.data ?? []).map((document) => ({
    result: {
      href: `/documents?archiveState=all&documentId=${encodeURIComponent(document.id)}`,
      id: document.id,
      kind: "document",
      label: document.file_name,
      meta: document.category,
    },
  }));
}

function buildIlikePattern(query: string) {
  const escaped = query
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");

  return `%${escaped}%`;
}

function getMatchRank(
  result: WorkspaceSearchResult,
  query: string,
  additionalSearchText = "",
) {
  const label = result.label.toLowerCase();
  const meta = result.meta?.toLowerCase() ?? "";

  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (label.includes(query)) return 3;
  if (meta.startsWith(query)) return 4;
  if (meta.includes(query)) return 5;
  if (additionalSearchText.toLowerCase().includes(query)) return 6;

  return Number.POSITIVE_INFINITY;
}

function buildTaskHref(role: WorkspaceSearchContext["role"], taskId: string) {
  const route = role === "member" ? "/tasks" : "/maintenance";
  return `${route}?archiveState=all&taskId=${encodeURIComponent(taskId)}`;
}

function dedupeRows<T extends { id: string }>(rows: readonly T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function getResultKey(result: Pick<WorkspaceSearchResult, "id" | "kind">) {
  return `${result.kind}:${result.id}`;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported workspace search scope: ${String(value)}`);
}

function assertSearchSucceeded(
  scope: string,
  ...errors: Array<{ message: string } | null>
) {
  const error = errors.find(Boolean);

  if (error) {
    throw new Error(`Could not search ${scope}.`);
  }
}

function formatStoredLabel(value: string) {
  return value
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function compareText(first: string, second: string) {
  const normalizedFirst = first.toLocaleLowerCase();
  const normalizedSecond = second.toLocaleLowerCase();

  if (normalizedFirst < normalizedSecond) return -1;
  if (normalizedFirst > normalizedSecond) return 1;
  return 0;
}
