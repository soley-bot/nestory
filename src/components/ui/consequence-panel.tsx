import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ConsequenceRow = {
  label: ReactNode;
  value: ReactNode;
};

type ConsequencePanelProps = {
  children?: ReactNode;
  className?: string;
  id?: string;
  rows?: ConsequenceRow[];
  summary?: ReactNode;
  title: ReactNode;
};

export function ConsequencePanel({
  children,
  className,
  id,
  rows = [],
  summary,
  title,
}: ConsequencePanelProps) {
  const generatedId = useId();
  const panelId = id ?? generatedId;
  const titleId = `${panelId}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-md border border-border bg-surface-raised px-4 py-3 text-sm",
        className,
      )}
      id={panelId}
      role="region"
    >
      <h3 className="font-semibold text-foreground" id={titleId}>
        {title}
      </h3>
      {summary ? (
        <div className="mt-1 leading-5 text-foreground-muted">{summary}</div>
      ) : null}
      {rows.length > 0 ? (
        <dl className="mt-3 divide-y divide-border border-y border-border">
          {rows.map((row, index) => (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-2" key={index}>
              <dt className="text-foreground-muted">{row.label}</dt>
              <dd className="min-w-0 text-right font-medium text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="mt-3 text-foreground">{children}</div> : null}
    </section>
  );
}
