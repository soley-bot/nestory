"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { buildOverviewHref } from "@/features/overview/overview.filters";
import type { OverviewViewQuery } from "@/features/overview/overview.types";
import { cn } from "@/lib/utils";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function OverviewMonthPicker({ query }: { query: OverviewViewQuery }) {
  const [open, setOpen] = useState(false);
  const [selectedYear, selectedMonth] = query.month.split("-").map(Number);
  const [visibleYear, setVisibleYear] = useState(selectedYear);
  const monthLabel = formatMonth(query.month);

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger asChild>
        <button
          aria-label={`Change reporting month, currently ${monthLabel}`}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
            open && "bg-surface-muted",
          )}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={13} />
          {monthLabel}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-[80] w-[300px] rounded-md border border-border bg-surface p-3 shadow-lg"
          sideOffset={6}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              aria-label="Previous year"
              className="flex size-8 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={() => setVisibleYear((year) => year - 1)}
              type="button"
            >
              <ChevronLeft size={15} />
            </button>
            <p className="text-sm font-semibold">{visibleYear}</p>
            <button
              aria-label="Next year"
              className="flex size-8 items-center justify-center rounded-md text-foreground-muted outline-none hover:bg-surface-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={() => setVisibleYear((year) => year + 1)}
              type="button"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {monthNames.map((name, index) => {
              const monthNumber = index + 1;
              const month = `${visibleYear}-${String(monthNumber).padStart(2, "0")}`;
              const active = visibleYear === selectedYear && monthNumber === selectedMonth;
              return (
                <Link
                  aria-current={active ? "date" : undefined}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-sm font-medium outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
                    active && "bg-accent text-background hover:bg-accent",
                  )}
                  href={buildOverviewHref(query, { month })}
                  key={name}
                  onNavigate={() => setOpen(false)}
                  prefetch={false}
                >
                  {name}
                </Link>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
