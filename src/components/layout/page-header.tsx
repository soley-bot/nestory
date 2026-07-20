import type { ReactNode } from "react";
import { WorkspaceHeaderPortal } from "@/components/layout/workspace-header-portal";

type PageHeaderProps = {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  breadcrumb,
  title,
  description,
  context,
  actions,
}: PageHeaderProps) {
  return (
    <header className="border-b border-border bg-surface px-4 py-3 sm:px-6">
      {breadcrumb ? (
        <WorkspaceHeaderPortal>
          <div className="min-w-0">{breadcrumb}</div>
        </WorkspaceHeaderPortal>
      ) : null}
      <h1 className="text-base font-semibold leading-6 text-foreground">
        {title}
      </h1>
      {description || context || actions ? (
        <div
          className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 text-sm leading-5"
          data-slot="page-header-meta"
        >
          {description || context ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-foreground-muted">
              {description ? <p className="max-w-2xl">{description}</p> : null}
              {context ? <div className="min-w-0">{context}</div> : null}
            </div>
          ) : null}
          {actions ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
