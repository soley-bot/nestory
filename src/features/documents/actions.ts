"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@/types/database";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

type DocumentFieldErrors = {
  category?: string[];
  document?: string[];
  documentId?: string[];
  leaseId?: string[];
  propertyId?: string[];
  taskId?: string[];
  unitId?: string[];
};

export type DocumentActionState = {
  fieldErrors?: DocumentFieldErrors;
  message?: string;
  status?: "error" | "success";
};

const documentIdSchema = z.uuid("Choose a document.");
const metadataSchema = z
  .object({
    category: z
      .string()
      .trim()
      .min(2, "Enter a category.")
      .max(80, "Keep the category under 80 characters."),
    leaseId: z.string().trim(),
    propertyId: z.uuid("Choose a property."),
    taskId: z.string().trim(),
    unitId: z.string().trim(),
  })
  .superRefine((data, context) => {
    if (data.leaseId && !z.uuid().safeParse(data.leaseId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid lease.",
        path: ["leaseId"],
      });
    }

    if (data.taskId && !z.uuid().safeParse(data.taskId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid maintenance case.",
        path: ["taskId"],
      });
    }

    if (data.unitId && !z.uuid().safeParse(data.unitId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid unit.",
        path: ["unitId"],
      });
    }
  });

const documentMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type DocumentPathContext = {
  archived_at: string | null;
  category: string;
  file_name: string;
  lease_id: string | null;
  mime_type: string;
  property_id: string | null;
  size_bytes: number;
  storage_path: string;
  task_id: string | null;
  unit_id: string | null;
};

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidFormState(error: z.ZodError): DocumentActionState {
  return {
    fieldErrors: error.flatten().fieldErrors as DocumentFieldErrors,
    status: "error",
  };
}

