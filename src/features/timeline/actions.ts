"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Constants } from "@/types/database";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";

type TimelineFieldErrors = {
  costAmount?: string[];
  costCurrency?: string[];
  description?: string[];
  eventDate?: string[];
  eventType?: string[];
  propertyId?: string[];
  title?: string[];
  unitId?: string[];
};

export type TimelineActionState = {
  fieldErrors?: TimelineFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const createTimelineEventSchema = z
  .object({
    costAmount: z.string().trim(),
    costCurrency: z.string().trim(),
    description: z
      .string()
      .trim()
      .max(1200, "Keep the description under 1,200 characters."),
    eventDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an event date."),
    eventType: z.enum(Constants.public.Enums.timeline_event_type),
    propertyId: z.uuid("Choose a property."),
    title: z
      .string()
      .trim()
      .min(3, "Enter a title.")
      .max(160, "Keep the title under 160 characters."),
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    const hasCostAmount = data.costAmount.length > 0;
    const hasCostCurrency = data.costCurrency.length > 0;

    if (data.unitId.length > 0) {
      const parsedUnitId = z.uuid().safeParse(data.unitId);

      if (!parsedUnitId.success) {
        context.addIssue({
          code: "custom",
          message: "Choose a valid unit.",
          path: ["unitId"],
        });
      }
    }

    if (!hasCostAmount && !hasCostCurrency) {
      return;
    }

    if (!hasCostAmount || !hasCostCurrency) {
      context.addIssue({
        code: "custom",
        message: "Enter both cost and currency.",
        path: hasCostAmount ? ["costCurrency"] : ["costAmount"],
      });
      return;
    }

    const amount = Number(data.costAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid cost.",
        path: ["costAmount"],
      });
    }

    const parsedCurrency = z
      .enum(Constants.public.Enums.currency_code)
      .safeParse(data.costCurrency);

    if (!parsedCurrency.success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid currency.",
        path: ["costCurrency"],
      });
    }
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): TimelineActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as TimelineFieldErrors,
    status: "error",
  };
}

export async function createTimelineEventAction(
  _state: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireAdminContext();
  const parsed = createTimelineEventSchema.safeParse({
    costAmount: readString(formData, "costAmount"),
    costCurrency: readString(formData, "costCurrency"),
    description: readString(formData, "description"),
    eventDate: readString(formData, "eventDate"),
    eventType: readString(formData, "eventType"),
    propertyId: readString(formData, "propertyId"),
    title: readString(formData, "title"),
    unitId: readString(formData, "unitId"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const costAmount =
    parsed.data.costAmount.length > 0 ? Number(parsed.data.costAmount) : null;
  const costCurrency =
    parsed.data.costCurrency.length > 0
      ? (parsed.data.costCurrency as CurrencyCode)
      : null;
  const unitId = parsed.data.unitId.length > 0 ? parsed.data.unitId : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_timeline_event", {
    p_cost_amount: costAmount,
    p_cost_currency: costCurrency,
    p_description: parsed.data.description,
    p_event_date: parsed.data.eventDate,
    p_event_type: parsed.data.eventType,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_title: parsed.data.title,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message: "We could not add the timeline event. Please check the fields and try again.",
      status: "error",
    };
  }

  revalidatePath("/timeline");
  revalidatePath("/properties");

  return {
    message: "Timeline event added.",
    status: "success",
  };
}
