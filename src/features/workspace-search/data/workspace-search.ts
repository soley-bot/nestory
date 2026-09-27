import { createPortfolioSearch } from "@/lib/search/portfolio";
import { loadPortfolioSearch } from "@/lib/search/portfolio.server";
import {
  getWorkspaceSearchScopes,
  type WorkspaceSearchScope,
} from "@/features/workspace-search/workspace-search.scopes";
import {
  WORKSPACE_SEARCH_MIN_QUERY_LENGTH,
  WORKSPACE_SEARCH_RESULT_LIMIT,
  type WorkspaceSearchContext,
  type WorkspaceSearchResult,
  type WorkspaceSearchResultKind,
  type WorkspaceSearchResponse,
} from "@/features/workspace-search/workspace-search.types";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  escapeSearchPattern,
  matchesSearchText,
  normalizeSearchText,
  searchTokens,
} from "@/lib/search/text";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Options = {
  client?: Client;
  context: WorkspaceSearchContext;
  query: string;
};
type Table =
  "properties" | "units" | "people" | "current_leases" | "tasks" | "documents";
type Row = { id: string; [key: string]: string | null };
type Candidate = { result: WorkspaceSearchResult; searchText?: string };
const CANDIDATE_LIMIT = 100;
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
const COLUMNS: Record<Table, string> = {
  properties: "id, name, code, address",
  units: "id, property_id, unit_number, status",
  people:
    "id, display_name, legal_name, primary_email, primary_phone, party_type",
  current_leases: "id, property_id, unit_id, tenant_name, status",
  tasks: "id, title, description, category, status, property_id, unit_id",
  documents: "id, file_name, category, property_id, unit_id",
};

export async function searchWorkspace(
  options: Options,
): Promise<WorkspaceSearchResult[]> {
  return (await searchWorkspaceWithStatus(options)).results;
}

