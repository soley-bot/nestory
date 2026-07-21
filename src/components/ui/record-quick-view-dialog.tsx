"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecordQuickViewDialogProps = {
  children: ReactNode;
  label: string;
  onClose: () => void;
  open: boolean;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function RecordQuickViewDialog({
  children,
  label,
  onClose,
  open,
}: RecordQuickViewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);

      const previouslyFocusedElement = previouslyFocusedElementRef.current;

      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }

      previouslyFocusedElementRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function getFocusableElements() {
      if (!dialogRef.current) {
        return [];
      }

      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.offsetParent !== null,
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusStartedOutsideDialog =
        activeElement !== null && !dialogRef.current?.contains(activeElement);

      if (
        event.shiftKey &&
        (activeElement === dialogRef.current ||
          activeElement === firstFocusableElement ||
          focusStartedOutsideDialog)
      ) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === dialogRef.current ||
          activeElement === lastFocusableElement ||
          focusStartedOutsideDialog)
      ) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-3 backdrop-blur-[2px] sm:p-6"
      data-slot="record-quick-view-overlay"
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        data-slot="record-quick-view-backdrop"
        onClick={() => onCloseRef.current()}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label={label}
        aria-modal="true"
        className="record-quick-view-dialog relative z-10 flex max-h-[min(82dvh,720px)] w-full max-w-[640px] flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        data-slot="record-quick-view-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <Button
          aria-label="Close quick view"
          className="absolute right-3 top-3 z-20 h-8 w-8 bg-surface/90 px-0 shadow-sm backdrop-blur-sm"
          onClick={() => onCloseRef.current()}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" size={16} />
        </Button>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-surface text-sm"
          data-slot="record-quick-view-content"
        >
          {children}
        </div>
      </section>
    </div>
  );
}
