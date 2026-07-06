"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildGenericImportPreviewRows,
  getGenericImportStats,
} from "@/features/imports/import-config";
import { getImportReferenceData } from "@/features/imports/data/imports";
import type {
  GenericImportPreviewRow,
  ImportType,
} from "@/features/imports/import.types";
import { requireAdminContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/types/database";

export type StageImportRunState = {
  draftKey?: string;
  message?: string;
  runId?: string;
  sourceFileName?: string;
  status?: "error" | "success";
  summary?: {
    blocked: number;
    ready: number;
    total: number;
    warnings: number;
  };
};

export type CommitImportRunState = {
  message?: string;
  runId?: string;
  status?: "error" | "success";
  summary?: {
    created: number;
    failed: number;
    skipped: number;
    updated: number;
  };
};

const maxImportRows = 500;
const importTypeSchema = z.enum(["properties", "units", "people", "leases"]);
const importMappingSchema = z.record(
  z.string(),
  z.string().trim().max(120),
);

const parsedRecordSchema = z.object({
  raw: z.record(z.string(), z.string()),
  rowNumber: z.number().int().positive(),
});

const stagePayloadSchema = z.object({
  draftKey: z.string().trim().min(1).max(2000),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().nonnegative().max(12 * 1024 * 1024),
  headers: z.array(z.string().trim().max(120)).min(1).max(100),
  importType: importTypeSchema,
  mapping: importMappingSchema,
  mimeType: z.string().trim().max(120).nullable(),
  records: z.array(parsedRecordSchema).min(1).max(maxImportRows),
});

const commitResultSchema = z.object({
  created: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});

const propertyImportDataSchema = z.object({
  acquisitionDate: z.string().nullable(),
  address: z.string().nullable(),
  code: z.string().min(1),
  existingPropertyId: z.uuid().nullable(),
  name: z.string().min(1),
  notes: z.string().nullable(),
  owner: z.string().nullable(),
  propertyType: z.string().min(1),
  status: z.enum(["active", "under_renovation", "inactive"]),
});

const peopleImportDataSchema = z.object({
  displayName: z.string().min(1),
  existingPersonId: z.uuid().nullable(),
  legalName: z.string().nullable(),
  notes: z.string().nullable(),
  partyType: z.enum(["individual", "company"]),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  roles: z.array(z.enum(["tenant", "owner", "vendor", "staff"])).min(1),
  taxIdentifier: z.string().nullable(),
});

const leaseImportDataSchema = z.object({
  depositAmount: z.number().nonnegative().nullable(),
  leaseEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leaseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthlyRentAmount: z.number().nonnegative(),
  propertyId: z.uuid(),
  status: z.enum([
    "active",
    "cancelled",
    "draft",
    "ended",
    "notice_given",
    "terminated",
  ]),
  tenantPersonId: z.uuid(),
  unitId: z.uuid(),
});

export async function stageImportRunAction(
  _state: StageImportRunState,
  formData: FormData,
): Promise<StageImportRunState> {
  const payload = readJsonFormValue(formData, "payload");

  if (!payload.ok) {
    return {
      message: payload.message,
      status: "error",
    };
  }

  const parsedPayload = stagePayloadSchema.safeParse(payload.value);

  if (!parsedPayload.success) {
    return {
      message: `Upload a CSV with headers and no more than ${maxImportRows} rows per run.`,
      status: "error",
    };
  }

  const context = await requireAdminContext();
  const supabase = await createSupabaseServerClient();
  const importDb = supabase as unknown as ImportSupabaseClient;
  const referenceData = await getImportReferenceData(context.organizationId);
  const rows = buildGenericImportPreviewRows({
    mapping: parsedPayload.data.mapping,
    records: parsedPayload.data.records,
    referenceData,
    type: parsedPayload.data.importType,
  });
  const stats = getGenericImportStats(rows);
  const insertRunResult = await importDb
    .from("import_runs")
    .insert({
      created_by: context.userId,
      error_rows: stats.errorCount,
      headers: parsedPayload.data.headers as Json,
      import_type: parsedPayload.data.importType,
      mapping: parsedPayload.data.mapping as Json,
      organization_id: context.organizationId,
      ready_rows: stats.readyCount,
      source_file_name: parsedPayload.data.fileName,
      source_file_size: parsedPayload.data.fileSize,
      source_mime_type: parsedPayload.data.mimeType,
      status: "staged",
      total_rows: stats.totalCount,
      updated_by: context.userId,
      warning_rows: stats.warningCount,
    })
    .select("id")
    .single();

  if (insertRunResult.error || !insertRunResult.data) {
    return {
      message: `Could not create import run: ${
        insertRunResult.error?.message ?? "No run was returned."
      }`,
      status: "error",
    };
  }

  const runId = insertRunResult.data.id;
  const rowInserts = rows.map((row) =>
    toImportRowInsert({
      organizationId: context.organizationId,
      row,
      runId,
    }),
  );
  const insertRowsResult = await importDb.from("import_rows").insert(rowInserts);

  if (insertRowsResult.error) {
    return {
      message: `Could not stage import rows: ${insertRowsResult.error.message}`,
      status: "error",
    };
  }

  await importDb.from("import_mappings").upsert(
    {
      created_by: context.userId,
      headers: parsedPayload.data.headers as Json,
      import_type: parsedPayload.data.importType,
      mapping: parsedPayload.data.mapping as Json,
      name: "Default",
      organization_id: context.organizationId,
      updated_by: context.userId,
    },
    { onConflict: "organization_id,import_type,name" },
  );

  revalidatePath("/import");

  return {
    draftKey: parsedPayload.data.draftKey,
    message:
      stats.errorCount > 0
        ? "Import run staged. Fix blocked rows before committing."
        : "Import run staged and ready to commit.",
    runId,
    sourceFileName: parsedPayload.data.fileName,
    status: "success",
    summary: {
      blocked: stats.errorCount,
      ready: stats.readyCount,
      total: stats.totalCount,
      warnings: stats.warningCount,
    },
  };
}

export async function commitStagedImportRunAction(
  _state: CommitImportRunState,
  formData: FormData,
): Promise<CommitImportRunState> {
  const runId = formData.get("runId");

  if (typeof runId !== "string" || !z.uuid().safeParse(runId).success) {
    return {
      message: "Stage an import run before committing.",
      status: "error",
    };
  }

  const context = await requireAdminContext();
  const supabase = await createSupabaseServerClient();
  const importDb = supabase as unknown as ImportSupabaseClient;
  const runResult = await importDb
    .from("import_runs")
    .select("id, import_type, status")
    .eq("id", runId)
    .eq("organization_id", context.organizationId)
    .single();

  if (runResult.error || !runResult.data) {
    return {
      message: "The import run no longer exists.",
      runId,
      status: "error",
    };
  }

  const run = runResult.data as ImportRunRow;
  const importType = importTypeSchema.safeParse(run.import_type);

  if (!importType.success) {
    return {
      message: "This import type is not supported.",
      runId,
      status: "error",
    };
  }

  if (
    run.status === "committed" ||
    run.status === "committed_with_errors"
  ) {
    return {
      message: "This import run has already been committed.",
      runId,
      status: "error",
    };
  }

  if (importType.data === "units") {
    return commitUnitImportRun({
      importDb,
      organizationId: context.organizationId,
      runId,
    });
  }

  return commitGenericImportRun({
    importDb,
    importType: importType.data,
    organizationId: context.organizationId,
    runId,
  });
}

type ImportSupabaseClient = {
  from: (table: "import_mappings" | "import_rows" | "import_runs") => {
    insert: (values: unknown) => ImportQuery<{ id: string }>;
    select: (columns: string) => ImportQuery<unknown>;
    update: (values: unknown) => ImportQuery<unknown>;
    upsert: (
      values: unknown,
      options: { onConflict: string },
    ) => Promise<DbResult<unknown>>;
  };
  rpc: (
    fn:
      | "commit_unit_import_run"
      | "create_lease"
      | "create_person"
      | "create_property"
      | "update_person"
      | "update_property",
    args: Record<string, unknown>,
  ) => Promise<DbResult<unknown>>;
};

type DbResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type ImportQuery<T> = Promise<DbResult<T>> & {
  eq: (column: string, value: unknown) => ImportQuery<T>;
  in: (column: string, values: unknown[]) => ImportQuery<T>;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => Promise<DbResult<T>>;
  select: (columns: string) => ImportQuery<T>;
  single: () => Promise<DbResult<T>>;
};

type ImportRunRow = {
  id: string;
  import_type: string;
  status: string;
};

type StagedImportRow = {
  id: string;
  normalized_data: unknown;
  source_row_number: number;
};

async function commitUnitImportRun({
  importDb,
  organizationId,
  runId,
}: {
  importDb: ImportSupabaseClient;
  organizationId: string;
  runId: string;
}): Promise<CommitImportRunState> {
  const { data, error } = await importDb.rpc("commit_unit_import_run", {
    p_import_run_id: runId,
    p_organization_id: organizationId,
  });

  if (error) {
    return {
      message: importRunErrorMessage(error.message),
      runId,
      status: "error",
    };
  }

  const summary = commitResultSchema.safeParse(data);

  if (!summary.success) {
    return {
      message: "Import committed, but the commit summary could not be read.",
      runId,
      status: "success",
    };
  }

  revalidateImportPaths("units");

  return {
    message: `Committed ${summary.data.created + summary.data.updated} unit row${
      summary.data.created + summary.data.updated === 1 ? "" : "s"
    }.`,
    runId,
    status: "success",
    summary: summary.data,
  };
}

async function commitGenericImportRun({
  importDb,
  importType,
  organizationId,
  runId,
}: {
  importDb: ImportSupabaseClient;
  importType: Exclude<ImportType, "units">;
  organizationId: string;
  runId: string;
}): Promise<CommitImportRunState> {
  await importDb
    .from("import_runs")
    .update({
      error_message: null,
      status: "committing",
    })
    .eq("id", runId)
    .eq("organization_id", organizationId);

  const skippedResult = await importDb
    .from("import_rows")
    .select("id")
    .eq("import_run_id", runId)
    .eq("organization_id", organizationId)
    .eq("row_status", "error");
  const rowsResult = await importDb
    .from("import_rows")
    .select("id, source_row_number, normalized_data")
    .eq("import_run_id", runId)
    .eq("organization_id", organizationId)
    .in("row_status", ["ready", "warning"])
    .order("source_row_number", { ascending: true });

  if (rowsResult.error) {
    await markImportRunFailed(importDb, organizationId, runId, rowsResult.error.message);

    return {
      message: "The staged import rows could not be loaded.",
      runId,
      status: "error",
    };
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const skipped = Array.isArray(skippedResult.data)
    ? skippedResult.data.length
    : 0;

  for (const row of (rowsResult.data ?? []) as StagedImportRow[]) {
    const result = await commitGenericImportRow({
      importDb,
      importType,
      normalizedData: row.normalized_data,
      organizationId,
    });

    if (result.status === "error") {
      failed += 1;
      await markImportRowFailed(importDb, row.id, result.message);
      continue;
    }

    if (result.action === "created") {
      created += 1;
    } else {
      updated += 1;
    }

    await importDb
      .from("import_rows")
      .update({
        error_message: null,
        result_action: result.action,
        row_status: "committed",
      })
      .eq("id", row.id);
  }

  const status =
    failed > 0 && created + updated > 0
      ? "committed_with_errors"
      : failed > 0
        ? "failed"
        : "committed";

  await importDb
    .from("import_runs")
    .update({
      committed_at: new Date().toISOString(),
      created_count: created,
      error_message: failed > 0 ? "Some rows could not be committed." : null,
      failed_count: failed,
      skipped_count: skipped,
      status,
      updated_count: updated,
    })
    .eq("id", runId)
    .eq("organization_id", organizationId);

  revalidateImportPaths(importType);

  return {
    message: `Committed ${created + updated} ${importType} row${
      created + updated === 1 ? "" : "s"
    }.`,
    runId,
    status: "success",
    summary: {
      created,
      failed,
      skipped,
      updated,
    },
  };
}

async function commitGenericImportRow({
  importDb,
  importType,
  normalizedData,
  organizationId,
}: {
  importDb: ImportSupabaseClient;
  importType: Exclude<ImportType, "units">;
  normalizedData: unknown;
  organizationId: string;
}): Promise<
  | { action: "created" | "updated"; status: "success" }
  | { message: string; status: "error" }
> {
  if (importType === "properties") {
    return commitPropertyRow(importDb, organizationId, normalizedData);
  }

  if (importType === "people") {
    return commitPeopleRow(importDb, organizationId, normalizedData);
  }

  return commitLeaseRow(importDb, organizationId, normalizedData);
}

async function commitPropertyRow(
  importDb: ImportSupabaseClient,
  organizationId: string,
  normalizedData: unknown,
): Promise<
  | { action: "created" | "updated"; status: "success" }
  | { message: string; status: "error" }
> {
  const parsed = propertyImportDataSchema.safeParse(normalizedData);

  if (!parsed.success) {
    return {
      message: "The staged property row is no longer valid.",
      status: "error" as const,
    };
  }

  const payload = {
    p_acquisition_date: parsed.data.acquisitionDate,
    p_address: parsed.data.address,
    p_code: parsed.data.code,
    p_name: parsed.data.name,
    p_notes: parsed.data.notes,
    p_organization_id: organizationId,
    p_owner: parsed.data.owner,
    p_owner_person_id: null,
    p_property_type: parsed.data.propertyType,
    p_status: parsed.data.status,
  };
  const rpcResult = parsed.data.existingPropertyId
    ? await importDb.rpc("update_property", {
        ...payload,
        p_property_id: parsed.data.existingPropertyId,
      })
    : await importDb.rpc("create_property", payload);

  if (rpcResult.error) {
    return {
      message: rpcResult.error.message,
      status: "error" as const,
    };
  }

  return {
    action: parsed.data.existingPropertyId ? ("updated" as const) : ("created" as const),
    status: "success" as const,
  };
}

async function commitPeopleRow(
  importDb: ImportSupabaseClient,
  organizationId: string,
  normalizedData: unknown,
): Promise<
  | { action: "created" | "updated"; status: "success" }
  | { message: string; status: "error" }
> {
  const parsed = peopleImportDataSchema.safeParse(normalizedData);

  if (!parsed.success) {
    return {
      message: "The staged people row is no longer valid.",
      status: "error" as const,
    };
  }

  const payload = {
    p_display_name: parsed.data.displayName,
    p_legal_name: parsed.data.legalName,
    p_notes: parsed.data.notes,
    p_organization_id: organizationId,
    p_party_type: parsed.data.partyType,
    p_primary_email: parsed.data.primaryEmail,
    p_primary_phone: parsed.data.primaryPhone,
    p_roles: parsed.data.roles,
    p_tax_identifier: parsed.data.taxIdentifier,
  };
  const rpcResult = parsed.data.existingPersonId
    ? await importDb.rpc("update_person", {
        ...payload,
        p_person_id: parsed.data.existingPersonId,
      })
    : await importDb.rpc("create_person", payload);

  if (rpcResult.error) {
    return {
      message: rpcResult.error.message,
      status: "error" as const,
    };
  }

  return {
    action: parsed.data.existingPersonId ? ("updated" as const) : ("created" as const),
    status: "success" as const,
  };
}

async function commitLeaseRow(
  importDb: ImportSupabaseClient,
  organizationId: string,
  normalizedData: unknown,
): Promise<
  | { action: "created" | "updated"; status: "success" }
  | { message: string; status: "error" }
> {
  const parsed = leaseImportDataSchema.safeParse(normalizedData);

  if (!parsed.success) {
    return {
      message: "The staged lease row is no longer valid.",
      status: "error" as const,
    };
  }

  const rpcResult = await importDb.rpc("create_lease", {
    p_deposit_amount: parsed.data.depositAmount,
    p_deposit_currency: parsed.data.depositAmount === null ? null : "USD",
    p_lease_end_date: parsed.data.leaseEndDate,
    p_lease_start_date: parsed.data.leaseStartDate,
    p_monthly_rent_amount: parsed.data.monthlyRentAmount,
    p_monthly_rent_currency: "USD",
    p_organization_id: organizationId,
    p_primary_tenant_person_id: parsed.data.tenantPersonId,
    p_property_id: parsed.data.propertyId,
    p_status: parsed.data.status,
    p_unit_id: parsed.data.unitId,
  });

  if (rpcResult.error) {
    return {
      message: rpcResult.error.message,
      status: "error" as const,
    };
  }

  return {
    action: "created" as const,
    status: "success" as const,
  };
}

function toImportRowInsert({
  organizationId,
  row,
  runId,
}: {
  organizationId: string;
  row: GenericImportPreviewRow;
  runId: string;
}) {
  const hasErrors = row.issues.some((issue) => issue.level === "error");
  const hasWarnings = row.issues.some((issue) => issue.level === "warning");

  return {
    action_label: row.actionLabel,
    import_run_id: runId,
    issues: row.issues as Json,
    normalized_data: row.normalizedData as Json,
    organization_id: organizationId,
    raw_data: row.raw as Json,
    row_status: hasErrors ? "error" : hasWarnings ? "warning" : "ready",
    source_row_number: row.sourceRowNumber,
  };
}

async function markImportRunFailed(
  importDb: ImportSupabaseClient,
  organizationId: string,
  runId: string,
  message: string,
) {
  await importDb
    .from("import_runs")
    .update({
      error_message: message,
      status: "failed",
    })
    .eq("id", runId)
    .eq("organization_id", organizationId);
}

async function markImportRowFailed(
  importDb: ImportSupabaseClient,
  rowId: string,
  message: string,
) {
  await importDb
    .from("import_rows")
    .update({
      error_message: message,
      row_status: "failed",
    })
    .eq("id", rowId);
}

function readJsonFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return {
      message: "The import payload is missing.",
      ok: false as const,
    };
  }

  try {
    return {
      ok: true as const,
      value: JSON.parse(value) as unknown,
    };
  } catch {
    return {
      message: "The import payload could not be read.",
      ok: false as const,
    };
  }
}

function revalidateImportPaths(importType: ImportType) {
  revalidatePath("/import");
  revalidatePath("/overview");
  revalidatePath("/reports");

  if (importType === "properties") {
    revalidatePath("/properties");
  }

  if (importType === "units") {
    revalidatePath("/units");
    revalidatePath("/properties");
    revalidatePath("/timeline");
    revalidatePath("/ledger");
  }

  if (importType === "people") {
    revalidatePath("/people");
    revalidatePath("/tenants");
    revalidatePath("/owners");
    revalidatePath("/vendors");
    revalidatePath("/staff");
  }

  if (importType === "leases") {
    revalidatePath("/leases");
    revalidatePath("/units");
    revalidatePath("/properties");
    revalidatePath("/people");
    revalidatePath("/timeline");
  }
}

function importRunErrorMessage(message: string) {
  if (message.includes("already been committed")) {
    return "This import run has already been committed.";
  }

  if (message.includes("not found")) {
    return "The import run no longer exists.";
  }

  if (message.includes("not authorized")) {
    return "You do not have permission to commit this import.";
  }

  return "The staged import could not be committed.";
}
