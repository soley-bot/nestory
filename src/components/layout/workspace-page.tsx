import type { ReactNode } from "react";

import { WorkspacePageContext } from "@/components/layout/workspace-page-context";

type WorkspacePageProps = {
  actions?: ReactNode;
  header?: ReactNode;
  localNav?: ReactNode;
  toolbar?: ReactNode;
  context?: ReactNode;
  contextHref?: string;
  title?: string;
  children: ReactNode;
};

export function WorkspacePage({
  actions,
  children,
  context,
  contextHref,
  header,
  localNav,
  title,
  toolbar,
}: WorkspacePageProps) {
  const compactHeader = title && contextHref ? (
    <WorkspacePageContext context={context} href={contextHref} title={title} />
  ) : null;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background"
      data-slot="workspace-page"
    >
      <div className="shrink-0" data-slot="workspace-header">
        {compactHeader ?? header}
      </div>
      {localNav ? (
        <div
          className="min-w-0 shrink-0 border-b border-border bg-surface"
          data-slot="workspace-local-nav"
        >
          {localNav}
        </div>
      ) : null}
      {toolbar || actions ? (
        <div
          aria-label="Workspace tools"
          className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-border bg-surface px-4 py-2 text-sm sm:px-6 lg:flex-row lg:items-start"
          data-slot="workspace-toolbar"
          role="toolbar"
        >
          {toolbar ? <div className="min-w-0 flex-1">{toolbar}</div> : null}
          {actions ? (
            <div
              className="flex shrink-0 flex-wrap items-center justify-end gap-2"
              data-slot="workspace-toolbar-actions"
            >
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1" data-slot="workspace-body">
        {children}
      </div>
    </div>
  );
}
