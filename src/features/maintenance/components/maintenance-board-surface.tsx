"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useState } from "react";
import { Columns3, Eye, GripVertical, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  MaintenanceActor,
  MaintenanceCase,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";
import { canTransitionMaintenanceStatus } from "@/features/maintenance/maintenance.workflow";
import { cn } from "@/lib/utils";

export type BoardSurfaceProps = {
  actorRole: MaintenanceActor["role"];
  cases: MaintenanceCase[];
  emptyLabel: string;
  onStatusChange?: (
    maintenanceCase: MaintenanceCase,
    status: MaintenanceStatus,
  ) => void;
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
  statusChangePending?: boolean;
  waitingForReviewLabel?: boolean;
};

const BOARD_COLUMNS: Array<{
  detail: string;
  status: MaintenanceStatus;
  title: string;
}> = [
  { detail: "Needs triage", status: "pending", title: "Pending" },
  { detail: "Ready for a visit", status: "scheduled", title: "Scheduled" },
  { detail: "Work is moving", status: "in_progress", title: "In progress" },
  { detail: "Waiting on a blocker", status: "blocked", title: "Blocked" },
  { detail: "Manager completion review", status: "ready_for_review", title: "Ready for review" },
  { detail: "Closed out", status: "completed", title: "Completed" },
  { detail: "Stopped or voided", status: "cancelled", title: "Cancelled" },
];

export function BoardSurface({
  actorRole,
  cases,
  emptyLabel,
  onStatusChange,
  onSelect,
  selectedTaskId,
  statusChangePending = false,
  waitingForReviewLabel = false,
}: BoardSurfaceProps) {
  const [presentation, setPresentation] = useState<"board" | "list">(
    actorRole === "member" ? "list" : "board",
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const nextStatus = String(event.over?.id ?? "");
    const maintenanceCase = cases.find((candidate) => candidate.id === taskId);

    if (
      !maintenanceCase ||
      !onStatusChange ||
      !isMaintenanceStatus(nextStatus) ||
      maintenanceCase.status === nextStatus ||
      !canTransitionMaintenanceStatus(
        maintenanceCase.status,
        nextStatus,
        { actorRole, executionMode: maintenanceCase.executionMode },
      )
    ) {
      return;
    }

    onStatusChange(maintenanceCase, nextStatus);
  }

  if (cases.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  if (actorRole === "member") {
    return (
      <BoardListSurface
        cases={cases}
        onSelect={onSelect}
        selectedTaskId={selectedTaskId}
      />
    );
  }

  const board = (
    <DndContext
      id="maintenance-status-board"
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div className="overflow-x-auto pb-1">
        <div className="grid min-h-[calc(100vh-310px)] min-w-[1540px] grid-cols-7 gap-3">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              canDrop={
                Boolean(onStatusChange) &&
                !statusChangePending &&
                cases.some((maintenanceCase) =>
                  canTransitionMaintenanceStatus(
                    maintenanceCase.status,
                    column.status,
                    { actorRole, executionMode: maintenanceCase.executionMode },
                  ),
                )
              }
              actorRole={actorRole}
              canManageState={Boolean(onStatusChange) && !statusChangePending}
              column={
                waitingForReviewLabel && column.status === "ready_for_review"
                  ? { ...column, title: "Waiting for review" }
                  : column
              }
              key={column.status}
              onSelect={onSelect}
              selectedTaskId={selectedTaskId}
              tasks={cases.filter(
                (maintenanceCase) => maintenanceCase.status === column.status,
              )}
            />
          ))}
        </div>
      </div>
    </DndContext>
  );

  return (
    <div className="space-y-2">
      <div
        aria-label="Work order display"
        className="flex items-center justify-end gap-1"
        role="group"
      >
        <button
          aria-pressed={presentation === "board"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring",
            presentation === "board"
              ? "border-accent bg-accent-soft text-foreground"
              : "border-border bg-surface text-foreground-muted hover:bg-surface-muted",
          )}
          onClick={() => setPresentation("board")}
          type="button"
        >
          <Columns3 size={14} />
          Board
        </button>
        <button
          aria-pressed={presentation === "list"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus-ring",
            presentation === "list"
              ? "border-accent bg-accent-soft text-foreground"
              : "border-border bg-surface text-foreground-muted hover:bg-surface-muted",
          )}
          onClick={() => setPresentation("list")}
          type="button"
        >
          <ListChecks size={14} />
          List
        </button>
      </div>
      {presentation === "list" ? (
        <BoardListSurface
          cases={cases}
          onSelect={onSelect}
          selectedTaskId={selectedTaskId}
        />
      ) : board}
    </div>
  );
}

