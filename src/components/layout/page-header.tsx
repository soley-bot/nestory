import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:px-6">
      <div className="min-w-0">
        <h1 className="text-base font-semibold leading-6 text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 hidden max-w-2xl text-[13px] leading-5 text-foreground-muted sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px] lg:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
