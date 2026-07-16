import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";

export function OverviewAttentionQueue({
  items,
}: {
  items: OverviewAttentionItem[];
}) {
  return (
    <section
      aria-labelledby="overview-attention-heading"
      className="overflow-hidden rounded-lg border border-border bg-surface"
      role="region"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h2
          className="mr-auto text-sm font-semibold text-foreground"
          id="overview-attention-heading"
        >
          Needs attention
        </h2>
        <Badge tone={items.length > 0 ? "warning" : "success"}>
          {items.length > 0 ? `${items.length} queues` : "Clear"}
        </Badge>
      </div>
      {items.length > 0 ? (
        <ul className="grid divide-y divide-border md:grid-cols-2 md:divide-y-0">
          {items.map((item) => (
            <li
              className="border-border md:border-b md:odd:border-r"
              key={item.id}
            >
              <Link
                className="group flex min-h-16 items-center gap-3 px-3 py-2.5 hover:bg-background"
                href={item.href}
              >
                <Badge tone={item.tone}>{item.count}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs text-foreground-muted">
                    {item.helper}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
                  {item.actionLabel}
                  <ArrowRight aria-hidden="true" size={13} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 py-3">
          <p className="mr-auto text-sm text-foreground-muted">
            No operating checks need attention.
          </p>
          <Link
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
            href="/timeline"
          >
            Open timeline
          </Link>
        </div>
      )}
    </section>
  );
}
