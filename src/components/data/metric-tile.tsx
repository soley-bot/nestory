import type { ReactNode } from "react";

type MetricTileProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
};

export function MetricTile({ label, value, helper, icon }: MetricTileProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        {icon ? <div className="text-muted">{icon}</div> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}
