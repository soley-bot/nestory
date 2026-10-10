import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createLocalDepositExportHandler, LOCAL_DEPOSIT_EXPORT_ENABLED } from "./deposit-rent-local-export";
import type { LocalDepositClient } from "./deposit-rent-local-source";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor=id(1), org=id(2), property=id(3), unit=id(4), lease=id(5), deposit=id(6), receipt=id(7), event=id(8), allocation=id(9), application=id(10);
const fingerprint="a".repeat(64);
function fixture() {
  const leaseRow={id:lease,property_id:property,unit_id:unit as string|null,primary_tenant_person_id:id(11),tenant_name:"Synthetic",status:"ended",lease_start_date:"2026-01-01",lease_end_date:"2026-12-31",monthly_rent_amount:300,archived_at:"2026-10-01"};
  const finance={properties:[{id:property,code:"P1",name:"Synthetic property",archived_at:null}],units:[{id:unit,property_id:property,unit_number:"1",archived_at:null}],people:[],owner_assignments:[],leases:[leaseRow],terms:[],billing_terms:[],
    recovery_leases:undefined as {id:string;property_id:string;archived_at:string|null}[]|undefined};
  const context={properties:[{...finance.properties[0],rental_structure:null}],units:[{...finance.units[0],floor:null,status:"occupied"}],availability_leases:[{id:lease,unit_id:unit,archived_at:leaseRow.archived_at}],availability_terms:[],people:[],parties:[],terms:[],billing_terms:[],occupancies:[],
    deposits:[{id:deposit,lease_id:lease,deposit_type:"security",amount:500,currency:"USD",status:"partially_applied",archived_at:null}],
    deposit_events:[{id:receipt,lease_deposit_id:deposit,event_type:"received",event_date:"2026-09-01",amount:500,currency:"USD",reference:null,reversal_of_id:null},
      {id:event,lease_deposit_id:deposit,event_type:"applied",event_date:"2026-10-05",amount:300,currency:"USD",reference:null,reversal_of_id:null}]};
  const packet={version:1,purpose:"deposit-rent-validation-only",actorId:actor,organizationId:org,propertyIds:[property],unitId:unit as string|null,periodStart:"2026-10-01",periodEnd:"2026-10-31",consistency:"statement_snapshot",complete:true,fullOwnerProfitCertified:false,fingerprint,
    deposits:[{id:deposit,lease_id:lease,property_id:property,unit_id:unit as string|null}],
    events:context.deposit_events.map(row=>({id:row.id,lease_deposit_id:row.lease_deposit_id,event_type:row.event_type,event_date:row.event_date,
      currency:row.currency,reversal_of_id:row.reversal_of_id,property_id:property,unit_id:unit as string|null,amount:row.amount.toFixed(2)})),
    allocations:[{id:allocation,application_id:application,application_amount:"300.00",deposit_event_id:event,lease_deposit_id:deposit,invoice_id:id(12),invoice_line_id:id(13),property_id:property,unit_id:unit as string|null,currency:"USD",settlement_date:"2026-10-05",custodian:"ips",owner_person_id:null,signed_amount:"300.00",reversal_of_allocation_id:null,reversal_of_application_id:null,custody_confirmation_id:id(14),line_type:"rent"}],
    ownerBridges:[{applicationId:application,propertyOwnerId:id(15),ownerPersonId:id(16),liabilityAccountId:id(17),allocationSetId:id(18),custodian:"ips",custodySignedAmount:"-300.00",ipsHeldSignedAmount:"300.00",singleUnchangedOwner:true}],
    // Independently declared expected IDs, not computed from response rows/counts.
    census:{leases:[lease],deposits:[deposit],events:[receipt,event],allocations:[allocation],ownerBridges:[application]}};
  return {finance,context,packet};
}
function harness(change?: (data: ReturnType<typeof fixture>)=>void, options: {member?:boolean;user?:boolean;denyProperty?:string;missingSnapshot?:boolean;reauthorize?:boolean}={}) {
  const data=fixture();change?.(data);
  const rpc=vi.fn<LocalDepositClient["rpc"]>(async(name,args)=>{
    if(args.p_organization_id!==org) throw new Error("Unexpected organization");
    if(options.denyProperty && options.denyProperty===args.p_requested_property_id) return {data:null,error:{code:"42501",message:"Not authorized"}};
    if(name==="get_finance_read_context") return {data:structuredClone(data.finance),error:null};
    if(name==="get_lease_read_context") return {data:structuredClone(data.context),error:null};
    if(name==="get_local_lease_deposit_report_snapshot") return options.missingSnapshot ? {data:null,error:{code:"PGRST202",message:"Not installed"}} : {data:structuredClone(data.packet),error:null};
    throw new Error(`Forbidden RPC ${name}`);
  });
  const membership=vi.fn(async()=>options.member===false ? null : {organizationId:org,organizationName:"Synthetic company",authorizationKey:"branch1:role1:finance+lease"});
  if(options.reauthorize===false) membership.mockResolvedValueOnce({organizationId:org,organizationName:"Synthetic company",authorizationKey:"branch1:role1:finance+lease"}).mockResolvedValue(null);
  const dependencies={currentUser:vi.fn(async()=>options.user===false?null:{id:actor}),membership,client:vi.fn(async()=>({rpc}))};
  return {data,rpc,dependencies,handle:createLocalDepositExportHandler(dependencies,true)};
}
function request(format="xlsx",extra="") {return new Request(`http://local.test/local-validation?propertyId=${property}&unitId=${unit}&from=2026-10-01&to=2026-10-31&format=${format}${extra}`);}

