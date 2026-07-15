import type { ReactNode } from "react";

type WorkspacePageProps = {
  header: ReactNode;
  localNav?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
};

export function WorkspacePage({
  children,
  header,
  localNav,
  toolbar,
}: WorkspacePageProps) {
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background"
      data-slot="workspace-page"
    >
      <div className="shrink-0" data-slot="workspace-header">
        {header}
      </div>
      {localNav ? (
        <div
          className="min-w-0 shrink-0 border-b border-border bg-surface"
          data-slot="workspace-local-nav"
        >
          {localNav}
        </div>
      ) : null}
      {toolbar ? (
        <div
          aria-label="Workspace tools"
          className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 text-sm sm:px-6"
          data-slot="workspace-toolbar"
          role="toolbar"
        >
          {toolbar}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1" data-slot="workspace-body">
        {children}
      </div>
    </div>
  );
}
