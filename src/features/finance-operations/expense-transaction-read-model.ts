import type { ExpenseSubmissionSummary } from "./finance-operations.types";

export type ExpenseTransactionSnapshot = {
  cancelledAt?: string | null;
  replacesTransactionId?: string | null;
  replacementTransactionId?: string | null;
  payeePersonId?: string | null;
  payFromAccountId?: string;
  expenseDate: string;
  externalPayeeLabel: string | null;
  id: string;
  payeeLabel: string;
  reference: string | null;
  status: ExpenseSubmissionSummary["status"];
};

export type ExpenseTransactionLineSnapshot = {
  categoryAccountId?: string;
  description: string;
  ownerCashAmount: number | null;
  sortOrder: number;
  submissionId: string;
  transactionId: string;
};

export function groupExpenseTransactionSummaries(
  submissions: readonly ExpenseSubmissionSummary[],
  transactions: readonly ExpenseTransactionSnapshot[],
  transactionLines: readonly ExpenseTransactionLineSnapshot[],
  childLinks: readonly { submission_id: string; transaction_id: string }[] = [],
  accountLabels: ReadonlyMap<string, string> = new Map(),
): ExpenseSubmissionSummary[] {
  const submissionById = new Map(
    submissions.map((submission) => [submission.id, submission]),
  );
  const linkedSubmissionIds = new Set(
    transactionLines.map((line) => line.submissionId),
  );
  const transactionBySubmissionId = new Map(childLinks.map((link) => [link.submission_id, link.transaction_id]));
  const grouped: ExpenseSubmissionSummary[] = [];

  for (const transaction of transactions) {
    const expectedLines = transactionLines
      .filter((line) => line.transactionId === transaction.id)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const lines = expectedLines
      .flatMap((line) => {
        const submission = submissionById.get(line.submissionId);
        return submission ? [{ line, submission }] : [];
      });
    if (lines.length === 0 || lines.length !== expectedLines.length) {
      throw new Error("Expense transaction children are incomplete. Reload before reviewing.");
    }

    const first = lines[0].submission;
    const propertyIds = new Set(lines.map(({ submission }) => submission.propertyId));
    const unitIds = new Set(lines.map(({ submission }) => submission.unitId));
    grouped.push({
      ...first,
      cancelledAt: transaction.cancelledAt,
      replacesTransactionId: transaction.replacesTransactionId,
      replacementTransactionId: transaction.replacementTransactionId,
      payeePersonId: transaction.payeePersonId,
      externalPayeeLabel: transaction.externalPayeeLabel,
      payFromAccountId: transaction.payFromAccountId,
      category: lines.length === 1 ? first.category : "multiple",
      categoryLabel:
        lines.length === 1 ? first.categoryLabel : `${lines.length} expense lines`,
      customerTotal: lines.reduce(
        (total, { submission }) => total + Math.round(submission.customerTotal * 100),
        0,
      ) / 100,
      date: transaction.expenseDate,
      fundingSourceLabel: transaction.payFromAccountId
        ? accountLabels.get(transaction.payFromAccountId) ?? first.fundingSourceLabel
        : first.fundingSourceLabel,
      id: transaction.id,
      internalCost: lines.reduce(
        (total, { submission }) => total + Math.round(submission.internalCost * 100),
        0,
      ) / 100,
      internalMarkup: lines.reduce(
        (total, { submission }) => total + Math.round(submission.internalMarkup * 100),
        0,
      ) / 100,
      lines: lines.map(({ line, submission }) => ({
        categoryAccountId: line.categoryAccountId,
        amount: submission.internalCost,
        customerTotal: submission.customerTotal,
        internalMarkup: submission.internalMarkup,
        category: submission.category,
        categoryLabel: submission.categoryLabel,
        description: line.description,
        ownerCashAmount: line.ownerCashAmount,
        propertyId: submission.propertyId,
        propertyLabel: submission.propertyLabel,
        submissionId: submission.id,
        unitId: submission.unitId,
        unitLabel: submission.unitLabel,
      })),
      propertyId: propertyIds.size === 1 ? first.propertyId : "multiple",
      propertyLabel:
        propertyIds.size === 1
          ? first.propertyLabel
          : `${propertyIds.size} properties`,
      reference: transaction.reference,
      status: transaction.status,
      transactionId: transaction.id,
      unitId: unitIds.size === 1 ? first.unitId : null,
      unitLabel: unitIds.size === 1 ? first.unitLabel : "Multiple units",
      vendorLabel: transaction.payeeLabel,
    });
  }

  for (const submission of submissions) {
    if (linkedSubmissionIds.has(submission.id)) continue;
    grouped.push({
      ...submission,
      lines: [{
        amount: submission.internalCost,
        customerTotal: submission.customerTotal,
        internalMarkup: submission.internalMarkup,
        category: submission.category,
        categoryLabel: submission.categoryLabel,
        description:
          submission.reference ?? submission.categoryLabel ?? submission.category,
        ownerCashAmount: null,
        propertyId: submission.propertyId,
        propertyLabel: submission.propertyLabel,
        submissionId: submission.id,
        unitId: submission.unitId,
        unitLabel: submission.unitLabel,
      }],
      transactionId: transactionBySubmissionId.get(submission.id) ?? null,
      transactionReviewBlocked: transactionBySubmissionId.has(submission.id),
    });
  }

  return grouped.sort((left, right) =>
    right.submittedAt.localeCompare(left.submittedAt),
  );
}
