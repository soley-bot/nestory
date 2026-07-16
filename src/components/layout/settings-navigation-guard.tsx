"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

type NavigationDestination = {
  href: string;
  label: string;
};

type DraftController = {
  discard: () => void;
};

type PendingNavigation = NavigationDestination & {
  mode: "dirty" | "saving";
  trigger: HTMLAnchorElement;
};

type SettingsNavigationGuardValue = {
  handleNavigationClick: (
    event: MouseEvent<HTMLAnchorElement>,
    destination: NavigationDestination,
  ) => void;
  registerDraftController: (controller: DraftController | null) => void;
  setDraftStatus: (status: DraftStatus) => void;
  suppressErrorFocus: boolean;
};

const SettingsNavigationGuardContext =
  createContext<SettingsNavigationGuardValue | null>(null);

export function SettingsNavigationGuardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const draftControllerRef = useRef<DraftController | null>(null);
  const draftStatusRef = useRef<DraftStatus>("clean");
  const pendingNavigationRef = useRef<PendingNavigation | undefined>(undefined);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();

  const setDraftStatus = useCallback(
    (status: DraftStatus) => {
      draftStatusRef.current = status;
      const pending = pendingNavigationRef.current;

      if (!pending || pending.mode !== "saving") {
        return;
      }

      if (status === "dirty") {
        const dirtyPending = { ...pending, mode: "dirty" as const };
        pendingNavigationRef.current = dirtyPending;
        setPendingNavigation(dirtyPending);
        return;
      }

      if (status === "saved" || status === "error") {
        pendingNavigationRef.current = undefined;
        setPendingNavigation(undefined);

        if (status === "saved") {
          router.push(pending.href);
        }
      }
    },
    [router],
  );

  const registerDraftController = useCallback(
    (controller: DraftController | null) => {
      draftControllerRef.current = controller;
    },
    [],
  );

  const closeAndRestoreTrigger = useCallback(() => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = undefined;
    setPendingNavigation(undefined);

    if (pending?.trigger.isConnected) {
      requestAnimationFrame(() => pending.trigger.focus());
    }
  }, []);

  const discardAndNavigate = useCallback(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || pending.mode !== "dirty") {
      return;
    }

    pendingNavigationRef.current = undefined;
    setPendingNavigation(undefined);
    draftControllerRef.current?.discard();
    router.push(pending.href);
  }, [router]);

  const handleNavigationClick = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      destination: NavigationDestination,
    ) => {
      const status = draftStatusRef.current;
      if (status === "clean" || status === "saved") {
        return;
      }

      event.preventDefault();
      if (pendingNavigationRef.current) {
        return;
      }

      const pending: PendingNavigation = {
        ...destination,
        mode: status === "saving" ? "saving" : "dirty",
        trigger: event.currentTarget,
      };
      pendingNavigationRef.current = pending;
      setPendingNavigation(pending);
    },
    [],
  );

  useEffect(() => {
    if (!pendingNavigation) {
      return;
    }

    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-navigation-guard-cancel]")
        ?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreTrigger();
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

      if (event.shiftKey && (outside || active === dialogRef.current || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === dialogRef.current || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeAndRestoreTrigger, pendingNavigation]);

  const value = useMemo<SettingsNavigationGuardValue>(
    () => ({
      handleNavigationClick,
      registerDraftController,
      setDraftStatus,
      suppressErrorFocus: pendingNavigation?.mode === "saving",
    }),
    [
      handleNavigationClick,
      pendingNavigation,
      registerDraftController,
      setDraftStatus,
    ],
  );

  return (
    <SettingsNavigationGuardContext.Provider value={value}>
      <div
        aria-hidden={pendingNavigation ? "true" : undefined}
        data-testid="settings-navigation-background"
        inert={pendingNavigation ? true : undefined}
        onClickCapture={
          pendingNavigation
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
              }
            : undefined
        }
      >
        {children}
      </div>

      {pendingNavigation ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 p-4">
          <div
            aria-describedby={dialogDescriptionId}
            aria-labelledby={dialogTitleId}
            aria-modal="true"
            className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-4 shadow-xl outline-none"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h2 className="text-sm font-semibold text-foreground" id={dialogTitleId}>
              Open {pendingNavigation.label}?
            </h2>
            <p
              className="mt-2 text-sm text-foreground-muted"
              id={dialogDescriptionId}
            >
              {pendingNavigation.mode === "saving"
                ? "A save is still in progress. Stay on this section until it finishes."
                : "This section has unsaved changes. Discard them before leaving."}
            </p>
            <div
              className="mt-4 grid gap-2 sm:flex sm:items-center sm:justify-end"
              data-testid="settings-navigation-actions"
            >
              <Button
                className="w-full sm:w-auto"
                data-navigation-guard-cancel
                onClick={closeAndRestoreTrigger}
                variant="ghost"
              >
                Keep editing
              </Button>
              {pendingNavigation.mode === "dirty" ? (
                <Button
                  className="w-full sm:w-auto"
                  onClick={discardAndNavigate}
                  variant="primary"
                >
                  Discard and open {pendingNavigation.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </SettingsNavigationGuardContext.Provider>
  );
}

export function useSettingsNavigationGuard() {
  return useContext(SettingsNavigationGuardContext);
}
