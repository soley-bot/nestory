"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@/types/database";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type MaintenanceFieldErrors = {
  actualCostAmount?: string[];
  category?: string[];
  checklistText?: string[];
  costEstimateAmount?: string[];
  description?: string[];
  dueDate?: string[];
  dueTime?: string[];
  priority?: string[];
  propertyId?: string[];
  recurrenceFrequency?: string[];
  reminderDate?: string[];
  reminderTime?: string[];
  status?: string[];
  taskId?: string[];
  title?: string[];
  unitId?: string[];
  vendorPersonId?: string[];
};

export type MaintenanceActionState = {
  fieldErrors?: MaintenanceFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const uuidShapeSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );
const optionalUuidSchema = z
  .string()
  .trim()
  .transform((value) => value || null)
  .pipe(uuidShapeSchema.nullable());
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$|^$/, "Use a valid date.")
  .transform((value) => value || null);
const optionalTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$|^$/, "Use a valid time.")
  .transform((value) => value || null);
const optionalMoneySchema = z
  .string()
  .trim()
  .transform((value) => (value ? Number(value) : null))
  .pipe(
    z
      .number()
      .min(0, "Amount cannot be negative.")
      .finite("Use a valid amount.")
      .nullable(),
  );
const maintenanceSchema = z
  .object({
    actualCostAmount: optionalMoneySchema,
    category: z
      .string()
      .trim()
      .min(2, "Enter a category.")
      .max(80, "Keep the category under 80 characters."),
    checklistText: z.string().max(2_000, "Keep the checklist shorter."),
    costEstimateAmount: optionalMoneySchema,
    description: z.string().trim().max(1_500, "Keep the description shorter."),
    dueDate: optionalDateSchema,
    dueTime: optionalTimeSchema,
    priority: z.enum(["low", "normal", "high", "urgent"]),
    propertyId: uuidShapeSchema,
    recurrenceFrequency: z.enum([
      "none",
      "weekly",
      "monthly",
      "quarterly",
      "semi_annual",
      "annual",
    ]),
    reminderDate: optionalDateSchema,
    reminderTime: optionalTimeSchema,
    status: z.enum([
      "pending",
      "scheduled",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ]),
    title: z
      .string()
      .trim()
      .min(3, "Enter a maintenance title.")
      .max(140, "Keep the title under 140 characters."),
    unitId: optionalUuidSchema,
    vendorPersonId: optionalUuidSchema,
  })
  .superRefine((data, context) => {
    if (data.dueTime && !data.dueDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a due date before adding a due time.",
        path: ["dueDate"],
      });
    }

    if (data.reminderTime && !data.reminderDate) {
      context.addIssue({
        code: "custom",
        message: "Choose a reminder date before adding a reminder time.",
        path: ["reminderDate"],
      });
    }
  });

function readString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): MaintenanceActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as MaintenanceFieldErrors,
    status: "error",
  };
}

