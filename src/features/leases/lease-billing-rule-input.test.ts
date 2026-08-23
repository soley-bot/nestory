import { describe, expect, it } from "vitest";
import { leaseBillingRuleSchema } from "@/features/leases/lease-billing-rule-input";

const validRule = {
  billingRecipientKind: "individual",
  billingRecipientPersonId: "11111111-1111-4111-8111-111111111111",
  chargeManagementFeeWhenActive: "yes",
  chargeThroughLeaseEnd: "yes",
  collectionRoute: "through_ips",
  finalPeriodProratedAmount: null,
  firstPeriodProratedAmount: null,
  fullManagementFeeDuringProration: "no",
  leaseEndProrationRule: "actual_days",
  leaseStartProrationRule: "actual_days",
  managementFeeMode: "percentage",
  managementFeeValue: 10,
  midPeriodRentChangeRule: "next_full_month",
  rentCalculationTimezone: "Asia/Bangkok",
  shortMonthDueDayRule: "last_calendar_day",
};

describe("lease billing proration overrides", () => {
  it.each(["firstPeriodProratedAmount", "finalPeriodProratedAmount"] as const)(
    "rejects a zero %s before the database contract",
    (field) => {
      const result = leaseBillingRuleSchema.safeParse({
        ...validRule,
        [field]: 0,
      });

      expect(result.success).toBe(false);
    },
  );

  it.each([null, "", 0.01, "120.25"])(
    "accepts a nullable or positive override value %s",
    (override) => {
      expect(
        leaseBillingRuleSchema.safeParse({
          ...validRule,
          firstPeriodProratedAmount: override,
        }).success,
      ).toBe(true);
    },
  );
});
