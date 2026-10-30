import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";
import { parseFinanceAccountQuery } from "../finance-account-query";
const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getFinanceAccountRegisterData } from "./finance-accounts";

describe("account register page hydration", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());
  it.each([1205,5000])("hydrates only the last page in a %i-account chart", async count => {
    const pageSize=50;
    const page=Math.ceil(count/pageSize);
    const pageCount=count-(page-1)*pageSize;
    const accounts=Array.from({length:count},(_,index)=>({ id:`a-${index}`, organization_id:"org", account_class:"asset",account_number:String(index),account_subtype:"bank",archived_at:null,description:null,display_name:`Account ${index}`,parent_account_id:null,property_id:`p-${index}`,system_role:null,use_for_lease_charges:false,use_for_lease_credits:false,use_for_lease_deposits:false }));
    const harness=createCappedReadHarness({ finance_account_roles:accounts.map(account=>({organization_id:"org",account_id:account.id,role_code:"operating_bank"})), finance_account_source_links:[],finance_account_category_links:[],properties:accounts.map((account,index)=>({id:account.property_id,organization_id:"org",code:`P${index}`,name:`House ${index}`,archived_at:null})) });
    const rpc=vi.fn(async()=>({data:{accounts:accounts.slice(-pageCount),pagination:{page,pageSize,totalCount:count,totalPages:page,from:(page-1)*pageSize+1,to:count}},error:null}));
    createSupabaseServerClient.mockResolvedValue({...harness.client,rpc});
    const result=await getFinanceAccountRegisterData("org",parseFinanceAccountQuery({page:String(page)}));
    expect(result.groups.flatMap(group=>group.accounts)).toHaveLength(pageCount);
    expect(result.groups[0].accounts.at(-1)).toMatchObject({id:`a-${count-1}`,propertyLabel:`P${count-1} · House ${count-1}`,defaultRoleCodes:["operating_bank"]});
    expect(harness.reads.every(read=>read.filters.some(filter=>filter.method==="in" && Array.isArray(filter.value) && filter.value.length<=pageSize))).toBe(true);
    expect(harness.reads.reduce((total,read)=>total+(read.returnedRows??0),0)).toBe(pageCount*2);
    expect(rpc).toHaveBeenCalledWith("get_finance_account_register_page",expect.objectContaining({p_page:page,p_page_size:pageSize}));
  });
  it.each([
    { totalCount: 1,totalPages: 1,page: 1,pageSize: 50,from: 1,to: 1 },
    { totalCount: 0,totalPages: 2,page: 1,pageSize: 50,from: 0,to: 0 },
    { totalCount: 0,totalPages: 1,page: 1,pageSize: 100,from: 0,to: 0 },
  ])("fails closed when page bounds and returned rows disagree", async pagination => {
    const rpc=vi.fn().mockResolvedValue({ data: { accounts: [],pagination },error: null });
    const from=vi.fn();
    createSupabaseServerClient.mockResolvedValue({ rpc,from });
    await expect(getFinanceAccountRegisterData("org",parseFinanceAccountQuery({}))).rejects.toThrow("malformed rows");
    expect(from).not.toHaveBeenCalled();
  });
});
