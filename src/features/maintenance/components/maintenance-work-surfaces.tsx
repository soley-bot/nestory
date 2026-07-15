"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  ListChecks,
  Repeat,
  UserRound,
  Wrench,
} from "lucide-react";
import { PaginationControls } from "@/components/data/pagination-controls";
import { Badge } from "@/components/ui/badge";
import type { BoardSurfaceProps } from "@/features/maintenance/components/maintenance-board-surface";
import type {
  MaintenanceActor,
  MaintenanceCase,
  MaintenancePagination,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";
import { cn } from "@/lib/utils";

const BoardSurface = dynamic<BoardSurfaceProps>(() =>
  import("@/features/maintenance/components/maintenance-board-surface").then(
    (module) => module.BoardSurface,
  ),
);

export type MaintenanceSurfaceVariant =
  | "agenda"
  | "board"
  | "checklist"
  | "inbox"
  | "routine"
  | "table"
  | "workload";

type MaintenanceWorkflowSurfaceProps = {
  actorRole: MaintenanceActor["role"];
  cases: MaintenanceCase[];
  emptyLabel: string;
  month: string;
  onCreateDate?: (dueDate: string) => void;
  onStatusChange?: (
    maintenanceCase: MaintenanceCase,
    status: MaintenanceStatus,
  ) => void;
  onSelect: (taskId: string) => void;
  pagination: MaintenancePagination;
  selectedTaskId: string;
  statusChangePending?: boolean;
  variant: Exclude<MaintenanceSurfaceVariant, "table">;
  waitingForReviewLabel?: boolean;
};

export function MaintenanceWorkflowSurface({
  actorRole,
  cases,
  emptyLabel,
  month,
  onCreateDate,
  onStatusChange,
  onSelect,
  pagination,
  selectedTaskId,
  statusChangePending = false,
  variant,
  waitingForReviewLabel = false,
}: MaintenanceWorkflowSurfaceProps) {
  return (
    <div
      className={variant === "agenda" ? "h-full min-h-0" : "space-y-3"}
      data-maintenance-surface={variant === "agenda" ? "calendar" : variant}
    >
      {variant === "inbox" ? (
        <InboxSurface
          cases={cases}
          emptyLabel={emptyLabel}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      ) : variant === "board" ? (
        <BoardSurface
          actorRole={actorRole}
          cases={cases}
          emptyLabel={emptyLabel}
          onStatusChange={onStatusChange}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
          statusChangePending={statusChangePending}
          waitingForReviewLabel={waitingForReviewLabel}
        />
      ) : variant === "agenda" ? (
        <AgendaSurface
          cases={cases}
          emptyLabel={emptyLabel}
          month={month}
          onCreateDate={onCreateDate}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      ) : variant === "checklist" ? (
        <ChecklistSurface
          cases={cases}
          emptyLabel={emptyLabel}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      ) : variant === "routine" ? (
        <RoutineSurface
          cases={cases}
          emptyLabel={emptyLabel}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      ) : (
        <WorkloadSurface
          cases={cases}
          emptyLabel={emptyLabel}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      )}
      {pagination.totalPages > 1 ? (
        <PaginationControls pagination={pagination} />
      ) : null}
    </div>
  );
}

function InboxSurface({
  cases,
  emptyLabel,
  onSelect,
  selectedTaskId,
}: SurfaceProps) {
  const attentionCases = cases.filter(
    (maintenanceCase) =>
      maintenanceCase.isOverdue || maintenanceCase.isReminderDue,
  );

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-2">
        <SectionTitle
          detail="Newest intake first"
          icon={<ClipboardCheck size={15} />}
          title="Triage inbox"
        />
        <SurfaceList emptyLabel={emptyLabel}>
          {cases.map((maintenanceCase) => (
            <MaintenanceCard
              key={maintenanceCase.id}
              maintenanceCase={maintenanceCase}
              onSelect={onSelect}
              selected={selectedTaskId === maintenanceCase.id}
            />
          ))}
        </SurfaceList>
      </section>
      <aside className="rounded-md border border-border bg-surface">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-[0] text-muted">
            Needs triage
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {attentionCases.length} urgent{" "}
            {attentionCases.length === 1 ? "follow-up" : "follow-ups"}
          </p>
        </div>
        {attentionCases.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">Nothing urgent in this view.</p>
        ) : (
          <div className="divide-y divide-border">
            {attentionCases.slice(0, 6).map((maintenanceCase) => (
              <div
                className="flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted"
                key={maintenanceCase.id}
              >
                <div className="min-w-0 flex-1">
                  <Link
                    className="block truncate font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring"
                    href={maintenanceCase.hrefs.task}
                    prefetch={false}
                  >
                    {maintenanceCase.title}
                  </Link>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={maintenanceCase.progressTone}>
                      {maintenanceCase.progressLabel}
                    </Badge>
                    <Badge tone={maintenanceCase.priorityTone}>
                      {maintenanceCase.priorityLabel}
                    </Badge>
                  </span>
                </div>
                <button
                  aria-label={`Preview ${maintenanceCase.title}`}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-border outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
                  data-maintenance-record-trigger={maintenanceCase.id}
                  onClick={() => onSelect(maintenanceCase.id)}
                  type="button"
                >
                  <Eye size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function AgendaSurface({
  cases,
  month,
  onCreateDate,
  onSelect,
}: SurfaceProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeCase, setActiveCase] = useState<MaintenanceCase | null>(null);
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarDays = getCalendarDays(month);
  const casesByDate = groupCasesByCalendarDate(cases);
  const monthLinks = getCalendarMonthLinks(pathname, searchParams, month);

  function closeActiveEvent() {
    activeTriggerRef.current?.focus();
    setActiveCase(null);
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarNavLink href={monthLinks.today} label="Today">
            Today
          </CalendarNavLink>
          <CalendarNavLink href={monthLinks.previous} label="Previous month">
            <ChevronLeft size={15} />
          </CalendarNavLink>
          <CalendarNavLink href={monthLinks.next} label="Next month">
            <ChevronRight size={15} />
          </CalendarNavLink>
          <h2 className="ml-2 truncate text-xl font-normal leading-7">
            {formatMonthLabel(month)}
          </h2>
        </div>
        <div className="inline-flex h-7 items-center self-start rounded-md border border-border bg-background px-3 text-sm font-medium lg:self-auto">
          Month
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-w-[980px] flex-col">
          <div className="grid shrink-0 grid-cols-7 border-b border-border bg-background">
            {WEEKDAY_LABELS.map((label) => (
              <span
                className="border-r border-border px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0] text-muted last:border-r-0"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
            {calendarDays.map((day, index) => (
              <CalendarDayCell
                activeCaseId={activeCase?.id}
                day={day}
                dayCases={casesByDate.get(day.date) ?? []}
                key={day.date}
                onActivateCase={(maintenanceCase, trigger) => {
                  activeTriggerRef.current = trigger;
                  setActiveCase(maintenanceCase);
                }}
                onCreateDate={onCreateDate}
                showBottomBorder={index < 35}
                showRightBorder={index % 7 !== 6}
              />
            ))}
          </div>
        </div>
      </div>
      {activeCase ? (
        <CalendarEventPopover
          maintenanceCase={activeCase}
          onClose={closeActiveEvent}
          onOpen={() => {
            closeActiveEvent();
            onSelect(activeCase.id);
          }}
        />
      ) : null}
    </section>
  );
}

function ChecklistSurface({
  cases,
  emptyLabel,
  onSelect,
  selectedTaskId,
}: SurfaceProps) {
  if (cases.length === 0) {
    return <EmptySurface label={emptyLabel} />;
  }

  return (
    <section className="space-y-2">
      <SectionTitle
        detail="Checklist and result review"
        icon={<ListChecks size={15} />}
        title="Inspection cards"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {cases.map((maintenanceCase) => (
          <article
            className={cardClassName(selectedTaskId === maintenanceCase.id)}
            key={maintenanceCase.id}
          >
            <CardHeader
              maintenanceCase={maintenanceCase}
              onSelect={onSelect}
              selected={selectedTaskId === maintenanceCase.id}
            />
            <div className="mt-3 rounded-md border border-border bg-surface-muted/60 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0] text-muted">
                  Checklist
                </p>
                <Badge
                  tone={
                    maintenanceCase.checklistTotalCount > 0 &&
                    maintenanceCase.checklistDoneCount ===
                      maintenanceCase.checklistTotalCount
                      ? "success"
                      : "neutral"
                  }
                >
                  {maintenanceCase.checklistDoneCount}/
                  {maintenanceCase.checklistTotalCount}
                </Badge>
              </div>
              <div className="mt-2 space-y-1.5 text-left text-xs">
                {maintenanceCase.checklist.length === 0 ? (
                  <p className="text-muted">No checklist items yet.</p>
                ) : (
                  maintenanceCase.checklist.slice(0, 3).map((item) => (
                    <p className="flex items-start gap-2" key={item.id}>
                      {item.completed ? (
                        <CheckCircle2
                          className="mt-0.5 shrink-0 text-success"
                          size={13}
                        />
                      ) : (
                        <ListChecks
                          className="mt-0.5 shrink-0 text-muted"
                          size={13}
                        />
                      )}
                      <span className={cn(item.completed && "text-muted line-through")}>
                        {item.label}
                      </span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoutineSurface({
  cases,
  emptyLabel,
  onSelect,
  selectedTaskId,
}: SurfaceProps) {
  const groups = groupCases(cases, (maintenanceCase) => ({
    key: maintenanceCase.recurrenceFrequency,
    label: maintenanceCase.recurrenceLabel,
    tone: "accent",
  }));

  return (
    <section className="space-y-3">
      <SectionTitle
        detail="Preventive work by cadence"
        icon={<Repeat size={15} />}
        title="Routine plan"
      />
      {groups.length === 0 ? (
        <EmptySurface label={emptyLabel} />
      ) : (
        groups.map((group) => (
          <div className="rounded-md border border-border bg-surface" key={group.key}>
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">{group.label}</p>
              <Badge tone={group.tone}>{group.cases.length}</Badge>
            </div>
            <div className="grid gap-2 p-2 lg:grid-cols-2">
              {group.cases.map((maintenanceCase) => (
                <MaintenanceCard
                  key={maintenanceCase.id}
                  maintenanceCase={maintenanceCase}
                  onSelect={onSelect}
                  selected={selectedTaskId === maintenanceCase.id}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function WorkloadSurface({
  cases,
  emptyLabel,
  onSelect,
  selectedTaskId,
}: SurfaceProps) {
  const groups = groupCases(cases, (maintenanceCase) => ({
    key: maintenanceCase.assigneePersonId ?? "unassigned",
    label: maintenanceCase.assigneeLabel,
    tone: maintenanceCase.assigneePersonId ? "accent" : "warning",
  }));

  return (
    <section className="space-y-3">
      <SectionTitle
        detail="Grouped by assignee"
        icon={<UserRound size={15} />}
        title="Staff workload"
      />
      {groups.length === 0 ? (
        <EmptySurface label={emptyLabel} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          {groups.map((group) => (
            <div className="rounded-md border border-border bg-surface" key={group.key}>
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{group.label}</p>
                  <p className="text-xs text-muted">
                    {group.cases.filter((maintenanceCase) => maintenanceCase.isOverdue).length} overdue
                  </p>
                </div>
                <Badge tone={group.tone}>{group.cases.length}</Badge>
              </div>
              <div className="space-y-2 p-2">
                {group.cases.map((maintenanceCase) => (
                  <MaintenanceCard
                    key={maintenanceCase.id}
                    maintenanceCase={maintenanceCase}
                    onSelect={onSelect}
                    selected={selectedTaskId === maintenanceCase.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type SurfaceProps = {
  cases: MaintenanceCase[];
  emptyLabel: string;
  month?: string;
  onCreateDate?: (dueDate: string) => void;
  onStatusChange?: (
    maintenanceCase: MaintenanceCase,
    status: MaintenanceStatus,
  ) => void;
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
  statusChangePending?: boolean;
};

function SurfaceList({ children, emptyLabel }: {
  children: ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      {Array.isArray(children) && children.length === 0 ? (
        <EmptySurface label={emptyLabel} />
      ) : (
        children
      )}
    </div>
  );
}

function MaintenanceCard({
  maintenanceCase,
  onSelect,
  selected,
}: {
  maintenanceCase: MaintenanceCase;
  onSelect: (taskId: string) => void;
  selected: boolean;
}) {
  return (
    <article className={cardClassName(selected)}>
      <CardHeader
        maintenanceCase={maintenanceCase}
        onSelect={onSelect}
        selected={selected}
      />
      <div className="mt-2 flex min-w-0 text-left">
        <span className="min-w-0 truncate text-xs font-medium text-muted">
          {maintenanceCase.dueLabel}
        </span>
      </div>
    </article>
  );
}

function CalendarDayCell({
  activeCaseId,
  day,
  dayCases,
  onActivateCase,
  onCreateDate,
  showBottomBorder,
  showRightBorder,
}: {
  activeCaseId?: string;
  day: ReturnType<typeof getCalendarDays>[number];
  dayCases: MaintenanceCase[];
  onActivateCase: (
    maintenanceCase: MaintenanceCase,
    trigger: HTMLButtonElement,
  ) => void;
  onCreateDate?: (dueDate: string) => void;
  showBottomBorder: boolean;
  showRightBorder: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-h-0 bg-surface px-1.5 py-1",
        !day.inMonth && "bg-surface-muted/50 text-muted",
        showBottomBorder && "border-b border-border",
        showRightBorder && "border-r border-border",
      )}
    >
      {onCreateDate ? (
        <button
          aria-label={`Add scheduled item on ${formatCalendarPanelDate(day.date)}`}
          className="absolute inset-0 z-0 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
          data-calendar-add-date={day.date}
          onClick={() => onCreateDate(day.date)}
          type="button"
        />
      ) : null}
      <div className="pointer-events-none relative z-10 flex h-5 justify-end">
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full text-xs",
            day.isToday && "bg-accent text-white",
          )}
        >
          {day.dayNumber}
        </span>
      </div>
      <div className="relative z-10 mt-0.5 space-y-1 overflow-hidden">
        {dayCases.slice(0, 3).map((maintenanceCase) => (
          <CalendarCaseButton
            expanded={activeCaseId === maintenanceCase.id}
            key={maintenanceCase.id}
            maintenanceCase={maintenanceCase}
            onActivate={onActivateCase}
          />
        ))}
        {dayCases.length > 3 ? (
          <button
            aria-expanded={activeCaseId === dayCases[3]?.id}
            aria-haspopup="dialog"
            className="block min-h-6 w-full rounded-sm px-1.5 py-1 text-left text-xs font-medium leading-4 text-muted hover:bg-surface-muted hover:text-foreground"
            onClick={(event) => onActivateCase(dayCases[3], event.currentTarget)}
            type="button"
          >
            {dayCases.length - 3} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CalendarCaseButton({
  expanded,
  maintenanceCase,
  onActivate,
}: {
  expanded: boolean;
  maintenanceCase: MaintenanceCase;
  onActivate: (
    maintenanceCase: MaintenanceCase,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={`${maintenanceCase.title}, ${maintenanceCase.statusLabel}, ${maintenanceCase.priorityLabel}, ${maintenanceCase.propertyLabel}, ${maintenanceCase.assigneeLabel}, ${maintenanceCase.vendorLabel}`}
      className={cn(
        "block min-h-6 w-full rounded px-1.5 py-1 text-left text-xs leading-4 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        getCalendarCaseClassName(maintenanceCase),
      )}
      data-maintenance-record-trigger={maintenanceCase.id}
      onClick={(event) => onActivate(maintenanceCase, event.currentTarget)}
      type="button"
    >
      <span className="block truncate font-medium">{maintenanceCase.title}</span>
    </button>
  );
}

function CalendarEventPopover({
  maintenanceCase,
  onClose,
  onOpen,
}: {
  maintenanceCase: MaintenanceCase;
  onClose: () => void;
  onOpen: () => void;
}) {
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstActionRef.current?.focus();
  }, []);

  return (
    <div
      aria-label={`${maintenanceCase.title} calendar event`}
      aria-modal="false"
      className="absolute left-1/2 top-24 z-30 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-border bg-surface shadow-xl"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="flex justify-end px-2 pt-2">
        <button
          aria-label="Close event"
          className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onClick={onClose}
          ref={firstActionRef}
          type="button"
        >
          X
        </button>
      </div>
      <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-3 px-5 pb-5">
        <span
          className={cn(
            "mt-1 size-3 rounded-sm",
            getCalendarEventDotClassName(maintenanceCase),
          )}
        />
        <div className="min-w-0">
          <h3 className="break-words text-lg font-normal leading-6">
            {maintenanceCase.title}
          </h3>
          <p className="mt-1 text-sm text-muted">{maintenanceCase.dueLabel}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone={maintenanceCase.statusTone}>
              {maintenanceCase.statusLabel}
            </Badge>
            <Badge tone={maintenanceCase.priorityTone}>
              {maintenanceCase.priorityLabel}
            </Badge>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <p className="truncate">
              {maintenanceCase.propertyLabel} / {maintenanceCase.unitLabel}
            </p>
            <p className="text-muted">{maintenanceCase.reminderLabel}</p>
            <p className="text-muted">{maintenanceCase.assigneeLabel}</p>
            <p className="text-muted">{maintenanceCase.vendorLabel}</p>
          </div>
          <button
            className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={onOpen}
            type="button"
          >
            Open Preview
          </button>
        </div>
      </div>
    </div>
  );
}

function getCalendarCaseClassName(maintenanceCase: MaintenanceCase) {
  if (maintenanceCase.isOverdue) {
    return "bg-danger/15 text-danger";
  }

  if (maintenanceCase.priority === "urgent" || maintenanceCase.priority === "high") {
    return "bg-warning/20 text-warning";
  }

  if (maintenanceCase.status === "completed") {
    return "bg-success/15 text-success";
  }

  return "bg-accent-soft text-foreground";
}

function getCalendarEventDotClassName(maintenanceCase: MaintenanceCase) {
  if (maintenanceCase.isOverdue) {
    return "bg-danger";
  }

  if (maintenanceCase.priority === "urgent" || maintenanceCase.priority === "high") {
    return "bg-warning";
  }

  if (maintenanceCase.status === "completed") {
    return "bg-success";
  }

  return "bg-accent";
}

function CalendarNavLink({
  children,
  href,
  label,
}: {
  children: ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-label={label}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-medium transition-colors hover:bg-surface-muted"
      href={href}
      prefetch={false}
      title={label}
    >
      {children}
    </Link>
  );
}

function CardHeader({
  maintenanceCase,
  onSelect,
  selected,
}: {
  maintenanceCase: MaintenanceCase;
  onSelect: (taskId: string) => void;
  selected: boolean;
}) {
  return (
    <div className="text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            className="block truncate font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring"
            href={maintenanceCase.hrefs.task}
            prefetch={false}
            title={maintenanceCase.title}
          >
            {maintenanceCase.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted">
            {maintenanceCase.propertyLabel} / {maintenanceCase.unitLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Wrench aria-hidden="true" className="text-muted" size={15} />
          <button
            aria-label={`Preview ${maintenanceCase.title}`}
            aria-pressed={selected}
            className="inline-flex h-7 items-center gap-1 rounded border border-border bg-surface px-2 text-xs font-medium outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
            data-maintenance-record-trigger={maintenanceCase.id}
            onClick={() => onSelect(maintenanceCase.id)}
            type="button"
          >
            <Eye size={13} />
            Preview
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={maintenanceCase.statusTone}>
          {maintenanceCase.statusLabel}
        </Badge>
        <Badge tone={maintenanceCase.priorityTone}>
          {maintenanceCase.priorityLabel}
        </Badge>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-foreground-muted sm:grid-cols-2">
        <span className="truncate">Assignee: {maintenanceCase.assigneeLabel}</span>
        <span className="truncate">Vendor: {maintenanceCase.vendorLabel}</span>
      </div>
    </div>
  );
}

function SectionTitle({
  detail,
  icon,
  title,
}: {
  detail: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">{icon}</span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}

function EmptySurface({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
      {label}
    </div>
  );
}

function cardClassName(selected: boolean) {
  return cn(
    "block w-full rounded-md border border-border bg-surface px-3 py-3 text-left shadow-sm transition-colors hover:border-accent/40 hover:bg-surface-muted",
    selected && "border-record-spine bg-state-selected",
  );
}

function groupCases(
  cases: MaintenanceCase[],
  getGroup: (maintenanceCase: MaintenanceCase) => {
    key: string;
    label: string;
    tone: "accent" | "danger" | "neutral" | "success" | "warning";
  },
) {
  const groups = new Map<
    string,
    {
      cases: MaintenanceCase[];
      key: string;
      label: string;
      tone: "accent" | "danger" | "neutral" | "success" | "warning";
    }
  >();

  for (const maintenanceCase of cases) {
    const group = getGroup(maintenanceCase);
    const existing = groups.get(group.key);

    if (existing) {
      existing.cases.push(maintenanceCase);
    } else {
      groups.set(group.key, { ...group, cases: [maintenanceCase] });
    }
  }

  return [...groups.values()];
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCalendarDays(month: string | undefined) {
  const { monthIndex, year } = parseMonthKey(month);
  const firstDay = new Date(year, monthIndex, 1);
  const startDate = new Date(year, monthIndex, 1 - firstDay.getDay());
  const todayKey = toCalendarDateKey(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = toCalendarDateKey(date);

    return {
      date: dateKey,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: dateKey === todayKey,
    };
  });
}

function groupCasesByCalendarDate(cases: MaintenanceCase[]) {
  const groups = new Map<string, MaintenanceCase[]>();

  for (const maintenanceCase of cases) {
    const date = getCalendarCaseDate(maintenanceCase);

    if (!date) {
      continue;
    }

    const group = groups.get(date);

    if (group) {
      group.push(maintenanceCase);
    } else {
      groups.set(date, [maintenanceCase]);
    }
  }

  return groups;
}

function getCalendarCaseDate(maintenanceCase: MaintenanceCase) {
  return maintenanceCase.dueDate ?? maintenanceCase.reminderDate;
}

function formatMonthLabel(month: string | undefined) {
  const { monthIndex, year } = parseMonthKey(month);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

function formatCalendarPanelDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function getCalendarMonthLinks(
  pathname: string,
  searchParams: { toString(): string },
  month: string | undefined,
) {
  const { monthIndex, year } = parseMonthKey(month);
  const current = new Date(year, monthIndex, 1);

  return {
    next: buildCalendarMonthHref(pathname, searchParams, addMonths(current, 1)),
    previous: buildCalendarMonthHref(
      pathname,
      searchParams,
      addMonths(current, -1),
    ),
    today: buildCalendarMonthHref(pathname, searchParams, new Date()),
  };
}

function buildCalendarMonthHref(
  pathname: string,
  searchParams: { toString(): string },
  date: Date,
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  nextParams.set("month", toMonthKey(date));
  nextParams.delete("page");
  nextParams.delete("taskId");

  const query = nextParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function parseMonthKey(month: string | undefined) {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const current = new Date();

  if (!match) {
    return { monthIndex: current.getMonth(), year: current.getFullYear() };
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    return { monthIndex: current.getMonth(), year: current.getFullYear() };
  }

  return { monthIndex, year };
}

function toCalendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
