import { describe,expect,it } from "vitest";
import { unzipSync,strFromU8 } from "fflate";
import { buildApprovedDepositRentReport,type DepositRentOwnerBridge } from "./deposit-rent-approved-report";
import type { DepositRentAllocation,DepositRentEvent } from "./deposit-rent-source";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";
import { ownerStatementCash } from "./owner-statement-cash";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";

const receipt:DepositRentEvent={id:"deposit-receipt",lease_deposit_id:"deposit1",property_id:"p1",unit_id:"u1",event_type:"received",event_date:"2026-09-01",amount:"500.00",currency:"USD",reversal_of_id:null};
const applied:DepositRentEvent={...receipt,id:"application-event",event_type:"applied",event_date:"2026-10-05",amount:"300.00"};
const allocation:DepositRentAllocation={id:"allocation1",application_id:"application1",application_amount:"300.00",deposit_event_id:applied.id,lease_deposit_id:"deposit1",invoice_id:"invoice1",invoice_line_id:"line1",property_id:"p1",unit_id:"u1",currency:"USD",settlement_date:"2026-10-05",custodian:"ips",owner_person_id:null,signed_amount:"300.00",reversal_of_allocation_id:null,reversal_of_application_id:null,custody_confirmation_id:"custody1",line_type:"rent"};
const bridge:DepositRentOwnerBridge={applicationId:"application1",propertyOwnerId:"po1",ownerPersonId:"owner1",liabilityAccountId:"account1",allocationSetId:"owner-set1",custodian:"ips",custodySignedAmount:"-300.00",ipsHeldSignedAmount:"300.00",singleUnchangedOwner:true};
const input={basis:"cash" as const,scope:{organizationId:"org1",propertyIds:["p1"],unitId:"u1",periodStart:"2026-10-01",periodEnd:"2026-10-31"},facts:[],sourceRead:{complete:true,consistency:"verified" as const,fingerprint:"synthetic-verified"},deposits:{organizationId:"org1",events:[receipt,applied],allocations:[allocation],ownerBridges:[bridge]}};
const options={generatedAt:"2026-10-04T00:00:00Z",expectedFingerprint:"synthetic-verified"};
describe("approved local deposit policy through model and real renderers",()=>{
  it("labels the official held-owner-cash movement as deposit reclassification",()=>{
    const amount=canonicalizeSignedOwnerOpeningAmount("300.00");
    const statement=ownerStatementCash({components:[{component:"ips_held_owner_cash",openingAmount:canonicalizeSignedOwnerOpeningAmount("0.00"),closingAmount:amount},
      {component:"security_deposit_custody",openingAmount:canonicalizeSignedOwnerOpeningAmount("500.00"),closingAmount:canonicalizeSignedOwnerOpeningAmount("200.00")}],lines:[{
      id:"movement1",lineKind:"movement",lineNumber:1,component:"ips_held_owner_cash",businessDate:"2026-10-05",signedAmount:amount,
      description:"Deposit applied to rent (IPS custody reclassification; no new bank receipt)",sourceCount:1,
      sources:[{id:"source1",sourceType:"deposit_rent_application",sourceId:"application1",sourceLineId:"application1",sourceFingerprint:"synthetic"}]}]});
    expect(statement.closingCents).toBe(30000);expect(statement.depositCents).toBe(20000);
    expect(statement.transactions[0].type).toBe("Deposit reclassification");expect(statement.transactions[0].details).toContain("no new bank receipt");
  });
  it("recognizes October settlement without a new receipt and exports exact source/date/amount",()=>{
    const result=buildApprovedDepositRentReport(input,options);expect(result.model.incomeCents).toBe(BigInt(30000));
    expect(result.model.lines).toHaveLength(1);expect(result.model.activity.some(fact=>fact.kind==="income_received")).toBe(false);
    const xlsx=strFromU8(unzipSync(buildTrustedReportXlsx(result.report))["xl/worksheets/sheet1.xml"]!);
    const rawPdf=Buffer.from(buildTrustedReportPdf({organizationName:"Synthetic",report:result.report})).toString("latin1");
    const pdf=[...rawPdf.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match=>match[1].replace(/\\([\\()])/g,"$1")).join("");
    for(const text of [xlsx,pdf]){expect(text).toContain("Cash basis");expect(text).toContain("2026-10-05");expect(text).toContain("allocation1");expect(text.replace(/\s+/g,"")).toContain("nonewcashreceipt");}
    for(const text of [xlsx,pdf]){expect(text).toContain("owner-set1");expect(text.replace(/\s+/g,"")).toContain("newbankreceipt0.00.");}
    expect(result.sourceCoverage).toBe("unverified");
  });
  it("deposit receipt stays outside September Cash rent; Accrual retains original recognition",()=>{
    const september={...input,scope:{...input.scope,periodStart:"2026-09-01",periodEnd:"2026-09-30"},deposits:{...input.deposits,events:[receipt],allocations:[],ownerBridges:[]}};
    expect(buildApprovedDepositRentReport(september,options).model.incomeCents).toBe(BigInt(0));
    const recognition={organizationId:"org1",propertyId:"p1",unitId:"u1",currency:"USD" as const,category:"Rent",description:"September rent",obligationId:"invoice1",reversalOfSourceKey:null,sourceType:"tenant_invoice_line",sourceId:"line1",kind:"recognition" as const,direction:"income" as const,recognizedOn:"2026-09-10",signedAmount:"300.00"};
    expect(buildApprovedDepositRentReport({...september,basis:"accrual",facts:[recognition]},options).model.incomeCents).toBe(BigInt(30000));
    expect(buildApprovedDepositRentReport({...input,basis:"accrual",facts:[recognition]},options).model.incomeCents).toBe(BigInt(0));
  });
  it("November reversal keeps separate date and original owner/account identity",()=>{
    const event={...applied,id:"reverse-event",event_type:"reversed" as const,event_date:"2026-11-05",reversal_of_id:applied.id};
    const row={...allocation,id:"reverse-allocation",application_id:"reverse-application",deposit_event_id:event.id,settlement_date:event.event_date,signed_amount:"-300.00",reversal_of_allocation_id:allocation.id,reversal_of_application_id:allocation.application_id};
    const reverseBridge={...bridge,applicationId:row.application_id,allocationSetId:"reverse-set",custodySignedAmount:"300.00",ipsHeldSignedAmount:"-300.00"};
    const november={...input,scope:{...input.scope,periodStart:"2026-11-01",periodEnd:"2026-11-30"},deposits:{...input.deposits,events:[receipt,applied,event],allocations:[allocation,row],ownerBridges:[bridge,reverseBridge]}};
    expect(buildApprovedDepositRentReport(november,options).model.incomeCents).toBe(BigInt(-30000));
    expect(()=>buildApprovedDepositRentReport({...november,deposits:{...november.deposits,ownerBridges:[bridge,{...reverseBridge,ownerPersonId:"owner2"}]}},options)).toThrow("identity mismatch");
  });
  it("owner-held settlement has zero IPS movement; missing or inconsistent bridges are rejected",()=>{
    const owner={...input,deposits:{...input.deposits,allocations:[{...allocation,custodian:"owner" as const,owner_person_id:"owner1"}],ownerBridges:[{...bridge,custodian:"owner" as const,ipsHeldSignedAmount:"0.00"}]}};
    expect(buildApprovedDepositRentReport(owner,options).model.incomeCents).toBe(BigInt(30000));
    expect(buildApprovedDepositRentReport(owner,options).report.rows.find(row=>row.id==="owner-bridge:application1")?.cells.detail).toContain("IPS-held owner cash change 0.00");
    expect(()=>buildApprovedDepositRentReport({...input,deposits:{...input.deposits,ownerBridges:[]}},options)).toThrow("coverage mismatch");
    expect(()=>buildApprovedDepositRentReport({...owner,deposits:{...owner.deposits,ownerBridges:[{...owner.deposits.ownerBridges[0],ipsHeldSignedAmount:"300.00"}]}},options)).toThrow("conservation mismatch");
  });
  it("approval never certifies source coverage, stale fingerprints or unlinked legacy application",()=>{
    expect(buildApprovedDepositRentReport({...input,sourceRead:{...input.sourceRead,complete:false,consistency:"unverified"}},options).model.incomeCents).toBeNull();
    expect(()=>buildApprovedDepositRentReport(input,{...options,expectedFingerprint:"stale"})).toThrow("Refresh");
    const unlinked={...input,deposits:{...input.deposits,allocations:[],ownerBridges:[]}};
    expect(buildApprovedDepositRentReport(unlinked,options).model.incomeCents).toBeNull();
  });
  it("approved rent does not resolve the independent IPS expense/markup timing",()=>{
    const cost={organizationId:"org1",propertyId:"p1",unitId:"u1",currency:"USD" as const,category:"Repairs",description:"IPS vendor cost",obligationId:"owner-invoice",reversalOfSourceKey:null,sourceType:"expense_responsibility",sourceId:"ips80",kind:"manager_funded_cost" as const,vendorPaidOn:"2026-10-01",vendorCost:"80.00",ownerChargeRecognizedOn:"2026-10-02",ownerCharge:"100.00",markup:"20.00",ownerSettlements:[],sourceOfFunds:"unclassified" as const};
    const result=buildApprovedDepositRentReport({...input,facts:[cost]},options);
    expect(result.model.incomeCents).toBe(BigInt(30000));expect(result.model.expenseCents).toBeNull();expect(result.model.netOperatingIncomeCents).toBeNull();
  });
});
