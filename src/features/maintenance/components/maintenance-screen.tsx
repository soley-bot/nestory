"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Landmark,
  ListChecks,
  Pencil,
  Plus,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import {
  previewRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";
import { PaginationControls } from "@/components/data/pagination-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordPreviewDrawer } from "@/components/ui/record-preview-drawer";
import { SelectControl } from "@/components/ui/select-control";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  createMaintenanceCaseAction,
  type MaintenanceActionState,
  updateMaintenanceCaseAction,
} from "@/features/maintenance/actions";
import type {
  MaintenanceCase,
  MaintenancePagination,
  MaintenancePersonOption,
  MaintenancePropertyOption,
  MaintenanceSummary,
  MaintenanceUnitOption,
  MaintenanceViewQuery,
} from "@/features/maintenance/maintenance.types";
import { cn } from "@/lib/utils";

const initialState: MaintenanceActionState = {};

type DrawerState =
  | {
      initialValues?: Partial<MaintenanceCase["formValues"]>;
      mode: "create";
    }
  | {
      maintenanceCase: MaintenanceCase;
      mode: "edit";
    };

type MaintenanceScreenProps = {
  cases: MaintenanceCase[];
  initialTaskId?: string;
  pagination: MaintenancePagination;
  peopleOptions: MaintenancePersonOption[];
  propertyOptions: MaintenancePropertyOption[];
  summary: MaintenanceSummary;
  unitOptions: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
};

