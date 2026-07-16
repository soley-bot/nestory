"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  Download,
  FileText,
  ListChecks,
  RotateCcw,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import {
  CSV_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { SelectControl } from "@/components/ui/select-control";
import {
  commitStagedImportRunAction,
  stageImportRunAction,
  type CommitImportRunState,
  type StageImportRunState,
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

const initialStageState: StageImportRunState = {};
const initialCommitState: CommitImportRunState = {};

export function ImportPreviewScreen({
  recentRuns,
  referenceData,
  savedMappings,
}: {
  recentRuns: ImportRunSummary[];
  referenceData: ImportReferenceData;
  savedMappings: ImportSavedMapping[];
}) {
  const [stageState, stageAction, staging] = useActionState(
    stageImportRunAction,
    initialStageState,
  );
  const [commitState, commitAction, committing] = useActionState(
    commitStagedImportRunAction,
    initialCommitState,
  );
  const [selectedType, setSelectedType] = useState<ImportType>(
    referenceData.properties.length > 0 ? "units" : "properties",
  );
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const config = getImportTypeConfig(selectedType);
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
  const importConsequences = useMemo(
    () => summarizeImportConsequences(rows),
    [rows],
  );
  const cleanupItems = getGenericImportCleanupItems(selectedType, rows);
  const blockedRows = rows.filter((row) =>
    row.issues.some((issue) => issue.level === "error"),
  );
  const missingRequiredMatches = config.fields.filter(
    (field) => field.required && !mapping[field.key],
  ).length;
  const draftKey = useMemo(
    () =>
      parsedFile
        ? JSON.stringify({
            fileName: parsedFile.fileName,
            headers: parsedFile.headers,
            importType: selectedType,
            mapping,
            rowCount: parsedFile.records.length,
          })
        : null,
    [mapping, parsedFile, selectedType],
  );
  const stagePayload = useMemo(
    () =>
      parsedFile
        ? JSON.stringify({
            fileName: parsedFile.fileName,
            fileSize: parsedFile.fileSize,
            draftKey,
            headers: parsedFile.headers,
            importType: selectedType,
            mapping,
            mimeType: parsedFile.mimeType,
            records: parsedFile.records,
          })
        : "",
    [draftKey, mapping, parsedFile, selectedType],
  );
  const stagedRunId = stageState.status === "success" ? stageState.runId : null;
  const isStagedCurrent = Boolean(
    stagedRunId && draftKey && stageState.draftKey === draftKey,
  );
  const readyRecordLabel = importRecordLabel(
    selectedType,
    stageState.summary?.ready ?? stats.readyCount,
  );
  const templateLabel = getTemplateDownloadLabel(selectedType, referenceData);
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildImportTemplateCsv(selectedType, referenceData),
  )}`;
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
  const headerOptions = [
    { label: "Not mapped", value: "" },
    ...(parsedFile?.headers ?? []).map((header) => ({
      label: header,
      value: header,
    })),
  ];

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

  function updateMapping(field: string, value: string) {
    setMapping((current) => ({
      ...current,
      [field]: value || undefined,
    }));
  }

  function chooseType(type: ImportType) {
    setSelectedType(type);
    setParsedFile(null);
    setMapping({});
    setFileError(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        actions={
          <a
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
            download={`nestory-${selectedType}-import-template.csv`}
            href={templateHref}
          >
            <Download size={15} />
            {templateLabel}
          </a>
        }
        description="Bring portfolio spreadsheets into Nestory with templates, column matching, row checks, and a preview before committing."
        title="Import center"
      />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:max-h-[calc(100vh-132px)] lg:overflow-auto lg:px-6 lg:py-4">
        <ImportTypeChooser
          referenceData={referenceData}
          selectedType={selectedType}
          onSelect={chooseType}
        />

        <ImportStartGuide
          referenceData={referenceData}
          selectedType={selectedType}
        />

        <ImportStepBar
          hasFile={Boolean(parsedFile)}
          hasRows={rows.length > 0}
          missingRequiredMatches={missingRequiredMatches}
        />

        <section className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.86fr)_minmax(380px,1.14fr)]">
          <div className="min-w-0 space-y-3">
            <div className="rounded-md border border-border bg-surface">
              <div className="border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <FileText className="text-muted" size={16} />
                  <h2 className="text-base font-semibold">Upload</h2>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    CSV file
                  </span>
                  <FileDropzoneField
                    accept={CSV_FILE_ACCEPT}
                    description={`CSV only. Use the ${config.label.toLowerCase()} template when possible.`}
                    onFile={handleFileSelect}
                  />
                </label>

                {fileError ? (
                  <p
                    className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    role="alert"
                  >
                    {fileError}
                  </p>
                ) : null}

                {parsedFile ? (
                  <div className="rounded-md border border-border bg-surface-muted px-3 py-3 text-sm">
                    <p className="font-medium text-foreground">
                      {parsedFile.fileName}
                    </p>
                    <p className="mt-1 text-muted">
                      {parsedFile.records.length} row
                      {parsedFile.records.length === 1 ? "" : "s"} detected.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              <ImportStat
                icon={<Database size={15} />}
                label="Rows"
                value={String(stats.totalCount)}
              />
              <ImportStat
                icon={<CheckCircle2 size={15} />}
                label="Ready"
                value={String(stats.readyCount)}
              />
              <ImportStat
                icon={<AlertTriangle size={15} />}
                label="Errors"
                value={String(stats.errorCount)}
              />
              <ImportStat
                icon={<ListChecks size={15} />}
                label="Warnings"
                value={String(stats.warningCount)}
              />
            </div>

            {stageState.message ? (
              <p
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                role={stageState.status === "error" ? "alert" : "status"}
              >
                {stageState.message}
                {stageState.summary ? (
                  <span className="ml-1 text-muted">
                    Ready {stageState.summary.ready}, blocked{" "}
                    {stageState.summary.blocked}.
                  </span>
                ) : null}
              </p>
            ) : null}

            {commitState.message ? (
              <p
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                role={commitState.status === "error" ? "alert" : "status"}
              >
                {commitState.message}
                {commitState.summary ? (
                  <span className="ml-1 text-muted">
                    Created {commitState.summary.created}, updated{" "}
                    {commitState.summary.updated}, skipped{" "}
                    {commitState.summary.skipped}, failed{" "}
                    {commitState.summary.failed}.
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 rounded-md border border-border bg-surface">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-semibold">Match columns</h2>
                <p className="mt-1 text-sm text-muted">
                  {parsedFile
                    ? `${parsedFile.headers.length} spreadsheet columns found. Required fields are marked *.`
                    : `Upload ${config.label.toLowerCase()} CSV to match its columns to Nestory fields.`}
                </p>
              </div>
              <Button
                disabled={!parsedFile}
                onClick={() =>
                  parsedFile
                    ? setMapping(
                        mapHeadersForType(
                          selectedType,
                          parsedFile.headers,
                          savedMapping,
                        ),
                      )
                    : undefined
                }
                type="button"
              >
                <RotateCcw size={15} />
                Auto-map
              </Button>
            </div>

            {parsedFile ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {config.fields.map((field) => (
                  <label
                    className="block min-w-0 text-sm font-medium"
                    key={field.key}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate">
                        {field.label}
                        {field.required ? (
                          <span className="ml-1 text-danger">*</span>
                        ) : null}
                      </span>
                      <MappingStatusBadge
                        mapped={Boolean(mapping[field.key])}
                        required={Boolean(field.required)}
                      />
                    </span>
                    <div className="mt-2">
                      <SelectControl
                        ariaLabel={`Map ${field.label}`}
                        onValueChange={(value) =>
                          updateMapping(field.key, value)
                        }
                        options={headerOptions}
                        value={mapping[field.key] ?? ""}
                      />
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <div className="rounded-md border border-border bg-surface-muted px-4 py-5 text-sm">
                  <p className="font-medium text-foreground">
                    Upload a CSV first.
                  </p>
                  <p className="mt-1 max-w-xl text-muted">
                    Nestory will match obvious columns automatically. You only
                    need to review fields marked as missing before saving the
                    preview.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-md border border-border bg-surface">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-semibold">Preview rows</h2>
              <p className="mt-1 text-sm text-muted">
                {isStagedCurrent
                  ? `This preview is saved. Import writes ${readyRecordLabel} to ${config.label.toLowerCase()}.`
                  : `Review the rows first. Save a preview, then import the ready rows.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isStagedCurrent ? (
                <div className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-success/30 bg-success-soft px-2.5 text-[13px] font-medium text-success">
                  <CheckCircle2 size={15} />
                  Preview saved
                </div>
              ) : (
                <form action={stageAction}>
                  <input name="payload" type="hidden" value={stagePayload} />
                  <Button
                    disabled={!parsedFile || staging || rows.length === 0}
                    type="submit"
                    variant={stagedRunId ? "secondary" : "primary"}
                  >
                    <Database size={15} />
                    {staging
                      ? "Saving..."
                      : stagedRunId
                        ? "Update saved preview"
                        : `Save preview (${rows.length})`}
                  </Button>
                </form>
              )}
              <form action={commitAction}>
                <input name="runId" type="hidden" value={stagedRunId ?? ""} />
                <Button
                  disabled={
                    committing ||
                    !isStagedCurrent ||
                    !stageState.summary ||
                    stageState.summary.ready === 0
                  }
                  type="submit"
                  variant="primary"
                >
                  <Upload size={15} />
                  {committing
                    ? "Importing..."
                    : `Import ${readyRecordLabel}`}
                </Button>
              </form>
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="border-b border-border p-4">
              <ConsequencePanel
                rows={[
                  { label: "Create", value: importConsequences.create },
                  { label: "Update", value: importConsequences.update },
                  {
                    label: "Create or update",
                    value: importConsequences.createOrUpdate,
                  },
                  { label: "Skip", value: importConsequences.skip },
                ]}
                summary="Only ready rows are written. Blocked rows stay in this import run for correction."
                title="Import consequence"
              />
            </div>
          ) : null}

          {!isStagedCurrent && stagedRunId && parsedFile ? (
            <p className="border-b border-border px-4 py-2 text-sm text-warning sm:px-5">
              Column matches or file data changed after saving. Save the
              preview again before importing.
            </p>
          ) : null}

          {parsedFile ? (
            <CleanupQueue
              errorRowsHref={errorRowsHref}
              fixTemplateHref={fixTemplateHref}
              items={cleanupItems}
            />
          ) : null}

          <div
            aria-label="Import preview rows"
            className="max-h-[min(360px,calc(100vh-500px))] max-w-full overflow-auto"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead className="bg-surface-muted text-[11px] uppercase tracking-[0] text-muted">
                <tr>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Row
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Record
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Will write to
                  </th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">
                    Amount
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
                {rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-muted"
                      colSpan={6}
                    >
                      No rows loaded.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <PreviewRow key={row.sourceRowNumber} row={row} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <ImportRunHistory runs={recentRuns} />
      </main>
    </div>
  );
}

