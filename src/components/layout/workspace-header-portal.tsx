"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export function WorkspaceHeaderPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const target = mounted ? document.getElementById("workspace-page-tools") : null;

  return target ? createPortal(children, target) : children;
}
