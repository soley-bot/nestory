import { describe, expect, it } from "vitest";
import {
  parseHistoricalRentCorrectionInput,
  historicalRentCorrectionErrorMessage,
} from "@/features/leases/historical-rent-correction-input";

const validInput = {
  correctedDueDay: "10",
  correctedRentAmount: "850.25",
  idempotencyKey: "historical-rent:12345678",
  invoiceId: "11111111-1111-4111-8111-111111111111",
  previewHash: "a".repeat(64),
  reason: "Signed lease addendum confirms the issued rent was wrong.",
};

describe("historical rent correction input", () => {
  it("accepts exact two-decimal money and a confirmed preview", () => {
    expect(parseHistoricalRentCorrectionInput(validInput)).toEqual({
      data: {
        correctedDueDay: 10,
        correctedRentAmount: 850.25,
        idempotencyKey: "historical-rent:12345678",
        invoiceId: "11111111-1111-4111-8111-111111111111",
        previewHash: "a".repeat(64),
        reason: "Signed lease addendum confirms the issued rent was wrong.",
      },
      success: true,
    });
  });

  it.each([
    ["correctedRentAmount", "0", "Enter a rent amount greater than zero."],
    ["correctedRentAmount", "1.001", "Use no more than two decimal places."],
    ["correctedDueDay", "32", "Enter a due day from 1 to 31."],
    ["reason", "short", "Explain the correction in at least 8 characters."],
    ["previewHash", "", "Preview this correction again before applying it."],
  ] as const)("rejects invalid %s", (field, value, message) => {
    const result = parseHistoricalRentCorrectionInput({
      ...validInput,
      [field]: value,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors[field]).toContain(message);
    }
  });

  it.each([
    ["historical_rent_preview_stale", "Preview changed"],
    ["financial_month_locked", "Unlock the current financial month"],
    ["historical_rent_owner_close_reopen_required", "Reopen every affected Owner Close month"],
    ["historical_rent_settlement_owner_effect_missing", "owner allocation evidence is incomplete"],
  ] as const)("maps %s to operator copy", (databaseMessage, expected) => {
    expect(
      historicalRentCorrectionErrorMessage({ message: databaseMessage }),
    ).toContain(expected);
  });
});
