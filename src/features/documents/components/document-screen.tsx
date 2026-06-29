"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { PaginationControls } from "@/components/data/pagination-controls";
import {
  getInitialRecordId,
  getSelectedRecord,
} from "@/components/data/record-selection";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
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
import { getUuidSearchParam } from "@/lib/validation/search-params";
import { cn } from "@/lib/utils";

const initialState: DocumentActionState = {};

type DrawerState =
  | {
      initialValues?: Partial<
        Pick<
          DocumentSummary["formValues"],
          "category" | "leaseId" | "propertyId" | "taskId" | "unitId"
        >
      >;
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
  const searchParamString = searchParams.toString();
  const createInitialValues = useMemo(
    () =>
      getDocumentCreateInitialValues(
        viewQuery,
        propertyOptions,
        unitOptions,
        searchParamString,
      ),
    [propertyOptions, searchParamString, unitOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [selectedDocumentId, setSelectedDocumentId] = useState(() =>
    getInitialRecordId(documents, initialDocumentId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedDocument = initialDocumentId
    ? documents.find((document) => document.id === initialDocumentId) ?? null
    : null;
  const focusedDocumentId = focusedDocument?.id;
  const selectedDocument = getSelectedRecord({
    focusedRecordId: initialDocumentId,
    records: documents,
    selectedRecordId: selectedDocumentId,
  });
  const reviewContext = getDocumentReviewContext(viewQuery, {
    hasFocusedDocument: Boolean(focusedDocument),
    hasFocusedDocumentIntent: Boolean(initialDocumentId),
  });

  useEffect(() => {
    if (!focusedDocumentId) {
      return;
    }

    queueMicrotask(() => {
      setSelectedDocumentId(focusedDocumentId);
      setPreviewOpen(true);
    });
  }, [focusedDocumentId]);

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
  const openDocumentAction = (nextDrawer: DrawerState) => {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setPreviewOpen(true);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setStatusMessage(null);
              openDocumentAction({
                initialValues: createInitialValues,
                mode: "create",
              });
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

      {reviewContext ? (
        <DocumentReviewStrip
          context={reviewContext}
          count={pagination.totalCount}
        />
      ) : null}

      <div className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <div className="min-w-0 space-y-0">
          <DocumentTable
            documents={documents}
            onSelect={previewDocument}
            selectedDocumentId={selectedDocument?.id ?? ""}
          />
          <PaginationControls attached pagination={pagination} />
        </div>
      </div>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedDocument)}
        title="Document preview"
      >
        <DocumentInspector
          document={selectedDocument}
          onArchive={(document) =>
            openDocumentAction({ document, mode: "archive" })
          }
          onEdit={(document) => openDocumentAction({ document, mode: "edit" })}
          onRestore={(document) =>
            openDocumentAction({ document, mode: "restore" })
          }
        />
      </RecordPreviewDrawer>

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

    nextParams.delete("leaseId");
    nextParams.delete("taskId");

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
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
          onValueChange={(value) =>
            replaceParam("archiveState", value, "active")
          }
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

type DocumentReviewContext = {
  countLabel: string;
  description: string;
  nextStep: string;
};

type FocusedDocumentState = {
  hasFocusedDocument: boolean;
  hasFocusedDocumentIntent: boolean;
};

function DocumentReviewStrip({
  context,
  count,
}: {
  context: DocumentReviewContext;
  count: number;
}) {
  return (
    <div className="border-b border-border bg-surface-muted/35 px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 truncate font-medium text-foreground">
          {count} {count === 1 ? "document" : "documents"} {context.countLabel}
        </p>
        <p className="text-foreground-muted">{context.nextStep}</p>
      </div>
      <p className="mt-1 text-xs text-foreground-subtle">
        {context.description}
      </p>
    </div>
  );
}

function DocumentTable({
  documents,
  onSelect,
  selectedDocumentId,
}: {
  documents: DocumentSummary[];
  onSelect: (id: string) => void;
  selectedDocumentId: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[min(620px,calc(100vh-320px))] overflow-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[16%]" />
            <col className="w-[32%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">Document</th>
              <th className="px-1.5 py-2.5 font-semibold">Category</th>
              <th className="px-1.5 py-2.5 font-semibold">Linked records</th>
              <th className="px-1.5 py-2.5 font-semibold">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={4}>
                  No documents found.
                </td>
              </tr>
            ) : null}
            {documents.map((document) => (
              <tr
                className={cn(
                  previewRowClassName,
                  selectedDocumentId === document.id &&
                    selectedPreviewRowClassName,
                  document.isArchived && "text-muted",
                )}
                key={document.id}
                onClick={() => onSelect(document.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(document.id);
                  }
                }}
                tabIndex={0}
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
                <td className="px-1.5 py-2">
                  {formatDate(document.uploadedAt)}
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
      <aside className="bg-surface p-4">
        <h2 className="text-base font-semibold">No document selected</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a document to inspect links, evidence state, and activity.
        </p>
      </aside>
    );
  }

  return (
    <aside className="bg-surface">
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
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Uploaded">
            {formatDate(document.uploadedAt)}
          </CompactFact>
          <CompactFact label="Links">
            {document.linkedRecords.length || "None"}
          </CompactFact>
        </div>

        <DocumentAttentionNote
          href={document.nextAction.href}
          item={getDocumentAttentionItem(document.riskIndicators)}
          label={document.nextAction.label}
        />

        <DocumentLinkedRecords records={document.linkedRecords} />

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
  initialValues?: Partial<
    Pick<
      DocumentSummary["formValues"],
      "category" | "leaseId" | "propertyId" | "taskId" | "unitId"
    >
  >;
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
    category:
      document?.formValues.category ?? initialValues?.category ?? "General",
    leaseId: document?.formValues.leaseId ?? initialValues?.leaseId ?? "",
    propertyId:
      document?.formValues.propertyId ?? initialValues?.propertyId ?? "",
    taskId: document?.formValues.taskId ?? initialValues?.taskId ?? "",
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
        {document ? (
          <input name="documentId" type="hidden" value={document.id} />
        ) : null}
        {defaults.leaseId ? (
          <input name="leaseId" type="hidden" value={defaults.leaseId} />
        ) : null}
        {defaults.taskId ? (
          <input name="taskId" type="hidden" value={defaults.taskId} />
        ) : null}
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
            {mode === "archive" ? (
              <Archive size={15} />
            ) : (
              <RotateCcw size={15} />
            )}
            {pending ? "Saving..." : mode === "archive" ? "Archive" : "Restore"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CompactFact({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 font-medium">{children}</div>
    </div>
  );
}

function DocumentAttentionNote({
  href,
  item,
  label,
}: {
  href: string;
  item?: DocumentSummary["riskIndicators"][number];
  label: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-semibold">{item?.label ?? label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={item?.tone ?? "neutral"}>
            {item ? "Review" : "Action"}
          </Badge>
          <Link
            aria-label="Open action"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            title="Open action"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function DocumentLinkedRecords({
  records,
}: {
  records: DocumentSummary["linkedRecords"];
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="truncate font-semibold">Linked records</p>
        <Badge tone={records.length > 0 ? "success" : "warning"}>
          {records.length > 0 ? `${records.length} linked` : "No links"}
        </Badge>
      </div>
      {records.length === 0 ? (
        <p className="text-sm text-muted">No operational record is linked.</p>
      ) : (
        <div className="space-y-1.5">
          {records.map((record) => (
            <Link
              className="flex min-w-0 items-center justify-between gap-3 rounded border border-border bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-muted"
              href={record.href}
              key={`${record.type}-${record.href}`}
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-muted">
                  {record.type}
                </span>
                <span className="block truncate font-medium">
                  {record.label}
                </span>
              </span>
              <ExternalLink className="shrink-0 text-accent" size={13} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function getDocumentAttentionItem(items: DocumentSummary["riskIndicators"]) {
  return items.find((item) => item.tone !== "success");
}

function getDocumentReviewContext(
  viewQuery: DocumentViewQuery,
  focusedState: FocusedDocumentState,
): DocumentReviewContext | null {
  if (focusedState.hasFocusedDocument) {
    return {
      countLabel: "in this document view",
      description: "Opened from an exact document link with archived records included.",
      nextStep: "The focused document is selected for preview review.",
    };
  }

  if (focusedState.hasFocusedDocumentIntent) {
    return {
      countLabel: "in this document view",
      description:
        "Opened from an exact document link, but this page did not include the focused document.",
      nextStep: "Review visible matches or broaden the current filters.",
    };
  }

  if (viewQuery.taskId !== "all") {
    return {
      countLabel: "linked to this maintenance case",
      description: "Opened from a maintenance evidence link.",
      nextStep: "Upload or review evidence for the selected case.",
    };
  }

  if (viewQuery.leaseId !== "all") {
    return {
      countLabel: "linked to this lease",
      description: "Opened from a lease evidence link.",
      nextStep: "Upload or review evidence for the selected lease.",
    };
  }

  return null;
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
  searchParamString: string,
) {
  const category = getCreateCategory(searchParamString);
  const leaseId = getCreateLeaseId(searchParamString);
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

  if (!propertyId && !category && !leaseId) {
    return undefined;
  }

  return {
    category,
    leaseId,
    propertyId,
    taskId: viewQuery.taskId === "all" ? undefined : viewQuery.taskId,
    unitId: requestedUnit?.id,
  };
}

function getCreateCategory(searchParamString: string) {
  const category = new URLSearchParams(searchParamString)
    .get("category")
    ?.trim();

  return category ? category.slice(0, 80) : undefined;
}

function getCreateLeaseId(searchParamString: string) {
  return getUuidSearchParam(
    new URLSearchParams(searchParamString).get("leaseId") ?? undefined,
  );
}

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");
  nextParams.delete("category");

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
