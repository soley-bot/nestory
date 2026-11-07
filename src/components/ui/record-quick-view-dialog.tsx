"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { OverlayDismissalContext, discardOverlayDraftGuards, getOverlayDraftDecision, type OverlayDraftGuard } from "@/components/ui/overlay-dismissal-context";
import { OverlayPortalContainerProvider } from "@/components/ui/overlay-portal-container";
import { cn } from "@/lib/utils";

type RecordQuickViewDialogProps = {
  children: ReactNode;
  label: string;
  onClose: () => void;
  open: boolean;
  size?: "default" | "wide";
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
  size = "default",
}: RecordQuickViewDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const guardsRef = useRef(new Map<symbol, OverlayDraftGuard>());
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [dismissalDecision, setDismissalDecision] = useState<"dirty" | "saving" | null>(null);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    setDismissalDecision(null);
  }

  const registerDraftGuard = useCallback((guard: OverlayDraftGuard) => {
    const key = Symbol("draft guard");
    guardsRef.current.set(key, guard);
    return () => { guardsRef.current.delete(key); };
  }, []);

  const requestClose = useCallback(() => {
    const decision = getOverlayDraftDecision(guardsRef.current.values());
    if (decision) {
      setDismissalDecision(decision);
    } else {
      setDismissalDecision(null);
      onCloseRef.current();
    }
  }, []);
  const dismissalContext = useMemo(() => ({ portalContainer, registerDraftGuard, requestClose }),
    [portalContainer, registerDraftGuard, requestClose]);

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
      if (dismissalDecision) return;
      if (event.key === "Escape") {
        if (
          event.target instanceof Node &&
          !dialogRef.current?.contains(event.target) &&
          !portalContainer?.contains(event.target)
        ) {
          return;
        }

        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      if (event.target instanceof Node && portalContainer?.contains(event.target)) return;

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
  }, [dismissalDecision, open, portalContainer, requestClose]);

  if (!open) {
    return null;
  }

  return (
    <OverlayDismissalContext.Provider value={dismissalContext}>
    <OverlayPortalContainerProvider value={portalContainer}>
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-3 backdrop-blur-[2px] sm:p-6"
      data-slot="record-quick-view-overlay"
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        data-slot="record-quick-view-backdrop"
        onClick={requestClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-label={label}
        aria-modal="true"
        className={cn(
          "record-quick-view-dialog relative z-10 flex max-h-[min(82dvh,720px)] w-full flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl outline-none",
          size === "wide" ? "max-w-[760px]" : "max-w-[640px]",
        )}
        data-slot="record-quick-view-dialog"
        inert={dismissalDecision ? true : undefined}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <Button
          aria-label="Close quick view"
          className="absolute right-3 top-3 z-20 h-8 w-8 bg-card/90 px-0 shadow-sm backdrop-blur-sm"
          onClick={requestClose}
          ref={closeButtonRef}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" size={16} />
        </Button>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-card text-sm"
          data-slot="record-quick-view-content"
        >
          {children}
        </div>
      </section>
      <div className="contents" data-slot="record-quick-view-portals" ref={setPortalContainer} />
    </div>
    </OverlayPortalContainerProvider>
    <ConfirmationDialog
      ariaLabel={dismissalDecision === "dirty" ? "Unsaved changes" : "Save in progress"}
      cancelLabel={dismissalDecision === "dirty" ? "Keep editing" : "Continue waiting"}
      confirmLabel={dismissalDecision === "dirty" ? "Discard changes" : undefined}
      description={dismissalDecision === "dirty"
        ? "Your changes will be lost and cannot be recovered."
        : "Stay in this quick view until the save finishes."}
      onCancel={() => {
        setDismissalDecision(null);
        window.setTimeout(() => closeButtonRef.current?.focus(), 0);
      }}
      onConfirm={dismissalDecision === "dirty" ? (event) => {
        if (getOverlayDraftDecision(guardsRef.current.values()) === "saving") {
          event.preventDefault();
          setDismissalDecision("saving");
          return;
        }
        setDismissalDecision(null);
        discardOverlayDraftGuards(guardsRef.current.values(), () => onCloseRef.current());
      } : undefined}
      open={dismissalDecision !== null}
      title={dismissalDecision === "dirty" ? "Discard unsaved changes?" : "Saving is still in progress"}
    />
    </OverlayDismissalContext.Provider>
  );
}
