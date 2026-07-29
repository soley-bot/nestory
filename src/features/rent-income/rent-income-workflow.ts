import type {
  RentIncomeStatus,
  RentIncomeType,
} from "@/features/rent-income/rent-income.types";

const unsupportedAtomicSettlementTypes = new Set<RentIncomeType>([
  "security_deposit",
  "owner_contribution",
  "management_fee",
  "leasing_commission",
  "service_fee",
  "maintenance_markup",
]);

export type RentIncomeWorkflow = {
  canRecordReceipt: boolean;
  nextAction: string;
  ownerStatementState: "full_cash" | "no_cash" | "partial_cash";
  remainingAmount: number;
  stageLabel: string;
};

export function getRentIncomeWorkflow({
  amountDue,
  amountReceived,
  incomeType,
  ledgerEntryId,
  status,
}: {
  amountDue: number;
  amountReceived: number;
  incomeType: RentIncomeType;
  ledgerEntryId: string | null;
  status: RentIncomeStatus;
}): RentIncomeWorkflow {
  const remainingAmount = Math.max(0, amountDue - amountReceived);
  const posted = status === "posted" || Boolean(ledgerEntryId);
  const voided = status === "void";
  const fullyReceived = amountReceived >= amountDue && amountDue > 0;
  const settlementSupported =
    !unsupportedAtomicSettlementTypes.has(incomeType);
  const canRecordReceipt =
    settlementSupported && !posted && !voided && remainingAmount > 0;
  const ownerStatementState =
    amountReceived <= 0
      ? "no_cash"
      : fullyReceived
        ? "full_cash"
        : "partial_cash";

  if (posted) {
    return {
      canRecordReceipt: false,
      nextAction: "Legacy posted",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Legacy posted",
    };
  }

  if (voided) {
    return {
      canRecordReceipt: false,
      nextAction: "No further action",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Voided",
    };
  }

  if (!settlementSupported) {
    return {
      canRecordReceipt: false,
      nextAction: "Use dedicated workflow",
      ownerStatementState,
      remainingAmount,
      stageLabel: amountReceived > 0 ? "Legacy receipt" : "Charge created",
    };
  }

  if (fullyReceived) {
    return {
      canRecordReceipt,
      nextAction: "Settled",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Settled and projected",
    };
  }

  if (amountReceived > 0) {
    return {
      canRecordReceipt,
      nextAction: "Record remaining receipt",
      ownerStatementState,
      remainingAmount,
      stageLabel: "Partially received",
    };
  }

  return {
    canRecordReceipt,
    nextAction: "Record receipt",
    ownerStatementState,
    remainingAmount,
    stageLabel: "Charge created",
  };
}
