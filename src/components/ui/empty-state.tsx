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
  icon?: LucideIcon;
  kind: EmptyStateKind;
  prominent?: boolean;
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
  icon,
  kind,
  prominent = false,
  retry,
  title,
}: EmptyStateProps) {
  const presentation = presentations[kind];
  const StateIcon = icon ?? presentation.icon;
  const isError = kind === "error";

  return (
    <section
      className={cn(
        "flex min-h-40 flex-col items-center justify-center px-5 py-6 text-center text-sm",
        className,
      )}
      data-kind={kind}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 flex items-center justify-center rounded-md",
          prominent ? "size-14" : "size-9",
          presentation.iconClassName,
        )}
        data-empty-state-icon="true"
      >
        <StateIcon className={prominent ? "size-7" : "size-4"} />
      </div>
      <div
        aria-atomic="true"
        aria-live={isError ? "assertive" : "polite"}
        role={isError ? "alert" : "status"}
      >
        <h3 className="font-semibold text-foreground">{title}</h3>
        <div className="mt-1 max-w-xl leading-5 text-foreground-muted">{body}</div>
      </div>
      {action || retry ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action}
          {retry}
        </div>
      ) : null}
    </section>
  );
}
