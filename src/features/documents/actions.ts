"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sha256Hex } from "@/features/documents/content-fingerprint";
import {
  getDocumentAuthorityDomain,
  getDocumentPermission,
} from "@/features/documents/document-authority";
import { removeUnregisteredDocumentObject } from "@/features/documents/storage-cleanup";
import {
  requirePermission,
  requireSuperAdminContext,
  requireWorkspaceContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { validateUploadedFileContent } from "@/lib/uploads/upload-content";

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
  contentSha256?: string;
  documentId?: string;
  fieldErrors?: DocumentFieldErrors;
  fileName?: string;
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
  content_sha256: string | null;
  file_name: string;
  lease_id: string | null;
  ledger_entry_id: string | null;
  mime_type: string;
  property_id: string | null;
  size_bytes: number;
  storage_path: string;
  task_id: string | null;
  tenant_request_id: string | null;
  timeline_event_id: string | null;
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
  const context = await requireWorkspaceContext();
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

  const verifiedFile = await validateUploadedFileContent(file, [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!verifiedFile.ok) {
    return {
      fieldErrors: { document: ["Upload a PDF, JPG, PNG, or WebP document."] },
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

  await requirePermission(validationState.requiredPermission);

  if (!context.isSuperAdmin && context.branchId !== validationState.branchId) {
    return {
      fieldErrors: { propertyId: ["Choose an active property."] },
      status: "error",
    };
  }

  const contentSha256 = await sha256Hex(verifiedFile.bytes);
  const storagePath = getDocumentStoragePath(
    context.organizationId,
    validationState.branchId,
    file.name,
  );
  const { error: uploadError } = await supabase.storage
    .from("nestory-documents")
    .upload(storagePath, verifiedFile.bytes, {
      cacheControl: "3600",
      contentType: verifiedFile.contentType,
      upsert: false,
    });

  if (uploadError) {
    return {
      message: "We could not upload the document. Please try again.",
      status: "error",
    };
  }

  const { data: documentId, error } = await supabase.rpc("create_document", {
    p_category: parsed.data.category,
    p_content_sha256: contentSha256,
    p_file_name: file.name,
    p_lease_id: leaseId,
    p_mime_type: verifiedFile.contentType,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_size_bytes: verifiedFile.bytes.byteLength,
    p_storage_path: storagePath,
    p_task_id: taskId,
    p_unit_id: unitId,
  });

  if (error || !documentId) {
    await removeUnregisteredDocumentObject(supabase, storagePath);

    return {
      message: "We could not save the document record. Please try again.",
      status: "error",
    };
  }

  revalidateDocumentPaths({
    propertyIds: [parsed.data.propertyId],
    unitIds: [unitId],
  });
  revalidatePath("/balances");

  return {
    contentSha256,
    documentId,
    fileName: file.name,
    message: "Document uploaded.",
    status: "success",
  };
}

export async function updateDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const context = await requireWorkspaceContext();
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


  const verifiedReplacement = replacementFile
    ? await validateUploadedFileContent(replacementFile, [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ])
    : null;
  if (verifiedReplacement && !verifiedReplacement.ok) {
    return {
      fieldErrors: { document: ["Upload a PDF, JPG, PNG, or WebP document."] },
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

  const previousTimelineEvent = await getDocumentTimelineAuthoritySource(
    supabase,
    context.organizationId,
    previous.timeline_event_id,
  );
  await requirePermission(
    getDocumentPermission(
      getDocumentAuthorityDomain({
        leaseId: previous.lease_id,
        ledgerEntryId: previous.ledger_entry_id,
        propertyId: previous.property_id,
        taskId: previous.task_id,
        tenantRequestId: previous.tenant_request_id,
        timelineEvent: previousTimelineEvent,
      }),
      "write",
    ),
  );

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

  await requirePermission(
    getDocumentPermission(
      getDocumentAuthorityDomain({
        leaseId,
        ledgerEntryId: previous.ledger_entry_id,
        propertyId: parsed.data.propertyId,
        taskId,
        tenantRequestId: previous.tenant_request_id,
        timelineEvent: previousTimelineEvent,
      }),
      "write",
    ),
  );

  if (!context.isSuperAdmin && context.branchId !== validationState.branchId) {
    return {
      fieldErrors: { propertyId: ["Choose an active property."] },
      status: "error",
    };
  }

  const replacementPath = replacementFile
    ? getDocumentStoragePath(
        context.organizationId,
        validationState.branchId,
        replacementFile.name,
      )
    : null;
  const replacementSha256 = verifiedReplacement?.ok
    ? await sha256Hex(verifiedReplacement.bytes)
    : null;

  if (replacementFile && replacementPath && verifiedReplacement?.ok) {
    const { error: uploadError } = await supabase.storage
      .from("nestory-documents")
      .upload(replacementPath, verifiedReplacement.bytes, {
        cacheControl: "3600",
        contentType: verifiedReplacement.contentType,
        upsert: false,
      });

    if (uploadError) {
      return {
        message: "We could not upload the replacement file. Please try again.",
        status: "error",
      };
    }
  }

  if (
    replacementFile
    && replacementPath
    && replacementSha256
    && verifiedReplacement?.ok
  ) {
    const { data: replacementDocumentId, error: replacementError } =
      await supabase.rpc("replace_document", {
        p_category: parsed.data.category,
        p_content_sha256: replacementSha256,
        p_document_id: parsedDocumentId.data,
        p_file_name: replacementFile.name,
        p_lease_id: leaseId ?? undefined,
        p_mime_type: verifiedReplacement.contentType,
        p_organization_id: context.organizationId,
        p_property_id: parsed.data.propertyId,
        p_size_bytes: verifiedReplacement.bytes.byteLength,
        p_storage_path: replacementPath,
        p_task_id: taskId ?? undefined,
        p_unit_id: unitId ?? undefined,
      });

    if (replacementError || !replacementDocumentId) {
      await removeUnregisteredDocumentObject(supabase, replacementPath);

      return {
        message: replacementError
          ? documentActionErrorMessage(replacementError.message)
          : "We could not save the replacement document. Please try again.",
        status: "error",
      };
    }

    revalidateDocumentPaths({
      propertyIds: [previous.property_id, parsed.data.propertyId],
      unitIds: [previous.unit_id, unitId],
    });

    return {
      message: "Replacement uploaded as a new document.",
      status: "success",
    };
  }

  const { error } = await supabase.rpc("update_document", {
    p_category: parsed.data.category,
    p_document_id: parsedDocumentId.data,
    p_lease_id: leaseId ?? undefined,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_task_id: taskId ?? undefined,
    p_unit_id: unitId ?? undefined,
  });

  if (error) {
    return {
      message: documentActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateDocumentPaths({
    propertyIds: [previous?.property_id, parsed.data.propertyId],
    unitIds: [previous?.unit_id, unitId],
  });

  return {
    message: "Document updated.",
    status: "success",
  };
}

export async function fingerprintDocumentContentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const context = await requireSuperAdminContext();
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
  const document = await getDocumentPathContext(
    supabase,
    context.organizationId,
    parsedDocumentId.data,
  );

  if (!document) {
    return {
      message: "We could not find that document.",
      status: "error",
    };
  }

  if (document.content_sha256) {
    return {
      message: "This document already has a content fingerprint.",
      status: "error",
    };
  }

  const { data: downloadedFile, error: downloadError } = await supabase.storage
    .from("nestory-documents")
    .download(document.storage_path);

  if (downloadError || !downloadedFile) {
    return {
      message: "We could not read the stored document bytes.",
      status: "error",
    };
  }

  const contentSha256 = await sha256Hex(await downloadedFile.arrayBuffer());
  const { error } = await supabase.rpc("fingerprint_document_content", {
    p_content_sha256: contentSha256,
    p_document_id: parsedDocumentId.data,
    p_organization_id: context.organizationId,
  });

  if (error) {
    return {
      message: documentActionErrorMessage(error.message),
      status: "error",
    };
  }

  revalidateDocumentPaths({
    propertyIds: [document.property_id],
    unitIds: [document.unit_id],
  });

  return {
    message: "Document fingerprint recorded.",
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
  const context = await requireWorkspaceContext();
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

  const timelineEvent = await getDocumentTimelineAuthoritySource(
    supabase,
    context.organizationId,
    previous.timeline_event_id,
  );
  await requirePermission(
    getDocumentPermission(
      getDocumentAuthorityDomain({
        leaseId: previous.lease_id,
        ledgerEntryId: previous.ledger_entry_id,
        propertyId: previous.property_id,
        taskId: previous.task_id,
        tenantRequestId: previous.tenant_request_id,
        timelineEvent,
      }),
      "archive",
    ),
  );

  const { error } = await supabase.rpc(
    archived ? "archive_document" : "restore_document",
    {
      p_document_id: parsedDocumentId.data,
      p_organization_id: context.organizationId,
    },
  );

  if (error) {
    return {
      message: documentActionErrorMessage(error.message),
      status: "error",
    };
  }

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
}): Promise<
  | (DocumentActionState & { status: "error" })
  | {
      branchId: string;
      requiredPermission: ReturnType<typeof getDocumentPermission>;
      status: "success";
    }
> {
  const propertyResult = await supabase
    .from("properties")
    .select("id, branch_id")
    .eq("organization_id", organizationId)
    .eq("id", propertyId)
    .is("archived_at", null)
    .maybeSingle();

  if (propertyResult.error || !propertyResult.data?.branch_id) {
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
      .from("current_leases")
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

  return {
    branchId: propertyResult.data.branch_id,
    requiredPermission: getDocumentPermission(
      getDocumentAuthorityDomain({ leaseId, propertyId, taskId }),
      "write",
    ),
    status: "success",
  };
}

async function getDocumentTimelineAuthoritySource(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  timelineEventId: string | null,
) {
  if (!timelineEventId) return null;

  const { data } = await supabase
    .from("timeline_events")
    .select("event_type, lease_id, ledger_entry_id")
    .eq("organization_id", organizationId)
    .eq("id", timelineEventId)
    .maybeSingle();

  return data
    ? {
        eventType: data.event_type,
        leaseId: data.lease_id,
        ledgerEntryId: data.ledger_entry_id,
      }
    : null;
}

async function getDocumentPathContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  documentId: string,
) {
  const { data } = await supabase
    .from("documents")
    .select(
      "archived_at, category, content_sha256, file_name, lease_id, ledger_entry_id, mime_type, property_id, size_bytes, storage_path, task_id, tenant_request_id, timeline_event_id, unit_id",
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

function getDocumentStoragePath(
  organizationId: string,
  branchId: string,
  fileName: string,
) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");

  return `${organizationId}/branches/${branchId}/documents/${crypto.randomUUID()}-${safeFileName}`;
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
