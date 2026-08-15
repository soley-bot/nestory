"use client";

import type { ReactNode } from "react";
import { RecordQuickViewDialog } from "@/components/ui/record-quick-view-dialog";

type WorkspaceSplitViewBaseProps = {
  list: ReactNode;
};

type WorkspaceSplitViewWithInspectorProps = WorkspaceSplitViewBaseProps & {
  inspector: ReactNode;
  inspectorLabel: string;
  inspectorOpen: boolean;
  inspectorSize?: "default" | "wide";
  onInspectorOpenChange: (open: boolean) => void;
};

type WorkspaceSplitViewWithoutInspectorProps = WorkspaceSplitViewBaseProps & {
  inspector?: never;
  inspectorLabel?: never;
  inspectorOpen?: never;
  inspectorSize?: never;
  onInspectorOpenChange?: never;
};

type WorkspaceSplitViewProps =
  | WorkspaceSplitViewWithInspectorProps
  | WorkspaceSplitViewWithoutInspectorProps;

export function WorkspaceSplitView({
  inspector,
  inspectorLabel,
  inspectorOpen,
  inspectorSize,
  list,
  onInspectorOpenChange,
}: WorkspaceSplitViewProps) {
  const hasDismissableInspector =
    inspector != null && typeof onInspectorOpenChange === "function";
  const showQuickView = hasDismissableInspector && inspectorOpen === true;

  function closeInspector() {
    onInspectorOpenChange?.(false);
  }

  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] bg-background"
      data-slot="workspace-split-view"
    >
      <section
        aria-label="Workspace content"
        className="min-w-0 bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-slot="workspace-main-surface"
        role="region"
        tabIndex={0}
      >
        {list}
      </section>

      {showQuickView ? (
        <RecordQuickViewDialog
          label={inspectorLabel ?? "Record quick view"}
          onClose={closeInspector}
          open
          size={inspectorSize}
        >
          {inspector}
        </RecordQuickViewDialog>
      ) : null}
    </div>
  );
}
