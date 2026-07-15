"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  LoaderCircle,
  PencilLine,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DraftStatus = "clean" | "dirty" | "saving" | "saved" | "error";

type DraftActionBarProps = {
  describedBy?: string;
  disabledReason?: string;
  discardLabel?: string;
  onDiscard: () => void;
  onSave: () => void;
  saveLabel?: string;
  status: DraftStatus;
  statusMessage?: string;
};

type StatusPresentation = {
  className: string;
  icon: LucideIcon;
  message: string;
};

const statusPresentation: Record<DraftStatus, StatusPresentation> = {
  clean: {
    className: "text-foreground-muted",
    icon: Circle,
    message: "No changes",
  },
  dirty: {
    className: "text-warning",
    icon: PencilLine,
    message: "Unsaved changes",
  },
  saving: {
    className: "text-foreground-muted",
    icon: LoaderCircle,
    message: "Saving changes",
  },
  saved: {
    className: "text-success",
    icon: CheckCircle2,
    message: "Changes saved",
  },
  error: {
    className: "text-danger",
    icon: CircleAlert,
    message: "Changes not saved",
  },
};

function joinIds(...ids: Array<string | undefined>) {
  const joinedIds = ids
    .flatMap((id) => id?.trim().split(/\s+/) ?? [])
    .filter(Boolean)
    .join(" ");

  return joinedIds || undefined;
}

export function DraftActionBar({
  describedBy,
  disabledReason,
  discardLabel = "Discard",
  onDiscard,
  onSave,
  saveLabel = "Save changes",
  status,
  statusMessage,
}: DraftActionBarProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [restoreDiscardFocus, setRestoreDiscardFocus] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const presentation = statusPresentation[status];
  const StatusIcon = presentation.icon;
  const isPending = status === "saving";
  const isDraftActionable = status === "dirty" || status === "error";
  const actionsDisabled = !isDraftActionable || isPending;
  const saveDisabled = actionsDisabled || Boolean(disabledReason);
  const saveDescribedBy = joinIds(describedBy, disabledReason ? reasonId : undefined);

  useEffect(() => {
    const control = confirmingDiscard
      ? barRef.current?.querySelector<HTMLButtonElement>(
          '[data-discard-control="cancel"]',
        )
      : restoreDiscardFocus
        ? barRef.current?.querySelector<HTMLButtonElement>(
            '[data-discard-control="trigger"]',
          )
        : null;

    control?.focus();
  }, [confirmingDiscard, restoreDiscardFocus]);

  function handleConfirmDiscard() {
    setConfirmingDiscard(false);
    setRestoreDiscardFocus(false);
    onDiscard();
  }

  function handleCancelDiscard() {
    setConfirmingDiscard(false);
    setRestoreDiscardFocus(true);
  }

  function handleRequestDiscard() {
    setRestoreDiscardFocus(false);
    setConfirmingDiscard(true);
  }

  return (
    <div
      aria-busy={isPending ? "true" : "false"}
      className="border-t border-border bg-surface-raised px-4 py-3 text-sm"
      data-status={status}
      data-testid="draft-action-bar"
      ref={barRef}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            aria-atomic="true"
            aria-live={status === "error" ? "assertive" : "polite"}
            className={cn(
              "flex min-h-5 items-center gap-1.5 font-medium",
              presentation.className,
            )}
            role={status === "error" ? "alert" : "status"}
          >
            <StatusIcon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                status === "saving" && "motion-safe:animate-spin",
              )}
            />
            <span>{statusMessage ?? presentation.message}</span>
          </p>
          {disabledReason ? (
            <p className="mt-1 text-sm leading-5 text-foreground-muted" id={reasonId}>
              {disabledReason}
            </p>
          ) : null}
        </div>

        {confirmingDiscard ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="font-medium text-foreground">Discard unsaved changes?</span>
            <Button
              data-discard-control="cancel"
              onClick={handleCancelDiscard}
              type="button"
              variant="ghost"
            >
              Keep editing
            </Button>
            <Button onClick={handleConfirmDiscard} type="button">
              Discard changes
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button
              data-discard-control="trigger"
              disabled={actionsDisabled}
              onClick={handleRequestDiscard}
              type="button"
              variant="ghost"
            >
              {discardLabel}
            </Button>
            <Button
              aria-describedby={saveDescribedBy}
              disabled={saveDisabled}
              onClick={onSave}
              type="button"
              variant="primary"
            >
              {saveLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
