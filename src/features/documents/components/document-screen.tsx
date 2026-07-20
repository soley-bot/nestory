"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Eye,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
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
import { WorkspacePage } from "@/components/layout/workspace-page";
import {
  useWideWorkspace,
  WorkspaceSplitView,
} from "@/components/layout/workspace-split-view";
import { Badge } from "@/components/ui/badge";
import { removeSearchParams } from "@/lib/url/href";
import { Button } from "@/components/ui/button";
import { ConsequencePanel } from "@/components/ui/consequence-panel";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DOCUMENT_FILE_ACCEPT,
  FileDropzoneField,
} from "@/components/ui/file-dropzone-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { RecordField, RecordForm } from "@/components/ui/record-form";
import { SearchCombo } from "@/components/ui/search-combo";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  archiveDocumentAction,
  createDocumentAction,
  type DocumentActionState,
  restoreDocumentAction,
  updateDocumentAction,
} from "@/features/documents/actions";
import {
  formatFileSize,
  formatFileType,
} from "@/features/documents/components/document-list";
import { DEFAULT_DOCUMENT_PAGE_SIZE } from "@/features/documents/document.filters";
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
  const [compactInspectorOpen, setCompactInspectorOpen] = useState(false);
  const isWideWorkspace = useWideWorkspace();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const focusedDocument = initialDocumentId
    ? (documents.find((document) => document.id === initialDocumentId) ?? null)
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
    if (!isWideWorkspace) {
      setCompactInspectorOpen(false);
    }
    setStatusMessage(null);
    setDrawer(nextDrawer);
  };
  const previewDocument = (documentId: string) => {
    setSelectedDocumentId(documentId);
    setCompactInspectorOpen(true);
  };

  const hasFilters =
    viewQuery.archiveState !== "active" ||
    viewQuery.leaseId !== "all" ||
    viewQuery.pageSize !== DEFAULT_DOCUMENT_PAGE_SIZE ||
    viewQuery.propertyId !== "all" ||
    viewQuery.query.trim() !== "" ||
    viewQuery.taskId !== "all" ||
    viewQuery.unitId !== "all";
  const openCreate = () =>
    openDocumentAction({
      initialValues: createInitialValues,
      mode: "create",
    });
  const documentList = (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      {documents.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                href={pathname}
                scroll={false}
              >
                Clear filters
              </Link>
            ) : undefined
          }
          body={
            hasFilters
              ? "The current filters return no documents."
              : "Upload the first file to this evidence library."
          }
          className="h-full"
          kind={hasFilters ? "filtered" : "empty"}
          title={hasFilters ? "No matching documents" : "No documents yet"}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 p-3">
            <DocumentTable
              documents={documents}
              onSelect={previewDocument}
              selectedDocumentId={selectedDocument?.id ?? ""}
            />
          </div>
          <PaginationControls attached pagination={pagination} />
        </>
      )}
    </section>
  );
  const documentInspector = selectedDocument ? (
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
  ) : null;

  return (
    <WorkspacePage
      actions={
        <Button onClick={openCreate} variant="primary">
          <Plus size={15} />
          Upload document
        </Button>
      }
      context={`${pagination.totalCount} ${pagination.totalCount === 1 ? "document" : "documents"}`}
      contextHref="/documents"
      title="Documents"
      toolbar={
        <DocumentFilters
          properties={propertyOptions}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      }
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {statusMessage ? (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <p
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm"
              role="status"
            >
              {statusMessage}
            </p>
          </div>
        ) : null}

        {reviewContext ? (
          <DocumentReviewStrip
            context={reviewContext}
            count={pagination.totalCount}
          />
        ) : null}

        <div className="min-h-0 min-w-0 flex-1">
          {documentInspector && selectedDocument ? (
            <WorkspaceSplitView
              inspector={documentInspector}
              inspectorLabel={`${selectedDocument.fileName} document inspector`}
              inspectorOpen={isWideWorkspace || compactInspectorOpen}
              list={documentList}
              onInspectorOpenChange={setCompactInspectorOpen}
            />
          ) : (
            <WorkspaceSplitView list={documentList} />
          )}
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
    </WorkspacePage>
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
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
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
    <div className="grid w-full gap-2 md:grid-cols-[minmax(0,1.4fr)_150px_minmax(170px,220px)_minmax(170px,220px)]">
      <SearchCombo
        ariaLabel="Search documents"
        onQueryChange={(value) =>
          setQueryState({
            source: viewQuery.query,
            value,
          })
        }
        onSubmit={(event) => {
          event.preventDefault();
          replaceParam("query", query);
        }}
        placeholder="Search file name or category"
        query={query}
        submitLabel="Search documents"
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
        <table className="w-full min-w-[940px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col />
            <col className="w-[88px]" />
            <col className="w-[92px]" />
            <col className="w-[190px]" />
            <col className="w-[124px]" />
            <col className="w-[74px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">Document</th>
              <th className="px-1.5 py-2.5 font-semibold">Type</th>
              <th className="px-1.5 py-2.5 text-right font-semibold">Size</th>
              <th className="px-1.5 py-2.5 font-semibold">Linked to</th>
              <th className="px-1.5 py-2.5 font-semibold">Uploaded</th>
              <th className="px-1.5 py-2.5 text-right font-semibold">
                Preview
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr
                aria-selected={selectedDocumentId === document.id}
                className={cn(
                  previewRowClassName,
                  selectedDocumentId === document.id &&
                    selectedPreviewRowClassName,
                  document.isArchived && "text-muted",
                )}
                key={document.id}
                onClick={(event) => {
                  event.currentTarget.focus();
                  onSelect(document.id);
                }}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(document.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="px-2.5 py-2">
                  <Link
                    className="block truncate rounded-sm font-medium text-accent outline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    href={document.hrefs.document}
                    onClick={(event) => event.stopPropagation()}
                    title={document.fileName}
                  >
                    {document.fileName}
                  </Link>
                  <p
                    className="mt-0.5 truncate text-xs text-muted"
                    title={document.category}
                  >
                    {document.category}
                  </p>
                  {document.isArchived ? (
                    <Badge className="mt-1 px-2 text-xs" tone="warning">
                      Archived
                    </Badge>
                  ) : null}
                </td>
                <td className="px-1.5 py-2">
                  {formatFileType(document.mimeType)}
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums">
                  {formatFileSize(document.sizeBytes)}
                </td>
                <td className="px-1.5 py-2">
                  {document.linkedRecords[0] ? (
                    <>
                      <p className="truncate font-medium">
                        {document.linkedRecords[0].type}
                      </p>
                      <p
                        className="mt-0.5 truncate text-xs text-muted"
                        title={document.linkedRecords[0].label}
                      >
                        {document.linkedRecords[0].label}
                      </p>
                    </>
                  ) : (
                    <Badge tone="warning">No links</Badge>
                  )}
                </td>
                <td className="px-1.5 py-2">
                  {formatDate(document.uploadedAt)}
                </td>
                <td className="px-1.5 py-2 text-right">
                  <Button
                    aria-label={`Preview ${document.fileName}`}
                    aria-pressed={selectedDocumentId === document.id}
                    className="h-8 w-8 px-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(document.id);
                    }}
                    title={`Preview ${document.fileName}`}
                    variant="ghost"
                  >
                    <Eye size={15} />
                  </Button>
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
    return null;
  }

  return (
    <div className="bg-surface">
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
          <CompactFact label="Type">
            {formatFileType(document.mimeType)}
          </CompactFact>
          <CompactFact label="Size">
            {formatFileSize(document.sizeBytes)}
          </CompactFact>
          <CompactFact label="Links">
            {document.linkedRecords.length}
          </CompactFact>
        </div>

        <DocumentAttentionNote
          href={document.nextAction.href}
          item={getDocumentAttentionItem(document.riskIndicators)}
          label={document.nextAction.label}
        />

        <DocumentLinkedRecords records={document.linkedRecords} />

        <div className="grid grid-cols-2 gap-2">
          <Button
            aria-label="Edit document"
            onClick={() => onEdit(document)}
            type="button"
          >
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
          {document.url ? (
            <a
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
              href={document.url}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={15} />
              Open file
            </a>
          ) : null}
        </div>
      </div>
    </div>
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
  const propertyLabel =
    properties.find((property) => property.id === propertyId)?.label ??
    "Select a property";
  const unitLabel =
    units.find((unit) => unit.id === unitId)?.label ?? "Property level";
  const hiddenLinkError =
    state.fieldErrors?.leaseId?.[0] ?? state.fieldErrors?.taskId?.[0];
  const presentedState = {
    ...state,
    fieldErrors: state.fieldErrors ? { ...state.fieldErrors } : undefined,
    message: state.message ?? hiddenLinkError,
  };

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Document saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <RecordForm
      action={action}
      ariaLabel={
        mode === "create" ? "Upload document form" : "Edit document form"
      }
      onCancel={onClose}
      pending={pending}
      saveLabel={mode === "create" ? "Upload document" : "Save changes"}
      savingLabel={mode === "create" ? "Uploading document" : "Saving document"}
      state={presentedState}
    >
      {document ? (
        <input name="documentId" type="hidden" value={document.id} />
      ) : null}
      {defaults.leaseId ? (
        <input name="leaseId" type="hidden" value={defaults.leaseId} />
      ) : null}
      {defaults.taskId ? (
        <input name="taskId" type="hidden" value={defaults.taskId} />
      ) : null}
      <ConsequencePanel
        rows={[
          { label: "File", value: "PDF, JPG, PNG, or WebP up to 10 MB" },
          { label: "Property", value: propertyLabel },
          { label: "Unit", value: unitLabel },
        ]}
        summary={
          defaults.leaseId
            ? "The saved document stays linked to the selected property and lease."
            : defaults.taskId
              ? "The saved document stays linked to the selected property and maintenance case."
              : "The saved document appears in the selected property or unit record."
        }
        title="Document link and file limits"
      >
        {hiddenLinkError ? (
          <p className="text-danger">{hiddenLinkError}</p>
        ) : null}
      </ConsequencePanel>

      <FormSection title="File details">
        <RecordField
          error={state.fieldErrors?.category?.[0]}
          label="Category"
          name="category"
          required
        >
          <Input defaultValue={defaults.category} name="category" required />
        </RecordField>
        <RecordField
          label={mode === "create" ? "File" : "Replace file"}
          name="document"
          error={state.fieldErrors?.document?.[0]}
          required={mode === "create"}
        >
          <FileDropzoneField
            accept={DOCUMENT_FILE_ACCEPT}
            description="PDF, JPG, PNG, or WebP up to 10 MB."
            name="document"
            required={mode === "create"}
          />
          {mode === "edit" ? (
            <p className="mt-1 text-xs text-muted">
              Leave empty to keep the current file.
            </p>
          ) : null}
        </RecordField>
      </FormSection>

      <FormSection title="Record link">
        <RecordField
          error={state.fieldErrors?.propertyId?.[0]}
          label="Property"
          name="propertyId"
          required
        >
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
        </RecordField>
        <RecordField
          error={state.fieldErrors?.unitId?.[0]}
          label="Unit"
          name="unitId"
        >
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
        </RecordField>
      </FormSection>
    </RecordForm>
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
          {item ? null : (
            <Link
              aria-label="Open action"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-accent transition-colors hover:bg-surface-muted"
              href={href}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
              target={href.startsWith("http") ? "_blank" : undefined}
              title="Open action"
            >
              <ExternalLink size={13} />
            </Link>
          )}
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
              aria-label={record.label}
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
      description:
        "Opened from an exact document link with archived records included.",
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

  if (viewQuery.unitId !== "all") {
    return {
      countLabel: "linked to this unit",
      description: "Opened from a unit evidence link.",
      nextStep: "Upload or review evidence for the selected unit.",
    };
  }

  if (viewQuery.propertyId !== "all") {
    return {
      countLabel: "linked to this property",
      description: "Opened from a property evidence link.",
      nextStep: "Upload or review evidence for the selected property.",
    };
  }

  return null;
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
  return removeSearchParams(pathname, searchParams, ["action", "category"]);
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
    return "Update document category, links, or replace the file.";
  }

  return drawer.mode === "archive"
    ? "Hide this evidence from active views without deleting the file."
    : "Return this evidence to active document views.";
}
