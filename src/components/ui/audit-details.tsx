import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type AuditDetailEntry = {
  label: string;
  value: ReactNode | null | undefined;
};

export function AuditDetails({
  className,
  entries,
  label = "Audit details",
}: {
  className?: string;
  entries: readonly AuditDetailEntry[];
  label?: string;
}) {
  const visibleEntries = entries.filter(
    (entry) => entry.value !== null && entry.value !== undefined && entry.value !== "",
  );

  if (visibleEntries.length === 0) return null;

  return (
    <details className={cn("text-xs text-muted-foreground", className)}>
      <summary className="w-fit cursor-pointer rounded-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <dl className="mt-2 grid gap-1 border-l border-border pl-3">
        {visibleEntries.map((entry) => (
          <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2" key={entry.label}>
            <dt className="font-medium text-foreground">{entry.label}</dt>
            <dd className="min-w-0 break-all font-mono">{entry.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
