import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),close:vi.fn(),client:vi.fn(),publication:vi.fn(),balance:vi.fn(),readContext:vi.fn(),getContext:vi.fn()}));
vi.mock("@/lib/auth/context",()=>({requireOwnerBalanceReadContext:mocks.context}));
vi.mock("@/lib/db/server",()=>({createSupabaseServerClient:mocks.client}));
vi.mock("@/features/owner-close/data/owner-close",()=>({getOwnerCloseData:mocks.close}));
vi.mock("@/features/reports/data/owner-statement-report",()=>({loadOwnerStatementPublication:mocks.publication}));
vi.mock("./data/owner-balances",()=>({getOwnerBalanceData:mocks.balance}));
vi.mock("@/lib/finance/financial-write-context.server",()=>({withFinancialReadContext:mocks.readContext,getFinancialWriteContext:mocks.getContext}));
import { readStatementReport, readStatementReports } from "./statement-report-action";
import { OWNER_BALANCE_COMPONENTS } from "./owner-balance.types";
const scope={month:"2026-09",propertyId:"10000000-0000-0000-0000-000000000001",ownerPersonId:"80000000-0000-0000-0000-000000000001"};
beforeEach(()=>{vi.resetAllMocks();mocks.getContext.mockResolvedValue({generation:0,status:"open",enforced:false});mocks.context.mockResolvedValue({organizationId:"org",organizationSlug:"pilot"});mocks.client.mockResolvedValue({});mocks.close.mockResolvedValue({publications:[],series:null});mocks.readContext.mockImplementation(async (_organizationId:string, read:()=>Promise<unknown>)=>read());});
describe("statement report read authority",()=>{
 it.each([undefined, -1, 1.5, 2147483648])("rejects missing or invalid enrolled generation %s before sources", async expectedGeneration=>{
   mocks.getContext.mockResolvedValue({generation:2,status:"open",enforced:true});
   await expect(readStatementReport({...scope,expectedGeneration})).rejects.toThrow("Invalid financial session");
   expect(mocks.close).not.toHaveBeenCalled();
   expect(mocks.balance).not.toHaveBeenCalled();
 });
 it("rejects an old browser generation before reading financial sources", async()=>{
   mocks.getContext.mockResolvedValue({generation:5,status:"open"});
   await expect(readStatementReport({...scope,expectedGeneration:4})).rejects.toThrow("financial session changed");
   expect(mocks.close).not.toHaveBeenCalled();
   expect(mocks.balance).not.toHaveBeenCalled();
 });
 it("allows the original generation after validating it", async()=>{
   mocks.getContext.mockResolvedValue({generation:4,status:"open"});
   mocks.balance.mockResolvedValue({periods:[]});
   expect(await readStatementReport({...scope,expectedGeneration:4})).toBeNull();
   expect(mocks.balance).toHaveBeenCalledOnce();
 });
 it.each(["preparing","stale","open"])("does not present a superseded close as a ready draft when %s",async state=>{
   mocks.close.mockResolvedValue({publications:[],series:{state,currentClosedRevisionId:"old",activeRevisionId:"replacement"},revisions:[{id:"old",status:"closed"}]});
   expect(await readStatementReport(scope)).toBeNull();
   expect(mocks.balance).not.toHaveBeenCalled();
 });
 it("uses frozen descriptions and balances for a closed unpublished revision",async()=>{
   const lines=OWNER_BALANCE_COMPONENTS.flatMap((component,index)=>[
     {id:`open-${index}`,component,lineKind:"opening",lineNumber:index+1,signedAmount:component==="ips_held_owner_cash"?"100.00":"0.00",businessDate:"2026-09-01",sources:[]},
     {id:`close-${index}`,component,lineKind:"closing",lineNumber:index+10,signedAmount:component==="ips_held_owner_cash"?"200.00":"0.00",businessDate:"2026-09-30",sources:[]},
   ]);
   mocks.close.mockResolvedValue({publications:[],series:{currentClosedRevisionId:"revision",activeRevisionId:"revision",state:"closed"},revisions:[{id:"revision",status:"closed",revisionNumber:1,lines:[...lines,{id:"rent",component:"ips_held_owner_cash",lineKind:"movement",lineNumber:5,signedAmount:"100.00",businessDate:"2026-09-02",description:"Frozen September rent",sources:[{sourceType:"rent_payment"}]}]}]});
   const report=await readStatementReport(scope);
   expect(report?.cash.transactions[0].details).toBe("Frozen September rent");
   expect(report?.cash.closingCents).toBe(20000);
   expect(report?.frozen).toBe(true);
   expect(mocks.balance).not.toHaveBeenCalled();
 });
 it("rejects an oversized batch before any reads",async()=>{await expect(readStatementReports(Array(13).fill(scope))).rejects.toThrow("at most twelve");expect(mocks.close).not.toHaveBeenCalled();});
 it("preserves known unit attribution on a reconciled draft",async()=>{mocks.balance.mockResolvedValue({periods:[{monthStart:"2026-09-01",status:"ready",components:[{component:"ips_held_owner_cash",openingAmount:"100.00",closingAmount:"200.00"}]}],sources:[{unitLabel:"Unit 101",eventDate:"2026-09-02",sourceType:"owner_contribution",movements:[{id:"movement",component:"ips_held_owner_cash",signedAmount:"100.00"}]}]});const result=await readStatementReport(scope);expect(result?.unitLabels?.[1]).toBe("Unit 101");expect(result?.cash.closingCents).toBe(20000);});
 it("keeps the report disabled outside Pilot",async()=>{mocks.context.mockResolvedValue({organizationId:"org",organizationSlug:"live"});await expect(readStatementReport(scope)).rejects.toThrow("not enabled");expect(mocks.close).not.toHaveBeenCalled();});
 it("rejects malformed scopes before reading statement data",async()=>{await expect(readStatementReport({...scope,month:"2026-19"})).rejects.toThrow();expect(mocks.close).not.toHaveBeenCalled();});
 it("does not render blocked balances as draft statements",async()=>{mocks.balance.mockResolvedValue({periods:[{monthStart:"2026-09-01",status:"blocked"}]});expect(await readStatementReport(scope)).toBeNull();});
 it("rejects a publication returned for another owner",async()=>{mocks.close.mockResolvedValue({publications:[{id:"published",revisionNumber:1,supersededByPublicationId:null}],series:null});mocks.publication.mockResolvedValue({organizationId:"org",ownerPersonId:"other",propertyId:scope.propertyId,monthStart:"2026-09-01"});await expect(readStatementReport(scope)).rejects.toThrow("Statement scope mismatch");expect(mocks.balance).not.toHaveBeenCalled();});
 it("fails closed when draft cash does not reconcile",async()=>{mocks.balance.mockResolvedValue({periods:[{monthStart:"2026-09-01",status:"ready",components:[{component:"ips_held_owner_cash",openingAmount:"100.00",closingAmount:"200.00"}]}],sources:[]});await expect(readStatementReport(scope)).rejects.toThrow("do not reconcile");});
 it("does not read financial sources when the read context is frozen or outside the reporting period",async()=>{
   mocks.readContext.mockRejectedValue(new Error("Financial reporting is unavailable"));
   await expect(readStatementReport(scope)).rejects.toThrow("Financial reporting is unavailable");
   expect(mocks.readContext).toHaveBeenCalledWith("org",expect.any(Function),"2026-09-01");
   expect(mocks.close).not.toHaveBeenCalled();
   expect(mocks.balance).not.toHaveBeenCalled();
 });
 it("does not return an empty result when the context changes during its read",async()=>{
   mocks.balance.mockResolvedValue({periods:[]});
   mocks.readContext.mockImplementation(async (_organizationId:string,read:()=>Promise<unknown>)=>{await read();throw new Error("Financial data changed");});
   await expect(readStatementReport(scope)).rejects.toThrow("Financial data changed");
   expect(mocks.balance).toHaveBeenCalledOnce();
 });
 it("rejects the complete batch if the context changes between account groups",async()=>{
   mocks.balance.mockResolvedValue({periods:[]});
   mocks.readContext.mockImplementation(async (_organizationId:string,read:()=>Promise<unknown>,periodStart?:string)=>{
     const result=await read();
     if (!periodStart) throw new Error("Financial data changed during batch");
     return result;
   });
   await expect(readStatementReports(Array(4).fill(scope))).rejects.toThrow("Financial data changed during batch");
   expect(mocks.balance).toHaveBeenCalledTimes(4);
   expect(mocks.readContext).toHaveBeenCalledWith("org",expect.any(Function));
 });
});


