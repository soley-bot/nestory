"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Constants } from "@/types/database";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { CurrencyCode } from "@/lib/money/format";
import { isMissingCurrencySettingsColumn } from "@/features/settings/data/settings";

type CurrencySettingsFieldErrors = {
  khrPerUsd?: string[];
  preferredCurrency?: string[];
};

export type CurrencySettingsActionState = {
  fieldErrors?: CurrencySettingsFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const currencySettingsSchema = z.object({
  khrPerUsd: z.coerce
    .number()
    .positive("Enter a rate greater than zero.")
    .max(100000, "Enter a realistic KHR per USD rate."),
  preferredCurrency: z.enum(Constants.public.Enums.currency_code),
});

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): CurrencySettingsActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as CurrencySettingsFieldErrors,
    status: "error",
  };
}

export async function updateCurrencySettingsAction(
  _state: CurrencySettingsActionState,
  formData: FormData,
): Promise<CurrencySettingsActionState> {
  const context = await requireAdminContext();
  const parsed = currencySettingsSchema.safeParse({
    khrPerUsd: readString(formData, "khrPerUsd"),
    preferredCurrency: readString(formData, "preferredCurrency"),
  });

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      khr_per_usd: parsed.data.khrPerUsd,
      preferred_currency: parsed.data.preferredCurrency as CurrencyCode,
    })
    .eq("id", context.organizationId);

  if (error) {
    if (isMissingCurrencySettingsColumn(error.message)) {
      return {
        message:
          "Currency display is using defaults until the database migration is applied.",
        status: "error",
      };
    }

    return {
      message: "We could not update currency settings. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/ledger");
  revalidatePath("/timeline");
  revalidatePath("/properties");
  revalidatePath("/units");

  return {
    message: "Currency settings updated.",
    status: "success",
  };
}
