"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  archiveDocumentAction,
  createDocumentAction,
  type DocumentActionState,
  restoreDocumentAction,
  updateDocumentAction,
} from "@/features/documents/actions";
import type {
  DocumentPagination,
  DocumentPropertyOption,
  DocumentSummary,
  DocumentUnitOption,
  DocumentViewQuery,
} from "@/features/documents/document.types";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

const initialState: DocumentActionState = {};

type DrawerState =
  | {
      initialValues?: Partial<Pick<DocumentSummary["formValues"], "propertyId" | "unitId">>;
      mode: "create";
    }
  | { document: DocumentSummary; mode: "archive" | "edit" | "restore" };

type DocumentScreenProps = {
  documents: DocumentSummary[];
  initialDocumentId?: string;
  pagination: DocumentPagination;
  propertyOptions: DocumentPropertyOption[];
  unitOptions: DocumentUnitOption[];
  viewQuery: DocumentViewQuery;
};

export function DocumentScreen({
  documents,
  initialDocumentId,
  pagination,
  propertyOptions,
  unitOptions,
  viewQuery,
}: DocumentScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = useMemo(
    () => getDocumentCreateInitialValues(viewQuery, propertyOptions, unitOptions),
    [propertyOptions, unitOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState(
    initialDocumentId ?? documents[0]?.id ?? "",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ??
    documents[0] ??
    null;

  useEffect(() => {
    if (initialDocumentId) {
      queueMicrotask(() => setSelectedDocumentId(initialDocumentId));
    }
  }, [initialDocumentId]);

  useEffect(() => {
    if (searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ initialValues: createInitialValues, mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [createInitialValues, pathname, router, searchParams]);

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setStatusMessage(null);
              setDrawer({ initialValues: createInitialValues, mode: "create" });
            }}
            variant="primary"
          >
            <Plus size={15} />
            Upload document
          </Button>
        }
        description="Operational documents linked to properties, units, leases, ledger entries, and timeline history."
        title="Documents"
      />

      {statusMessage ? (
        <div className="px-4 pt-5 sm:px-6 lg:px-6">
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role="status"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}

      <DocumentFilters
        properties={propertyOptions}
        units={unitOptions}
        viewQuery={viewQuery}
      />

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <DocumentTable
              documents={documents}
              onArchive={(document) => setDrawer({ document, mode: "archive" })}
              onEdit={(document) => setDrawer({ document, mode: "edit" })}
              onRestore={(document) => setDrawer({ document, mode: "restore" })}
              onSelect={setSelectedDocumentId}
              selectedDocumentId={selectedDocument?.id ?? ""}
            />
            <PaginationControls pagination={pagination} />
          </div>
          <div className="hidden 2xl:block">
            <DocumentInspector
              document={selectedDocument}
              onArchive={(document) => setDrawer({ document, mode: "archive" })}
              onEdit={(document) => setDrawer({ document, mode: "edit" })}
              onRestore={(document) => setDrawer({ document, mode: "restore" })}
            />
          </div>
        </div>
      </div>

      {drawer ? (
        <SideDrawer
          description={getDrawerDescription(drawer)}
          onClose={() => setDrawer(null)}
          open
          title={getDrawerTitle(drawer)}
        >
          {drawer.mode === "archive" || drawer.mode === "restore" ? (
            <DocumentArchivePanel
              document={drawer.document}
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <DocumentForm
              document={drawer.mode === "edit" ? drawer.document : undefined}
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              units={unitOptions}
            />
          )}
        </SideDrawer>
      ) : null}
    </div>
  );
}

function DocumentFilters({
  properties,
  units,
  viewQuery,
}: {
  properties: DocumentPropertyOption[];
  units: DocumentUnitOption[];
  viewQuery: DocumentViewQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibleUnits =
    viewQuery.propertyId === "all"
      ? units
      : units.filter((unit) => unit.propertyId === viewQuery.propertyId);
  const replaceParam = (name: string, value: string, defaultValue = "") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    nextParams.delete("documentId");

    if (!value || value === defaultValue) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }

    if (name === "propertyId") {
      nextParams.delete("unitId");
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="border-b border-border px-4 py-3 sm:px-6 lg:px-6">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_160px_220px_220px]">
        <Input
          defaultValue={viewQuery.query}
          onBlur={(event) => replaceParam("query", event.currentTarget.value)}
          placeholder="Search file name or category"
          type="search"
        />
        <SelectControl
          ariaLabel="Archive state"
          onValueChange={(value) => replaceParam("archiveState", value, "active")}
          options={[
            { label: "Active", value: "active" },
            { label: "Archived", value: "archived" },
            { label: "All", value: "all" },
          ]}
          value={viewQuery.archiveState}
        />
        <SelectControl
          ariaLabel="Property"
          onValueChange={(value) => replaceParam("propertyId", value, "all")}
          options={[
            { label: "All properties", value: "all" },
            ...properties.map((property) => ({
              label: property.label,
              value: property.id,
            })),
          ]}
          value={viewQuery.propertyId}
        />
        <SelectControl
          ariaLabel="Unit"
          onValueChange={(value) => replaceParam("unitId", value, "all")}
          options={[
            { label: "All units", value: "all" },
            ...visibleUnits.map((unit) => ({
              label: unit.label,
              value: unit.id,
            })),
          ]}
          value={viewQuery.unitId}
        />
      </div>
    </div>
  );
}

function DocumentTable({
  documents,
  onArchive,
  onEdit,
  onRestore,
  onSelect,
  selectedDocumentId,
}: {
  documents: DocumentSummary[];
  onArchive: (document: DocumentSummary) => void;
  onEdit: (document: DocumentSummary) => void;
  onRestore: (document: DocumentSummary) => void;
  onSelect: (id: string) => void;
  selectedDocumentId: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[18%]" />
            <col className="w-[25%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">Document</th>
              <th className="px-1.5 py-2.5 font-semibold">Category</th>
              <th className="px-1.5 py-2.5 font-semibold">Linked records</th>
              <th className="px-1.5 py-2.5 font-semibold">Uploaded</th>
              <th className="px-1.5 py-2.5 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                  No documents found.
                </td>
              </tr>
            ) : null}
            {documents.map((document) => (
              <tr
                className={cn(
                  "cursor-pointer border-t border-border transition-colors hover:bg-surface-muted/70",
                  selectedDocumentId === document.id && "bg-surface-muted",
                  document.isArchived && "text-muted",
                )}
                key={document.id}
                onClick={() => onSelect(document.id)}
              >
                <td className="px-2.5 py-2">
                  <p className="truncate font-medium" title={document.fileName}>
                    {document.fileName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {document.mimeType}
                  </p>
                </td>
                <td className="px-1.5 py-2">{document.category}</td>
                <td className="px-1.5 py-2">
                  <p className="line-clamp-1 break-words">
                    {document.linkedRecords.length > 0
                      ? document.linkedRecords
                          .map((record) => `${record.type}: ${record.label}`)
                          .join(" / ")
                      : "No linked records"}
                  </p>
                </td>
                <td className="px-1.5 py-2">{formatDate(document.uploadedAt)}</td>
                <td className="px-1.5 py-2">
                  <div className="flex justify-center gap-1">
                    <button
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (document.isArchived) {
                          onRestore(document);
                        } else {
                          onEdit(document);
                        }
                      }}
                      type="button"
                    >
                      {document.isArchived ? (
                        <RotateCcw size={14} />
                      ) : (
                        <Pencil size={14} />
                      )}
                    </button>
                    {!document.isArchived ? (
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-muted hover:text-danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          onArchive(document);
                        }}
                        type="button"
                      >
                        <Archive size={14} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentInspector({
  document,
  onArchive,
  onEdit,
  onRestore,
}: {
  document: DocumentSummary | null;
  onArchive: (document: DocumentSummary) => void;
  onEdit: (document: DocumentSummary) => void;
  onRestore: (document: DocumentSummary) => void;
}) {
  if (!document) {
    return (
      <aside className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-base font-semibold">No document selected</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a document to inspect links, evidence state, and activity.
        </p>
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border bg-surface 2xl:sticky 2xl:top-5 2xl:max-h-[calc(100vh-170px)] 2xl:overflow-auto">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge tone={document.isArchived ? "warning" : "success"}>
              {document.isArchived ? "Archived" : "Active"}
            </Badge>
            <h2 className="mt-3 break-words text-base font-semibold">
              {document.fileName}
            </h2>
            <p className="mt-1 text-sm text-muted">{document.category}</p>
          </div>
          <FileText className="shrink-0 text-muted" size={18} />
        </div>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <section className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Next action
          </p>
          <p className="mt-1 font-semibold">{document.nextAction.label}</p>
          <p className="mt-2 leading-6 text-muted">
            {document.nextAction.description}
          </p>
          <Link
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
            href={document.nextAction.href}
            target={document.nextAction.href.startsWith("http") ? "_blank" : undefined}
          >
            Open action
            <ExternalLink size={13} />
          </Link>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Risk
          </p>
          <div className="mt-2 space-y-2">
            {document.riskIndicators.map((risk) => (
              <RiskRow key={risk.id} risk={risk} />
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            Linked records
          </p>
          <div className="mt-2 space-y-2">
            {document.linkedRecords.length === 0 ? (
              <MiniRow label="Links" value="No linked records" />
            ) : (
              document.linkedRecords.map((record) => (
                <Link
                  className="block rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-surface-muted"
                  href={record.href}
                  key={`${record.type}-${record.href}`}
                >
                  <MiniRow label={record.type} value={record.label} />
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
            History
          </p>
          <div className="mt-2 space-y-2">
            {document.activity.length === 0 ? (
              <MiniRow label="Activity" value="No document activity logged yet." />
            ) : (
              document.activity.slice(0, 4).map((change) => (
                <Link
                  className="block rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-surface-muted"
                  href={change.href}
                  key={change.id}
                >
                  <MiniRow
                    label={`${change.actionLabel} / ${change.entityLabel}`}
                    value={`${change.recordLabel} / ${formatDate(change.createdAt)}`}
                  />
                </Link>
              ))
            )}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => onEdit(document)} type="button">
            <Pencil size={15} />
            Edit
          </Button>
          {document.isArchived ? (
            <Button onClick={() => onRestore(document)} type="button">
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : (
            <Button onClick={() => onArchive(document)} type="button">
              <Archive size={15} />
              Archive
            </Button>
          )}
          <Link
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium transition-colors hover:bg-surface-muted"
            href={document.url ?? document.hrefs.document}
            target="_blank"
          >
            <ExternalLink size={15} />
            Open
          </Link>
        </div>
      </div>
    </aside>
  );
}

function DocumentForm({
  document,
  initialValues,
  mode,
  onClose,
  onSuccess,
  properties,
  units,
}: {
  document?: DocumentSummary;
  initialValues?: Partial<Pick<DocumentSummary["formValues"], "propertyId" | "unitId">>;
  mode: "create" | "edit";
  onClose: () => void;
  onSuccess: (message: string) => void;
  properties: DocumentPropertyOption[];
  units: DocumentUnitOption[];
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createDocumentAction : updateDocumentAction,
    initialState,
  );
  const defaults = {
    category: document?.formValues.category ?? "General",
    propertyId:
      document?.formValues.propertyId ?? initialValues?.propertyId ?? "",
    unitId: document?.formValues.unitId ?? initialValues?.unitId ?? "",
  };
  const [propertyId, setPropertyId] = useState(defaults.propertyId);
  const [unitId, setUnitId] = useState(defaults.unitId ?? "");
  const visibleUnits = units.filter((unit) => unit.propertyId === propertyId);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Document saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form
      action={action}
      className="flex h-full flex-col"
      encType="multipart/form-data"
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {document ? <input name="documentId" type="hidden" value={document.id} /> : null}
        <Field label="Category" error={state.fieldErrors?.category?.[0]}>
          <Input defaultValue={defaults.category} name="category" required />
        </Field>
        {mode === "create" ? (
          <Field label="File" error={state.fieldErrors?.document?.[0]}>
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              name="document"
              required
              type="file"
            />
          </Field>
        ) : null}
        <Field label="Property" error={state.fieldErrors?.propertyId?.[0]}>
          <SelectControl
            ariaLabel="Property"
            name="propertyId"
            onValueChange={(value) => {
              setPropertyId(value);
              setUnitId("");
            }}
            options={[
              { label: "Select property", value: "" },
              ...properties.map((property) => ({
                label: property.label,
                value: property.id,
              })),
            ]}
            required
            value={propertyId}
          />
        </Field>
        <Field label="Unit" error={state.fieldErrors?.unitId?.[0]}>
          <SelectControl
            ariaLabel="Unit"
            disabled={!propertyId}
            name="unitId"
            onValueChange={setUnitId}
            options={[
              { label: "Property level", value: "" },
              ...visibleUnits.map((unit) => ({
                label: unit.label,
                value: unit.id,
              })),
            ]}
            value={unitId}
          />
        </Field>
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="primary"
          >
            <Upload size={15} />
            {pending ? "Saving..." : mode === "create" ? "Upload" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DocumentArchivePanel({
  document,
  mode,
  onClose,
  onSuccess,
}: {
  document: DocumentSummary;
  mode: "archive" | "restore";
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(
    mode === "archive" ? archiveDocumentAction : restoreDocumentAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Document updated.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <input name="documentId" type="hidden" value={document.id} />
      <div className="flex-1 space-y-4 px-4 py-5 sm:px-5">
        <div className="rounded-md border border-border bg-surface-muted px-3 py-3">
          <p className="text-sm font-medium">{document.fileName}</p>
          <p className="mt-1 text-sm text-muted">{document.category}</p>
        </div>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          {mode === "archive"
            ? "Archiving hides this document from active evidence lists without deleting the file."
            : "Restoring returns this document to active evidence lists."}
        </p>
        {state.message ? (
          <p
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="border-t border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={pending}
            type="submit"
            variant="primary"
          >
            {mode === "archive" ? <Archive size={15} /> : <RotateCcw size={15} />}
            {pending ? "Saving..." : mode === "archive" ? "Archive" : "Restore"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RiskRow({
  risk,
}: {
  risk: DocumentSummary["riskIndicators"][number];
}) {
  return (
    <div className="flex min-w-0 gap-2 rounded-md border border-border px-2.5 py-2">
      <CheckCircle2 className="mt-0.5 shrink-0 text-muted" size={14} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{risk.label}</p>
          <Badge className="px-2 text-xs" tone={risk.tone}>
            {risk.tone === "success" ? "Ready" : "Review"}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          {risk.description}
        </p>
      </div>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="truncate font-medium" title={label}>
        {label}
      </p>
      <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted">
        {value}
      </p>
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </label>
  );
}

function getDocumentCreateInitialValues(
  viewQuery: DocumentViewQuery,
  properties: DocumentPropertyOption[],
  units: DocumentUnitOption[],
) {
  const requestedUnit =
    viewQuery.unitId === "all"
      ? undefined
      : units.find((unit) => unit.id === viewQuery.unitId);
  const propertyId =
    requestedUnit?.propertyId ??
    (viewQuery.propertyId !== "all" &&
    properties.some((property) => property.id === viewQuery.propertyId)
      ? viewQuery.propertyId
      : "");

  if (!propertyId) {
    return undefined;
  }

  return {
    propertyId,
    unitId: requestedUnit?.id,
  };
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Upload document";
  }

  if (drawer.mode === "edit") {
    return "Edit document";
  }

  return drawer.mode === "archive" ? "Archive document" : "Restore document";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Upload a PDF, image, or WebP and link it to a property or unit.";
  }

  if (drawer.mode === "edit") {
    return "Update document category and property/unit context.";
  }

  return drawer.mode === "archive"
    ? "Hide this evidence from active views without deleting the file."
    : "Return this evidence to active document views.";
}
