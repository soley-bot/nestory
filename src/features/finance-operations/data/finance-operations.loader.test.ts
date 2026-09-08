import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getFinanceAccountsData } from "@/features/finance-accounts/data/finance-accounts";
import { getFinanceOperationsData } from "@/features/finance-operations/data/finance-operations";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/features/finance-accounts/data/finance-accounts", () => ({
  getFinanceAccountsData: vi.fn(),
  getExpenseAccountOptions: vi.fn((accounts) =>
    accounts.filter((account: { accountClass: string }) => account.accountClass === "expense"),
  ),
  getLeaseChargeAccountOptions: vi.fn((accounts) =>
    accounts.filter((account: { useForLeaseCharges: boolean }) => account.useForLeaseCharges),
  ),
  getLeaseDepositAccountOptions: vi.fn((accounts) =>
    accounts.filter((account: { useForLeaseDeposits: boolean }) => account.useForLeaseDeposits),
  ),
  getPayFromAccountOptions: vi.fn((accounts) =>
    accounts.filter((account: { accountSubtype: string }) =>
      ["bank", "cash", "petty_cash", "credit_card"].includes(account.accountSubtype),
    ),
  ),
}));

describe("finance operations initial reads", () => {
  it("keeps a readable historical rent invoice when direct property reads are denied", async () => {
    // Break caught: toTenantInvoice drops permitted money rows because the property map is domain-filtered.
    const harness = createFinanceReadHarness({
      scoped_context: { data: { ...emptyContext(), properties: [{ id: "property-1", code: "OLD", name: "Old House", archived_at: "2026-08-01" }] } },
      tenant_invoice_balances: { data: [{ id: "invoice-1", property_id: "property-1", lease_id: "lease-1", invoice_number: "INV-01", issue_date: "2026-07-01", due_date: "2026-07-05", total_amount: 500, balance_due: 125, unit_id: null }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1");
    expect(result.tenantInvoices).toEqual([expect.objectContaining({ id: "invoice-1", propertyLabel: "Old House — OLD", balanceDue: 125 })]);
    expect(result.propertyOptions).toEqual([]);
  });

  it.each([null, {}, { ...emptyContext(), properties: [{ id: "bad" }] }])("fails on malformed finance read context %j", async (data) => {
    const harness = createFinanceReadHarness({ scoped_context: { data } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    await expect(getFinanceOperationsData("organization-1")).rejects.toThrow(/finance read context/i);
  });

  it("preserves separately authorized People choices beyond the related finance labels", async () => {
    // Break caught: a narrow read projection removes legitimate existing vendor choices for People-authorized staff.
    const harness = createFinanceReadHarness({
      scoped_context: { data: emptyContext() },
      people: { data: [{ id: "vendor-1", display_name: "Independent cleaner", party_type: "company", archived_at: null }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1");
    expect(result.peopleOptions).toEqual([{ id: "vendor-1", label: "Independent cleaner", partyType: "company" }]);
  });

  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getFinanceAccountsData).mockReset();
    vi.mocked(getFinanceAccountsData).mockResolvedValue({
      groups: [],
      properties: [],
    });
  });

  it("loads compatible account choices for daily finance work", async () => {
    // Break caught: exposing legacy reconciliation/category identities instead
    // of the customer-facing Chart accounts used by operational forms.
    const accounts = [
      account("asset", "bank", "Operating account"),
      account("liability", "credit_card", "Company card"),
      account("expense", "expense", "Cleaning"),
      account("income", "income", "Rental income", {
        useForLeaseCharges: true,
      }),
      account("liability", "current_liability", "Security deposits", {
        useForLeaseDeposits: true,
      }),
    ];
    vi.mocked(getFinanceAccountsData).mockResolvedValue({
      groups: [
        { accountClass: "asset", accounts: [accounts[0]] },
        { accountClass: "liability", accounts: [accounts[1], accounts[4]] },
        { accountClass: "equity", accounts: [] },
        { accountClass: "income", accounts: [accounts[3]] },
        { accountClass: "expense", accounts: [accounts[2]] },
      ],
      properties: [],
    } as never);
    const harness = createFinanceReadHarness();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);

    const result = await getFinanceOperationsData("organization-1");

    expect(result.payFromAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "Operating account" }),
        expect.objectContaining({ displayName: "Company card" }),
      ]),
    );
    expect(result.expenseAccounts).toContainEqual(
      expect.objectContaining({ displayName: "Cleaning" }),
    );
    expect(result.leaseChargeAccounts).toContainEqual(
      expect.objectContaining({ displayName: "Rental income" }),
    );
    expect(result.leaseDepositAccounts).toContainEqual(
      expect.objectContaining({ displayName: "Security deposits" }),
    );
  });

  it("caps database concurrency while preserving declared result order", async () => {
    // Break caught: restoring the wide Promise.all burst that exhausted the
    // authenticated eight-second statement budget during rapid navigation.
    const harness = createFinanceReadHarness({
      organizations: {
        data: { operational_timezone: "Asia/Phnom_Penh" },
        delayMs: 20,
      },
      properties: {
        data: [
          {
            archived_at: null,
            code: "P-01",
            id: "property-1",
            name: "Palm House",
          },
        ],
        delayMs: 1,
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      harness.client as never,
    );

    const result = await getFinanceOperationsData("organization-1");

    expect(harness.maxInFlight()).toBeLessThanOrEqual(4);
    expect(result.operationalTimezone).toBe("Asia/Phnom_Penh");
    expect(result.propertyOptions).toEqual([
      { id: "property-1", label: "Palm House — P-01" },
    ]);
  });

  it("keeps an initial database error fatal", async () => {
    // Break caught: treating a finance timeout as empty authoritative data.
    const harness = createFinanceReadHarness({
      owner_invoice_balances: {
        data: null,
        error: { message: "canceling statement due to statement timeout" },
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      harness.client as never,
    );

    await expect(
      getFinanceOperationsData("organization-1"),
    ).rejects.toThrow(
      "Could not load finance operations: canceling statement due to statement timeout",
    );
  });

  it("loads the outer lease terms and opening final-month rate for billing preview", async () => {
    const harness = createFinanceReadHarness({
      current_leases: {
        data: [
          {
            id: "lease-1",
            lease_end_date: "2026-08-20",
            lease_start_date: "2026-08-10",
            monthly_rent_amount: 3100,
            primary_tenant_person_id: "person-1",
            property_id: "property-1",
            status: "active",
            tenant_name: "Dara Tenant",
            unit_id: null,
          },
        ],
      },
      lease_terms: {
        data: [
          {
            end_date: "2026-08-09",
            lease_id: "lease-1",
            rent_amount: 1000,
            start_date: "2026-01-15",
          },
          {
            end_date: "2026-08-20",
            lease_id: "lease-1",
            rent_amount: 3100,
            start_date: "2026-08-10",
          },
        ],
      },
      properties: {
        data: [
          {
            archived_at: null,
            code: "P-01",
            id: "property-1",
            name: "Palm House",
          },
        ],
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      harness.client as never,
    );

    const result = await getFinanceOperationsData("organization-1");

    expect(result.leases[0]?.billingPreview).toEqual({
      endDate: "2026-08-20",
      finalMonthRent: 1000,
      firstMonthRent: 1000,
      startDate: "2026-01-15",
    });
  });
});

type QueryResult = {
  data: unknown;
  delayMs?: number;
  error?: { message: string } | null;
};

function createFinanceReadHarness(
  overrides: Record<string, QueryResult> = {},
) {
  overrides = { ...overrides, scoped_context: overrides.scoped_context ?? { data: {
    ...emptyContext(),
    properties: overrides.properties?.data ?? [], units: overrides.units?.data ?? [], people: overrides.people?.data ?? [],
    owner_assignments: overrides.property_owners?.data ?? [],
    leases: ((overrides.current_leases?.data ?? []) as Record<string, unknown>[]).map((row) => ({ archived_at: null, ...row })),
    terms: overrides.lease_terms?.data ?? [], billing_terms: overrides.lease_billing_terms?.data ?? [],
  } } };
  let active = 0;
  let peak = 0;

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private singleRow = false;

    constructor(private readonly table: string) {}

    eq() {
      return this;
    }

    gt() {
      return this;
    }

    in() {
      return this;
    }

    is() {
      return this;
    }

    limit() {
      return this;
    }

    neq() {
      return this;
    }

    order() {
      return this;
    }

    range() {
      return this;
    }

    select() {
      return this;
    }

    single() {
      this.singleRow = true;
      return this;
    }

    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?:
        | ((
            value: { data: unknown; error: unknown },
          ) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): Promise<TResult1 | TResult2> {
      const override = overrides[this.table];
      const value = {
        data:
          override?.data ??
          (this.singleRow ? { operational_timezone: "UTC" } : []),
        error: override?.error ?? null,
      };
      active += 1;
      peak = Math.max(peak, active);

      return new Promise<typeof value>((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve(value);
        }, override?.delayMs ?? 5);
      }).then(onfulfilled, onrejected);
    }
  }

  return {
    client: {
      from: (table: string) => new Query(table),
      rpc: (name: string) => new Query(name === "get_finance_read_context" ? "scoped_context" : "rpc"),
    },
    maxInFlight: () => peak,
  };
}

function account(
  accountClass: string,
  accountSubtype: string,
  displayName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    accountClass,
    accountNumber: null,
    accountSubtype,
    archivedAt: null,
    defaultFor: [],
    depth: 0,
    description: null,
    displayName,
    id: `${displayName.toLowerCase().replaceAll(" ", "-")}-id`,
    parentAccountId: null,
    propertyId: null,
    propertyLabel: null,
    systemRole: null,
    useForLeaseCharges: false,
    useForLeaseCredits: false,
    useForLeaseDeposits: false,
    ...overrides,
  };
}

function emptyContext() {
  return { properties: [], units: [], people: [], owner_assignments: [], leases: [], terms: [], billing_terms: [] };
}
