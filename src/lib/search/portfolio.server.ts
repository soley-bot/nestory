import type { createSupabaseServerClient } from "@/lib/db/server";
import { createPortfolioSearch, type PortfolioUnit } from "./portfolio";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const PAGE_SIZE = 500;
const MAX_ROWS = 10000;

/** Read through the caller's RLS-scoped client. Never use a service-role client. */
export async function loadPortfolioSearch(client: Client, organizationId: string, activeOnly = false) {
  async function read(table: "properties" | "units" | "property_owners", select: string) {
    const rows: unknown[] = [];
    for (let from = 0; from <= MAX_ROWS; from += PAGE_SIZE) {
      let query = client.from(table).select(select).eq("organization_id", organizationId).order("id");
      if (activeOnly) query = query.is("archived_at", null);
      if (table === "property_owners") query = query.is("archived_at", null).is("ended_on", null);
      const result = await query.range(from, from + PAGE_SIZE - 1);
      if (result.error) throw new Error("Could not load property, unit and owner search context.");
      const batch = result.data ?? [];
      rows.push(...batch);
      if (rows.length > MAX_ROWS) throw new Error("Search scope is too large. Narrow the portfolio before searching.");
      if (batch.length < PAGE_SIZE) return rows;
    }
    return rows;
  }
  const [properties, units, owners] = await Promise.all([
    read("properties", "id, code, name, owner"),
    read("units", "id, property_id, unit_number"),
    read("property_owners", "id, property_id, person_id, person:people!property_owners_person_fk(display_name, legal_name)"),
  ]);
  const names = new Map<string, string[]>();
  const ownerIds = new Map<string, string[]>();
  for (const owner of owners as { person_id: string; property_id: string; person: {display_name: string; legal_name: string | null} | {display_name: string; legal_name: string | null}[] | null }[]) {
    ownerIds.set(owner.property_id, [...(ownerIds.get(owner.property_id) ?? []), owner.person_id]);
    const people = Array.isArray(owner.person) ? owner.person : owner.person ? [owner.person] : [];
    names.set(owner.property_id, [...(names.get(owner.property_id) ?? []), ...people.flatMap(p => [p.display_name, p.legal_name ?? ""])]);
  }
  return createPortfolioSearch(
    (properties as {id: string; code: string; name: string; owner: string | null}[]).map(p => ({...p, ownerPersonIds: ownerIds.get(p.id) ?? [], ownerNames: names.get(p.id) ?? (p.owner ? [p.owner] : [])})),
    units as PortfolioUnit[],
  );
}
