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
  document?: string[];
  eventId?: string[];
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

const timelineEventIdSchema = z.uuid("Choose a timeline event.");
const documentMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
      message: timelineActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateTimelinePaths({ unitIds: [unitId] });

  return {
    message: "Timeline event added.",
    status: "success",
  };
}

export async function updateTimelineEventAction(
  _state: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireAdminContext();
  const parsedEventId = timelineEventIdSchema.safeParse(
    readString(formData, "eventId"),
  );
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

  if (!parsedEventId.success) {
    return {
      fieldErrors: { eventId: ["Choose a timeline event."] },
      status: "error",
    };
  }

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
  const pathContext = await getTimelinePathContext(
    supabase,
    context.organizationId,
    parsedEventId.data,
  );
  const { error } = await supabase.rpc("update_timeline_event", {
    p_cost_amount: costAmount,
    p_cost_currency: costCurrency,
    p_description: parsed.data.description,
    p_event_date: parsed.data.eventDate,
    p_event_id: parsedEventId.data,
    p_event_type: parsed.data.eventType,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_title: parsed.data.title,
    p_unit_id: unitId,
  });

  if (error) {
    return {
      message: timelineActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateTimelinePaths({ unitIds: [pathContext?.unit_id, unitId] });

  return {
    message: "Timeline event updated.",
    status: "success",
  };
}

export async function archiveTimelineEventAction(
  _state: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireAdminContext();
  const parsedEventId = timelineEventIdSchema.safeParse(
    readString(formData, "eventId"),
  );

  if (!parsedEventId.success) {
    return {
      fieldErrors: { eventId: ["Choose a timeline event."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getTimelinePathContext(
    supabase,
    context.organizationId,
    parsedEventId.data,
  );
  const { error } = await supabase.rpc("archive_timeline_event", {
    p_event_id: parsedEventId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: timelineActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateTimelinePaths({ unitIds: [pathContext?.unit_id] });

  return {
    message: "Timeline event archived.",
    status: "success",
  };
}

export async function restoreTimelineEventAction(
  _state: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireAdminContext();
  const parsedEventId = timelineEventIdSchema.safeParse(
    readString(formData, "eventId"),
  );

  if (!parsedEventId.success) {
    return {
      fieldErrors: { eventId: ["Choose a timeline event."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const pathContext = await getTimelinePathContext(
    supabase,
    context.organizationId,
    parsedEventId.data,
  );
  const { error } = await supabase.rpc("restore_timeline_event", {
    p_event_id: parsedEventId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: timelineActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateTimelinePaths({ unitIds: [pathContext?.unit_id] });

  return {
    message: "Timeline event restored.",
    status: "success",
  };
}

export async function attachTimelineDocumentAction(
  _state: TimelineActionState,
  formData: FormData,
): Promise<TimelineActionState> {
  const context = await requireAdminContext();
  const parsedEventId = timelineEventIdSchema.safeParse(
    readString(formData, "eventId"),
  );
  const file = formData.get("document");

  if (!parsedEventId.success) {
    return {
      fieldErrors: { eventId: ["Choose a timeline event."] },
      status: "error",
    };
  }

  if (!(file instanceof File) || file.size === 0) {
    return {
      fieldErrors: { document: ["Choose a document file."] },
      status: "error",
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      fieldErrors: { document: ["Documents must be 10 MB or smaller."] },
      status: "error",
    };
  }

  if (!documentMimeTypes.has(file.type)) {
    return {
      fieldErrors: { document: ["Upload a PDF, JPG, PNG, or WebP document."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: event, error: eventError } = await supabase
    .from("timeline_events")
    .select("id, property_id, unit_id, ledger_entry_id")
    .eq("id", parsedEventId.data)
    .eq("organization_id", context.organizationId)
    .is("archived_at", null)
    .maybeSingle();

  if (eventError || !event) {
    return {
      message: "We could not find that active timeline event.",
      status: "error",
    };
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${context.organizationId}/timeline/${parsedEventId.data}/${crypto.randomUUID()}-${safeFileName}`;
  const { error: uploadError } = await supabase.storage
    .from("nestory-documents")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      message: "We could not upload the document. Please try again.",
      status: "error",
    };
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      category: "Timeline Document",
      file_name: file.name,
      ledger_entry_id: event.ledger_entry_id,
      mime_type: file.type,
      organization_id: context.organizationId,
      property_id: event.property_id,
      size_bytes: file.size,
      storage_path: storagePath,
      timeline_event_id: parsedEventId.data,
      unit_id: event.unit_id,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();

  if (documentError || !document) {
    await supabase.storage.from("nestory-documents").remove([storagePath]);

    return {
      message: "We could not save the document record. Please try again.",
      status: "error",
    };
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    action: "document_attached",
    actor_id: context.userId,
    entity_id: parsedEventId.data,
    entity_type: "timeline_event",
    new_values: {
      document_id: document.id,
      file_name: file.name,
      ledger_entry_id: event.ledger_entry_id,
    },
    organization_id: context.organizationId,
  });

  if (logError) {
    return {
      message: "Document attached, but the activity log could not be saved.",
      status: "error",
    };
  }

  revalidateTimelinePaths({
    includeDocuments: true,
    unitIds: [event.unit_id],
  });

  return {
    message: "Document attached.",
    status: "success",
  };
}

async function getTimelinePathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  eventId: string,
) {
  const { data } = await supabase
    .from("timeline_events")
    .select("unit_id")
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return data;
}

function revalidateTimelinePaths({
  includeDocuments = false,
  unitIds = [],
}: {
  includeDocuments?: boolean;
  unitIds?: Array<string | null | undefined>;
} = {}) {
  revalidatePath("/overview");
  revalidatePath("/timeline");
  revalidatePath("/properties");
  revalidatePath("/units");
  revalidatePath("/ledger");
  revalidatePath("/leases");
  revalidatePath("/reports");

  if (includeDocuments) {
    revalidatePath("/documents");
  }

  for (const unitId of new Set(unitIds.filter(Boolean))) {
    revalidatePath(`/units/${unitId}`);
  }
}

function timelineActionErrorMessage(message: string) {
  if (message.includes("Accounting period is locked")) {
    return "This accounting period is locked. Unlock the period before changing this record.";
  }

  if (message.includes("restored from ledger")) {
    return "This timeline event is linked to a ledger entry. Restore it from Ledger.";
  }

  if (message.includes("Ledger-linked")) {
    return "This timeline event is linked to a ledger entry. Edit or archive it from Ledger.";
  }

  return "We could not save the timeline event. Please check the fields and try again.";
}
