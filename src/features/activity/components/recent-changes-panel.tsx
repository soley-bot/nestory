import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

type RecentChangesPanelProps = {
  changes: RecentChange[];
  onSelectChange?: (change: RecentChange) => void;
};

export function RecentChangesPanel({
  changes,
  onSelectChange,
}: RecentChangesPanelProps) {
  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <History size={16} className="text-muted" />
          <h2 className="text-sm font-semibold tracking-tight">Recent changes</h2>
        </div>
        <Badge>{changes.length} latest</Badge>
      </div>

      {changes.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No timeline or ledger changes have been logged yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {changes.map((change) => (
            <li
              className="px-5 py-3"
              key={change.id}
            >
              <button
                className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
                disabled={!onSelectChange}
                onClick={() => onSelectChange?.(change)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {change.recordLabel}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {change.entityLabel} - {formatDate(change.createdAt)}
                  </span>
                </span>
                <Badge className="shrink-0" tone={change.tone}>
                  {change.actionLabel}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
