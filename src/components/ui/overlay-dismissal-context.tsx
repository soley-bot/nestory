"use client";

import * as React from "react";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

export type OverlayDraftGuard = {
  onDiscard?: () => void;
  status: DraftStatus;
};

export function getOverlayDraftDecision(guards: Iterable<OverlayDraftGuard>) {
  const statuses = Array.from(guards, (guard) => guard.status);
  if (statuses.includes("saving")) return "saving";
  if (statuses.some((status) => status === "dirty" || status === "error")) return "dirty";
  return null;
}

export function discardOverlayDraftGuards(
  guards: Iterable<OverlayDraftGuard>,
  fallback: () => void,
) {
  const callbacks = new Set(Array.from(guards, (guard) => guard.onDiscard).filter(
    (callback): callback is () => void => callback !== undefined,
  ));
  if (callbacks.size === 0) fallback();
  else callbacks.forEach((callback) => callback());
}

type OverlayDismissalContextValue = {
  portalContainer: HTMLElement | null;
  registerDraftGuard: (guard: OverlayDraftGuard) => () => void;
  requestClose: () => void;
};

export const OverlayDismissalContext =
  React.createContext<OverlayDismissalContextValue | null>(null);

export function useOverlayDraftGuard(guard: OverlayDraftGuard) {
  const context = React.useContext(OverlayDismissalContext);

  React.useEffect(() => context?.registerDraftGuard(guard), [context, guard]);
}

export function useOverlayCloseRequest(fallback: () => void) {
  const context = React.useContext(OverlayDismissalContext);
  return context?.requestClose ?? fallback;
}

function formSnapshot(form: HTMLFormElement) {
  return JSON.stringify(Array.from(new FormData(form).entries()).map(([name, value]) =>
    [name, value instanceof File
      ? value.name === "" && value.size === 0
        ? ["", 0, value.type]
        : [value.name, value.size, value.type, value.lastModified]
      : value],
  ));
}

/** Registers an ordinary form with its enclosing drawer, modal, or quick view. */
export function useOverlayFormDraftGuard(
  formRef: React.RefObject<HTMLFormElement | null>,
  pending: boolean,
  saved = false,
) {
  const baselineRef = React.useRef<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const previousSavedRef = React.useRef(saved);
  const previousPendingRef = React.useRef(pending);
  const guard = React.useMemo<OverlayDraftGuard>(() => ({
    status: pending ? "saving" : dirty ? "dirty" : saved ? "saved" : "clean",
  }), [dirty, pending, saved]);
  useOverlayDraftGuard(guard);

  React.useLayoutEffect(() => {
    if (!pending && formRef.current && baselineRef.current === null) {
      baselineRef.current = formSnapshot(formRef.current);
    }
  }, [formRef, pending]);

  React.useEffect(() => {
    if (saved && (!previousSavedRef.current || previousPendingRef.current) && !pending && formRef.current) {
      baselineRef.current = formSnapshot(formRef.current);
      setDirty(false);
    }
    previousSavedRef.current = saved;
    previousPendingRef.current = pending;
  }, [formRef, pending, saved]);

  const updateDirty = React.useCallback(() => {
    queueMicrotask(() => {
      if (!formRef.current) return;
      const snapshot = formSnapshot(formRef.current);
      if (baselineRef.current === null) baselineRef.current = snapshot;
      setDirty(snapshot !== baselineRef.current);
    });
  }, [formRef]);

  return { onChangeCapture: updateDirty, onInput: updateDirty, refreshDirty: updateDirty };
}
