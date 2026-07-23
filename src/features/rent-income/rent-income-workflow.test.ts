import { describe, expect, it } from "vitest";
import { getRentIncomeWorkflow } from "@/features/rent-income/rent-income-workflow";

describe("getRentIncomeWorkflow", () => {
  it("keeps a charge-only row out of posting while receipts remain available", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 0,
        ledgerEntryId: null,
        status: "open",
      }),
    ).toMatchObject({
      canPost: false,
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
      canPost: false,
      canRecordReceipt: true,
      nextAction: "Record remaining receipt",
      ownerStatementState: "partial_cash",
      remainingAmount: 600,
    });
  });

  it("allows posting only after the full receipt is recorded", () => {
    expect(
      getRentIncomeWorkflow({
        amountDue: 1000,
        amountReceived: 1000,
        ledgerEntryId: null,
        status: "received",
      }),
    ).toMatchObject({
      canPost: true,
      canRecordReceipt: false,
      nextAction: "Post to ledger",
      ownerStatementState: "full_cash",
      remainingAmount: 0,
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
      canPost: false,
      canRecordReceipt: false,
      nextAction: "Posted to ledger",
      stageLabel: "Posted",
    });
  });
});
