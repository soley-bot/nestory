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
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  MaintenanceCase,
  MaintenanceStatus,
} from "@/features/maintenance/maintenance.types";
import { cn } from "@/lib/utils";

export type BoardSurfaceProps = {
  cases: MaintenanceCase[];
  emptyLabel: string;
  onStatusChange?: (
    maintenanceCase: MaintenanceCase,
    status: MaintenanceStatus,
  ) => void;
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
  statusChangePending?: boolean;
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
  { detail: "Closed out", status: "completed", title: "Completed" },
  { detail: "Stopped or voided", status: "cancelled", title: "Cancelled" },
];

export function BoardSurface({
  cases,
  emptyLabel,
  onStatusChange,
  onSelect,
  selectedTaskId,
  statusChangePending = false,
}: BoardSurfaceProps) {
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
      maintenanceCase.status === nextStatus
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

  return (
    <DndContext
      id="maintenance-status-board"
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div className="overflow-x-auto pb-1">
        <div className="grid min-h-[calc(100vh-310px)] min-w-[1320px] grid-cols-6 gap-3">
          {BOARD_COLUMNS.map((column) => (
            <BoardColumn
              canMove={Boolean(onStatusChange) && !statusChangePending}
              column={column}
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
}

function BoardColumn({
  canMove,
  column,
  onSelect,
  selectedTaskId,
  tasks,
}: {
  canMove: boolean;
  column: (typeof BOARD_COLUMNS)[number];
  onSelect: (taskId: string) => void;
  selectedTaskId: string;
  tasks: MaintenanceCase[];
}) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canMove,
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
              canMove={canMove}
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
    <button
      className={cn(
        "w-full touch-none rounded-md border bg-surface p-3 text-left text-sm shadow-sm transition-colors hover:bg-surface-muted",
        movable && "cursor-grab active:cursor-grabbing",
        isDragging && "shadow-lg ring-2 ring-accent-soft",
        selected
          ? "border-accent ring-2 ring-accent-soft"
          : "border-border",
      )}
      onClick={() => onSelect(maintenanceCase.id)}
      type="button"
      {...dragAttributes}
      {...dragListeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{maintenanceCase.title}</p>
          <p className="mt-1 truncate text-xs text-muted">
            {maintenanceCase.propertyLabel} / {maintenanceCase.unitLabel}
          </p>
        </div>
        <GripVertical className="mt-0.5 shrink-0 text-muted" size={15} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-foreground">
          {maintenanceCase.dueLabel}
        </span>
        {maintenanceCase.priorityLabel === "Normal" ? null : (
          <Badge tone={maintenanceCase.priorityTone}>
            {maintenanceCase.priorityLabel}
          </Badge>
        )}
      </div>
    </button>
  );
}

function isMaintenanceStatus(value: string): value is MaintenanceStatus {
  return (
    value === "pending" ||
    value === "scheduled" ||
    value === "in_progress" ||
    value === "blocked" ||
    value === "completed" ||
    value === "cancelled"
  );
}
