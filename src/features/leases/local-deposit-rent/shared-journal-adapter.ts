import "server-only";
import { z } from "zod";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { canonicalJournalPayload, sharedJournalPayloadSchema, type SharedDepositJournalPort, type SharedJournalIntent, type SharedJournalPayload, type JournalProof } from "./shared-journal-contract";
const uuid=z.uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/);
const proofSchema=z.strictObject({token:uuid,idempotencyKey:uuid,payloadHash:hash,revision:z.number().int().positive()});
const packetSchema=z.strictObject({scope:z.strictObject({organizationId:uuid,actorId:uuid,leaseId:uuid}),
 selectedScope:z.strictObject({propertyId:uuid,unitId:uuid.nullable()}),token:uuid,idempotencyKey:uuid,payload:sharedJournalPayloadSchema,
 payloadHash:hash,snapshotHash:hash,authorizationHash:hash,expiresAt:z.number().int().positive(),revision:z.number().int().positive(),state:z.enum(["preview","attempted","resolved"]),
 result:z.strictObject({commandId:uuid,message:z.string().min(1).max(300)}).optional()})
 .refine(r=>(r.state==="resolved")===(r.result!==undefined)).refine(r=>r.state!=="preview"||r.revision===1&&r.result===undefined);
export class SharedJournalError extends Error {constructor(public readonly status:401|403|409|503,message:string){super(message);}}
export type SharedJournalSessionDependencies={identity():Promise<{actorId:string;organizationId:string}|null>;client():Promise<LocalDepositClient>};
function checkedPacket(raw:unknown,identity:{actorId:string;organizationId:string},leaseId:string):SharedJournalIntent{
 const text=JSON.stringify(raw);if(!text||new TextEncoder().encode(text).byteLength>16384)throw new SharedJournalError(503,"The original intent could not be verified. Keep its saved details.");
 const r=packetSchema.parse(raw);if(r.scope.actorId!==identity.actorId||r.scope.organizationId!==identity.organizationId||r.scope.leaseId!==leaseId||r.payload.leaseId!==leaseId||canonicalJournalPayload(r.payload).hash!==r.payloadHash)
  throw new SharedJournalError(503,"The original intent could not be verified. Keep its saved details.");
 return Object.freeze({...r,scope:Object.freeze(r.scope),selectedScope:Object.freeze(r.selectedScope),payload:Object.freeze(r.payload),...(r.result?{result:Object.freeze(r.result)}:{})});
}
function rpcError(code?:string):never{
 if(code==="28000"||code==="PGRST301")throw new SharedJournalError(401,"Sign in before retrying the original action.");
 if(code==="42501")throw new SharedJournalError(403,"Current access does not permit the original action. Its saved details remain intact.");
 if(["40001","23514","22023","55000"].includes(code??""))throw new SharedJournalError(409,"The original action needs review or retry with its saved details. No replacement was made.");
 throw new SharedJournalError(503,"The outcome is unconfirmed. Reopen this lease and retry the original action.");
}
// Ordinary-session primitive for isolated transport validation. Not mounted,
// not a Server Action, no flag/credential/service-role fallback.
export function createOrdinarySharedJournalPort(deps:SharedJournalSessionDependencies):SharedDepositJournalPort{
 async function session(leaseId:string){uuid.parse(leaseId);const identity=await deps.identity();if(!identity)throw new SharedJournalError(401,"Sign in before retrying the original action.");uuid.parse(identity.actorId);uuid.parse(identity.organizationId);return {identity,client:await deps.client()};}
 async function call(client:LocalDepositClient,name:string,args:Record<string,unknown>){const r=await client.rpc(name,args);if(r.error)rpcError(r.error.code);return r.data;}
 async function original(name:string,leaseId:string,input:JournalProof){const proof=proofSchema.parse(input),{identity,client}=await session(leaseId);const raw=await call(client,name,{p_org:identity.organizationId,p_lease:leaseId,p_token:proof.token,p_key:proof.idempotencyKey,p_payload_hash:proof.payloadHash,...(name==="begin_deposit_rent_journal_attempt"?{p_revision:proof.revision}:{})});const r=checkedPacket(raw,identity,leaseId);
  if(r.token!==proof.token||r.idempotencyKey!==proof.idempotencyKey||r.payloadHash!==proof.payloadHash||r.state==="preview"||name==="execute_deposit_rent_journal"&&r.state!=="resolved")throw new SharedJournalError(503,"The original outcome could not be verified. Retry its saved key.");return r;}
 return {readCurrent:async leaseId=>{const {identity,client}=await session(leaseId);const raw=await call(client,"get_deposit_rent_journal",{p_org:identity.organizationId,p_lease:leaseId});return raw===null?null:checkedPacket(raw,identity,leaseId);},
  prepare:async(input:SharedJournalPayload)=>{const canonical=canonicalJournalPayload(input),{identity,client}=await session(canonical.payload.leaseId);
   const candidate=await call(client,"get_local_deposit_rent_candidates",{p_organization_id:identity.organizationId,p_lease_id:canonical.payload.leaseId});
   // Candidate guard is independently strict; the journal only accepts its exact
   // database fingerprint. Candidate packet cannot supply actor/org authority.
   const {parseLocalDepositCandidates}=await import("./candidate-reader");const snapshot=parseLocalDepositCandidates(candidate,identity.organizationId,canonical.payload.leaseId);
   if(snapshot.actorId!==identity.actorId)throw new SharedJournalError(403,"The source belongs to a different session.");
   const raw=await call(client,"prepare_deposit_rent_journal",{p_org:identity.organizationId,p_lease:canonical.payload.leaseId,p_payload:canonical.payload,p_expected_snapshot:snapshot.fingerprint});const r=checkedPacket(raw,identity,canonical.payload.leaseId);
   if(r.state!=="preview"||r.revision!==1||r.result!==undefined||r.payloadHash!==canonical.hash||r.selectedScope.propertyId!==snapshot.propertyId||r.selectedScope.unitId!==snapshot.unitId||r.snapshotHash!==snapshot.fingerprint)
    throw new SharedJournalError(503,"The new preview could not be verified. Reopen the lease.");return r;},
  beginAttempt:(leaseId,proof)=>original("begin_deposit_rent_journal_attempt",leaseId,proof),executeOriginal:(leaseId,proof)=>original("execute_deposit_rent_journal",leaseId,proof)};
}
export function createDisabledSharedJournalPort():SharedDepositJournalPort{
 const disabled=async():Promise<never>=>{throw new SharedJournalError(503,"Deposit rent workflow is disabled.");};
 return {readCurrent:disabled,prepare:disabled,beginAttempt:disabled,executeOriginal:disabled};
}
