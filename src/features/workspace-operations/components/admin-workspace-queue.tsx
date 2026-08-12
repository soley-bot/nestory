import { CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { OverviewAttentionItem } from "@/features/overview/overview.types";
import {
  QueueAction,
  QueueCell,
  QueueRow,
  WorkspaceChips,
  WorkspaceQueue,
  WorkspaceQueueCard,
} from "@/features/workspace-operations/components/workspace-queue";

/**
 * Super Admin: the prioritised exception queue comes first and portfolio
 * context follows it. Order and membership are decided by
 * buildAdminWorkspaceQueue — zero-count queues never arrive here, so there is
 * nothing to filter and nothing to sort.
 */
export function AdminWorkspaceQueue({
  items,
}: {
  items: readonly OverviewAttentionItem[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        kind="empty"
        title="Nothing needs attention"
      />
    );
  }

  return (
    <section aria-label="Attention workspace" className="flex flex-col">
      <WorkspaceChips
        chips={items.map((item) => ({ count: item.count, label: item.label }))}
      />

      <WorkspaceQueue
        cards={items.map((item) => (
          <WorkspaceQueueCard
            action={<QueueAction href={item.href} label={item.actionLabel} />}
            context={item.helper}
            key={item.id}
            status={<Badge tone={item.tone}>{item.count}</Badge>}
            title={item.label}
          />
        ))}
        columns={[
          { label: "Queue" },
          { label: "Detail" },
          { align: "end", label: "Waiting" },
          { label: "" },
        ]}
        label="Attention queue"
        rows={items.map((item) => (
          <QueueRow key={item.id}>
            <QueueCell className="font-medium text-foreground">
              {item.label}
            </QueueCell>
            <QueueCell className="text-muted-foreground">
              <span className="block truncate" title={item.helper}>
                {item.helper}
              </span>
            </QueueCell>
            <QueueCell className="text-right">
              <Badge tone={item.tone}>{item.count}</Badge>
            </QueueCell>
            <QueueCell className="text-right">
              <QueueAction href={item.href} label={item.actionLabel} />
            </QueueCell>
          </QueueRow>
        ))}
      />
    </section>
  );
}
