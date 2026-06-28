import type {
  DocumentArchiveState,
  DocumentPagination,
  DocumentViewQuery,
} from "@/features/documents/document.types";

export const DEFAULT_DOCUMENT_PAGE_SIZE = 50;

type DocumentSearchParams = Record<string, string | string[] | undefined>;

export function parseDocumentSearchParams(
  params: DocumentSearchParams,
): DocumentViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    page: parsePositiveInteger(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: parseUuidFilter(params.propertyId),
    query: (getFirstValue(params.query) || "").trim().slice(0, 120),
    unitId: parseUuidFilter(params.unitId),
  };
}

export function buildDocumentPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}): DocumentPagination {
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

function parseArchiveState(
  value: string | string[] | undefined,
): DocumentArchiveState {
  const candidate = getFirstValue(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = parsePositiveInteger(value, DEFAULT_DOCUMENT_PAGE_SIZE);

  return [25, 50, 100].includes(candidate) ? candidate : DEFAULT_DOCUMENT_PAGE_SIZE;
}

function parsePositiveInteger(
  value: string | string[] | undefined,
  fallback: number,
) {
  const parsed = Number.parseInt(getFirstValue(value) ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseUuidFilter(value: string | string[] | undefined) {
  const candidate = getFirstValue(value);

  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : "all";
}

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
