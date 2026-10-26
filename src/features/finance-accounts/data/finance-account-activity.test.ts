import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readBoundary: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  iterateOwnerProfitLossEvents: vi.fn(),
  iteratePropertyCashEvents: vi.fn(),
}));

vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialReadContext: mocks.readBoundary }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock("@/features/finance/data/property-cash-events", () => ({
  iteratePropertyCashEvents: mocks.iteratePropertyCashEvents,
}));
vi.mock("@/features/reports/data/owner-profit-loss-events", () => ({
  iterateOwnerProfitLossEvents: mocks.iterateOwnerProfitLossEvents,
}));

import { getFinanceAccountActivity } from "@/features/finance-accounts/data/finance-account-activity";

const filters = {
  periodEnd: "2026-08-31",
  periodStart: "2026-08-01",
};

describe("getFinanceAccountActivity", () => {
  it("rejects unavailable financial context before any account sources", async () => {
    mocks.readBoundary.mockRejectedValueOnce(new Error("Financial reporting is paused"));
    await expect(getFinanceAccountActivity("org-1", "operating-account", filters)).rejects.toThrow("paused");
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("discards account totals when final source verification fails", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture());
    mocks.readBoundary.mockImplementationOnce(async (_organizationId, read) => {
      await read({ generation: 2 });
      throw new Error("Financial data changed while loading");
    });
    await expect(getFinanceAccountActivity("org-1", "operating-account", filters)).rejects.toThrow("changed while");
  });
  it("passes the actual date start and tags the verified generation", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture());
    expect((await getFinanceAccountActivity("org-1", "operating-account", filters))?.financialGeneration).toBe(2);
    expect(mocks.readBoundary).toHaveBeenCalledWith("org-1", expect.any(Function), "2026-08-01");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readBoundary.mockImplementation(async (_organizationId, read) => read({ generation: 2, financial_start_date: null }));
    mocks.iterateOwnerProfitLossEvents.mockImplementation(() => asyncRows([]));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([]));
  });

  it("includes the 1001st readable property and its exact account authority under a smaller server cap", async () => {
    const properties = Array.from({ length: 1001 }, (_, index) => ({
      id: `property-${String(index).padStart(4, "0")}`, code: "TIE", name: "Synthetic property", archived_at: null,
    }));
    const event = propertyCashEvent({ propertyId: properties[1000].id, amountCents: BigInt(12345),
      eventKey: "deposit_event:last", sourceId: "last", reconciliationSourceId: null });
    const authorities = Array.from({ length: 1001 }, (_, index) => ({
      authority_id: index === 1000 ? event.eventKey : `deposit_event:${index}`,
      authority_kind: "event", event_key: index === 1000 ? event.eventKey : `deposit_event:${index}`,
      event_matches: index === 1000, valid_from: "-infinity", valid_to: null,
    }));
    const client = clientFixture({ properties, authorities });
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.iteratePropertyCashEvents.mockImplementation((_client, scope) => asyncRows(
      scope.propertyId === properties[1000].id ? [event] : [],
    ));
    const activity = await getFinanceAccountActivity("org-1", "operating-account", filters);
    expect(activity?.properties).toHaveLength(1001);
    expect(activity?.rows).toHaveLength(1);
    expect(activity?.rows[0].propertyId).toBe(properties[1000].id);
    expect(activity?.total).toBe("123.45");
    expect(client.from.mock.calls.filter(([table]) => table === "properties")).toHaveLength(7);
    expect(client.rpc).toHaveBeenCalledTimes(7);
  });

  it("batches more than 1000 contact and lease identities without losing the final activity contact", async () => {
    const events = Array.from({ length: 1001 }, (_, index) => ownerProfitLossEvent({
      sourceId: `line-${index}`, eventKey: `tenant_invoice_line:${index}`, sourceType: "tenant_invoice_line",
      sourceParentType: "tenant_invoice", economicClass: "owner_income", categoryCode: "rent", categoryId: "rent-category",
      leaseId: `lease-${index}`, signedAmountCents: BigInt(100),
    }));
    const client = clientFixture({ account: accountRow({ account_class: "income" }),
      categories: [{ id: "rent-category", code: "rent" }], categoryLinks: [{ category_id: "rent-category" }],
      leases: events.map((event, index) => ({ id: event.leaseId, primary_tenant_person_id: `tenant-${index}` })),
      people: events.map((_, index) => ({ id: `tenant-${index}`, display_name: `Tenant ${index}` })),
    });
    mocks.createSupabaseServerClient.mockResolvedValue(client);
    mocks.iterateOwnerProfitLossEvents.mockImplementation(() => asyncRows(events));
    const activity = await getFinanceAccountActivity("org-1", "income", filters);
    expect(activity?.rows).toHaveLength(1001);
    expect(activity?.total).toBe("1001.00");
    expect(activity?.rows.find(row => row.id === events[1000].eventKey)?.contact).toBe("Tenant 1000");
    for (const [index, [table]] of client.from.mock.calls.entries()) {
      if (table !== "leases" && table !== "people") continue;
      const query = client.from.mock.results[index].value;
      expect(query.in.mock.calls[0][1].length).toBeLessThanOrEqual(100);
      expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
      expect(query.order).toHaveBeenCalledWith("id");
    }
  });

  it("shows source-backed bank movements without inventing journal entries", async () => {
    // Break caught: using ledger rows, or ignoring the account's source bridge,
    // can duplicate one cash movement or attribute another bank's activity.
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "asset",
        account_subtype: "bank",
        display_name: "Operating account",
        id: "operating-account",
      }),
      people: [{ display_name: "Tara Tenant", id: "tenant-1" }],
      sourceLinks: [{ source_id: "bank-source-1" }],
    }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([
      propertyCashEvent({
        description: "Rent payment",
        operatingCashEffectCents: BigInt(70_000),
        reconciliationSourceId: "bank-source-1",
        tenantPersonId: "tenant-1",
      }),
      propertyCashEvent({
        description: "Different bank",
        eventKey: "receipt_allocation:receipt-2",
        reconciliationSourceId: "bank-source-2",
        sourceId: "receipt-2",
      }),
    ]));

    const activity = await getFinanceAccountActivity(
      "org-1",
      "operating-account",
      filters,
    );

    expect(activity).not.toBeNull();
    expect(activity?.basisLabel).toBe("Recorded cash activity");
    expect(activity?.rows).toHaveLength(1);
    expect(activity?.rows[0]).toEqual(expect.objectContaining({
      contact: "Tara Tenant",
      decrease: null,
      description: "Rent payment",
      increase: "700.00",
      runningBalance: null,
      sourceHref: "/leases/lease-1",
    }));
    expect(activity?.runningBalance).toBeNull();
    expect(activity?.total).toBe("700.00");
  });

  it("uses mapped recognized events for expense accounts without fabricating a balance", async () => {
    // Break caught: deriving an expense balance by accumulating period rows
    // presents an invented balance that the recognized-event contract does not own.
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "expense",
        account_subtype: "expense",
        archived_at: "2026-09-01T00:00:00.000Z",
        display_name: "Cleaning",
        id: "cleaning",
      }),
      categories: [{ code: "cleaning", id: "category-cleaning" }],
      categoryLinks: [{ category_id: "category-cleaning" }],
      expenseItems: [{ id: "expense-1", vendor_person_id: "vendor-1" }],
      expenseResponsibilities: [{ finance_expense_item_id: "expense-1", owner_invoice_line_id: "line-1" }],
      ownerInvoices: [{ id: "invoice-1", owner_person_id: "owner-1" }],
      people: [{ display_name: "Vera Vendor", id: "vendor-1" }],
    }));
    mocks.iterateOwnerProfitLossEvents.mockImplementation(() => asyncRows([
      ownerProfitLossEvent({
        categoryCode: "cleaning",
        description: "Turnover clean",
        signedAmountCents: BigInt(15_025),
      }),
      ownerProfitLossEvent({
        categoryCode: "utilities",
        description: "Water",
        eventKey: "owner_invoice_line:line-2",
        sourceId: "line-2",
      }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "cleaning", filters);

    expect(activity?.basisLabel).toBe("Expense activity for this period");
    expect(activity?.account.archivedAt).not.toBeNull();
    expect(activity?.rows).toEqual([
      expect.objectContaining({
        contact: "Vera Vendor",
        description: "Turnover clean",
        increase: "150.25",
        runningBalance: null,
        sourceHref: "/properties/property-1/account?activity=costs&month=2026-08&ownerPersonId=owner-1",
      }),
    ]);
    expect(activity?.runningBalance).toBeNull();
  });

  it("uses deposit liability effects and never counts unrelated cash effects", async () => {
    // Break caught: using the event's gross or operating-cash amount for a
    // deposit liability reports the wrong side of a multi-effect settlement.
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "liability",
        account_subtype: "current_liability",
        display_name: "Security deposits",
        id: "deposits",
        system_role: "security_deposits",
        use_for_lease_deposits: true,
      }),
    }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([
      propertyCashEvent({
        amountCents: BigInt(90_000),
        depositLiabilityEffectCents: BigInt(45_000),
        description: "Deposit received",
        economicClass: "security_deposit",
        leaseId: "lease-1",
        operatingCashEffectCents: BigInt(90_000),
        sourceId: "deposit-1",
        sourceType: "deposit_event",
      }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "deposits", filters);

    expect(activity?.basisLabel).toBe("Security deposit activity for this period");
    expect(activity?.rows[0]).toEqual(expect.objectContaining({
      increase: "450.00",
      sourceHref: expect.stringMatching(/^\/leases/),
    }));
    expect(activity?.total).toBe("450.00");
  });

  it.each([false, true])("shows checked deposit liability movements on their original account, reversed=%s", async (reversed) => {
    const events = [propertyCashEvent({
      amountCents: BigInt(0), depositLiabilityEffectCents: BigInt(-10000),
      operatingCashEffectCents: BigInt(0), ownerCashEffectCents: BigInt(0),
      sourceType: "deposit_event", eventKey: "deposit_event:application", sourceId: "application",
      sourceParentType: "deposit_rent_application", sourceParentId: "application-command",
      ledgerEntryId: null, reconciliationSourceId: null, economicClass: "security_deposit",
    })];
    if (reversed) events.push(propertyCashEvent({ ...events[0], eventKey: "deposit_event:reversal", sourceId: "reversal",
      sourceParentId: "reversal-command", depositLiabilityEffectCents: BigInt(10000), isReversal: true }));
    // A malformed/unresolved application must not contribute even with an exact account binding.
    events.push(propertyCashEvent({ ...events[0], eventKey: "deposit_event:unresolved", sourceId: "unresolved",
      resolutionState: "unresolved", depositLiabilityEffectCents: null }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows(events));
    for (const matches of [true, false]) {
      mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
        account: accountRow({ id: "deposits", account_class: "liability", account_subtype: "current_liability",
          archived_at: "2026-09-01", system_role: "security_deposits", use_for_lease_deposits: true }),
        authorities: events.map(event => ({ authority_id: event.eventKey, authority_kind: "event",
          event_key: event.eventKey, event_matches: matches, valid_from: "-infinity", valid_to: null })),
      }));
      const activity = await getFinanceAccountActivity("org-1", "deposits", filters);
      expect(activity?.rows).toHaveLength(matches ? (reversed ? 2 : 1) : 0);
      expect(activity?.total).toBe(matches && !reversed ? "-100.00" : "0.00");
      if (matches) expect(activity?.rows[0]).toMatchObject({ decrease: "100.00", sourceHref: "/leases/lease-1" });
    }
  });

  it("does not invent a bank activity row for a zero-cash deposit reclassification", async () => {
    const event = propertyCashEvent({ amountCents: BigInt(0), depositLiabilityEffectCents: BigInt(-10000),
      sourceType: "deposit_event", sourceParentType: "deposit_rent_application", ledgerEntryId: null,
      operatingCashEffectCents: BigInt(0), ownerCashEffectCents: BigInt(0) });
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([event]));
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ account_class: "asset" }),
      authorities: [{ authority_id: event.eventKey, authority_kind: "event", event_key: event.eventKey,
        event_matches: true, valid_from: "-infinity", valid_to: null }],
    }));
    const activity = await getFinanceAccountActivity("org-1", "bank", filters);
    expect(activity?.rows).toEqual([]);
    expect(activity?.total).toBe("0.00");
  });

  it("returns the same null result for unknown and property-unauthorized accounts", async () => {
    // Break caught: a separate forbidden result or follow-up mapping query can
    // disclose that an inaccessible property-scoped account exists.
    for (const accountId of ["unknown-account", "restricted-account"]) {
      mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({ account: null }));

      await expect(
        getFinanceAccountActivity("org-1", accountId, filters),
      ).resolves.toBeNull();
    }

    expect(mocks.iteratePropertyCashEvents).not.toHaveBeenCalled();
    expect(mocks.iterateOwnerProfitLossEvents).not.toHaveBeenCalled();
  });

  it("loads only the selected readable property", async () => {
    // Break caught: dropping the property filter expands a property-scoped
    // drill-through into other properties available to the operator.
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ id: "operating-account" }),
      sourceLinks: [{ source_id: "bank-source-1" }],
    }));

    await getFinanceAccountActivity("org-1", "operating-account", {
      ...filters,
      propertyId: "property-2",
    });

    expect(mocks.iteratePropertyCashEvents).toHaveBeenCalledTimes(1);
    expect(mocks.iteratePropertyCashEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ propertyId: "property-2" }),
    );
  });

  it("keeps pre-replacement source history on an inactive account", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        archived_at: "2026-09-01T00:00:00.000Z",
        id: "old-bank",
      }),
      authorities: [{
        authority_id: "bank-source-1",
        authority_kind: "source",
        event_key: null,
        event_matches: true,
        valid_from: "-infinity",
        valid_to: "2026-09-01T00:00:00.000Z",
      }],
      sourceLinks: [],
    }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([
      propertyCashEvent({ eventDate: "2026-08-15" }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "old-bank", filters);

    expect(activity?.rows).toHaveLength(1);
    expect(activity?.account.archivedAt).not.toBeNull();
  });

  it("lets an exact workflow binding override a transferred source mapping", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ id: "replacement-bank" }),
      authorities: [
        {
          authority_id: "bank-source-1",
          authority_kind: "source",
          event_key: null,
          event_matches: true,
          valid_from: "2026-09-01T00:00:00.000Z",
          valid_to: null,
        },
        {
          authority_id: "receipt_allocation:receipt-1",
          authority_kind: "event",
          event_key: "receipt_allocation:receipt-1",
          event_matches: false,
          valid_from: "-infinity",
          valid_to: null,
        },
      ],
      sourceLinks: [{ source_id: "bank-source-1" }],
    }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([
      propertyCashEvent({ eventDate: "2026-09-02" }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "replacement-bank", {
      periodEnd: "2026-09-30",
      periodStart: "2026-09-01",
    });

    expect(activity?.rows).toEqual([]);
  });

  it("lets an exact true binding include same-day and backdated activity before temporal fallback", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ id: "bound-bank" }),
      authorities: [
        {
          authority_id: "bank-source-1",
          authority_kind: "source",
          event_key: null,
          event_matches: true,
          valid_from: "2026-09-02T00:00:00.000Z",
          valid_to: null,
        },
        ...["receipt-1", "receipt-2"].map((id) => ({
          authority_id: `receipt_allocation:${id}`,
          authority_kind: "event",
          event_key: `receipt_allocation:${id}`,
          event_matches: true,
          valid_from: "-infinity",
          valid_to: null,
        })),
      ],
    }));
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([
      propertyCashEvent({ eventDate: "2026-09-01" }),
      propertyCashEvent({
        eventDate: "2026-08-15",
        eventKey: "receipt_allocation:receipt-2",
        sourceId: "receipt-2",
      }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "bound-bank", {
      periodEnd: "2026-09-01",
      periodStart: "2026-08-01",
    });

    expect(activity?.rows.map(({ id }) => id)).toEqual([
      "receipt_allocation:receipt-1",
      "receipt_allocation:receipt-2",
    ]);
  });

  it("attributes unbound deposit activity only to the historical security-deposit authority", async () => {
    const event = propertyCashEvent({
      depositLiabilityEffectCents: BigInt(450),
      economicClass: "security_deposit",
      eventKey: "deposit_event:deposit-1",
      sourceId: "deposit-1",
      sourceType: "deposit_event",
    });
    mocks.iteratePropertyCashEvents.mockImplementation(() => asyncRows([event]));
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "liability",
        account_subtype: "current_liability",
        id: "other-deposits",
        system_role: null,
        use_for_lease_deposits: true,
      }),
      authorities: [],
    }));
    expect((await getFinanceAccountActivity("org-1", "other-deposits", filters))?.rows).toEqual([]);

    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "liability",
        account_subtype: "current_liability",
        id: "historic-deposits",
        system_role: null,
        use_for_lease_deposits: true,
      }),
      authorities: [{
        authority_id: "security_deposits",
        authority_kind: "system_role",
        event_key: null,
        event_matches: true,
        valid_from: "-infinity",
        valid_to: "2026-09-01T00:00:00.000Z",
      }],
    }));
    expect((await getFinanceAccountActivity("org-1", "historic-deposits", filters))?.rows).toHaveLength(1);
  });

  it("uses checked owner-balance source movements for Equity accounts", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "equity",
        account_subtype: "equity",
        id: "owner-contributions",
        system_role: "owner_contributions",
      }),
      authorities: [{
        authority_id: "owner_contributions",
        authority_kind: "system_role",
        event_key: null,
        event_matches: true,
        valid_from: "-infinity",
        valid_to: null,
      }],
      ownerAssignments: [{ person_id: "owner-1", property_id: "property-1", started_on: "2020-01-01", ended_on: null }],
      ownerSources: [{
        allocation_set_id: "allocation-1",
        event_date: "2026-08-20",
        source_type: "owner_contribution",
        source_id: "contribution-1",
        source_line_id: "contribution-1",
        gross_signed_amount: "500.00",
        source_fingerprint: "fingerprint",
        allocation_basis: "explicit_owner",
        allocated_gross_signed_amount: "500.00",
        ownership_percent_snapshot: "100.000",
        ownership_roster_hash: "hash",
        reversal_of_allocation_set_id: null,
        movement_id: "movement-1",
        component: "ips_held_owner_cash",
        signed_amount: "500.00",
        reversal_of_movement_id: null,
      }],
      people: [{ display_name: "Owen Owner", id: "owner-1" }],
    }));

    const activity = await getFinanceAccountActivity("org-1", "owner-contributions", filters);

    expect(mocks.iteratePropertyCashEvents).not.toHaveBeenCalled();
    expect(activity?.basisLabel).toBe("Authoritative owner-balance activity");
    expect(activity?.rows[0]).toEqual(expect.objectContaining({
      contact: "Owen Owner",
      increase: "500.00",
      sourceHref: "/properties/property-1/account?activity=owner_cash&month=2026-08&ownerPersonId=owner-1&focusAllocationSetId=allocation-1#owner-source-allocation-1",
    }));
  });

  it("links owner-allocation reversals to the exact corrections row", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({
        account_class: "equity",
        account_subtype: "equity",
        id: "owner-contributions",
        system_role: "owner_contributions",
      }),
      authorities: [{
        authority_id: "owner_balance_source:reversal-allocation-1",
        authority_kind: "event",
        event_key: "owner_balance_source:reversal-allocation-1",
        event_matches: true,
        valid_from: "-infinity",
        valid_to: null,
      }],
      ownerAssignments: [{ person_id: "owner-1", property_id: "property-1", started_on: "2020-01-01", ended_on: null }],
      ownerSources: [{
        allocation_set_id: "reversal-allocation-1",
        event_date: "2026-08-21",
        source_type: "reversal",
        source_id: "reversal-1",
        source_line_id: "reversal-1",
        gross_signed_amount: "-500.00",
        source_fingerprint: "reversal-fingerprint",
        allocation_basis: "explicit_owner",
        allocated_gross_signed_amount: "-500.00",
        ownership_percent_snapshot: "100.000",
        ownership_roster_hash: "reversal-hash",
        reversal_of_allocation_set_id: "allocation-1",
        movement_id: "reversal-movement-1",
        component: "ips_held_owner_cash",
        signed_amount: "-500.00",
        reversal_of_movement_id: "movement-1",
      }],
      people: [{ display_name: "Owen Owner", id: "owner-1" }],
    }));

    const activity = await getFinanceAccountActivity("org-1", "owner-contributions", filters);

    expect(activity?.rows[0]?.sourceHref).toBe(
      "/properties/property-1/account?activity=corrections&month=2026-08&ownerPersonId=owner-1&focusAllocationSetId=reversal-allocation-1#owner-source-reversal-allocation-1",
    );
  });

  it("uses consumed record routes and available contacts for recognized activity", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ account_class: "income", account_subtype: "income", id: "rent" }),
      categories: [{ code: "rent", id: "category-rent" }],
      categoryLinks: [{ category_id: "category-rent" }],
      leases: [{ id: "lease-1", primary_tenant_person_id: "tenant-1" }],
      people: [{ display_name: "Tara Tenant", id: "tenant-1" }],
    }));
    mocks.iterateOwnerProfitLossEvents.mockImplementation(() => asyncRows([
      ownerProfitLossEvent({
        categoryCode: "rent",
        categoryId: "category-rent",
        economicClass: "owner_income",
        leaseId: "lease-1",
        sourceParentId: "invoice-1",
        sourceParentType: "tenant_invoice",
        sourceType: "tenant_invoice_line",
      }),
    ]));

    const activity = await getFinanceAccountActivity("org-1", "rent", filters);

    expect(activity?.rows[0]).toEqual(expect.objectContaining({
      contact: "Tara Tenant",
      sourceHref: "/leases/lease-1",
    }));
  });

  it.each([
    ["income", "tenant_invoice_line", "rent", "owner_income"],
    ["expense", "management_fee_occurrence", "management_fee", "owner_expense"],
  ] as const)("keeps generated %s originals and reversals on their historical account without category IDs", async (accountClass, sourceType, categoryCode, economicClass) => {
    const events = ["original", "reversal"].map((id) => ownerProfitLossEvent({
      categoryId: null, categoryCode, economicClass, sourceType,
      sourceId: id, eventKey: `${sourceType}:${id}`,
      isReversal: id === "reversal",
      signedAmountCents: id === "reversal" ? BigInt(-1000) : BigInt(1000),
    }));
    mocks.iterateOwnerProfitLossEvents.mockImplementation(() => asyncRows(events));
    for (const matches of [true, false]) {
      mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
        account: accountRow({ account_class: accountClass, account_subtype: accountClass,
          id: matches ? "original-account" : "replacement-account", archived_at: matches ? "2026-09-01" : null }),
        authorities: events.map((event) => ({
          authority_id: event.eventKey, authority_kind: "event", event_key: event.eventKey,
          event_matches: matches, valid_from: "-infinity", valid_to: null,
        })),
      }));
      const result = await getFinanceAccountActivity("org-1", matches ? "original-account" : "replacement-account", filters);
      expect(result?.rows).toHaveLength(matches ? 2 : 0);
      expect(result?.total).toBe("0.00");
    }
  });

  it("restricts property choices to a property-scoped account", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(clientFixture({
      account: accountRow({ property_id: "property-1" }),
    }));

    const activity = await getFinanceAccountActivity("org-1", "operating-account", filters);

    expect(activity?.properties).toEqual([{ id: "property-1", label: "RIV · Riverside" }]);
  });

  it("rejects periods longer than 366 days", async () => {
    await expect(getFinanceAccountActivity("org-1", "operating-account", {
      periodEnd: "2026-01-02",
      periodStart: "2025-01-01",
    })).rejects.toThrow("Activity period must be between 1 and 366 days.");
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

function clientFixture({
  account = accountRow(),
  authorities,
  categories = [],
  categoryLinks = [],
  expenseItems = [],
  expenseResponsibilities = [],
  leases = [],
  ownerAssignments = [],
  ownerInvoices = [],
  ownerSources = [],
  people = [],
  properties = [
    { archived_at: null, code: "RIV", id: "property-1", name: "Riverside" },
    { archived_at: null, code: "HIL", id: "property-2", name: "Hill House" },
  ],
  sourceLinks = [],
}: {
  account?: Record<string, unknown> | null;
  authorities?: Record<string, unknown>[];
  categories?: Record<string, unknown>[];
  categoryLinks?: Record<string, unknown>[];
  expenseItems?: Record<string, unknown>[];
  expenseResponsibilities?: Record<string, unknown>[];
  leases?: Record<string, unknown>[];
  ownerAssignments?: Record<string, unknown>[];
  ownerInvoices?: Record<string, unknown>[];
  ownerSources?: Record<string, unknown>[];
  people?: Record<string, unknown>[];
  properties?: Record<string, unknown>[];
  sourceLinks?: Record<string, unknown>[];
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "finance_accounts") return chainQuery({ data: account, error: null });
      if (table === "finance_account_source_links") return chainQuery({ data: sourceLinks, error: null });
      if (table === "finance_account_category_links") return chainQuery({ data: categoryLinks, error: null });
      if (table === "finance_categories") return chainQuery({ data: categories, error: null });
      if (table === "finance_expense_items") return chainQuery({ data: expenseItems, error: null });
      if (table === "ips_expense_responsibilities") return chainQuery({ data: expenseResponsibilities, error: null });
      if (table === "leases") return chainQuery({ data: leases, error: null });
      if (table === "property_owners") return chainQuery({ data: ownerAssignments, error: null });
      if (table === "owner_invoices") return chainQuery({ data: ownerInvoices, error: null });
      if (table === "properties") return chainQuery({ data: properties, error: null });
      if (table === "people") return chainQuery({ data: people, error: null });
      throw new Error(`Unexpected relation: ${table}`);
    }),
    rpc: authorities === undefined && ownerSources.length === 0
      ? undefined
      : vi.fn((name: string) => chainQuery({
          data: name === "get_owner_balance_source_ledger" ? ownerSources : (authorities ?? []),
          error: null,
        })),
  };
}

