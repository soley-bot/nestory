export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const SUMMARY_ROW_LIMIT = 1000;

export type ArchiveState = "active" | "archived" | "all";

export type PaginationMeta = {
  from: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  page: number;
  pageCount: number;
  pageSize: number;
  to: number;
  totalCount: number;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeArchiveState(
  value: ArchiveState | string | undefined,
): ArchiveState {
  return value === "archived" || value === "all" ? value : "active";
}

export function normalizePage(value: number | undefined) {
  if (!Number.isFinite(value) || value === undefined) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

export function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || value === undefined) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.floor(value)));
}

export function normalizeSearchQuery(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
}

export function normalizeUuidFilter(value: string | undefined) {
  return value && uuidPattern.test(value) ? value : "all";
}

export function getQueryTokens(query: string) {
  return query
    .replace(/[,%()*]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
}

export function buildPostgrestIlikeOrFilters(
  columns: string[],
  query: string,
) {
  return getQueryTokens(query).map((token) =>
    columns
      .map((column) => `${column}.ilike.%${escapePostgrestIlikeToken(token)}%`)
      .join(","),
  );
}

function escapePostgrestIlikeToken(token: string) {
  return token.replace(/\\/g, "\\\\").replace(/_/g, "\\_");
}

export function getPageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;

  return {
    from,
    to: from + pageSize - 1,
  };
}

export function buildPaginationMeta({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): PaginationMeta {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const { from, to } = getPageRange(page, pageSize);

  return {
    from,
    hasNextPage: page < pageCount,
    hasPreviousPage: page > 1,
    page,
    pageCount,
    pageSize,
    to: Math.min(to, Math.max(0, totalCount - 1)),
    totalCount,
  };
}

export function textMatchesToken(value: string | null | undefined, token: string) {
  return value?.toLowerCase().includes(token) ?? false;
}
