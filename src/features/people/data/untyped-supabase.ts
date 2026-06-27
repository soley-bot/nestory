import type { createSupabaseServerClient } from "@/lib/db/server";

type QueryError = {
  message: string;
};

export type UntypedQueryResult = {
  count?: number | null;
  data: unknown;
  error: QueryError | null;
};

type QueryOptions = {
  count?: "exact";
  head?: boolean;
};

export type UntypedQueryBuilder = PromiseLike<UntypedQueryResult> & {
  eq(column: string, value: unknown): UntypedQueryBuilder;
  in(column: string, values: readonly unknown[]): UntypedQueryBuilder;
  insert(
    values: Record<string, unknown> | Record<string, unknown>[],
  ): UntypedQueryBuilder;
  is(column: string, value: null): UntypedQueryBuilder;
  limit(count: number): UntypedQueryBuilder;
  maybeSingle(): PromiseLike<UntypedQueryResult>;
  not(column: string, operator: string, value: unknown): UntypedQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): UntypedQueryBuilder;
  select(columns?: string, options?: QueryOptions): UntypedQueryBuilder;
  single(): PromiseLike<UntypedQueryResult>;
  update(values: Record<string, unknown>): UntypedQueryBuilder;
};

export type UntypedSupabaseClient = {
  from(table: string): UntypedQueryBuilder;
};

export function asUntypedSupabase(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): UntypedSupabaseClient {
  return supabase as unknown as UntypedSupabaseClient;
}

export function isMissingPeopleSchemaMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("could not find the table") ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("relation") && normalized.includes("people")
  );
}
