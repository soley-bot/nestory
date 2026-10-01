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
  it("excludes confirmed archived rent targets while retaining ended and termless leases needing recovery", async () => {
    const lease = {
      property_id: "property-1", unit_id: null, primary_tenant_person_id: "tenant-1",
      tenant_name: "Tenant", status: "active", lease_start_date: "2026-01-01",
      lease_end_date: "2026-09-01", monthly_rent_amount: 500, archived_at: null,
    };
    const harness = createFinanceReadHarness({
      properties: { data: [
        { id: "property-1", code: "P", name: "Property", archived_at: null },
        { id: "archived-property", code: "OLD", name: "Archived", archived_at: "2026-08-01" },
      ] },
      current_leases: { data: [
        { ...lease, id: "current" },
        { ...lease, id: "ended", status: "ended" },
        { ...lease, id: "archived", archived_at: "2026-08-01" },
        { ...lease, id: "old-property", property_id: "archived-property" },
      ] },
      recovery_leases: { data: ["current", "ended", "archived", "old-property", "termless", "archived-termless"].map((id) => ({
        id, property_id: id === "old-property" ? "archived-property" : "property-1",
        archived_at: id.startsWith("archived") ? "2026-08-01" : null,
      })) },
      rent_generation_exceptions: { data: ["current", "ended", "archived", "old-property", "termless", "archived-termless", "unavailable"].map((id) => ({
        id, lease_id: id, property_id: id === "old-property" ? "archived-property" : "property-1",
        attempt_count: 1, billing_period_start: "2026-08-01", error_code: "billing_setup_missing",
        last_attempt_at: "2026-08-01", safe_message: "Review billing", resolved_at: null,
      })) },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1");
    expect(result.rentBusinessDate).toBe("2026-09-30");
    expect(result.rentGenerationExceptions.map(exception => exception.id)).toEqual(["current", "ended", "termless"]);
  });

  it("bounds owner account activity and loads only referenced expense details", async () => {
    const harness = createFinanceReadHarness({
      properties: { data: [{ id: "property-1", code: "P", name: "Property", archived_at: null }] },
      property_account_entries: { data: Array.from({ length: 601 }, (_, index) => ({ source_id: `cost-${index}`, source_type: "ips_expense_responsibility", property_id: "property-1", event_date: "2026-08-01", created_at: "2026-08-01", amount: 10, running_balance: 100, category: "expense", label: "Cost" })) },
      ips_expense_responsibilities: { data: [{ id: "cost-0", finance_expense_item_id: "item-1" }] },
      expense_submissions: { data: [{ id: "expense-1", approved_finance_expense_item_id: "item-1", property_id: "property-1", expense_date: "2026-08-01", status: "approved", responsibility: "owner", submitted_by: "user", submitted_at: "2026-08-01", internal_cost_amount: 10, customer_total_amount: 10 }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1", "property-1", { accountActivityOnly: true });
    expect(result.accountEntries).toHaveLength(300);
    expect(result.accountActivityIsRecent).toBe(true);
    expect(result.accountSourcesComplete).toBe(false);
    expect(result.expenseSubmissions[0].id).toBe("expense-1");
    expect(result.accountEntries.some(entry => entry.source?.id === "expense-1")).toBe(true);
    expect(harness.queries.filter(query => query.table === "expense_submissions").every(query => query.filters.some(([column]) => column.startsWith("in:")))).toBe(true);
    expect(harness.queries.some(query => query.table === "expense_transactions")).toBe(false);
    expect(harness.queries.some(query => query.table === "tenant_invoice_balances")).toBe(false);
  });
  it("scopes expense reads before pagination on an ordinary property page", async () => {
    const harness = createFinanceReadHarness({
      properties: { data: [{ id: "property-1", code: "P", name: "Property", archived_at: null }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    await getFinanceOperationsData("organization-1", "property-1", { completeTransactionHistory: false });
    const expenseQueries = harness.queries.filter(query => query.table === "expense_submissions");
    expect(expenseQueries.length).toBeGreaterThan(0);
    expect(expenseQueries.every(query => query.filters.some(([column, value]) => column === "property_id" && value === "property-1"))).toBe(true);
    // No child links means there are no relevant parents to hydrate. Do not scan
    // unrelated transaction parents across the organization.
    expect(harness.queries.some(query => query.table === "expense_transactions")).toBe(false);
  });
  it("keeps unscoped history bounded and loads a selected expense month completely", async () => {
    const recent = createFinanceReadHarness();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(recent.client as never);
    await getFinanceOperationsData("organization-1");
    for (const table of ["expense_submissions", "expense_transactions"]) {
      expect(recent.queries.some(query => query.table === table && query.filters.some(([column, value]) => column === "limit" && value === 250))).toBe(true);
    }
    const monthly = createFinanceReadHarness();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(monthly.client as never);
    await getFinanceOperationsData("organization-1", undefined, { expenseMonth: "2026-08" });
    const query = monthly.queries.find(query => query.table === "expense_submissions");
    expect(query?.filters).toContainEqual(["gte:expense_date", "2026-08-01"]);
    expect(query?.filters).toContainEqual(["lt:expense_date", "2026-09-01"]);
    expect(monthly.queries.some(query => query.table === "expense_transactions")).toBe(false);
  });
  it("retains an archived contribution unit's display label without offering it for new entries", async () => {
    const harness = createFinanceReadHarness({
      properties: { data: [{ id: "property-1", code: "P", name: "Property", archived_at: null }] },
      units: { data: [{ id: "unit-1", property_id: "property-1", unit_number: "8F-D2", archived_at: "2026-09-01" }] },
      property_account_entries: { data: [{ source_id: "contribution-1", source_type: "owner_contribution", property_id: "property-1", event_date: "2026-08-01", created_at: "2026-08-01", amount: 100, running_balance: 100, category: "owner_contribution", label: "Owner contribution" }] },
      owner_cash_events: { data: [{ id: "contribution-1", unit_id: "unit-1", property_id: "property-1", event_date: "2026-08-01", owner_person_id: "owner-1" }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1", "property-1", { completeTransactionHistory: true, includeAccountSources: true });
    expect(result.unitOptions).toEqual([]);
    expect(result.accountEntries[0].unitLabel).toContain("8F-D2");
  });
  it("does not read expense tables for rent-only views", async () => {
    const harness = createFinanceReadHarness();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result = await getFinanceOperationsData("organization-1", "property-1", { includeExpenses: false });
    expect(result.expenseSubmissions).toEqual([]);
    expect(harness.queries.some(query => ["expense_submissions", "expense_transactions", "expense_transaction_lines", "tasks"].includes(query.table))).toBe(false);
  });
  it("omits expense hydration without changing portfolio balances, billing, or payment links", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T05:00:00Z"));
    try {
      const baselineHarness = createFinanceReadHarness(portfolioReviewFixture());
      const baselineRpc = vi.spyOn(baselineHarness.client, "rpc");
      vi.mocked(createSupabaseServerClient).mockResolvedValue(baselineHarness.client as never);
      const baseline = await getFinanceOperationsData("organization-1");

      const workHarness = createFinanceReadHarness(portfolioReviewFixture());
      const workRpc = vi.spyOn(workHarness.client, "rpc");
      vi.mocked(createSupabaseServerClient).mockResolvedValue(workHarness.client as never);
      const work = await getFinanceOperationsData("organization-1", undefined, { includeExpenses: false });

      expect(baseline.expenseSubmissions).toEqual([
        expect.objectContaining({
          id: "transaction-1",
          internalCost: 200,
          customerTotal: 220,
          maintenanceTask: expect.objectContaining({ title: "Repair tap" }),
          lines: [expect.objectContaining({ submissionId: "expense-1", amount: 200 })],
        }),
      ]);
      expect(work).toEqual({ ...baseline, expenseSubmissions: [] });
      expect(work.positions).toEqual([
        expect.objectContaining({ propertyId: "property-1", rentIncome: 780, ownerExpense: 200, runningBalance: 502, availableWithdrawal: 140 }),
        expect.objectContaining({ propertyId: "property-2", rentIncome: 1200, ownerExpense: 300, runningBalance: 900, availableWithdrawal: 900 }),
      ]);
      expect(work.tenantInvoices).toEqual([
        expect.objectContaining({
          id: "invoice-1", totalAmount: 780, balanceDue: 640, paidThroughIps: 140,
          generationSource: "scheduled",
          lines: [expect.objectContaining({ id: "rent-line-1", amount: 780, balanceDue: 640 })],
          settlements: [expect.objectContaining({
            id: "payment-1", amount: 140, route: "through_ips", receiptNumber: "RCPT-1",
            receipt: expect.objectContaining({ href: "/api/finance/documents/receipt-artifact-1" }),
          })],
        }),
        expect.objectContaining({ id: "invoice-2", totalAmount: 780, balanceDue: 0, collectedByOwner: 780, settlements: [expect.objectContaining({ id: "confirmation-1", amount: 780, route: "direct_to_owner" })] }),
      ]);
      expect(work.ownerInvoices).toEqual([expect.objectContaining({ id: "owner-invoice-1", totalAmount: 250, paidByOwner: 30, paidFromHeldCash: 20, balanceDue: 200 })]);
      expect(work.leases).toEqual([expect.objectContaining({
        id: "lease-1", monthlyRent: 780, expectedCurrentBillingRuleId: "billing-1",
        billing: expect.objectContaining({ id: "billing-1", collectionRoute: "through_ips", managementFeeValue: 10 }),
        billingPreview: { startDate: "2026-08-01", endDate: "2027-07-31", firstMonthRent: 780, finalMonthRent: 780 },
      })]);
      expect(work.rentGenerationExceptions).toEqual([expect.objectContaining({ id: "exception-1", leaseId: "lease-1", propertyId: "property-1" })]);
      expect(work.peopleOptions).toContainEqual(expect.objectContaining({ id: "tenant-1", partyType: "individual" }));
      expect(work.operationalTimezone).toBe("Asia/Phnom_Penh");
      expect(work.rentBusinessDate).toBe("2026-09-30");

      for (const table of ["expense_submissions", "expense_transactions", "expense_transaction_lines", "tasks"]) {
        expect(baselineHarness.queries.some(query => query.table === table)).toBe(true);
        expect(workHarness.queries.some(query => query.table === table)).toBe(false);
      }
      for (const name of ["get_expense_transaction_child_links", "get_paid_cost_submission_evidence", "get_finance_submission_actor_labels"]) {
        expect(baselineRpc.mock.calls.map(([name]) => name)).toContain(name);
        expect(workRpc.mock.calls.map(([name]) => name)).not.toContain(name);
      }
      expect(workRpc).toHaveBeenCalledWith("get_finance_read_context", { p_organization_id: "organization-1" });
      expect(workRpc).toHaveBeenCalledWith("get_lease_rent_business_date", { p_organization_id: "organization-1" });
      const financialTables = ["property_finance_positions", "tenant_invoice_balances", "owner_invoice_balances", "tenant_invoice_payments", "owner_collection_confirmations"];
      for (const table of financialTables) {
        const queries = workHarness.queries.filter(query => query.table === table);
        expect(queries.length).toBeGreaterThan(0);
        for (const query of queries) expect(query.filters).toContainEqual(["organization_id", "organization-1"]);
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains archived lease context without offering it for new charges", async () => {
    const harness=createFinanceReadHarness({properties:{data:[{id:"property-1",code:"P",name:"Property",archived_at:null}]},units:{data:[{id:"unit-1",property_id:"property-1",unit_number:"101",archived_at:null}]},current_leases:{data:[{id:"old-lease",property_id:"property-1",unit_id:"unit-1",primary_tenant_person_id:"tenant",tenant_name:"Former tenant",status:"ended",lease_start_date:"2025-01-01",lease_end_date:"2025-12-31",monthly_rent_amount:500,archived_at:"2026-01-01"}]}});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result=await getFinanceOperationsData("organization-1","property-1",{completeTransactionHistory:true});
    expect(result.leases).toEqual([]);
    expect(result.historicalLeases).toEqual([expect.objectContaining({id:"old-lease",unitId:"unit-1",tenantLabel:"Former tenant"})]);
  });
  it("batches maintenance context for large complete expense histories", async () => {
    const harness=createFinanceReadHarness({properties:{data:[{id:"property-1",code:"P",name:"Property",archived_at:null}]},expense_submissions:{data:Array.from({length:1101},(_,i)=>({id:`expense-${i}`,property_id:"property-1",source_type:"maintenance_task",source_id:`task-${i}`,expense_date:"2025-01-01",status:"approved",responsibility:"owner",submitted_by:"user",submitted_at:"2025-01-01",internal_cost_amount:1,customer_total_amount:1}))},tasks:{data:Array.from({length:1101},(_,i)=>({id:`task-${i}`,title:`Repair ${i}`,description:null,status:"completed",completed_at:"2025-01-01"}))}});
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result=await getFinanceOperationsData("organization-1","property-1",{completeTransactionHistory:true});
    expect(result.expenseSubmissions).toHaveLength(1101);
    expect(result.expenseSubmissions.every(row=>row.maintenanceTask?.title)).toBe(true);
  });
  it("loads every payment and owner confirmation beyond the API row cap", async () => {
    const harness=createFinanceReadHarness({
      properties:{data:[{id:"property-1",code:"P",name:"Property",archived_at:null}]},
      tenant_invoice_balances:{data:[{id:"invoice-1",property_id:"property-1",lease_id:"lease-1",invoice_number:"INV-1",issue_date:"2025-01-01",due_date:"2025-01-05",total_amount:2402,balance_due:0,unit_id:null}]},
      tenant_invoice_payments:{data:Array.from({length:1201},(_,index)=>({id:`payment-${index}`,invoice_id:"invoice-1",received_date:"2025-01-02",amount:1,reversal_of_id:null}))},
      owner_collection_confirmations:{data:Array.from({length:1201},(_,index)=>({id:`confirmation-${index}`,invoice_id:"invoice-1",confirmed_date:"2025-01-02",amount:1,reversal_of_id:null}))},
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result=await getFinanceOperationsData("organization-1","property-1",{completeTransactionHistory:true});
    expect(result.tenantInvoices[0].settlements.filter(row=>row.route==="through_ips")).toHaveLength(1201);
    expect(result.tenantInvoices[0].settlements.filter(row=>row.route==="direct_to_owner")).toHaveLength(1201);
  });
  it("loads historical transactions beyond the old caps for the scoped workspace", async () => {
    const harness=createFinanceReadHarness({
      properties:{data:[{id:"property-1",code:"P",name:"Property",archived_at:null}]},
      tenant_invoice_balances:{data:Array.from({length:601},(_,index)=>({id:`invoice-${index}`,property_id:"property-1",lease_id:"lease-1",invoice_number:`INV-${index}`,issue_date:"2025-01-01",due_date:"2025-01-05",total_amount:500,balance_due:0,unit_id:null}))},
      property_account_entries:{data:Array.from({length:601},(_,index)=>({source_id:`source-${index}`,property_id:"property-1",event_date:"2025-01-01",created_at:"2025-01-01",category:"opening",label:"Opening",source_type:"opening_balance",amount:10,running_balance:10}))},
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(harness.client as never);
    const result=await getFinanceOperationsData("organization-1","property-1",{completeTransactionHistory:true,includeAccountSources:true});
    expect(result.tenantInvoices).toHaveLength(601);
    expect(result.accountEntries).toHaveLength(601);
    expect(result.accountSourcesComplete).toBe(true);
  });
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
    ...(overrides.recovery_leases ? { recovery_leases: overrides.recovery_leases.data } : {}),
    terms: overrides.lease_terms?.data ?? [], billing_terms: overrides.lease_billing_terms?.data ?? [],
  } } };
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  let active = 0;
  let peak = 0;

  class Query implements PromiseLike<{ data: unknown; error: unknown }> {
    private singleRow = false;
    private bounds?: [number, number];
    private taskIds?: string[];

    private readonly filters: Array<[string, unknown]> = [];
    constructor(private readonly table: string) {
      queries.push({ table, filters: this.filters });
    }

    eq(column: string, value: unknown) {
      this.filters.push([column, value]);
      return this;
    }

    gte(column: string, value: unknown) { this.filters.push([`gte:${column}`, value]); return this; }
    lt(column: string, value: unknown) { this.filters.push([`lt:${column}`, value]); return this; }

    gt() {
      return this;
    }

    in(column: string, ids: string[]) {
      this.filters.push([`in:${column}`, ids]);
      if (this.table === "tasks" && column === "id") {
        if (ids.length > 1000) throw new Error("Task lookup exceeds request size");
        this.taskIds=ids;
      }
      return this;
    }

    is() {
      return this;
    }

    limit(count:number) { this.filters.push(["limit", count]); this.bounds=[0,count-1]; return this; }

    neq() {
      return this;
    }

    order() {
      return this;
    }

    range(from:number,to:number) { this.bounds=[from,to]; return this; }

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
          (this.table === "rent_business_date"
            ? "2026-09-30"
            : this.singleRow ? { operational_timezone: "UTC" } : []),
        error: override?.error ?? null,
      };
      if (this.taskIds && Array.isArray(value.data)) value.data=value.data.filter(row=>this.taskIds!.includes(row.id));
      if (Array.isArray(value.data)) value.data=this.bounds ? value.data.slice(this.bounds[0],this.bounds[1]+1) : value.data.slice(0,1000);
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
      rpc: (name: string) => new Query(
        name === "get_finance_read_context"
          ? "scoped_context"
          : name === "get_lease_rent_business_date"
            ? "rent_business_date"
            : "rpc",
      ),
    },
    maxInFlight: () => peak,
    queries,
  };
}

function portfolioReviewFixture(): Record<string, QueryResult> {
  return {
    organizations: { data: { operational_timezone: "Asia/Phnom_Penh" } },
    properties: { data: [
      { id: "property-1", code: "P-01", name: "Palm House", archived_at: null },
      { id: "property-2", code: "P-02", name: "River House", archived_at: null },
    ] },
    units: { data: [{ id: "unit-1", property_id: "property-1", unit_number: "101", archived_at: null }] },
    people: { data: [
      { id: "tenant-1", display_name: "Dara Tenant", party_type: "individual", archived_at: null },
      { id: "owner-1", display_name: "Sokha Owner", party_type: "individual", archived_at: null },
      { id: "owner-2", display_name: "River Owner", party_type: "individual", archived_at: null },
    ] },
    property_owners: { data: [1, 2].map(number => ({
      id: `ownership-${number}`, property_id: `property-${number}`, person_id: `owner-${number}`,
      is_primary: true, started_on: "2026-01-01", ended_on: null, archived_at: null,
    })) },
    current_leases: { data: [{
      id: "lease-1", property_id: "property-1", unit_id: "unit-1", primary_tenant_person_id: "tenant-1",
      tenant_name: "Dara Tenant", status: "active", monthly_rent_amount: 780,
      lease_start_date: "2026-08-01", lease_end_date: "2027-07-31", archived_at: null,
    }] },
    lease_terms: { data: [{ lease_id: "lease-1", start_date: "2026-08-01", end_date: "2027-07-31", rent_amount: 780 }] },
    lease_billing_terms: { data: [{
      id: "billing-1", organization_id: "organization-1", property_id: "property-1", lease_id: "lease-1",
      archived_at: null, created_at: "2026-08-01T00:00:00Z", effective_from: "2026-08-01", effective_to: "2027-07-31",
      billing_recipient_kind: "individual", billing_recipient_person_id: "tenant-1",
      charge_management_fee_when_active: true, charge_through_lease_end: true, collection_route: "through_ips",
      final_period_prorated_amount: null, first_period_prorated_amount: null, full_management_fee_during_proration: true,
      lease_end_proration_rule: "actual_days", lease_start_proration_rule: "actual_days",
      management_fee_mode: "percentage", management_fee_value: 10, mid_period_rent_change_rule: "next_full_month",
      rent_calculation_timezone: "Asia/Phnom_Penh", rule_source: "lease_default_v1", short_month_due_day_rule: "last_calendar_day",
    }] },
    tenant_invoice_balances: { data: [
      { id: "invoice-1", property_id: "property-1", unit_id: "unit-1", lease_id: "lease-1", invoice_number: "INV-09", issue_date: "2026-09-01", due_date: "2026-09-05", collection_route: "through_ips", total_amount: 780, paid_through_ips: 140, collected_by_owner: 0, balance_due: 640, payment_status: "partial", recipient_label: "Dara Tenant" },
      { id: "invoice-2", property_id: "property-1", unit_id: "unit-1", lease_id: "lease-1", invoice_number: "INV-08", issue_date: "2026-08-01", due_date: "2026-08-05", collection_route: "direct_to_owner", total_amount: 780, paid_through_ips: 0, collected_by_owner: 780, balance_due: 0, payment_status: "paid", recipient_label: "Dara Tenant" },
    ] },
    tenant_invoice_line_balances: { data: [1, 2].map(number => ({ id: `rent-line-${number}`, invoice_id: `invoice-${number}`, amount: 780, balance_due: number === 1 ? 640 : 0, customer_label: "Rent", line_type: "rent", sort_order: 0 })) },
    tenant_invoices: { data: [1, 2].map(number => ({ id: `invoice-${number}`, billing_period_start: number === 1 ? "2026-09-01" : "2026-08-01", generation_source: "scheduled", is_prorated: false })) },
    tenant_invoice_payments: { data: [{ id: "payment-1", invoice_id: "invoice-1", received_date: "2026-09-03", amount: 140, reference: "BANK-140", reversal_of_id: null, reversal_reason: null }] },
    owner_collection_confirmations: { data: [{ id: "confirmation-1", invoice_id: "invoice-2", confirmed_date: "2026-08-05", amount: 780, reference: "OWNER-780", reversal_of_id: null, reversal_reason: null }] },
    tenant_commercial_document_artifacts: { data: [{ id: "receipt-artifact-1", organization_id: "organization-1", source_kind: "receipt", source_id: "payment-1", document_number: "RCPT-1", publication_status: "published", published_at: "2026-09-03T05:00:00Z", presentation_snapshot: null }] },
    owner_invoice_balances: { data: [{ id: "owner-invoice-1", property_id: "property-1", owner_person_id: "owner-1", invoice_number: "OWNER-09", due_date: "2026-09-10", total_amount: 250, paid_by_owner: 30, paid_from_held_cash: 20, balance_due: 200, payment_status: "partial" }] },
    property_finance_positions: { data: [
      { property_id: "property-1", property_code: "P-01", property_name: "Palm House", owner_person_id: "owner-1", rent_income: 780, management_fee_expense: 78, owner_expense: 200, withdrawals: 0, running_balance: 502, cash_held_by_ips: 140, available_withdrawal: 140, owner_owes_ips: 200 },
      { property_id: "property-2", property_code: "P-02", property_name: "River House", owner_person_id: "owner-2", rent_income: 1200, management_fee_expense: 0, owner_expense: 300, withdrawals: 0, running_balance: 900, cash_held_by_ips: 900, available_withdrawal: 900, owner_owes_ips: 0 },
    ] },
    rent_generation_exceptions: { data: [{ id: "exception-1", property_id: "property-1", lease_id: "lease-1", attempt_count: 2, billing_period_start: "2026-09-01", error_code: "billing_recipient_invalid", last_attempt_at: "2026-09-01T00:00:00Z", safe_message: "Review billing recipient", resolved_at: null }] },
    expense_submissions: { data: [{
      id: "expense-1", property_id: "property-1", unit_id: "unit-1", source_type: "maintenance_task", source_id: "task-1",
      expense_date: "2026-09-08", status: "submitted", responsibility: "owner", submitted_by: "staff-1", submitted_at: "2026-09-08T00:00:00Z",
      internal_cost_amount: 200, internal_markup_amount: 20, customer_total_amount: 220, customer_category: "repairs_maintenance",
      vendor_label: "Tap Repairs", reference: "Repair invoice", reconciliation_source_id: null,
      previously_approved_amount: null, recorded_total_amount: null, reviewed_at: null, review_reason: null, reversal_reason: null,
    }] },
    expense_transactions: { data: [{ id: "transaction-1", expense_date: "2026-09-08", submitted_at: "2026-09-08T00:00:00Z", status: "submitted", external_payee_label: "Tap Repairs", payee_label: "Tap Repairs", payee_person_id: null, reference: "Repair invoice" }] },
    expense_transaction_lines: { data: [{ transaction_id: "transaction-1", submission_id: "expense-1", sort_order: 0, description: "Tap repair", owner_cash_amount: null, category_account_id: "repairs-account" }] },
    tasks: { data: [{ id: "task-1", title: "Repair tap", description: "Kitchen tap leaks", status: "completed", completed_at: "2026-09-08T00:00:00Z" }] },
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
