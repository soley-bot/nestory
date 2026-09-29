"use server";

import { requireFinanceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { z } from "zod";

const entry = z.object({ id: z.string(), actor_id: z.string().nullable(), action: z.string(), created_at: z.string(), previous_values: z.unknown(), new_values: z.unknown() });
export async function getExpenseHistory(transactionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(transactionId)) throw new Error("Invalid transaction.");
  const context = await requireFinanceContext();
  const db = await createSupabaseServerClient();
  const result = await db.rpc("get_expense_transaction_history", { p_organization_id: context.organizationId, p_transaction_id: transactionId });
  if (result.error) throw new Error("Could not load change history.");
  const entries = z.array(entry).parse(result.data);
  const actorIds = [...new Set(entries.flatMap(item => item.actor_id ? [item.actor_id] : []))];
  const actors = actorIds.length ? await db.rpc("get_finance_submission_actor_labels", { p_organization_id: context.organizationId, p_user_ids: actorIds }) : { data: [], error: null };
  if (actors.error) throw new Error("Could not load change authors.");
  const labels = new Map((actors.data ?? []).map(actor => [actor.user_id, actor.label]));
  return entries.map(item => ({ ...item, actor: item.actor_id ? labels.get(item.actor_id) ?? "Workspace member" : "System" }));
}
