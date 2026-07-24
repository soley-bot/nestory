"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type ConfirmationDialogProps = {
  ariaLabel?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  onCancel: () => void;
  onConfirm?: () => void;
  open: boolean;
  title: string;
};

export function ConfirmationDialog({
  ariaLabel,
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-confirmation-cancel]")
        ?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = dialogRef.current
        ? Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              [
                "a[href]",
                "button:not([disabled])",
                "textarea:not([disabled])",
                "input:not([disabled])",
                "select:not([disabled])",
                "[tabindex]:not([tabindex='-1'])",
              ].join(","),
            ),
          ).filter(
            (element) =>
              !element.hasAttribute("disabled") &&
              element.getAttribute("aria-hidden") !== "true",
          )
        : [];

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const outside = active !== null && !dialogRef.current?.contains(active);

      if (
        event.shiftKey &&
        (outside || active === dialogRef.current || active === first)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (outside || active === dialogRef.current || active === last)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        requestAnimationFrame(() => previousFocus.focus());
      }
      previousFocusRef.current = null;
    };
  }, [onCancel, open]);

  if (!open || !mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 p-4 backdrop-blur-[2px]">
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-describedby={descriptionId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        aria-modal="true"
        className="relative w-full max-w-sm rounded-lg border border-border bg-surface-raised p-4 shadow-xl outline-none"
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <h2 className="text-sm font-semibold text-foreground" id={titleId}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-5 text-foreground-muted" id={descriptionId}>
          {description}
        </p>
        <div className="mt-4 grid gap-2 sm:flex sm:items-center sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            data-confirmation-cancel
            onClick={onCancel}
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          {confirmLabel && onConfirm ? (
            <Button
              className="w-full sm:w-auto"
              onClick={onConfirm}
              variant="primary"
            >
              {confirmLabel}
            </Button>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
