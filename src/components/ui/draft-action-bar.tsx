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
  allowDiscardWhenClean?: boolean;
  allowSaveWhenClean?: boolean;
  describedBy?: string;
  confirmDiscard?: boolean;
  disabledReason?: string;
  discardLabel?: string;
  focusOnError?: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saveLabel?: string;
  showSave?: boolean;
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

const discardActionableStatuses = new Set<DraftStatus>(["dirty", "error"]);

function joinIds(...ids: Array<string | undefined>) {
  const joinedIds = ids
    .flatMap((id) => id?.trim().split(/\s+/) ?? [])
    .filter(Boolean)
    .join(" ");

  return joinedIds || undefined;
}

export function DraftActionBar({
  allowDiscardWhenClean = false,
  allowSaveWhenClean = false,
  describedBy,
  confirmDiscard = true,
  disabledReason,
  discardLabel = "Discard",
  focusOnError = false,
  onDiscard,
  onSave,
  saveLabel = "Save changes",
  showSave = true,
  status,
  statusMessage,
}: DraftActionBarProps) {
  const [confirmationFocused, setConfirmationFocused] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState<DraftStatus | null>(null);
  const [focusStatusAfterInvalidation, setFocusStatusAfterInvalidation] =
    useState(false);
  const [restoreDiscardFocus, setRestoreDiscardFocus] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const reasonId = useId();
  const presentation = statusPresentation[status];
  const StatusIcon = presentation.icon;
  const isPending = status === "saving";
  const isDiscardActionable = discardActionableStatuses.has(status);
  const confirmingDiscard =
    confirmingStatus === status && isDiscardActionable;
  const discardDisabled =
    isPending || (!isDiscardActionable && !allowDiscardWhenClean);
  const saveDisabled =
    isPending ||
    Boolean(disabledReason) ||
    (!isDiscardActionable && !allowSaveWhenClean);
  const saveDescribedBy = joinIds(describedBy, disabledReason ? reasonId : undefined);

  if (confirmingStatus !== null && confirmingStatus !== status) {
    setFocusStatusAfterInvalidation(confirmationFocused);
    setConfirmationFocused(false);
    setConfirmingStatus(null);
    setRestoreDiscardFocus(false);
  }

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

  useEffect(() => {
    if (!focusStatusAfterInvalidation) {
      return;
    }

    requestAnimationFrame(() => {
      statusRef.current?.focus();
    });
  }, [focusStatusAfterInvalidation]);

  useEffect(() => {
    if (!focusOnError || status !== "error") {
      return;
    }

    requestAnimationFrame(() => {
      statusRef.current?.focus();
    });
  }, [focusOnError, status, statusMessage]);

  function handleConfirmDiscard() {
    setConfirmationFocused(false);
    setConfirmingStatus(null);
    setFocusStatusAfterInvalidation(false);
    setRestoreDiscardFocus(false);

    if (isDiscardActionable) {
      onDiscard();
      requestAnimationFrame(() => {
        statusRef.current?.focus();
      });
    }
  }

  function handleCancelDiscard() {
    setConfirmationFocused(false);
    setConfirmingStatus(null);
    setFocusStatusAfterInvalidation(false);
    setRestoreDiscardFocus(true);
  }

  function handleRequestDiscard() {
    if ((!isDiscardActionable && allowDiscardWhenClean) || !confirmDiscard) {
      onDiscard();
      return;
    }

    setConfirmationFocused(false);
    setFocusStatusAfterInvalidation(false);
    setRestoreDiscardFocus(false);
    setConfirmingStatus(status);
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
          <div
            aria-atomic="true"
            aria-live={status === "error" ? "assertive" : "polite"}
            className={cn(
              "min-h-5 font-medium",
              presentation.className,
            )}
            ref={statusRef}
            role={status === "error" ? "alert" : "status"}
            tabIndex={-1}
          >
            <span className="flex items-center gap-1.5">
              <StatusIcon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0",
                  status === "saving" && "motion-safe:animate-spin",
                )}
              />
              <span>{statusMessage ?? presentation.message}</span>
            </span>
            {disabledReason ? (
              <span
                className="mt-1 block text-sm font-normal leading-5 text-foreground-muted"
                id={reasonId}
              >
                {disabledReason}
              </span>
            ) : null}
          </div>
        </div>

        {confirmingDiscard ? (
          <div
            className="flex flex-wrap items-center justify-end gap-2"
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;

              if (
                !(nextTarget instanceof Node) ||
                !event.currentTarget.contains(nextTarget)
              ) {
                setConfirmationFocused(false);
              }
            }}
            onFocusCapture={() => {
              setConfirmationFocused(true);
            }}
          >
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
              disabled={discardDisabled}
              onClick={handleRequestDiscard}
              type="button"
              variant="ghost"
            >
              {discardLabel}
            </Button>
            {showSave ? (
              <Button
                aria-describedby={saveDescribedBy}
                disabled={saveDisabled}
                onClick={onSave}
                type="button"
                variant="primary"
              >
                {saveLabel}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
