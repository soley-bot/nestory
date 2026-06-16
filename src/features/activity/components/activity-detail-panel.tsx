import { Badge } from "@/components/ui/badge";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

type ActivityDetailPanelProps = {
  change: RecentChange;
};

export function ActivityDetailPanel({ change }: ActivityDetailPanelProps) {
  return (
    <div className="space-y-5 px-5 py-5">
      <div className="rounded-md border border-border bg-surface-muted p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{change.recordLabel}</p>
          <Badge tone={change.tone}>{change.actionLabel}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          {change.entityLabel} - {formatDate(change.createdAt)}
        </p>
      </div>

      {change.details.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-3 text-sm text-muted">
          No field-level detail was recorded for this change.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] bg-surface-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            <span>Field</span>
            <span>Before</span>
            <span>After</span>
          </div>
          <div className="divide-y divide-border">
            {change.details.map((detail) => (
              <div
                className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-3 text-sm"
                key={detail.field}
              >
                <span className="font-medium">{detail.field}</span>
                <span className="break-words text-muted">{detail.before}</span>
                <span className="break-words">{detail.after}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
