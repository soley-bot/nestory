import { beforeEach,describe,expect,it,vi } from "vitest";
import { getFinanceReportMembershipForUser } from "@/lib/auth/context";
import { getLocalDepositMembership,handleDisabledLocalDepositExport } from "./deposit-rent-local-server";
import { createSupabaseServerClient } from "@/lib/db/server";
vi.mock("@/lib/auth/context",()=>({getCurrentUser:vi.fn(),getFinanceReportMembershipForUser:vi.fn()}));
vi.mock("@/lib/db/server",()=>({createSupabaseServerClient:vi.fn()}));
const fixture=(keys:string[])=>({organizationId:"server-org",organizationName:"Synthetic",branchId:"server-branch",roleId:"server-role",
  permissionContext:{isSuperAdmin:false,permissionKeys:new Set(keys)}}) as unknown as NonNullable<Awaited<ReturnType<typeof getFinanceReportMembershipForUser>>>;
describe("real server binding keeps the existing membership checks and stays disabled",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it("requires both existing permissions even after finance membership succeeds",async()=>{
    for(const keys of [[],["finance.view"],["leases.view"]]){vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue(fixture(keys));expect(await getLocalDepositMembership("actor")).toBeNull();}
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("derives organization and role/branch key from server membership",async()=>{
    vi.mocked(getFinanceReportMembershipForUser).mockResolvedValue(fixture(["leases.view","finance.view"]));
    const result=await getLocalDepositMembership("actor");expect(result?.organizationId).toBe("server-org");expect(result?.authorizationKey).toContain("server-branch");
    expect(getFinanceReportMembershipForUser).toHaveBeenCalledWith("actor");
  });
  it("the concrete handler cannot be activated by request parameters",async()=>{
    const result=await handleDisabledLocalDepositExport(new Request("http://local.test/?enabled=true&basis=cash"));expect(result.status).toBe(404);
    expect(getFinanceReportMembershipForUser).not.toHaveBeenCalled();expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
