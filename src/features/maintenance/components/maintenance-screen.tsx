"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Columns3,
  FileText,
  Landmark,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Wrench,
  X,
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
import { removeActionSearchParam as getHrefWithoutActionParam } from "@/lib/url/href";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { Input } from "@/components/ui/input";
import { MonthPickerField } from "@/components/ui/month-picker-field";
import { NumberInput } from "@/components/ui/number-input";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SearchCombo } from "@/components/ui/search-combo";
import {
  SelectControl,
  type SelectControlOption,
} from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import { Textarea } from "@/components/ui/textarea";
import { TimePickerField } from "@/components/ui/time-picker-field";
import {
  createMaintenanceCaseAction,
  type MaintenanceActionState,
  updateMaintenanceCaseAction,
  updateMaintenanceStatusAction,
} from "@/features/maintenance/actions";
import type { MaintenanceCapabilities } from "@/features/maintenance/maintenance.capabilities";
import {
  formatMaintenanceChecklistText,
  parseMaintenanceChecklistText,
} from "@/features/maintenance/maintenance.checklist";
import { getMaintenanceBranchControlMode } from "@/features/maintenance/maintenance.execution";
import {
  ArchiveMaintenancePanel,
  RestoreMaintenancePanel,
} from "@/features/maintenance/components/maintenance-drawer-panels";
import { MaintenanceReminderNotifications } from "@/features/maintenance/components/maintenance-reminder-notifications";
import { MaintenanceWorkflowPanel } from "@/features/maintenance/components/maintenance-workflow-panel";
import {
  MaintenanceWorkflowSurface,
  type MaintenanceSurfaceVariant,
} from "@/features/maintenance/components/maintenance-work-surfaces";
import {
  buildClearFiltersHref,
  buildMaintenanceCasesViewHref,
  buildMaintenanceSavedViewHref,
  buildMaintenanceTabHref,
  getMaintenanceReportHref,
} from "@/features/maintenance/maintenance.hrefs";
import type {
  MaintenanceBadgeTone,
  MaintenanceActor,
  MaintenanceAssigneeOption,
  MaintenanceCase,
  MaintenanceBranchOption,
  MaintenancePagination,
  MaintenanceChecklistItem,
  MaintenancePropertyOption,
  MaintenanceReminderNotification,
  MaintenanceStatus,
  MaintenanceSummary,
  MaintenanceUnitOption,
  MaintenanceVendorOption,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import { canTransitionMaintenanceStatus } from "@/features/maintenance/maintenance.workflow";
import { cn } from "@/lib/utils";

const initialState: MaintenanceActionState = {};
const MAINTENANCE_STATUS_OPTIONS: Array<{
  label: string;
  value: MaintenanceStatus;
}> = [
  { label: "Pending", value: "pending" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In progress", value: "in_progress" },
  { label: "Blocked", value: "blocked" },
  { label: "Ready for review", value: "ready_for_review" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];
const DatePickerField = dynamic(
  () =>
    import("@/components/ui/date-picker-field").then(
      (module) => module.DatePickerField,
    ),
  { ssr: false },
);

type MaintenanceScopeFact = {
  label: string;
  tone: MaintenanceBadgeTone;
  value: number;
};

type DrawerState =
  | {
      initialValues?: Partial<MaintenanceCase["formValues"]>;
      mode: "create";
    }
  | {
      maintenanceCase: MaintenanceCase;
      mode: "archive" | "edit" | "restore";
    };

type MaintenanceScreenProps = {
  actor: MaintenanceActor;
  baseReview?: MaintenanceViewQuery["review"];
  branchOptions: MaintenanceBranchOption[];
  capabilities: MaintenanceCapabilities;
  cases: MaintenanceCase[];
  createButtonLabel?: string;
  description?: string;
  emptyLabel?: string;
  flowLabel?: string;
  initialTaskId?: string;
  listLabel?: string;
  pagination: MaintenancePagination;
  propertyOptions: MaintenancePropertyOption[];
  recordLabel?: string;
  reminders?: MaintenanceReminderNotification[];
  showReportAction?: boolean;
  showFilters?: boolean;
  showCaseViewTabs?: boolean;
  showReviewTabs?: boolean;
  showScopeSummary?: boolean;
  staffOptions: MaintenanceAssigneeOption[];
  summary: MaintenanceSummary;
  surfaceVariant?: MaintenanceSurfaceVariant;
  title?: string;
  unitOptions: MaintenanceUnitOption[];
  vendorOptions: MaintenanceVendorOption[];
  viewQuery: MaintenanceViewQuery;
};

export function MaintenanceScreen({
  actor,
  baseReview = "open",
  branchOptions,
  capabilities,
  cases,
  createButtonLabel = "New case",
  description = "Open work orders, scheduled repairs, and unit/property maintenance history.",
  emptyLabel = "No maintenance cases found.",
  flowLabel = "Current scope",
  initialTaskId,
  listLabel = "maintenance cases",
  pagination,
  propertyOptions,
  recordLabel = "maintenance case",
  reminders = [],
  showReportAction = true,
  showFilters = true,
  showCaseViewTabs = false,
  showReviewTabs = true,
  showScopeSummary = true,
  staffOptions,
  summary,
  surfaceVariant = "table",
  title = "Maintenance",
  unitOptions,
  vendorOptions,
  viewQuery,
}: MaintenanceScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const calendarMode = surfaceVariant === "agenda";
  const balancedCasesWorkspace = showCaseViewTabs && surfaceVariant === "table";
  const createInitialValues = useMemo(
    () => getCreateInitialValues(viewQuery, propertyOptions, unitOptions),
    [propertyOptions, unitOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    capabilities.canCreateCase && searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState(() =>
    getInitialRecordId(cases, initialTaskId),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState(
    () => new Map<string, MaintenanceStatus>(),
  );
  const [statusChangePending, startStatusChange] = useTransition();
  const visibleCases = useMemo(
    () => applyMaintenanceStatusOverrides(cases, statusOverrides),
    [cases, statusOverrides],
  );
  const focusedCase = initialTaskId
    ? visibleCases.find((maintenanceCase) => maintenanceCase.id === initialTaskId) ??
      null
    : null;
  const focusedTaskId = focusedCase?.id;
  const selectedCase = getSelectedRecord({
    focusedRecordId: initialTaskId,
    records: visibleCases,
    selectedRecordId: selectedTaskId,
  });

  useEffect(() => {
    if (focusedTaskId) {
      queueMicrotask(() => {
        setSelectedTaskId(focusedTaskId);
        setPreviewOpen(
          !balancedCasesWorkspace ||
            !window.matchMedia("(min-width: 1280px)").matches,
        );
      });
    }
  }, [balancedCasesWorkspace, focusedTaskId]);

  useEffect(() => {
    if (!capabilities.canCreateCase || searchParams.get("action") !== "create") {
      return;
    }

    queueMicrotask(() => {
      setStatusMessage(null);
      setDrawer({ initialValues: createInitialValues, mode: "create" });
    });
    router.replace(getHrefWithoutActionParam(pathname, searchParams), {
      scroll: false,
    });
  }, [capabilities.canCreateCase, createInitialValues, pathname, router, searchParams]);

  function openDrawer(nextDrawer: DrawerState) {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  }

  function previewCase(taskId: string) {
    setSelectedTaskId(taskId);
    setPreviewOpen(
      !balancedCasesWorkspace ||
        !window.matchMedia("(min-width: 1280px)").matches,
    );
  }

  function createCaseOnDate(dueDate: string) {
    openDrawer({
      initialValues: {
        ...createInitialValues,
        dueDate,
        status: "scheduled",
      },
      mode: "create",
    });
  }

  function moveMaintenanceStatus(
    maintenanceCase: MaintenanceCase,
    status: MaintenanceStatus,
  ) {
    if (
      maintenanceCase.status === status ||
      !canTransitionMaintenanceStatus(
        maintenanceCase.status,
        status,
        { actorRole: actor.role, executionMode: maintenanceCase.executionMode },
      )
    ) {
      return;
    }

    setStatusMessage(null);
    setStatusOverrides((current) => {
      const next = new Map(current);
      next.set(maintenanceCase.id, status);
      return next;
    });
    startStatusChange(async () => {
      const result = await updateMaintenanceStatusAction(maintenanceCase.id, status);

      if (result.status === "error") {
        setStatusOverrides((current) => {
          const next = new Map(current);
          next.delete(maintenanceCase.id);
          return next;
        });
        setStatusMessage(result.message ?? "Could not update maintenance status.");
        return;
      }

      setStatusMessage(result.message ?? "Maintenance status updated.");
      router.refresh();
    });
  }

  return (
    <div className={calendarMode ? "min-h-0 overflow-hidden" : "min-h-screen"}>
      <PageHeader
        actions={
          <>
            {showReportAction ? (
              <LinkButton href={getMaintenanceReportHref(viewQuery)}>
                <FileText size={15} />
                Make report
              </LinkButton>
            ) : null}
            {capabilities.canCreateCase ? (
              <Button
                onClick={() =>
                  openDrawer({ initialValues: createInitialValues, mode: "create" })
                }
                variant="primary"
              >
                <Plus size={15} />
                {createButtonLabel}
              </Button>
            ) : null}
          </>
        }
        description={description}
        title={title}
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

      {showCaseViewTabs ? (
        <MaintenanceCasesCommandBar
          listLabel={listLabel}
          properties={propertyOptions}
          summary={summary}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      ) : showFilters ? (
        <MaintenanceFilters
          baseReview={baseReview}
          listLabel={listLabel}
          properties={propertyOptions}
          showReviewTabs={showReviewTabs}
          units={unitOptions}
          viewQuery={viewQuery}
        />
      ) : null}

      <main
        className={cn(
          "px-4 sm:px-6 lg:px-6",
          calendarMode
            ? cn(
                "min-h-0 py-3",
                showCaseViewTabs
                  ? "h-[calc(100vh-226px)]"
                  : "h-[calc(100vh-122px)]",
              )
            : balancedCasesWorkspace
              ? "h-[calc(100vh-169px)] min-h-0 py-3"
              : "space-y-3 py-4 lg:py-4",
        )}
      >
        {showScopeSummary ? (
          <MaintenanceScopeSummary
            flowLabel={flowLabel}
            listLabel={listLabel}
            properties={propertyOptions}
            recordLabel={recordLabel}
            summary={summary}
            units={unitOptions}
            viewQuery={viewQuery}
          />
        ) : null}
        {surfaceVariant === "table" ? (
          balancedCasesWorkspace ? (
            <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-h-0 space-y-0">
                <MaintenanceTable
                  cases={visibleCases}
                  emptyLabel={emptyLabel}
                  fillHeight
                  onSelect={previewCase}
                  recordLabel={recordLabel}
                  selectedTaskId={selectedCase?.id ?? ""}
                />
                <PaginationControls attached pagination={pagination} />
              </div>
              <div className="hidden min-h-0 overflow-hidden rounded-md border border-border bg-surface xl:block">
                <div className="h-full overflow-auto">
                  <MaintenanceInspector
                    actor={actor}
                    capabilities={capabilities}
                    maintenanceCase={selectedCase}
                    onStatusMessage={setStatusMessage}
                    onArchive={(maintenanceCase) =>
                      openDrawer({ maintenanceCase, mode: "archive" })
                    }
                    onEdit={(maintenanceCase) =>
                      openDrawer({ maintenanceCase, mode: "edit" })
                    }
                    onRestore={(maintenanceCase) =>
                      openDrawer({ maintenanceCase, mode: "restore" })
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              <MaintenanceTable
                cases={visibleCases}
                emptyLabel={emptyLabel}
                onSelect={previewCase}
                recordLabel={recordLabel}
                selectedTaskId={selectedCase?.id ?? ""}
              />
              <PaginationControls attached pagination={pagination} />
            </div>
          )
        ) : (
          <MaintenanceWorkflowSurface
            actorRole={actor.role}
            cases={visibleCases}
            emptyLabel={emptyLabel}
            month={viewQuery.month}
            onCreateDate={capabilities.canCreateCase ? createCaseOnDate : undefined}
            onStatusChange={capabilities.canManageCaseState ? moveMaintenanceStatus : undefined}
            onSelect={previewCase}
            pagination={pagination}
            selectedTaskId={selectedCase?.id ?? ""}
            statusChangePending={statusChangePending}
            variant={surfaceVariant}
            waitingForReviewLabel={actor.role === "member"}
          />
        )}
      </main>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedCase)}
        title={capitalizeLabel(recordLabel)}
      >
        <MaintenanceInspector
          actor={actor}
          capabilities={capabilities}
          maintenanceCase={selectedCase}
          onStatusMessage={setStatusMessage}
          onArchive={(maintenanceCase) =>
            openDrawer({ maintenanceCase, mode: "archive" })
          }
          onEdit={(maintenanceCase) =>
            openDrawer({ maintenanceCase, mode: "edit" })
          }
          onRestore={(maintenanceCase) =>
            openDrawer({ maintenanceCase, mode: "restore" })
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
          {drawer.mode === "archive" ? (
            <ArchiveMaintenancePanel
              maintenanceCase={drawer.maintenanceCase}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : drawer.mode === "restore" ? (
            <RestoreMaintenancePanel
              maintenanceCase={drawer.maintenanceCase}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
            />
          ) : (
            <MaintenanceForm
              actor={actor}
              canPostMaintenanceCost={capabilities.canPostMaintenanceCost}
              canRecordActualCost={capabilities.canRecordActualCost}
              initialValues={
                drawer.mode === "create" ? drawer.initialValues : undefined
              }
              maintenanceCase={
                drawer.mode === "edit" ? drawer.maintenanceCase : undefined
              }
              mode={drawer.mode}
              onClose={() => setDrawer(null)}
              onSuccess={setStatusMessage}
              properties={propertyOptions}
              branches={branchOptions}
              staff={staffOptions}
              units={unitOptions}
              vendors={vendorOptions}
            />
          )}
        </SideDrawer>
      ) : null}
      <MaintenanceReminderNotifications reminders={reminders} />
    </div>
  );
}

function MaintenanceCasesCommandBar({
  listLabel,
  properties,
  summary,
  units,
  viewQuery,
}: {
  listLabel: string;
  properties: MaintenancePropertyOption[];
  summary: MaintenanceSummary;
  units: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const advancedFilterCount = getAdvancedFilterCount(viewQuery, "open");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const scopeOptions = getScopeOptions(properties, units, listLabel);

  const replaceParam = (name: string, value: string, defaultValue = "") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    nextParams.delete("taskId");

    if (!value || value === defaultValue) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }

    if (name === "propertyId") {
      nextParams.delete("unitId");
      nextParams.delete("scope");
    }

    if (name === "unitId") {
      nextParams.delete("scope");
    }

    if (name === "status" && value && value !== "all") {
      nextParams.set("review", "all");
      nextParams.set("view", "list");
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  function replaceScope(value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    const [kind, id] = value.split(":");

    nextParams.delete("page");
    nextParams.delete("taskId");
    nextParams.delete("propertyId");
    nextParams.delete("unitId");
    nextParams.delete("scope");

    if (kind === "property" && id) {
      nextParams.set("propertyId", id);
    } else if (kind === "unit" && id) {
      const unit = units.find((candidate) => candidate.id === id);
      if (unit) {
        nextParams.set("propertyId", unit.propertyId);
        nextParams.set("unitId", unit.id);
      }
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className="relative border-b border-border px-4 py-2 sm:px-6 lg:px-6">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {getMaintenanceSavedViewTabs(pathname, searchParams, viewQuery, summary).map(
            (tab) => (
              <Link
                className={cn(
                  "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors",
                  tab.active
                    ? "border-accent bg-accent-soft text-foreground"
                    : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
                )}
                href={tab.href}
                key={tab.review}
                prefetch={false}
              >
                {tab.label}
              </Link>
            ),
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2 lg:grid-cols-[minmax(260px,1fr)_auto]">
          <SearchCombo
            ariaLabel={`Search ${listLabel}`}
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
            placeholder={`Search ${listLabel}...`}
            query={query}
            submitLabel={`Search ${listLabel}`}
          />
          <Button
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
            type="button"
          >
            <SlidersHorizontal size={14} />
            Filters{advancedFilterCount > 0 ? ` ${advancedFilterCount}` : ""}
          </Button>
        </div>

        <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border border-border bg-surface">
          {getMaintenanceCasesViewTabs(pathname, searchParams, viewQuery).map((tab) => (
            <Link
              className={cn(
                "inline-flex size-8 items-center justify-center border-r border-border text-muted transition-colors last:border-r-0 hover:bg-surface-muted hover:text-foreground",
                tab.active
                  ? "bg-accent-soft text-foreground"
                  : "bg-surface",
              )}
              aria-label={tab.label}
              href={tab.href}
              key={tab.id}
              prefetch={false}
              title={tab.label}
            >
              <tab.icon size={14} />
              <span className="sr-only">{tab.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {advancedOpen ? (
        <div className="absolute right-4 top-[calc(100%+6px)] z-30 grid w-[min(760px,calc(100vw-2rem))] gap-2 rounded-md border border-border bg-surface p-3 shadow-lg sm:right-6 lg:grid-cols-[minmax(180px,1fr)_160px_160px_160px]">
          <SelectControl
            ariaLabel="Maintenance scope"
            onValueChange={replaceScope}
            options={scopeOptions}
            value={getScopeValue(viewQuery)}
          />
          <SelectControl
            ariaLabel="Priority"
            onValueChange={(value) => replaceParam("priority", value, "all")}
            options={[
              { label: "All priority", value: "all" },
              { label: "Urgent", value: "urgent" },
              { label: "High", value: "high" },
              { label: "Normal", value: "normal" },
              { label: "Low", value: "low" },
            ]}
            value={viewQuery.priority}
          />
          <SelectControl
            ariaLabel="Status"
            onValueChange={(value) => replaceParam("status", value, "all")}
            options={[
              { label: "All status", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Scheduled", value: "scheduled" },
              { label: "In progress", value: "in_progress" },
              { label: "Blocked", value: "blocked" },
              { label: "Ready for review", value: "ready_for_review" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
            value={viewQuery.status}
          />
          <SelectControl
            ariaLabel="Attention filter"
            onValueChange={(value) => replaceParam("review", value, "open")}
            options={[
              { label: "Open queue", value: "open" },
              { label: "Work orders", value: "work_orders" },
              { label: "Scheduled", value: "scheduled" },
              { label: "Inspections", value: "inspections" },
              { label: "Due reminders", value: "reminders" },
              { label: "High priority", value: "high_priority" },
              { label: "High cost", value: "high_cost" },
              { label: "Recurring", value: "recurring" },
              { label: "Review completion", value: "review_completion" },
              { label: "All attention", value: "all" },
            ]}
            value={viewQuery.review}
          />
          <MonthPickerField
            ariaLabel="Report month"
            defaultValue={viewQuery.month}
            name="month"
            onValueChange={(value) => replaceParam("month", value)}
          />
          <div className="flex justify-end lg:col-span-4">
            <LinkButton href={buildClearFiltersHref(pathname, searchParams)}>
              Clear filters
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MaintenanceFilters({
  baseReview,
  listLabel,
  properties,
  showReviewTabs,
  units,
  viewQuery,
}: {
  baseReview: MaintenanceViewQuery["review"];
  listLabel: string;
  properties: MaintenancePropertyOption[];
  showReviewTabs: boolean;
  units: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const advancedFilterCount = getAdvancedFilterCount(viewQuery, baseReview);
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);
  const [queryState, setQueryState] = useState({
    source: viewQuery.query,
    value: viewQuery.query,
  });
  const query =
    queryState.source === viewQuery.query ? queryState.value : viewQuery.query;
  const scopeOptions = getScopeOptions(properties, units, listLabel);

  const replaceParam = (name: string, value: string, defaultValue = "") => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    nextParams.delete("taskId");

    if (!value || value === defaultValue) {
      nextParams.delete(name);
    } else {
      nextParams.set(name, value);
    }

    if (name === "propertyId") {
      nextParams.delete("unitId");
      nextParams.delete("scope");
    }

    if (name === "unitId") {
      nextParams.delete("scope");
    }

    if (name === "status" && value && value !== "all") {
      nextParams.set("review", "all");
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  function replaceScope(value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    const [kind, id] = value.split(":");

    nextParams.delete("page");
    nextParams.delete("taskId");
    nextParams.delete("propertyId");
    nextParams.delete("unitId");
    nextParams.delete("scope");

    if (kind === "property" && id) {
      nextParams.set("propertyId", id);
    } else if (kind === "unit" && id) {
      const unit = units.find((candidate) => candidate.id === id);
      if (unit) {
        nextParams.set("propertyId", unit.propertyId);
        nextParams.set("unitId", unit.id);
      }
    }

    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="border-b border-border px-4 py-3 sm:px-6 lg:px-6">
      {showReviewTabs ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {getMaintenanceTabs(pathname, searchParams, viewQuery).map((tab) => (
            <Link
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-medium transition-colors",
                tab.active
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
              )}
              href={tab.href}
              key={tab.id}
              prefetch={false}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-[minmax(280px,1.25fr)_minmax(220px,1fr)_auto]">
        <SearchCombo
          ariaLabel={`Search ${listLabel}`}
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
          placeholder={`Search ${listLabel}...`}
          query={query}
          submitLabel={`Search ${listLabel}`}
        />
        <SelectControl
          ariaLabel="Maintenance scope"
          onValueChange={replaceScope}
          options={scopeOptions}
          value={getScopeValue(viewQuery)}
        />
        <Button
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((current) => !current)}
          type="button"
        >
          <SlidersHorizontal size={14} />
          Filters{advancedFilterCount > 0 ? ` ${advancedFilterCount}` : ""}
        </Button>
      </div>

      {advancedOpen ? (
        <div className="mt-2 grid gap-2 lg:grid-cols-[170px_170px_170px_170px_auto]">
          <SelectControl
            ariaLabel="Priority"
            onValueChange={(value) => replaceParam("priority", value, "all")}
            options={[
              { label: "All priority", value: "all" },
              { label: "Urgent", value: "urgent" },
              { label: "High", value: "high" },
              { label: "Normal", value: "normal" },
              { label: "Low", value: "low" },
            ]}
            value={viewQuery.priority}
          />
          <SelectControl
            ariaLabel="Status"
            onValueChange={(value) => replaceParam("status", value, "all")}
            options={[
              { label: "All status", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Scheduled", value: "scheduled" },
              { label: "In progress", value: "in_progress" },
              { label: "Blocked", value: "blocked" },
              { label: "Ready for review", value: "ready_for_review" },
              { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
            value={viewQuery.status}
          />
          <SelectControl
            ariaLabel="Attention filter"
            onValueChange={(value) => replaceParam("review", value, "open")}
            options={[
              { label: "Open queue", value: "open" },
              { label: "Work orders", value: "work_orders" },
              { label: "Scheduled", value: "scheduled" },
              { label: "Inspections", value: "inspections" },
              { label: "Due reminders", value: "reminders" },
              { label: "High priority", value: "high_priority" },
              { label: "High cost", value: "high_cost" },
              { label: "Recurring", value: "recurring" },
              { label: "Review completion", value: "review_completion" },
              { label: "All attention", value: "all" },
            ]}
            value={viewQuery.review}
          />
          <MonthPickerField
            ariaLabel="Report month"
            defaultValue={viewQuery.month}
            name="month"
            onValueChange={(value) => replaceParam("month", value)}
          />
          <LinkButton href={buildClearFiltersHref(pathname, searchParams)}>
            Clear
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}

function MaintenanceScopeSummary({
  flowLabel,
  listLabel,
  properties,
  recordLabel,
  summary,
  units,
  viewQuery,
}: {
  flowLabel: string;
  listLabel: string;
  properties: MaintenancePropertyOption[];
  recordLabel: string;
  summary: MaintenanceSummary;
  units: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
}) {
  const scopeLabel = getMaintenanceScopeLabel(
    viewQuery,
    properties,
    units,
    listLabel,
    recordLabel,
  );
  const facts = getMaintenanceScopeFacts(summary, viewQuery.review);

  return (
    <section className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0] text-muted">
            {flowLabel}
          </p>
          <h2 className="mt-0.5 truncate text-sm font-semibold">{scopeLabel}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <Badge key={fact.label} tone={fact.tone}>
              {fact.label} {fact.value}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}

function MaintenanceTable({
  cases,
  emptyLabel,
  fillHeight = false,
  onSelect,
  recordLabel,
  selectedTaskId,
}: {
  cases: MaintenanceCase[];
  emptyLabel: string;
  fillHeight?: boolean;
  onSelect: (taskId: string) => void;
  recordLabel: string;
  selectedTaskId: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border bg-surface",
        fillHeight && "flex h-[calc(100%-41px)] min-h-0 flex-col",
      )}
    >
      <div
        className={cn(
          "overflow-auto",
          fillHeight ? "min-h-0 flex-1" : "max-h-[min(620px,calc(100vh-350px))]",
        )}
      >
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[33%]" />
            <col className="w-[27%]" />
            <col className="w-[17%]" />
            <col className="w-[23%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">
                {capitalizeLabel(recordLabel)}
              </th>
              <th className="px-1.5 py-2.5 font-semibold">Property / Unit</th>
              <th className="px-1.5 py-2.5 font-semibold">Status</th>
              <th className="px-1.5 py-2.5 font-semibold">Owner / Vendor</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={4}>
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
            {cases.map((maintenanceCase) => (
              <tr
                className={cn(
                  previewRowClassName,
                  selectedTaskId === maintenanceCase.id &&
                    selectedPreviewRowClassName,
                  maintenanceCase.isArchived && "text-muted",
                )}
                key={maintenanceCase.id}
                onClick={() => onSelect(maintenanceCase.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(maintenanceCase.id);
                  }
                }}
                tabIndex={0}
              >
                <td className="px-2.5 py-2">
                  <p className="truncate font-medium" title={maintenanceCase.title}>
                    {maintenanceCase.title}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs text-muted",
                      maintenanceCase.progressTone === "danger" && "text-danger",
                    )}
                  >
                    Due {formatMaintenanceTableDueDate(maintenanceCase)}
                    {maintenanceCase.dueTime ? ` at ${maintenanceCase.dueTime}` : ""}
                  </p>
                  {maintenanceCase.isArchived ? (
                    <Badge className="mt-1 px-2 text-xs" tone="warning">
                      Archived
                    </Badge>
                  ) : null}
                </td>
                <td className="px-1.5 py-2">
                  <p className="truncate">{maintenanceCase.propertyLabel}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {maintenanceCase.unitLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={maintenanceCase.statusTone}>
                      {maintenanceCase.statusLabel}
                    </Badge>
                    {maintenanceCase.priorityLabel === "Normal" ? null : (
                      <Badge tone={maintenanceCase.priorityTone}>
                      {maintenanceCase.priorityLabel}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-1.5 py-2">
                  <p className="truncate">{maintenanceCase.assigneeLabel}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {maintenanceCase.vendorLabel}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MaintenanceInspector({
  actor,
  capabilities,
  maintenanceCase,
  onArchive,
  onEdit,
  onRestore,
  onStatusMessage,
}: {
  actor: MaintenanceActor;
  capabilities: MaintenanceCapabilities;
  maintenanceCase: MaintenanceCase | null;
  onArchive: (maintenanceCase: MaintenanceCase) => void;
  onEdit: (maintenanceCase: MaintenanceCase) => void;
  onRestore: (maintenanceCase: MaintenanceCase) => void;
  onStatusMessage: (message: string) => void;
}) {
  if (!maintenanceCase) {
    return (
      <aside className="bg-surface p-4">
        <h2 className="text-base font-semibold">No case selected</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Select a case to inspect its schedule, checklist, documents, and links.
        </p>
      </aside>
    );
  }

  return (
    <aside className="bg-surface">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={maintenanceCase.progressTone}>
                {maintenanceCase.progressLabel}
              </Badge>
              <Badge tone={maintenanceCase.priorityTone}>
                {maintenanceCase.priorityLabel}
              </Badge>
              {maintenanceCase.isArchived ? (
                <Badge tone="warning">Archived</Badge>
              ) : null}
            </div>
            <h2 className="mt-3 break-words text-base font-semibold">
              {maintenanceCase.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {maintenanceCase.propertyLabel} / {maintenanceCase.unitLabel}
            </p>
          </div>
          <Wrench className="shrink-0 text-muted" size={18} />
        </div>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <MaintenanceWorkflowPanel
          actor={actor}
          capabilities={capabilities}
          maintenanceCase={maintenanceCase}
          onStatusMessage={onStatusMessage}
        />
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Status">
            {maintenanceCase.statusLabel}
          </CompactFact>
          <CompactFact label="Due">{maintenanceCase.dueLabel}</CompactFact>
          <CompactFact label="Actual cost">
            {maintenanceCase.actualCostLabel}
          </CompactFact>
          <CompactFact label="Estimate">
            {maintenanceCase.costEstimateLabel}
          </CompactFact>
          <CompactFact label="Reminder">
            {maintenanceCase.reminderLabel}
          </CompactFact>
          <CompactFact label="Branch">
            {maintenanceCase.branchLabel}
          </CompactFact>
          <CompactFact label="Assignee">
            {maintenanceCase.assigneeLabel}
          </CompactFact>
          <CompactFact label="Vendor">
            {maintenanceCase.vendorLabel}
          </CompactFact>
        </div>

        <LinkGrid maintenanceCase={maintenanceCase} />

        <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Checklist</p>
            <Badge tone={maintenanceCase.checklistDoneCount === maintenanceCase.checklistTotalCount && maintenanceCase.checklistTotalCount > 0 ? "success" : "neutral"}>
              {maintenanceCase.checklistDoneCount}/{maintenanceCase.checklistTotalCount}
            </Badge>
          </div>
          <div className="mt-2 space-y-1.5">
            {maintenanceCase.checklist.length === 0 ? (
              <p className="text-muted">No checklist items.</p>
            ) : (
              maintenanceCase.checklist.map((item) => (
                <div className="flex items-start gap-2" key={item.id}>
                  {item.completed ? (
                    <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={14} />
                  ) : (
                    <ListChecks className="mt-0.5 shrink-0 text-muted" size={14} />
                  )}
                  <span className={cn(item.completed && "text-muted line-through")}>
                    {item.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {maintenanceCase.description ? (
          <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
            <p className="font-semibold">Notes</p>
            <p className="mt-1 leading-6 text-muted">{maintenanceCase.description}</p>
          </div>
        ) : null}

        {maintenanceCase.activity.length > 0 ? (
          <div className="rounded-md border border-border bg-surface-muted/70 px-3 py-2.5">
            <p className="font-semibold">Activity</p>
            <div className="mt-2 divide-y divide-border">
              {maintenanceCase.activity.slice(0, 6).map((change) => (
                <div className="py-2 first:pt-0 last:pb-0" key={change.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{change.actionLabel}</p>
                    <span className="shrink-0 text-xs text-muted">
                      {formatActivityDate(change.createdAt)}
                    </span>
                  </div>
                  {change.details.length > 0 ? (
                    <div className="mt-1 space-y-1 text-xs text-muted">
                      {change.details.map((detail) => (
                        <p key={`${change.id}-${detail.field}`}>
                          <span className="font-medium text-foreground">{detail.field}:</span>{" "}
                          {detail.after}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!capabilities.canEditCaseStructure && !capabilities.canArchiveCase ? null : maintenanceCase.isArchived ? (
          capabilities.canArchiveCase ? (
            <Button onClick={() => onRestore(maintenanceCase)} type="button">
              <RotateCcw size={15} />
              Restore
            </Button>
          ) : null
        ) : (
          <div
            className={cn(
              "grid gap-2",
              capabilities.canArchiveCase ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            {capabilities.canEditCaseStructure ? (
              <>
                <Button onClick={() => onEdit(maintenanceCase)} type="button">
                  <Pencil size={15} />
                  Edit
                </Button>
                {capabilities.canUploadMaintenanceEvidence && maintenanceCase.hrefs.documentUpload ? (
                  <LinkButton href={maintenanceCase.hrefs.documentUpload}>
                    <FileText size={15} />
                    Upload doc
                  </LinkButton>
                ) : null}
              </>
            ) : null}
            {capabilities.canArchiveCase ? (
              <Button
                className="text-danger hover:text-danger"
                onClick={() => onArchive(maintenanceCase)}
                type="button"
                variant="ghost"
              >
                <Archive size={15} />
                Archive
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function getDrawerTitle(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "New maintenance case";
  }

  if (drawer.mode === "edit") {
    return "Edit maintenance case";
  }

  return drawer.mode === "archive"
    ? "Archive maintenance case"
    : "Restore maintenance case";
}

function getDrawerDescription(drawer: DrawerState) {
  if (drawer.mode === "create") {
    return "Create a maintenance case and schedule the operating record.";
  }

  if (drawer.mode === "edit") {
    return "Update status, checklist, cost, and linked operating records.";
  }

  return drawer.mode === "archive"
    ? "Hide this case from active views without deleting its history."
    : "Return this case to active maintenance workflows.";
}

function LinkGrid({ maintenanceCase }: { maintenanceCase: MaintenanceCase }) {
  const links = [
    maintenanceCase.hrefs.property
      ? {
          href: maintenanceCase.hrefs.property,
          icon: <Wrench size={14} />,
          label: "Property",
        }
      : null,
    maintenanceCase.hrefs.unit
      ? {
          href: maintenanceCase.hrefs.unit,
          icon: <Wrench size={14} />,
          label: "Unit",
        }
      : null,
    maintenanceCase.hrefs.timeline
      ? {
          href: maintenanceCase.hrefs.timeline,
          icon: <ListChecks size={14} />,
          label: "Timeline",
        }
      : null,
    maintenanceCase.hrefs.ledger
      ? {
          href: maintenanceCase.hrefs.ledger,
          icon: <Landmark size={14} />,
          label: "Ledger",
        }
      : null,
    maintenanceCase.hrefs.documents
      ? {
          href: maintenanceCase.hrefs.documents,
          icon: <FileText size={14} />,
          label: `Documents (${maintenanceCase.documents.length})`,
        }
      : null,
    maintenanceCase.hrefs.vendor
      ? {
          href: maintenanceCase.hrefs.vendor,
          icon: <ClipboardCheck size={14} />,
          label: "Vendor",
        }
      : null,
    maintenanceCase.hrefs.assignee
      ? {
          href: maintenanceCase.hrefs.assignee,
          icon: <ClipboardCheck size={14} />,
          label: "Assignee",
        }
      : null,
  ].filter(Boolean) as Array<{ href: string; icon: ReactNode; label: string }>;

  return (
    <div className="grid grid-cols-2 gap-2">
      {links.map((link) => (
        <LinkButton href={link.href} key={link.label}>
          {link.icon}
          {link.label}
        </LinkButton>
      ))}
    </div>
  );
}

export function MaintenanceForm({
  actor,
  branches,
  canPostMaintenanceCost,
  canRecordActualCost,
  initialValues,
  maintenanceCase,
  mode,
  onClose,
  onSuccess,
  properties,
  staff,
  units,
  vendors,
}: {
  actor: MaintenanceActor;
  branches: MaintenanceBranchOption[];
  canPostMaintenanceCost: boolean;
  canRecordActualCost: boolean;
  initialValues?: Partial<MaintenanceCase["formValues"]>;
  maintenanceCase?: MaintenanceCase;
  mode: "create" | "edit";
  onClose: () => void;
  onSuccess: (message: string) => void;
  properties: MaintenancePropertyOption[];
  staff: MaintenanceAssigneeOption[];
  units: MaintenanceUnitOption[];
  vendors: MaintenanceVendorOption[];
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createMaintenanceCaseAction : updateMaintenanceCaseAction,
    initialState,
  );
  const defaults = {
    actualCostAmount:
      maintenanceCase?.formValues.actualCostAmount ?? initialValues?.actualCostAmount ?? "",
    assigneePersonId:
      maintenanceCase?.formValues.assigneePersonId ??
      initialValues?.assigneePersonId ??
      "",
    branchId:
      maintenanceCase?.formValues.branchId ??
      initialValues?.branchId ??
      (actor.role === "manager" ? actor.branchId : undefined) ??
      "",
    category: maintenanceCase?.formValues.category ?? initialValues?.category ?? "General",
    checklistText:
      maintenanceCase?.formValues.checklistText ?? initialValues?.checklistText ?? "",
    costEstimateAmount:
      maintenanceCase?.formValues.costEstimateAmount ??
      initialValues?.costEstimateAmount ??
      "",
    description:
      maintenanceCase?.formValues.description ?? initialValues?.description ?? "",
    dueDate: maintenanceCase?.formValues.dueDate ?? initialValues?.dueDate ?? "",
    dueTime: maintenanceCase?.formValues.dueTime ?? initialValues?.dueTime ?? "",
    priority: maintenanceCase?.formValues.priority ?? initialValues?.priority ?? "normal",
    propertyId:
      maintenanceCase?.formValues.propertyId ?? initialValues?.propertyId ?? "",
    recurrenceFrequency:
      maintenanceCase?.formValues.recurrenceFrequency ??
      initialValues?.recurrenceFrequency ??
      "none",
    reminderDate:
      maintenanceCase?.formValues.reminderDate ?? initialValues?.reminderDate ?? "",
    reminderTime:
      maintenanceCase?.formValues.reminderTime ?? initialValues?.reminderTime ?? "",
    status: maintenanceCase?.formValues.status ?? initialValues?.status ?? "pending",
    title: maintenanceCase?.formValues.title ?? initialValues?.title ?? "",
    unitId: maintenanceCase?.formValues.unitId ?? initialValues?.unitId ?? "",
    vendorPersonId:
      maintenanceCase?.formValues.vendorPersonId ?? initialValues?.vendorPersonId ?? "",
  };
  const [propertyId, setPropertyId] = useState(defaults.propertyId);
  const [unitId, setUnitId] = useState(defaults.unitId ?? "");
  const [branchId, setBranchId] = useState(defaults.branchId ?? "");
  const [assigneePersonId, setAssigneePersonId] = useState(
    defaults.assigneePersonId ?? "",
  );
  const visibleUnits = units.filter((unit) => unit.propertyId === propertyId);
  const compatibleStaff = staff.filter(
    (person) => (person.branchId ?? "") === branchId,
  );
  const legacyAssignee = maintenanceCase?.executionMode === "manager_coordinated" &&
    Boolean(defaults.assigneePersonId) &&
    !compatibleStaff.some((person) => person.id === defaults.assigneePersonId)
      ? {
          id: defaults.assigneePersonId,
          label: `${maintenanceCase.assigneeLabel} (offline assignment)`,
        }
      : undefined;
  const vendorSelect = getMaintenanceVendorSelectOptions({
    currentVendorId: defaults.vendorPersonId,
    currentVendorLabel: maintenanceCase?.vendorLabel,
    vendors,
  });
  const managerBranch = actor.role === "manager" && actor.branchId
    ? branches.find((branch) => branch.id === actor.branchId)
    : undefined;
  const branchControlMode = getMaintenanceBranchControlMode(actor);

  useEffect(() => {
    if (state.status === "success") {
      onSuccess(state.message ?? "Maintenance case saved.");
      onClose();
    }
  }, [onClose, onSuccess, state.message, state.status]);

  return (
    <form action={action} className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {maintenanceCase ? (
          <input name="taskId" type="hidden" value={maintenanceCase.id} />
        ) : null}

        <Field label="Title" error={state.fieldErrors?.title?.[0]}>
          <Input defaultValue={defaults.title} name="title" required />
        </Field>

        <Field label="Category" error={state.fieldErrors?.category?.[0]}>
          <Input defaultValue={defaults.category} name="category" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch" error={state.fieldErrors?.branchId?.[0]}>
            {branchControlMode === "fixed" && actor.branchId ? (
              <>
                <input name="branchId" type="hidden" value={actor.branchId} />
                <div className="flex h-8 items-center rounded-md border border-border bg-surface-muted px-2.5 text-[13px]">
                  {managerBranch?.label ?? maintenanceCase?.branchLabel ?? "Assigned branch"}
                </div>
              </>
            ) : (
              <>
                {branchControlMode === "all_branches" ? (
                  <p className="mb-1.5 text-xs text-muted">All branches access</p>
                ) : null}
                <SelectControl
                  ariaLabel="Branch"
                  name="branchId"
                  onValueChange={(value) => {
                    setBranchId(value);
                    if (!staff.some((person) => person.id === assigneePersonId && (person.branchId ?? "") === value)) {
                      setAssigneePersonId("");
                    }
                  }}
                  options={[
                    { label: "No branch", value: "" },
                    ...branches.map((branch) => ({
                      label: branch.label,
                      value: branch.id,
                    })),
                  ]}
                  value={branchId}
                />
              </>
            )}
          </Field>
          <Field label="Assignee" error={state.fieldErrors?.assigneePersonId?.[0]}>
            <SelectControl
              ariaLabel="Assignee"
              name="assigneePersonId"
              onValueChange={setAssigneePersonId}
              options={[
                { label: "Unassigned", value: "" },
                ...(legacyAssignee ? [{
                  disabled: true,
                  label: legacyAssignee.label,
                  value: legacyAssignee.id,
                }] : []),
                ...compatibleStaff.map((person) => ({
                  label: person.label,
                  value: person.id,
                })),
              ]}
              value={assigneePersonId}
            />
            {legacyAssignee ? (
              <p className="mt-1.5 text-xs text-muted">
                This historical assignee has no executable Nestory member identity. The task remains manager-coordinated until reassigned.
              </p>
            ) : null}
          </Field>
        </div>

        <Field label="Vendor" error={state.fieldErrors?.vendorPersonId?.[0]}>
          <SelectControl
            ariaLabel="Vendor"
            defaultValue={defaults.vendorPersonId ?? ""}
            name="vendorPersonId"
            options={vendorSelect.options}
          />
          {vendorSelect.hasHistoricalVendor ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">
              This historical vendor remains linked for this edit. Keep it unchanged,
              or choose an active vendor or &quot;No vendor&quot; to clear the link.
            </p>
          ) : null}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue={defaults.status}
              name="status"
              options={mode === "create"
                ? [
                    { label: "Pending", value: "pending" },
                    { label: "Scheduled", value: "scheduled" },
                  ]
                : MAINTENANCE_STATUS_OPTIONS.filter((option) =>
                    canTransitionMaintenanceStatus(
                      defaults.status,
                      option.value,
                      {
                        actorRole: actor.role,
                        executionMode: maintenanceCase?.executionMode ?? "manager_coordinated",
                      },
                    ),
                  )}
            />
          </Field>
          <Field label="Priority" error={state.fieldErrors?.priority?.[0]}>
            <SelectControl
              ariaLabel="Priority"
              defaultValue={defaults.priority}
              name="priority"
              options={[
                { label: "Low", value: "low" },
                { label: "Normal", value: "normal" },
                { label: "High", value: "high" },
                { label: "Urgent", value: "urgent" },
              ]}
            />
          </Field>
          <Field label="Recurrence" error={state.fieldErrors?.recurrenceFrequency?.[0]}>
            <SelectControl
              ariaLabel="Recurrence"
              defaultValue={defaults.recurrenceFrequency}
              name="recurrenceFrequency"
              options={[
                { label: "One-time", value: "none" },
                { label: "Weekly", value: "weekly" },
                { label: "Monthly", value: "monthly" },
                { label: "Quarterly", value: "quarterly" },
                { label: "Semi-annual", value: "semi_annual" },
                { label: "Annual", value: "annual" },
              ]}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date" error={state.fieldErrors?.dueDate?.[0]}>
            <DatePickerField
              ariaLabel="Due date"
              defaultValue={defaults.dueDate ?? ""}
              name="dueDate"
            />
          </Field>
          <Field label="Due time" error={state.fieldErrors?.dueTime?.[0]}>
            <TimePickerField
              ariaLabel="Due time"
              defaultValue={defaults.dueTime ?? ""}
              name="dueTime"
            />
          </Field>
          <Field label="Reminder date" error={state.fieldErrors?.reminderDate?.[0]}>
            <DatePickerField
              ariaLabel="Reminder date"
              defaultValue={defaults.reminderDate ?? ""}
              name="reminderDate"
            />
          </Field>
          <Field label="Reminder time" error={state.fieldErrors?.reminderTime?.[0]}>
            <TimePickerField
              ariaLabel="Reminder time"
              defaultValue={defaults.reminderTime ?? ""}
              name="reminderTime"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cost estimate" error={state.fieldErrors?.costEstimateAmount?.[0]}>
            <NumberInput
              defaultValue={defaults.costEstimateAmount ?? ""}
              min="0"
              name="costEstimateAmount"
              step="0.01"
            />
          </Field>
          {mode === "edit" && canRecordActualCost ? (
            <Field label="Actual cost" error={state.fieldErrors?.actualCostAmount?.[0]}>
              <NumberInput
                defaultValue={defaults.actualCostAmount ?? ""}
                min="0"
                name="actualCostAmount"
                step="0.01"
              />
            </Field>
          ) : null}
        </div>

        {mode === "edit" && canPostMaintenanceCost ? (
          <label className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/70 px-3 py-2 text-sm">
            <CheckboxControl
              className="mt-1"
              defaultChecked={Boolean(
                maintenanceCase?.actualCostAmount && !maintenanceCase.ledgerEntryId,
              )}
              name="linkActualCostToLedger"
            />
            <span>
              <span className="block font-medium">Link actual cost to ledger</span>
              <span className="mt-0.5 block text-xs text-muted">
                Creates or updates the maintenance expense row when actual cost is present.
              </span>
            </span>
          </label>
        ) : null}

        <Field label="Description" error={state.fieldErrors?.description?.[0]}>
          <Textarea
            defaultValue={defaults.description ?? ""}
            name="description"
          />
        </Field>

        <ChecklistEditor
          error={state.fieldErrors?.checklistText?.[0]}
          value={defaults.checklistText}
        />

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
            <Wrench size={15} />
            {pending ? "Saving..." : mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function getHistoricalVendorLabel(label?: string) {
  const baseLabel = label && label !== "No vendor" ? label : "Historical vendor";

  return baseLabel.endsWith("(historical/inactive)")
    ? baseLabel
    : `${baseLabel} (historical/inactive)`;
}

export function getMaintenanceVendorSelectOptions({
  currentVendorId,
  currentVendorLabel,
  vendors,
}: {
  currentVendorId?: string | null;
  currentVendorLabel?: string;
  vendors: MaintenanceVendorOption[];
}): {
  hasHistoricalVendor: boolean;
  options: SelectControlOption[];
} {
  const hasHistoricalVendor = Boolean(currentVendorId) &&
    !vendors.some((vendor) => vendor.id === currentVendorId);

  return {
    hasHistoricalVendor,
    options: [
      { label: "No vendor", value: "" },
      ...(hasHistoricalVendor && currentVendorId
        ? [{
            label: getHistoricalVendorLabel(currentVendorLabel),
            value: currentVendorId,
          }]
        : []),
      ...vendors.map((vendor) => ({
        label: vendor.label,
        value: vendor.id,
      })),
    ],
  };
}

function CompactFact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 break-words font-medium">{children}</div>
    </div>
  );
}

function LinkButton({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium transition-colors hover:bg-surface-muted"
      href={href}
      prefetch={false}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
        {children}
      </span>
    </Link>
  );
}

function ChecklistEditor({
  error,
  value,
}: {
  error?: string;
  value: string;
}) {
  const [items, setItems] = useState<MaintenanceChecklistItem[]>(() => {
    const parsed = parseMaintenanceChecklistText(value);

    return parsed.length > 0 ? parsed : [newChecklistItem()];
  });
  const checklistText = formatMaintenanceChecklistText(items);

  function updateItem(
    id: string,
    patch: Partial<Pick<MaintenanceChecklistItem, "completed" | "label">>,
  ) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(id: string) {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);

      return next.length > 0 ? next : [newChecklistItem()];
    });
  }

  return (
    <div className="block text-sm font-medium">
      <input name="checklistText" readOnly type="hidden" value={checklistText} />
      <div className="flex items-center justify-between gap-2">
        <span>Checklist</span>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium transition-colors hover:bg-surface-muted"
          onClick={() => setItems((current) => [...current, newChecklistItem()])}
          type="button"
        >
          <Plus size={14} />
          Add item
        </button>
      </div>
      <div className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {items.map((item, index) => (
          <div className="flex items-center gap-2 px-2.5 py-2" key={item.id}>
            <CheckboxControl
              aria-label={`Complete checklist item ${index + 1}`}
              checked={item.completed}
              onCheckedChange={(checked) =>
                updateItem(item.id, { completed: checked === true })
              }
            />
            <Input
              className={cn(
                "h-8 min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus:border-transparent focus:ring-0",
                item.completed && "text-muted line-through",
              )}
              onChange={(event) =>
                updateItem(item.id, { label: event.currentTarget.value })
              }
              placeholder="Checklist item"
              value={item.label}
            />
            <button
              aria-label="Remove checklist item"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              onClick={() => removeItem(item.id)}
              title="Remove checklist item"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function newChecklistItem(): MaintenanceChecklistItem {
  return {
    completed: false,
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: "",
  };
}

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
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

function getCreateInitialValues(
  viewQuery: MaintenanceViewQuery,
  properties: MaintenancePropertyOption[],
  units: MaintenanceUnitOption[],
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

function applyMaintenanceStatusOverrides(
  cases: MaintenanceCase[],
  overrides: Map<string, MaintenanceStatus>,
) {
  if (overrides.size === 0) {
    return cases;
  }

  return cases.map((maintenanceCase) => {
    const status = overrides.get(maintenanceCase.id);

    if (!status) {
      return maintenanceCase;
    }

    return {
      ...maintenanceCase,
      isOpen: status !== "completed" && status !== "cancelled",
      progressLabel: getOptimisticStatusLabel(status),
      progressTone: getOptimisticStatusTone(status),
      status,
      statusLabel: getOptimisticStatusLabel(status),
      statusTone: getOptimisticStatusTone(status),
    };
  });
}

function getOptimisticStatusLabel(status: MaintenanceStatus) {
  if (status === "in_progress") {
    return "In Progress";
  }

  if (status === "ready_for_review") {
    return "Ready for review";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getOptimisticStatusTone(status: MaintenanceStatus): MaintenanceBadgeTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "blocked" || status === "cancelled" || status === "ready_for_review") {
    return "warning";
  }

  if (status === "in_progress") {
    return "accent";
  }

  return "neutral";
}

function formatMaintenanceTableDueDate(maintenanceCase: MaintenanceCase) {
  if (!maintenanceCase.dueDate) {
    return maintenanceCase.dueLabel;
  }

  const [year, month, day] = maintenanceCase.dueDate.split("-").map(Number);
  if (!year || !month || !day) {
    return maintenanceCase.dueLabel;
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const MAINTENANCE_TABS = [
  { label: "Open", review: "open" },
  { label: "Review completion", review: "review_completion" },
  { label: "Overdue", review: "overdue" },
  { label: "Upcoming", review: "upcoming" },
  { label: "Completed", review: "completed" },
  { label: "All", review: "all" },
] satisfies Array<{
  label: string;
  review: MaintenanceViewQuery["review"];
}>;

const MAINTENANCE_CASE_VIEW_TABS = [
  { icon: ListChecks, id: "list", label: "List" },
  { icon: Columns3, id: "board", label: "Board" },
  { icon: CalendarClock, id: "calendar", label: "Calendar" },
] satisfies Array<{
  icon: typeof ListChecks;
  id: Extract<MaintenanceViewQuery["view"], "board" | "calendar" | "list">;
  label: string;
}>;

const MAINTENANCE_SAVED_VIEW_TABS = [
  { label: "Inbox", review: "open", summaryKey: "open" },
  { label: "Review", review: "review_completion", summaryKey: "readyForReview" },
  { label: "Overdue", review: "overdue", summaryKey: "overdue" },
  { label: "Upcoming", review: "upcoming", summaryKey: "upcoming" },
  { label: "Completed", review: "completed", summaryKey: "completed" },
  { label: "All", review: "all", summaryKey: "total" },
] satisfies Array<{
  label: string;
  review: MaintenanceViewQuery["review"];
  summaryKey: keyof Pick<
    MaintenanceSummary,
    "completed" | "open" | "overdue" | "readyForReview" | "total" | "upcoming"
  >;
}>;

function getMaintenanceSavedViewTabs(
  pathname: string,
  searchParams: { toString(): string },
  viewQuery: MaintenanceViewQuery,
  summary: MaintenanceSummary,
) {
  return MAINTENANCE_SAVED_VIEW_TABS.map((tab) => ({
    ...tab,
    active:
      viewQuery.view === "list" &&
      viewQuery.status === "all" &&
      viewQuery.review === tab.review,
    href: buildMaintenanceSavedViewHref(pathname, searchParams, tab.review),
    label: `${tab.label} ${summary[tab.summaryKey]}`,
  }));
}

function getMaintenanceCasesViewTabs(
  pathname: string,
  searchParams: { toString(): string },
  viewQuery: MaintenanceViewQuery,
) {
  return MAINTENANCE_CASE_VIEW_TABS.map((tab) => ({
    ...tab,
    active: viewQuery.view === tab.id,
    href: buildMaintenanceCasesViewHref(pathname, searchParams, tab.id),
  }));
}

function getMaintenanceTabs(
  pathname: string,
  searchParams: { toString(): string },
  viewQuery: MaintenanceViewQuery,
) {
  return MAINTENANCE_TABS.map((tab) => ({
    ...tab,
    active: viewQuery.status === "all" && viewQuery.review === tab.review,
    href: buildMaintenanceTabHref(pathname, searchParams, tab.review),
    id: tab.review,
  }));
}

function getAdvancedFilterCount(
  viewQuery: MaintenanceViewQuery,
  baseReview: MaintenanceViewQuery["review"],
) {
  let count = 0;

  if (viewQuery.priority !== "all") {
    count += 1;
  }

  if (viewQuery.status !== "all") {
    count += 1;
  }

  if (
    viewQuery.review !== baseReview &&
    [
      "reminders",
      "scheduled",
      "work_orders",
      "inspections",
      "high_priority",
      "high_cost",
      "recurring",
    ].includes(viewQuery.review)
  ) {
    count += 1;
  }

  return count;
}

function getScopeOptions(
  properties: MaintenancePropertyOption[],
  units: MaintenanceUnitOption[],
  listLabel: string,
) {
  return [
    { label: `All ${listLabel}`, value: "all" },
    ...properties.map((property) => ({
      label: `Property - ${property.label}`,
      value: `property:${property.id}`,
    })),
    ...units.map((unit) => ({
      label: `Unit - ${unit.label}`,
      value: `unit:${unit.id}`,
    })),
  ];
}

function getScopeValue(viewQuery: MaintenanceViewQuery) {
  if (viewQuery.unitId !== "all") {
    return `unit:${viewQuery.unitId}`;
  }

  if (viewQuery.propertyId !== "all") {
    return `property:${viewQuery.propertyId}`;
  }

  return "all";
}

function getMaintenanceScopeLabel(
  viewQuery: MaintenanceViewQuery,
  properties: MaintenancePropertyOption[],
  units: MaintenanceUnitOption[],
  listLabel: string,
  recordLabel: string,
) {
  if (viewQuery.taskId !== "all") {
    return `Selected ${recordLabel}`;
  }

  if (viewQuery.unitId !== "all") {
    return units.find((unit) => unit.id === viewQuery.unitId)?.label ?? "Selected unit";
  }

  if (viewQuery.propertyId !== "all") {
    return (
      properties.find((property) => property.id === viewQuery.propertyId)?.label ??
      "Selected property"
    );
  }

  return `All ${listLabel}`;
}

function getMaintenanceScopeFacts(
  summary: MaintenanceSummary,
  review: MaintenanceViewQuery["review"],
): MaintenanceScopeFact[] {
  const common: Record<string, MaintenanceScopeFact> = {
    blocked: {
      label: "Blocked",
      tone: summary.blocked > 0 ? "danger" : "neutral",
      value: summary.blocked,
    },
    completed: { label: "Completed", tone: "success", value: summary.completed },
    highCost: {
      label: "High cost",
      tone: summary.highCost > 0 ? "warning" : "neutral",
      value: summary.highCost,
    },
    inProgress: {
      label: "In progress",
      tone: summary.inProgress > 0 ? "accent" : "neutral",
      value: summary.inProgress,
    },
    overdue: {
      label: "Overdue",
      tone: summary.overdue > 0 ? "danger" : "success",
      value: summary.overdue,
    },
    pending: {
      label: "Pending",
      tone: summary.pending > 0 ? "warning" : "neutral",
      value: summary.pending,
    },
    reminders: {
      label: "Reminders",
      tone: summary.reminderDue > 0 ? "danger" : "neutral",
      value: summary.reminderDue,
    },
    reviewCompletion: {
      label: "Ready for review",
      tone: summary.readyForReview > 0 ? "warning" : "neutral",
      value: summary.readyForReview,
    },
    scheduled: {
      label: "Scheduled",
      tone: summary.scheduled > 0 ? "accent" : "neutral",
      value: summary.scheduled,
    },
    total: { label: "Total", tone: "neutral", value: summary.total },
    upcoming: {
      label: "Upcoming",
      tone: summary.upcoming > 0 ? "warning" : "neutral",
      value: summary.upcoming,
    },
  };

  if (review === "work_orders") {
    return [
      common.total,
      common.scheduled,
      common.inProgress,
      common.blocked,
      common.overdue,
    ];
  }

  if (review === "scheduled") {
    return [
      common.total,
      common.overdue,
      common.upcoming,
      common.reminders,
      common.completed,
    ];
  }

  if (review === "inspections") {
    return [
      common.total,
      common.pending,
      common.inProgress,
      common.overdue,
      common.completed,
    ];
  }

  if (review === "recurring") {
    return [
      common.total,
      common.upcoming,
      common.inProgress,
      common.overdue,
      common.completed,
    ];
  }

  if (review === "review_completion") {
    return [
      common.reviewCompletion,
      common.total,
      common.highCost,
      common.completed,
    ];
  }

  return [
    common.total,
    common.pending,
    common.inProgress,
    common.reviewCompletion,
    common.overdue,
    common.upcoming,
    common.completed,
    common.highCost,
  ];
}

function capitalizeLabel(label: string) {
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

function formatActivityDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