export async function createMaintenanceCaseAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const context = await requireAdminContext();
  const parsed = maintenanceSchema.safeParse(readMaintenanceForm(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const checklist = parseChecklistText(parsed.data.checklistText);
  const { error } = await supabase.rpc("create_maintenance_task", {
    p_category: parsed.data.category,
    p_checklist: checklist as Json,
    p_cost_estimate_amount: parsed.data.costEstimateAmount,
    p_cost_estimate_currency:
      parsed.data.costEstimateAmount === null ? null : "USD",
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate,
    p_due_time: parsed.data.dueTime,
    p_organization_id: context.organizationId,
    p_priority: parsed.data.priority,
    p_property_id: parsed.data.propertyId,
    p_recurrence_frequency: parsed.data.recurrenceFrequency,
    p_reminder_date: parsed.data.reminderDate,
    p_reminder_time: parsed.data.reminderTime,
    p_status: parsed.data.status,
    p_title: parsed.data.title,
    p_unit_id: parsed.data.unitId,
    p_vendor_person_id: parsed.data.vendorPersonId,
  });

  if (error) {
    return {
      message: maintenanceActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateMaintenancePaths({
    propertyIds: [parsed.data.propertyId],
    unitIds: [parsed.data.unitId],
  });

  return {
    message: "Maintenance case created.",
    status: "success",
  };
}

export async function updateMaintenanceCaseAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const context = await requireAdminContext();
  const parsedTaskId = uuidShapeSchema.safeParse(readString(formData, "taskId"));
  const parsed = maintenanceSchema.safeParse(readMaintenanceForm(formData));

  if (!parsedTaskId.success) {
    return {
      fieldErrors: { taskId: ["Choose a maintenance case."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const checklist = parseChecklistText(parsed.data.checklistText);
  const { error } = await supabase.rpc("update_maintenance_task", {
    p_actual_cost_amount: parsed.data.actualCostAmount,
    p_actual_cost_currency:
      parsed.data.actualCostAmount === null ? null : "USD",
    p_category: parsed.data.category,
    p_checklist: checklist as Json,
    p_cost_estimate_amount: parsed.data.costEstimateAmount,
    p_cost_estimate_currency:
      parsed.data.costEstimateAmount === null ? null : "USD",
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate,
    p_due_time: parsed.data.dueTime,
    p_link_actual_cost_to_ledger: formData.get("linkActualCostToLedger") === "on",
    p_organization_id: context.organizationId,
    p_priority: parsed.data.priority,
    p_property_id: parsed.data.propertyId,
    p_recurrence_frequency: parsed.data.recurrenceFrequency,
    p_reminder_date: parsed.data.reminderDate,
    p_reminder_time: parsed.data.reminderTime,
    p_status: parsed.data.status,
    p_task_id: parsedTaskId.data,
    p_title: parsed.data.title,
    p_unit_id: parsed.data.unitId,
    p_vendor_person_id: parsed.data.vendorPersonId,
  });

  if (error) {
    return {
      message: maintenanceActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateMaintenancePaths({
    propertyIds: [parsed.data.propertyId],
    unitIds: [parsed.data.unitId],
  });

  return {
    message: "Maintenance case updated.",
    status: "success",
  };
}

function readMaintenanceForm(formData: FormData) {
  return {
    actualCostAmount: readString(formData, "actualCostAmount"),
    category: readString(formData, "category"),
    checklistText: readString(formData, "checklistText"),
    costEstimateAmount: readString(formData, "costEstimateAmount"),
    description: readString(formData, "description"),
    dueDate: readString(formData, "dueDate"),
    dueTime: readString(formData, "dueTime"),
    priority: readString(formData, "priority"),
    propertyId: readString(formData, "propertyId"),
    recurrenceFrequency: readString(formData, "recurrenceFrequency"),
    reminderDate: readString(formData, "reminderDate"),
    reminderTime: readString(formData, "reminderTime"),
    status: readString(formData, "status"),
    title: readString(formData, "title"),
    unitId: readString(formData, "unitId"),
    vendorPersonId: readString(formData, "vendorPersonId"),
  };
}

function parseChecklistText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const completed = /^\[[xX]\]\s*/.test(line);
      const label = line.replace(/^\[[ xX]\]\s*/, "").trim();

      return {
        completed,
        id: String(index + 1),
        label,
      };
    })
    .filter((item) => item.label.length > 0);
}

function revalidateMaintenancePaths({
  propertyIds = [],
  unitIds = [],
}: {
  propertyIds?: Array<string | null | undefined>;
  unitIds?: Array<string | null | undefined>;
}) {
  revalidatePath("/maintenance");
  revalidatePath("/overview");
  revalidatePath("/documents");
  revalidatePath("/ledger");
  revalidatePath("/properties");
  revalidatePath("/reports");
  revalidatePath("/timeline");
  revalidatePath("/units");

  for (const propertyId of new Set(propertyIds.filter(Boolean))) {
    revalidatePath(`/properties/${propertyId}`);
  }

  for (const unitId of new Set(unitIds.filter(Boolean))) {
    revalidatePath(`/units/${unitId}`);
  }
}

function maintenanceActionErrorMessage(message: string) {
  if (message.includes("violates row-level security") || message.includes("Not authorized")) {
    return "You do not have access to save this maintenance case.";
  }

  if (message.includes("period is locked")) {
    return "The linked ledger period is locked. Unlock the period before linking actual cost.";
  }

  if (message.includes("Property not found")) {
    return "Choose an active property.";
  }

  if (message.includes("Unit not found")) {
    return "Choose a unit under the selected property.";
  }

  if (message.includes("Vendor/person not found")) {
    return "Choose an active vendor or person.";
  }

  return "We could not save the maintenance case. Please check the fields and try again.";
}
