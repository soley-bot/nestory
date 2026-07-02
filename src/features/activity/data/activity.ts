import { toRecentChange } from "@/features/activity/recent-changes";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  getFirstSearchParam,
  getPositiveIntegerSearchParam,
  getTrimmedSearchParam,
  type SearchParamValue,
} from "@/lib/validation/search-params";

const ACTIVITY_PAGE_SIZE = 50;

type ActivitySearchParams = Record<string, SearchParamValue>;

export type ActivityViewQuery = {
  action: string;
  entityType: string;
  page: number;
};

export async function getActivityScreenData(
  organizationId: string,
  viewQuery: ActivityViewQuery,
) {
  const supabase = await createSupabaseServerClient();
  const from = (viewQuery.page - 1) * ACTIVITY_PAGE_SIZE;
  const to = from + ACTIVITY_PAGE_SIZE - 1;
  let query = supabase
    .from("activity_logs")
    .select(
      "id, action, entity_id, entity_type, previous_values, new_values, created_at",
      { count: "exact" },
    )
    .eq("organization_id", organizationId);

  if (viewQuery.entityType) {
    query = query.eq("entity_type", viewQuery.entityType);
  }

  if (viewQuery.action) {
    query = query.eq("action", viewQuery.action);
  }

  const { count, data, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Could not load activity log: ${error.message}`);
  }

  return {
    changes: (data ?? []).map(toRecentChange),
    pagination: {
      from: count === 0 ? 0 : from + 1,
      hasNext: (count ?? 0) > to + 1,
      hasPrevious: viewQuery.page > 1,
      page: viewQuery.page,
      to: Math.min(to + 1, count ?? 0),
      totalCount: count ?? 0,
    },
  };
}

export function parseActivitySearchParams(
  params: ActivitySearchParams,
): ActivityViewQuery {
  return {
    action: normalizeFilter(params.action),
    entityType: normalizeFilter(params.entityType),
    page: getPositiveIntegerSearchParam(params.page, 1),
  };
}

function normalizeFilter(value: SearchParamValue) {
  const candidate = getTrimmedSearchParam(value);

  if (!candidate) {
    return "";
  }

  return getFirstSearchParam(candidate)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}
