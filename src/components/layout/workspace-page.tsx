import type { ReactNode } from "react";

import {
  PageBreadcrumb,
  type BreadcrumbItem,
} from "@/components/layout/page-breadcrumb";
import { PageHeader } from "@/components/layout/page-header";

type WorkspacePageProps = {
  actions?: ReactNode;
  breadcrumbCurrent?: ReactNode;
  breadcrumbItems?: BreadcrumbItem[];
  controlsClassName?: string;
  header?: ReactNode;
  headerClassName?: string;
  localNav?: ReactNode;
  toolbar?: ReactNode;
  toolbarClassName?: string;
  context?: ReactNode;
  contextHref?: string;
  title?: string;
  children: ReactNode;
};

export function WorkspacePage({
  actions,
  breadcrumbCurrent,
  breadcrumbItems,
  children,
  controlsClassName,
  context,
  header,
  headerClassName,
  localNav,
  title,
  toolbar,
  toolbarClassName,
}: WorkspacePageProps) {
  const breadcrumb = title ? (
    <PageBreadcrumb
      current={breadcrumbCurrent ?? title}
      items={breadcrumbItems ?? [{ href: "/overview", label: "Workspace" }]}
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
      className="flex min-h-full min-w-0 flex-col overflow-x-hidden bg-background"
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
              className={`workspace-gutter-x min-w-0 py-2 text-sm lg:ml-auto lg:pl-0 ${toolbarClassName ?? ""}`}
              data-slot="workspace-toolbar"
              role="toolbar"
            >
              {toolbar}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 flex-1" data-slot="workspace-body">
        {children}
      </div>
    </div>
  );
}
