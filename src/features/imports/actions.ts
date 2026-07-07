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
  const importDb = supabase;
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
  const importDb = supabase;
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

  const run = runResult.data;
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

type ImportSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

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
    message: formatCommitSummaryMessage("units", summary.data),
    runId,
    status: toCommitActionStatus(summary.data),
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
  const { data, error } = await importDb.rpc("commit_generic_import_run", {
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

  revalidateImportPaths(importType);

  return {
    message: formatCommitSummaryMessage(importType, summary.data),
    runId,
    status: toCommitActionStatus(summary.data),
    summary: summary.data,
  };
}

function formatCommitSummaryMessage(
  importType: ImportType,
  summary: z.infer<typeof commitResultSchema>,
) {
  const saved = summary.created + summary.updated;
  const label = importTypeLabels[importType];
  const rowLabel = `${label} row${saved === 1 ? "" : "s"}`;

  if (summary.failed > 0 && saved === 0) {
    return `No ${label} rows were committed. Review ${summary.failed} failed row${
      summary.failed === 1 ? "" : "s"
    }.`;
  }

  if (summary.failed > 0) {
    return `Committed ${saved} ${rowLabel}; ${summary.failed} row${
      summary.failed === 1 ? "" : "s"
    } need review.`;
  }

  return `Committed ${saved} ${rowLabel}.`;
}

function toCommitActionStatus(summary: z.infer<typeof commitResultSchema>) {
  return summary.failed > 0 && summary.created + summary.updated === 0
    ? "error"
    : "success";
}

const importTypeLabels: Record<ImportType, string> = {
  leases: "lease",
  people: "person",
  properties: "property",
  units: "unit",
};

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
