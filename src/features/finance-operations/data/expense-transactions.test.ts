import { describe, expect, it, vi } from "vitest";
import { groupExpenseTransactionSummaries, loadExpenseTransactions, scopeFinanceOperationsData } from "./finance-operations";
import type { ExpenseSubmissionSummary, FinanceOperationsData } from "../finance-operations.types";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

it("keeps authorized expense choices while scoping the displayed property records", () => {
  const input = data([]);
  input.propertyOptions = [{ id: "p1", label: "First" }, { id: "p2", label: "Second" }];
  input.unitOptions = [{ id: "u1", label: "Unit 1", propertyId: "p1" }, { id: "u2", label: "Unit 2", propertyId: "p2" }];
  const scoped = scopeFinanceOperationsData(input, { propertyId: "p1", unitId: "u1" });
  expect(scoped.propertyOptions.map((item) => item.id)).toEqual(["p1"]);
  expect(scoped.unitOptions.map((item) => item.id)).toEqual(["u1"]);
  expect(scoped.expenseEntryOptions?.propertyOptions).toEqual(input.propertyOptions);
  expect(scoped.expenseEntryOptions?.unitOptions).toEqual(input.unitOptions);
});

function submission(id: string, propertyId = "p1", unitId: string | null = "u1", amount = 10): ExpenseSubmissionSummary {
  return {
    id, propertyId, unitId, internalCost: amount, customerTotal: amount, internalMarkup: 0,
    category: "cleaning", categoryLabel: "Cleaning", date: "2026-09-01", fundingSourceLabel: "Operating bank",
    propertyLabel: propertyId, unitLabel: unitId ?? "All units", reference: "Receipt",
    responsibility: "owner", reviewedAt: null, reviewReason: null, reversalReason: null,
    sourceId: null, sourceType: "general", status: "submitted", submittedAt: "2026-09-01T12:00:00Z",
    submittedByLabel: "Maker", submittedByUserId: "maker", vendorLabel: "Cleaner",
  };
}
const parent = { id: "parent", expenseDate: "2026-09-01", externalPayeeLabel: null, payeeLabel: "Cleaner", reference: "Receipt", status: "submitted" as const };
it("uses the saved Chart account when its internal reconciliation source is hidden", () => {
  const children = [{ ...submission("one"), fundingSourceLabel: "Pay-from account unavailable" }];
  const result = groupExpenseTransactionSummaries(children, [{ ...parent, payFromAccountId: "bank" }],
    lines(children), [], new Map([["bank", "Operating account"], ["other", "Wrong account"]]));
  expect(result[0].fundingSourceLabel).toBe("Operating account");
  expect(groupExpenseTransactionSummaries(children, [{ ...parent, payFromAccountId: "missing" }],
    lines(children), [], new Map([["bank", "Operating account"]]))[0].fundingSourceLabel)
    .toBe("Pay-from account unavailable");
});

function lines(children: ExpenseSubmissionSummary[]) {
  return children.map((child, index) => ({
    description: "Line " + index, ownerCashAmount: null, sortOrder: index + 1,
    submissionId: child.id, transactionId: "parent",
  }));
}
function data(expenseSubmissions: ExpenseSubmissionSummary[]): FinanceOperationsData {
  return {
    expenseSubmissions, accountEntries: [], expenseAccounts: [], financeCategories: [], leaseChargeAccounts: [],
    leaseDepositAccounts: [], leases: [], ownerInvoices: [], payFromAccounts: [], peopleOptions: [], positions: [],
    propertyOptions: [], reconciliationSources: [], rentGenerationExceptions: [], tenantInvoices: [], unitOptions: [],
  };
}

