"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { SideDrawer } from "@/components/ui/side-drawer";
import { cn } from "@/lib/utils";

const WIDE_WORKSPACE_QUERY = "(min-width: 1280px)";

type WorkspaceSplitViewBaseProps = {
  list: ReactNode;
};

type WorkspaceSplitViewWithInspectorProps = WorkspaceSplitViewBaseProps & {
  inspector: ReactNode;
  inspectorLabel: string;
  inspectorOpen: boolean;
  onInspectorOpenChange: (open: boolean) => void;
};

type WorkspaceSplitViewWithoutInspectorProps = WorkspaceSplitViewBaseProps & {
  inspector?: never;
  inspectorLabel?: never;
  inspectorOpen?: never;
  onInspectorOpenChange?: never;
};

type WorkspaceSplitViewProps =
  | WorkspaceSplitViewWithInspectorProps
  | WorkspaceSplitViewWithoutInspectorProps;

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

export function useWideWorkspace() {
  return useSyncExternalStore(
    subscribeToWideWorkspace,
    getWideWorkspaceSnapshot,
    getWideWorkspaceServerSnapshot,
  );
}

export function WorkspaceSplitView({
  inspector,
  inspectorLabel,
  inspectorOpen,
  list,
  onInspectorOpenChange,
}: WorkspaceSplitViewProps) {
  const isWideWorkspace = useWideWorkspace();
  const hasDismissableInspector =
    inspector != null && typeof onInspectorOpenChange === "function";
  const showInspector = hasDismissableInspector && inspectorOpen === true;
  const showDockedInspector = showInspector && isWideWorkspace;
  const showInspectorDrawer = showInspector && !isWideWorkspace;

  function closeInspector() {
    onInspectorOpenChange?.(false);
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-surface-raised",
        showDockedInspector &&
          "xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]",
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
          onClose={closeInspector}
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