/** Bounded quick lookup. Full register links provide the exhaustive workflow. */
export async function searchWorkspaceWithStatus({
  client,
  context,
  query,
}: Options): Promise<WorkspaceSearchResponse> {
  const normalizedQuery = normalizeWorkspaceSearchQuery(query);
  if (!normalizedQuery) return { results: [], partial: false, limited: false };
  const searchQuery = normalizedQuery;
  const supabase = client ?? (await createSupabaseServerClient());
  const scopes = getWorkspaceSearchScopes(context);
  let limited = false;
  // The longest word narrows candidate retrieval; all words are checked after enrichment.
  const tokens = searchTokens(normalizedQuery);
  const anchor = [...tokens].sort((a, b) => b.length - a.length)[0];
  const cache = new Map<string, Promise<Row[]>>();

  function base(table: Table) {
    let builder = (
      // Supabase exposes separate overloads for views and tables.
      table === "current_leases" ? supabase.from("current_leases") : supabase.from(table)
    )
      .select(COLUMNS[table])
      .eq("organization_id", context.organizationId)
      .is("archived_at", null);
    if (table === "tasks") {
      if (!context.isSuperAdmin && context.branchId)
        builder = builder.filter("branch_id", "eq", context.branchId);
      if (isAssignmentOnly(context))
        builder = builder.filter("assignee_person_id", "eq", context.personId!);
    }
    return builder;
  }

  async function read(builder: ReturnType<typeof base>) {
    const response = await builder.limit(CANDIDATE_LIMIT + 1);
    if (response.error) throw new Error("Could not search records.");
    const rows = (response.data ?? []) as unknown as Row[];
    if (rows.length > CANDIDATE_LIMIT) limited = true;
    return rows.slice(0, CANDIDATE_LIMIT);
  }

  function fields(table: Table, names: string[], term = anchor) {
    const key = `${table}:${names.join(",")}:${term}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        Promise.all(
          names.map(async (name) => {
            const rows = await read(
              base(table)
                .ilike(name, `%${escapeSearchPattern(term)}%`)
                .order(name)
                .order("id"),
            );
            // Exact matches must survive an alphabetical candidate cutoff.
            if (rows.length === CANDIDATE_LIMIT) {
              const exact = await read(
                base(table)
                  .ilike(name, escapeSearchPattern(searchQuery))
                  .order(name)
                  .order("id"),
              );
              return dedupe([...exact, ...rows]);
            }
            return rows;
          }),
        ).then((groups) => dedupe(groups.flat())),
      );
    }
    return cache.get(key)!;
  }

  async function related(table: Table, column: string, ids: string[]) {
    if (!ids.length) return [];
    const uniqueIds = [...new Set(ids)];
    const groups: Promise<Row[]>[] = [];
    // Keep UUID lists below proxy URL limits, including context enrichment.
    for (let index = 0; index < uniqueIds.length; index += 75) {
      groups.push(read(base(table).in(column, uniqueIds.slice(index, index + 75)).order("id")));
    }
    return dedupe((await Promise.all(groups)).flat());
  }

  let portfolioContextUnavailable = false;
  let portfolioPromise: ReturnType<typeof loadPortfolioSearch> | undefined;
  const getPortfolio = () => (portfolioPromise ??= (!scopes.includes("properties") && !scopes.includes("units")) ? Promise.resolve(createPortfolioSearch([], [])) : loadPortfolioSearch(supabase, context.organizationId, true).catch(() => {
    portfolioContextUnavailable = true;
    return createPortfolioSearch([], []);
  }));
  const propertyFields = async (includeUnits = false) => {
    const portfolio = await getPortfolio();
    const ids = portfolio.properties.filter(property => includeUnits
      ? portfolio.matchesProperty(anchor, property.id)
      : matchesSearchText(anchor, portfolio.propertyValues(property.id))).map(property => property.id);
    return dedupe([...(await fields("properties", ["name", "code", "address"])), ...(await related("properties", "id", ids))]);
  };
  async function portfolioRows(table: "tasks" | "documents") {
    const conditions = (await getPortfolio()).conditions(anchor);
    return conditions.length ? read(base(table).or(conditions.join(",")).order("id")) : [];
  }
  async function portfolioText(row: Row) {
    const portfolio = await getPortfolio();
    return [...portfolio.propertyValues(row.property_id ?? ""), ...portfolio.unitValues(row.unit_id ?? "")].join(" ");
  }
  async function unitFields() {
    const term =
      anchor === "unit" || anchor === "units"
        ? (tokens.find((token) => token !== "unit" && token !== "units") ??
          anchor)
        : anchor;
    const [direct, properties] = await Promise.all([
      (async () => {
        const portfolio = await getPortfolio();
        const ids = portfolio.units.filter(unit => matchesSearchText(term, [unit.unit_number])).map(unit => unit.id);
        return dedupe([...(await fields("units", ["unit_number"], term)), ...(await related("units", "id", ids))]);
      })(),
      propertyFields(),
    ]);
    return dedupe([
      ...direct,
      ...(await related(
        "units",
        "property_id",
        properties.map((row) => row.id),
      )),
    ]);
  }
  let unitsPromise: Promise<Row[]> | undefined;
  const getUnits = () => (unitsPromise ??= unitFields());

  async function propertyContext(rows: Row[]) {
    const properties = await related(
      "properties",
      "id",
      rows.flatMap((row) => (row.property_id ? [row.property_id] : [])),
    );
    return new Map(properties.map((property) => [property.id, property]));
  }
  function propertyLabel(property?: Row) {
    return [property?.code, property?.name].filter(Boolean).join(" · ");
  }

  async function searchScope(
    scope: WorkspaceSearchScope,
  ): Promise<Candidate[]> {
    switch (scope) {
      case "properties":
        return Promise.all((await propertyFields(true)).map(async (row) => ({
          result: {
            id: row.id,
            kind: "property",
            label: row.name!,
            meta: [row.code, row.address].filter(Boolean).join(" · "),
            href: `/properties/${row.id}`,
          },
          searchText: [...(await getPortfolio()).propertyValues(row.id), ...(await getPortfolio()).units.filter(unit => unit.property_id === row.id).map(unit => unit.unit_number)].join(" "),
        })));
      case "people":
        return Promise.all(dedupe([
          ...(await fields("people", [
            "display_name",
            "legal_name",
            "primary_email",
            "primary_phone",
          ])),
          ...(await related("people", "id", (await getPortfolio()).ownerIds(anchor))),
        ]).map(async (row) => ({
          result: {
            id: row.id,
            kind: "person",
            label: row.display_name!,
            meta: [
              formatStoredLabel(row.party_type),
              row.primary_email,
              row.primary_phone,
            ]
              .filter(Boolean)
              .join(" · "),
            href: `/people/${row.id}`,
          },
          searchText: `${row.legal_name ?? ""} ${(await getPortfolio()).ownerValues(row.id).join(" ")}`,
        })));
      case "units": {
        const rows = await getUnits();
        const properties = await propertyContext(rows);
        return Promise.all(rows.map(async (row) => ({
          result: {
            id: row.id,
            kind: "unit",
            label: `Unit ${row.unit_number}`,
            meta: [
              propertyLabel(properties.get(row.property_id!)),
              formatStoredLabel(row.status),
            ]
              .filter(Boolean)
              .join(" · "),
            href: `/units/${row.id}`,
          },
          searchText: `${properties.get(row.property_id!)?.address ?? ""} ${await portfolioText(row)}`,
        })));
      }
      case "leases": {
        const [direct, properties, matchingUnits] = await Promise.all([
          fields("current_leases", ["tenant_name"]),
          propertyFields(),
          getUnits(),
        ]);
        const relatedRows = await Promise.all([
          related(
            "current_leases",
            "property_id",
            properties.map((row) => row.id),
          ),
          related(
            "current_leases",
            "unit_id",
            matchingUnits.map((row) => row.id),
          ),
        ]);
        const rows = dedupe([...direct, ...relatedRows.flat()]);
        const [propertyMap, unitRows] = await Promise.all([
          propertyContext(rows),
          related(
            "units",
            "id",
            rows.flatMap((row) => (row.unit_id ? [row.unit_id] : [])),
          ),
        ]);
        const units = new Map(unitRows.map((row) => [row.id, row]));
        return Promise.all(rows.map(async (row) => ({
          result: {
            id: row.id,
            kind: "lease",
            label: row.tenant_name!,
            meta: [
              propertyLabel(propertyMap.get(row.property_id!)),
              units.get(row.unit_id!)?.unit_number
                ? `Unit ${units.get(row.unit_id!)!.unit_number}`
                : null,
              formatStoredLabel(row.status),
            ]
              .filter(Boolean)
              .join(" · "),
            href: `/leases?archiveState=all&leaseId=${encodeURIComponent(row.id)}`,
          },
          searchText: `${propertyMap.get(row.property_id!)?.address ?? ""} ${await portfolioText(row)}`,
        })));
      }
      case "tasks": {
        if (isAssignmentOnly(context) && !context.personId) return [];
        return Promise.all(dedupe([...(await fields("tasks", ["title", "description"])), ...(await portfolioRows("tasks"))]).map(async (row) => ({
          result: {
            id: row.id,
            kind: isAssignmentOnly(context) ? "task" : "maintenance",
            label: row.title!,
            meta: [
              formatStoredLabel(row.status),
              formatStoredLabel(row.category),
            ].join(" · "),
            href: `${isAssignmentOnly(context) ? "/tasks" : "/maintenance"}?archiveState=all&taskId=${encodeURIComponent(row.id)}`,
          },
          searchText: `${row.description ?? ""} ${await portfolioText(row)}`,
        })));
      }
      case "documents":
        return Promise.all(dedupe([...(await fields("documents", ["file_name"])), ...(await portfolioRows("documents"))]).map(async (row) => ({
          result: {
            id: row.id,
            kind: "document",
            label: row.file_name!,
            meta: row.category ?? "",
            href: `/documents?archiveState=all&documentId=${encodeURIComponent(row.id)}`,
          },
          searchText: await portfolioText(row),
        })));
    }
  }

  const groups = await Promise.allSettled(scopes.map(searchScope));
  const failed = groups.filter((group) => group.status === "rejected").length;
  if (scopes.length > 0 && failed === scopes.length)
    throw new Error("Search unavailable");
  const candidates = groups.flatMap((group) =>
    group.status === "fulfilled" ? group.value : [],
  );
  const ranked = rankCandidates(normalizedQuery, candidates);
  // Reserve room for each matching record type before filling the remaining slots.
  // A common property name must not crowd every person or lease out of the preview.
  const counts = new Map<WorkspaceSearchResultKind, number>();
  const reserved = ranked.filter((result) => {
    const count = counts.get(result.kind) ?? 0;
    counts.set(result.kind, count + 1);
    return count < 2;
  });
  const selected = new Set(reserved);
  const results = [
    ...reserved,
    ...ranked.filter((result) => !selected.has(result)),
  ].slice(0, WORKSPACE_SEARCH_RESULT_LIMIT);
  const included = new Set(results);
  return {
    results: ranked.filter((result) => included.has(result)),
    partial: failed > 0 || portfolioContextUnavailable,
    limited: limited || ranked.length > WORKSPACE_SEARCH_RESULT_LIMIT,
  };
}

export function normalizeWorkspaceSearchQuery(query: string) {
  const normalized = query
    .toWellFormed()
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ");
  const points = Array.from(normalized);
  return points.length < WORKSPACE_SEARCH_MIN_QUERY_LENGTH
    ? null
    : points.slice(0, 120).join("");
}

export function rankWorkspaceSearchResults(
  query: string,
  candidates: readonly WorkspaceSearchResult[],
) {
  return rankCandidates(
    query,
    candidates.map((result) => ({ result })),
  ).slice(0, WORKSPACE_SEARCH_RESULT_LIMIT);
}

function rankCandidates(query: string, candidates: readonly Candidate[]) {
  const normalized = normalizeSearchText(query);
  if (!normalizeWorkspaceSearchQuery(normalized)) return [];
  return [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.result.kind}:${candidate.result.id}`,
        candidate,
      ]),
    ).values(),
  ]
    .filter(({ result, searchText }) =>
      matchesSearchText(normalized, [result.label, result.meta, searchText]),
    )
    .map(({ result }) => ({ result, rank: matchRank(result, normalized) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        KIND_ORDER[a.result.kind] - KIND_ORDER[b.result.kind] ||
        compareText(a.result.label, b.result.label) ||
        compareText(a.result.id, b.result.id),
    )
    .map(({ result }) => result);
}

function matchRank(result: WorkspaceSearchResult, query: string) {
  const label = normalizeSearchText(result.label);
  if (label === query || (result.kind === "unit" && label === `unit ${query}`))
    return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(" ").some((word) => word.startsWith(query))) return 2;
  if (label.includes(query)) return 3;
  if (matchesSearchText(query, [label])) return 4;
  return 5;
}
function isAssignmentOnly(context: WorkspaceSearchContext) {
  return (
    !context.isSuperAdmin &&
    context.permissionKeys.has("maintenance.complete") &&
    !context.permissionKeys.has("maintenance.create_assign") &&
    !context.permissionKeys.has("maintenance.review")
  );
}
function dedupe(rows: Row[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
function formatStoredLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function compareText(a: string, b: string) {
  const first = normalizeSearchText(a),
    second = normalizeSearchText(b);
  return first < second ? -1 : first > second ? 1 : 0;
}