function BoardListSurface({
  cases,
  onSelect,
  selectedTaskId,
}: {
  cases: MaintenanceCase[];
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
}) {
  return (
    <div
      className="overflow-x-auto rounded-md border border-border bg-surface"
      data-maintenance-surface="board-list"
    >
      <table
        aria-label="Work order list"
        className="w-full min-w-[760px] border-collapse text-left text-[13px]"
      >
        <thead className="bg-surface-muted text-[11px] uppercase text-foreground-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Work order</th>
            <th className="px-3 py-2 font-semibold">Status / Priority</th>
            <th className="px-3 py-2 font-semibold">Property / Unit</th>
            <th className="px-3 py-2 font-semibold">Assignee / Vendor</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((maintenanceCase) => (
            <tr
              aria-selected={selectedTaskId === maintenanceCase.id}
              className={cn(
                "cursor-pointer border-t border-border outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
                selectedTaskId === maintenanceCase.id &&
                  "bg-state-selected shadow-[inset_3px_0_0_var(--state-selected-strong)]",
              )}
              data-maintenance-record-trigger={maintenanceCase.id}
              key={maintenanceCase.id}
              onClick={(event) => {
                event.currentTarget.focus();
                onSelect(maintenanceCase.id);
              }}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(maintenanceCase.id);
                }
              }}
              tabIndex={0}
            >
              <td className="px-3 py-2 font-medium">
                <Link
                  className="block truncate outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus-ring"
                  href={maintenanceCase.hrefs.task}
                  onClick={(event) => event.stopPropagation()}
                  prefetch={false}
                  title={maintenanceCase.title}
                >
                  {maintenanceCase.title}
                </Link>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={maintenanceCase.statusTone}>
                    {maintenanceCase.statusLabel}
                  </Badge>
                  <Badge tone={maintenanceCase.priorityTone}>
                    {maintenanceCase.priorityLabel}
                  </Badge>
                </div>
              </td>
              <td className="px-3 py-2">
                <p>{maintenanceCase.propertyLabel}</p>
                <p className="text-xs text-foreground-muted">
                  {maintenanceCase.unitLabel}
                </p>
              </td>
              <td className="px-3 py-2">
                <p>{maintenanceCase.assigneeLabel}</p>
                <p className="text-xs text-foreground-muted">
                  {maintenanceCase.vendorLabel}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardColumn({
  actorRole,
  canDrop,
  canManageState,
  column,
  onSelect,
  selectedTaskId,
  tasks,
}: {
  actorRole: MaintenanceActor["role"];
  canDrop: boolean;
  canManageState: boolean;
  column: (typeof BOARD_COLUMNS)[number];
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
  tasks: MaintenanceCase[];
}) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canDrop,
    id: column.status,
  });

  return (
    <section
      className={cn(
        "flex min-h-[calc(100vh-310px)] flex-col rounded-md border border-border bg-surface transition-colors",
        isOver && "border-accent bg-accent-soft/40",
      )}
      data-status-column={column.status}
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div>
          <p className="text-sm font-semibold">{column.title}</p>
          <p className="text-xs text-muted">{column.detail}</p>
        </div>
        <Badge tone={tasks.length > 0 ? "accent" : "neutral"}>
          {tasks.length}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-1 py-4 text-sm text-muted">No work here.</p>
        ) : (
          tasks.map((maintenanceCase) => (
            <DraggableMaintenanceCard
              canMove={
                canManageState &&
                canTransitionMaintenanceStatus(
                  maintenanceCase.status,
                  maintenanceCase.status === "cancelled" ? "pending" : "cancelled",
                  { actorRole, executionMode: maintenanceCase.executionMode },
                )
              }
              key={maintenanceCase.id}
              maintenanceCase={maintenanceCase}
              onSelect={onSelect}
              selected={selectedTaskId === maintenanceCase.id}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DraggableMaintenanceCard({
  canMove,
  maintenanceCase,
  onSelect,
  selected,
}: {
  canMove: boolean;
  maintenanceCase: MaintenanceCase;
  onSelect: (taskId: string) => void;
  selected: boolean;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useDraggable({
      data: { status: maintenanceCase.status },
      disabled: !canMove,
      id: maintenanceCase.id,
    });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      className={cn("relative", isDragging && "z-20 opacity-70")}
      data-task-card={maintenanceCase.id}
      ref={setNodeRef}
      style={style}
    >
      <MaintenanceCard
        dragAttributes={canMove ? attributes : undefined}
        dragListeners={canMove ? listeners : undefined}
        isDragging={isDragging}
        maintenanceCase={maintenanceCase}
        movable={canMove}
        onSelect={onSelect}
        selected={selected}
      />
    </div>
  );
}

function MaintenanceCard({
  dragAttributes,
  dragListeners,
  isDragging,
  maintenanceCase,
  movable,
  onSelect,
  selected,
}: {
  dragAttributes?: ReturnType<typeof useDraggable>["attributes"];
  dragListeners?: ReturnType<typeof useDraggable>["listeners"];
  isDragging: boolean;
  maintenanceCase: MaintenanceCase;
  movable: boolean;
  onSelect: (taskId: string) => void;
  selected: boolean;
}) {
  return (
    <article
      className={cn(
        "w-full rounded-md border bg-surface p-3 text-left text-sm shadow-sm transition-colors hover:bg-surface-muted",
        isDragging && "shadow-lg ring-2 ring-state-selected-strong",
        selected
          ? "border-accent ring-2 ring-state-selected-strong"
          : "border-border",
      )}
    >
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
        {movable ? (
          <button
            aria-label={`Move ${maintenanceCase.title}`}
            className="inline-flex size-7 shrink-0 touch-none items-center justify-center rounded text-muted outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring active:cursor-grabbing"
            type="button"
            {...dragAttributes}
            {...dragListeners}
          >
            <GripVertical size={15} />
          </button>
        ) : (
          <GripVertical
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-muted"
            size={15}
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-foreground">
          {maintenanceCase.dueLabel}
        </span>
        <div className="flex gap-1.5">
          <Badge tone={maintenanceCase.statusTone}>
            {maintenanceCase.statusLabel}
          </Badge>
          <Badge tone={maintenanceCase.priorityTone}>
            {maintenanceCase.priorityLabel}
          </Badge>
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-foreground-muted">
        <span className="truncate">Assignee: {maintenanceCase.assigneeLabel}</span>
        <span className="truncate">Vendor: {maintenanceCase.vendorLabel}</span>
      </div>
      <button
        aria-label={`Preview ${maintenanceCase.title}`}
        aria-pressed={selected}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
        data-maintenance-record-trigger={maintenanceCase.id}
        onClick={() => onSelect(maintenanceCase.id)}
        type="button"
      >
        <Eye size={14} />
        Preview
      </button>
    </article>
  );
}

function isMaintenanceStatus(value: string): value is MaintenanceStatus {
  return (
    value === "pending" ||
    value === "scheduled" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "ready_for_review" ||
    value === "completed" ||
    value === "cancelled"
  );
}
