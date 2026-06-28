import type { createSupabaseServerClient } from "@/lib/db/server";
import { isMissingSchemaObjectMessage } from "@/lib/db/schema-errors";

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
  range(from: number, to: number): UntypedQueryBuilder;
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
  return isMissingSchemaObjectMessage(message, [
    "people",
    "person_roles",
    "person_contacts",
    "lease_parties",
    "property_owners",
    "vendor_profiles",
  ]);
}
