import { describe, expect, it } from "vitest";
import {
  getLeaseMutationErrorMessage,
  parseFutureRentTermInput,
  parseIdempotencyKey,
} from "@/features/leases/lease-action-input";

const validFutureTerm = {
  endDate: "2027-12-31",
  leaseId: "11111111-1111-4111-8111-111111111111",
  paymentFrequency: "monthly",
  rentAmount: "900",
  rentDueDay: "10",
  startDate: "2027-01-01",
  supersedesTermId: "22222222-2222-4222-8222-222222222222",
};
const invalidNumericCases = [
  ["rentAmount", "", "Enter a rent amount of at least 1."],
  ["rentAmount", "0", "Enter a rent amount of at least 1."],
  ["rentDueDay", "", "Enter a due day from 1 to 31."],
] as const;

describe("lease action input", () => {
  it.each(invalidNumericCases)(
    "rejects an invalid %s before numeric coercion",
    (field, value, message) => {
    const result = parseFutureRentTermInput({
      ...validFutureTerm,
      [field]: value,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors[field]).toContain(message);
    }
    },
  );

  it("rejects a missing idempotency key instead of inventing a retry identity", () => {
    expect(parseIdempotencyKey("")).toEqual({
      error: "Refresh the form and try again.",
      success: false,
    });
  });

  it("preserves a valid client retry identity", () => {
    expect(parseIdempotencyKey(" lease:term:12345678 ")).toEqual({
      data: "lease:term:12345678",
      success: true,
    });
  });

  it.each([
    [
      "update",
      "relationship_transition_required",
      "Keep the current tenant",
    ],
    [
      "update",
      "occupancy_transition_required",
      "Keep the current unit and status",
    ],
    [
      "archive",
      "occupancy_transition_required",
      "End or cancel the open occupancy",
    ],
    [
      "archive",
      "relationship_transition_required",
      "End or cancel the open Lease role",
    ],
    [
      "restore",
      "lease_restore_transition_required",
      "Restore is unavailable",
    ],
  ] as const)(
    "maps %s failures by the stable %s detail",
    (operation, details, expectedCopy) => {
      expect(
        getLeaseMutationErrorMessage(
          {
            details,
            message: "localized or revised database message",
          },
          operation,
        ),
      ).toContain(expectedCopy);
    },
  );
});
