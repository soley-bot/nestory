import { createSupabaseServerClient } from "@/lib/db/server";
import {
  DEFAULT_CURRENCY_DISPLAY_SETTINGS,
  normalizeCurrencyDisplaySettings,
  type CurrencyDisplaySettings,
} from "@/lib/money/format";

export async function getOrganizationCurrencySettings(
  organizationId: string,
): Promise<CurrencyDisplaySettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("preferred_currency, khr_per_usd")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingCurrencySettingsColumn(error.message)) {
      return DEFAULT_CURRENCY_DISPLAY_SETTINGS;
    }

    throw new Error(`Could not load currency settings: ${error.message}`);
  }

  return normalizeCurrencyDisplaySettings({
    khrPerUsd: Number(
      data?.khr_per_usd ?? DEFAULT_CURRENCY_DISPLAY_SETTINGS.khrPerUsd,
    ),
    preferredCurrency: data?.preferred_currency ?? undefined,
  });
}

export function isMissingCurrencySettingsColumn(message: string) {
  return (
    message.includes("preferred_currency") ||
    message.includes("khr_per_usd")
  ) && message.includes("does not exist");
}
