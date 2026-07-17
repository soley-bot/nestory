import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";

export function OverviewAttentionQueue({
  items,
  month,
}: {
  items: OverviewAttentionItem[];
  month: string;
}) {
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="overview-attention-heading"
        className="flex flex-wrap items-center gap-2 border-y border-border px-1 py-2.5"
        role="region"
      >
        <h2 className="text-sm font-semibold text-foreground" id="overview-attention-heading">
          Needs attention
        </h2>
        <p className="mr-auto text-sm text-foreground-muted">No operating checks need attention.</p>
        <Link className="text-xs font-medium text-foreground underline-offset-2 hover:underline" href="/timeline">
          Open timeline
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="overview-attention-heading"
      className="flex flex-wrap items-center gap-3 rounded-md border border-warning/25 bg-warning-soft/10 px-3 py-2.5"
      role="region"
    >
      <CircleAlert className="shrink-0 text-warning" size={16} />
      <div className="mr-auto min-w-0">
        <h2 className="text-sm font-semibold text-foreground" id="overview-attention-heading">
          Needs attention
        </h2>
        <p className="text-xs text-foreground-muted">
          {items.length} operating {items.length === 1 ? "queue needs" : "queues need"} review.
        </p>
      </div>
      <Badge tone="warning">{items.length} queues</Badge>
      <Link
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted"
        href={`/overview/attention?month=${month}`}
      >
        Review queues
        <ArrowRight aria-hidden="true" size={13} />
      </Link>
    </section>
  );
}
