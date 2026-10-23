import type { createSupabaseServerClient } from "@/lib/db/server";
import { readCompleteRows } from "@/lib/db/complete-read";
import { createPortfolioSearch, type PortfolioUnit } from "./portfolio";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SearchProperty = { id: string; code: string; name: string; owner: string | null };
type SearchOwner = {
  id: string;
  person_id: string;
  property_id: string;
  person: { display_name: string; legal_name: string | null } | { display_name: string; legal_name: string | null }[] | null;
};

/** Read through the caller's RLS-scoped client. Never use a service-role client. */
export async function loadPortfolioSearch(client: Client, organizationId: string, activeOnly = false) {
  async function read<T extends { id: string }>(table: "properties" | "units" | "property_owners", select: string) {
    return readCompleteRows<T>({
      context: "Could not load property, unit and owner search context",
      getRowId: row => row.id,
      compareRows: (previous, current) => previous.id.localeCompare(current.id),
      readPage: (from, to) => {
        let query = client.from(table).select(select, { count: "exact" }).eq("organization_id", organizationId).order("id");
        if (activeOnly) query = query.is("archived_at", null);
        if (table === "property_owners") query = query.is("archived_at", null).is("ended_on", null);
        return query.range(from, to).returns<T[]>();
      },
    });
  }
  const [properties, units, owners] = await Promise.all([
    read<SearchProperty>("properties", "id, code, name, owner"),
    read<PortfolioUnit>("units", "id, property_id, unit_number"),
    read<SearchOwner>("property_owners", "id, property_id, person_id, person:people!property_owners_person_fk(display_name, legal_name)"),
  ]);
  const names = new Map<string, string[]>();
  const ownerIds = new Map<string, string[]>();
  for (const owner of owners) {
    ownerIds.set(owner.property_id, [...(ownerIds.get(owner.property_id) ?? []), owner.person_id]);
    const people = Array.isArray(owner.person) ? owner.person : owner.person ? [owner.person] : [];
    names.set(owner.property_id, [...(names.get(owner.property_id) ?? []), ...people.flatMap(p => [p.display_name, p.legal_name ?? ""])]);
  }
  return createPortfolioSearch(
    properties.map(p => ({...p, ownerPersonIds: ownerIds.get(p.id) ?? [], ownerNames: names.get(p.id) ?? (p.owner ? [p.owner] : [])})),
    units,
  );
}
