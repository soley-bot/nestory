import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),close:vi.fn(),client:vi.fn(),publication:vi.fn(),balance:vi.fn()}));
vi.mock("@/lib/auth/context",()=>({requireOwnerBalanceReadContext:mocks.context}));
vi.mock("@/lib/db/server",()=>({createSupabaseServerClient:mocks.client}));
vi.mock("@/features/owner-close/data/owner-close",()=>({getOwnerCloseData:mocks.close}));
vi.mock("@/features/reports/data/owner-statement-report",()=>({loadOwnerStatementPublication:mocks.publication}));
vi.mock("./data/owner-balances",()=>({getOwnerBalanceData:mocks.balance}));
import { readStatementReport } from "./statement-report-action";
const scope={month:"2026-09",propertyId:"10000000-0000-0000-0000-000000000001",ownerPersonId:"80000000-0000-0000-0000-000000000001"};
beforeEach(()=>{vi.resetAllMocks();mocks.context.mockResolvedValue({organizationId:"org",organizationSlug:"pilot"});mocks.client.mockResolvedValue({});mocks.close.mockResolvedValue({publications:[],series:null});});
describe("statement report read authority",()=>{
 it("keeps the report disabled outside Pilot",async()=>{mocks.context.mockResolvedValue({organizationId:"org",organizationSlug:"live"});await expect(readStatementReport(scope)).rejects.toThrow("not enabled");expect(mocks.close).not.toHaveBeenCalled();});
 it("rejects malformed scopes before reading statement data",async()=>{await expect(readStatementReport({...scope,month:"2026-19"})).rejects.toThrow();expect(mocks.close).not.toHaveBeenCalled();});
 it("does not render blocked balances as draft statements",async()=>{mocks.balance.mockResolvedValue({periods:[{monthStart:"2026-09-01",status:"blocked"}]});expect(await readStatementReport(scope)).toBeNull();});
 it("rejects a publication returned for another owner",async()=>{mocks.close.mockResolvedValue({publications:[{id:"published",revisionNumber:1,supersededByPublicationId:null}],series:null});mocks.publication.mockResolvedValue({organizationId:"org",ownerPersonId:"other",propertyId:scope.propertyId,monthStart:"2026-09-01"});await expect(readStatementReport(scope)).rejects.toThrow("Statement scope mismatch");expect(mocks.balance).not.toHaveBeenCalled();});
 it("fails closed when draft cash does not reconcile",async()=>{mocks.balance.mockResolvedValue({periods:[{monthStart:"2026-09-01",status:"ready",components:[{component:"ips_held_owner_cash",openingAmount:"100.00",closingAmount:"200.00"}]}],sources:[]});await expect(readStatementReport(scope)).rejects.toThrow("do not reconcile");});
});

