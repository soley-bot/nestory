import { z } from "zod";

export const FINANCIAL_GENERATION_FIELD = "__financialGeneration";
export const FINANCIAL_GENERATION_HEADER = "x-nestory-financial-generation";

export const financialWriteContextSchema = z.object({
  generation: z.number().int().nonnegative().max(2147483647),
  status: z.enum(["open", "frozen"]),
  financial_start_date: z.iso.date().nullable(),
  enforced: z.boolean(),
}).refine((value) => value.enforced
  ? value.generation > 0 && value.financial_start_date !== null
  : value.generation === 0 && value.status === "open" && value.financial_start_date === null,
"Invalid financial context");

export type FinancialWriteContext = z.infer<typeof financialWriteContextSchema>;

export function financialContextKey(value: FinancialWriteContext) {
  return `${value.generation}:${value.status}:${value.financial_start_date ?? ""}:${value.enforced}`;
}

// Only carry the generation captured when the operator opened the form. Never
// substitute the current generation at submission time: that revives old intent.
export function financialGenerationHeaders(formData?: FormData): Record<string, string> {
  const generation = formData?.get(FINANCIAL_GENERATION_FIELD);
  if (typeof generation !== "string" || !/^(0|[1-9]\d{0,9})$/.test(generation)
    || Number(generation) > 2147483647) return {};
  return { [FINANCIAL_GENERATION_HEADER]: generation };
}

export function copyFinancialGeneration(source: FormData, target: FormData) {
  const generation = financialGenerationHeaders(source)[FINANCIAL_GENERATION_HEADER];
  if (generation !== undefined) target.set(FINANCIAL_GENERATION_FIELD, generation);
  return target;
}

export function financialFormValues(formData: FormData) {
  return Object.fromEntries([...formData].filter(([key]) => key !== FINANCIAL_GENERATION_FIELD && !key.startsWith("$ACTION_")));
}

export function financialWriteError(message: string | undefined): string | null {
  if (/financial_writes_frozen/.test(message ?? "")) return "Financial changes are paused while this workspace is being reset. Try again after the reset is complete.";
  if (/financial_generation_(required|stale)|financial_intent_retired/.test(message ?? "")) return "This form belongs to an earlier financial session. Reload the page and start a new entry.";
  if (/financial_date_before_start/.test(message ?? "")) return "This date is before the workspace’s financial start date. Choose a date within the current accounting period.";
  return null;
}
