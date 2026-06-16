import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

type RecentChangesPanelProps = {
  changes: RecentChange[];
};

export function RecentChangesPanel({ changes }: RecentChangesPanelProps) {
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
              className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              key={change.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {change.recordLabel}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {change.entityLabel} - {formatDate(change.createdAt)}
                </p>
              </div>
              <Badge className="shrink-0" tone={change.tone}>
                {change.actionLabel}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
