import "server-only";
import { withFinancialIntentReadContext } from "@/lib/finance/financial-write-context.server";
import { getCurrentUser,getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { readLocalDepositRentSnapshot,parseLocalDepositCandidates } from "./candidate-reader";
import { createOrdinarySharedJournalSession } from "./shared-journal-session";
import { createSharedJournalWorkflow,createDisabledSharedJournalWorkflow } from "./shared-journal-workflow";
// Product actions use the ordinary session and checked property-scoped readers.
export function createOrdinarySharedJournalModalSession(financialIntent?: FormData){const workflow=createSharedJournalWorkflow({journal:createOrdinarySharedJournalSession(financialIntent),readSnapshot:async leaseId=>{
 const user=await getCurrentUser();if(!user)throw Error("Not signed in");const member=await getWorkspaceMembershipForUser(user.id);if(!member)throw Error("Membership denied");
 return withFinancialIntentReadContext(member.organizationId, financialIntent, async () => {
 const client=await createSupabaseServerClient(financialIntent) as unknown as LocalDepositClient;const snapshot=parseLocalDepositCandidates(await readLocalDepositRentSnapshot(client,member.organizationId,leaseId),member.organizationId,leaseId);if(snapshot.actorId!==user.id)throw Error("Actor mismatch");return {snapshot,permissions:[...member.permissionKeys]};});}});
 return {...workflow,list:async(leaseId:string)=>{
  try {
   const user=await getCurrentUser();if(!user)throw Error("Not signed in");const member=await getWorkspaceMembershipForUser(user.id);if(!member)throw Error("Membership denied");
   // Keep candidates and the original recovery intent in one verified read.
   // Independently checking each query leaves a reset gap between them.
   return await withFinancialIntentReadContext(member.organizationId,financialIntent,()=>workflow.list(leaseId));
  } catch {return {status:"error" as const,message:"Deposit rent details changed or could not be verified. Reload the lease before continuing."};}
 }};
}
export const createDormantSharedJournalModalSession=createDisabledSharedJournalWorkflow;
