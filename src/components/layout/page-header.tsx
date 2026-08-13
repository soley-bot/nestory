import type { ReactNode } from "react";
import { WorkspaceHeaderPortal } from "@/components/layout/workspace-header-portal";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  breadcrumb?: ReactNode;
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  navigation?: ReactNode;
  className?: string;
};

export function PageHeader({
  breadcrumb,
  title,
  description,
  context,
  actions,
  navigation,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn("workspace-gutter-x bg-background py-4 lg:py-5", className)}
    >
      {breadcrumb ? (
        <WorkspaceHeaderPortal>
          <div className="min-w-0">{breadcrumb}</div>
        </WorkspaceHeaderPortal>
      ) : null}
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 lg:flex-nowrap"
        data-slot="page-header-primary-row"
      >
        <div
          className={`flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 ${
            navigation ? "lg:flex-none" : ""
          }`}
        >
          <h1 className="shrink-0 text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description || context ? (
            <div
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-5 text-muted-foreground"
              data-slot="page-header-meta"
            >
              {description ? <p className="max-w-2xl">{description}</p> : null}
              {context ? <div className="min-w-0">{context}</div> : null}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className="order-1 ml-auto flex shrink-0 flex-wrap items-center gap-2 lg:order-2"
            data-slot="page-header-actions"
          >
            {actions}
          </div>
        ) : null}
        {navigation ? (
          <div
            className="order-2 min-w-0 basis-full lg:order-1 lg:flex-1 lg:basis-auto"
            data-slot="page-header-navigation"
          >
            {navigation}
          </div>
        ) : null}
      </div>
    </header>
  );
}
