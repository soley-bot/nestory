import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),membership:vi.fn(),client:vi.fn(),rpc:vi.fn(),readBoundary:vi.fn()}));
vi.mock("@/lib/finance/financial-write-context.server",()=>({withFinancialIntentReadContext:mocks.readBoundary}));
vi.mock("@/lib/auth/context",()=>({getCurrentUser:mocks.user,getWorkspaceMembershipForUser:mocks.membership}));
vi.mock("@/lib/db/server",()=>({createSupabaseServerClient:mocks.client}));
import { createOrdinarySharedJournalSession,createDormantSharedJournalSession } from "./shared-journal-session";
const lease="00000000-0000-4000-8000-000000000005";
beforeEach(()=>{vi.clearAllMocks();mocks.readBoundary.mockReset();mocks.readBoundary.mockImplementation(async(_org,_intent,read)=>read());mocks.user.mockResolvedValue({id:"00000000-0000-4000-8000-000000000001"});mocks.membership.mockResolvedValue({organizationId:"00000000-0000-4000-8000-000000000002"});mocks.rpc.mockResolvedValue({data:null,error:null});mocks.client.mockResolvedValue({rpc:mocks.rpc});});
it("binds ordinary cookie client and server-resolved organization with no service fallback",async()=>{mocks.user.mockResolvedValue({id:"00000000-0000-4000-8000-000000000001"});mocks.membership.mockResolvedValue({organizationId:"00000000-0000-4000-8000-000000000002"});mocks.rpc.mockResolvedValue({data:null,error:null});mocks.client.mockResolvedValue({rpc:mocks.rpc});await expect(createOrdinarySharedJournalSession().readCurrent(lease)).resolves.toBeNull();expect(mocks.rpc).toHaveBeenCalledWith("get_deposit_rent_journal",{p_org:"00000000-0000-4000-8000-000000000002",p_lease:lease});const count=mocks.user.mock.calls.length;await expect(createDormantSharedJournalSession().readCurrent(lease)).rejects.toThrow("disabled");expect(mocks.user).toHaveBeenCalledTimes(count);});
it("rejects obsolete journal read intent before client creation",async()=>{
 const intent=new FormData();intent.set("__financialGeneration","1");mocks.readBoundary.mockRejectedValueOnce(new Error("The financial session changed"));
 await expect(createOrdinarySharedJournalSession(intent).readCurrent(lease)).rejects.toThrow("session changed");
 expect(mocks.readBoundary).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002",intent,expect.any(Function));
 expect(mocks.client).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it("withholds a journal result when the lifecycle changes while reading it",async()=>{
 const intent=new FormData();intent.set("__financialGeneration","1");
 mocks.readBoundary.mockImplementationOnce(async(_org,_intent,read)=>{await read();throw Error("Financial data changed while loading");});
 await expect(createOrdinarySharedJournalSession(intent).readCurrent(lease)).rejects.toThrow("changed while");
 expect(mocks.client).toHaveBeenCalledWith(intent);expect(mocks.rpc).toHaveBeenCalledOnce();
});
