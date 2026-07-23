import { describe, expect, it, vi } from "vitest";
import { getPettyCashScreenData } from "@/features/petty-cash/data/petty-cash";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/people/data/person-options", () => ({
  getPersonSelectOptions: vi.fn(async () => []),
}));

describe("getPettyCashScreenData focus", () => {
  it("derives the account and historical period from the organization-scoped entry", async () => {
    const entryId = "11111111-1111-4111-8111-111111111111";
    const queryLog: Array<[string, string, unknown]> = [];
    const client = createClient(
      {
        people: [],
        petty_cash_accounts: [
          makeAccount("account-current", null),
          makeAccount("account-history", "2026-07-20T00:00:00.000Z"),
        ],
        petty_cash_entries: [
          {
            archived_at: null,
            category: "Active supplies",
            clear_date: "2026-05-09",
            company_loss_amount: 0,
            counterparty_person_id: null,
            created_at: "2026-05-09T00:00:00.000Z",
            currency: "USD",
            description: "Active supplies",
            economic_scope: "property_expense",
            entry_kind: "expense",
            id: "22222222-2222-4222-8222-222222222222",
            in_amount: 0,
            invoice_date: "2026-05-09",
            ledger_entry_id: null,
            organization_id: "org-1",
            out_amount: 10,
            owner_bill_status: "not_billable",
            owner_reimbursable_amount: 0,
            owner_reimbursed_amount: 0,
            period_id: "period-history",
            property_id: null,
            receipt_reference: null,
            remark: null,
            status: "posted",
            supplier: "Vendor",
            unit_id: null,
            void_reason: null,
            voided_at: null,
            voided_by: null,
          },
          {
            archived_at: "2026-07-20T00:00:00.000Z",
            category: "Historical supplies",
            clear_date: "2026-05-10",
            company_loss_amount: 0,
            counterparty_person_id: null,
            created_at: "2026-05-10T00:00:00.000Z",
            currency: "USD",
            description: "Historical supplies",
            economic_scope: "property_expense",
            entry_kind: "expense",
            id: entryId,
            in_amount: 0,
            invoice_date: "2026-05-10",
            ledger_entry_id: null,
            organization_id: "org-1",
            out_amount: 25,
            owner_bill_status: "not_billable",
            owner_reimbursable_amount: 0,
            owner_reimbursed_amount: 0,
            period_id: "period-history",
            property_id: null,
            receipt_reference: null,
            remark: null,
            status: "void",
            supplier: "Vendor",
            unit_id: null,
            void_reason: "Duplicate",
            voided_at: "2026-07-20T00:00:00.000Z",
            voided_by: null,
          },
          {
            archived_at: "2026-07-19T00:00:00.000Z",
            category: "Other archived supplies",
            clear_date: "2026-05-08",
            company_loss_amount: 0,
            counterparty_person_id: null,
            created_at: "2026-05-08T00:00:00.000Z",
            currency: "USD",
            description: "Other archived supplies",
            economic_scope: "property_expense",
            entry_kind: "expense",
            id: "33333333-3333-4333-8333-333333333333",
            in_amount: 0,
            invoice_date: "2026-05-08",
            ledger_entry_id: null,
            organization_id: "org-1",
            out_amount: 50,
            owner_bill_status: "not_billable",
            owner_reimbursable_amount: 0,
            owner_reimbursed_amount: 0,
            period_id: "period-history",
            property_id: null,
            receipt_reference: null,
            remark: null,
            status: "void",
            supplier: "Vendor",
            unit_id: null,
            void_reason: "Duplicate",
            voided_at: "2026-07-19T00:00:00.000Z",
            voided_by: null,
          },
        ],
        petty_cash_periods: [
          {
            account_id: "account-history",
            advance_amount: 100,
            counted_cash_amount: 75,
            id: "period-history",
            opening_balance_amount: 100,
            organization_id: "org-1",
            period_start: "2026-05-01",
            status: "closed",
          },
        ],
        properties: [],
        units: [],
      },
      queryLog,
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client);

    const result = await getPettyCashScreenData("org-1", {
      focusedEntryId: entryId,
    });

    expect(result).toMatchObject({
      focusState: "available",
      focusedEntryId: entryId,
      period: { id: "period-history" },
      selectedAccount: { id: "account-history" },
    });
    expect(result.entries.map((entry) => entry.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      entryId,
    ]);
    expect(result.entries[1]).toMatchObject({
      archivedAt: "2026-07-20T00:00:00.000Z",
      id: entryId,
    });
    expect(result.summary.cashOut.primary).toBe("USD 10.00");
    expect(queryLog).toContainEqual(["petty_cash_entries", "organization_id", "org-1"]);
    expect(queryLog).toContainEqual(["petty_cash_entries", "id", entryId]);
  });
});

function makeAccount(id: string, archivedAt: string | null) {
  return {
    account_number: id,
    archived_at: archivedAt,
    currency: "USD",
    custodian_person_id: null,
    float_amount: 100,
    id,
    name: id,
    organization_id: "org-1",
    status: archivedAt ? "inactive" : "active",
  };
}

function createClient(
  rowsByTable: Record<string, Array<Record<string, unknown>>>,
  queryLog: Array<[string, string, unknown]>,
) {
  return {
    from: vi.fn((table: string) => {
      let rows = [...(rowsByTable[table] ?? [])];
      const chain = {
        eq: (column: string, value: unknown) => {
          queryLog.push([table, column, value]);
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[column]));
          return chain;
        },
        is: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        order: () => chain,
        select: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return chain;
    }),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}
