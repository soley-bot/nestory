"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  FINANCE_SOURCE_KINDS,
  FINANCE_SOURCE_SCOPE_KINDS,
} from "@/features/finance-sources/finance-sources.types";

type FinanceSourceFieldErrors = Partial<
  Record<
    | "code"
    | "displayName"
    | "maskedReference"
    | "propertyId"
    | "scopeKind"
    | "sourceId"
    | "sourceKind",
    string[]
  >
>;

export type FinanceSourceActionState = {
  fieldErrors?: FinanceSourceFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(maximum).optional(),
  );

const createSourceSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Enter a source code.")
      .max(40, "Use at most 40 characters for the code.")
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => /^[A-Z0-9][A-Z0-9_-]*$/.test(value),
        "Use letters, numbers, underscores, or hyphens.",
      ),
    displayName: z
      .string()
      .trim()
      .min(2, "Enter a funding-source name.")
      .max(120, "Use at most 120 characters for the name."),
    maskedReference: optionalText(80),
    propertyId: optionalText(36),
    scopeKind: z.enum(FINANCE_SOURCE_SCOPE_KINDS),
    sourceKind: z.enum(FINANCE_SOURCE_KINDS),
  })
  .superRefine((value, context) => {
    if (
      value.scopeKind === "property_dedicated" &&
      !z.uuid().safeParse(value.propertyId).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose the dedicated property.",
        path: ["propertyId"],
      });
    }
    if (value.scopeKind === "organization_pooled" && value.propertyId) {
      context.addIssue({
        code: "custom",
        message: "Organization-pooled sources cannot select a property.",
        path: ["propertyId"],
      });
    }
  });

const updateSourceSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Enter a funding-source name.")
    .max(120, "Use at most 120 characters for the name."),
  maskedReference: optionalText(80),
  sourceId: z.uuid("Choose a funding source."),
});

const lifecycleSchema = z.object({
  sourceId: z.uuid("Choose a funding source."),
});

export async function createFinanceSourceAction(
  _state: FinanceSourceActionState,
  formData: FormData,
): Promise<FinanceSourceActionState> {
  const parsed = createSourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "create_financial_reconciliation_source",
    {
      p_code: parsed.data.code,
      p_currency: "USD",
      p_display_name: parsed.data.displayName,
      p_masked_reference: parsed.data.maskedReference || undefined,
      p_organization_id: context.organizationId,
      p_property_id:
        parsed.data.scopeKind === "property_dedicated"
          ? parsed.data.propertyId || undefined
          : undefined,
      p_scope_kind: parsed.data.scopeKind,
      p_source_kind: parsed.data.sourceKind,
    },
  );
  if (error) return databaseError(error.message);

  revalidateFundingSources();
  return { message: "Funding source added.", status: "success" };
}

export async function updateFinanceSourceAction(
  _state: FinanceSourceActionState,
  formData: FormData,
): Promise<FinanceSourceActionState> {
  const parsed = updateSourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "update_financial_reconciliation_source_label",
    {
      p_display_name: parsed.data.displayName,
      p_masked_reference: parsed.data.maskedReference || undefined,
      p_organization_id: context.organizationId,
      p_source_id: parsed.data.sourceId,
    },
  );
  if (error) return databaseError(error.message);

  revalidateFundingSources();
  return {
    message: "Funding source details updated.",
    status: "success",
  };
}

export async function archiveFinanceSourceAction(
  _state: FinanceSourceActionState,
  formData: FormData,
): Promise<FinanceSourceActionState> {
  return setSourceLifecycle(formData, "archive");
}

export async function restoreFinanceSourceAction(
  _state: FinanceSourceActionState,
  formData: FormData,
): Promise<FinanceSourceActionState> {
  return setSourceLifecycle(formData, "restore");
}

async function setSourceLifecycle(
  formData: FormData,
  mode: "archive" | "restore",
): Promise<FinanceSourceActionState> {
  const parsed = lifecycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    mode === "archive"
      ? "archive_financial_reconciliation_source"
      : "restore_financial_reconciliation_source",
    {
      p_organization_id: context.organizationId,
      p_source_id: parsed.data.sourceId,
    },
  );
  if (error) return databaseError(error.message);

  revalidateFundingSources();
  return {
    message:
      mode === "archive"
        ? "Funding source archived."
        : "Funding source restored.",
    status: "success",
  };
}

function validationError(error: z.ZodError): FinanceSourceActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as FinanceSourceFieldErrors,
    status: "error",
  };
}

function databaseError(message: string): FinanceSourceActionState {
  if (message.includes("financial_reconciliation_sources_org_code_unique")) {
    return {
      fieldErrors: { code: ["Use a unique funding-source code."] },
      status: "error",
    };
  }
  if (message.includes("Dedicated funding source property is archived")) {
    return {
      message: "Restore the Property before restoring this funding source.",
      status: "error",
    };
  }
  return {
    message: "We could not update this funding source. Try again.",
    status: "error",
  };
}

function revalidateFundingSources() {
  for (const path of [
    "/finance/funding-sources",
    "/finance",
    "/rent-income",
    "/bills-expenses",
    "/leases",
  ]) {
    revalidatePath(path);
  }
}
