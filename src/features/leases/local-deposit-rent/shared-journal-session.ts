import "server-only";
import { getCurrentUser,getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { createOrdinarySharedJournalPort,createDisabledSharedJournalPort } from "./shared-journal-adapter";
// Unmounted ordinary-session factory for the approved isolated HTTP harness.
// User is validated through the existing Auth context; client uses actual SSR
// cookies and existing tenant options. No supplied actor/org or service client.
export function createOrdinarySharedJournalSession(){
 return createOrdinarySharedJournalPort({identity:async()=>{const user=await getCurrentUser();if(!user)return null;
  const membership=await getWorkspaceMembershipForUser(user.id);return membership?{actorId:user.id,organizationId:membership.organizationId}:null;},
 client:async()=>await createSupabaseServerClient() as unknown as LocalDepositClient});
}
// Production-facing factory remains disabled, independent of environment/query.
// No route/action/modal is installed by this file.
export const createDormantSharedJournalSession=createDisabledSharedJournalPort;
