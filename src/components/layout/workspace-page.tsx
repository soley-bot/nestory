import type { ReactNode } from "react";

import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";

type WorkspacePageProps = {
  actions?: ReactNode;
  controlsClassName?: string;
  header?: ReactNode;
  headerClassName?: string;
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
  controlsClassName,
  context,
  contextHref,
  header,
  headerClassName,
  localNav,
  title,
  toolbar,
}: WorkspacePageProps) {
  const breadcrumb = title && contextHref ? (
    <PageBreadcrumb
      current={context ?? title}
      items={[{ href: contextHref, label: title }]}
    />
  ) : null;
  const generatedHeader = title ? (
    <PageHeader
      actions={actions}
      breadcrumb={breadcrumb}
      className={headerClassName}
      context={context}
      title={title}
    />
  ) : null;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-muted/30"
      data-slot="workspace-page"
    >
      {header ?? generatedHeader}
      {localNav || toolbar ? (
        <div
          className={`flex min-w-0 shrink-0 flex-col bg-background lg:flex-row lg:items-center ${controlsClassName ?? ""}`}
          data-slot="workspace-controls"
        >
          {localNav ? (
            <div
              className="min-w-0 flex-1"
              data-slot="workspace-local-nav"
            >
              {localNav}
            </div>
          ) : null}
          {toolbar ? (
            <div
              aria-label="Workspace tools"
              className="min-w-0 px-4 py-2 text-sm sm:px-6 lg:ml-auto lg:pl-0"
              data-slot="workspace-toolbar"
              role="toolbar"
            >
              {toolbar}
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
