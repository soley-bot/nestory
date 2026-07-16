"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

type DrawerDraftGuard = {
  onDiscard?: () => void;
  status: DraftStatus;
};

type DrawerDismissalContextValue = {
  portalContainer: HTMLElement | null;
  registerDraftGuard: (guard: DrawerDraftGuard) => () => void;
  requestClose: () => void;
};

const DrawerDismissalContext = createContext<DrawerDismissalContextValue | null>(
  null,
);

export function useDrawerDraftGuard(guard: DrawerDraftGuard) {
  const context = useContext(DrawerDismissalContext);

  useEffect(() => {
    return context?.registerDraftGuard(guard);
  }, [context, guard]);
}

export function useDrawerCloseRequest(fallback: () => void) {
  const context = useContext(DrawerDismissalContext);

  return context?.requestClose ?? fallback;
}

export function useDrawerPortalContainer() {
  return useContext(DrawerDismissalContext)?.portalContainer ?? null;
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
  const drawerRef = useRef<HTMLElement>(null);
  const draftGuardRef = useRef<DrawerDraftGuard | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const [dismissalDecision, setDismissalDecision] = useState<
    "dirty" | "saving" | null
  >(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const titleId = useId();
  const descriptionId = useId();
  const registerDraftGuard = useCallback((guard: DrawerDraftGuard) => {
    draftGuardRef.current = guard;

    return () => {
      if (draftGuardRef.current === guard) {
        draftGuardRef.current = null;
      }
    };
  }, []);
  const requestClose = useCallback(() => {
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
  }, [onClose]);
  const dismissalContext = useMemo(
    () => ({ portalContainer, registerDraftGuard, requestClose }),
    [portalContainer, registerDraftGuard, requestClose],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    requestAnimationFrame(() => {
      drawerRef.current?.focus();
    });

    return () => {
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

    const getFocusableElements = () => {
      if (!drawerRef.current) {
        return [];
      }

      return Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
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
          !element.getAttribute("aria-hidden") &&
          element.offsetParent !== null,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dismissalDecision) {
          setDismissalDecision(null);
        } else {
          requestClose();
        }
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();

      if (focusableElements.length === 0) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusStartedOnDrawer = activeElement === drawerRef.current;
      const focusStartedOutsideDrawer =
        activeElement !== null && !drawerRef.current?.contains(activeElement);

      if (
        event.shiftKey &&
        (focusStartedOnDrawer ||
          focusStartedOutsideDrawer ||
          activeElement === firstFocusableElement)
      ) {
        event.preventDefault();
        lastFocusableElement.focus();
      } else if (
        !event.shiftKey &&
        (focusStartedOnDrawer ||
          focusStartedOutsideDrawer ||
          activeElement === lastFocusableElement)
      ) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissalDecision, open, requestClose]);

  if (!open) {
    return null;
  }

  return (
    <DrawerDismissalContext.Provider value={dismissalContext}>
      <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed bottom-0 left-0 top-0 z-50 flex justify-end bg-background/70 backdrop-blur-[2px]"
      role="dialog"
      style={{ right: "var(--removed-body-scroll-bar-size, 0px)" }}
      {...(description ? { "aria-describedby": descriptionId } : {})}
    >
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={requestClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        className={cn(
          "relative flex h-full w-full flex-col border-l border-border bg-background shadow-xl outline-none",
          size === "preview"
            ? "max-w-[min(100vw,520px)]"
            : "max-w-[min(100vw,680px)]",
        )}
        ref={drawerRef}
        tabIndex={-1}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4"
          data-slot="drawer-header"
        >
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1 text-sm leading-5 text-foreground-muted"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            aria-label="Close drawer"
            className="h-8 w-8 shrink-0 px-0"
            onClick={requestClose}
            type="button"
            variant="ghost"
          >
            <X size={16} />
          </Button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-surface text-sm"
          data-slot="drawer-content"
        >
          {children}
        </div>
        {summary ? (
          <div
            className="shrink-0 border-t border-border bg-surface-raised px-5 py-3 text-sm"
            data-slot="drawer-summary"
          >
            {summary}
          </div>
        ) : null}
        {dismissalDecision ? (
          <div
            aria-live={dismissalDecision === "saving" ? "polite" : undefined}
            className="shrink-0 border-t border-border bg-surface-raised px-5 py-3 text-sm"
            data-slot="drawer-dismissal"
            aria-label={dismissalDecision === "dirty" ? "Unsaved changes" : undefined}
            role={dismissalDecision === "dirty" ? "alertdialog" : "status"}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-foreground">
                {dismissalDecision === "dirty"
                  ? "Discard unsaved changes?"
                  : "Saving is still in progress."}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  autoFocus
                  onClick={() => setDismissalDecision(null)}
                  type="button"
                  variant="ghost"
                >
                  {dismissalDecision === "dirty" ? "Keep editing" : "Continue waiting"}
                </Button>
                {dismissalDecision === "dirty" ? (
                  <Button
                    onClick={() => {
                      const onDiscard = draftGuardRef.current?.onDiscard;

                      setDismissalDecision(null);
                      if (onDiscard) {
                        onDiscard();
                      } else {
                        onClose();
                      }
                    }}
                    type="button"
                  >
                    Discard changes
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {footer ? (
          <footer
            className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 text-sm"
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
      </div>
    </DrawerDismissalContext.Provider>
  );
}
