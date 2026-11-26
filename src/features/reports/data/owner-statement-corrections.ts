import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readAllRowsByIds } from "@/lib/db/read-all-rows";
import type { OwnerStatementLine, OwnerStatementSource } from "./owner-statement-report";

type Source = Pick<OwnerStatementSource, "sourceType" | "sourceLineId" | "sourceFingerprint">;
export type StatementCorrectionSources = ReadonlyMap<string, Source>;
export const statementSourceKey = (source: Source) =>
  `${source.sourceType}:${source.sourceLineId}:${source.sourceFingerprint}`;

/** Resolve only the reversals cited in this owner's frozen or draft movements. */
export async function loadStatementCorrectionSources(client: SupabaseClient<Database>, organizationId: string,
  propertyId: string, lines: OwnerStatementLine[]): Promise<StatementCorrectionSources> {
  const sources = lines.filter(line => line.component === "ips_held_owner_cash" && line.lineKind === "movement")
    .flatMap(line => line.sources.filter(source => source.sourceType === "reversal"));
  const links = new Map<string, Source>();
  if (!sources.length) return links;
  const read = () => client.from("owner_event_allocation_sets")
    .select("id, source_type, source_line_id, source_fingerprint, reversal_of_allocation_set_id")
    .eq("organization_id", organizationId).eq("property_id", propertyId);
  const originals = await readAllRowsByIds(sources.map(source => source.sourceFingerprint), (ids, from, to) =>
    read().eq("source_type", "reversal").in("source_fingerprint", ids).order("id").range(from, to));
  if (originals.error) throw new Error("Could not verify the owner statement movements.");
  const rows = originals.data ?? [];
  const byId = new Map(rows.map(row => [row.id, row]));
  const bySource = new Map(rows.map(row => [statementSourceKey({
    sourceType: row.source_type, sourceLineId: row.source_line_id, sourceFingerprint: row.source_fingerprint,
  }), row]));
  let parents = rows.map(row => row.reversal_of_allocation_set_id).filter((id): id is string => Boolean(id));
  while (parents.length) {
    const missing = parents.filter(id => !byId.has(id));
    if (!missing.length) break;
    const result = await readAllRowsByIds(missing, (ids, from, to) => read().in("id", ids).order("id").range(from, to));
    if (result.error) throw new Error("Could not verify the original owner statement movements.");
    parents = [];
    for (const row of result.data ?? []) {
      byId.set(row.id, row);
      if (row.reversal_of_allocation_set_id) parents.push(row.reversal_of_allocation_set_id);
    }
  }
  for (const source of sources) {
    const key = statementSourceKey(source);
    let row = bySource.get(key);
    const visited = new Set<string>();
    while (row?.source_type === "reversal") {
      if (visited.has(row.id) || !row.reversal_of_allocation_set_id) throw new Error("Invalid owner statement movement history.");
      visited.add(row.id);
      row = byId.get(row.reversal_of_allocation_set_id);
    }
    if (!row) throw new Error("The original owner statement movement is unavailable.");
    links.set(key, { sourceType: row.source_type, sourceLineId: row.source_line_id, sourceFingerprint: row.source_fingerprint });
  }
  return links;
}
