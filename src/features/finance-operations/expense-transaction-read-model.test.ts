import { describe, expect, it } from "vitest";
import {
  groupExpenseTransactionSummaries,
  type ExpenseTransactionLineSnapshot,
  type ExpenseTransactionSnapshot,
} from "./expense-transaction-read-model";
import type { ExpenseSubmissionSummary } from "./finance-operations.types";

const parent = {
  id: "parent",
  expenseDate: "2026-09-01",
  externalPayeeLabel: null,
  payeeLabel: "Cleaner",
  reference: "Receipt",
  status: "submitted",
} satisfies ExpenseTransactionSnapshot;

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

function lines(children: readonly ExpenseSubmissionSummary[]): ExpenseTransactionLineSnapshot[] {
  return children.map((child, index) => ({
    description: "Line " + index, ownerCashAmount: null, sortOrder: index + 1,
    submissionId: child.id, transactionId: "parent",
  }));
}

describe("expense transaction read model", () => {
  it("rejects a parent without canonical lines", () => {
    expect(() => groupExpenseTransactionSummaries([], [parent], [])).toThrow(
      "Expense transaction children are incomplete. Reload before reviewing.",
    );
  });

  it("rounds each amount field independently per line using the existing Number semantics", () => {
    const children = ["one", "two"].map((id) => ({
      ...submission(id, "p1", "u1", 0.104),
      customerTotal: 1.005,
      internalMarkup: 0.014,
    }));
    const [result] = groupExpenseTransactionSummaries(children, [parent], lines(children));

    expect(result).toMatchObject({
      internalCost: 0.2,
      customerTotal: 2,
      internalMarkup: 0.02,
    });
    expect(result.lines?.map(({ amount, customerTotal, internalMarkup }) => ({
      amount, customerTotal, internalMarkup,
    }))).toStrictEqual([
      { amount: 0.104, customerTotal: 1.005, internalMarkup: 0.014 },
      { amount: 0.104, customerTotal: 1.005, internalMarkup: 0.014 },
    ]);
  });

  it("uses parent correction and payee metadata while inheriting the first sorted child's review fields", () => {
    const children: ExpenseSubmissionSummary[] = [
      submission("later"),
      {
        ...submission("first"),
        adjustsSubmissionId: "adjustment-source",
        previouslyApproved: 3,
        recordedTotal: 13,
        responsibility: "tenant",
        reviewedAt: "2026-09-03T10:00:00Z",
        reviewReason: "Reviewed first",
        reversalReason: "Original reversed",
        sourceId: "source-first",
        submittedAt: "2026-09-02T10:00:00Z",
        submittedByLabel: "First maker",
        submittedByUserId: "first-maker",
      },
    ];
    const transaction = {
      ...parent,
      cancelledAt: "2026-09-04T10:00:00Z",
      replacesTransactionId: "original",
      replacementTransactionId: "replacement",
      payeePersonId: "payee",
      externalPayeeLabel: "External payee",
      payFromAccountId: "bank",
      expenseDate: "2026-09-03",
      payeeLabel: "Parent payee",
      reference: "Parent reference",
      status: "reversed",
    } satisfies ExpenseTransactionSnapshot;
    const transactionLines = lines(children).map((line, index) => ({
      ...line,
      categoryAccountId: index === 1 ? "cleaning-account" : undefined,
      sortOrder: index === 1 ? 1 : 2,
    }));
    const [result] = groupExpenseTransactionSummaries(children, [transaction], transactionLines);

    expect(result).toMatchObject({
      cancelledAt: transaction.cancelledAt,
      replacesTransactionId: "original",
      replacementTransactionId: "replacement",
      payeePersonId: "payee",
      externalPayeeLabel: "External payee",
      payFromAccountId: "bank",
      date: "2026-09-03",
      vendorLabel: "Parent payee",
      reference: "Parent reference",
      status: "reversed",
      adjustsSubmissionId: "adjustment-source",
      previouslyApproved: 3,
      recordedTotal: 13,
      responsibility: "tenant",
      reviewedAt: "2026-09-03T10:00:00Z",
      reviewReason: "Reviewed first",
      reversalReason: "Original reversed",
      sourceId: "source-first",
      submittedAt: "2026-09-02T10:00:00Z",
      submittedByLabel: "First maker",
      submittedByUserId: "first-maker",
    });
    expect(result.lines?.map(({ submissionId, categoryAccountId }) => ({
      submissionId, categoryAccountId,
    }))).toStrictEqual([
      { submissionId: "first", categoryAccountId: "cleaning-account" },
      { submissionId: "later", categoryAccountId: undefined },
    ]);
  });

  it("retains explicit undefined parent metadata instead of inherited child metadata", () => {
    const children = [{
      ...submission("one"),
      cancelledAt: "2026-09-02T10:00:00Z",
      replacesTransactionId: "old",
      replacementTransactionId: "new",
      payeePersonId: "person",
      payFromAccountId: "bank",
    }];
    const [result] = groupExpenseTransactionSummaries(children, [parent], lines(children));

    for (const field of [
      "cancelledAt", "replacesTransactionId", "replacementTransactionId",
      "payeePersonId", "payFromAccountId",
    ]) {
      expect(result).toHaveProperty(field, undefined);
    }
    expect(result.externalPayeeLabel).toBeNull();
    expect(result.lines?.[0]).toHaveProperty("categoryAccountId", undefined);
  });

  it("sorts newest first and retains tied line and summary order without mutating frozen inputs", () => {
    const children = [
      submission("one"),
      submission("two"),
      submission("tied-legacy"),
      { ...submission("newest"), submittedAt: "2026-09-02T12:00:00Z" },
    ];
    const transactions = [parent];
    const transactionLines = [
      { ...lines(children)[1], sortOrder: 1 },
      { ...lines(children)[0], sortOrder: 1 },
    ];
    const childLinks = [{ submission_id: "tied-legacy", transaction_id: "unavailable" }];
    for (const rows of [children, transactions, transactionLines, childLinks]) {
      rows.forEach((row) => Object.freeze(row));
      Object.freeze(rows);
    }
    const [newest, grouped, tied] = groupExpenseTransactionSummaries(
      children, transactions, transactionLines, childLinks,
    );

    expect([newest.id, grouped.id, tied.id]).toStrictEqual(["newest", "parent", "tied-legacy"]);
    expect(grouped.lines?.map((line) => line.submissionId)).toStrictEqual(["two", "one"]);
    expect(children.map((child) => child.id)).toStrictEqual(["one", "two", "tied-legacy", "newest"]);
    expect(transactionLines.map((line) => line.submissionId)).toStrictEqual(["two", "one"]);
  });

  it.each([
    { reference: "Receipt", categoryLabel: "Cleaning", expected: "Receipt" },
    { reference: "", categoryLabel: "Cleaning", expected: "" },
    { reference: null, categoryLabel: "Cleaning", expected: "Cleaning" },
    { reference: null, categoryLabel: "", expected: "" },
    { reference: null, categoryLabel: null, expected: "cleaning" },
    { reference: null, categoryLabel: undefined, expected: "cleaning" },
  ])("uses nullish legacy description fallback for $reference / $categoryLabel", ({ reference, categoryLabel, expected }) => {
    const child = { ...submission("legacy"), reference, categoryLabel };
    const [result] = groupExpenseTransactionSummaries([child], [], []);

    expect(result.lines?.[0].description).toBe(expected);
    expect(result.transactionId).toBeNull();
    expect(result.transactionReviewBlocked).toBe(false);
  });
});

