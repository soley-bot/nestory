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
import { getSettingsDestinations } from "@/features/organization/settings-navigation";

type NavigationDestination = {
  href: string;
  label: string;
};

type DraftController = {
  discard: () => void;
};

type PendingNavigation = NavigationDestination & {
  mode: "dirty" | "saving";
  trigger: HTMLElement | null;
  navigate: () => void;
};

// Keep the guard usable with browsers and TypeScript DOM libraries that do not
// expose the Navigation API yet. Never polyfill or rewrite browser history.
type SettingsNavigateEvent = Event & {
  canIntercept: boolean;
  hashChange: boolean;
  downloadRequest: string | null;
  formData: FormData | null;
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string; key: string };
};
type SettingsBrowserNavigation = EventTarget & {
  traverseTo: (key: string) => { finished: Promise<unknown> };
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

      if (!pending) {
        return;
      }

      if (status === "clean" || status === "saved") {
        pendingNavigationRef.current = undefined;
        setPendingNavigation(undefined);
        draftStatusRef.current = "clean";
        pending.navigate();
        return;
      }

      if (status === "dirty" || status === "saving") {
        if (pending.mode !== status) {
          const nextPending = { ...pending, mode: status };
          pendingNavigationRef.current = nextPending;
          setPendingNavigation(nextPending);
        }
        return;
      }

      if (pending.mode === "saving" && status === "error") {
        pendingNavigationRef.current = undefined;
        setPendingNavigation(undefined);
      }
    },
    [],
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

    const trigger = pending?.trigger;
    if (trigger?.isConnected) {
      requestAnimationFrame(() => trigger.focus());
    }
  }, []);

  const discardAndNavigate = useCallback(() => {
    const pending = pendingNavigationRef.current;
    if (!pending || pending.mode !== "dirty" || draftStatusRef.current === "saving") {
      return;
    }

    pendingNavigationRef.current = undefined;
    setPendingNavigation(undefined);
    draftControllerRef.current?.discard();
    draftStatusRef.current = "clean";
    pending.navigate();
  }, []);

  const requestNavigation = useCallback((destination: NavigationDestination, trigger: HTMLElement | null, navigate: () => void) => {
    const status = draftStatusRef.current;
    if (status === "clean" || status === "saved") return false;
    if (!pendingNavigationRef.current) {
      const pending: PendingNavigation = {
        ...destination,
        mode: status === "saving" ? "saving" : "dirty",
        trigger,
        navigate,
      };
      pendingNavigationRef.current = pending;
      setPendingNavigation(pending);
    }
    return true;
  }, []);

  const handleNavigationClick = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      destination: NavigationDestination,
    ) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (requestNavigation(destination, event.currentTarget, () => router.push(destination.href))) event.preventDefault();
    },
    [requestNavigation, router],
  );

  useEffect(() => {
    // Capture links outside the shell too, including breadcrumbs, context links,
    // and the app sidebar. New tabs, downloads, and in-page anchors keep working.
    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);
      if (url.pathname === current.pathname && url.search === current.search && url.origin === current.origin) return;
      const internal = url.origin === current.origin && (url.protocol === "https:" || url.protocol === "http:");
      if (!internal && url.protocol !== "https:" && url.protocol !== "http:") return;
      const href = internal ? `${url.pathname}${url.search}${url.hash}` : url.href;
      const label = getSettingsDestinations("super_admin").find((item) => item.href === url.pathname)?.label ?? link.textContent?.trim() ?? "this page";
      if (requestNavigation({ href, label }, link, () => internal ? router.push(href) : window.location.assign(href))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const status = draftStatusRef.current;
      if (status === "clean" || status === "saved") return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [requestNavigation, router]);

  useEffect(() => {
    const navigation = (window as Window & { navigation?: SettingsBrowserNavigation }).navigation;
    if (!navigation) return;
    const handleNavigate = (browserEvent: Event) => {
      const event = browserEvent as SettingsNavigateEvent;
      // Let the browser own document departures and uncancelable traversals.
      // No extra history entries or patches to Next's history state.
      if (!event.cancelable || !event.canIntercept || event.hashChange || event.downloadRequest || event.formData || event.navigationType === "reload") return;
      const url = new URL(event.destination.url);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      const key = event.destination.key;
      const href = `${url.pathname}${url.search}${url.hash}`;
      const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const navigate = event.navigationType === "traverse"
        ? () => { void navigation.traverseTo(key).finished.catch(() => undefined); }
        : () => event.navigationType === "replace" ? router.replace(href) : router.push(href);
      if (requestNavigation({ href, label: "this page" }, trigger, navigate)) event.preventDefault();
    };
    navigation.addEventListener("navigate", handleNavigate);
    return () => navigation.removeEventListener("navigate", handleNavigate);
  }, [requestNavigation, router]);

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
            className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl outline-none"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h2 className="text-sm font-semibold text-foreground" id={dialogTitleId}>
              Open {pendingNavigation.label}?
            </h2>
            <p
              className="mt-2 text-sm text-muted-foreground"
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
                className="min-h-11 w-full sm:min-h-9 sm:w-auto"
                data-navigation-guard-cancel
                onClick={closeAndRestoreTrigger}
                variant="ghost"
              >
                Keep editing
              </Button>
              {pendingNavigation.mode === "dirty" ? (
                <Button
                  className="min-h-11 w-full sm:min-h-9 sm:w-auto"
                  onClick={discardAndNavigate}
                  variant="default"
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
