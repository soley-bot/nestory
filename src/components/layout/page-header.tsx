import type { ReactNode } from "react";
import { WorkspaceHeaderPortal } from "@/components/layout/workspace-header-portal";

type PageHeaderProps = {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
};

export function PageHeader({
  breadcrumb,
  title,
  description,
  context,
  actions,
  navigation,
}: PageHeaderProps) {
  return (
    <header className="bg-surface px-4 py-3 sm:px-6">
      {breadcrumb ? (
        <WorkspaceHeaderPortal>
          <div className="min-w-0">{breadcrumb}</div>
        </WorkspaceHeaderPortal>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="shrink-0 text-base font-semibold leading-6 text-foreground">
            {title}
          </h1>
          {description || context ? (
            <div
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-foreground-muted"
              data-slot="page-header-meta"
            >
              {description ? <p className="max-w-2xl">{description}</p> : null}
              {context ? <div className="min-w-0">{context}</div> : null}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className="ml-auto flex shrink-0 flex-wrap items-center gap-2"
            data-slot="page-header-actions"
          >
            {actions}
          </div>
        ) : null}
      </div>
      {navigation ? (
        <div className="mt-2 min-w-0" data-slot="page-header-navigation">
          {navigation}
        </div>
      ) : null}
    </header>
  );
}
