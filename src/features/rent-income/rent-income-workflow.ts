import type { RentIncomeStatus } from "@/features/rent-income/rent-income.types";

export type RentIncomeWorkflow = {
  canPost: boolean;
  canRecordReceipt: boolean;
  nextAction: string;
  ownerStatementState: "full_cash" | "no_cash" | "partial_cash";
  remainingAmount: number;
  stageLabel: string;
};

export function getRentIncomeWorkflow({
  amountDue,
  amountReceived,
  ledgerEntryId,
  status,
}: {
  amountDue: number;
  amountReceived: number;
  ledgerEntryId: string | null;
  status: RentIncomeStatus;
}): RentIncomeWorkflow {
  const remainingAmount = Math.max(0, amountDue - amountReceived);
  const posted = status === "posted" || Boolean(ledgerEntryId);
  const voided = status === "void";
  const fullyReceived = amountReceived >= amountDue && amountDue > 0;
  const canRecordReceipt = !posted && !voided && remainingAmount > 0;
  const canPost = !posted && !voided && fullyReceived;
  const ownerStatementState =
    amountReceived <= 0
      ? "no_cash"
      : fullyReceived
        ? "full_cash"
        : "partial_cash";

  if (posted) {
    return {
      canPost: false,
      canRecordReceipt: false,
      nextAction: "Posted to ledger",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Posted",
    };
  }

  if (voided) {
    return {
      canPost: false,
      canRecordReceipt: false,
      nextAction: "No further action",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Voided",
    };
  }

  if (fullyReceived) {
    return {
      canPost,
      canRecordReceipt,
      nextAction: "Post to ledger",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Receipt complete",
    };
  }

  if (amountReceived > 0) {
    return {
      canPost,
      canRecordReceipt,
      nextAction: "Record remaining receipt",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Partially received",
    };
  }

  return {
    canPost,
    canRecordReceipt,
    nextAction: "Record receipt",
    ownerStatementState,
    remainingAmount,
    stageLabel: "Charge created",
  };
}
