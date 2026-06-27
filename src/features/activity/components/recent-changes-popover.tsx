"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bell, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecentChange } from "@/features/activity/activity.types";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/utils";

type RecentChangesPopoverProps = {
  changes: RecentChange[];
  maxVisible?: number;
  onSelectChange?: (change: RecentChange) => void;
};

export function RecentChangesPopover({
  changes,
  maxVisible = 5,
  onSelectChange,
}: RecentChangesPopoverProps) {
  const [open, setOpen] = useState(false);
  const visibleChanges = changes.slice(0, maxVisible);
  const hiddenChangeCount = Math.max(0, changes.length - visibleChanges.length);

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Anchor asChild>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Recent changes"
          className={cn(
            "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-muted shadow-sm transition-colors hover:bg-surface-muted hover:text-foreground",
            open && "bg-surface-muted text-foreground",
          )}
          onClick={() => setOpen((current) => !current)}
          title="Recent changes"
          type="button"
        >
          <Bell size={15} />
          {changes.length > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-background">
              {changes.length > 9 ? "9+" : changes.length}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "hidden transition-transform sm:block",
              open && "rotate-180",
            )}
            size={13}
          />
        </button>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          align="end"
          className="z-[80] w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          collisionPadding={16}
          sideOffset={6}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold">Recent changes</p>
              <p className="mt-0.5 text-xs text-muted">
                Latest activity across records
              </p>
            </div>
            <Badge>{changes.length} latest</Badge>
          </div>

          {changes.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              No timeline or ledger changes have been logged yet.
            </p>
          ) : (
            <ul className="max-h-80 overflow-auto divide-y divide-border">
              {visibleChanges.map((change) => (
                <li key={change.id}>
                  <button
                    className="flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
                    disabled={!onSelectChange}
                    onClick={() => {
                      setOpen(false);
                      onSelectChange?.(change);
                    }}
                    type="button"
                  >
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block line-clamp-2 text-sm font-medium text-foreground">
                          {change.recordLabel}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {change.entityLabel} - {formatDate(change.createdAt)}
                        </span>
                      </span>
                      <Badge className="shrink-0" tone={change.tone}>
                        {change.actionLabel}
                      </Badge>
                    </span>
                  </button>
                </li>
              ))}
              {hiddenChangeCount > 0 ? (
                <li className="px-3 py-2.5 text-xs text-muted">
                  {hiddenChangeCount} older changes hidden.
                </li>
              ) : null}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
