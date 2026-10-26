import "server-only";
import { getCurrentUser,getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { withFinancialIntentReadContext } from "@/lib/finance/financial-write-context.server";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { createOrdinarySharedJournalPort,createDisabledSharedJournalPort,SharedJournalError } from "./shared-journal-adapter";
// Unmounted ordinary-session factory for the approved isolated HTTP harness.
// User is validated through the existing Auth context; client uses actual SSR
// cookies and existing tenant options. No supplied actor/org or service client.
export function createOrdinarySharedJournalSession(financialIntent?: FormData){
 const identity=async()=>{const user=await getCurrentUser();if(!user)return null;
  const membership=await getWorkspaceMembershipForUser(user.id);return membership?{actorId:user.id,organizationId:membership.organizationId}:null;};
 const journal=createOrdinarySharedJournalPort({identity,
 client:async()=>await createSupabaseServerClient(financialIntent) as unknown as LocalDepositClient});
 return {...journal,readCurrent:async(leaseId:string)=>{
  const member=await identity();if(!member)throw new SharedJournalError(401,"Sign in before retrying the original action.");
  return withFinancialIntentReadContext(member.organizationId,financialIntent,()=>journal.readCurrent(leaseId));
 }};
}
// Production-facing factory remains disabled, independent of environment/query.
// No route/action/modal is installed by this file.
export const createDormantSharedJournalSession=createDisabledSharedJournalPort;
