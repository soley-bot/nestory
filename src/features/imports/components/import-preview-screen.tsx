"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  RotateCcw,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CSV_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { SelectControl } from "@/components/ui/select-control";
import {
  commitStagedImportRunAction,
  importReadyRowsAction,
  type CommitImportRunState,
  type ImportReadyRowsState,
} from "@/features/imports/actions";
import {
  autoMapImportHeaders,
  buildGenericImportPreviewRows,
  buildImportTemplateCsv,
  getGenericImportCleanupItems,
  getGenericImportStats,
  getImportTypeConfig,
  importTypeOrder,
} from "@/features/imports/import-config";
import { buildImportDraftKey } from "@/features/imports/import-draft-key";
import type {
  GenericImportPreviewRow,
  ImportMapping,
  ImportReferenceData,
  ImportRunSummary,
  ImportSavedMapping,
  ImportType,
  ParsedCsvRecord,
  UnitImportCleanupItem,
} from "@/features/imports/import.types";
import { parseCsv } from "@/features/imports/unit-import";

type ParsedFile = {
  fileName: string;
  fileSize: number;
  headers: string[];
  mimeType: string | null;
  records: ParsedCsvRecord[];
};

const initialImportState: ImportReadyRowsState = {};
const initialResumeState: CommitImportRunState = {};

