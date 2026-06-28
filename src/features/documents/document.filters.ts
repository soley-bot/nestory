import type {
  DocumentArchiveState,
  DocumentPagination,
  DocumentViewQuery,
} from "@/features/documents/document.types";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  getUuidOrAllSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

export const DEFAULT_DOCUMENT_PAGE_SIZE = 50;

type DocumentSearchParams = Record<string, SearchParamValue>;

export function parseDocumentSearchParams(
  params: DocumentSearchParams,
): DocumentViewQuery {
  return {
    archiveState: parseArchiveState(params.archiveState),
    page: getPositiveIntegerSearchParam(params.page, 1),
    pageSize: parsePageSize(params.pageSize),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    query: getTrimmedSearchParam(params.query),
    taskId: getUuidOrAllSearchParam(params.taskId),
    unitId: getUuidOrAllSearchParam(params.unitId),
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
  const candidate = getFirstSearchParam(value);

  return candidate === "archived" || candidate === "all" ? candidate : "active";
}

function parsePageSize(value: string | string[] | undefined) {
  const candidate = getPositiveIntegerSearchParam(value, DEFAULT_DOCUMENT_PAGE_SIZE);

  return [25, 50, 100].includes(candidate) ? candidate : DEFAULT_DOCUMENT_PAGE_SIZE;
}
