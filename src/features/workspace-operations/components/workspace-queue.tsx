import type { ReactNode } from "react";
import Link from "next/link";

import { MoneyDisplay } from "@/components/data/money-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export { QueueAge } from "./queue-age";
import type { MoneyDisplayValue } from "@/lib/money/format";

export type WorkspaceQueueTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type WorkspaceChip = {
  count: number;
  label: string;
};

/**
 * Counts only earn a chip when there is something to count. Maintenance renders
 * its six queue chips unconditionally, so an idle workspace reads as six zeros
 * competing for attention.
 */
export function WorkspaceChips({ chips }: { chips: readonly WorkspaceChip[] }) {
  const live = chips.filter((chip) => chip.count > 0);

  if (live.length === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap gap-2 px-4 pb-3 sm:px-6"
      data-slot="workspace-chips"
    >
      {live.map((chip) => (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
          key={chip.label}
        >
          {chip.label}
          <b className="font-semibold tabular-nums text-foreground">
            {chip.count}
          </b>
        </span>
      ))}
    </div>
  );
}

export function QueueAmount({ value }: { value: MoneyDisplayValue | null }) {
  if (!value) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  return <MoneyDisplay value={value} />;
}

export function QueueText({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  return <>{value}</>;
}

export function QueueTitleCell({
  context,
  title,
}: {
  context: string;
  title: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block truncate font-medium text-foreground">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {context}
      </span>
    </div>
  );
}

export function QueueAction({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href} prefetch={false}>
        {label}
      </Link>
    </Button>
  );
}

export function QueueStatus({
  label,
  tone,
}: {
  label: string;
  tone: WorkspaceQueueTone;
}) {
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The register is a table on desktop and a card list below it. A queue whose
 * first action sits behind a horizontal scroll is not reachable, which the
 * acceptance gate treats as a failure.
 */
export function WorkspaceQueue({
  cards,
  columns,
  label,
  rows,
}: {
  cards: ReactNode;
  columns: readonly { align?: "end"; label: string }[];
  label: string;
  rows: ReactNode;
}) {
  return (
    <>
      <div
        className="hidden min-w-0 max-w-full overflow-hidden md:block"
        data-slot="workspace-queue-table"
      >
        <Table aria-label={label} scrollRegionLabel={`${label} table`}>
          <TableHeader sticky>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead
                  className={column.align === "end" ? "text-right" : undefined}
                  key={`${column.label}-${index}`}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{rows}</TableBody>
        </Table>
      </div>
      <ul
        aria-label={label}
        className="divide-y divide-border border-t border-border md:hidden"
        data-slot="workspace-queue-cards"
      >
        {cards}
      </ul>
    </>
  );
}

export function WorkspaceQueueCard({
  action,
  amount,
  context,
  status,
  title,
  details,
}: {
  action: ReactNode;
  amount?: ReactNode;
  details?: ReactNode;
  context: string;
  status: ReactNode;
  title: string;
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-medium">{title}</span>
        {status}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{context}</span>
        {amount ? (
          <span className="shrink-0 tabular-nums text-foreground">{amount}</span>
        ) : null}
      </div>
      {details ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{details}</div> : null}
      <div>{action}</div>
    </li>
  );
}

export { TableCell as QueueCell, TableRow as QueueRow };
