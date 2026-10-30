import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(() => ({ permission: vi.fn(), context: vi.fn(), accounts: vi.fn(), billing: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("./data/scoped-lease-context", () => ({ loadLeaseRegisterContext: mocks.context }));
vi.mock("./data/leases", () => ({ getLeaseRegisterFilterOptions: vi.fn(),getLeaseBillingFormConfig: mocks.billing }));
vi.mock("@/features/finance-accounts/data/finance-accounts", () => ({ getFinanceAccountsData: mocks.accounts,getLeaseDepositAccountOptions: (accounts: unknown[]) => accounts }));
import { getLeaseDetailFormOptionsAction } from "./lease-filter-actions";

describe("intent-loaded lease choices", () => {
  const leaseId="c7030000-0000-4000-8000-000000005000";
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ organizationId: "org",permissionKeys: new Set(["leases.view"]) });
    mocks.context.mockResolvedValue({ properties: [{ id: "property" }] });
    mocks.billing.mockResolvedValue({ companyOptions: [] });
  });
  it("keeps deposit history available to lease viewers without reading finance choices", async () => {
    expect(await getLeaseDetailFormOptionsAction(leaseId,"deposit")).toEqual({ leaseDepositAccounts: [] });
    expect(mocks.permission).toHaveBeenCalledWith("leases.view");
    expect(mocks.accounts).not.toHaveBeenCalled();
  });
  it("loads only compatible scoped deposit choices after the lease scope check", async () => {
    mocks.permission.mockResolvedValue({ organizationId: "org",permissionKeys: new Set(["finance.view"]) });
    const accounts=[{ id: "shared",propertyId: null },{ id: "local",propertyId: "property" },{ id: "other",propertyId: "other" }];
    mocks.accounts.mockResolvedValue({ groups: [{ accounts }] });
    expect(await getLeaseDetailFormOptionsAction(leaseId,"deposit")).toEqual({ leaseDepositAccounts: accounts.slice(0,2) });
    mocks.context.mockRejectedValueOnce(new Error("Not authorized"));
    await expect(getLeaseDetailFormOptionsAction(leaseId,"deposit")).rejects.toThrow("Not authorized");
    expect(mocks.accounts).toHaveBeenCalledTimes(1);
  });
  it.each([["edit","leases.prepare"],["billing","leases.change_terms"]] as const)("uses the existing %s permission", async (mode,permission) => {
    await getLeaseDetailFormOptionsAction(leaseId,mode);
    expect(mocks.permission).toHaveBeenCalledWith(permission);
    expect(mocks.billing).toHaveBeenCalledWith("org");
  });
});
