import { Badge } from "@/components/ui/badge";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";

type ActivityDetailPanelProps = {
  change: RecentChange;
};

export function ActivityDetailPanel({ change }: ActivityDetailPanelProps) {
  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      <div className="rounded-md border border-border bg-surface-muted p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="break-words text-sm font-semibold">{change.recordLabel}</p>
          <Badge className="self-start sm:self-auto" tone={change.tone}>
            {change.actionLabel}
          </Badge>
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
          <div className="hidden grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] bg-surface-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted sm:grid lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
            <span>Field</span>
            <span>Before</span>
            <span>After</span>
          </div>
          <div className="divide-y divide-border">
            {change.details.map((detail) => (
              <div
                className="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]"
                key={detail.field}
              >
                <span className="font-medium">{detail.field}</span>
                <span className="break-words text-muted">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] sm:hidden">
                    Before
                  </span>
                  {detail.before}
                </span>
                <span className="break-words">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-muted sm:hidden">
                    After
                  </span>
                  {detail.after}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
