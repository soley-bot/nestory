import { Landmark } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  FinanceManagerWorkspaceData,
  FinanceMemberWorkspaceData,
  FinanceWorkspaceQueueItem,
} from "@/features/workspace-operations/finance-workspace.types";
import {
  QueueAction,
  QueueAge,
  QueueAmount,
  QueueCell,
  QueueRow,
  QueueStatus,
  QueueText,
  QueueTitleCell,
  WorkspaceChips,
  WorkspaceQueue,
  WorkspaceQueueCard,
} from "@/features/workspace-operations/components/workspace-queue";

/**
 * Finance Manager: a review queue. The row carries enough to decide — what,
 * where, who, how old, how much, what state — and the record carries the rest.
 * Order comes from the projection; nothing is re-sorted here.
 */
export function FinanceManagerWorkspace({
  data,
}: {
  data: FinanceManagerWorkspaceData;
}) {
  const [next] = data.queue;

  return (
    <section aria-label="Finance review workspace" className="flex flex-col">
      <WorkspaceChips
        chips={[
          { count: data.totals.awaitingReview, label: "Awaiting review" },
          {
            count: data.totals.maintenanceHandoffs,
            label: "Maintenance handoffs",
          },
          { count: data.totals.missingEvidence, label: "Missing evidence" },
          { count: data.totals.rentExceptions, label: "Rent exceptions" },
        ]}
      />

      {next ? (
        <WorkspaceQueue
          cards={data.queue.map((item) => (
            <WorkspaceQueueCard
              action={
                <QueueAction href={item.href} label={item.actionLabel} />
              }
              amount={<QueueAmount value={item.amountDisplay} />}
              context={item.contextLabel}
              key={item.id}
              status={<QueueStatus label={item.statusLabel} tone={item.tone} />}
              title={item.title}
            />
          ))}
          columns={[
            { label: "Cost" },
            { label: "Submitted by" },
            { label: "Age" },
            { align: "end", label: "Amount" },
            { label: "Status" },
            { label: "" },
          ]}
          label="Review queue"
          rows={data.queue.map((item) => (
            <QueueRow key={item.id}>
              <QueueCell>
                <QueueTitleCell
                  context={item.contextLabel}
                  title={item.title}
                />
              </QueueCell>
              <QueueCell>
                <QueueText value={item.submittedByLabel} />
              </QueueCell>
              <QueueCell className="text-muted-foreground">
                <QueueAge value={item.submittedAt} />
              </QueueCell>
              <QueueCell className="text-right tabular-nums">
                <QueueAmount value={item.amountDisplay} />
              </QueueCell>
              <QueueCell>
                <QueueStatus label={item.statusLabel} tone={item.tone} />
              </QueueCell>
              <QueueCell className="text-right">
                <QueueAction href={item.href} label={item.actionLabel} />
              </QueueCell>
            </QueueRow>
          ))}
        />
      ) : (
        <EmptyState
          icon={Landmark}
          kind="empty"
          title="Nothing waiting for review"
        />
      )}
    </section>
  );
}

/**
 * Finance Member: their own submissions and one way to add another. The
 * projection scopes the queue to the signed-in user, so nothing is filtered
 * here. Review controls are absent rather than disabled — an action a member
 * can never take is noise, and the server remains the authority either way.
 */
export function FinanceMemberWorkspace({
  data,
}: {
  data: FinanceMemberWorkspaceData;
}) {
  const [next] = data.queue;

  return (
    <section aria-label="Finance submission workspace" className="flex flex-col">
      <WorkspaceChips
        chips={[
          { count: data.totals.rejected, label: "Rejected" },
          { count: data.totals.awaitingReview, label: "Awaiting review" },
          {
            count: data.totals.approvedRecently,
            label: "Approved · last 30 days",
          },
        ]}
      />

      {next ? (
        <WorkspaceQueue
          cards={data.queue.map((item) => (
            <WorkspaceQueueCard
              action={
                <QueueAction href={item.href} label={item.actionLabel} />
              }
              amount={<QueueAmount value={item.amountDisplay} />}
              context={item.contextLabel}
              key={item.id}
              status={<QueueStatus label={item.statusLabel} tone={item.tone} />}
              title={item.title}
            />
          ))}
          columns={[
            { label: "Cost" },
            { label: "Age" },
            { align: "end", label: "Amount" },
            { label: "Status" },
            { label: "" },
          ]}
          label="Submission queue"
          rows={data.queue.map((item) => (
            <QueueRow key={item.id}>
              <QueueCell>
                <QueueTitleCell
                  context={item.detail || item.contextLabel}
                  title={item.title}
                />
              </QueueCell>
              <QueueCell className="text-muted-foreground">
                <QueueAge value={item.submittedAt} />
              </QueueCell>
              <QueueCell className="text-right tabular-nums">
                <QueueAmount value={item.amountDisplay} />
              </QueueCell>
              <QueueCell>
                <QueueStatus label={item.statusLabel} tone={item.tone} />
              </QueueCell>
              <QueueCell className="text-right">
                <QueueAction href={item.href} label={item.actionLabel} />
              </QueueCell>
            </QueueRow>
          ))}
        />
      ) : (
        <EmptyState
          action={
            <Button asChild variant="default">
              <Link href={data.primaryAction.href} prefetch={false}>
                {data.primaryAction.label}
              </Link>
            </Button>
          }
          icon={Landmark}
          kind="empty"
          title="No submissions yet"
        />
      )}
    </section>
  );
}

/** The header action is the first queue item, so "next" is never ambiguous. */
export function getFinanceWorkspaceNextItem(
  queue: readonly FinanceWorkspaceQueueItem[],
): FinanceWorkspaceQueueItem | null {
  return queue[0] ?? null;
}
