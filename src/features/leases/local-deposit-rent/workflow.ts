import "server-only";
import { createHash,randomUUID } from "node:crypto";
import { z } from "zod";
import { loadScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { loadScopedLeaseContext } from "@/features/leases/data/scoped-lease-context";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { parseLocalDepositCandidates,sameCandidateIds,type LocalDepositRentSnapshot } from "./candidate-reader";
import type { LocalDepositIntent,LocalDepositIntentStore } from "./intent-store";
import type { DepositRentLocalActions,DepositRentResult } from "./contracts";
export type {LocalDepositRentSnapshot} from "./candidate-reader";
export const LOCAL_DEPOSIT_RENT_WORKFLOW_ENABLED=false;
const uuid=z.uuid(),money=z.string().regex(/^\d{1,12}\.\d{2}$/);
export type LocalDepositRentIdentity={actorId:string;organizationId:string;authorizationKey:string;permissions:readonly string[]};
export type LocalDepositRentDependencies={identity():Promise<LocalDepositRentIdentity|null>;client():Promise<LocalDepositClient>;
  readSnapshot(client:LocalDepositClient,organizationId:string,leaseId:string):Promise<unknown>;intentStore:LocalDepositIntentStore;now?():number};
const cents=(value:string)=>BigInt(value.replace(".",""));
const decimal=(value:bigint)=>`${value<BigInt(0)?"-":""}${(value<BigInt(0)?-value:value)/BigInt(100)}.${String((value<BigInt(0)?-value:value)%BigInt(100)).padStart(2,"0")}`;
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
class WorkflowError extends Error {}
function fail(message:string):never{throw new WorkflowError(message);}
const permission=(op:"apply"|"reverse")=>op==="apply"?"finance.record_payments":"finance.correct_records";
const allowed=(identity:LocalDepositRentIdentity,op:"apply"|"reverse")=>["leases.view","finance.view","leases.change_terms",permission(op)].every(key=>identity.permissions.includes(key));
const draftSchema=z.discriminatedUnion("operation",[
  z.strictObject({operation:z.literal("apply"),leaseId:uuid,depositId:uuid,invoiceId:uuid,date:z.iso.date(),reason:z.string().trim().min(3).max(200),lineId:uuid,amount:money}),
  z.strictObject({operation:z.literal("reverse"),leaseId:uuid,date:z.iso.date(),reason:z.string().trim().min(3).max(200),applicationId:uuid}),
]);
type Draft=z.infer<typeof draftSchema>;
function selected(s:LocalDepositRentSnapshot,d:Draft){
  const original=d.operation==="reverse"?s.applications.find(row=>row.id===d.applicationId):undefined;
  const depositId=d.operation==="apply"?d.depositId:original?.depositId,invoiceId=d.operation==="apply"?d.invoiceId:original?.invoiceId;
  const deposit=s.deposits.find(row=>row.id===depositId),invoice=s.invoices.find(row=>row.id===invoiceId);
  if(!deposit||!invoice)fail("Explicit deposit and invoice choices could not be verified. Reload the lease.");
  return {deposit,invoice,original};
}
function scopeHash(s:LocalDepositRentSnapshot,d:Draft){const {deposit,invoice}=selected(s,d);return hash([s.organizationId,s.leaseId,s.propertyId,s.unitId,deposit.id,invoice.id]);}
function eligible(deposit:LocalDepositRentSnapshot["deposits"][number]){return !deposit.archived&&deposit.custodyVerified&&deposit.custodian!==null&&deposit.singleUnchangedOwner&&deposit.custodyReconciles&&cents(deposit.held)>BigInt(0);}

// Not a Server Action or mounted route. Production activation and grants remain held.
export function createLocalDepositRentWorkflow(deps:LocalDepositRentDependencies,enabledForLocalTests=LOCAL_DEPOSIT_RENT_WORKFLOW_ENABLED):DepositRentLocalActions{
  const now=deps.now??Date.now;
  async function run<T>(body:()=>Promise<T>):Promise<DepositRentResult<T>>{
    if(!enabledForLocalTests)return {status:"error",message:"Deposit rent workflow is disabled."};
    try{return {status:"success",value:await body()};}catch(error){return {status:"error",message:error instanceof WorkflowError?error.message:"The action could not be confirmed. Reopen this lease and retry the original action before making another change."};}
  }
  async function identity(operation?:"apply"|"reverse"){
    const value=await deps.identity();if(!value||!["leases.view","finance.view"].every(key=>value.permissions.includes(key))||operation&&!allowed(value,operation))fail("You do not have permission for this deposit rent action.");return value;
  }
  async function read(leaseId:string,operation?:"apply"|"reverse"){
    if(!uuid.safeParse(leaseId).success)fail("Choose a valid lease.");
    const who=await identity(operation),client=await deps.client();
    const s=parseLocalDepositCandidates(await deps.readSnapshot(client,who.organizationId,leaseId),who.organizationId,leaseId);
    if(s.actorId!==who.actorId)fail("The deposit rent source belongs to a different signed-in user.");
    const checked:LocalDepositClient={rpc:async(name,args)=>{const result=await client.rpc(name,args);if(result.error)fail("You do not have access to this lease and property.");return result;}};
    const reader=checked as unknown as Parameters<typeof loadScopedFinanceContext>[0];
    const finance=await loadScopedFinanceContext(reader,who.organizationId,s.propertyId),lease=finance.leases.find(row=>row.id===leaseId);
    if(!finance.properties.some(row=>row.id===s.propertyId)||!lease||lease.property_id!==s.propertyId||lease.unit_id!==s.unitId||s.unitId&&!finance.units.some(row=>row.id===s.unitId&&row.property_id===s.propertyId))fail("You do not have access to this lease and property.");
    const leases=await loadScopedLeaseContext(reader,who.organizationId,[leaseId]);
    if(!leases.properties.some(row=>row.id===s.propertyId)||s.unitId&&!leases.units.some(row=>row.id===s.unitId&&row.property_id===s.propertyId))fail("You do not have access to this lease and property.");
    if(!sameCandidateIds(leases.deposits.filter(row=>row.lease_id===leaseId).map(row=>row.id),s.census.deposits)
      ||!sameCandidateIds(leases.deposit_events.filter(row=>s.census.deposits.includes(row.lease_deposit_id)).map(row=>row.id),s.census.events))fail("The deposit rent source inventory is incomplete. Reload the lease.");
    return {who,client,s};
  }
  function effects(s:LocalDepositRentSnapshot,d:Draft){
    const {deposit,invoice,original}=selected(s,d);
    if(!deposit.custodyVerified||!deposit.singleUnchangedOwner||!deposit.custodyReconciles||deposit.custodian===null)fail("Confirm who holds the deposit and one unchanged owner before using it for rent.");
    if(d.date>s.businessDate||d.date<deposit.earliestDate)fail("Choose a date within the verified deposit history and on or before today.");
    if(s.closedMonths.includes(d.date.slice(0,7)))fail("This financial month is closed. Follow the existing reopen process before continuing.");
    let amount:string;
    if(d.operation==="apply"){
      const line=invoice.rentLines.find(row=>row.id===d.lineId);
      if(!eligible(deposit)||!invoice.issued||!line||cents(d.amount)<=BigInt(0)||cents(d.amount)>cents(line.outstanding)||cents(d.amount)>cents(invoice.outstanding)||cents(d.amount)>cents(deposit.held))fail("Choose an amount within both the available deposit and outstanding rent.");amount=d.amount;
    }else{
      if(!original||!original.active||original.consumed||original.reversalOf!==null||d.date<original.date||cents(deposit.held)+cents(original.amount)>cents(deposit.obligation))fail("This application cannot be reversed. Review its date and any later owner payments.");amount=original.amount;
    }
    const signed=cents(amount)*(d.operation==="apply"?BigInt(1):BigInt(-1));
    return {operation:d.operation,date:d.date,amount,heldAfter:decimal(cents(deposit.held)-signed),outstandingAfter:decimal(cents(invoice.outstanding)-signed),custodyChange:decimal(-signed),ownerCashChange:deposit.custodian==="ips"?decimal(signed):"0.00"};
  }
  const journalScope=(who:LocalDepositRentIdentity,leaseId:string)=>({organizationId:who.organizationId,actorId:who.actorId,leaseId});
  return {
    list:leaseId=>run(async()=>{
      const {who,s}=await read(leaseId);return deps.intentStore.withLease(journalScope(who,leaseId),async journal=>{
        const intent=journal.read();return {leaseLabel:s.leaseLabel,canApply:allowed(who,"apply"),canReverse:allowed(who,"reverse"),
          deposits:s.deposits.map(row=>({id:row.id,label:row.label,amount:row.held,eligible:eligible(row),custodianLabel:!row.custodyVerified?"Deposit custody is not verified":row.custodian==="ips"?"IPS holds the deposit":"The owner holds the deposit"})),
          invoices:s.invoices.map(row=>({id:row.id,label:row.label,amount:row.outstanding,issued:row.issued,rentLines:row.rentLines.map(line=>({id:line.id,label:line.label,amount:line.outstanding}))})),
          applications:s.applications.filter(row=>row.active&&!row.consumed).map(row=>({id:row.id,label:row.label,amount:row.amount})),
          ...(intent?.state==="attempted"?{recovery:{token:intent.token,idempotencyKey:intent.idempotencyKey,operation:intent.draft.operation,date:intent.draft.date,amount:intent.amount,reason:intent.draft.reason}}:{})};
      });
    }),
    preview:input=>run(async()=>{
      const parsed=draftSchema.safeParse(input);if(!parsed.success)fail("Check the date, amount and a reason of 3 to 200 characters.");
      const d=parsed.data,{who,s}=await read(d.leaseId,d.operation);
      return deps.intentStore.withLease(journalScope(who,d.leaseId),async journal=>{
        if(journal.read()?.state==="attempted")fail("An earlier action is unconfirmed. Reopen this lease and retry the original action before making another change.");
        const effect=effects(s,d),token=randomUUID(),idempotencyKey=randomUUID();
        const intent:LocalDepositIntent={token,idempotencyKey,amount:effect.amount,draft:d,snapshotHash:hash(s),scopeHash:scopeHash(s,d),identityHash:hash(who),expires:now()+300_000,state:"preview"};
        await journal.save(intent);return {token,idempotencyKey,...effect};
      });
    }),
    confirm:input=>run(async()=>{
      const parsed=z.strictObject({leaseId:uuid,token:uuid,idempotencyKey:uuid}).safeParse(input);if(!parsed.success)fail("Reopen this lease and retry the original action.");
      const who=await identity();return deps.intentStore.withLease(journalScope(who,input.leaseId),async journal=>{
        const intent=journal.read();if(!intent||intent.token!==input.token||intent.idempotencyKey!==input.idempotencyKey)fail("Retry the original action with its saved details.");
        if(intent.state==="preview"&&intent.expires<now())fail("The unused preview expired. Close and reopen this lease to preview again.");
        const d=draftSchema.parse(intent.draft),{who:current,client,s}=await read(d.leaseId,d.operation);
        if(hash(current)!==intent.identityHash)fail("Your access changed. Restore access to the original lease before retrying.");
        if(scopeHash(s,d)!==intent.scopeHash)fail("The original deposit or invoice scope changed. Review it before retrying.");
        if(intent.state==="resolved")return {message:intent.message!};
        if(intent.state==="preview"){
          if(hash(s)!==intent.snapshotHash)fail("The deposit or rent changed. Preview this action again.");effects(s,d);
          // Persist BEFORE dispatch. Attempts do not expire and block every replacement,
          // including a different preview/key, until the original command succeeds/replays.
          intent.state="attempted";await journal.save(intent);
        }
        const result=await client.rpc(d.operation==="apply"?"apply_deposit_to_rent":"reverse_deposit_rent_application",d.operation==="apply"?{
          p_org:current.organizationId,p_deposit:d.depositId,p_invoice:d.invoiceId,p_date:d.date,p_allocations:[{lineId:d.lineId,amount:d.amount}],p_reason:d.reason,p_key:intent.idempotencyKey,
        }:{p_org:current.organizationId,p_original:d.applicationId,p_date:d.date,p_reason:d.reason,p_key:intent.idempotencyKey});
        if(result.error||!uuid.safeParse(result.data).success)fail("The original action is still unconfirmed. Reopen this lease and retry it with the saved details.");
        intent.state="resolved";intent.message=d.operation==="apply"?"Deposit applied to rent. No new bank payment was recorded.":"The full deposit application was reversed. No new bank payment was recorded.";
        await journal.save(intent);return {message:intent.message};
      });
    }),
  };
}
