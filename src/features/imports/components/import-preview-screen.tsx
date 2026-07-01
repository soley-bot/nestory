"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileText,
  ListChecks,
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
  commitUnitImportAction,
  type UnitImportActionState,
} from "@/features/imports/actions";
import type {
  ImportPropertyOption,
  ParsedCsvRecord,
  UnitImportCleanupItem,
  UnitImportField,
  UnitImportMapping,
  UnitImportPreviewRow,
} from "@/features/imports/import.types";
import {
  autoMapUnitImportHeaders,
  buildUnitImportPreviewRows,
  buildUnitImportTemplateCsv,
  getUnitImportCleanupItems,
  getUnitImportStats,
  parseCsv,
  toCommitRows,
  unitImportFields,
} from "@/features/imports/unit-import";
import { formatMoney } from "@/lib/money/format";

type ParsedFile = {
  fileName: string;
  headers: string[];
  records: ParsedCsvRecord[];
};

const initialState: UnitImportActionState = {};

export function ImportPreviewScreen({
  propertyOptions,
}: {
  propertyOptions: ImportPropertyOption[];
}) {
  const [actionState, formAction, pending] = useActionState(
    commitUnitImportAction,
    initialState,
  );
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<UnitImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      parsedFile
        ? buildUnitImportPreviewRows({
            mapping,
            properties: propertyOptions,
            records: parsedFile.records,
          })
        : [],
    [mapping, parsedFile, propertyOptions],
  );
  const stats = getUnitImportStats(rows);
  const cleanupItems = getUnitImportCleanupItems(rows);
  const commitRows = toCommitRows(rows);
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    buildUnitImportTemplateCsv(),
  )}`;
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
        headers: parsed.headers,
        records: parsed.records,
      });
      setMapping(autoMapUnitImportHeaders(parsed.headers));
      setFileError(null);
    } catch {
      setFileError("The file could not be read.");
      setParsedFile(null);
      setMapping({});
    }
  }

  function updateMapping(field: UnitImportField, value: string) {
    setMapping((current) => ({
      ...current,
      [field]: value || undefined,
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        actions={
          <a
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-surface-muted"
            download="nestory-units-import-template.csv"
            href={templateHref}
          >
            <Download size={15} />
            Download template
          </a>
        }
        description="Bring spreadsheet unit and rent roll data into Nestory with mapping, validation, and safe row commits."
        title="Import data"
      />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:max-h-[calc(100vh-132px)] lg:overflow-auto lg:px-6 lg:py-4">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
          <div className="space-y-3">
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
                    description="CSV only. Use the template when possible."
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
                      {parsedFile.records.length === 1 ? "" : "s"} detected
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

            <CleanupQueue items={cleanupItems} />

            {actionState.message ? (
              <p
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                role={actionState.status === "error" ? "alert" : "status"}
              >
                {actionState.message}
                {actionState.summary ? (
                  <span className="ml-1 text-muted">
                    Created {actionState.summary.created}, updated{" "}
                    {actionState.summary.updated}.
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="rounded-md border border-border bg-surface">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-semibold">Column mapping</h2>
                <p className="mt-1 text-sm text-muted">
                  {parsedFile
                    ? `${parsedFile.headers.length} columns available`
                    : "Upload a file to map columns"}
                </p>
              </div>
              <Button
                disabled={!parsedFile}
                onClick={() =>
                  parsedFile
                    ? setMapping(autoMapUnitImportHeaders(parsedFile.headers))
                    : undefined
                }
                type="button"
              >
                <RotateCcw size={15} />
                Auto-map
              </Button>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {unitImportFields.map((field) => (
                <label
                  className="block min-w-0 text-sm font-medium"
                  key={field.key}
                >
                  {field.label}
                  {field.required ? (
                    <span className="ml-1 text-danger">*</span>
                  ) : null}
                  <div className="mt-2">
                    <SelectControl
                      ariaLabel={`Map ${field.label}`}
                      disabled={!parsedFile}
                      onValueChange={(value) => updateMapping(field.key, value)}
                      options={headerOptions}
                      value={mapping[field.key] ?? ""}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-semibold">Validation preview</h2>
              <p className="mt-1 text-sm text-muted">
                Valid rows commit to Units as create or update.
              </p>
            </div>
            <form action={formAction}>
              <input
                name="rows"
                type="hidden"
                value={JSON.stringify(commitRows)}
              />
              <Button
                disabled={pending || commitRows.length === 0}
                type="submit"
                variant="primary"
              >
                <Upload size={15} />
                {pending
                  ? "Committing..."
                  : `Commit ${commitRows.length} valid`}
              </Button>
            </form>
          </div>

          <div className="max-h-[min(360px,calc(100vh-500px))] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-[13px]">
              <thead className="bg-surface-muted text-[11px] uppercase tracking-[0] text-muted">
                <tr>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Row
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Action
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Property
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Unit / Floor
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Type
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Inclusion
                  </th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">
                    Price
                  </th>
                  <th className="border-b border-border px-3 py-2 font-semibold">
                    Status
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
                      colSpan={9}
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
      </main>
    </div>
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

function CleanupQueue({ items }: { items: UnitImportCleanupItem[] }) {
  const visibleItems = items.slice(0, 8);

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="shrink-0 text-muted" size={16} />
          <h2 className="truncate text-base font-semibold">Cleanup queue</h2>
        </div>
        <Badge tone={items.length > 0 ? "warning" : "success"}>
          {items.length}
        </Badge>
      </div>
      <div className="max-h-64 overflow-auto p-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
            No cleanup items.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((item, index) => (
              <div
                className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
                key={`${item.sourceRowNumber}-${item.level}-${item.message}-${index}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Row {item.sourceRowNumber} / {item.unitNumber}
                  </span>
                  <Badge tone={item.level === "error" ? "danger" : "warning"}>
                    {item.level}
                  </Badge>
                </div>
                <p className="text-muted">{item.propertyLabel}</p>
                <p className="mt-1">{item.message}</p>
                {item.actionHref && item.actionLabel ? (
                  <Link
                    className="mt-2 inline-flex h-7 items-center rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                    href={item.actionHref}
                  >
                    {item.actionLabel}
                  </Link>
                ) : null}
              </div>
            ))}
            {items.length > visibleItems.length ? (
              <p className="px-1 text-xs text-muted">
                {items.length - visibleItems.length} more item
                {items.length - visibleItems.length === 1 ? "" : "s"} in the
                preview table.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewRow({ row }: { row: UnitImportPreviewRow }) {
  const hasError = row.issues.some((issue) => issue.level === "error");
  const price =
    row.currentRentAmount !== null
      ? formatMoney(row.currentRentAmount, "USD")
      : "Not set";

  return (
    <tr className="align-top hover:bg-surface-muted/60">
      <td className="border-b border-border px-3 py-2.5 text-muted">
        {row.sourceRowNumber}
      </td>
      <td className="border-b border-border px-3 py-2.5">
        <Badge tone={hasError ? "warning" : "success"}>{row.actionLabel}</Badge>
      </td>
      <td className="border-b border-border px-3 py-2.5 font-medium">
        {row.propertyLabel || "Not mapped"}
      </td>
      <td className="border-b border-border px-3 py-2.5">
        <span className="font-medium">{row.unitNumber || "Not mapped"}</span>
        {row.floor ? (
          <span className="ml-2 text-muted">Floor {row.floor}</span>
        ) : null}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-muted">
        {row.typeLabel}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-muted">
        {row.inclusionLabel}
      </td>
      <td className="border-b border-border px-3 py-2.5 text-right font-medium tabular-nums">
        {price}
      </td>
      <td className="border-b border-border px-3 py-2.5 capitalize">
        {row.status}
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
