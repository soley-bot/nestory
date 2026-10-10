import { expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({user:vi.fn(),membership:vi.fn(),client:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth/context",()=>({getCurrentUser:mocks.user,getWorkspaceMembershipForUser:mocks.membership}));
vi.mock("@/lib/db/server",()=>({createSupabaseServerClient:mocks.client}));
import { createOrdinarySharedJournalSession,createDormantSharedJournalSession } from "./shared-journal-session";
const lease="00000000-0000-4000-8000-000000000005";
it("binds ordinary cookie client and server-resolved organization with no service fallback",async()=>{mocks.user.mockResolvedValue({id:"00000000-0000-4000-8000-000000000001"});mocks.membership.mockResolvedValue({organizationId:"00000000-0000-4000-8000-000000000002"});mocks.rpc.mockResolvedValue({data:null,error:null});mocks.client.mockResolvedValue({rpc:mocks.rpc});await expect(createOrdinarySharedJournalSession().readCurrent(lease)).resolves.toBeNull();expect(mocks.rpc).toHaveBeenCalledWith("get_deposit_rent_journal",{p_org:"00000000-0000-4000-8000-000000000002",p_lease:lease});const count=mocks.user.mock.calls.length;await expect(createDormantSharedJournalSession().readCurrent(lease)).rejects.toThrow("disabled");expect(mocks.user).toHaveBeenCalledTimes(count);});