export function MaintenanceScreen({
  cases,
  initialTaskId,
  pagination,
  peopleOptions,
  propertyOptions,
  summary,
  unitOptions,
  viewQuery,
}: MaintenanceScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createInitialValues = useMemo(
    () => getCreateInitialValues(viewQuery, propertyOptions, unitOptions),
    [propertyOptions, unitOptions, viewQuery],
  );
  const [drawer, setDrawer] = useState<DrawerState | null>(() =>
    searchParams.get("action") === "create"
      ? { initialValues: createInitialValues, mode: "create" }
      : null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState(
    initialTaskId ?? cases[0]?.id ?? "",
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const selectedCase =
    cases.find((maintenanceCase) => maintenanceCase.id === selectedTaskId) ??
    cases[0] ??
    null;

  useEffect(() => {
    if (initialTaskId) {
      queueMicrotask(() => {
        setSelectedTaskId(initialTaskId);
        setPreviewOpen(true);
      });
    }
  }, [initialTaskId]);

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

  function openDrawer(nextDrawer: DrawerState) {
    setPreviewOpen(false);
    setStatusMessage(null);
    setDrawer(nextDrawer);
  }

  function previewCase(taskId: string) {
    setSelectedTaskId(taskId);
    setPreviewOpen(true);
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        actions={
          <Button
            onClick={() =>
              openDrawer({ initialValues: createInitialValues, mode: "create" })
            }
            variant="primary"
          >
            <Plus size={15} />
            New case
          </Button>
        }
        description="Open work orders, scheduled repairs, and unit/property maintenance history."
        title="Maintenance"
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

      {summary.reminderDue > 0 ? (
        <div className="px-4 pt-4 sm:px-6 lg:px-6">
          <Link
            className="flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-foreground"
            href={buildFilterHref(pathname, searchParams, {
              review: "reminders",
            })}
            prefetch={false}
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarClock className="shrink-0 text-danger" size={15} />
              <span className="truncate">
                {summary.reminderDue} reminder{summary.reminderDue === 1 ? "" : "s"} due now
              </span>
            </span>
            <ExternalLink size={13} />
          </Link>
        </div>
      ) : null}

      <MaintenanceFilters
        properties={propertyOptions}
        units={unitOptions}
        viewQuery={viewQuery}
      />

      <main className="space-y-3 px-4 py-4 sm:px-6 lg:px-6 lg:py-4">
        <MaintenanceScopeSummary
          properties={propertyOptions}
          summary={summary}
          units={unitOptions}
          viewQuery={viewQuery}
        />
        <div className="space-y-0">
          <MaintenanceTable
            cases={cases}
            onSelect={previewCase}
            selectedTaskId={selectedCase?.id ?? ""}
          />
          <PaginationControls attached pagination={pagination} />
        </div>
      </main>

      <RecordPreviewDrawer
        onClose={() => setPreviewOpen(false)}
        open={previewOpen && Boolean(selectedCase)}
        title="Maintenance case"
      >
        <MaintenanceInspector
          maintenanceCase={selectedCase}
          onEdit={(maintenanceCase) =>
            openDrawer({ maintenanceCase, mode: "edit" })
          }
        />
      </RecordPreviewDrawer>

      {drawer ? (
        <SideDrawer
          description={
            drawer.mode === "create"
              ? "Create a maintenance case and schedule the operating record."
              : "Update status, checklist, cost, and linked operating records."
          }
          onClose={() => setDrawer(null)}
          open
          title={drawer.mode === "create" ? "New maintenance case" : "Edit maintenance case"}
        >
          <MaintenanceForm
            initialValues={
              drawer.mode === "create" ? drawer.initialValues : undefined
            }
            maintenanceCase={
              drawer.mode === "edit" ? drawer.maintenanceCase : undefined
            }
            mode={drawer.mode}
            onClose={() => setDrawer(null)}
            onSuccess={setStatusMessage}
            people={peopleOptions}
            properties={propertyOptions}
            units={unitOptions}
          />
        </SideDrawer>
      ) : null}
    </div>
  );
}

function MaintenanceFilters({
  properties,
  units,
  viewQuery,
}: {
  properties: MaintenancePropertyOption[];
  units: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const advancedFilterCount = getAdvancedFilterCount(viewQuery);
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);
  const scopeOptions = getScopeOptions(properties, units);

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

      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
        <Input
          defaultValue={viewQuery.query}
          onBlur={(event) => replaceParam("query", event.currentTarget.value)}
          placeholder="Search cases..."
          type="search"
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
              { label: "Due reminders", value: "reminders" },
              { label: "High priority", value: "high_priority" },
              { label: "High cost", value: "high_cost" },
              { label: "Recurring", value: "recurring" },
              { label: "All attention", value: "all" },
            ]}
            value={viewQuery.review}
          />
          <Input
            aria-label="Report month"
            defaultValue={viewQuery.month}
            onBlur={(event) => replaceParam("month", event.currentTarget.value)}
            type="month"
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
  properties,
  summary,
  units,
  viewQuery,
}: {
  properties: MaintenancePropertyOption[];
  summary: MaintenanceSummary;
  units: MaintenanceUnitOption[];
  viewQuery: MaintenanceViewQuery;
}) {
  const scopeLabel = getMaintenanceScopeLabel(viewQuery, properties, units);
  const facts = [
    { label: "Total", tone: "neutral", value: summary.total },
    { label: "Open", tone: summary.open > 0 ? "accent" : "success", value: summary.open },
    {
      label: "Overdue",
      tone: summary.overdue > 0 ? "danger" : "success",
      value: summary.overdue,
    },
    {
      label: "Upcoming",
      tone: summary.upcoming > 0 ? "warning" : "neutral",
      value: summary.upcoming,
    },
    {
      label: "High cost",
      tone: summary.highCost > 0 ? "warning" : "neutral",
      value: summary.highCost,
    },
  ] satisfies Array<{
    label: string;
    tone: "accent" | "danger" | "neutral" | "success" | "warning";
    value: number;
  }>;

  return (
    <section className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0] text-muted">
            Current scope
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
  onSelect,
  selectedTaskId,
}: {
  cases: MaintenanceCase[];
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="max-h-[min(620px,calc(100vh-350px))] overflow-auto">
        <table className="w-full min-w-[1120px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            <col className="w-[27%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-muted text-[11px] uppercase tracking-[0] text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="px-2.5 py-2.5 font-semibold">Case</th>
              <th className="px-1.5 py-2.5 font-semibold">Property / Unit</th>
              <th className="px-1.5 py-2.5 font-semibold">Category</th>
              <th className="px-1.5 py-2.5 font-semibold">Status</th>
              <th className="px-1.5 py-2.5 font-semibold">Due / Reminder</th>
              <th className="px-1.5 py-2.5 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={6}>
                  No maintenance cases found.
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
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {maintenanceCase.vendorLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <p className="truncate">{maintenanceCase.propertyLabel}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {maintenanceCase.unitLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <p className="truncate">{maintenanceCase.category}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {maintenanceCase.recurrenceLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={maintenanceCase.statusTone}>
                      {maintenanceCase.statusLabel}
                    </Badge>
                    <Badge tone={maintenanceCase.priorityTone}>
                      {maintenanceCase.priorityLabel}
                    </Badge>
                    <Badge tone={maintenanceCase.progressTone}>
                      {maintenanceCase.progressLabel}
                    </Badge>
                  </div>
                </td>
                <td className="px-1.5 py-2">
                  <p className="truncate">{maintenanceCase.dueLabel}</p>
                  <p
                    className={cn(
                      "mt-0.5 truncate text-xs",
                      maintenanceCase.isReminderDue ? "text-danger" : "text-muted",
                    )}
                  >
                    {maintenanceCase.reminderLabel}
                  </p>
                </td>
                <td className="px-1.5 py-2 text-right">
                  <p className="font-medium">{maintenanceCase.actualCostLabel}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Est. {maintenanceCase.costEstimateLabel}
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

function MaintenanceInspector({
  maintenanceCase,
  onEdit,
}: {
  maintenanceCase: MaintenanceCase | null;
  onEdit: (maintenanceCase: MaintenanceCase) => void;
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
        <div className="grid grid-cols-2 gap-3">
          <CompactFact label="Status">
            {maintenanceCase.statusLabel}
          </CompactFact>
          <CompactFact label="Due">{maintenanceCase.dueLabel}</CompactFact>
          <CompactFact label="Reminder">
            {maintenanceCase.reminderLabel}
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

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onEdit(maintenanceCase)} type="button">
            <Pencil size={15} />
            Edit
          </Button>
          <LinkButton href={maintenanceCase.hrefs.documentUpload}>
            <FileText size={15} />
            Upload doc
          </LinkButton>
        </div>
      </div>
    </aside>
  );
}

function LinkGrid({ maintenanceCase }: { maintenanceCase: MaintenanceCase }) {
  const links = [
    {
      href: maintenanceCase.hrefs.property,
      icon: <Wrench size={14} />,
      label: "Property",
    },
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
    {
      href: maintenanceCase.hrefs.documents,
      icon: <FileText size={14} />,
      label: `Documents (${maintenanceCase.documents.length})`,
    },
    maintenanceCase.hrefs.vendor
      ? {
          href: maintenanceCase.hrefs.vendor,
          icon: <ClipboardCheck size={14} />,
          label: "Vendor",
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

function MaintenanceForm({
  initialValues,
  maintenanceCase,
  mode,
  onClose,
  onSuccess,
  people,
  properties,
  units,
}: {
  initialValues?: Partial<MaintenanceCase["formValues"]>;
  maintenanceCase?: MaintenanceCase;
  mode: "create" | "edit";
  onClose: () => void;
  onSuccess: (message: string) => void;
  people: MaintenancePersonOption[];
  properties: MaintenancePropertyOption[];
  units: MaintenanceUnitOption[];
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createMaintenanceCaseAction : updateMaintenanceCaseAction,
    initialState,
  );
  const defaults = {
    actualCostAmount:
      maintenanceCase?.formValues.actualCostAmount ?? initialValues?.actualCostAmount ?? "",
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
  const visibleUnits = units.filter((unit) => unit.propertyId === propertyId);

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

        <Field label="Vendor/person" error={state.fieldErrors?.vendorPersonId?.[0]}>
          <SelectControl
            ariaLabel="Vendor or person"
            defaultValue={defaults.vendorPersonId ?? ""}
            name="vendorPersonId"
            options={[
              { label: "No vendor/person", value: "" },
              ...people.map((person) => ({
                label: person.label,
                value: person.id,
              })),
            ]}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" error={state.fieldErrors?.status?.[0]}>
            <SelectControl
              ariaLabel="Status"
              defaultValue={defaults.status}
              name="status"
              options={[
                { label: "Pending", value: "pending" },
                { label: "Scheduled", value: "scheduled" },
                { label: "In progress", value: "in_progress" },
                { label: "Blocked", value: "blocked" },
                { label: "Completed", value: "completed" },
                { label: "Cancelled", value: "cancelled" },
              ]}
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
            <Input defaultValue={defaults.dueDate ?? ""} name="dueDate" type="date" />
          </Field>
          <Field label="Due time" error={state.fieldErrors?.dueTime?.[0]}>
            <Input defaultValue={defaults.dueTime ?? ""} name="dueTime" type="time" />
          </Field>
          <Field label="Reminder date" error={state.fieldErrors?.reminderDate?.[0]}>
            <Input
              defaultValue={defaults.reminderDate ?? ""}
              name="reminderDate"
              type="date"
            />
          </Field>
          <Field label="Reminder time" error={state.fieldErrors?.reminderTime?.[0]}>
            <Input
              defaultValue={defaults.reminderTime ?? ""}
              name="reminderTime"
              type="time"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cost estimate" error={state.fieldErrors?.costEstimateAmount?.[0]}>
            <Input
              defaultValue={defaults.costEstimateAmount ?? ""}
              min="0"
              name="costEstimateAmount"
              step="0.01"
              type="number"
            />
          </Field>
          {mode === "edit" ? (
            <Field label="Actual cost" error={state.fieldErrors?.actualCostAmount?.[0]}>
              <Input
                defaultValue={defaults.actualCostAmount ?? ""}
                min="0"
                name="actualCostAmount"
                step="0.01"
                type="number"
              />
            </Field>
          ) : null}
        </div>

        {mode === "edit" ? (
          <label className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/70 px-3 py-2 text-sm">
            <input
              className="mt-1"
              defaultChecked={Boolean(
                maintenanceCase?.actualCostAmount && !maintenanceCase.ledgerEntryId,
              )}
              name="linkActualCostToLedger"
              type="checkbox"
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
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={defaults.description ?? ""}
            name="description"
          />
        </Field>

        <Field label="Checklist" error={state.fieldErrors?.checklistText?.[0]}>
          <textarea
            className="min-h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            defaultValue={defaults.checklistText}
            name="checklistText"
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
            <Wrench size={15} />
            {pending ? "Saving..." : mode === "create" ? "Create" : "Save"}
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

function getHrefWithoutActionParam(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("action");

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildFilterHref(
  pathname: string,
  searchParams: { toString(): string },
  values: Record<string, string>,
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(values)) {
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
  }

  nextParams.delete("page");
  nextParams.delete("taskId");
  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

const MAINTENANCE_TABS = [
  { label: "Open", review: "open" },
  { label: "Overdue", review: "overdue" },
  { label: "Upcoming", review: "upcoming" },
  { label: "Completed", review: "completed" },
  { label: "All", review: "all" },
] satisfies Array<{
  label: string;
  review: MaintenanceViewQuery["review"];
}>;

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

function buildMaintenanceTabHref(
  pathname: string,
  searchParams: { toString(): string },
  review: MaintenanceViewQuery["review"],
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  if (review === "open") {
    nextParams.delete("review");
  } else {
    nextParams.set("review", review);
  }

  nextParams.delete("page");
  nextParams.delete("status");
  nextParams.delete("taskId");
  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function buildClearFiltersHref(
  pathname: string,
  searchParams: { toString(): string },
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  [
    "archiveState",
    "month",
    "page",
    "priority",
    "propertyId",
    "query",
    "review",
    "scope",
    "sort",
    "status",
    "taskId",
    "unitId",
  ].forEach((key) => nextParams.delete(key));

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getAdvancedFilterCount(viewQuery: MaintenanceViewQuery) {
  let count = 0;

  if (viewQuery.priority !== "all") {
    count += 1;
  }

  if (viewQuery.status !== "all") {
    count += 1;
  }

  if (
    viewQuery.review === "reminders" ||
    viewQuery.review === "high_priority" ||
    viewQuery.review === "high_cost" ||
    viewQuery.review === "recurring"
  ) {
    count += 1;
  }

  return count;
}

function getScopeOptions(
  properties: MaintenancePropertyOption[],
  units: MaintenanceUnitOption[],
) {
  return [
    { label: "All cases", value: "all" },
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
) {
  if (viewQuery.taskId !== "all") {
    return "Selected case";
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

  return "All maintenance cases";
}