it("uses the saved Chart account when its internal reconciliation source is hidden", () => {
  const children = [{ ...submission("one"), fundingSourceLabel: "Pay-from account unavailable" }];
  const result = groupExpenseTransactionSummaries(children, [{ ...parent, payFromAccountId: "bank" }],
    lines(children), [], new Map([["bank", "Operating account"], ["other", "Wrong account"]]));
  expect(result[0].fundingSourceLabel).toBe("Operating account");
  expect(groupExpenseTransactionSummaries(children, [{ ...parent, payFromAccountId: "missing" }],
    lines(children), [], new Map([["bank", "Operating account"]]))[0].fundingSourceLabel)
    .toBe("Pay-from account unavailable");
});

it("aggregates exact currency cents across parent children", () => {
  const children = [submission("one", "p1", "u1", 0.1), submission("two", "p1", "u1", 0.2)];
  expect(groupExpenseTransactionSummaries(children, [parent], lines(children))[0]).toMatchObject({
    internalCost: 0.3, customerTotal: 0.3,
  });
});

it("retains common-unit identity for two lines on the same unit", () => {
  const children = [submission("one"), submission("two")];
  expect(groupExpenseTransactionSummaries(children, [parent], lines(children))[0]).toMatchObject({ unitId: "u1", unitLabel: "u1" });
});

