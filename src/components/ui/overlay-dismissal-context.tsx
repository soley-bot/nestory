"use client";

import * as React from "react";
import type { DraftStatus } from "@/components/ui/draft-action-bar";

export type OverlayDraftGuard = {
  onDiscard?: () => void;
  status: DraftStatus;
};

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
