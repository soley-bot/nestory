"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMaintenanceChecklistText } from "@/features/maintenance/maintenance.checklist";
import type { MaintenanceStatus } from "@/features/maintenance/maintenance.types";
import type { Json } from "@/types/database";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type MaintenanceFieldErrors = {
  actualCostAmount?: string[];
  assigneePersonId?: string[];
  branchId?: string[];
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

type UntypedSupabaseClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
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
const maintenanceStatusSchema = z.enum([
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);
const maintenanceSchema = z
  .object({
    actualCostAmount: optionalMoneySchema,
    assigneePersonId: optionalUuidSchema,
    branchId: optionalUuidSchema,
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
    status: maintenanceStatusSchema,
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
  const context = await requireTaskManagerContext();
  const parsed = maintenanceSchema.safeParse(readMaintenanceForm(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();
  const checklist = parseMaintenanceChecklistText(parsed.data.checklistText);
  const { data: taskId, error } = await supabase.rpc("create_maintenance_task", {
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

  if ((parsed.data.branchId || parsed.data.assigneePersonId) && taskId) {
    const assignmentError = await assignMaintenanceTask({
      assigneePersonId: parsed.data.assigneePersonId,
      branchId: parsed.data.branchId,
      organizationId: context.organizationId,
      supabase,
      taskId,
    });

    if (assignmentError) {
      return assignmentError;
    }
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
  const context = await requireTaskManagerContext();
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
  const checklist = parseMaintenanceChecklistText(parsed.data.checklistText);
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

  const assignmentError = await assignMaintenanceTask({
    assigneePersonId: parsed.data.assigneePersonId,
    branchId: parsed.data.branchId,
    organizationId: context.organizationId,
    supabase,
    taskId: parsedTaskId.data,
  });

  if (assignmentError) {
    return assignmentError;
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

export async function updateMaintenanceStatusAction(
  taskId: string,
  status: MaintenanceStatus,
): Promise<MaintenanceActionState> {
  const context = await requireTaskManagerContext();
  const parsedTaskId = uuidShapeSchema.safeParse(taskId);
  const parsedStatus = maintenanceStatusSchema.safeParse(status);

  if (!parsedTaskId.success || !parsedStatus.success) {
    return {
      fieldErrors: {
        taskId: parsedTaskId.success ? undefined : ["Choose a maintenance case."],
        status: parsedStatus.success ? undefined : ["Choose a supported status."],
      },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select(
      "id, property_id, unit_id, title, description, category, priority, due_date, due_time, reminder_date, reminder_time, vendor_person_id, cost_estimate_amount, cost_estimate_currency, actual_cost_amount, actual_cost_currency, checklist, recurrence_frequency",
    )
    .eq("organization_id", context.organizationId)
    .eq("id", parsedTaskId.data)
    .is("archived_at", null)
    .maybeSingle();

  if (taskError) {
    return {
      message: maintenanceActionErrorMessage(taskError.message),
      status: "error",
    };
  }

  if (!task) {
    return {
      message: "We could not find that maintenance case.",
      status: "error",
    };
  }

  const { error } = await supabase.rpc("update_maintenance_task", {
    p_actual_cost_amount: task.actual_cost_amount,
    p_actual_cost_currency: task.actual_cost_currency,
    p_category: task.category,
    p_checklist: task.checklist,
    p_cost_estimate_amount: task.cost_estimate_amount,
    p_cost_estimate_currency: task.cost_estimate_currency,
    p_description: task.description,
    p_due_date: task.due_date,
    p_due_time: task.due_time,
    p_link_actual_cost_to_ledger: false,
    p_organization_id: context.organizationId,
    p_priority: task.priority,
    p_property_id: task.property_id,
    p_recurrence_frequency: task.recurrence_frequency,
    p_reminder_date: task.reminder_date,
    p_reminder_time: task.reminder_time,
    p_status: parsedStatus.data,
    p_task_id: parsedTaskId.data,
    p_title: task.title,
    p_unit_id: task.unit_id,
    p_vendor_person_id: task.vendor_person_id,
  });

  if (error) {
    return {
      message: maintenanceActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateMaintenancePaths({
    propertyIds: [task.property_id],
    unitIds: [task.unit_id],
  });

  return {
    message: "Maintenance status updated.",
    status: "success",
  };
}

export async function archiveMaintenanceCaseAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return updateMaintenanceArchiveState({
    archived: true,
    fallbackMessage: "Maintenance case archived.",
    formData,
  });
}

export async function restoreMaintenanceCaseAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  return updateMaintenanceArchiveState({
    archived: false,
    fallbackMessage: "Maintenance case restored.",
    formData,
  });
}

async function updateMaintenanceArchiveState({
  archived,
  fallbackMessage,
  formData,
}: {
  archived: boolean;
  fallbackMessage: string;
  formData: FormData;
}): Promise<MaintenanceActionState> {
  const context = await requireTaskManagerContext();
  const parsedTaskId = uuidShapeSchema.safeParse(readString(formData, "taskId"));

  if (!parsedTaskId.success) {
    return {
      fieldErrors: { taskId: ["Choose a maintenance case."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getMaintenancePathContext(
    supabase,
    context.organizationId,
    parsedTaskId.data,
  );
  const payload = {
    p_organization_id: context.organizationId,
    p_task_id: parsedTaskId.data,
  };
  const { error } = archived
    ? await supabase.rpc("archive_maintenance_task", payload)
    : await supabase.rpc("restore_maintenance_task", payload);

  if (error) {
    return {
      message: maintenanceActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateMaintenancePaths({
    propertyIds: [pathContext?.property_id],
    unitIds: [pathContext?.unit_id],
  });

  return {
    message: fallbackMessage,
    status: "success",
  };
}

function readMaintenanceForm(formData: FormData) {
  return {
    actualCostAmount: readString(formData, "actualCostAmount"),
    assigneePersonId: readString(formData, "assigneePersonId"),
    branchId: readString(formData, "branchId"),
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

async function requireTaskManagerContext() {
  const context = await requireWorkspaceContext();

  if (context.role === "member") {
    throw new Error("Not authorized");
  }

  return context;
}

async function assignMaintenanceTask({
  assigneePersonId,
  branchId,
  organizationId,
  supabase,
  taskId,
}: {
  assigneePersonId: string | null;
  branchId: string | null;
  organizationId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  taskId: string;
}): Promise<MaintenanceActionState | null> {
  const { error } = await (supabase as unknown as UntypedSupabaseClient).rpc(
    "assign_maintenance_task",
    {
    p_assignee_person_id: assigneePersonId,
    p_branch_id: branchId,
    p_organization_id: organizationId,
    p_task_id: taskId,
    },
  );

  if (!error) {
    return null;
  }

  return {
    message: maintenanceActionErrorMessage(error.message),
    status: "error",
  };
}

async function getMaintenancePathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  taskId: string,
) {
  const { data } = await supabase
    .from("tasks")
    .select("property_id, unit_id")
    .eq("organization_id", organizationId)
    .eq("id", taskId)
    .maybeSingle();

  return data;
}

function revalidateMaintenancePaths({
  propertyIds = [],
  unitIds = [],
}: {
  propertyIds?: Array<string | null | undefined>;
  unitIds?: Array<string | null | undefined>;
}) {
  revalidatePath("/maintenance");
  revalidatePath("/maintenance-dashboard");
  revalidatePath("/work-orders");
  revalidatePath("/schedule");
  revalidatePath("/inspections");
  revalidatePath("/recurring-tasks");
  revalidatePath("/tasks");
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

  if (message.includes("Maintenance task not found")) {
    return "We could not find that maintenance case.";
  }

  if (message.includes("Vendor/person not found")) {
    return "Choose an active vendor or person.";
  }

  if (message.includes("Assignee not found")) {
    return "Choose an active staff assignee.";
  }

  if (message.includes("Branch not found")) {
    return "Choose an active branch.";
  }

  if (message.includes("Manager can only assign tasks in their branch")) {
    return "Managers can only assign tasks inside their branch.";
  }

  return "We could not save the maintenance case. Please check the fields and try again.";
}
