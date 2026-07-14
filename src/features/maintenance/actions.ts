"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMaintenanceChecklistText } from "@/features/maintenance/maintenance.checklist";
import { getMaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import { getMaintenanceExecutionMode } from "@/features/maintenance/maintenance.execution";
import { canTransitionMaintenanceStatus } from "@/features/maintenance/maintenance.workflow";
import type { MaintenanceStatus } from "@/features/maintenance/maintenance.types";
import type { Json } from "@/types/database";
import { requireWorkspaceContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type MaintenanceFieldErrors = {
  actualCostAmount?: string[];
  assigneePersonId?: string[];
  branchId?: string[];
  blockedReason?: string[];
  category?: string[];
  checklistText?: string[];
  coordinatedNote?: string[];
  costEstimateAmount?: string[];
  description?: string[];
  dueDate?: string[];
  dueTime?: string[];
  priority?: string[];
  propertyId?: string[];
  recurrenceFrequency?: string[];
  reminderDate?: string[];
  reminderTime?: string[];
  reviewNote?: string[];
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
const maintenanceStatusSchema = z.enum([
  "pending",
  "scheduled",
  "in_progress",
  "blocked",
  "ready_for_review",
  "completed",
  "cancelled",
]);
const executionActionSchema = z.enum([
  "start",
  "resume",
  "set_checklist_item",
  "block",
  "submit_for_review",
]);
const reviewActionSchema = z.enum(["approve", "reopen"]);
const coordinatedActionSchema = z.enum(["start", "block", "resume", "complete"]);
const optionalReviewNoteSchema = z.string().trim().max(500, "Keep the note under 500 characters.");
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
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (!capabilities.canCreateCase) {
    return { message: "You do not have access to create maintenance cases.", status: "error" };
  }

  const parsed = maintenanceSchema.safeParse(readMaintenanceForm(formData));

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  if (parsed.data.status !== "pending" && parsed.data.status !== "scheduled") {
    return {
      fieldErrors: {
        status: ["New maintenance cases must be pending or scheduled."],
      },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const checklist = parseMaintenanceChecklistText(parsed.data.checklistText);
  const { error } = await supabase.rpc("create_maintenance_task", {
    p_category: parsed.data.category,
    p_assignee_person_id: parsed.data.assigneePersonId,
    p_branch_id: parsed.data.branchId,
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
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (!capabilities.canEditCaseStructure) {
    return { message: "You do not have access to edit maintenance case details.", status: "error" };
  }

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
    p_assignee_person_id: parsed.data.assigneePersonId,
    p_branch_id: parsed.data.branchId,
    p_category: parsed.data.category,
    p_checklist: checklist as Json,
    p_cost_estimate_amount: parsed.data.costEstimateAmount,
    p_cost_estimate_currency:
      parsed.data.costEstimateAmount === null ? null : "USD",
    p_description: parsed.data.description || null,
    p_due_date: parsed.data.dueDate,
    p_due_time: parsed.data.dueTime,
    p_link_actual_cost_to_ledger:
      capabilities.canPostMaintenanceCost &&
      formData.get("linkActualCostToLedger") === "on",
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

export async function updateMaintenanceStatusAction(
  taskId: string,
  status: MaintenanceStatus,
): Promise<MaintenanceActionState> {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (!capabilities.canManageCaseState) {
    return { message: "You do not have access to manage maintenance status.", status: "error" };
  }

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
      "id, property_id, unit_id, title, description, category, priority, status, due_date, due_time, reminder_date, reminder_time, vendor_person_id, cost_estimate_amount, cost_estimate_currency, actual_cost_amount, actual_cost_currency, checklist, recurrence_frequency, branch_id, assignee_person_id",
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

  const memberIdentityResult = await supabase.rpc("get_maintenance_execution_members", {
    p_organization_id: context.organizationId,
  });

  if (memberIdentityResult.error) {
    return {
      message: maintenanceActionErrorMessage(memberIdentityResult.error.message),
      status: "error",
    };
  }

  const executionMode = getMaintenanceExecutionMode(
    {
      assigneePersonId: task.assignee_person_id ?? undefined,
      branchId: task.branch_id ?? undefined,
    },
    (memberIdentityResult.data ?? []).map((identity) => ({
      branchId: identity.branch_id ?? undefined,
      personId: identity.person_id,
    })),
  );

  if (!canTransitionMaintenanceStatus(
    task.status as MaintenanceStatus,
    parsedStatus.data,
    { actorRole: context.role, executionMode },
  )) {
    return {
      message: "Use the assigned-member, coordinated-work, or review controls for execution transitions.",
      status: "error",
    };
  }

  const { error } = await supabase.rpc("update_maintenance_task", {
    p_actual_cost_amount: task.actual_cost_amount,
    p_actual_cost_currency: task.actual_cost_currency,
    p_assignee_person_id: task.assignee_person_id,
    p_branch_id: task.branch_id,
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
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);

  if (!capabilities.canArchiveCase) {
    return {
      message: "Only administrators can archive maintenance cases.",
      status: "error",
    };
  }

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

export async function executeAssignedMaintenanceTaskAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);
  const parsedTaskId = uuidShapeSchema.safeParse(readString(formData, "taskId"));
  const parsedAction = executionActionSchema.safeParse(readString(formData, "executionAction"));
  const blockedReason = readString(formData, "blockedReason").trim();
  const checklistItemId = readString(formData, "checklistItemId").trim();

  if (!capabilities.canExecuteAssignedCase) {
    return { message: "Only the assigned member can perform this work.", status: "error" };
  }

  if (!parsedTaskId.success || !parsedAction.success) {
    return { message: "Choose a supported maintenance action.", status: "error" };
  }

  if (parsedAction.data === "block" && (blockedReason.length < 3 || blockedReason.length > 500)) {
    return {
      fieldErrors: { blockedReason: ["Enter a blocker between 3 and 500 characters."] },
      status: "error",
    };
  }

  if (parsedAction.data === "set_checklist_item" && !checklistItemId) {
    return { message: "Choose a checklist item.", status: "error" };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getMaintenancePathContext(
    supabase,
    context.organizationId,
    parsedTaskId.data,
  );
  const { error } = await supabase.rpc("execute_assigned_maintenance_task", {
    p_action: parsedAction.data,
    p_blocked_reason: blockedReason || undefined,
    p_checklist_completed:
      parsedAction.data === "set_checklist_item"
        ? formData.get("checklistCompleted") === "true"
        : undefined,
    p_checklist_item_id: checklistItemId || undefined,
    p_organization_id: context.organizationId,
    p_task_id: parsedTaskId.data,
  });

  if (error) {
    return { message: maintenanceActionErrorMessage(error.message), status: "error" };
  }

  revalidateMaintenancePaths({
    propertyIds: [pathContext?.property_id],
    unitIds: [pathContext?.unit_id],
  });

  return {
    message:
      parsedAction.data === "submit_for_review"
        ? "Work submitted for manager review. Your execution responsibility is paused."
        : "Maintenance work updated.",
    status: "success",
  };
}

export async function executeCoordinatedMaintenanceTaskAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);
  const parsedTaskId = uuidShapeSchema.safeParse(readString(formData, "taskId"));
  const parsedAction = coordinatedActionSchema.safeParse(
    readString(formData, "coordinatedAction"),
  );
  const parsedNote = optionalReviewNoteSchema.safeParse(
    readString(formData, "coordinatedNote"),
  );

  if (!capabilities.canManageCaseState) {
    return {
      message: "Only an administrator or scoped manager can coordinate this work.",
      status: "error",
    };
  }

  if (!parsedTaskId.success || !parsedAction.success || !parsedNote.success) {
    return { message: "Choose a supported coordinated action and note.", status: "error" };
  }

  if (
    (parsedAction.data === "block" || parsedAction.data === "complete") &&
    (parsedNote.data.length < 3 || parsedNote.data.length > 500)
  ) {
    return {
      fieldErrors: {
        coordinatedNote: [
          parsedAction.data === "block"
            ? "Enter a blocker between 3 and 500 characters."
            : "Enter a completion note between 3 and 500 characters.",
        ],
      },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getMaintenancePathContext(
    supabase,
    context.organizationId,
    parsedTaskId.data,
  );
  const { error } = await supabase.rpc("execute_coordinated_maintenance_task", {
    p_action: parsedAction.data,
    p_note: parsedNote.data || undefined,
    p_organization_id: context.organizationId,
    p_task_id: parsedTaskId.data,
  });

  if (error) {
    return { message: maintenanceActionErrorMessage(error.message), status: "error" };
  }

  revalidateMaintenancePaths({
    propertyIds: [pathContext?.property_id],
    unitIds: [pathContext?.unit_id],
  });

  return {
    message: parsedAction.data === "complete"
      ? "Coordinated work completed. The linked request is closed."
      : "Coordinated maintenance work updated.",
    status: "success",
  };
}

export async function reviewMaintenanceCompletionAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const context = await requireWorkspaceContext();
  const capabilities = getMaintenanceCapabilities(context.role);
  const parsedTaskId = uuidShapeSchema.safeParse(readString(formData, "taskId"));
  const parsedAction = reviewActionSchema.safeParse(readString(formData, "reviewAction"));
  const parsedNote = optionalReviewNoteSchema.safeParse(readString(formData, "reviewNote"));

  if (!capabilities.canReviewCompletion) {
    return { message: "You do not have access to review completion.", status: "error" };
  }

  if (!parsedTaskId.success || !parsedAction.success || !parsedNote.success) {
    return { message: "Choose a supported review action and note.", status: "error" };
  }

  if (
    parsedAction.data === "reopen" &&
    (parsedNote.data.length < 3 || parsedNote.data.length > 500)
  ) {
    return {
      fieldErrors: { reviewNote: ["A reopen note between 3 and 500 characters is required."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getMaintenancePathContext(
    supabase,
    context.organizationId,
    parsedTaskId.data,
  );
  const { error } = await supabase.rpc("review_maintenance_task_completion", {
    p_action: parsedAction.data,
    p_organization_id: context.organizationId,
    p_review_note: parsedNote.data || undefined,
    p_task_id: parsedTaskId.data,
  });

  if (error) {
    return { message: maintenanceActionErrorMessage(error.message), status: "error" };
  }

  revalidateMaintenancePaths({
    propertyIds: [pathContext?.property_id],
    unitIds: [pathContext?.unit_id],
  });

  return {
    message:
      parsedAction.data === "approve"
        ? "Completion approved. The maintenance case is complete."
        : "Work returned to the assignee with your review note.",
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
  revalidatePath("/overview");
  revalidatePath("/work-orders");
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

  if (message.includes("Vendor not found") || message.includes("Vendor/person not found")) {
    return "The selected vendor is no longer eligible. Choose an active vendor or clear the field.";
  }

  if (message.includes("Assignee not found")) {
    return "Choose an active staff assignee.";
  }

  if (message.includes("Branch not found")) {
    return "Choose an active branch.";
  }

  if (
    message.includes("Manager can only assign tasks in their branch") ||
    message.includes("Manager can only manage tasks in their branch")
  ) {
    return "Managers can only manage maintenance cases inside their branch.";
  }

  if (message.includes("Not authorized for this maintenance task")) {
    return "Only the assigned member can perform this maintenance work.";
  }

  if (message.includes("Only submitted maintenance work can be reviewed")) {
    return "This work is no longer waiting for completion review.";
  }

  if (message.includes("Reopen note must be between")) {
    return "A reopen note between 3 and 500 characters is required.";
  }

  if (message.includes("Managers cannot create, update, link, or post maintenance ledger entries")) {
    return "Managers can record actual cost, but only administrators can post it to the ledger.";
  }

  return "We could not save the maintenance case. Please check the fields and try again.";
}
