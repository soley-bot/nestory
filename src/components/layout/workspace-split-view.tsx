"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { SideDrawer } from "@/components/ui/side-drawer";
import { cn } from "@/lib/utils";

const WIDE_WORKSPACE_QUERY = "(min-width: 1024px)";

type WorkspaceSplitViewProps = {
  list: ReactNode;
  inspector?: ReactNode;
  inspectorLabel: string;
  inspectorOpen: boolean;
  onInspectorOpenChange?: (open: boolean) => void;
};

function subscribeToWideWorkspace(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(WIDE_WORKSPACE_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getWideWorkspaceSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return true;
  }

  return window.matchMedia(WIDE_WORKSPACE_QUERY).matches;
}

function getWideWorkspaceServerSnapshot() {
  return true;
}

export function WorkspaceSplitView({
  inspector,
  inspectorLabel,
  inspectorOpen,
  list,
  onInspectorOpenChange,
}: WorkspaceSplitViewProps) {
  const isWideWorkspace = useSyncExternalStore(
    subscribeToWideWorkspace,
    getWideWorkspaceSnapshot,
    getWideWorkspaceServerSnapshot,
  );
  const showInspector = inspectorOpen && inspector !== undefined;
  const showDockedInspector = showInspector && isWideWorkspace;
  const showInspectorDrawer = showInspector && !isWideWorkspace;

  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-surface-raised",
        showDockedInspector &&
          "lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]",
      )}
      data-slot="workspace-split-view"
    >
      <section
        aria-label="Workspace content"
        className="min-h-0 min-w-0 overflow-auto bg-surface outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
        data-slot="workspace-main-surface"
        role="region"
        tabIndex={0}
      >
        {list}
      </section>

      {showDockedInspector ? (
        <aside
          aria-label={inspectorLabel}
          className="min-h-0 min-w-[280px] max-w-[320px] overflow-y-auto border-l-2 border-record-spine bg-surface-raised"
          data-slot="workspace-inspector"
        >
          {inspector}
        </aside>
      ) : null}

      {showInspectorDrawer ? (
        <SideDrawer
          onClose={() => onInspectorOpenChange?.(false)}
          open
          size="preview"
          title={inspectorLabel}
        >
          <div className="min-h-full border-l-2 border-record-spine bg-surface-raised">
            {inspector}
          </div>
        </SideDrawer>
      ) : null}
    </div>
  );
}