describe("expense transaction scope and completeness", () => {
  it("aggregates exact currency cents across parent children", () => {
    const children = [submission("one", "p1", "u1", 0.1), submission("two", "p1", "u1", 0.2)];
    expect(groupExpenseTransactionSummaries(children, [parent], lines(children))[0]).toMatchObject({
      internalCost: 0.3, customerTotal: 0.3,
    });
  });
  it.each([
    ["different properties", "p2", "u2", 10, true],
    ["different units", "p1", "u2", 10, true],
    ["same unit", "p1", "u1", 30, false],
  ])("scopes by child membership for %s without enabling partial review", (_label, propertyId, unitId, subtotal, blocked) => {
    const children = [submission("one"), submission("two", propertyId, unitId, 20)];
    const grouped = groupExpenseTransactionSummaries(children, [parent], lines(children));
    const scoped = scopeFinanceOperationsData(data(grouped), { propertyId: "p1", unitId: "u1" }).expenseSubmissions;
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ internalCost: subtotal, scopedSubtotal: subtotal, fullTransactionTotal: 30, transactionReviewBlocked: blocked });
    expect(scoped[0].lines).toHaveLength(blocked ? 1 : 2);
    expect(scopeFinanceOperationsData(data(grouped), { propertyId: "unrelated" }).expenseSubmissions).toEqual([]);
  });

  it("retains common-unit identity for two lines on the same unit", () => {
    const children = [submission("one"), submission("two")];
    expect(groupExpenseTransactionSummaries(children, [parent], lines(children))[0]).toMatchObject({ unitId: "u1", unitLabel: "u1" });
  });

  it("retains restricted child history without leaking parent totals or independent review", () => {
    const child = submission("one");
    const grouped = groupExpenseTransactionSummaries([child], [], [], [{ submission_id: "one", transaction_id: "hidden-parent" }]);
    expect(grouped[0]).toMatchObject({ id: "one", transactionId: "hidden-parent", transactionReviewBlocked: true, internalCost: 10 });
    expect(grouped[0].fullTransactionTotal).toBeUndefined();
    const scoped = scopeFinanceOperationsData(data(grouped), { propertyId: "p1" }).expenseSubmissions[0];
    expect(scoped.fullTransactionTotal).toBeUndefined();
    expect(scoped.lines).toHaveLength(1);
  });

  it("fails closed when an expected canonical child is missing", () => {
    const children = [submission("one"), submission("two")];
    expect(() => groupExpenseTransactionSummaries([children[0]], [parent], lines(children))).toThrow(/incomplete/i);
  });
});

describe("complete transaction reads", () => {
  it("loads every child beyond both the 250 history cap and a 500 row page", async () => {
    const parents = Array.from({ length: 26 }, (_, index) => ({
      id: "parent-" + index, status: "approved", expense_date: "2026-09-01", external_payee_label: null,
      payee_label: "Cleaner", reference: "Receipt", pay_from_account_id: "bank", organization_id: "org",
    }));
    const transactionLines = Array.from({ length: 520 }, (_, index) => ({
      id: "line-" + index, transaction_id: "parent-" + Math.floor(index / 20),
      submission_id: "child-" + index, sort_order: index % 20 + 1, description: "Clean", owner_cash_amount: null, organization_id: "org",
    }));
    const children = transactionLines.map((line) => ({ id: line.submission_id, organization_id: "org" }));
    const tables: Record<string, Record<string, unknown>[]> = {
      expense_transactions: parents, expense_transaction_lines: transactionLines, expense_submissions: children,
    };
    const ranges: [number, number][] = [];
    function query(table: string) {
      let rows = [...tables[table]];
      const result = {
        select: () => result,
        eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return result; },
        neq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] !== value); return result; },
        in: (column: string, ids: string[]) => { rows = rows.filter((row) => ids.includes(row[column] as string)); return result; },
        order: () => result,
        limit: (count: number) => { rows = rows.slice(0, count); return result; },
        range: (from: number, to: number) => { if (table === "expense_transaction_lines") ranges.push([from, to]); rows = rows.slice(from, to + 1); return result; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return result;
    }
    const client = { from: query, rpc: (_name: string, args: { p_submission_ids: string[] }) => Promise.resolve({
      data: transactionLines.filter((line) => args.p_submission_ids.includes(line.submission_id)).map((line) => ({
        submission_id: line.submission_id, transaction_id: line.transaction_id,
      })), error: null,
    }) };
    const result = await loadExpenseTransactions(client as never, "org", children.slice(0, 250) as never);
    expect(result.transactions).toHaveLength(26);
    expect(result.lines).toHaveLength(520);
    expect(result.submissions).toHaveLength(520);
    expect(result.childLinks).toHaveLength(520);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });
});
