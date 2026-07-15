import type { ReactNode } from "react";
import {
  CircleAlert,
  Inbox,
  LockKeyhole,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateKind = "empty" | "filtered" | "permission" | "error";

type EmptyStateProps = {
  action?: ReactNode;
  body: ReactNode;
  className?: string;
  kind: EmptyStateKind;
  retry?: ReactNode;
  title: ReactNode;
};

type EmptyStatePresentation = {
  icon: LucideIcon;
  iconClassName: string;
};

const presentations: Record<EmptyStateKind, EmptyStatePresentation> = {
  empty: {
    icon: Inbox,
    iconClassName: "bg-surface-muted text-foreground-muted",
  },
  filtered: {
    icon: SearchX,
    iconClassName: "bg-surface-muted text-foreground-muted",
  },
  permission: {
    icon: LockKeyhole,
    iconClassName: "bg-warning-soft text-warning",
  },
  error: {
    icon: CircleAlert,
    iconClassName: "bg-danger-soft text-danger",
  },
};

export function EmptyState({
  action,
  body,
  className,
  kind,
  retry,
  title,
}: EmptyStateProps) {
  const presentation = presentations[kind];
  const StateIcon = presentation.icon;
  const isError = kind === "error";

  return (
    <section
      aria-atomic="true"
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "flex min-h-40 flex-col items-start justify-center px-5 py-6 text-sm",
        className,
      )}
      data-kind={kind}
      role={isError ? "alert" : "status"}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 flex size-9 items-center justify-center rounded-md",
          presentation.iconClassName,
        )}
        data-empty-state-icon="true"
      >
        <StateIcon className="size-4" />
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div className="mt-1 max-w-xl leading-5 text-foreground-muted">{body}</div>
      {action || retry ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action}
          {retry}
        </div>
      ) : null}
    </section>
  );
}
