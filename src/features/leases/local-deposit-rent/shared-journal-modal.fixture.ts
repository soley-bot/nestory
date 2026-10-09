import { vi } from "vitest";
import { fixture,ids,id } from "./workflow.test-fixture";
import { createJournalPreview,replaceJournalPreview,beginJournalAttempt,resolveJournalAttempt,type SharedJournalIntent,type SharedDepositJournalPort } from "./shared-journal-contract";
import { SharedJournalError } from "./shared-journal-adapter";
import { createSharedJournalWorkflow } from "./shared-journal-workflow";
// Synthetic shared service + existing approved executable command model.
// No SQL/Auth/disk durability claim. Real modal controls use these actual actions.
export function sharedModalFixture(custodian:"ips"|"owner"="ips"){
 const h=fixture(custodian),scope={organizationId:ids.org,actorId:ids.actor,leaseId:ids.lease},selectedScope={propertyId:ids.property,unitId:ids.unit};
 const authority={scope,selectedScope,authorizationHash:"a".repeat(64),allowed:true};let current:SharedJournalIntent|null=null,index=800;
 const control={businessConflict:false,outage:false,lostBeforeExecute:false,lostAfterCommit:false};
 const port:SharedDepositJournalPort={readCurrent:vi.fn(async()=>{if(control.outage)throw new SharedJournalError(503,"Store unavailable");return current;}),
 prepare:vi.fn(async payload=>{if(control.outage)throw new SharedJournalError(503,"Store unavailable");const next=createJournalPreview({scope,selectedScope,token:id(index++),idempotencyKey:id(index++),payload,snapshotHash:h.snapshot().fingerprint,authorizationHash:authority.authorizationHash,expiresAt:Date.now()+300000});current=replaceJournalPreview(current,next,authority);return current;}),
 beginAttempt:vi.fn(async(_lease,proof)=>{if(control.businessConflict)throw new SharedJournalError(409,"Unused preview stale");if(!current)throw Error("No intent");current=beginJournalAttempt(current,proof,authority,h.snapshot().fingerprint,Date.now());return current;}),
 executeOriginal:vi.fn(async(_lease,proof)=>{if(control.outage||control.lostBeforeExecute)throw new SharedJournalError(503,"Original unknown");if(!current)throw Error("No intent");if(current.state==="resolved")return current;
 const d=current.payload;const result=await h.rpc(d.operation==="apply"?"apply_deposit_to_rent":"reverse_deposit_rent_application",d.operation==="apply"?{p_org:ids.org,p_deposit:d.depositId,p_invoice:d.invoiceId,p_date:d.date,p_allocations:[{lineId:d.lineId,amount:d.amount}],p_reason:d.reason,p_key:current.idempotencyKey}:{p_org:ids.org,p_original:d.applicationId,p_date:d.date,p_reason:d.reason,p_key:current.idempotencyKey});
 if(result.error)throw new SharedJournalError(409,"Checked command denied");current=resolveJournalAttempt(current,proof,authority,{commandId:result.data as string,message:d.operation==="apply"?"Deposit applied to rent. No new bank payment was recorded.":"The full deposit application was reversed. No new bank payment was recorded."});
 if(control.lostAfterCommit){control.lostAfterCommit=false;throw new SharedJournalError(503,"Lost response after simulated commit");}return current;})};
 const actions=createSharedJournalWorkflow({journal:port,readSnapshot:async()=>{if(control.outage)throw new SharedJournalError(503,"Source unavailable");return {snapshot:h.snapshot(),permissions:h.control.permissions};}});
 return {h,control,port,actions,current:()=>current};
}
