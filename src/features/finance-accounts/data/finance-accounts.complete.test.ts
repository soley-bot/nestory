import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";

const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getFinanceAccountsData } from "./finance-accounts";

describe("complete account references", () => {
  beforeEach(() => createSupabaseServerClient.mockReset());
  it.each([1205, 5000])("preserves %i accounts, late defaults, hierarchy, and property labels under the API cap", async size => {
    const accounts = Array.from({ length: size }, (_, index) => ({
      id: `account-${String(index).padStart(5, "0")}`, organization_id: "org", account_class: "asset", account_number: String(index).padStart(5, "0"), account_subtype: "bank", archived_at: null,
      description: null, display_name: `Account ${index}`, parent_account_id: null as string | null, property_id: `property-${index}`, system_role: null,
      use_for_lease_charges: false, use_for_lease_credits: false, use_for_lease_deposits: false,
    }));
    accounts[size - 1].parent_account_id = accounts[0].id;
    const { client, reads } = createCappedReadHarness({
      finance_accounts: accounts,
      finance_account_roles: accounts.map(account => ({ account_id: account.id, organization_id: "org", role_code: "operating_bank" })),
      finance_account_source_links: accounts.map(account => ({ id: `source-${account.id}`, account_id: account.id, organization_id: "org" })),
      finance_account_category_links: accounts.map(account => ({ id: `category-${account.id}`, account_id: account.id, organization_id: "org" })),
      properties: accounts.map((account, index) => ({ id: account.property_id, organization_id: "org", code: `P${index}`, name: `House ${index}`, archived_at: null })),
    }, { apiRowCap: 1000 });
    createSupabaseServerClient.mockResolvedValue(client);
    const result = await getFinanceAccountsData("org");
    const returned = result.groups.flatMap(group => group.accounts);
    expect(returned).toHaveLength(size);
    expect(returned.find(account => account.id === accounts.at(-1)?.id)).toMatchObject({ depth: 1, defaultRoleCodes: ["operating_bank"], propertyLabel: `P${size - 1} · House ${size - 1}` });
    expect(result.properties).toHaveLength(size);
    expect(reads.every(read => read.range && read.range[1] - read.range[0] < 500)).toBe(true);
  });
});
