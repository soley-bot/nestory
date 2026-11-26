import { createSupabaseServerClient } from "@/lib/db/server";
import { readCompleteRows } from "@/lib/db/complete-read";
import {
  buildPeopleAttentionQueuesFromCounts,
  type PeopleInsights,
} from "@/features/people/people.insights";
import type { PersonRoleValue } from "@/features/people/people.types";

const INSIGHT_PAGE_SIZE = 200;
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type InsightTable = "people" | "person_contacts" | "person_roles" | "vendor_profiles";
type UnknownRecord = Record<string, unknown>;

// The header displays contact, role and vendor queues only. Keep full relationship
// and evidence calculations in the report path, and never serialize source rows.
export async function getPeopleAttentionData(
  organizationId: string,
): Promise<Pick<PeopleInsights, "attentionQueues">> {
  const supabase = await createSupabaseServerClient();
  const [peopleRows, roleRows, contactRows, vendorRows] = await Promise.all([
    getPagedInsightRows(supabase, organizationId, "people", "id, primary_email, primary_phone"),
    getPagedInsightRows(supabase, organizationId, "person_roles", "id, person_id, role"),
    getPagedInsightRows(supabase, organizationId, "person_contacts", "id, person_id, email, phone"),
    getPagedInsightRows(supabase, organizationId, "vendor_profiles", "id, person_id"),
  ]);

  const activePersonIds = new Set(peopleRows.map(row => readString(row, "id")!));
  const usefulContactIds = new Set<string>();
  const peopleWithRoles = new Set<string>();
  const vendors = new Set<string>();
  const vendorProfileIds = new Set(vendorRows.map(row => readString(row, "person_id")));

  for (const row of peopleRows) {
    if (hasUsefulValue(row.primary_email) || hasUsefulValue(row.primary_phone)) {
      usefulContactIds.add(readString(row, "id")!);
    }
  }
  for (const row of contactRows) {
    const personId = readString(row, "person_id");
    if (personId && activePersonIds.has(personId) && (hasUsefulValue(row.email) || hasUsefulValue(row.phone))) {
      usefulContactIds.add(personId);
    }
  }
  for (const row of roleRows) {
    const personId = readString(row, "person_id");
    const role = readRole(row.role);
    if (personId && role && activePersonIds.has(personId)) {
      peopleWithRoles.add(personId);
      if (role === "vendor") vendors.add(personId);
    }
  }
  let vendorReviewCount = 0;
  for (const personId of vendors) {
    if (!usefulContactIds.has(personId) || !vendorProfileIds.has(personId)) {
      vendorReviewCount += 1;
    }
  }

  return {
    attentionQueues: buildPeopleAttentionQueuesFromCounts({
      missingContactCount: activePersonIds.size - usefulContactIds.size,
      missingRoleCount: activePersonIds.size - peopleWithRoles.size,
      vendorReviewCount,
    }),
  };
}

function getPagedInsightRows(
  supabase: SupabaseServerClient,
  organizationId: string,
  table: InsightTable,
  columns: string,
) {
  return readCompleteRows<UnknownRecord>({
    context: `Could not load people insights from ${table}`,
    pageSize: INSIGHT_PAGE_SIZE,
    getRowId: row => readString(row, "id") ?? "",
    compareRows: (previous, current) => String(previous.id).localeCompare(String(current.id)),
    readPage: (from, to) => {
      const query = table === "person_roles"
        ? supabase.from("person_roles").select(columns, { count: "exact" }).eq("status", "active")
        : supabase.from(table).select(columns, { count: "exact" });
      return query.eq("organization_id", organizationId).is("archived_at", null)
        .order("id", { ascending: true }).range(from, to).returns<UnknownRecord[]>();
    },
  });
}

function readRole(value: unknown): PersonRoleValue | null {
  return value === "tenant" || value === "owner" || value === "vendor" || value === "staff" ? value : null;
}

function hasUsefulValue(value: unknown) {
  return typeof value === "string" && Boolean(value.trim());
}

function readString(row: UnknownRecord, key: string) {
  const value = row?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
