import { describe, expect, it } from "vitest";
import { getRentIncomeWorkflow } from "@/features/rent-income/rent-income-workflow";

describe("getRentIncomeWorkflow", () => {
  it("keeps a charge-only row available for its first atomic receipt", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 0,
        ledgerEntryId: null,
        status: "open",
      }),
    ).toMatchObject({
      canRecordReceipt: true,
      nextAction: "Record receipt",
      ownerStatementState: "no_cash",
      remainingAmount: 1000,
    });
  });

  it("preserves the remaining receipt action after a partial receipt", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 400,
        ledgerEntryId: null,
        status: "partially_received",
      }),
    ).toMatchObject({
      canRecordReceipt: true,
      nextAction: "Record remaining receipt",
      ownerStatementState: "partial_cash",
      remainingAmount: 600,
    });
  });

  it("makes a fully received row settled without a second posting action", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 1000,
        ledgerEntryId: null,
        status: "received",
      }),
    ).toMatchObject({
      canRecordReceipt: false,
      nextAction: "Settled",
      ownerStatementState: "full_cash",
      remainingAmount: 0,
      stageLabel: "Settled and projected",
    });
  });

  it("makes a posted row terminal", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 1000,
        ledgerEntryId: "ledger-1",
        status: "posted",
      }),
    ).toMatchObject({
      canRecordReceipt: false,
      nextAction: "Legacy posted",
      stageLabel: "Legacy posted",
    });
  });
});
