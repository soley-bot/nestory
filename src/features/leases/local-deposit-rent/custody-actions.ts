"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { readLocalDepositRentSnapshot } from "./candidate-reader";

async function custodyContext(leaseId: string) {
  z.uuid().parse(leaseId);
  const user = await getCurrentUser();
  const member = user ? await getWorkspaceMembershipForUser(user.id) : null;
  if (!user || !member || !( ["leases.view", "finance.view", "leases.change_terms", "finance.correct_records"] as const).every(p => member.permissionKeys.has(p))) throw Error("Forbidden");
  const client = await createSupabaseServerClient();
  const snapshot = await readLocalDepositRentSnapshot(client as unknown as LocalDepositClient, member.organizationId, leaseId);
  if (snapshot.actorId !== user.id) throw Error("Actor mismatch");
  return { client, member, snapshot };
}

export async function getDepositCustodyOptions(leaseId: string) {
  try {
    const { client, member, snapshot } = await custodyContext(leaseId);
    const finance = await loadScopedFinanceContext(client, member.organizationId, snapshot.propertyId);
    const owners = finance.owner_assignments.filter(row => row.property_id === snapshot.propertyId && !row.archived_at)
      .flatMap(row => {
        const person = finance.people.find(person => person.id === row.person_id && !person.archived_at);
        return person ? [{ id: person.id, label: person.display_name, from: row.started_on, to: row.ended_on }] : [];
      });
    return { status: "success" as const, businessDate: snapshot.businessDate, owners,
      deposits: snapshot.deposits.filter(row => !row.archived && !row.custodyVerified).map(row => ({ id: row.id, label: row.label, held: row.held })) };
  } catch {
    return { status: "error" as const, message: "Deposit custody details could not be loaded. Check your access and reload the lease." };
  }
}

const custodySchema = z.strictObject({
  leaseId: z.uuid(), depositId: z.uuid(), liabilityAccountId: z.uuid(),
  custodian: z.enum(["ips", "owner"]), ownerId: z.uuid().nullable(), date: z.iso.date(),
  held: z.string().regex(/^\d{1,12}\.\d{2}$/), evidence: z.string().trim().min(8).max(200), key: z.uuid(),
}).refine(value => (value.custodian === "owner") === (value.ownerId !== null));

export async function confirmDepositCustody(input: z.infer<typeof custodySchema>) {
  try {
    const value = custodySchema.parse(input);
    const { client, member, snapshot } = await custodyContext(value.leaseId);
    if (!snapshot.deposits.some(row => row.id === value.depositId)) throw Error("Deposit scope changed");
    const result = await (client as unknown as LocalDepositClient).rpc("confirm_deposit_rent_custody", {
      p_org: member.organizationId, p_deposit: value.depositId, p_liability_account: value.liabilityAccountId,
      p_custodian: value.custodian, p_owner: value.ownerId, p_date: value.date,
      p_expected_held: Number(value.held), p_evidence: value.evidence, p_key: value.key,
    });
    if (result.error) throw Error("Custody confirmation rejected");
    for (const path of ["/leases", "/balances", "/reports", "/timeline"]) revalidatePath(path);
    return { status: "success" as const, message: "Deposit custody confirmed." };
  } catch {
    return { status: "error" as const, message: "Custody could not be confirmed. Retry the original details, or close and review the deposit history and evidence before starting again." };
  }
}