describe("unmounted, disabled local source/client/export integration",()=>{
  it("is disabled by default and request flags cannot activate it",async()=>{
    expect(LOCAL_DEPOSIT_EXPORT_ENABLED).toBe(false);const h=harness();
    const response=await createLocalDepositExportHandler(h.dependencies)(request("xlsx","&enabled=true&basis=cash"));
    expect(response.status).toBe(404);expect(h.dependencies.currentUser).not.toHaveBeenCalled();expect(h.rpc).not.toHaveBeenCalled();
  });
  it("uses existing finance/lease context before the local dual-permission snapshot and renders real XLSX",async()=>{
    const h=harness();const response=await h.handle(request());expect(response.status).toBe(200);
    expect(h.rpc.mock.calls.map(([name])=>name)).toEqual(["get_finance_read_context","get_lease_read_context","get_local_lease_deposit_report_snapshot","get_finance_read_context","get_lease_read_context"]);
    expect(h.rpc.mock.calls[1][1].p_lease_ids).toEqual([lease]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(response.headers.get("X-Nestory-Report-Scope")).toBe("deposit-rent-only");
    const sheet=strFromU8(unzipSync(new Uint8Array(await response.arrayBuffer()))["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("Deposit rent settlements");expect(sheet).toContain("Rent settled from deposits");expect(sheet).toContain("USD 300.00");
    expect(sheet).toContain(application);expect(sheet).toContain("new bank receipt 0.00");expect(sheet).not.toContain("Net operating income");
    expect(h.dependencies.membership).toHaveBeenCalledTimes(2);
  });
  it("renders real PDF under the same authorization and bounded scope",async()=>{
    const h=harness();const response=await h.handle(request("pdf"));expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");expect(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString()).toBe("%PDF");
  });
  it("includes a checked recovery root omitted from current leases without dropping its deposit history",async()=>{
    const h=harness(data=>{
      data.finance.recovery_leases=[{id:lease,property_id:property,archived_at:"2026-10-01"}];
      data.finance.leases=[];
    });
    const response=await h.handle(request());expect(response.status).toBe(200);
    expect(h.rpc.mock.calls[1][1].p_lease_ids).toEqual([lease]);
    const sheet=strFromU8(unzipSync(new Uint8Array(await response.arrayBuffer()))["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain(application);expect(sheet).toContain("USD 300.00");
  });
  it("rejects recovery roots whose checked unit relationship is outside the property",async()=>{
    const h=harness(data=>{
      data.finance.recovery_leases=[{id:lease,property_id:property,archived_at:null}];
      data.finance.leases=[];data.context.availability_leases[0].unit_id=id(99);
    });
    expect((await h.handle(request())).status).toBe(409);
  });
  it("denies unauthenticated and finance-only/lease-only membership before any reads",async()=>{
    for(const options of [{user:false},{member:false}]){const h=harness(undefined,options);const r=await h.handle(request());expect(r.status).toBe(options.user===false?401:403);expect(h.rpc).not.toHaveBeenCalled();}
  });
  it("denies mixed-property authority as a whole and wrong-property units",async()=>{
    const h=harness(undefined,{denyProperty:id(30)});
    const r=await h.handle(new Request(`http://local.test/?propertyId=${property}&propertyId=${id(30)}&from=2026-10-01&to=2026-10-31&format=xlsx`));
    expect(r.status).toBe(403);expect(h.rpc.mock.calls.some(([name])=>name.includes("snapshot"))).toBe(false);
    const wrong=harness();expect((await wrong.handle(new Request(request().url.replace(unit,id(31))))).status).toBe(403);
  });
  it("denies empty-property lease authority, including when the finance inventory contains no leases",async()=>{
    const h=harness(data=>{data.finance.leases=[];data.context.properties=[];});expect((await h.handle(request())).status).toBe(403);
  });
  it("does not silently attribute a whole-property rent application to one unit",async()=>{
    const h=harness(data=>{data.finance.leases[0].unit_id=null;data.packet.deposits[0].unit_id=null;
      data.packet.events.forEach(row=>{row.unit_id=null;});data.packet.allocations[0].unit_id=null;});
    expect((await h.handle(request())).status).toBe(409);
  });
  it("permits genuinely empty roots only with matching independent census and existing context",async()=>{
    const h=harness(data=>{data.finance.leases=[];data.context.deposits=[];data.context.deposit_events=[];
      data.packet.deposits=[];data.packet.events=[];data.packet.allocations=[];data.packet.ownerBridges=[];
      data.packet.census={leases:[],deposits:[],events:[],allocations:[],ownerBridges:[]};});
    expect((await h.handle(request())).status).toBe(200);
  });
  it("rejects missing RPC without falling back to direct tables or the finance-only reader",async()=>{
    const h=harness(undefined,{missingSnapshot:true});expect((await h.handle(request())).status).toBe(409);
    expect(h.rpc.mock.calls.every(([name])=>["get_finance_read_context","get_lease_read_context","get_local_lease_deposit_report_snapshot"].includes(name))).toBe(true);
  });
  it("rejects a selected event whose property differs from its deposit parent",async()=>{
    const h=harness(data=>{data.packet.events[0].property_id=id(30);});
    const response=await h.handle(request());expect(response.status).toBe(409);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).toBe("Deposit source parent scope mismatch.");
  });
  it("rejects a missing root despite matching row count and a complete flag",async()=>{
    const h=harness(data=>{data.packet.events[0].id=id(40);});expect((await h.handle(request())).status).toBe(409);
  });
  it("rejects hidden roots even if the serialized rows and census both falsely claim empty",async()=>{
    const h=harness(data=>{data.packet.events=[];data.packet.census.events=[];});expect((await h.handle(request())).status).toBe(409);
  });
  it("rejects incomplete, cross-actor, stale, unlinked and missing-bridge packets",async()=>{
    for(const mutate of [d=>{d.packet.complete=false;},d=>{d.packet.actorId=id(41);},d=>{d.packet.allocations=[];d.packet.census.allocations=[];},
      d=>{d.packet.ownerBridges=[];d.packet.census.ownerBridges=[];} ] as Array<(d:ReturnType<typeof fixture>)=>void>){const h=harness(mutate);expect((await h.handle(request())).status).toBe(409);}
    const h=harness();expect((await h.handle(request("xlsx",`&expectedFingerprint=${"b".repeat(64)}`))).status).toBe(409);
  });
  it("rejects revoked membership or changed role/branch before releasing bytes",async()=>{
    const revoked=harness(undefined,{reauthorize:false});expect((await revoked.handle(request())).status).toBe(403);
    const changed=harness();changed.dependencies.membership.mockResolvedValueOnce({organizationId:org,organizationName:"Synthetic",authorizationKey:"branch1:role1:finance+lease"}).mockResolvedValue({organizationId:org,organizationName:"Synthetic",authorizationKey:"branch2:role2"});
    expect((await changed.handle(request())).status).toBe(403);
  });
  it("rejects revoked property finance or lease access with unchanged membership and no attachment",async()=>{
    for(const reader of ["get_finance_read_context","get_lease_read_context"]){
      const h=harness();const original=h.rpc.getMockImplementation()!;let snapshotRead=false;
      h.rpc.mockImplementation(async(name,args)=>{
        if(snapshotRead && name===reader) return {data:null,error:{code:"42501",message:"Property access revoked"}};
        const result=await original(name,args);if(name==="get_local_lease_deposit_report_snapshot") snapshotRead=true;return result;
      });
      const response=await h.handle(request());expect(response.status).toBe(403);
      expect(response.headers.get("Content-Disposition")).toBeNull();expect(await response.text()).toBe("Forbidden");
      expect(h.dependencies.membership.mock.results).toHaveLength(2);
    }
  });
  it("rejects unit reparenting in either final reader with no attachment",async()=>{
    for(const reader of ["get_finance_read_context","get_lease_read_context"]){
      const h=harness();const original=h.rpc.getMockImplementation()!;let snapshotRead=false;
      h.rpc.mockImplementation(async(name,args)=>{
        const result=await original(name,args);
        if(snapshotRead && name===reader && result.data) (result.data as {units:Array<{property_id:string}>}).units[0].property_id=id(30);
        if(name==="get_local_lease_deposit_report_snapshot") snapshotRead=true;return result;
      });
      const response=await h.handle(request("pdf"));expect(response.status).toBe(403);
      expect(response.headers.get("Content-Disposition")).toBeNull();expect(await response.text()).toBe("Forbidden");
    }
  });
  it("rejects the entire mixed scope when one property loses access after snapshot",async()=>{
    const other=id(30);const h=harness(data=>{
      data.finance.properties.push({...data.finance.properties[0],id:other});
      data.context.properties.push({...data.context.properties[0],id:other});
      data.packet.propertyIds.push(other);data.packet.unitId=null;
    });const original=h.rpc.getMockImplementation()!;let snapshotRead=false;
    h.rpc.mockImplementation(async(name,args)=>{
      if(snapshotRead && name==="get_finance_read_context" && args.p_requested_property_id===other) return {data:null,error:{code:"42501",message:"Property moved branch"}};
      const result=await original(name,args);if(name==="get_local_lease_deposit_report_snapshot") snapshotRead=true;return result;
    });
    const url=new URL(request().url);url.searchParams.delete("unitId");url.searchParams.append("propertyId",other);
    const response=await h.handle(new Request(url));
    expect(response.status).toBe(403);expect(response.headers.get("Content-Disposition")).toBeNull();expect(await response.text()).toBe("Forbidden");
    expect(h.rpc.mock.calls.filter(([name])=>name==="get_finance_read_context")).toHaveLength(4);
  });
  it("never accepts caller organization, actor, source packet or ambiguous scope parameters",async()=>{
    for(const extra of [`&organizationId=${id(42)}`,`&actorId=${id(43)}`,"&complete=true",`&propertyId=${property}`,"&format=pdf"]){const h=harness();expect((await h.handle(request("xlsx",extra))).status).toBe(400);expect(h.rpc).not.toHaveBeenCalled();}
  });
  it("rejects root-count and packet-byte overflow before creating an attachment",async()=>{
    const rows=harness(data=>{data.packet.events=Array.from({length:5001},(_,index)=>({...data.packet.events[0],id:id(index+100)}));});
    expect((await rows.handle(request())).status).toBe(409);
    const bytes=harness(data=>{Object.assign(data.packet,{unexpectedPadding:"x".repeat(8_388_608)});});
    const response=await bytes.handle(request());expect(response.status).toBe(409);expect(await response.text()).toContain("byte cap");
  });
});