export function ImportPreviewScreen({
  recentRuns,
  referenceData,
  savedMappings,
}: {
  recentRuns: ImportRunSummary[];
  referenceData: ImportReferenceData;
  savedMappings: ImportSavedMapping[];
}) {
  const [importState, importAction, importing] = useActionState(
    importReadyRowsAction,
    initialImportState,
  );
  const [resumeState, resumeAction, resuming] = useActionState(
    commitStagedImportRunAction,
    initialResumeState,
  );
  const [selectedType, setSelectedType] = useState<ImportType>(
    referenceData.properties.length > 0 ? "units" : "properties",
  );
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const config = getImportTypeConfig(selectedType);
  const availability = getImportAvailability(selectedType, referenceData);
  const savedMapping = savedMappings.find(
    (item) => item.importType === selectedType,
  );
  const rows = useMemo(
    () =>
      parsedFile
        ? buildGenericImportPreviewRows({
            mapping,
            records: parsedFile.records,
            referenceData,
            type: selectedType,
          })
        : [],
    [mapping, parsedFile, referenceData, selectedType],
  );
  const stats = getGenericImportStats(rows);
  const cleanupItems = getGenericImportCleanupItems(selectedType, rows);
  const blockedRows = rows.filter((row) =>
    row.issues.some((issue) => issue.level === "error"),
  );
  const missingRequiredMatches = config.fields.filter(
    (field) => field.required && !mapping[field.key],
  ).length;
  const mappedFieldCount = config.fields.filter(
    (field) => mapping[field.key],
  ).length;
  const draftKey = useMemo(
    () =>
      parsedFile
        ? buildImportDraftKey({
            fileName: parsedFile.fileName,
            headers: parsedFile.headers,
            importType: selectedType,
            mapping,
            records: parsedFile.records,
          })
        : null,
    [mapping, parsedFile, selectedType],
  );
  const payload = useMemo(
    () =>
      parsedFile
        ? JSON.stringify({
            draftKey,
            fileName: parsedFile.fileName,
            fileSize: parsedFile.fileSize,
            headers: parsedFile.headers,
            importType: selectedType,
            mapping,
            mimeType: parsedFile.mimeType,
            records: parsedFile.records,
          })
        : "",
    [draftKey, mapping, parsedFile, selectedType],
  );
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildImportTemplateCsv(selectedType, referenceData),
  )}`;
  const templateLabel = getTemplateDownloadLabel(selectedType, referenceData);
  const headerOptions = [
    { label: "Not mapped", value: "" },
    ...(parsedFile?.headers ?? []).map((header) => ({
      label: header,
      value: header,
    })),
  ];
  const errorRowsHref = useMemo(
    () =>
      parsedFile && blockedRows.length > 0
        ? buildErrorRowsCsvHref(blockedRows, parsedFile.headers)
        : "",
    [blockedRows, parsedFile],
  );
  const fixTemplateHref = useMemo(
    () =>
      parsedFile && blockedRows.length > 0
        ? buildFixTemplateCsvHref({
            mapping,
            referenceData,
            rows: blockedRows,
            type: selectedType,
          })
        : "",
    [blockedRows, mapping, parsedFile, referenceData, selectedType],
  );
  const currentAction = getCurrentImportAction({
    draftKey,
    readyCount: stats.readyCount,
    state: importState,
  });
  const showCurrentActionState =
    Boolean(importState.message) &&
    (!importState.draftKey || importState.draftKey === draftKey);

  async function handleFileSelect(file: File) {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);

      if (parsed.headers.length === 0) {
        setFileError("The file does not have a header row.");
        setParsedFile(null);
        setMapping({});
        return;
      }

      setParsedFile({
        fileName: file.name,
        fileSize: file.size,
        headers: parsed.headers,
        mimeType: file.type || null,
        records: parsed.records,
      });
      setMapping(mapHeadersForType(selectedType, parsed.headers, savedMapping));
      setFileError(null);
    } catch {
      setFileError("The file could not be read.");
      setParsedFile(null);
      setMapping({});
    }
  }

  function chooseType(type: ImportType) {
    setSelectedType(type);
    setParsedFile(null);
    setMapping({});
    setFileError(null);
  }

  function updateMapping(field: string, value: string) {
    setMapping((current) => ({
      ...current,
      [field]: value || undefined,
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        description="Upload a CSV, review the rows that need attention, then import the ready rows."
        title="Import"
      />

      <main className="mx-auto w-full max-w-[1120px] space-y-3 px-4 py-4 sm:px-6 lg:max-h-[calc(100vh-112px)] lg:overflow-auto lg:py-5">
        <section className="rounded-md border border-border bg-card">
          <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto] sm:items-end">
            <label className="block min-w-0 text-sm font-medium">
              <span className="mb-1.5 block">Import type</span>
              <SelectControl
                ariaLabel="Import type"
                onValueChange={(value) => chooseType(value as ImportType)}
                options={importTypeOrder.map((type) => ({
                  label: getImportTypeConfig(type).label,
                  value: type,
                }))}
                value={selectedType}
              />
            </label>
            <div className="min-w-0 pb-0.5">
              <p className="text-sm text-foreground">{config.description}</p>
              <p
                className={
                  availability.ready
                    ? "mt-1 text-xs text-muted-foreground"
                    : "mt-1 text-xs font-medium text-warning"
                }
              >
                {availability.message}
              </p>
            </div>
            <a
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              download={`nestory-${selectedType}-import-template.csv`}
              href={templateHref}
            >
              <Download aria-hidden="true" size={14} />
              {templateLabel}
            </a>
          </div>

          <div className="p-4">
            <FileDropzoneField
              aria-label="Select CSV file to import"
              accept={CSV_FILE_ACCEPT}
              description="CSV only. Nestory matches recognizable columns automatically."
              displayFileName={parsedFile?.fileName}
              onFile={handleFileSelect}
            />
            {fileError ? (
              <p
                className="mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {fileError}
              </p>
            ) : null}
          </div>
        </section>

        {parsedFile ? (
          <section className="overflow-hidden rounded-md border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {parsedFile.fileName}
                </h2>
                <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                  {stats.readyCount} ready, {stats.errorCount} need attention
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.totalCount} row{stats.totalCount === 1 ? "" : "s"}
                {stats.warningCount > 0
                  ? ` · ${stats.warningCount} warning${
                      stats.warningCount === 1 ? "" : "s"
                    }`
                  : ""}
              </p>
            </div>

            <details
              className="border-b border-border"
              open={missingRequiredMatches > 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span>
                  Column mapping · {mappedFieldCount} matched ·{" "}
                  {missingRequiredMatches} required missing
                </span>
                <ChevronDown aria-hidden="true" className="text-muted-foreground" size={15} />
              </summary>
              <div className="border-t border-border bg-muted/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Required fields are marked with an asterisk.
                  </p>
                  <Button
                    onClick={() =>
                      setMapping(
                        mapHeadersForType(
                          selectedType,
                          parsedFile.headers,
                          savedMapping,
                        ),
                      )
                    }
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={14} />
                    Auto-map again
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {config.fields.map((field) => (
                    <label
                      className="block min-w-0 text-sm font-medium"
                      key={field.key}
                    >
                      <span className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {field.label}
                          {field.required ? (
                            <span className="ml-1 text-danger">*</span>
                          ) : null}
                        </span>
                        <span
                          className={
                            mapping[field.key]
                              ? "text-[11px] text-success"
                              : field.required
                                ? "text-[11px] text-danger"
                                : "text-[11px] text-muted-foreground"
                          }
                        >
                          {mapping[field.key]
                            ? "Matched"
                            : field.required
                              ? "Missing"
                              : "Optional"}
                        </span>
                      </span>
                      <SelectControl
                        ariaLabel={`Map ${field.label}`}
                        onValueChange={(value) =>
                          updateMapping(field.key, value)
                        }
                        options={headerOptions}
                        value={mapping[field.key] ?? ""}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </details>

            <div
              aria-label="Import preview rows"
              className="max-h-[380px] max-w-full overflow-auto"
              role="region"
              tabIndex={0}
            >
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-muted text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Row
                    </th>
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Record
                    </th>
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Destination
                    </th>
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Action
                    </th>
                    <th className="border-b border-border px-3 py-2 font-semibold">
                      Issues
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PreviewRow key={row.sourceRowNumber} row={row} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {showCurrentActionState ? (
                  <p
                    className={
                      importState.status === "error"
                        ? "text-sm text-danger"
                        : "text-sm text-success"
                    }
                    role={importState.status === "error" ? "alert" : "status"}
                  >
                    {importState.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only ready rows are written. Blocked rows stay in the import
                    run for correction.
                  </p>
                )}
              </div>
              <form action={importAction} className="shrink-0">
                <input name="payload" type="hidden" value={payload} />
                <Button
                  disabled={
                    importing ||
                    currentAction.blocksSubmission ||
                    rows.length === 0 ||
                    stats.readyCount === 0
                  }
                  type="submit"
                  variant="default"
                >
                  {currentAction.mode === "imported" ? (
                    <CheckCircle2 aria-hidden="true" size={15} />
                  ) : (
                    <Upload aria-hidden="true" size={15} />
                  )}
                  {importing ? "Importing ready rows..." : currentAction.label}
                </Button>
              </form>
            </div>
          </section>
        ) : null}

        {parsedFile && cleanupItems.length > 0 ? (
          <AttentionDetails
            errorCount={stats.errorCount}
            errorRowsHref={errorRowsHref}
            fixTemplateHref={fixTemplateHref}
            items={cleanupItems}
            warningCount={stats.warningCount}
          />
        ) : null}

        <PastImports
          action={resumeAction}
          pending={resuming}
          runs={recentRuns}
          state={resumeState}
        />
      </main>
    </div>
  );
}

export function getCurrentImportAction({
  draftKey,
  readyCount,
  state,
}: {
  draftKey: string | null;
  readyCount: number;
  state: ImportReadyRowsState;
}) {
  const rowLabel = `${readyCount} ready ${readyCount === 1 ? "row" : "rows"}`;
  const isCurrentDraft = Boolean(draftKey) && state.draftKey === draftKey;

  if (isCurrentDraft && state.status === "success") {
    return {
      blocksSubmission: true,
      label: "Ready rows imported",
      mode: "imported" as const,
    };
  }

  if (
    isCurrentDraft &&
    state.status === "error" &&
    state.runStatus === "failed"
  ) {
    return {
      blocksSubmission: true,
      label: "Terminal result — re-upload CSV",
      mode: "terminal" as const,
    };
  }

  if (
    isCurrentDraft &&
    state.status === "error" &&
    state.runStatus === "committing"
  ) {
    return {
      blocksSubmission: true,
      label: "Import still committing",
      mode: "committing" as const,
    };
  }

  if (
    isCurrentDraft &&
    state.status === "error" &&
    Boolean(state.runId) &&
    state.runStatus === "staged"
  ) {
    return {
      blocksSubmission: false,
      label: `Retry ${rowLabel}`,
      mode: "retry" as const,
    };
  }

  return {
    blocksSubmission: false,
    label: `Import ${rowLabel}`,
    mode: "idle" as const,
  };
}

function PreviewRow({ row }: { row: GenericImportPreviewRow }) {
  const hasError = row.issues.some((issue) => issue.level === "error");

  return (
    <tr className="align-top hover:bg-muted/60">
      <td className="border-b border-border px-3 py-2.5">
        <p className="font-medium tabular-nums text-foreground">
          {row.sourceRowNumber}
        </p>
        <Badge tone={hasError ? "warning" : "success"}>
          {hasError ? "Review" : "Ready"}
        </Badge>
      </td>
      <td className="border-b border-border px-3 py-2.5">
        <span className="font-medium">{row.primaryLabel || "Not mapped"}</span>
        {row.secondaryLabel ? (
          <span className="ml-2 text-muted-foreground">{row.secondaryLabel}</span>
        ) : null}
        {row.amountLabel && row.amountLabel !== "-" ? (
          <span className="ml-2 tabular-nums text-muted-foreground">{row.amountLabel}</span>
        ) : null}
      </td>
      <td className="border-b border-border px-3 py-2.5 font-medium">
        {row.targetLabel || "Not mapped"}
      </td>
      <td className="border-b border-border px-3 py-2.5">
        {row.actionLabel === "Needs review" ? "Blocked" : row.actionLabel}
      </td>
      <td className="max-w-[360px] border-b border-border px-3 py-2.5">
        {row.issues.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <ul className="space-y-1">
            {row.issues.map((issue) => (
              <li
                className={
                  issue.level === "error" ? "text-danger" : "text-muted-foreground"
                }
                key={`${issue.level}-${issue.message}`}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function AttentionDetails({
  errorCount,
  errorRowsHref,
  fixTemplateHref,
  items,
  warningCount,
}: {
  errorCount: number;
  errorRowsHref: string;
  fixTemplateHref: string;
  items: UnitImportCleanupItem[];
  warningCount: number;
}) {
  const groups = groupCleanupItems(items);

  return (
    <details className="rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="text-warning" size={15} />
          {errorCount} blocked
          {warningCount > 0
            ? ` · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
            : ""}
        </span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground" size={15} />
      </summary>
      <div className="border-t border-border p-4">
        {errorRowsHref && fixTemplateHref ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium hover:bg-muted"
              download="nestory-import-error-rows.csv"
              href={errorRowsHref}
            >
              <Download aria-hidden="true" size={14} />
              Error rows
            </a>
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium hover:bg-muted"
              download="nestory-import-fix-template.csv"
              href={fixTemplateHref}
            >
              <Download aria-hidden="true" size={14} />
              Fix template
            </a>
          </div>
        ) : null}
        <div className="max-h-64 space-y-2 overflow-auto">
          {groups.slice(0, 8).map((group) => (
            <div
              className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
              key={`${group.sourceRowNumber}-${group.unitNumber}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  Row {group.sourceRowNumber} · {group.unitNumber}
                </span>
                <Badge tone={group.hasError ? "danger" : "warning"}>
                  {group.hasError ? "Blocked" : "Warning"}
                </Badge>
              </div>
              <ul className="mt-1 space-y-1 text-xs">
                {group.items.map((item, index) => (
                  <li
                    className={
                      item.level === "error" ? "text-danger" : "text-muted-foreground"
                    }
                    key={`${item.level}-${item.message}-${index}`}
                  >
                    {item.message}
                  </li>
                ))}
              </ul>
              {group.actions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.actions.map((action) => (
                    <Link
                      className="text-xs font-medium underline underline-offset-4"
                      href={action.href}
                      key={`${action.href}-${action.label}`}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function PastImports({
  action,
  pending,
  runs,
  state,
}: {
  action: (payload: FormData) => void;
  pending: boolean;
  runs: ImportRunSummary[];
  state: CommitImportRunState;
}) {
  return (
    <details className="rounded-md border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span>Past imports</span>
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          {runs.length}
          <ChevronDown aria-hidden="true" size={15} />
        </span>
      </summary>
      <div
        aria-label="Past imports"
        className="max-h-72 space-y-2 overflow-auto border-t border-border p-3"
        role="region"
        tabIndex={0}
      >
        {runs.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          runs.map((run) => (
            <div
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
              key={run.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{run.fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatImportRunDate(run.createdAt)} · {run.importType}
                  </p>
                </div>
                <Badge tone={importRunStatusTone(run.status)}>
                  {formatImportRunStatus(run.status)}
                </Badge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {run.createdCount + run.updatedCount} saved · {run.blockedRows}{" "}
                  blocked
                </p>
                {run.status === "staged" && run.readyRows === 0 ? (
                  <span className="max-w-56 text-right text-xs text-muted-foreground">
                    Fix references, then re-upload to create a fresh run.
                  </span>
                ) : run.status === "staged" || run.status === "committing" ? (
                  <form action={action}>
                    <input name="runId" type="hidden" value={run.id} />
                    <Button
                      aria-label={`${
                        run.status === "staged" ? "Resume" : "Reconcile"
                      } ${run.fileName}`}
                      disabled={pending}
                      type="submit"
                      variant="ghost"
                    >
                      <RotateCcw aria-hidden="true" size={13} />
                      {run.status === "staged" ? "Resume" : "Reconcile"}
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        )}
        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "px-1 text-xs text-danger"
                : "px-1 text-xs text-success"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function getImportAvailability(
  type: ImportType,
  referenceData: ImportReferenceData,
) {
  if (type === "properties") {
    return {
      message: "Start here when the workspace is blank.",
      ready: true,
    };
  }

  if (type === "units") {
    return referenceData.properties.length > 0
      ? {
          message: "Property codes are available for matching.",
          ready: true,
        }
      : {
          message: "Import or add at least one property before units.",
          ready: false,
        };
  }

  if (type === "people") {
    return {
      message: "Import people before linking leases.",
      ready: true,
    };
  }

  const ready =
    referenceData.properties.length > 0 &&
    referenceData.units.length > 0 &&
    referenceData.people.some((person) => person.roles.includes("tenant"));

  return ready
    ? {
        message: "Properties, units, and tenants are available for matching.",
        ready: true,
      }
    : {
        message: "Leases need matching properties, units, and tenants first.",
        ready: false,
      };
}

function mapHeadersForType(
  type: ImportType,
  headers: string[],
  savedMapping?: ImportSavedMapping,
) {
  const autoMapping = autoMapImportHeaders(type, headers);

  if (!savedMapping) {
    return autoMapping;
  }

  const headerSet = new Set(headers);
  const savedForCurrentFile = Object.fromEntries(
    Object.entries(savedMapping.mapping).flatMap(([key, value]) =>
      value && headerSet.has(value) ? [[key, value]] : [],
    ),
  );

  return {
    ...savedForCurrentFile,
    ...autoMapping,
  };
}

function importRunStatusTone(status: ImportRunSummary["status"]) {
  if (status === "committed") {
    return "success";
  }

  if (status === "committed_with_errors" || status === "staged") {
    return "warning";
  }

  return status === "committing" ? "neutral" : "danger";
}

function formatImportRunStatus(status: ImportRunSummary["status"]) {
  return status === "committed_with_errors"
    ? "partial"
    : status.replaceAll("_", " ");
}

function formatImportRunDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function groupCleanupItems(items: UnitImportCleanupItem[]) {
  const groups = new Map<
    string,
    {
      actions: Array<{ href: string; label: string }>;
      hasError: boolean;
      items: UnitImportCleanupItem[];
      sourceRowNumber: number;
      unitNumber: string;
    }
  >();

  for (const item of items) {
    const key = `${item.sourceRowNumber}-${item.unitNumber}`;
    const group =
      groups.get(key) ??
      {
        actions: [],
        hasError: false,
        items: [],
        sourceRowNumber: item.sourceRowNumber,
        unitNumber: item.unitNumber,
      };

    group.items.push(item);
    group.hasError ||= item.level === "error";

    if (item.actionHref && item.actionLabel) {
      const exists = group.actions.some(
        (action) =>
          action.href === item.actionHref && action.label === item.actionLabel,
      );

      if (!exists) {
        group.actions.push({
          href: item.actionHref,
          label: item.actionLabel,
        });
      }
    }

    groups.set(key, group);
  }

  return Array.from(groups.values()).sort(
    (left, right) => left.sourceRowNumber - right.sourceRowNumber,
  );
}

function buildErrorRowsCsvHref(
  rows: GenericImportPreviewRow[],
  sourceHeaders: string[],
) {
  const header = ["Row", "Issues", ...sourceHeaders];
  const csvRows = rows.map((row) => [
    String(row.sourceRowNumber),
    row.issues
      .filter((issue) => issue.level === "error")
      .map((issue) => issue.message)
      .join("; "),
    ...sourceHeaders.map((field) => row.raw[field] ?? ""),
  ]);

  return buildCsvHref([header, ...csvRows]);
}

function buildFixTemplateCsvHref({
  mapping,
  referenceData,
  rows,
  type,
}: {
  mapping: ImportMapping;
  referenceData: ImportReferenceData;
  rows: GenericImportPreviewRow[];
  type: ImportType;
}) {
  const templateHeaders = parseCsv(
    buildImportTemplateCsv(type, referenceData),
  ).headers;
  const templateMapping = autoMapImportHeaders(type, templateHeaders);
  const templateRows = rows.map((row) =>
    templateHeaders.map((templateHeader) => {
      const fieldKey = Object.entries(templateMapping).find(
        ([, mappedHeader]) => mappedHeader === templateHeader,
      )?.[0];
      const sourceHeader = fieldKey ? mapping[fieldKey] : undefined;

      return sourceHeader ? (row.raw[sourceHeader] ?? "") : "";
    }),
  );

  return buildCsvHref([templateHeaders, ...templateRows]);
}

function buildCsvHref(rows: string[][]) {
  const csv = rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function escapeCsvCell(value: string) {
  const formulaSafeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

  return `"${formulaSafeValue.replaceAll('"', '""')}"`;
}

function getTemplateDownloadLabel(
  type: ImportType,
  referenceData: ImportReferenceData,
) {
  if (type === "properties") {
    return "Download properties template";
  }

  if (type === "units") {
    return referenceData.properties.length > 0
      ? "Download units template with properties"
      : "Download units template";
  }

  if (type === "people") {
    return "Download people template";
  }

  return referenceData.units.length > 0
    ? "Download leases template with units"
    : "Download leases template";
}
