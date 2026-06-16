import type { ReactNode } from "react";

type MetricTileProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
};

export function MetricTile({ label, value, helper, icon }: MetricTileProps) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 break-words text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        {icon ? <div className="shrink-0 text-muted">{icon}</div> : null}
      </div>
      <p className="mt-3 min-w-0 break-words text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 min-w-0 break-words text-xs text-muted">{helper}</p>
      ) : null}
    </div>
  );
}
