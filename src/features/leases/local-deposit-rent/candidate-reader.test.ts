import {describe,expect,it} from "vitest";
import {fixture,id,ids} from "./workflow.test-fixture";
import {parseLocalDepositCandidates,readLocalDepositRentSnapshot} from "./candidate-reader";
describe("checked candidate reader contract",()=>{
  it("retains stale immutable custody history without declaring its attestation current",()=>{
    const h=fixture(),s=h.snapshot();s.deposits[0].custodyCurrent=false;
    expect(parseLocalDepositCandidates(s,ids.org,ids.lease).deposits[0]).toMatchObject({custodyVerified:true,custodyCurrent:false});
    s.deposits[0].custodyVerified=false;s.deposits[0].custodyCurrent=true;s.deposits[0].liabilityAccountActive=false;s.census.custody=[];
    expect(()=>parseLocalDepositCandidates(s,ids.org,ids.lease)).toThrow("incomplete");
  });
  it("retains more than 100 explicit invoice choices with exact independent identity census",()=>{
    const h=fixture(),s=h.snapshot();s.invoices=Array.from({length:101},(_,index)=>({...s.invoices[0],id:id(1000+index),rentLines:[{...s.invoices[0].rentLines[0],id:id(2000+index)}]}));
    s.census.invoices=s.invoices.map(row=>row.id);s.census.rentLines=s.invoices.flatMap(row=>row.rentLines.map(line=>line.id));
    expect(parseLocalDepositCandidates(s,ids.org,ids.lease).invoices).toHaveLength(101);
    s.census.invoices.pop();expect(()=>parseLocalDepositCandidates(s,ids.org,ids.lease)).toThrow("incomplete");
  });
  it("calls only the separate candidate RPC with server-derived organization/lease",async()=>{const h=fixture();const s=await readLocalDepositRentSnapshot({rpc:h.rpc},ids.org,ids.lease);expect(s.deposits[0].held).toBe("500.00");expect(h.rpc.mock.calls.map(([name])=>name)).toEqual(["get_local_deposit_rent_candidates"]);expect(h.rpc.mock.calls[0][1]).toEqual({p_organization_id:ids.org,p_lease_id:ids.lease});});
  it("rejects same-count wrong roots, hidden inventory, incomplete flags, foreign parents and raw-ID labels",()=>{for(const mutate of [s=>{s.deposits[0].id=id(80);},s=>{s.deposits=[];},s=>{Reflect.set(s,"complete",false);},s=>{s.invoices[0].leaseId=id(81);},s=>{s.leaseLabel=ids.lease;} ] as Array<(s:ReturnType<ReturnType<typeof fixture>["snapshot"]>)=>void>){const h=fixture(),s=h.snapshot();mutate(s);expect(()=>parseLocalDepositCandidates(s,ids.org,ids.lease)).toThrow();}});
  it("retains multiple explicit choices and unverified/void roots without declaring them eligible",()=>{const h=fixture();h.control.extraChoices=true;h.control.unverified=true;const s=parseLocalDepositCandidates(h.snapshot(),ids.org,ids.lease);expect(s.deposits).toHaveLength(2);expect(s.invoices).toHaveLength(2);expect(s.deposits[0].custodian).toBeNull();});
  it("rejects count/byte overflow and duplicate source IDs",()=>{const h=fixture(),s=h.snapshot();expect(()=>parseLocalDepositCandidates({...s,deposits:Array(101).fill(s.deposits[0])},ids.org,ids.lease)).toThrow();expect(()=>parseLocalDepositCandidates({...s,padding:"x".repeat(8_388_608)},ids.org,ids.lease)).toThrow();expect(()=>parseLocalDepositCandidates({...s,census:{...s.census,events:[id(90),id(90)]}},ids.org,ids.lease)).toThrow();});
});
