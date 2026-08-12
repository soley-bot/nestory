"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { DraftStatus } from "@/components/ui/draft-action-bar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type DrawerDraftGuard = {
  onDiscard?: () => void;
  status: DraftStatus;
};

type DrawerDismissalContextValue = {
  portalContainer: HTMLElement | null;
  registerDraftGuard: (guard: DrawerDraftGuard) => () => void;
  requestClose: () => void;
};

const DrawerDismissalContext =
  React.createContext<DrawerDismissalContextValue | null>(null);

export function useDrawerDraftGuard(guard: DrawerDraftGuard) {
  const context = React.useContext(DrawerDismissalContext);

  React.useEffect(() => context?.registerDraftGuard(guard), [context, guard]);
}

export function useDrawerCloseRequest(fallback: () => void) {
  const context = React.useContext(DrawerDismissalContext);
  return context?.requestClose ?? fallback;
}

export function useDrawerPortalContainer() {
  return React.useContext(DrawerDismissalContext)?.portalContainer ?? null;
}

type SideDrawerProps = {
  children: React.ReactNode;
  description?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  open: boolean;
  size?: "default" | "preview";
  summary?: React.ReactNode;
  title: string;
};

export function SideDrawer({
  children,
  description,
  footer,
  onClose,
  open,
  size = "default",
  summary,
  title,
}: SideDrawerProps) {
  const draftGuardRef = React.useRef<DrawerDraftGuard | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = React.useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [dismissalDecision, setDismissalDecision] = React.useState<
    "dirty" | "saving" | null
  >(null);
  const [portalContainer, setPortalContainer] =
    React.useState<HTMLDivElement | null>(null);

  const restorePreviousFocus = React.useCallback(() => {
    const previouslyFocusedElement = previouslyFocusedElementRef.current;
    previouslyFocusedElementRef.current = null;

    window.setTimeout(() => {
      if (previouslyFocusedElement?.isConnected) {
        previouslyFocusedElement.focus();
      }
    }, 0);
  }, []);

  const registerDraftGuard = React.useCallback((guard: DrawerDraftGuard) => {
    draftGuardRef.current = guard;
    return () => {
      if (draftGuardRef.current === guard) draftGuardRef.current = null;
    };
  }, []);

  const requestClose = React.useCallback(() => {
    const guard = draftGuardRef.current;

    if (guard?.status === "saving") {
      setDismissalDecision("saving");
      return;
    }

    if (guard?.status === "dirty" || guard?.status === "error") {
      setDismissalDecision("dirty");
      return;
    }

    setDismissalDecision(null);
    onClose();
    restorePreviousFocus();
  }, [onClose, restorePreviousFocus]);

  const discardAndClose = React.useCallback(() => {
    const onDiscard = draftGuardRef.current?.onDiscard;
    setDismissalDecision(null);
    if (onDiscard) onDiscard();
    else onClose();
    restorePreviousFocus();
  }, [onClose, restorePreviousFocus]);

  const cancelDismissal = React.useCallback(() => {
    setDismissalDecision(null);
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, []);

  const dismissalContext = React.useMemo(
    () => ({ portalContainer, registerDraftGuard, requestClose }),
    [portalContainer, registerDraftGuard, requestClose],
  );

  return (
    <DrawerDismissalContext.Provider value={dismissalContext}>
      <Sheet
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
        open={open}
      >
        <SheetContent
          aria-modal="true"
          className="w-full max-w-none gap-0 overflow-hidden p-0"
          inert={dismissalDecision ? true : undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restorePreviousFocus();
          }}
          onOpenAutoFocus={() => {
            previouslyFocusedElementRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          showCloseButton={false}
          style={{
            maxWidth: "92vw",
            width: size === "preview" ? "520px" : "720px",
          }}
        >
          <aside className="flex h-full min-h-0 flex-col">
            <SheetHeader
              className="relative shrink-0 gap-1 p-5 pr-14 text-left"
              data-slot="drawer-header"
            >
              <SheetTitle className="text-lg">{title}</SheetTitle>
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : null}
              <Button
                aria-label="Close drawer"
                className="absolute right-4 top-4"
                onClick={requestClose}
                ref={closeButtonRef}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </SheetHeader>

            <div
              className="min-h-0 flex-1 overflow-y-auto text-sm"
              data-slot="drawer-content"
            >
              {children}
            </div>

            {summary ? (
              <div
                className="shrink-0 border-t bg-muted/50 px-5 py-3 text-sm"
                data-slot="drawer-summary"
              >
                {summary}
              </div>
            ) : null}

            {footer ? (
              <footer
                className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-3 text-sm"
                data-slot="drawer-footer"
              >
                {footer}
              </footer>
            ) : null}

            <div
              className="contents"
              data-slot="drawer-portals"
              ref={setPortalContainer}
            />
          </aside>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        ariaLabel={
          dismissalDecision === "dirty" ? "Unsaved changes" : "Save in progress"
        }
        cancelLabel={
          dismissalDecision === "dirty" ? "Keep editing" : "Continue waiting"
        }
        confirmLabel={
          dismissalDecision === "dirty" ? "Discard changes" : undefined
        }
        description={
          dismissalDecision === "dirty"
            ? "Your changes will be lost and cannot be recovered."
            : "Stay in this drawer until the save finishes."
        }
        onCancel={cancelDismissal}
        onConfirm={dismissalDecision === "dirty" ? discardAndClose : undefined}
        open={dismissalDecision !== null}
        title={
          dismissalDecision === "dirty"
            ? "Discard unsaved changes?"
            : "Saving is still in progress"
        }
      />
    </DrawerDismissalContext.Provider>
  );
}
