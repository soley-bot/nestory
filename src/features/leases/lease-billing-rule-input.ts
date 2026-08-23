import { z } from "zod";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const optionalAmount = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().nonnegative("Enter a non-negative amount.").nullable(),
);

const explicitBooleanChoice = z
  .enum(["yes", "no"], { message: "Choose yes or no." })
  .transform((value) => value === "yes");

export const leaseBillingRuleShape = {
  billingRecipientKind: z.enum(["individual", "company"], {
    message: "Choose who is billed.",
  }),
  billingRecipientPersonId: postgresUuid("Choose a billing recipient."),
  chargeManagementFeeWhenActive: explicitBooleanChoice,
  chargeThroughLeaseEnd: explicitBooleanChoice,
  collectionRoute: z.enum(["through_ips", "direct_to_owner"], {
    message: "Choose who collects rent.",
  }),
  finalPeriodProratedAmount: optionalAmount,
  firstPeriodProratedAmount: optionalAmount,
  fullManagementFeeDuringProration: explicitBooleanChoice,
  leaseEndProrationRule: z.literal("actual_days"),
  leaseStartProrationRule: z.literal("actual_days"),
  managementFeeMode: z.enum(["percentage", "flat"], {
    message: "Choose a management fee mode.",
  }),
  managementFeeValue: z.coerce
    .number()
    .nonnegative("Enter a non-negative management fee."),
  midPeriodRentChangeRule: z.literal("next_full_month"),
  rentCalculationTimezone: z.string().trim().min(1, "Choose a calculation timezone."),
  shortMonthDueDayRule: z.literal("last_calendar_day"),
} as const;

export const leaseBillingRuleSchema = z
  .object(leaseBillingRuleShape)
  .superRefine((data, context) => {
    if (data.managementFeeMode === "percentage" && data.managementFeeValue > 100) {
      context.addIssue({
        code: "custom",
        message: "Enter a percentage from 0 to 100.",
        path: ["managementFeeValue"],
      });
    }
  });

export type LeaseBillingRuleInput = z.infer<typeof leaseBillingRuleSchema>;

export function readLeaseBillingRuleInput(formData: FormData) {
  return {
    billingRecipientKind: formData.get("billingRecipientKind"),
    billingRecipientPersonId: formData.get("billingRecipientPersonId"),
    chargeManagementFeeWhenActive: formData.get(
      "chargeManagementFeeWhenActive",
    ),
    chargeThroughLeaseEnd: formData.get("chargeThroughLeaseEnd"),
    collectionRoute: formData.get("collectionRoute"),
    finalPeriodProratedAmount: formData.get("finalPeriodProratedAmount"),
    firstPeriodProratedAmount: formData.get("firstPeriodProratedAmount"),
    fullManagementFeeDuringProration: formData.get(
      "fullManagementFeeDuringProration",
    ),
    leaseEndProrationRule: formData.get("leaseEndProrationRule"),
    leaseStartProrationRule: formData.get("leaseStartProrationRule"),
    managementFeeMode: formData.get("managementFeeMode"),
    managementFeeValue: formData.get("managementFeeValue"),
    midPeriodRentChangeRule: formData.get("midPeriodRentChangeRule"),
    rentCalculationTimezone: formData.get("rentCalculationTimezone"),
    shortMonthDueDayRule: formData.get("shortMonthDueDayRule"),
  };
}

export function toLeaseBillingRulePayload(values: LeaseBillingRuleInput) {
  return {
    billingRecipientKind: values.billingRecipientKind,
    billingRecipientPersonId: values.billingRecipientPersonId,
    chargeManagementFeeWhenActive: values.chargeManagementFeeWhenActive,
    chargeThroughLeaseEnd: values.chargeThroughLeaseEnd,
    collectionRoute: values.collectionRoute,
    finalPeriodProratedAmount: values.finalPeriodProratedAmount,
    firstPeriodProratedAmount: values.firstPeriodProratedAmount,
    fullManagementFeeDuringProration:
      values.fullManagementFeeDuringProration,
    leaseEndProrationRule: values.leaseEndProrationRule,
    leaseStartProrationRule: values.leaseStartProrationRule,
    managementFeeMode: values.managementFeeMode,
    managementFeeValue: values.managementFeeValue,
    midPeriodRentChangeRule: values.midPeriodRentChangeRule,
    rentCalculationTimezone: values.rentCalculationTimezone,
    shortMonthDueDayRule: values.shortMonthDueDayRule,
  };
}
