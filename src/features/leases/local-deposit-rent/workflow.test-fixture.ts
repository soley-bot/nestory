import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createFileLocalDepositIntentStore } from "./intent-store";
import { readLocalDepositRentSnapshot } from "./candidate-reader";
import { vi } from "vitest";
import type { LocalDepositClient } from "@/features/reports/data/deposit-rent-local-source";
import { createLocalDepositRentWorkflow, type LocalDepositRentSnapshot } from "./workflow";
// @ts-expect-error The existing synthetic executable command specification has no TypeScript declarations.
import { simulateApprovedDepositRentCommand as simulate } from "../../../../scripts/deposit-rent-approved-command-model.mjs";
export const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const ids={actor:id(1),org:id(2),property:id(3),unit:id(4),lease:id(5),deposit:id(6),invoice:id(7),line:id(8)};
export function fixture(custodian:"ips"|"owner"="ips") {
  const initial={organizationId:ids.org,branchId:"synthetic-branch",propertyId:ids.property,invoiceId:ids.invoice,depositId:ids.deposit,
    invoiceLeaseId:ids.lease,depositLeaseId:ids.lease,invoiceCurrency:"USD",depositCurrency:"USD",invoiceLifecycle:"issued",
    custodyVerified:true,custodian,custodyOwnerId:custodian==="owner"?id(11):null,custodyConfirmedOn:"2026-09-01",firstDepositDate:"2026-09-01",
    custodyLiabilityAccountId:id(12),liabilityAccount:{id:id(12),organizationId:ids.org,propertyId:ids.property,archived:false,accountClass:"liability",accountSubtype:"current_liability",useForLeaseDeposits:true},
    ownershipHistory:[{id:id(10),personId:id(11),percent:"100.000",startedOn:"2026-01-01",endedOn:null,archived:false,personActive:true,ownerRoleActive:true}],
    depositObligation:"500.00",held:"500.00",lastCustodyDate:"2026-09-01",invoiceOutstanding:"300.00",closedMonths:[],
    lines:[{id:ids.line,kind:"rent",active:true,due:"300.00",otherSettled:"0.00",depositSettled:"0.00"}],sequence:1,events:[],applications:[],audit:[],requests:{},
    ipsRentReclassification:"0",ownerDirectRentSettlement:"0",externalCashReceived:"0",officialDepositCustody:"500.00",officialIpsHeld:"0.00",
    ownerBridges:[],ownerMovements:[],activeOwnerCashConsumers:[],bankReceiptCount:custodian==="ips"?1:0,bankCash:custodian==="ips"?"500.00":"0.00"};
  let state=initial;let offset=0;const publicIds=new Map<string,string>();
  const control={denyProperty:false,denyLease:false,missingCommand:false,ambiguousCommit:false,clock:0,extraChoices:false,unverified:false,permissions:["leases.view","finance.view","leases.change_terms","finance.record_payments","finance.correct_records"]};
  const identity=vi.fn(async()=>({actorId:ids.actor,organizationId:ids.org,authorizationKey:"unchanged-branch-role",permissions:[...control.permissions]}));
  function eventRows(){const events=state.events as unknown as Array<{kind:string;date:string;amount:string}>;return events.map((e,index)=>({id:id(200+index),lease_deposit_id:ids.deposit,event_type:e.kind,event_date:e.date,amount:Number(e.amount),currency:"USD",reference:null,reversal_of_id:null}));}
  function snapshot():LocalDepositRentSnapshot {
    const applications=state.applications as unknown as Array<{id:string;amount:string;date:string;reversalOf:string|null}>;
    const deposits=[{id:ids.deposit,leaseId:ids.lease,label:"Security deposit",held:state.held,obligation:"500.00",custodyVerified:state.custodyVerified&&!control.unverified,custodian:control.unverified?null:custodian,singleUnchangedOwner:true,custodyReconciles:true,archived:false,earliestDate:state.lastCustodyDate}];
    const invoices=[{id:ids.invoice,leaseId:ids.lease,label:"October rent invoice",outstanding:state.invoiceOutstanding,issued:true,rentLines:[{id:ids.line,label:"October rent",outstanding:state.invoiceOutstanding}]}];
    if(control.extraChoices){deposits.push({...deposits[0],id:id(40),label:"Second security deposit"});invoices.push({...invoices[0],id:id(41),label:"November rent invoice",rentLines:[{id:id(42),label:"November rent",outstanding:"300.00"}]});}
    const rows=applications.map(a=>({id:publicIds.get(a.id)!,depositId:ids.deposit,invoiceId:ids.invoice,label:`Rent application on ${a.date}`,amount:a.amount,date:a.date,reversalOf:a.reversalOf?publicIds.get(a.reversalOf)!:null,active:!a.reversalOf&&!applications.some(r=>r.reversalOf===a.id),consumed:false}));
    const packet={version:1 as const,purpose:"local-deposit-rent-candidates" as const,actorId:ids.actor,organizationId:ids.org,leaseId:ids.lease,propertyId:ids.property,unitId:ids.unit,leaseLabel:"Synthetic tenant - Home One",
      deposits,invoices,applications:rows,businessDate:"2026-11-30",closedMonths:state.closedMonths,consistency:"statement_snapshot" as const,complete:true as const,sourceHash:"a".repeat(64),
      census:{deposits:deposits.map(d=>d.id),invoices:invoices.map(i=>i.id),rentLines:invoices.flatMap(i=>i.rentLines.map(l=>l.id)),events:eventRows().map(e=>e.id),applications:rows.map(a=>a.id),allocations:rows.map((_,index)=>id(300+index)),custody:deposits.filter(d=>d.custodyVerified).map((_,index)=>id(350+index)),bridges:rows.map(a=>a.id)}};
    return {...packet,fingerprint:createHash("sha256").update(JSON.stringify(packet)).digest("hex")};
  }
  const leaseRow={id:ids.lease,property_id:ids.property,unit_id:ids.unit,primary_tenant_person_id:id(13),tenant_name:"Synthetic tenant",status:"active",lease_start_date:"2026-01-01",lease_end_date:"2026-12-31",monthly_rent_amount:300,archived_at:null};
  const property={id:ids.property,code:"HOME1",name:"Home One",archived_at:null};const unit={id:ids.unit,property_id:ids.property,unit_number:"1",archived_at:null};
  const rpc=vi.fn<LocalDepositClient["rpc"]>(async(name,args)=>{
    if(name==="get_local_deposit_rent_candidates")return {data:snapshot(),error:null};
    if(name==="get_finance_read_context")return control.denyProperty?{data:null,error:{code:"42501",message:"private"}}:{data:{properties:[property],units:[unit],people:[],owner_assignments:[],leases:[leaseRow],terms:[],billing_terms:[]},error:null};
    if(name==="get_lease_read_context")return {data:{properties:control.denyLease?[]:[{...property,rental_structure:null}],units:[{...unit,floor:null,status:"occupied"}],availability_leases:[],availability_terms:[],people:[],parties:[],terms:[],billing_terms:[],occupancies:[],
      deposits:snapshot().deposits.map(d=>({id:d.id,lease_id:ids.lease,deposit_type:"security",amount:500,currency:"USD",status:"received",archived_at:null})),deposit_events:eventRows()},error:null};
    if(!["apply_deposit_to_rent","reverse_deposit_rent_application"].includes(name))throw Error("Unexpected RPC");
    if(control.missingCommand)return {data:null,error:{code:"PGRST202",message:"private internal identifiers"}};
    if(args.p_org!==ids.org)throw Error("Caller organization");
    const original=[...publicIds.entries()].find(([,value])=>value===args.p_original)?.[0];
    const command=name==="apply_deposit_to_rent"?{type:"apply",depositId:args.p_deposit,invoiceId:args.p_invoice,date:args.p_date,allocations:args.p_allocations,reason:args.p_reason,key:args.p_key}
      :{type:"reverse",applicationId:original,date:args.p_date,reason:args.p_reason,key:args.p_key};
    const user={actorId:ids.actor,organizationId:ids.org,activeBranchId:"synthetic-branch",propertyIds:[ids.property],permissions:control.permissions};
    try{const result=simulate(state,user,command);state=result.state;
      if(!publicIds.has(result.id))publicIds.set(result.id,id(100+(offset++)));
      if(control.ambiguousCommit){control.ambiguousCommit=false;throw Error("lost response after commit");}
      return {data:publicIds.get(result.id),error:null};
    }catch(error){if(error instanceof Error&&error.message==="lost response after commit")throw error;return {data:null,error:{code:"23514",message:"checked rejection"}};}
  });
  const readSnapshot=vi.fn(readLocalDepositRentSnapshot);const intentDirectory=mkdtempSync(join(tmpdir(),"nestory-deposit-intent-"));
  const dependencies={identity,client:vi.fn(async()=>({rpc})),readSnapshot,intentStore:createFileLocalDepositIntentStore(intentDirectory),now:()=>control.clock};
  return {control,identity,rpc,readSnapshot,intentDirectory,dependencies,actions:createLocalDepositRentWorkflow(dependencies,true),snapshot,getState:()=>state};
}
