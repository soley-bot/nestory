import "server-only";
import { getCurrentUser,getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { readLocalDepositRentSnapshot,parseLocalDepositCandidates } from "./candidate-reader";
import { createOrdinarySharedJournalSession } from "./shared-journal-session";
import { createSharedJournalWorkflow,createDisabledSharedJournalWorkflow } from "./shared-journal-workflow";
// Product actions use the ordinary session and checked property-scoped readers.
export function createOrdinarySharedJournalModalSession(){return createSharedJournalWorkflow({journal:createOrdinarySharedJournalSession(),readSnapshot:async leaseId=>{
 const user=await getCurrentUser();if(!user)throw Error("Not signed in");const member=await getWorkspaceMembershipForUser(user.id);if(!member)throw Error("Membership denied");
 const client=await createSupabaseServerClient() as unknown as LocalDepositClient;const snapshot=parseLocalDepositCandidates(await readLocalDepositRentSnapshot(client,member.organizationId,leaseId),member.organizationId,leaseId);if(snapshot.actorId!==user.id)throw Error("Actor mismatch");return {snapshot,permissions:[...member.permissionKeys]};}});}
export const createDormantSharedJournalModalSession=createDisabledSharedJournalWorkflow;