it("fails closed when an expected canonical child is missing", () => {
  const children = [submission("one"), submission("two")];
  expect(() => groupExpenseTransactionSummaries([children[0]], [parent], lines(children))).toThrow(/incomplete/i);
});

describe("groupExpenseTransactionSummaries", () => {
  it("collapses ordered transaction lines into one review summary and preserves legacy rows", () => {
    const baseSummary = {
      ...submission("submission-1", "property-1", null, 125),
      adjustsSubmissionId: null,
      fundingSourceLabel: "BANK - Operating",
      propertyLabel: "P-001 - Garden Court",
      previouslyApproved: null,
      recordedTotal: null,
      reference: "BILL-42",
      submittedAt: "2026-09-01T08:00:00Z",
      submittedByLabel: "finance@example.com",
      submittedByUserId: "user-1",
      vendorLabel: "Khmer Home Services",
    };
    const secondSummary = {
      ...baseSummary,
      category: "repairs_maintenance",
      categoryLabel: "Repairs & maintenance",
      customerTotal: 75.25,
      id: "submission-2",
      internalCost: 75.25,
      propertyId: "property-2",
      propertyLabel: "P-002 · Riverside",
      unitId: "unit-2",
      unitLabel: "2A",
    };
    const legacySummary = {
      ...baseSummary,
      id: "legacy-submission",
      internalCost: 20,
      customerTotal: 20,
    };

    const grouped = groupExpenseTransactionSummaries(
      [baseSummary, secondSummary, legacySummary],
      [
        {
          expenseDate: "2026-09-01",
          externalPayeeLabel: null,
          id: "transaction-1",
          payeeLabel: "Khmer Home Services",
          reference: "BILL-42",
          status: "submitted" as const,
        },
      ],
      [
        {
          description: "Replace unit lock",
          ownerCashAmount: null,
          sortOrder: 2,
          submissionId: "submission-2",
          transactionId: "transaction-1",
        },
        {
          description: "Lobby deep clean",
          ownerCashAmount: 50,
          sortOrder: 1,
          submissionId: "submission-1",
          transactionId: "transaction-1",
        },
      ],
    );

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      customerTotal: 200.25,
      id: "transaction-1",
      internalCost: 200.25,
      transactionId: "transaction-1",
      vendorLabel: "Khmer Home Services",
    });
    expect(grouped[0].lines).toEqual([
      expect.objectContaining({
        amount: 125,
        description: "Lobby deep clean",
        ownerCashAmount: 50,
        submissionId: "submission-1",
      }),
      expect.objectContaining({
        amount: 75.25,
        description: "Replace unit lock",
        ownerCashAmount: null,
        submissionId: "submission-2",
      }),
    ]);
    expect(grouped[1]).toMatchObject({
      id: "legacy-submission",
      transactionId: null,
    });
    expect(grouped[1].lines).toEqual([
      expect.objectContaining({
        amount: 20,
        submissionId: "legacy-submission",
      }),
    ]);
  });
});