export function summarizeImportConsequences(
  rows: GenericImportPreviewRow[],
): {
  create: number;
  createOrUpdate: number;
  skip: number;
  update: number;
} {
  return rows.reduce(
    (summary, row) => {
      const blocked =
        row.actionLabel === "Needs review" ||
        row.issues.some((issue) => issue.level === "error");

      if (blocked) {
        summary.skip += 1;
      } else if (row.actionLabel === "Create") {
        summary.create += 1;
      } else if (row.actionLabel === "Update") {
        summary.update += 1;
      } else {
        summary.createOrUpdate += 1;
      }

      return summary;
    },
    { create: 0, createOrUpdate: 0, skip: 0, update: 0 },
  );
}

function ImportTypeChooser({
  onSelect,
  referenceData,
  selectedType,
}: {
  onSelect: (type: ImportType) => void;
  referenceData: ImportReferenceData;
  selectedType: ImportType;
}) {
  return (
    <section className="grid gap-2 lg:grid-cols-4">
      {importTypeOrder.map((type) => {
        const config = getImportTypeConfig(type);
        const availability = getImportAvailability(type, referenceData);
        const selected = selectedType === type;

        return (
          <button
            className={
              selected
                ? "rounded-md border border-accent bg-accent-soft/20 px-3 py-3 text-left shadow-sm"
                : "rounded-md border border-border bg-surface px-3 py-3 text-left transition-colors hover:bg-surface-muted"
            }
            key={type}
            onClick={() => onSelect(type)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-muted">{importIcon(type)}</span>
                <span className="truncate text-sm font-semibold text-foreground">
                  {config.label}
                </span>
              </div>
              <Badge tone={availability.ready ? "success" : "warning"}>
                {availability.ready ? "Ready" : "Needs setup"}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
              {availability.message}
            </p>
          </button>
        );
      })}
    </section>
  );
}

function ImportStepBar({
  hasFile,
  hasRows,
  missingRequiredMatches,
}: {
  hasFile: boolean;
  hasRows: boolean;
  missingRequiredMatches: number;
}) {
  const steps = [
    { label: "Choose type", state: "complete" },
    { label: "Upload file", state: hasFile ? "complete" : "current" },
    {
      label: "Match columns",
      state: !hasFile
        ? "waiting"
        : missingRequiredMatches === 0
          ? "complete"
          : "current",
    },
    {
      label: "Preview and import",
      state: hasRows && missingRequiredMatches === 0 ? "current" : "waiting",
    },
  ] as const;

  return (
    <section className="grid gap-2 rounded-md border border-border bg-surface px-3 py-3 sm:grid-cols-4">
      {steps.map((step, index) => (
        <div className="flex min-w-0 items-center gap-2" key={step.label}>
          <span
            className={
              step.state === "complete"
                ? "flex size-6 shrink-0 items-center justify-center rounded border border-success/30 bg-success-soft text-xs font-semibold text-success"
                : step.state === "current"
                  ? "flex size-6 shrink-0 items-center justify-center rounded border border-accent/30 bg-accent-soft text-xs font-semibold text-accent-strong"
                  : "flex size-6 shrink-0 items-center justify-center rounded border border-border bg-surface-muted text-xs font-semibold text-muted"
            }
          >
            {index + 1}
          </span>
          <span
            className={
              step.state === "waiting"
                ? "truncate text-sm font-medium text-muted"
                : "truncate text-sm font-medium text-foreground"
            }
          >
            {step.label}
          </span>
        </div>
      ))}
    </section>
  );
}

function ImportStartGuide({
  referenceData,
  selectedType,
}: {
  referenceData: ImportReferenceData;
  selectedType: ImportType;
}) {
  const config = getImportTypeConfig(selectedType);
  const availability = getImportAvailability(selectedType, referenceData);
  const templateLabel = getTemplateDownloadLabel(selectedType, referenceData);

  return (
    <section
      className={
        availability.ready
          ? "rounded-md border border-border bg-surface px-4 py-3"
          : "rounded-md border border-warning/30 bg-warning-soft/25 px-4 py-3"
      }
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={availability.ready ? "success" : "warning"}>
              {availability.ready ? "Import ready" : "Setup needed"}
            </Badge>
            <h2 className="text-sm font-semibold text-foreground">
              {config.label} import path
            </h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-foreground-muted">
            {config.description}
          </p>
          {config.nextDependency ? (
            <p className="mt-1 text-xs leading-5 text-muted">
              {config.nextDependency}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
            href="/properties?action=create"
          >
            <Building2 size={15} />
            Add property
          </Link>
          <a
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
            download={`nestory-${selectedType}-import-template.csv`}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              buildImportTemplateCsv(selectedType, referenceData),
            )}`}
          >
            <Download size={15} />
            {templateLabel}
          </a>
        </div>
      </div>

      {!availability.ready ? (
        <p className="mt-3 rounded-md border border-warning/30 bg-surface px-3 py-2 text-sm font-medium text-foreground">
          {availability.message}
        </p>
      ) : null}
    </section>
  );
}

function ImportStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MappingStatusBadge({
  mapped,
  required,
}: {
  mapped: boolean;
  required: boolean;
}) {
  if (mapped) {
    return <Badge tone="success">Matched</Badge>;
  }

  if (required) {
    return <Badge tone="danger">Missing</Badge>;
  }

  return <Badge tone="neutral">Optional</Badge>;
}

function CleanupQueue({
  errorRowsHref,
  fixTemplateHref,
  items,
}: {
  errorRowsHref: string;
  fixTemplateHref: string;
  items: UnitImportCleanupItem[];
}) {
  const groupedItems = groupCleanupItems(items);
  const visibleGroups = groupedItems.slice(0, 8);

  return (
    <div className="border-b border-border bg-surface">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="shrink-0 text-muted" size={16} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              Rows to fix before commit
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              Fix these rows or required matches before Nestory writes anything.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {errorRowsHref && fixTemplateHref ? (
            <>
              <a
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                download="nestory-import-error-rows.csv"
                href={errorRowsHref}
              >
                <Download size={15} />
                Error rows
              </a>
              <a
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
                download="nestory-import-fix-template.csv"
                href={fixTemplateHref}
              >
                <Download size={15} />
                Fix template
              </a>
            </>
          ) : null}
          <Badge tone={items.length > 0 ? "warning" : "success"}>
            {groupedItems.length}
          </Badge>
        </div>
      </div>
      <div
        aria-label="Import cleanup queue"
        className="max-h-64 overflow-auto px-4 pb-3 sm:px-5"
        role="region"
        tabIndex={0}
      >
        {items.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
            All preview rows can be committed.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map((group) => (
              <div
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                key={`${group.sourceRowNumber}-${group.unitNumber}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Row {group.sourceRowNumber} / {group.unitNumber}
                  </span>
                  <Badge tone={group.hasError ? "danger" : "warning"}>
                    {group.hasError ? "Blocked" : "Warning"}
                  </Badge>
                </div>
                <p className="text-muted">{group.propertyLabel}</p>
                <ul className="mt-2 space-y-1">
                  {group.items.map((item, index) => (
                    <li
                      className={
                        item.level === "error" ? "text-danger" : "text-muted"
                      }
                      key={`${item.level}-${item.message}-${index}`}
                    >
                      {item.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.actions.map((action) => (
                    <Link
                      className="inline-flex h-7 items-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                      href={action.href}
                      key={`${action.href}-${action.label}`}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {groupedItems.length > visibleGroups.length ? (
              <p className="px-1 text-xs text-muted">
                {groupedItems.length - visibleGroups.length} more row
                {groupedItems.length - visibleGroups.length === 1 ? "" : "s"}{" "}
                in the preview table.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportRunHistory({ runs }: { runs: ImportRunSummary[] }) {
  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="shrink-0 text-muted" size={16} />
          <h2 className="truncate text-base font-semibold">Import runs</h2>
        </div>
        <Badge tone={runs.length > 0 ? "neutral" : "warning"}>
          {runs.length}
        </Badge>
      </div>
      <div
        aria-label="Import run history"
        className="max-h-72 overflow-auto p-3"
        role="region"
        tabIndex={0}
      >
        {runs.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
            No import runs yet.
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                key={run.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {run.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatImportRunDate(run.createdAt)} / {run.importType}
                    </p>
                  </div>
                  <Badge tone={importRunStatusTone(run.status)}>
                    {formatImportRunStatus(run.status)}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <RunStat label="Rows" value={run.totalRows} />
                  <RunStat label="Ready" value={run.readyRows} />
                  <RunStat label="Blocked" value={run.blockedRows} />
                  <RunStat
                    label="Saved"
                    value={run.createdCount + run.updatedCount}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-surface px-2 py-1">
      <p className="text-muted">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function PreviewRow({ row }: { row: GenericImportPreviewRow }) {
  const hasError = row.issues.some((issue) => issue.level === "error");

  return (
    <tr className="align-top hover:bg-surface-muted/60">
      <td className="border-b border-border px-3 py-2.5">
        <p className="font-medium text-foreground">{row.sourceRowNumber}</p>
        <Badge tone={hasError ? "warning" : "success"}>
          {hasError ? "Needs review" : "Ready"}
        </Badge>
      </td>
      <td className="border-b border-border px-3 py-2.5">
        <span className="font-medium">{row.primaryLabel || "Not mapped"}</span>
        {row.secondaryLabel ? (
          <span className="ml-2 text-muted">{row.secondaryLabel}</span>
        ) : null}
      </td>
      <td className="border-b border-border px-3 py-2.5 font-medium">
        {row.targetLabel || "Not mapped"}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-right font-medium tabular-nums">
        {row.amountLabel || "-"}
      </td>
      <td className="border-b border-border px-3 py-2.5 capitalize">
        {row.actionLabel === "Needs review" ? "Blocked" : row.actionLabel}
      </td>
      <td className="max-w-[320px] border-b border-border px-3 py-2.5">
        {row.issues.length === 0 ? (
          <span className="text-muted">Ready</span>
        ) : (
          <ul className="space-y-1">
            {row.issues.map((issue) => (
              <li
                className={
                  issue.level === "error" ? "text-danger" : "text-muted"
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
          message: "Property codes exist, so unit rent roll rows can match.",
          ready: true,
        }
      : {
          message: "Import or add at least one property before units.",
          ready: false,
        };
  }

  if (type === "people") {
    return {
      message: "Import tenants, owners, vendors, and staff before leases.",
      ready: true,
    };
  }

  if (
    referenceData.properties.length > 0 &&
    referenceData.units.length > 0 &&
    referenceData.people.some((person) => person.roles.includes("tenant"))
  ) {
    return {
      message: "Matching properties, units, and tenants are available.",
      ready: true,
    };
  }

  return {
    message: "Leases need matched properties, units, and tenant people first.",
    ready: false,
  };
}

function importIcon(type: ImportType) {
  if (type === "properties") {
    return <Building2 size={16} />;
  }

  if (type === "people") {
    return <Users size={16} />;
  }

  if (type === "leases") {
    return <FileText size={16} />;
  }

  return <Database size={16} />;
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

function importRecordLabel(type: ImportType, count: number) {
  const singular: Record<ImportType, string> = {
    leases: "lease",
    people: "person",
    properties: "property",
    units: "unit",
  };
  const plural: Record<ImportType, string> = {
    leases: "leases",
    people: "people",
    properties: "properties",
    units: "units",
  };

  return `${count} ${count === 1 ? singular[type] : plural[type]}`;
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
  if (status === "committed_with_errors") {
    return "partial";
  }

  return status.replaceAll("_", " ");
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
      propertyLabel: string;
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
        propertyLabel: item.propertyLabel,
        sourceRowNumber: item.sourceRowNumber,
        unitNumber: item.unitNumber,
      };

    group.items.push(item);
    group.hasError ||= item.level === "error";

    if (item.actionHref && item.actionLabel) {
      const alreadyAdded = group.actions.some(
        (action) =>
          action.href === item.actionHref && action.label === item.actionLabel,
      );

      if (!alreadyAdded) {
        group.actions.push({ href: item.actionHref, label: item.actionLabel });
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