function chainQuery(result: { data: unknown; error: { message: string } | null }) {
  let start = 0;
  let end = 199;
  let membership: { field: string; ids: string[] } | undefined;
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const rows = Array.isArray(result.data) && membership
        ? result.data.filter(row => membership!.ids.includes(row[membership!.field])) : result.data;
      return Promise.resolve({ ...result, data: Array.isArray(rows) ? rows.slice(start, Math.min(end + 1, start + 200)) : rows })
        .then(resolve, reject);
    },
  };
  query.eq.mockReturnValue(query);
  query.in.mockImplementation((field: string, ids: string[]) => { membership = { field, ids }; return query; });
  query.range.mockImplementation((from: number, to: number) => { start = from; end = to; return query; });
  query.order.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function accountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    account_class: "asset",
    account_number: "1000",
    account_subtype: "bank",
    archived_at: null,
    description: null,
    display_name: "Operating account",
    id: "operating-account",
    property_id: null,
    system_role: "operating_bank",
    use_for_lease_deposits: false,
    ...overrides,
  };
}

function propertyCashEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amountCents: BigInt(70_000),
    categoryCode: "rent",
    contractVersion: "property_cash_events.v1",
    currency: "USD",
    depositLiabilityEffectCents: null,
    description: "Rent payment",
    economicClass: "operating_income",
    eventDate: "2026-08-15",
    eventKey: "receipt_allocation:receipt-1",
    isReversal: false,
    leaseId: "lease-1",
    ledgerEntryId: "ledger-1",
    managementFeeEffectCents: null,
    obligationId: "income-1",
    obligationType: "finance_income_item",
    operatingCashEffectCents: BigInt(70_000),
    organizationId: "org-1",
    ownerCashEffectCents: BigInt(70_000),
    ownerPersonId: null,
    periodStart: "2026-08-01",
    propertyId: "property-1",
    reconciliationSourceId: "bank-source-1",
    reference: null,
    resolutionReason: null,
    resolutionState: "resolved",
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId: "receipt-1",
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_allocation",
    taskId: null,
    tenantPersonId: null,
    unitId: "unit-1",
    vendorPersonId: null,
    ...overrides,
  };
}

function ownerProfitLossEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    categoryCode: "cleaning",
    categoryId: "category-cleaning",
    categoryLabel: "Cleaning",
    categoryReportingGroup: "maintenance",
    contractVersion: "owner_profit_loss_events.v2",
    currency: "USD",
    description: "Turnover clean",
    economicClass: "owner_expense",
    eventKey: "owner_invoice_line:line-1",
    isReversal: false,
    leaseId: null,
    organizationId: "org-1",
    periodStart: "2026-08-01",
    propertyId: "property-1",
    recognitionBasis: "owner_responsibility_obligation",
    recognizedOn: "2026-08-12",
    reversalOfId: null,
    reversalSourceType: null,
    signedAmountCents: BigInt(15_025),
    sourceId: "line-1",
    sourceParentId: "invoice-1",
    sourceParentType: "owner_invoice",
    sourceType: "owner_invoice_line",
    unitId: "unit-1",
    ...overrides,
  };
}

async function* asyncRows<T>(rows: T[]) {
  yield* rows;
}