export async function createDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const context = await requireAdminContext();
  const parsed = metadataSchema.safeParse({
    category: readString(formData, "category"),
    leaseId: readString(formData, "leaseId"),
    propertyId: readString(formData, "propertyId"),
    taskId: readString(formData, "taskId"),
    unitId: readString(formData, "unitId"),
  });
  const file = formData.get("document");

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  if (!(file instanceof File) || file.size === 0) {
    return {
      fieldErrors: { document: ["Choose a document file."] },
      status: "error",
    };
  }

  const fileError = validateDocumentFile(file);

  if (fileError) {
    return {
      fieldErrors: { document: [fileError] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const leaseId = parsed.data.leaseId || null;
  const taskId = parsed.data.taskId || null;
  const unitId = parsed.data.unitId || null;
  const validationState = await validateDocumentLink({
    leaseId,
    organizationId: context.organizationId,
    propertyId: parsed.data.propertyId,
    supabase,
    taskId,
    unitId,
  });

  if (validationState.status === "error") {
    return validationState;
  }

  const storagePath = getDocumentStoragePath(context.organizationId, file.name);
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

  const { data: document, error } = await supabase
    .from("documents")
    .insert({
      category: parsed.data.category,
      file_name: file.name,
      lease_id: leaseId,
      mime_type: file.type,
      organization_id: context.organizationId,
      property_id: parsed.data.propertyId,
      size_bytes: file.size,
      storage_path: storagePath,
      task_id: taskId,
      unit_id: unitId,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !document) {
    await supabase.storage.from("nestory-documents").remove([storagePath]);

    return {
      message: "We could not save the document record. Please try again.",
      status: "error",
    };
  }

  await logDocumentActivity({
    action: "created",
    actorId: context.userId,
    documentId: document.id,
    newValues: {
      category: parsed.data.category,
      file_name: file.name,
      lease_id: leaseId,
      property_id: parsed.data.propertyId,
      task_id: taskId,
      unit_id: unitId,
    },
    organizationId: context.organizationId,
    supabase,
  });
  revalidateDocumentPaths({
    propertyIds: [parsed.data.propertyId],
    unitIds: [unitId],
  });

  return {
    message: "Document uploaded.",
    status: "success",
  };
}

export async function updateDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const context = await requireAdminContext();
  const parsedDocumentId = documentIdSchema.safeParse(
    readString(formData, "documentId"),
  );
  const parsed = metadataSchema.safeParse({
    category: readString(formData, "category"),
    leaseId: readString(formData, "leaseId"),
    propertyId: readString(formData, "propertyId"),
    taskId: readString(formData, "taskId"),
    unitId: readString(formData, "unitId"),
  });
  const replacementFile = getReplacementFile(formData);

  if (!parsedDocumentId.success) {
    return {
      fieldErrors: { documentId: ["Choose a document."] },
      status: "error",
    };
  }

  if (!parsed.success) {
    return invalidFormState(parsed.error);
  }

  if (replacementFile) {
    const fileError = validateDocumentFile(replacementFile);

    if (fileError) {
      return {
        fieldErrors: { document: [fileError] },
        status: "error",
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const previous = await getDocumentPathContext(
    supabase,
    context.organizationId,
    parsedDocumentId.data,
  );

  if (!previous) {
    return {
      message: "We could not find that document.",
      status: "error",
    };
  }

  const leaseId = parsed.data.leaseId || null;
  const taskId = parsed.data.taskId || null;
  const unitId = parsed.data.unitId || null;
  const validationState = await validateDocumentLink({
    leaseId,
    organizationId: context.organizationId,
    propertyId: parsed.data.propertyId,
    supabase,
    taskId,
    unitId,
  });

  if (validationState.status === "error") {
    return validationState;
  }

  const replacementPath = replacementFile
    ? getDocumentStoragePath(context.organizationId, replacementFile.name)
    : null;

  if (replacementFile && replacementPath) {
    const { error: uploadError } = await supabase.storage
      .from("nestory-documents")
      .upload(replacementPath, replacementFile, {
        cacheControl: "3600",
        contentType: replacementFile.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        message: "We could not upload the replacement file. Please try again.",
        status: "error",
      };
    }
  }

  const updateValues = {
    category: parsed.data.category,
    lease_id: leaseId,
    property_id: parsed.data.propertyId,
    task_id: taskId,
    unit_id: unitId,
  };

  if (replacementFile && replacementPath) {
    Object.assign(updateValues, {
      file_name: replacementFile.name,
      mime_type: replacementFile.type,
      size_bytes: replacementFile.size,
      storage_path: replacementPath,
    });
  }

  const { error } = await supabase
    .from("documents")
    .update(updateValues)
    .eq("organization_id", context.organizationId)
    .eq("id", parsedDocumentId.data);

  if (error) {
    if (replacementPath) {
      await supabase.storage.from("nestory-documents").remove([replacementPath]);
    }

    return {
      message: documentActionErrorMessage(error.message),
      status: "error",
    };
  }

  if (replacementPath) {
    const { error: removeError } = await supabase.storage
      .from("nestory-documents")
      .remove([previous.storage_path]);

    if (removeError) {
      console.warn(`Could not remove replaced document file: ${removeError.message}`);
    }
  }

  await logDocumentActivity({
    action: replacementFile ? "document_replaced" : "updated",
    actorId: context.userId,
    documentId: parsedDocumentId.data,
    newValues: {
      category: parsed.data.category,
      ...(replacementFile
        ? {
            file_name: replacementFile.name,
            mime_type: replacementFile.type,
            size_bytes: replacementFile.size,
          }
        : {}),
      lease_id: leaseId,
      property_id: parsed.data.propertyId,
      task_id: taskId,
      unit_id: unitId,
    },
    organizationId: context.organizationId,
    previousValues: previous ? toDocumentActivityValues(previous) : undefined,
    supabase,
  });
  revalidateDocumentPaths({
    propertyIds: [previous?.property_id, parsed.data.propertyId],
    unitIds: [previous?.unit_id, unitId],
  });

  return {
    message: replacementFile ? "Document file replaced." : "Document updated.",
    status: "success",
  };
}

export async function archiveDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return updateDocumentArchiveState({
    archived: true,
    fallbackMessage: "Document archived.",
    formData,
  });
}

export async function restoreDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  return updateDocumentArchiveState({
    archived: false,
    fallbackMessage: "Document restored.",
    formData,
  });
}

async function updateDocumentArchiveState({
  archived,
  fallbackMessage,
  formData,
}: {
  archived: boolean;
  fallbackMessage: string;
  formData: FormData;
}): Promise<DocumentActionState> {
  const context = await requireAdminContext();
  const parsedDocumentId = documentIdSchema.safeParse(
    readString(formData, "documentId"),
  );

  if (!parsedDocumentId.success) {
    return {
      fieldErrors: { documentId: ["Choose a document."] },
      status: "error",
    };
  }

  const supabase = await createSupabaseServerClient();
  const previous = await getDocumentPathContext(
    supabase,
    context.organizationId,
    parsedDocumentId.data,
  );

  if (!previous) {
    return {
      message: "We could not find that document.",
      status: "error",
    };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("documents")
    .update({
      archived_at: archived ? now : null,
      archived_by: archived ? context.userId : null,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", parsedDocumentId.data);

  if (error) {
    return {
      message: documentActionErrorMessage(error.message),
      status: "error",
    };
  }

  await logDocumentActivity({
    action: archived ? "archived" : "restored",
    actorId: context.userId,
    documentId: parsedDocumentId.data,
    newValues: { archived_at: archived ? now : null },
    organizationId: context.organizationId,
    previousValues: previous ? toDocumentActivityValues(previous) : undefined,
    supabase,
  });
  revalidateDocumentPaths({
    propertyIds: [previous?.property_id],
    unitIds: [previous?.unit_id],
  });

  return {
    message: fallbackMessage,
    status: "success",
  };
}

async function validateDocumentLink({
  leaseId,
  organizationId,
  propertyId,
  supabase,
  taskId,
  unitId,
}: {
  leaseId: string | null;
  organizationId: string;
  propertyId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  taskId: string | null;
  unitId: string | null;
}): Promise<DocumentActionState> {
  const propertyResult = await supabase
    .from("properties")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", propertyId)
    .is("archived_at", null)
    .maybeSingle();

  if (propertyResult.error || !propertyResult.data) {
    return {
      fieldErrors: { propertyId: ["Choose an active property."] },
      status: "error",
    };
  }

  if (unitId) {
    const unitResult = await supabase
      .from("units")
      .select("id, property_id")
      .eq("organization_id", organizationId)
      .eq("id", unitId)
      .is("archived_at", null)
      .maybeSingle();

    if (unitResult.error || !unitResult.data) {
      return {
        fieldErrors: { unitId: ["Choose an active unit."] },
        status: "error",
      };
    }

    if (unitResult.data.property_id !== propertyId) {
      return {
        fieldErrors: { unitId: ["Choose a unit under the selected property."] },
        status: "error",
      };
    }
  }

  if (leaseId) {
    const leaseResult = await supabase
      .from("leases")
      .select("id, property_id, unit_id")
      .eq("organization_id", organizationId)
      .eq("id", leaseId)
      .is("archived_at", null)
      .maybeSingle();

    if (leaseResult.error || !leaseResult.data) {
      return {
        fieldErrors: { leaseId: ["Choose an active lease."] },
        status: "error",
      };
    }

    if (leaseResult.data.property_id !== propertyId) {
      return {
        fieldErrors: { leaseId: ["Choose a lease under the selected property."] },
        status: "error",
      };
    }

    if (leaseResult.data.unit_id && leaseResult.data.unit_id !== unitId) {
      return {
        fieldErrors: { leaseId: ["Choose the lease unit before linking this document."] },
        status: "error",
      };
    }
  }

  if (taskId) {
    const taskResult = await supabase
      .from("tasks")
      .select("id, property_id, unit_id")
      .eq("organization_id", organizationId)
      .eq("id", taskId)
      .is("archived_at", null)
      .maybeSingle();

    if (taskResult.error || !taskResult.data) {
      return {
        fieldErrors: { taskId: ["Choose an active maintenance case."] },
        status: "error",
      };
    }

    if (taskResult.data.property_id !== propertyId) {
      return {
        fieldErrors: {
          taskId: ["Choose a maintenance case under the selected property."],
        },
        status: "error",
      };
    }

    if (taskResult.data.unit_id && taskResult.data.unit_id !== unitId) {
      return {
        fieldErrors: {
          taskId: ["Choose the task unit before linking this document."],
        },
        status: "error",
      };
    }
  }

  return { status: "success" };
}

async function getDocumentPathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  documentId: string,
) {
  const { data } = await supabase
    .from("documents")
    .select(
      "archived_at, category, file_name, lease_id, mime_type, property_id, size_bytes, storage_path, task_id, unit_id",
    )
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();

  return data as DocumentPathContext | null;
}

function getReplacementFile(formData: FormData) {
  const file = formData.get("document");

  return file instanceof File && file.size > 0 ? file : null;
}

function getDocumentStoragePath(organizationId: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");

  return `${organizationId}/documents/${crypto.randomUUID()}-${safeFileName}`;
}

function toDocumentActivityValues(document: DocumentPathContext) {
  return {
    archived_at: document.archived_at,
    category: document.category,
    file_name: document.file_name,
    lease_id: document.lease_id,
    mime_type: document.mime_type,
    property_id: document.property_id,
    size_bytes: document.size_bytes,
    task_id: document.task_id,
    unit_id: document.unit_id,
  };
}

async function logDocumentActivity({
  action,
  actorId,
  documentId,
  newValues,
  organizationId,
  previousValues,
  supabase,
}: {
  action: string;
  actorId: string;
  documentId: string;
  newValues: Record<string, unknown>;
  organizationId: string;
  previousValues?: Record<string, unknown>;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  const { error } = await supabase.from("activity_logs").insert({
    action,
    actor_id: actorId,
    entity_id: documentId,
    entity_type: "document",
    new_values: newValues as Json,
    organization_id: organizationId,
    previous_values: previousValues ? (previousValues as Json) : null,
  });

  if (error) {
    console.warn(`Could not log document activity: ${error.message}`);
  }
}

function validateDocumentFile(file: File) {
  if (file.size > 10 * 1024 * 1024) {
    return "Documents must be 10 MB or smaller.";
  }

  if (!documentMimeTypes.has(file.type)) {
    return "Upload a PDF, JPG, PNG, or WebP document.";
  }

  return "";
}

function revalidateDocumentPaths({
  propertyIds = [],
  unitIds = [],
}: {
  propertyIds?: Array<string | null | undefined>;
  unitIds?: Array<string | null | undefined>;
}) {
  revalidatePath("/overview");
  revalidatePath("/documents");
  revalidatePath("/ledger");
  revalidatePath("/leases");
  revalidatePath("/maintenance");
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

function documentActionErrorMessage(message: string) {
  if (message.includes("violates row-level security")) {
    return "You do not have access to save this document.";
  }

  return "We could not save the document. Please check the fields and try again.";
}
