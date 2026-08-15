"use client";

import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PeopleInsights } from "@/features/people/people.insights";

type PeopleCommandCenterProps = {
  insights: PeopleInsights;
};

export function PeopleCommandCenter({ insights }: PeopleCommandCenterProps) {
  const actionableQueues = insights.attentionQueues.filter(
    (queue) => queue.count > 0 && queue.id !== "missing-evidence",
  );
  const attentionCount = actionableQueues.reduce(
    (total, queue) => total + queue.count,
    0,
  );

  if (attentionCount === 0) {
    return null;
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={`${attentionCount} people to review`}
          className="flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <UsersRound
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="font-semibold text-foreground">
            {attentionCount} to review
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label="People attention"
          className="z-50 w-[min(400px,calc(100vw-2rem))] rounded-md border border-border bg-card p-2 shadow-lg outline-none"
          role="dialog"
          sideOffset={6}
        >
          <div className="space-y-1">
            {actionableQueues.map((queue) => (
              <Link
                className="flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={queue.href}
                key={queue.id}
                prefetch={false}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {queue.label}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {queue.description}
                  </span>
                </span>
                <Badge className="shrink-0 px-1.5 text-xs" tone={queue.tone}>
                  {queue.count}
                </Badge>
              </Link>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
